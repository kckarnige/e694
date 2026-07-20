export function onRequest(context) {
  const url = new URL(context.params.path);
  const path = url.pathname;

  // Match all 3 Vercel routes:
  // 1. /posts/:postId
  // 2. /posts/:postId/file
  // 3. /posts/:postId/file:ext

  const match = path.match(/^\/posts\/([^\/]+)(?:\/file(\.[^\/]+)?)?$/);

  if (match) {
    const postId = match[1];     // :postId
    const ext = match[2] || "";  // :ext (includes the dot, like ".png")

    let target;

    // Case 1: /posts/:postId
    if (!match[2] && !path.endsWith("/file")) {
      target = `/api/yiff.min.js?slug=${postId}&embed=true`;
    }
    // Case 2 & 3: /posts/:postId/file OR /file.ext
    else {
      target = `/api/yiff.min.js?slug=${postId}${ext}`;
    }

    return context.env.ASSETS.fetch(new Request(new URL(target, url)));
  }

  // Let other requests pass through normally
  return context.next();
}