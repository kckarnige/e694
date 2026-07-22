# Vercel-to-Cloudflare conversion notes

## Removed Vercel files

- `vercel.json`: replaced by route parsing in `src/index.js`.
- `api/yiff.js`: converted from the Vercel `req`/`res` handler to a Worker `fetch()` handler.
- `api/yiff.min.js` and root `api.min.js`: duplicate minified handler files are no longer needed. Their public URL paths are still accepted by the Worker for compatibility.

## Runtime changes

- `req.query` is replaced with `URL` and `URLSearchParams`.
- `req.headers` is replaced with the standard `Headers` API.
- `res.status()`, `res.json()`, `res.send()`, and `res.setHeader()` are replaced with `Response` objects.
- Node `Buffer` is removed.
- Media responses are streamed directly from the upstream source.
- `Range`, `If-Range`, `If-None-Match`, and `If-Modified-Since` are forwarded when proxying media.
- The unsafe placeholder is served from the bundled static asset rather than fetching `https://e694.net/unsafe.png` through the public network.
- The unfiltered-domain list is loaded from the bundled `public/unfiltered.json` asset and cached per Worker isolate.
- Generated icon and media URLs use the active request origin, so workers.dev previews and every attached custom domain work correctly.


## 403 compatibility patch

- Upstream requests now use a contact-identifying User-Agent.
- Optional `E621_LOGIN` and `E621_API_KEY` Worker secrets enable HTTP Basic authentication for e621 API requests.
- Upstream 403/429 responses now include a safe diagnostic hint and service name.
- Worker observability is enabled in `wrangler.jsonc`.
