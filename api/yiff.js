export default async function handler(req, res) {
  const {
    postId
  } = req.query;

  if (!postId) {
    return res.status(400).json({ error: "Post ID not specified!" });
  }

  const postUrl = `https://e621.net/posts/${postId}.json`;

  try {
    // Fetch both thumbnail and user info in parallel
    const [postData] = await Promise.all([
      fetch(postUrl)
    ]);

    const postJson = await postData.json();
    const postInfo = postJson?.post?.[0];

    if (!postInfo.file.url) {
      return res.status(404).json({ error: "Post data not found" });
    } else {
      const imageResponse = await fetch(postInfo.file.url);
      const contentType = imageResponse.headers.get("content-type");
      const buffer = await imageResponse.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).send(Buffer.from(buffer));
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch from E621", details: error.message });
    document.href = postUrl
  }
}
