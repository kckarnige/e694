const VERSION = "1.8.1-cloudflare.2";
const DEFAULT_E621_USER_AGENT =
  `e694/${VERSION} (by kckarnige; https://github.com/kckarnige/e694)`;
const E621_API_ORIGIN = "https://e621.net";

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Range, If-Range, If-None-Match, If-Modified-Since",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition",
});

let cachedUnfilteredDomains;

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const route = resolveRoute(url);

  if (!route) {
    return env.ASSETS.fetch(request);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      { Allow: "GET, HEAD, OPTIONS" },
      request.method === "HEAD",
    );
  }

  if (route.kind === "not-found") {
    return jsonResponse({ error: "API route not found" }, 404, {}, request.method === "HEAD");
  }

  const slug = route.slug ?? url.searchParams.get("slug");
  const embed = route.embed ?? url.searchParams.get("embed") ?? "false";

  return handleYiffRequest({
    request,
    env,
    slug,
    embed: String(embed) === "true",
  });
}

function resolveRoute(url) {
  const pathname = url.pathname;

  // Vercel rewrite equivalents:
  // /posts/:postId/file:ext -> slug=:postId:ext
  // /posts/:postId/file     -> slug=:postId
  // /posts/:postId          -> slug=:postId&embed=true
  const fileMatch = pathname.match(/^\/posts\/([^/]+)\/file(.*?)\/?$/);
  if (fileMatch) {
    const postId = safeDecodeURIComponent(fileMatch[1]);
    const suffix = fileMatch[2] === "/" ? "" : safeDecodeURIComponent(fileMatch[2]);
    return { kind: "yiff", slug: `${postId}${suffix}`, embed: false };
  }

  const postMatch = pathname.match(/^\/posts\/([^/]+)\/?$/);
  if (postMatch) {
    return {
      kind: "yiff",
      slug: safeDecodeURIComponent(postMatch[1]),
      embed: true,
    };
  }

  // Preserve all historical direct serverless-function URLs.
  if (
    pathname === "/api/yiff.js" ||
    pathname === "/api/yiff.min.js" ||
    pathname === "/api.min.js"
  ) {
    return { kind: "yiff" };
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return { kind: "not-found" };
  }

  return null;
}

