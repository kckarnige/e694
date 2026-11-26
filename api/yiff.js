import { readFile } from "node:fs/promises";
// In-memory e621 tag category cache
const tagCategoryCache = new Map();

// Shared API request rate limiter
let lastTagApiRequest = 0;
let tagApiQueue = Promise.resolve();

const unfilteredList = JSON.parse(
  await readFile("./public/unfiltered.json", "utf8")
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const version = "1.9.1"
  const { slug, embed = false } = req.e694Query ?? req.query;
  const host = req.headers.host || "";

  let safeMode = true;

  if (!slug) {
    return res.status(400).json({ error: "Invalid or missing post ID / MD5 / extension" });
  }

  const slugValue = Array.isArray(slug) ? slug[0] : String(slug);

  // Split only on the final dot so "627635.json" and "md5hash.json+oembed" work cleanly
  const lastDot = slugValue.lastIndexOf(".");
  const rawIdentifier = lastDot === -1 ? slugValue : slugValue.slice(0, lastDot);
  const ext = lastDot === -1 ? undefined : slugValue.slice(lastDot + 1);

  const isMd5 = /^[a-f0-9]{32}$/i.test(rawIdentifier);
  const isNumericId = /^\d+$/.test(rawIdentifier);

  if (!isMd5 && !isNumericId) {
    return res.status(400).json({
      error: "Slug must be a numeric post ID or a 32-character MD5 hash",
    });
  }

  let baseDomain;
  if (unfilteredList.includes(host)) {
    baseDomain = "e621.net";
    safeMode = false;
  } else {
    baseDomain = "e926.net";
    safeMode = true;
  }

  try {
    let postInfo;
    let postId;

    if (isMd5) {
      const searchUrl = new URL("https://e621.net/posts.json");
      searchUrl.searchParams.set("limit", "1");
      searchUrl.searchParams.set(
        "tags",
        `md5:${rawIdentifier.toLowerCase()} status:any`
      );

      const md5Search = await fetch(searchUrl.toString(), {
        headers: {
          "User-Agent": `e694/${version}`,
          "Accept": "application/json",
        },
      });

      if (!md5Search.ok) {
        return res.status(md5Search.status).json({
          error: "Failed to search post by MD5",
        });
      }

      const md5Json = await md5Search.json();

      // Support both the traditional { posts: [...] } response
      // and a direct array response.
      const posts = Array.isArray(md5Json)
        ? md5Json
        : md5Json?.posts ?? [];

      // Confirm that the returned post actually matches.
      postInfo = posts.find(
        post =>
          post.files?.meta?.md5?.toLowerCase() ===
          rawIdentifier.toLowerCase()
      );

      if (!postInfo) {
        return res.status(404).json({
          error: "No post found for that MD5 hash",
        });
      }

      postId = String(postInfo.id);
    } else {
      postId = rawIdentifier;

      const postDataUrl = `https://e621.net/posts/${postId}.json`;
      const postData = await fetch(postDataUrl, {
        headers: {
          "User-Agent": `e694/${version}`,
          "Accept": "application/json",
        },
      });

      if (!postData.ok) {
        return res.status(postData.status).json({
          error: "Failed to fetch post data",
        });
      }

      const postJson = await postData.json();
      postInfo = postJson;
    }


    if (!postInfo) {
      return res.status(404).json({ error: "Post data not found" });
    }

    const fileExt = ext ?? postInfo.files.meta?.ext;
    const previewUrl = postInfo.files.preview?.jpg ?? postInfo.files.preview?.url;
    const postUrl = `https://${host}/posts/${postId}/file.${fileExt}`;
    const isVideo =
      !((baseDomain === "e926.net") && postInfo.rating !== "s") &&
      ["webm", "mp4"].includes(fileExt);


    async function apiGet(path) {
      const request = tagApiQueue.then(async () => {
        const wait = 550 - (Date.now() - lastTagApiRequest);

        if (wait > 0) {
          await new Promise(resolve => setTimeout(resolve, wait));
        }

        lastTagApiRequest = Date.now();

        const response = await fetch(
          `https://${baseDomain}${path}`,
          {
            headers: {
              "User-Agent": `e694/${version}`,
              "Accept": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`e621 API error ${response.status}`);
        }

        return response.json();
      });

      tagApiQueue = request.catch(() => { });

      return request;
    }


    async function getArtistTags(post) {
      const tagNames = [...new Set(post.tags ?? [])];
      const authors = [];

      for (const name of tagNames) {
        if (tagCategoryCache.has(name)) {
          if (tagCategoryCache.get(name) === 1) {
            authors.push(name);
          }
          continue;
        }

        const searchUrl = new URLSearchParams({
          "search[name_matches]": name,
          "search[category]": "1",
          limit: "320",
        });

        const tags = await apiGet(
          `/tags.json?${searchUrl.toString()}`
        );

        // Match the exact tag, not partial name matches.
        const exactMatch = tags.find(
          tag => tag.name === name && tag.category === 1
        );

        tagCategoryCache.set(name, exactMatch ? 1 : null);

        if (exactMatch) {
          authors.push(name);
        }
      }

      return authors;
    }

    let sndWarn = "";
    if (
      postInfo.tags?.includes("sound_warning") ||
      (postInfo.tags?.includes("sound") && !postInfo.tags?.includes("no_sound"))
    ) {
      sndWarn = "\n🔊 Sound Warning! 🔊";
    }

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

    const safeModeText = {
      true: " (Safe Mode)",
      false: "",
    };

    // For .json requests, return a consistent shape.
    // If resolved through MD5 search, emulate /posts/{id}.json shape.
    if (ext === "json") {
      return res.status(200).json({ post: postInfo });
    }

    if (!postInfo.files.original?.url) {
      return res.status(404).json({ error: "Media URL not found in post data" });
    }

    const accept = req.headers.accept || "";
    if (ext === "json+oembed" || accept.includes("application/json+oembed")) {
      res.setHeader("Content-Type", "application/json+oembed");
      return res.status(200).json({
        author_name: `Posted on ${formattedDate}\nRating: ${ratingMap[postInfo.rating]} ‎ • ‎ Score: ${postInfo.stats.score.total}${sndWarn}`,
        provider_name: isVideo
          ? `Video from ${baseDomain} • e694`
          : `Image from ${baseDomain} • e694`,
      });
    }

    if (embed === "true") {

      const authors = await getArtistTags(postInfo);
      const exclude = ["sound_warning", "third-party_edit", "conditional_dnp"];
      const realAuthors = authors.filter((real) => !exclude.includes(real));

      let postAuthor;

      if (realAuthors.length === 0) {
        postAuthor = "unknown";
      } else if (realAuthors.length === 1) {
        postAuthor = `${realAuthors[0]}`;
      } else {
        postAuthor = `${realAuthors[0]} +${realAuthors.length - 1}`;
      }

      const embedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="theme-color" content="#00709e" />
          <link rel="icon" href="/favicon.ico" />
          <meta name="application-name" content="e694">
          <link rel="alternate" type="application/json+oembed" href="https://${host}/posts/${postId}/file.json+oembed">
          <link rel="apple-touch-icon" href="https://e694.net/icon.png" />
          <link rel="icon" type="image/png" href="https://e694.net/icon.png">
          <link rel="icon" type="image/png" sizes="32x32" href="https://e694.net/favicon32.png">
          <link rel="icon" type="image/png" sizes="16x16" href="https://e694.net/favicon16.png">
          <meta property="title" content="#${postId}" />
          <meta property="article:published_time" content="${postInfo.created_at}">

          <!-- Open Graph -->
          <meta property="og:title" content="#${postId} by ${postAuthor}" />
          <meta property="og:type" content="${isVideo ? "video.other" : "article"}" />
          <meta property="og:site_name" content="${baseDomain} via e694${safeModeText[safeMode]}">
          ${isVideo
          ? `
            <meta property="og:video" content="${postUrl}" />
            <meta property="og:video:type" content="video/${fileExt}" />
            <meta property="og:video:width" content="1280" />
            <meta property="og:video:height" content="720" />
            <meta property="og:image" content="${previewUrl}" />
          `
          : `
            <meta property="og:image" content="${postUrl}" />
          `
        }

          <!-- Twitter -->
          <meta property="twitter:card" content="${isVideo ? "player" : "summary_large_image"}" />
          <meta property="twitter:title" content="Post from ${baseDomain}" />
          ${isVideo
          ? `
            <meta property="twitter:image" content="${previewUrl}" />
            <meta property="twitter:player" content="${postUrl}" />
            <meta property="twitter:player:width" content="1280" />
            <meta property="twitter:player:height" content="720" />
            <meta property="twitter:player:stream" content="${postUrl}" />
            <meta property="twitter:player:stream:content_type" content="video/${fileExt}" />
          `
          : `
            <meta property="twitter:image" content="${postUrl}" />
          `
        }
          <style>html,body{background:#012e57;}</style>
        </head>
        <body>
          <script>window.location = "https://${baseDomain}/posts/${postId}"</script>
        </body>
        </html>
      `.trim();

      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(embedHtml);
    }

    const imageResponse = await fetch(
      (baseDomain === "e926.net" && postInfo.rating !== "s")
        ? "https://e694.net/unsafe.png"
        : postInfo.files.original.url,
      {
        headers: {
          "User-Agent": `e694/${version}`,
        },
      }
    );

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.setHeader("Content-Disposition", `inline; filename="${postId}.${fileExt}"`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Failed to fetch from API",
      details: error.message,
    });
  }
}
