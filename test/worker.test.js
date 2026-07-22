import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const unfilteredDomains = [
  "e694.net",
  "e.e994.net",
  "e621.e694.net",
  "e621.e994.net",
  "e621.kckarnige.online",
];

const safePost = makePost({ id: 123, rating: "s", ext: "jpg" });
const unsafePost = makePost({ id: 456, rating: "e", ext: "webm" });

function makeEnv() {
  return {
    ASSETS: {
      async fetch(input) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);

        if (url.pathname === "/unfiltered.json") {
          return Response.json(unfilteredDomains);
        }

        if (url.pathname === "/unsafe.png") {
          return new Response(request.method === "HEAD" ? null : new Uint8Array([137, 80, 78, 71]), {
            status: 200,
            headers: {
              "content-type": "image/png",
              "content-length": "4",
              etag: '"unsafe"',
            },
          });
        }

        if (url.pathname === "/") {
          return new Response("index", { headers: { "content-type": "text/html" } });
        }

        return new Response("not found", { status: 404 });
      },
    },
  };
}

function makePost({ id, rating, ext }) {
  return {
    id,
    created_at: "2024-01-02T03:04:05.000Z",
    rating,
    score: { total: 42 },
    file: {
      ext,
      url: `https://static.example/${id}.${ext}`,
    },
    preview: { url: `https://static.example/${id}-preview.jpg` },
    tags: {
      artist: ["artist_name"],
      contributor: [],
      meta: ext === "webm" ? ["sound"] : [],
    },
  };
}

async function withFetchMock(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function apiFetchMock(urlOrRequest, init = {}) {
  const url = new URL(urlOrRequest instanceof Request ? urlOrRequest.url : String(urlOrRequest));

  if (url.hostname === "e621.net" && url.pathname === "/posts/123.json") {
    return Promise.resolve(Response.json({ post: safePost }));
  }

  if (url.hostname === "e621.net" && url.pathname === "/posts/456.json") {
    return Promise.resolve(Response.json({ post: unsafePost }));
  }

  if (url.hostname === "e621.net" && url.pathname === "/posts.json") {
    return Promise.resolve(Response.json({ posts: [safePost] }));
  }

  if (url.hostname === "static.example") {
    const range = new Headers(init.headers).get("range");
    if (range) {
      return Promise.resolve(
        new Response(new Uint8Array([1, 2]), {
          status: 206,
          headers: {
            "content-type": "image/jpeg",
            "content-range": "bytes 0-1/4",
            "content-length": "2",
            "accept-ranges": "bytes",
          },
        }),
      );
    }

    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          "content-type": url.pathname.endsWith(".webm") ? "video/webm" : "image/jpeg",
          "content-length": "4",
          "accept-ranges": "bytes",
        },
      }),
    );
  }

  throw new Error(`Unexpected fetch: ${url}`);
}

test("serves static assets outside Worker routes", async () => {
  const response = await worker.fetch(new Request("https://e694.net/"), makeEnv(), {});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "index");
});

test("handles CORS preflight", async () => {
  const response = await worker.fetch(
    new Request("https://e694.net/posts/123", { method: "OPTIONS" }),
    makeEnv(),
    {},
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("converts the embed rewrite and uses unfiltered mode", async () => {
  await withFetchMock(apiFetchMock, async () => {
    const response = await worker.fetch(
      new Request("https://e694.net/posts/123"),
      makeEnv(),
      {},
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(html, /e621\.net via e694/);
    assert.match(html, /https:\/\/e694\.net\/posts\/123\/file\.jpg/);
    assert.match(html, /window\.location\.replace\("https:\/\/e621\.net\/posts\/123"\)/);
  });
});

test("serves JSON through the legacy direct API endpoint", async () => {
  await withFetchMock(apiFetchMock, async () => {
    const response = await worker.fetch(
      new Request("https://e694.net/api/yiff.min.js?slug=123.json"),
      makeEnv(),
      {},
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.post.id, 123);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  });
});

test("resolves MD5 identifiers", async () => {
  await withFetchMock(apiFetchMock, async () => {
    const md5 = "0123456789abcdef0123456789abcdef";
    const response = await worker.fetch(
      new Request(`https://e694.net/posts/${md5}/file.json`),
      makeEnv(),
      {},
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.post.id, 123);
  });
});

test("returns oEmbed JSON", async () => {
  await withFetchMock(apiFetchMock, async () => {
    const response = await worker.fetch(
      new Request("https://e694.net/posts/123/file.json+oembed"),
      makeEnv(),
      {},
    );
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^application\/json\+oembed/);
    assert.match(json.provider_name, /Image from e621\.net/);
  });
});

test("blocks unsafe media on filtered domains using the bundled placeholder", async () => {
  await withFetchMock(apiFetchMock, async () => {
    const response = await worker.fetch(
      new Request("https://e994.net/posts/456/file.webm"),
      makeEnv(),
      {},
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual([...bytes], [137, 80, 78, 71]);
  });
});

test("streams media and passes byte ranges upstream", async () => {
  await withFetchMock(apiFetchMock, async () => {
    const response = await worker.fetch(
      new Request("https://e694.net/posts/123/file.jpg", {
        headers: { Range: "bytes=0-1" },
      }),
      makeEnv(),
      {},
    );

    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 0-1/4");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  });
});

test("rejects malformed identifiers", async () => {
  const response = await worker.fetch(
    new Request("https://e694.net/posts/not-a-post/file"),
    makeEnv(),
    {},
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /numeric post ID/);
});
