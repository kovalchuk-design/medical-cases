#!/usr/bin/env node
// Renders small WebP thumbnails of every HTML frame (used by the canvas when zoomed out) → cases/<slug>/thumbs/<id>.webp,
// sets `thumb` on the node, and (optionally) a cover. Usage: node tools/thumbs.mjs <slug> [--width 480]
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const { chromium } = createRequire(import.meta.url)("playwright");
const [slug, ...rest] = process.argv.slice(2);
const W = rest.includes("--width") ? +rest[rest.indexOf("--width") + 1] : 480;
const dir = path.resolve("cases", slug), mp = path.join(dir, "manifest.json");
const m = JSON.parse(await readFile(mp, "utf8"));
await mkdir(path.join(dir, "thumbs"), { recursive: true });
const b = await chromium.launch(), ctx = await b.newContext({ deviceScaleFactor: 1 });
for (const n of m.pages.flatMap(p => p.nodes || []).filter(n => n.html)) {
  const pg = await ctx.newPage();
  const w = Math.ceil(n.w), h = Math.ceil(n.h), k = Math.min(1, W / w);
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto("file://" + path.join(dir, n.html));
  await pg.evaluate(() => document.fonts.ready);
  const shot = await pg.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  await pg.close();
  const rel = "thumbs/" + n.id.replace(/[^a-zA-Z0-9]+/g, "-") + ".webp";
  await sharp(shot).resize(Math.max(8, Math.round(w * k)), Math.max(8, Math.round(h * k))).webp({ quality: 80 }).toFile(path.join(dir, rel));
  n.thumb = rel;
}
await b.close();
await writeFile(mp, JSON.stringify(m, null, 1) + "\n");
console.log("✓ thumbs");
