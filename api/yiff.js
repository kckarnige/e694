export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, User-Agent");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const version = "1.8.1"
  const { slug, embed = false } = req.query;
  const host = req.headers.host || "";

  let unfilteredList = [];
  let safeMode = true;

  try {
    const whitelistFetch = await fetch(`https://${host}/unfiltered.json`);
    unfilteredList = await whitelistFetch.json();
  } catch (err) {
    console.error("Couldn't grab the unfiltered domain whitelist:", err);
    return res
      .status(500)
      .json({ error: `Couldn't grab the unfiltered domain whitelist: ${err}` });
  }

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
      searchUrl.searchParams.set("tags", `md5:${rawIdentifier}`);

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
      postInfo = md5Json?.posts?.[0];

      if (!postInfo) {
        return res.status(404).json({ error: "No post found for that MD5 hash" });
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
        return res.status(postData.status).json({ error: "Failed to fetch post data" });
      }

      const postJson = await postData.json();
      postInfo = postJson?.post;
    }

    if (!postInfo) {
      return res.status(404).json({ error: "Post data not found" });
    }

    const fileExt = ext ?? postInfo.file?.ext;
    const previewUrl = postInfo.preview?.url;
    const postUrl = `https://${host}/posts/${postId}/file.${fileExt}`;
    const isVideo =
      !((baseDomain === "e926.net") && postInfo.rating !== "s") &&
      ["webm", "mp4"].includes(fileExt);

    let postAuthor;
    let sndWarn = "";
    const authors = (postInfo.tags.artist || []).concat(postInfo.tags.contributor || []);
    const exclude = ["sound_warning", "third-party_edit", "conditional_dnp"];
    const realAuthors = authors.filter((real) => !exclude.includes(real));

    if (
      postInfo.tags.artist?.includes("sound_warning") ||
      (postInfo.tags.meta?.includes("sound") && !postInfo.tags.meta?.includes("no_sound"))
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

    if (!postInfo.file?.url) {
      return res.status(404).json({ error: "Media URL not found in post data" });
    }

    const accept = req.headers.accept || "";
    if (ext === "json+oembed" || accept.includes("application/json+oembed")) {
      res.setHeader("Content-Type", "application/json+oembed");
      return res.status(200).json({
        author_name: `Posted on ${formattedDate}\nRating: ${ratingMap[postInfo.rating]} ‎ • ‎ Score: ${postInfo.score.total}${sndWarn}`,
        provider_name: isVideo
          ? `Video from ${baseDomain} • e694`
          : `Image from ${baseDomain} • e694`,
      });
    }

    if (embed === "true") {
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
        : postInfo.file.url,
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