export default async function handler(req, res) {
  const {
    slug,
    embed = false,
    format = null
  } = req.query;
  const acceptHeader = req.headers.accept || "";

  if (!slug) {
    return res.status(400).json({ error: "Invalid or missing post ID and extension" });
  }

  const [postId, ext] = slug.split('.');

  if (!/^\d+$/.test(postId)) {
    return res.status(400).json({ error: "Invalid post ID" });
  }
  const postDataUrl = `https://e621.net/posts/${postId}.json`;

  const host = req.headers.host || "";
  var baseDomain;
  if (
    host == "e.e694.net" ||
    host == "e621.e694.net" ||
    host == "e621.kckarnige.online" ||
    host == "e621-media.vercel.app"
  ) {
    baseDomain = "e621.net";
  } else {
    baseDomain = "e926.net";
  }

  try {
    const postData = await fetch(postDataUrl, {
      headers: {
        "User-Agent": "e694/1.2"
      }
    });

    if (!postData.ok) {
      return res.status(postData.status).json({ error: "Failed to fetch post data" });
    }

    const postJson = await postData.json();
    const postInfo = postJson?.post;
    const fileExt = ext ?? postInfo.file.ext;
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

    const imageResponse = await fetch(postInfo.file.url, {
      headers: {
        "User-Agent": "e694/1.2"
      }
    });


    const isOembedRequest = format === "json" || acceptHeader.includes("application/json+oembed");
    if (isOembedRequest) {
      const postUrl = `https://${host}/posts/${postId}`;
      return res.status(200).json(
        {
          type: "rich",
          url: postUrl,
          description: "Random fun fact\\: Minecraft Bedrock has a feature where you can set a screenshot as your ingame profile banner\\. You can edit your existing screenshots or add your own from scratch as long as it's in jpeg format and has a valid json file to match with it\\.\n\nThe result\\:",
          color: "00709e",
          timestamp: formattedDate,
          author: {
            name: "KiCKTheBucket (@kckarnige.online)",
            url: postUrl,
            icon_url: "https://cdn.bsky.app/img/avatar/plain/did:plc:2hkkpfrodwapb4whfvqtbf4b/bafkreigst6n4wnjd75mjexzdvn6oaub3wivsswrvcgnysllxdqefqkatzi@jpeg"
          },
          image: {
            url: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:2hkkpfrodwapb4whfvqtbf4b/bafkreidej5leu73pstuq7z46yom36syjy3jkt4j7bjtoabh3ih3kxutnjm@jpeg",
            width: 615,
            height: 548,
            content_type: imageResponse.headers.get("content-type"),
            flags: 0
          },
          footer: {
            text: "e694",
            icon_url: "https://e694.net/favicon.png"
          }
        }
      );
    }
    if (embed === "true") {
      const previewUrl = postInfo.preview?.url;
      const postUrl = ((baseDomain == "e926.net") && postInfo.rating !== "s") ? "https://e694.net/unsafe.png" : `https://${host}/${postId}.${fileExt}`;
      const isVideo = ["webm", "mp4"].includes(fileExt);
      var postAuthor;
      var sndWarn = "";
      var authors = (postInfo.tags.artist).concat(postInfo.tags.contributor ?? []);
      var exclude = ["sound_warning", "third-party_edit", "conditional_dnp"];
      var realAuthors = authors.filter(real => !exclude.includes(real));

      if (postInfo.tags.artist.includes("sound_warning")
        || postInfo.tags.meta.includes("sound")
        && !postInfo.tags.meta.includes("no_sound")) {
        sndWarn = "\n\n🔊 Sound Warning! 🔊"
      }

      if (realAuthors.length === 1) {
        postAuthor = `${realAuthors[0]}`
      } else {
        postAuthor = `${realAuthors[0]} +${realAuthors.length - 1}`
      }
      const embedHtml = `
          <link type="application/json+oembed" href="https://${host}/posts/${postId}?format=json" title="e694 Embed" />
      `.trim();

      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(embedHtml);
    }

    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imageResponse.headers.get("content-type") || 'image/jpeg';
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