async function handleYiffRequest({ request, env, slug, embed }) {
  const requestUrl = new URL(request.url);
  const host = requestUrl.host;
  const hostname = normalizeHostname(requestUrl.hostname);
  const isHead = request.method === "HEAD";

  if (!slug) {
    return jsonResponse(
      { error: "Invalid or missing post ID / MD5 / extension" },
      400,
      {},
      isHead,
    );
  }

  const slugValue = String(slug);
  const lastDot = slugValue.lastIndexOf(".");
  const rawIdentifier = lastDot === -1 ? slugValue : slugValue.slice(0, lastDot);
  const ext = lastDot === -1 ? undefined : slugValue.slice(lastDot + 1);

  const isMd5 = /^[a-f0-9]{32}$/i.test(rawIdentifier);
  const isNumericId = /^\d+$/.test(rawIdentifier);

  if (!isMd5 && !isNumericId) {
    return jsonResponse(
      { error: "Slug must be a numeric post ID or a 32-character MD5 hash" },
      400,
      {},
      isHead,
    );
  }

  try {
    const unfilteredDomains = await getUnfilteredDomains(env, requestUrl);
    const safeMode = !unfilteredDomains.has(hostname);
    const baseDomain = safeMode ? "e926.net" : "e621.net";

    const { postInfo, postId } = await fetchPost(rawIdentifier, isMd5, env);

    if (!postInfo) {
      return jsonResponse({ error: "Post data not found" }, 404, {}, isHead);
    }

    if (ext === "json") {
      return jsonResponse({ post: postInfo }, 200, {}, isHead);
    }

    if (!postInfo.file?.url) {
      return jsonResponse({ error: "Media URL not found in post data" }, 404, {}, isHead);
    }

    const fileExt = ext ?? postInfo.file?.ext;
    const previewUrl = postInfo.preview?.url ?? "";
    const origin = requestUrl.origin;
    const postUrl = `${origin}/posts/${postId}/file.${encodeURIComponent(fileExt)}`;
    const isVideo =
      !(safeMode && postInfo.rating !== "s") &&
      ["webm", "mp4"].includes(String(fileExt).toLowerCase());

    const authors = [
      ...(postInfo.tags?.artist ?? []),
      ...(postInfo.tags?.contributor ?? []),
    ];
    const excludedAuthors = new Set([
      "sound_warning",
      "third-party_edit",
      "conditional_dnp",
    ]);
    const realAuthors = authors.filter((author) => !excludedAuthors.has(author));

    const hasSoundWarning =
      postInfo.tags?.artist?.includes("sound_warning") ||
      (postInfo.tags?.meta?.includes("sound") &&
        !postInfo.tags?.meta?.includes("no_sound"));
    const soundWarning = hasSoundWarning ? "\n🔊 Sound Warning! 🔊" : "";

    const formattedDate = new Date(postInfo.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const ratingMap = {
      s: "Safe",
      q: "Questionable",
      e: "Explicit",
    };

    const accept = request.headers.get("accept") ?? "";
    if (ext === "json+oembed" || accept.includes("application/json+oembed")) {
      return jsonResponse(
        {
          author_name: `Posted on ${formattedDate}\nRating: ${ratingMap[postInfo.rating] ?? postInfo.rating} ‎ • ‎ Score: ${postInfo.score?.total ?? 0}${soundWarning}`,
          provider_name: isVideo
            ? `Video from ${baseDomain} • e694`
            : `Image from ${baseDomain} • e694`,
        },
        200,
        { "Content-Type": "application/json+oembed; charset=utf-8" },
        isHead,
      );
    }

    if (embed) {
      const postAuthor =
        realAuthors.length === 0
          ? "unknown"
          : realAuthors.length === 1
            ? realAuthors[0]
            : `${realAuthors[0]} +${realAuthors.length - 1}`;

      const embedHtml = createEmbedHtml({
        origin,
        baseDomain,
        safeMode,
        postId,
        postInfo,
        postAuthor,
        postUrl,
        previewUrl,
        fileExt,
        isVideo,
      });

      return textResponse(embedHtml, 200, "text/html; charset=utf-8", isHead);
    }

    return proxyMedia({
      request,
      env,
      requestUrl,
      postInfo,
      postId,
      fileExt,
      safeMode,
    });
  } catch (error) {
    console.error("e694 Worker error:", error);

    if (error instanceof UpstreamError) {
      return jsonResponse(
        {
          error: error.publicMessage,
          upstream_status: error.status,
          upstream_service: error.service,
          ...(error.hint ? { hint: error.hint } : {}),
        },
        error.status,
        {},
        isHead,
      );
    }

    return jsonResponse(
      {
        error: "Failed to fetch from API",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
      {},
      isHead,
    );
  }
}

async function getUnfilteredDomains(env, requestUrl) {
  if (cachedUnfilteredDomains) {
    return cachedUnfilteredDomains;
  }

  const whitelistUrl = new URL("/unfiltered.json", requestUrl.origin);
  const response = await env.ASSETS.fetch(
    new Request(whitelistUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    }),
  );

  if (!response.ok) {
    throw new Error(`Couldn't load unfiltered.json (HTTP ${response.status})`);
  }

  const value = await response.json();
  if (!Array.isArray(value)) {
    throw new Error("unfiltered.json must contain a JSON array");
  }

  cachedUnfilteredDomains = new Set(
    value
      .filter((entry) => typeof entry === "string")
      .map(normalizeHostname)
      .filter(Boolean),
  );

  return cachedUnfilteredDomains;
}

async function fetchPost(identifier, isMd5, env) {
  if (isMd5) {
    const searchUrl = new URL("/posts.json", E621_API_ORIGIN);
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set("tags", `md5:${identifier}`);

    const response = await fetch(searchUrl, {
      headers: upstreamApiHeaders(env),
    });

    if (!response.ok) {
      throw await makeUpstreamError(response, "e621 API", "Failed to search post by MD5", env);
    }

    const json = await response.json();
    const postInfo = json?.posts?.[0];

    if (!postInfo) {
      throw new UpstreamError(404, "No post found for that MD5 hash");
    }

    return { postInfo, postId: String(postInfo.id) };
  }

  const response = await fetch(`${E621_API_ORIGIN}/posts/${identifier}.json`, {
    headers: upstreamApiHeaders(env),
  });

  if (!response.ok) {
    throw await makeUpstreamError(response, "e621 API", "Failed to fetch post data", env);
  }

  const json = await response.json();
  return { postInfo: json?.post, postId: String(identifier) };
}

function upstreamUserAgent(env) {
  const configured = String(env?.E621_USER_AGENT ?? "").trim();
  return configured || DEFAULT_E621_USER_AGENT;
}

function upstreamApiHeaders(env) {
  const headers = new Headers({
    "User-Agent": upstreamUserAgent(env),
    Accept: "application/json",
  });

  const login = String(env?.E621_LOGIN ?? "").trim();
  const apiKey = String(env?.E621_API_KEY ?? "").trim();
  if (login && apiKey) {
    headers.set("Authorization", `Basic ${btoa(`${login}:${apiKey}`)}`);
  }

  return headers;
}

async function makeUpstreamError(response, service, fallbackMessage, env) {
  let upstreamMessage = "";
  try {
    const text = await response.clone().text();
    upstreamMessage = text.replace(/\s+/g, " ").trim().slice(0, 240);
  } catch {
    // The upstream response body is diagnostic only.
  }

  let publicMessage = fallbackMessage;
  let hint;

  if (response.status === 403) {
    publicMessage = `${service} refused the Worker request (HTTP 403)`;
    hint =
      "Set a contact-identifying E621_USER_AGENT. If e621 still refuses Cloudflare egress, configure E621_LOGIN and E621_API_KEY as Worker secrets.";
  } else if (response.status === 429) {
    hint = "The upstream API rate limit was reached; retry later and avoid repeated uncached requests.";
  }

  console.error("Upstream request failed", {
    service,
    status: response.status,
    upstreamMessage,
    userAgent: upstreamUserAgent(env),
    authenticated: Boolean(env?.E621_LOGIN && env?.E621_API_KEY),
  });

  return new UpstreamError(response.status, publicMessage, { service, hint });
}

async function proxyMedia({
  request,
  env,
  requestUrl,
  postInfo,
  postId,
  fileExt,
  safeMode,
}) {
  const serveUnsafePlaceholder = safeMode && postInfo.rating !== "s";
  let sourceResponse;

  if (serveUnsafePlaceholder) {
    const unsafeUrl = new URL("/unsafe.png", requestUrl.origin);
    sourceResponse = await env.ASSETS.fetch(
      new Request(unsafeUrl, {
        method: request.method,
        headers: copyConditionalHeaders(request.headers),
      }),
    );
  } else {
    const upstreamHeaders = new Headers({
      "User-Agent": upstreamUserAgent(env),
    });

    for (const headerName of ["accept", "range", "if-range", "if-none-match", "if-modified-since"]) {
      const value = request.headers.get(headerName);
      if (value) upstreamHeaders.set(headerName, value);
    }

    sourceResponse = await fetch(postInfo.file.url, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  }

  if (!sourceResponse.ok && sourceResponse.status !== 206 && sourceResponse.status !== 304) {
    throw await makeUpstreamError(
      sourceResponse,
      serveUnsafePlaceholder ? "bundled unsafe placeholder" : "e621 media CDN",
      "Failed to fetch image",
      env,
    );
  }

  const headers = new Headers();
  for (const headerName of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = sourceResponse.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  headers.set("Content-Disposition", `inline; filename="${safeFilename(postId)}.${safeFilename(fileExt)}"`);
  addCorsHeaders(headers);

  return new Response(request.method === "HEAD" ? null : sourceResponse.body, {
    status: sourceResponse.status,
    statusText: sourceResponse.statusText,
    headers,
  });
}

function createEmbedHtml({
  origin,
  baseDomain,
  safeMode,
  postId,
  postInfo,
  postAuthor,
  postUrl,
  previewUrl,
  fileExt,
  isVideo,
}) {
  const iconUrl = `${origin}/icon.png`;
  const favicon32Url = `${origin}/favicon32.png`;
  const favicon16Url = `${origin}/favicon16.png`;
  const targetUrl = `https://${baseDomain}/posts/${postId}`;
  const siteName = `${baseDomain} via e694${safeMode ? " (Safe Mode)" : ""}`;

  const mediaOpenGraph = isVideo
    ? `
      <meta property="og:video" content="${escapeHtmlAttribute(postUrl)}" />
      <meta property="og:video:type" content="video/${escapeHtmlAttribute(fileExt)}" />
      <meta property="og:video:width" content="1280" />
      <meta property="og:video:height" content="720" />
      <meta property="og:image" content="${escapeHtmlAttribute(previewUrl)}" />`
    : `
      <meta property="og:image" content="${escapeHtmlAttribute(postUrl)}" />`;

  const mediaTwitter = isVideo
    ? `
      <meta property="twitter:image" content="${escapeHtmlAttribute(previewUrl)}" />
      <meta property="twitter:player" content="${escapeHtmlAttribute(postUrl)}" />
      <meta property="twitter:player:width" content="1280" />
      <meta property="twitter:player:height" content="720" />
      <meta property="twitter:player:stream" content="${escapeHtmlAttribute(postUrl)}" />
      <meta property="twitter:player:stream:content_type" content="video/${escapeHtmlAttribute(fileExt)}" />`
    : `
      <meta property="twitter:image" content="${escapeHtmlAttribute(postUrl)}" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta property="theme-color" content="#00709e" />
  <meta name="application-name" content="e694" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="alternate" type="application/json+oembed" href="${escapeHtmlAttribute(origin)}/posts/${escapeHtmlAttribute(postId)}/file.json+oembed" />
  <link rel="apple-touch-icon" href="${escapeHtmlAttribute(iconUrl)}" />
  <link rel="icon" type="image/png" href="${escapeHtmlAttribute(iconUrl)}" />
  <link rel="icon" type="image/png" sizes="32x32" href="${escapeHtmlAttribute(favicon32Url)}" />
  <link rel="icon" type="image/png" sizes="16x16" href="${escapeHtmlAttribute(favicon16Url)}" />
  <meta property="title" content="#${escapeHtmlAttribute(postId)}" />
  <meta property="article:published_time" content="${escapeHtmlAttribute(postInfo.created_at)}" />

  <meta property="og:title" content="#${escapeHtmlAttribute(postId)} by ${escapeHtmlAttribute(postAuthor)}" />
  <meta property="og:type" content="${isVideo ? "video.other" : "article"}" />
  <meta property="og:site_name" content="${escapeHtmlAttribute(siteName)}" />${mediaOpenGraph}

  <meta property="twitter:card" content="${isVideo ? "player" : "summary_large_image"}" />
  <meta property="twitter:title" content="Post from ${escapeHtmlAttribute(baseDomain)}" />${mediaTwitter}
  <style>html,body{background:#012e57;}</style>
</head>
<body>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
  <noscript><a href="${escapeHtmlAttribute(targetUrl)}">Open post on ${escapeHtmlAttribute(baseDomain)}</a></noscript>
</body>
</html>`;
}

function jsonResponse(value, status = 200, extraHeaders = {}, head = false) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  addCorsHeaders(headers);

  return new Response(head ? null : JSON.stringify(value), {
    status,
    headers,
  });
}

function textResponse(value, status, contentType, head = false) {
  const headers = new Headers({ "Content-Type": contentType });
  addCorsHeaders(headers);
  return new Response(head ? null : value, { status, headers });
}

function addCorsHeaders(headers) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
}

function copyConditionalHeaders(source) {
  const headers = new Headers();
  for (const name of ["range", "if-range", "if-none-match", "if-modified-since"]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function normalizeHostname(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeFilename(value) {
  return String(value ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

class UpstreamError extends Error {
  constructor(status, publicMessage, { service = "upstream", hint } = {}) {
    super(publicMessage);
    this.name = "UpstreamError";
    this.status = status;
    this.publicMessage = publicMessage;
    this.service = service;
    this.hint = hint;
  }
}
