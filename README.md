<img  align="left" alt="e694" src="./public/icon.svg">

<p align="right">
  <br>
  <br>
  <i>If you'd like to support what I do, please consider donating,<br>it'd help a lot, and it'd help keep "e694.net" and "e994.net" up!</i>
  <br>
  <br>
  <a href="https://www.buymeacoffee.com/kckarnige" target="_blank">
    <img alt="buymeacoffee-singular" height="40" src="https://cdn.jsdelivr.net/npm/@intergrav/devins-badges@3/assets/compact/donate/buymeacoffee-singular_vector.svg">
  </a>
  <br>
  <a href="https://github.com/sponsors/kckarnige" target="_blank">
    <img alt="ghsponsors-singular" height="40" src="https://cdn.jsdelivr.net/npm/@intergrav/devins-badges@3/assets/compact/donate/ghsponsors-singular_vector.svg">
  </a>
  <br>
  <a href="https://ko-fi.com/kckarnige" target="_blank">
    <img alt="kofi-singular" height="40" src="https://cdn.jsdelivr.net/npm/@intergrav/devins-badges@3/assets/compact/donate/kofi-singular_vector.svg">
  </a>
  <br>
  <i>I also take <a href="https://cash.app/$kckarnige">CashApp</a> (Yes, I am that broke)</i>
</p>

<br>
<br>
<br>

>*(A-Z/1-9) FIX -> 694*

For anyone who wants to send someone else an eSix or eNine post. Embeds show post info like rating, score, date posted, and the presumed author based on tags. It also supports video for Discord embeds! All you need to do is switch the last two numbers in "e621" with "94" in the URL; this even works with "e926"!

----

### Why should I use this?

- No restrictions on who or what can fetch content.
- Adding '/file' at the end gives you the raw media file.
- If the post is a video containing sound, the embed will let you know!
- The author count in embeds also includes contributors.
- Media display size in embeds are consistent, meaning pixel art can be seen in embeds just as well as a 4K image!
- You can get JSON based on a post's MD5 hash! (1.8+)
- Just change the last two numbers in the domain! 
  - *e621.net -> e694.net*
  - *e926.net -> e994.net*

----

### Official Domains:

- e694.net
- e994.net (Filtered)
- e694.onrender.com
- e994.onrender.com (Filtered)


<h3>What's the difference?</h3>
eSix is known for it's explicit content, however they do have a alternative domain which displays EXCLUSIVELY posts rated as "safe" called "eNine" (e926.net).
<br><br>
When using a filtered domain, if the post is meant to link to anything above a "safe" rating, it will not be displayed, even if the media file for the post itself is trying to be fetched.
<br><br>
Attempting to do so will serve this image:
<br><br>
<img width="256px" src="./public/unsafe.png" />

## Link Examples:

### File Example:

`https://e994.net/posts/5302549/file`  
or  
`https://e994.net/posts/5302549/file.gif`

[![example](https://e994.net/posts/5302549/file)](https://e994.net/posts/5302549/file)

### Embed Example:

`https://s.e694.net/posts/5302549`

![embed example](https://s.e694.net/embed_example.png)

Works with videos too!

![video example](https://e694.net/video_example.png)

## Self Hosting

This was originally made with Vercel, but after a few huge roadblocks, it was ported to [Render](https://render.com/), but it's pretty simple to make your own deployment!

All you have to do is make a new project with a blueprint and use this repo!

Make sure to configure your `unfiltered.json` accordingly!

<sub>I will not be providing *any* assistance with deploying, you're on your own. If self deploying is even a thing on your mind, you definitely have the brain-power do it on your own, I believe in you. :3</sub>

## Code "Reference"

The artist tag search code is vibe/cuck-coded with Z.ai.

Most of the code was made with AI assistance as a guide to.

Sorry to disappoint, I'm tired and don't have time to look into things like this anymore like I used to, I have mouths to feed.