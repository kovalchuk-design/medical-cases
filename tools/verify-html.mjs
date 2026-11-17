#!/usr/bin/env node
// Renders each cases/<slug>/frames/*.html with Playwright and compares to the Figma raster (img/<id>@1x.webp).
// Usage: node tools/verify-html.mjs <slug> [--out dir] [--ids a,b]   → prints worst frames by mean abs diff (0-255)
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [slug, ...rest] = process.argv.slice(2);
const out = rest.includes("--out") ? rest[rest.indexOf("--out") + 1] : null;
const ids = rest.includes("--ids") ? new Set(rest[rest.indexOf("--ids") + 1].split(",")) : null;
const dir = path.resolve("cases", slug);
const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
const nodes = m.pages.flatMap(p => p.nodes || []).filter(n => n.html && n.img && (!ids || ids.has(n.id)));
if (out) await mkdir(out, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ deviceScaleFactor: 1 });
const res = [];
for (const n of nodes) {
  const pg = await ctx.newPage();
  await pg.setViewportSize({ width: Math.ceil(n.w), height: Math.ceil(n.h) });
  await pg.goto("file://" + path.join(dir, n.html));
  await pg.evaluate(() => document.fonts.ready);
  const shot = await pg.screenshot({ clip: { x: 0, y: 0, width: n.w, height: n.h }, omitBackground: false });
  await pg.close();
  const W = Math.round(n.w), H = Math.round(n.h);
  const flat = img => img.flatten({ background: "#ffffff" }).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const a = await flat(sharp(shot)), r = await flat(sharp(path.join(dir, n.img + "@1x.webp")));
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - r[i]);
  const d = s / a.length;
  res.push({ id: n.id, name: n.name, d });
  if (out) await writeFile(path.join(out, n.id.replace(/:/g, "-") + ".png"), shot);
}
await b.close();
res.sort((x, y) => y.d - x.d);
const avg = res.reduce((s, x) => s + x.d, 0) / res.length;
console.log(`frames ${res.length}, mean diff ${avg.toFixed(2)}`);
for (const x of res.slice(0, 25)) console.log(x.d.toFixed(2).padStart(6), x.id.padEnd(10), x.name);
