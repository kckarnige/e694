export default function handler(req, res) {
  const { url } = req.query;
  const postId = new URL(url).pathname.split('/').pop();

  res.setHeader('Content-Type', 'application/json+oembed');
  res.status(200).json({
    version: "1.0",
    type: "rich",
    provider_name: "e694",
    provider_url: "https://e694.net",
    title: `Post #${postId}`,
    author_name: "KiCKTheBucket",
    author_url: `https://e694.net`,
    html: `<iframe src="https://e694.net/embed/${postId}" width="600" height="400" frameborder="0" allowfullscreen></iframe>`,
    width: 600,
    height: 400
  });
}
