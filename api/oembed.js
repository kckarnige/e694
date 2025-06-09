module.exports = async (req, res) => {
  const { url } = req.query;

  if (!url || !url.includes("/posts/")) {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }

  const postId = url.split("/posts/")[1].split(/[?#]/)[0].split(".")[0];
  const postJson = await fetch(`https://e621.net/posts/${postId}.json`, {
    headers: { "User-Agent": "e694/1.2" }
  }).then(r => r.json()).catch(() => null);

  if (!postJson || !postJson.post) {
    return res.status(404).json({ error: "Post not found" });
  }

  const postInfo = postJson.post;

  // Use preview if video; else full image
  const isVideo = ["mp4", "webm"].includes(postInfo.file.ext);
  const embedUrl = `https://e694.net/posts/${postId}?embed=true`;

  res.setHeader("Content-Type", "application/json+oembed");
  res.json({
    version: "1.0",
    type: "rich",
    provider_name: "e694",
    provider_url: "https://e694.net",
    title: `#${postId} by ${postInfo.tags.artist[0] ?? "unknown"}`,
    width: 600,
    height: 400,
  });
};