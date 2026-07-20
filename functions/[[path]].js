export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const match = path.match(/^\/posts\/([^\/]+)(?:\/file(\.[^\/]+)?)?$/);

  if (!match) {
    return next(); // 👈 middleware pass-through
  }

  const postId = match[1];
  const ext = match[2] || "";

  let target;

  if (!path.includes("/file")) {
    target = `/api/yiff.min.js?slug=${postId}&embed=true`;
  } else {
    target = `/api/yiff.min.js?slug=${postId}${ext}`;
  }

  return env.ASSETS.fetch(new Request(new URL(target, url), request));
}