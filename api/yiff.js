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
      return res.status(404).json({ error: "Image URL not found in post data" });
    }

    const imageResponse = await fetch(postInfo.file.url, {
      headers: {
        "User-Agent": "MyE621Proxy/1.0 (by yourusername on e621)"
      }
    });

    const fileExt = postInfo.file.ext;
    const previewUrl = postInfo.preview?.url;
    const isVideo = ["webm", "mp4"].includes(fileExt);

    if (embed === "true") {
      const postUrl = `https://${host}/api?postId=${postId}`;
      const escapedTitle = `Post #${postId} from ${baseDomain}`;
      const embedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="${escapedTitle}" />
          ${isVideo
            ? `
              <meta property="og:video" content="${postUrl}" />
              <meta property="og:video:type" content="video/${fileExt}" />
              <meta property="og:image" content="${previewUrl}" />
            `
            : `
              <meta property="og:image" content="${postUrl}" />
            `
          }
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="theme-color" content="#00549e" />
        </head>
        <body>
          <script>document.href = ${postUrl}</script>
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
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

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