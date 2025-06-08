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
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Theme & Icons -->
  <meta name="theme-color" content="#00709e" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/favicon.png" />

  <!-- Article Metadata -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="#123456 by artist_name" />
  <meta property="og:description" content="Posted on June 7, 2025 • Score: 243 • Rating: SFW" />
  <meta property="og:image" content="${escapedMedia}" />
  <meta property="og:url" content="${escapedMedia}" />
  <meta property="article:published_time" content="2025-06-07T12:00:00Z" />
  <meta property="article:author" content="artist_name" />
  <meta property="og:site_name" content="Image from e621.net • e179" />

  <!-- Twitter Metadata -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="#123456 by artist_name" />
  <meta name="twitter:description" content="Posted on June 7, 2025 • Score: 243 • Rating: SFW" />
  <meta name="twitter:image" content="${escapedMedia}" />

  <title>#123456 by artist_name</title>
</head>
<body>
  <article>
    <h1>#123456 by artist_name</h1>
    <p>This is a custom embed page with additional information about the post.</p>
    <p>Posted: June 7, 2025</p>
    <p>Rating: SFW</p>
    <p>Score: 243</p>
    <footer>From <a href="https://e621.net/posts/123456">e621.net</a> • Proxy by e179</footer>
  </article>

  <!-- Optional auto-redirect -->
  <script>
    window.location.href = "https://e621.net/posts/123456";
  </script>
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
