export default async function handler(req, res) {
  const {
    slug,
    embed = false
  } = req.query;
  const host = req.headers.host || "";

  var unfilteredList = [];
  try {
    var whitelistFetch = await fetch(`https://${host}/unfiltered.json`);
    unfilteredList = await whitelistFetch.json();
  }
  catch (err) {
    console.error("Couldn't grab the unfiltered domain whitelist:", err);
    return res.status(500).json({ error: `Couldn't grab the unfiltered domain whitelist: ${err}` });
  }

  if (!slug) {
    return res.status(400).json({ error: "Invalid or missing post ID and extension" });
  }

  const [postId, ext] = slug.split('.');
  const postDataUrl = `https://e621.net/posts/${postId}.json`;

  var baseDomain;
  if (unfilteredList.includes(host)) {
    baseDomain = "e621.net";
  } else {
    baseDomain = "e926.net";
  }

  try {
    const postData = await fetch(postDataUrl, {
      headers: {
        "User-Agent": "e694/1.6"
      }
    });

    if (!postData.ok) {
      return res.status(postData.status).json({ error: "Failed to fetch post data" });
    }

    const postJson = await postData.json();
    const postInfo = postJson?.post;
    const fileExt = ext ?? postInfo.file.ext;
    const previewUrl = postInfo.preview?.url;
    const postUrl = `https://${host}/posts/${postId}/file.${fileExt}`;
    const isVideo = (!((baseDomain == "e926.net") && postInfo.rating !== "s") && ["webm", "mp4"].includes(fileExt));
    var postAuthor;
    var sndWarn = "";
    var authors = (postInfo.tags.artist).concat(postInfo.tags.contributor ?? []);
    var exclude = ["sound_warning", "third-party_edit", "conditional_dnp"];
    var realAuthors = authors.filter(real => !exclude.includes(real));

    if (postInfo.tags.artist.includes("sound_warning")
      || postInfo.tags.meta.includes("sound")
      && !postInfo.tags.meta.includes("no_sound")) {
      sndWarn = "\n🔊 Sound Warning! 🔊"
    }

    const formattedDate = new Date(postInfo.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const ratingMap = {
      s: "Safe",
      q: "Questionable",
      e: "Explicit"
    };

    if (ext === "json") {
      return res.status(200).json(postJson);
    }

    if (!postInfo || !postInfo.file?.url) {
      return res.status(404).json({ error: "Media URL not found in post data" });
    }

    const accept = req.headers.accept || "";
    if (ext === "json+oembed" || accept.includes("application/json+oembed")) {
      res.setHeader("Content-Type", "application/json+oembed");
      return res.status(200).json({
        "author_name": `Posted on ${formattedDate}\nRating: ${ratingMap[postInfo.rating]} ‎ • ‎ Score: ${postInfo.score.total}${sndWarn}`,
      });
    }

    if (embed === "true") {

      if (realAuthors.length === 1) {
        postAuthor = `${realAuthors[0]}`
      } else {
        postAuthor = `${realAuthors[0]} +${realAuthors.length - 1}`
      }
      const embedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta property="theme-color" content="#00709e" />
          <link rel="icon" href="/favicon.ico" />
          <meta name="application-name" content="e694">
          <link rel="alternate" type="application/json+oembed" href="https://${host}/${postId}.json+oembed">
          <link rel="apple-touch-icon" href="https://e694.net/icon.png" />
          <link rel="icon" type="image/png" href="https://e694.net/icon.png">
          <link rel="icon" type="image/png" sizes="32x32" href="https://e694.net/favicon32.png">
          <link rel="icon" type="image/png" sizes="16x16" href="https://e694.net/favicon16.png">
          <meta property="title" content="#${postId}" />

          <!-- Open Graph -->
          <meta property="og:title" content="#${postId} by ${postAuthor}" />
          <meta property="og:type" content="${isVideo ? 'video.other' : 'image'}" />
          ${isVideo ? `
            <meta property="og:video" content="${postUrl}" />
            <meta property="og:video:type" content="video/${fileExt}" />
            <meta property="og:video:width" content="1280" />
            <meta property="og:video:height" content="720" />
            <meta property="og:image" content="${previewUrl}" />
            <meta property="og:site_name" content="Video from ${baseDomain} • e694">
          ` : `
            <meta property="og:image" content="${postUrl}" />
            <meta property="og:site_name" content="Image from ${baseDomain} • e694">
          `}

          <!-- Twitter -->
          <meta property="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}" />
          <meta property="twitter:title" content="Post from ${baseDomain}" />
          ${isVideo ? `
            <meta property="twitter:image" content="${previewUrl}" />
            <meta property="twitter:player" content="${postUrl}" />
            <meta property="twitter:player:width" content="1280" />
            <meta property="twitter:player:height" content="720" />
            <meta property="twitter:player:stream" content="${postUrl}" />
            <meta property="twitter:player:stream:content_type" content="video/${fileExt}" />
          ` : `
            <meta property="twitter:image" content="${postUrl}" />
          `}
          <style>html,body{background:#012e57;}</style>
        </head>
        <body>
            <script>window.location = "https://${baseDomain}/posts/${postId}"</script>
        </body>
        </html>
      `.trim();

      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(embedHtml);
    }

    const imageResponse = await fetch(
      ((baseDomain == "e926.net") && postInfo.rating !== "s") ? "https://e694.net/unsafe.png" : postInfo.file.url, {
      headers: {
        "User-Agent": "e694/1.6"
      }
    });

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageResponse.headers.get("content-type") || 'image/jpeg';
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.setHeader("Content-Disposition", `inline; filename="${postId}.${fileExt}"`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Failed to fetch from API",
      details: error.message
    });
  }
};