export default async function handler(req, res) {
  const {
    postId,
    embed = false
  } = req.query;

  if (!postId) {
    return res.status(400).json({ error: "Post ID not specified!" });
  }

  const host = req.headers.host || "";
  const baseDomain = host.includes("e926") ? "e926.net" : "e621.net";
  const postUrl = `https://${baseDomain}/posts/${postId}.json`;

  try {
    const postData = await fetch(postUrl, {
      headers: {
        "User-Agent": "MyE621Proxy/1.0 (by yourusername on e621)"
      }
    });

    if (!postData.ok) {
      return res.status(postData.status).json({ error: "Failed to fetch post data" });
    }

    const postJson = await postData.json();
    const postInfo = postJson?.post;

    if (!postInfo || !postInfo.file?.url) {
      return res.status(404).json({ error: "Media URL not found in post data" });
    }

    const imageResponse = await fetch(postInfo.file.url, {
      headers: {
        "User-Agent": "MyE621Proxy/1.0 (by yourusername on e621)"
      }
    });

    if (embed === "true") {
      const fileExt = postInfo.file.ext;
      const previewUrl = postInfo.preview?.url;
      const postUrl = `https://${host}/api?postId=${postId}`;
      const isVideo = ["webm", "mp4"].includes(fileExt);
      var postAuthor;
      var sndWarn = "";
      var authorNum = postInfo.tags.artist.length + postInfo.tags.contributor.length;
      if (postInfo.tags.artist.includes("sound_warning")) {authorNum--}
      if (postInfo.tags.artist.includes("third-party_edit")) {authorNum--}

      if (postInfo.tags.artist.includes("sound_warning")
        || postInfo.tags.meta.includes("sound")
        && !postInfo.tags.meta.includes("no_sound")) {
        sndWarn = `<meta property="og:description" content="🔊 Sound Warning! 🔊" />`
      }

      if (authorNum == 1) {
        postAuthor = `${postInfo.tags.artist[0]}`
      } else {
        postAuthor = `${postInfo.tags.artist[0]} +${authorNum - 1}`
      }
      const embedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="theme-color" content="#00549e" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="apple-touch-icon" href="/favicon.png" />
          <meta property="title" content="#${postId}" />
          

          <!-- Open Graph -->
          <meta property="og:title" content="#${postId} by ${postAuthor}" />
          ${sndWarn}
          <meta property="og:type" content="${isVideo ? 'video.other' : 'image'}" />
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
          <meta name="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}" />
          <meta name="twitter:title" content="Post from ${baseDomain}" />
          ${isVideo ? `
            <meta name="twitter:image" content="${previewUrl}" />
            <meta name="twitter:player" content="${postUrl}" />
            <meta name="twitter:player:width" content="1280" />
            <meta name="twitter:player:height" content="720" />
            <meta name="twitter:player:stream" content="${postUrl}" />
            <meta name="twitter:player:stream:content_type" content="video/${fileExt}" />
          ` : `
            <meta name="twitter:image" content="${postUrl}" />
          `}
        </head>
        <body>
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
    const contentType = imageResponse.headers.get("content-type") || `image/${postInfo.file.ext}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Failed to fetch from E621",
      details: error.message
    });
  }
};