// This is going to be a rewrite that's a hell of a lot less cuck-coded.

import { readFile } from "node:fs/promises";

const unfilteredList = JSON.parse(
    await readFile(new URL("../public/unfiltered.json", import.meta.url), "utf8")
);

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");


    const version = "2.0"
    const { slug, embed = false } = req.e694Query ?? req.query;
    const host = req.headers.host || "";


    let safeMode = true;
    let baseDomain;
    
    if (unfilteredList.includes(host)) {
        baseDomain = "e621.net";
        safeMode = false;
    } else {
        baseDomain = "e926.net";
        safeMode = true;
    }
}