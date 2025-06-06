export default async function handler(req, res) {
  const { postId } = req.query;

  if (!postId) {
    return res.status(400).json({ error: "Post ID not specified!" });
  }

  const postUrl = `https://e621.net/posts/${postId}.json`;

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