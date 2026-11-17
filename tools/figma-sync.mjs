#!/usr/bin/env node
// Figma → Case Studio sync. Reads a Figma file through the REST API and writes
//   cases/<slug>/manifest.json   pages, top-level nodes with Figma coordinates, flows, prototype links
//   cases/<slug>/img/<id>@1x.webp, @2x.webp
//
// Usage:  node tools/figma-sync.mjs <slug> <fileKey> [--force] [--pages "Cover,▶ Case presentation"]
// Auth:   header X-Figma-Token. In Claude cloud sessions the egress proxy injects the saved credential for
//         api.figma.com, so FIGMA_TOKEN may be unset (a placeholder is sent). Locally: export FIGMA_TOKEN=…
// Needs:  npm i (sharp, undici). Network: api.figma.com + the S3 host Figma returns image URLs on.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());

const [slug, fileKey, ...rest] = process.argv.slice(2);
if (!slug || !fileKey) { console.error("Usage: node tools/figma-sync.mjs <slug> <fileKey> [--force] [--pages a,b]"); process.exit(1); }
const FORCE = rest.includes("--force");
const onlyPages = (() => { const i = rest.indexOf("--pages"); return i >= 0 ? rest[i + 1].split(",").map(s => s.trim()) : null; })();

const API = "https://api.figma.com/v1";
const TOKEN = process.env.FIGMA_TOKEN || "injected-by-proxy";
const MAX_PIXELS = 32e6;            // Figma scales exports above 32 MP down — we pick the scale ourselves
const OUT = path.resolve("cases", slug);
const IMG = path.join(OUT, "img");
const TYPES = { FRAME: "frame", SECTION: "section", TEXT: "text", COMPONENT: "component", COMPONENT_SET: "component_set", INSTANCE: "instance", GROUP: "group" };
const OVERLAY_CHILD = new Set(["FRAME", "COMPONENT", "INSTANCE", "COMPONENT_SET", "GROUP"]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = id => id.replace(/[^a-zA-Z0-9]+/g, "-");
const exists = p => access(p).then(() => true, () => false);

async function api(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(API + url, { headers: { "X-Figma-Token": TOKEN } });
    if (res.status === 429 || res.status >= 500) {
      const wait = (Number(res.headers.get("retry-after")) || 2 ** i * 5) * 1000;
      console.warn(`  ${res.status} on ${url.slice(0, 60)}… retry in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}\n${(await res.text()).slice(0, 400)}`);
    return res.json();
  }
  throw new Error("Too many retries: " + url);
}

async function download(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    await sleep(2 ** i * 1000);
  }
  throw new Error("Download failed: " + url.slice(0, 80));
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const pageKind = p => /^[\s\-—–_·.]+$/.test(p.name) ? "divider" : /▶|presentation/i.test(p.name) ? "presentation" : "canvas";
const exportScale = (w, h) => Math.max(0.05, Math.min(2, Math.floor(Math.sqrt(MAX_PIXELS / Math.max(1, w * h)) * 100) / 100));

function toNode(n, parent) {
  const b = n.absoluteBoundingBox;
  if (!b || n.visible === false || b.width < 1 || b.height < 1) return null;
  const out = {
    id: n.id, name: n.name, type: TYPES[n.type] || "shape",
    x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
    img: "img/" + safe(n.id), scale: exportScale(b.width, b.height)
  };
  if (parent) out.parent = parent;
  if (n.type === "TEXT") { out.text = n.characters; if (n.style && n.style.fontSize) out.fontSize = n.style.fontSize; }
  return out;
}

function collectLinks(frame, pageFrameIds) {
  const fb = frame.absoluteBoundingBox, links = [];
  (function walk(n) {
    if (n.visible === false) return;
    const dests = [];
    for (const it of n.interactions || []) {
      if (it.trigger && it.trigger.type && it.trigger.type !== "ON_CLICK") continue;
      for (const a of it.actions || []) if (a && a.type === "NODE" && a.destinationId) dests.push(a.destinationId);
    }
    if (!dests.length && n.transitionNodeID) dests.push(n.transitionNodeID);
    const b = n.absoluteBoundingBox;
    for (const to of dests) {
      if (!b || !pageFrameIds.has(to)) continue;
      links.push({ from: frame.id, to, label: n.name, rect: [Math.round(b.x - fb.x), Math.round(b.y - fb.y), Math.round(b.width), Math.round(b.height)] });
    }
    for (const c of n.children || []) walk(c);
  })(frame);
  return links;
}

async function main() {
  console.log(`→ ${slug}: reading file ${fileKey}`);
  const file = await api(`/files/${fileKey}?depth=3`);
  await mkdir(IMG, { recursive: true });

  let prev = null;
  try { prev = JSON.parse(await readFile(path.join(OUT, "manifest.json"), "utf8")); } catch {}
  const sameVersion = prev && prev.source && prev.source.version === file.version;

  const manifest = {
    case: slug, title: file.name.split(/\s[—–-]\s/)[0].trim() || file.name,
    source: { type: "figma", fileKey, fileName: file.name, version: file.version, lastModified: file.lastModified, syncedAt: new Date().toISOString() },
    pages: []
  };
  if (prev && prev.title) manifest.title = prev.title;      // keep a hand-edited title

  const jobs = [];                                          // { node, scale }
  for (const p of file.document.children) {
    const kind = pageKind(p);
    const page = { id: p.id, name: p.name, kind };
    manifest.pages.push(page);
    if (kind === "divider") continue;
    if (onlyPages && !onlyPages.includes(p.name)) { const old = prev && prev.pages.find(x => x.id === p.id); if (old) Object.assign(page, old); continue; }

    page.nodes = [];
    for (const top of p.children || []) {
      const n = toNode(top);
      if (!n) continue;
      page.nodes.push(n);
      jobs.push(n);
      // Large boards: low-res backdrop keeps arrows and labels, crisp child frames go on top.
      if (n.scale < 1.5 && top.children) {
        for (const c of top.children) {
          if (!OVERLAY_CHILD.has(c.type)) continue;
          const cn = toNode(c, n.id);
          if (!cn || cn.w < 80 || cn.h < 80) continue;
          page.nodes.push(cn);
          jobs.push(cn);
        }
      }
    }

    if (kind === "presentation") {
      page.flows = (p.flowStartingPoints || []).map(f => ({ name: f.name, start: f.nodeId }));
      const frames = page.nodes.filter(n => !n.parent && n.type !== "text");
      const ids = new Set(frames.map(f => f.id));
      page.links = [];
      for (let i = 0; i < frames.length; i += 10) {
        const batch = frames.slice(i, i + 10).map(f => f.id);
        const res = await api(`/files/${fileKey}/nodes?ids=${encodeURIComponent(batch.join(","))}`);
        for (const id of batch) { const d = res.nodes[id] && res.nodes[id].document; if (d) page.links.push(...collectLinks(d, ids)); }
      }
      console.log(`  ${p.name}: ${frames.length} frames, ${page.flows.length} flows, ${page.links.length} links`);
    }
    if (/cover/i.test(p.name)) {
      const c = page.nodes.find(n => /1600/.test(n.name)) || page.nodes.find(n => n.type === "frame");
      if (c) manifest.cover = `cases/${slug}/${c.img}@1x.webp`;
    }
  }

  // Export images, grouped by scale (the images endpoint takes one scale per request).
  const todo = [];
  for (const n of jobs) {
    const done = await exists(path.join(OUT, n.img + "@1x.webp"));
    if (FORCE || !sameVersion || !done) todo.push(n);
  }
  console.log(`→ images: ${todo.length} to export, ${jobs.length - todo.length} up to date`);
  const byScale = new Map();
  for (const n of todo) { const k = n.scale.toFixed(2); if (!byScale.has(k)) byScale.set(k, []); byScale.get(k).push(n); }

  let doneCount = 0;
  for (const [s, list] of byScale) {
    for (let i = 0; i < list.length; i += 40) {
      const batch = list.slice(i, i + 40);
      const res = await api(`/images/${fileKey}?ids=${encodeURIComponent(batch.map(n => n.id).join(","))}&scale=${s}&format=png&use_absolute_bounds=true`);
      if (res.err) throw new Error("Figma images error: " + res.err);
      await pool(batch, 6, async n => {
        const url = res.images[n.id];
        if (!url) { console.warn(`  no image for ${n.id} ${n.name}`); return; }
        const png = await download(url);
        const file = path.join(OUT, n.img);
        if (n.scale >= 2) {
          await sharp(png).webp({ quality: 82 }).toFile(file + "@2x.webp");
          await sharp(png).resize({ width: Math.max(1, n.w) }).webp({ quality: 82 }).toFile(file + "@1x.webp");
        } else {
          await sharp(png).webp({ quality: 82 }).toFile(file + "@1x.webp");
        }
        doneCount++;
        if (doneCount % 20 === 0) console.log(`  ${doneCount}/${todo.length}`);
      });
    }
  }

  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  const pages = manifest.pages.filter(p => p.nodes);
  console.log(`✓ ${slug}: ${pages.length} pages, ${pages.reduce((a, p) => a + p.nodes.length, 0)} nodes, ${doneCount} images exported`);
  if (manifest.cover) console.log(`  cover: ${manifest.cover}  (set it in portfolio/cases.js)`);
}

main().catch(e => { console.error("✗ " + e.message); process.exit(1); });
