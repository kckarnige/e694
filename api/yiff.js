export default async function handler(req, res) {
  const {
    slug,
    embed = false
  } = req.query;

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

  try {
    const postData = await fetch(postDataUrl, {
      headers: {
        "User-Agent": "e179/1.0"
      }
    });

    if (!postData.ok) {
      return res.status(postData.status).json({ error: "Failed to fetch post data" });
    }

    const postJson = await postData.json();
    const postInfo = postJson?.post;
    const fileExt = ext ?? postInfo.file.ext;

    if (ext === "json") {
      return res.status(200).json(postJson);
    }

    if (!postInfo || !postInfo.file?.url) {
      return res.status(404).json({ error: "Media URL not found in post data" });
    }

    const imageResponse = await fetch(postInfo.file.url, {
      headers: {
        "User-Agent": "e179/1.0 (e621 Proxy)"
      }
    });

    if (embed === "true") {
      const previewUrl = postInfo.preview?.url;
      const postUrl = `https://${host}/${postId}.${fileExt}`;
      const isVideo = ["webm", "mp4"].includes(fileExt);
      var postAuthor;
      var sndWarn = "";
      var authors = (postInfo.tags.artist ?? []).concat(postInfo.tags.contributor ?? []);
      var exclude = ["sound_warning", "third-party_edit", "conditional_dnp"];
      var realAuthors = authors.filter(real => !exclude.includes(real));

      if (postInfo.tags.artist.includes("sound_warning")
        || postInfo.tags.meta.includes("sound")
        && !postInfo.tags.meta.includes("no_sound")) {
        sndWarn = `<meta property="og:description" content="🔊 Sound Warning! 🔊" />`
      }

      if (realAuthors.length == 1) {
        postAuthor = `${realAuthors[0]}`
      } else {
        postAuthor = `${realAuthors[0]} +${realAuthors.length - 1}`
      }

      const formattedDate = new Date(postInfo.created_at).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short"
      });

      const embedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta property="theme-color" content="#00709e" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/favicon.png" />
  <meta property="title" content="#${postId}" />
  <meta property="al:android:app_name" content="Medium"/>
  <meta property="article:published_time" content="${postInfo.created_at}"/>

  <!-- Open Graph -->
  <meta property="og:title" content="#${postId} by ${postAuthor}" />
  ${sndWarn}
  <meta property="og:type" content="article" />
  ${isVideo ? `
    <meta property="og:video" content="${postUrl}" />
    <meta property="og:video:type" content="video/${fileExt}" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />
    <meta property="og:image" content="${previewUrl}" />
    <meta property="og:site_name" content="Video from ${baseDomain} • e179 (${host})">
  ` : `
    <meta property="og:image" content="${postUrl}" />
    <meta property="og:site_name" content="Image from ${baseDomain} • e179 (${host})">
  `}

  <!-- Twitter -->
  <meta property="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}" />
  <meta property="twitter:title" content="Post from ${baseDomain}" />
  ${isVideo ? `
    <meta property="twitter:image" content="${previewUrl}" />
    <meta property="twitter:player" content="${postUrl}" />
    <meta property="twitter:player:width" content="1280" />
    <meta property="twitter:player:height" content="720" />
    <meta property="twitter:player:stream" content="${postUrl}" />
    <meta property="twitter:player:stream:content_type" content="video/${fileExt}" />
  ` : `
    <meta property="twitter:image" content="${postUrl}" />
  `}
</head>
<body>
  <article>
    <h1>Post #${postId}</h1>
    <p>Originally posted on <a href="https://${baseDomain}/posts/${postId}">${baseDomain}</a></p>
    <figure><img src="${isVideo ? previewUrl : postUrl}" alt="Preview" style="max-width: 100%; height: auto;"></figure>
    <footer>By ${postAuthor} — ${formattedDate}</footer>
  </article>
  <script>window.location = "https://${baseDomain}/posts/${postId}"</script>
</body>
</html>
`.trim();


      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(embedHtml);
    }

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
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