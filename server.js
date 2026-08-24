import express from "express";
import handler from "./api/yiff.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

// Render uses this endpoint to verify that the service is running.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Express equivalents of the rewrites previously defined in vercel.json.
app.all("/posts/:postId/file.:ext", (req, res) => {
  req.e694Query = {
    ...req.query,
    slug: `${req.params.postId}.${req.params.ext}`,
  };
  return handler(req, res);
});

app.all("/posts/:postId/file", (req, res) => {
  req.e694Query = { ...req.query, slug: req.params.postId };
  return handler(req, res);
});

app.all("/posts/:postId", (req, res) => {
  req.e694Query = {
    ...req.query,
    slug: req.params.postId,
    embed: "true",
  };
  return handler(req, res);
});

app.use(express.static("public"));

app.use((_req, res) => {
  res.status(404).sendFile("404.html", { root: "public" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`e694 is listening on port ${port}`);
});
