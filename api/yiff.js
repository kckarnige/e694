export default async function handler(req, res) {
  const { slug, embed = false } = req.query;

  if (!slug) {
    return res.status(400).json({ error: "Invalid or missing post ID and extension" });
  }

  const [postId, ext] = slug.split('.');
  if (!/^\d+$/.test(postId)) {
    return res.status(400).json({ error: "Invalid post ID" });
  }

  const host = req.headers.host || "";
  const baseDomain = host.includes("e926") ? "e926.net" : "e621.net";
  const postDataUrl = `https://e621.net/posts/${postId}.json`;

  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, match => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[match]);
  }

  try {
    const postData = await fetch(postDataUrl, {
      headers: { "User-Agent": "e179/1.0" }
    });

    if (!postData.ok) {
      return res.status(postData.status).json({ error: "Failed to fetch post data" });
    }

    const postJson = await postData.json();
    const postInfo = postJson?.post;
    const fileExt = ext ?? postInfo?.file?.ext;

    if (ext === "json") {
      return res.status(200).json(postJson);
    }

    if (!postInfo || !postInfo.file?.url) {
      return res.status(404).json({ error: "Media URL not found in post data" });
    }

    const mediaUrl = postInfo.file.url;
    const previewUrl = postInfo.preview?.url || "";
    const isVideo = ["webm", "mp4"].includes(fileExt);
    const authors = (postInfo.tags.artist ?? []).concat(postInfo.tags.contributor ?? []);
    const exclude = ["sound_warning", "third-party_edit", "conditional_dnp"];
    const realAuthors = authors.filter(tag => !exclude.includes(tag));

    let sndWarn = "";
    if ((postInfo.tags.artist.includes("sound_warning") || postInfo.tags.meta.includes("sound"))
      && !postInfo.tags.meta.includes("no_sound")) {
      sndWarn = `<meta property="og:description" content="🔊 Sound Warning! 🔊" />`;
    }

    const postAuthor = realAuthors.length
      ? `${escapeHtml(realAuthors[0])}${realAuthors.length > 1 ? ` +${realAuthors.length - 1}` : ""}`
      : "unknown";

    const escapedPreview = escapeHtml(previewUrl);
    const escapedMedia = escapeHtml(mediaUrl);
    const escapedHost = escapeHtml(host);
    const escapedPostId = escapeHtml(postId);
    const escapedBaseDomain = escapeHtml(baseDomain);
    const postUrl = `https://${escapedHost}/${escapedPostId}.${fileExt}`;

    if (embed === "true") {
      const embedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="theme-color" content="#00709e" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/favicon.png" />
          <meta property="title" content="#${escapedPostId}" />
          <meta property="al:android:app_name" content="Medium"/>
          <meta property="article:published_time" content="${escapeHtml(postInfo.created_at)}"/>

          <!-- Open Graph -->
          <meta property="og:title" content="#${escapedPostId} by ${postAuthor}" />
          ${sndWarn}
          <meta property="og:type" content="article" />
          ${isVideo ? `
            <meta property="og:video" content="${escapedMedia}" />
            <meta property="og:video:type" content="video/${fileExt}" />
            <meta property="og:video:width" content="1280" />
            <meta property="og:video:height" content="720" />
            <meta property="og:image" content="${escapedPreview}" />
            <meta property="og:site_name" content="Video from ${escapedBaseDomain} • e179 (${escapedHost})">
          ` : `
            <meta property="og:image" content="${escapedMedia}" />
            <meta property="og:site_name" content="Image from ${escapedBaseDomain} • e179 (${escapedHost})">
          `}

          <!-- Twitter -->
          <meta name="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}" />
          <meta name="twitter:title" content="Post from ${escapedBaseDomain}" />
          ${isVideo ? `
            <meta name="twitter:image" content="${escapedPreview}" />
            <meta name="twitter:player" content="${escapedMedia}" />
            <meta name="twitter:player:width" content="1280" />
            <meta name="twitter:player:height" content="720" />
            <meta name="twitter:player:stream" content="${escapedMedia}" />
            <meta name="twitter:player:stream:content_type" content="video/${fileExt}" />
          ` : `
            <meta name="twitter:image" content="${escapedMedia}" />
          `}
          <noscript><meta http-equiv="refresh" content="0;url=https://${escapedBaseDomain}/posts/${escapedPostId}" /></noscript>
        </head>
        <body>
            <article>
                <h1>Post #${escapedPostId}</h1>
                <p>Shared from ${escapedBaseDomain}</p>
                <footer>by ${postAuthor}</footer>
            </article>
        </body>
        </html>
      `.trim();

      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(embedHtml);
    }

    const imageResponse = await fetch(mediaUrl, {
      headers: { "User-Agent": "e179/1.0 (e621 Proxy)" }
    });

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ error: "Failed to fetch media file" });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageResponse.headers.get("content-type") || 'image/jpeg';

    res.setHeader("Content-Disposition", `inline; filename="${postId}.${fileExt}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Failed to fetch from API",
      details: error.message
    });
  }
};
