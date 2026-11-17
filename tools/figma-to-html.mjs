#!/usr/bin/env node
// Figma → live HTML. Converts every manifest node of a case into a self-contained HTML document
//   cases/<slug>/frames/<id>.html     DOM text, CSS boxes, inline SVG for vectors
//   cases/<slug>/frames/assets/*.webp image fills only (photos)
//   cases/<slug>/fonts/               woff2 files + fonts.css (see tools/fetch-fonts.mjs)
// and sets `html` on the node in manifest.json. No LLM tokens: it is a deterministic converter.
//
// Usage: node tools/figma-to-html.mjs <slug> <fileKey> [--only id1,id2] [--refetch]
// Needs: npm i, a prior `figma-sync.mjs` run (manifest.json), api.figma.com access.
// Geometry comes from absoluteBoundingBox (auto-layout is flattened to absolute boxes: pixel-exact, not responsive).

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());

const [slug, fileKey, ...rest] = process.argv.slice(2);
if (!slug || !fileKey) { console.error("Usage: node tools/figma-to-html.mjs <slug> <fileKey> [--only ids] [--refetch]"); process.exit(1); }
const REFETCH = rest.includes("--refetch");
const only = (() => { const i = rest.indexOf("--only"); return i >= 0 ? new Set(rest[i + 1].split(",")) : null; })();

const API = "https://api.figma.com/v1";
const TOKEN = process.env.FIGMA_TOKEN || "injected-by-proxy";
const OUT = path.resolve("cases", slug);
const FR = path.join(OUT, "frames");
const AS = path.join(FR, "assets");
const CACHE = path.resolve(".cache");
const safe = id => id.replace(/[^a-zA-Z0-9]+/g, "-");
const exists = p => access(p).then(() => true, () => false);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(API + url, { headers: { "X-Figma-Token": TOKEN } });
    if (res.status === 429 || res.status >= 500) { await sleep(2 ** i * 5000); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  }
  throw new Error("retries: " + url);
}

// ---------- load file ----------
await mkdir(CACHE, { recursive: true });
const cacheFile = path.join(CACHE, fileKey + ".json");
let file;
if (!REFETCH && await exists(cacheFile)) file = JSON.parse(await readFile(cacheFile, "utf8"));
else {
  console.log("→ fetching file (geometry=paths)…");
  const buf = Buffer.from(await (await api(`/files/${fileKey}?geometry=paths`)).arrayBuffer());
  await writeFile(cacheFile, buf);
  file = JSON.parse(buf.toString("utf8"));
}
const byId = new Map();
(function idx(n) { byId.set(n.id, n); (n.children || []).forEach(idx); })(file.document);

const manifestPath = path.join(OUT, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestIds = new Set();
for (const p of manifest.pages) for (const n of p.nodes || []) if (n.type !== "text") manifestIds.add(n.id);

// ---------- image fills ----------
const imgRefs = new Set();
function scanRefs(n) {
  for (const p of n.fills || []) if (p.type === "IMAGE" && p.imageRef && p.visible !== false) imgRefs.add(p.imageRef);
  (n.children || []).forEach(scanRefs);
}
for (const id of manifestIds) { const n = byId.get(id); if (n) scanRefs(n); }
await mkdir(AS, { recursive: true });
const refName = r => r.slice(0, 16) + ".webp";
if (imgRefs.size) {
  const need = [];
  for (const r of imgRefs) if (!(await exists(path.join(AS, refName(r))))) need.push(r);
  if (need.length) {
    console.log(`→ ${need.length} image fills to download`);
    const urls = (await (await api(`/files/${fileKey}/images`)).json()).meta.images;
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < need.length) {
        const r = need[i++];
        if (!urls[r]) { console.warn("  no url for imageRef", r); continue; }
        for (let t = 0; t < 4; t++) {
          const res = await fetch(urls[r]);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            await sharp(buf).resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(AS, refName(r)));
            break;
          }
          await sleep(2 ** t * 1000);
        }
      }
    }));
  }
}

// ---------- SF Symbols (private-use glyphs): export one SVG per unique glyph|size|weight ----------
const PUA = /[\uE000-\uF8FF]|[\u{F0000}-\u{10FFFF}]/u;
const glyphKey = n => `${n.characters.codePointAt(0).toString(16)}-${n.style.fontSize}-${n.style.fontWeight}`;
const glyphSvg = new Map();
{
  const reps = new Map();
  (function scan(n) {
    if (n.visible === false) return;
    if (n.type === "TEXT" && n.characters && PUA.test(n.characters) && !reps.has(glyphKey(n))) reps.set(glyphKey(n), n.id);
    (n.children || []).forEach(scan);
  })({ children: [...manifestIds].map(i => byId.get(i)).filter(Boolean) });
  if (reps.size) {
    const ids = [...reps.values()];
    const urls = (await (await api(`/images/${fileKey}?ids=${encodeURIComponent(ids.join(","))}&format=svg&svg_outline_text=true&svg_include_id=false`)).json()).images;
    for (const [k, id] of reps) {
      if (!urls[id]) { console.warn("  no svg for glyph", k); continue; }
      let svg = await (await fetch(urls[id])).text();
      svg = svg.replace(/<\?xml[^>]*>/, "").replace(/ (width|height)="[^"]*"/g, "").replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"').replace("<svg", '<svg width="100%" height="100%" aria-hidden="true"');
      glyphSvg.set(k, svg.trim());
    }
    console.log(`→ ${glyphSvg.size} SF Symbol glyphs exported as SVG`);
  }
}

// ---------- helpers ----------
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = v => +(+v).toFixed(2);
const rgba = (c, o = 1) => {
  const a = num((c.a ?? 1) * o);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};
const visible = arr => (arr || []).filter(p => p.visible !== false && (p.opacity ?? 1) > 0);

function gradientCSS(p, w, h) {
  const [h0, h1] = p.gradientHandlePositions;
  const dx = (h1.x - h0.x) * w, dy = (h1.y - h0.y) * h;
  const ang = Math.atan2(dx, -dy);
  const L = Math.abs(w * Math.sin(ang)) + Math.abs(h * Math.cos(ang)) || 1;
  const ux = Math.sin(ang), uy = -Math.cos(ang);
  const pos = pt => 0.5 + ((pt.x * w - w / 2) * ux + (pt.y * h - h / 2) * uy) / L;
  const s0 = pos(h0), s1 = pos(h1);
  const stops = p.gradientStops.map(s => `${rgba(s.color, p.opacity ?? 1)} ${num((s0 + s.position * (s1 - s0)) * 100)}%`);
  return `linear-gradient(${num(ang * 180 / Math.PI)}deg,${stops.join(",")})`;
}

function backgrounds(n, w, h) {
  const layers = [];
  const sizes = [], pos = [], rep = [];
  for (const p of visible(n.fills).reverse()) {   // CSS: first layer = top
    if (p.type === "SOLID") { const c = rgba(p.color, (p.opacity ?? 1)); layers.push(`linear-gradient(${c},${c})`); }
    else if (p.type === "GRADIENT_LINEAR") layers.push(gradientCSS(p, w, h));
    else if (p.type === "IMAGE" && p.imageRef) {
      layers.push(`url(assets/${refName(p.imageRef)})`);
      if (p.scaleMode === "FIT") { sizes.push("contain"); pos.push("center"); rep.push("no-repeat"); }
      else if (p.scaleMode === "TILE") { sizes.push("auto"); pos.push("0 0"); rep.push("repeat"); }
      else if (p.scaleMode === "STRETCH") { sizes.push("100% 100%"); pos.push("center"); rep.push("no-repeat"); }
      else { sizes.push("cover"); pos.push("center"); rep.push("no-repeat"); }
      continue;
    } else continue;
    sizes.push("auto"); pos.push("0 0"); rep.push("no-repeat");
  }
  if (!layers.length) return "";
  return `background-image:${layers.join(",")};background-size:${sizes.join(",")};background-position:${pos.join(",")};background-repeat:${rep.join(",")};`;
}

function radius(n) {
  if (n.type === "ELLIPSE") return "border-radius:50%;";
  const r = n.rectangleCornerRadii;
  if (r && new Set(r).size > 1) return `border-radius:${r.map(v => num(v) + "px").join(" ")};`;
  const v = n.cornerRadius || (r && r[0]) || 0;
  return v ? `border-radius:${num(v)}px;` : "";
}

function strokesAndShadows(n, vector) {
  let css = "";
  const shadows = [];
  const st = visible(n.strokes).find(p => p.type === "SOLID");
  if (st && !vector) {
    const col = rgba(st.color, st.opacity ?? 1);
    const dashed = n.strokeDashes && n.strokeDashes.length;
    const iw = n.individualStrokeWeights;
    if (dashed || iw) {
      const wt = iw ? [iw.top, iw.right, iw.bottom, iw.left] : [n.strokeWeight, n.strokeWeight, n.strokeWeight, n.strokeWeight];
      css += `border-style:${dashed ? "dashed" : "solid"};border-color:${col};border-width:${wt.map(v => num(v || 0) + "px").join(" ")};`;
    } else {
      const w = n.strokeWeight || 0;
      if (n.strokeAlign === "OUTSIDE") shadows.push(`0 0 0 ${num(w)}px ${col}`);
      else if (n.strokeAlign === "CENTER") { shadows.push(`0 0 0 ${num(w / 2)}px ${col}`); shadows.push(`inset 0 0 0 ${num(w / 2)}px ${col}`); }
      else shadows.push(`inset 0 0 0 ${num(w)}px ${col}`);
    }
  }
  let filter = "", backdrop = "";
  for (const e of n.effects || []) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW" && !vector) shadows.push(`${num(e.offset.x)}px ${num(e.offset.y)}px ${num(e.radius)}px ${num(e.spread || 0)}px ${rgba(e.color)}`);
    else if (e.type === "DROP_SHADOW") filter += ` drop-shadow(${num(e.offset.x)}px ${num(e.offset.y)}px ${num(e.radius)}px ${rgba(e.color)})`;
    else if (e.type === "INNER_SHADOW") shadows.push(`inset ${num(e.offset.x)}px ${num(e.offset.y)}px ${num(e.radius)}px ${num(e.spread || 0)}px ${rgba(e.color)}`);
    else if (e.type === "LAYER_BLUR") filter += ` blur(${num(e.radius / 2)}px)`;
    else if (e.type === "BACKGROUND_BLUR") backdrop = `blur(${num(e.radius / 2)}px)`;
    else if (e.type === "GLASS") backdrop = "blur(12px) saturate(1.4)";
  }
  if (shadows.length) css += `box-shadow:${shadows.join(",")};`;
  if (filter) css += `filter:${filter.trim()};`;
  if (backdrop) css += `backdrop-filter:${backdrop};-webkit-backdrop-filter:${backdrop};`;
  return css;
}

const BLEND = { MULTIPLY: "multiply", SCREEN: "screen", OVERLAY: "overlay", DARKEN: "darken", LIGHTEN: "lighten", COLOR_DODGE: "color-dodge", COLOR_BURN: "color-burn", LINEAR_BURN: "multiply", LINEAR_DODGE: "plus-lighter", HARD_LIGHT: "hard-light", SOFT_LIGHT: "soft-light", DIFFERENCE: "difference", EXCLUSION: "exclusion", HUE: "hue", SATURATION: "saturation", COLOR: "color", LUMINOSITY: "luminosity" };
function common(n, box, parentBox) {
  let css = `left:${num(box.x - parentBox.x)}px;top:${num(box.y - parentBox.y)}px;width:${num(box.width)}px;height:${num(box.height)}px;`;
  if (n.opacity !== undefined && n.opacity < 1) css += `opacity:${num(n.opacity)};`;
  if (BLEND[n.blendMode]) css += `mix-blend-mode:${BLEND[n.blendMode]};`;
  return css;
}

// ---------- text ----------
const FAMILY = { "SF Pro": "'SF Pro',Inter,system-ui,sans-serif" };
function textStyle(s, base) {
  let css = "";
  const get = k => (s[k] !== undefined ? s[k] : base[k]);
  const fam = get("fontFamily");
  css += `font-family:${FAMILY[fam] || `'${fam}',system-ui,sans-serif`};font-weight:${get("fontWeight")};font-size:${get("fontSize")}px;`;
  const lh = get("lineHeightPx"); if (lh) css += `line-height:${num(lh)}px;`;
  const ls = get("letterSpacing"); css += `letter-spacing:${num(ls || 0)}px;`;
  const tc = get("textCase"); if (tc === "UPPER") css += "text-transform:uppercase;"; else if (tc === "LOWER") css += "text-transform:lowercase;"; else if (tc === "TITLE") css += "text-transform:capitalize;";
  const td = get("textDecoration"); if (td === "UNDERLINE") css += "text-decoration:underline;"; else if (td === "STRIKETHROUGH") css += "text-decoration:line-through;";
  return css;
}
function paintColor(fills) {
  const p = visible(fills).find(f => f.type === "SOLID");
  return p ? rgba(p.color, p.opacity ?? 1) : null;
}
function textHTML(n, box, parentBox) {
  const st = n.style || {};
  if (n.characters && PUA.test(n.characters) && glyphSvg.has(glyphKey(n))) {
    return `<div class="n t" style="${common(n, box, parentBox)}color:${paintColor(n.fills) || "#000"}">${glyphSvg.get(glyphKey(n))}</div>`;
  }
  const chars = n.characters || "";
  const ov = n.characterStyleOverrides || [];
  const table = n.styleOverrideTable || {};
  const baseColor = paintColor(n.fills) || "#000";
  const runs = [];
  let cur = null;
  for (let i = 0; i < chars.length; i++) {
    const k = ov[i] || 0;
    if (cur && cur.k === k) cur.t += chars[i]; else { cur = { k, t: chars[i] }; runs.push(cur); }
  }
  const inner = runs.map(r => {
    const t = esc(r.t).replace(/[\u2028\n]/g, "<br>");
    if (!r.k) return t;
    const o = table[r.k] || {};
    const col = o.fills ? paintColor(o.fills) : null;
    return `<span style="${textStyle(o, st)}${col ? `color:${col};` : ""}">${t}</span>`;
  }).join("");
  const h = st.textAlignHorizontal || "LEFT", v = st.textAlignVertical || "TOP";
  const jc = h === "CENTER" ? "center" : h === "RIGHT" ? "flex-end" : "flex-start";
  const ai = v === "CENTER" ? "center" : v === "BOTTOM" ? "flex-end" : "flex-start";
  const ta = h === "CENTER" ? "center" : h === "RIGHT" ? "right" : h === "JUSTIFIED" ? "justify" : "left";
  const auto = st.textAutoResize === "WIDTH_AND_HEIGHT";
  const trunc = st.textAutoResize === "TRUNCATE";
  let css = `${common(n, box, parentBox)}display:flex;align-items:${ai};color:${baseColor};${textStyle(st, st)}`;
  if (auto) css += `justify-content:${jc};white-space:pre;`;
  else if (trunc) css += `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
  else css += `text-align:${ta};white-space:pre-wrap;overflow-wrap:break-word;`;
  const wrapper = auto || trunc ? inner : `<div style="width:100%">${inner}</div>`;
  return `<div class="n t" style="${css}">${wrapper}</div>`;
}

// ---------- vectors ----------
let gid = 0;
function vectorHTML(n, box, parentBox) {
  const w = box.width, h = box.height;
  const defs = [];
  const paths = [];
  const paintFor = (p) => {
    if (p.type === "SOLID") return { fill: rgba(p.color, p.opacity ?? 1) };
    if (p.type === "GRADIENT_LINEAR") {
      const id = "g" + (++gid);
      const [a, b] = p.gradientHandlePositions;
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(a.x * w)}" y1="${num(a.y * h)}" x2="${num(b.x * w)}" y2="${num(b.y * h)}">${p.gradientStops.map(s => `<stop offset="${num(s.position)}" stop-color="${rgba({ ...s.color, a: 1 })}" stop-opacity="${num((s.color.a ?? 1) * (p.opacity ?? 1))}"/>`).join("")}</linearGradient>`);
      return { fill: `url(#${id})` };
    }
    return null;
  };
  const fp = visible(n.fills).map(paintFor).filter(Boolean);
  for (const f of fp) for (const g of n.fillGeometry || []) paths.push(`<path d="${g.path}" fill="${f.fill}"${g.windingRule === "EVENODD" ? ' fill-rule="evenodd"' : ""}/>`);
  const sp = visible(n.strokes).map(paintFor).filter(Boolean);
  for (const f of sp) for (const g of n.strokeGeometry || []) paths.push(`<path d="${g.path}" fill="${f.fill}"${g.windingRule === "EVENODD" ? ' fill-rule="evenodd"' : ""}/>`);
  if (!paths.length) return "";
  const css = common(n, box, parentBox) + strokesAndShadows(n, true);
  return `<svg class="n" style="${css}overflow:visible" width="${num(w)}" height="${num(h)}" viewBox="0 0 ${num(w)} ${num(h)}" aria-hidden="true">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${paths.join("")}</svg>`;
}

// ---------- tree ----------
function render(n, parentBox, rootId, depth = 0) {
  if (n.visible === false || n.opacity === 0) return "";
  const box = n.absoluteBoundingBox;
  if (!box) return "";
  if (n.type === "TEXT") return textHTML(n, box, parentBox);
  if (n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION" || n.type === "STAR" || n.type === "POLYGON" || n.type === "LINE") return vectorHTML(n, box, parentBox);
  const kids = (n.children || []).filter(c => !(manifestIds.has(c.id) && c.id !== rootId)).map(c => render(c, box, rootId, depth + 1)).join("");
  let css = common(n, box, parentBox);
  css += backgrounds(n, box.width, box.height) + radius(n) + strokesAndShadows(n, false);
  if (n.clipsContent) css += "overflow:hidden;";
  const nm = ["FRAME", "INSTANCE", "COMPONENT", "SECTION"].includes(n.type) && depth < 4 ? ` data-name="${esc(n.name).replace(/"/g, "&quot;")}"` : "";
  return `<div class="n" data-id="${n.id}"${nm} style="${css}">${kids}</div>`;
}

const todo = [...manifestIds].filter(id => byId.has(id) && (!only || only.has(id)));
await mkdir(FR, { recursive: true });
let done = 0, bytes = 0;
for (const id of todo) {
  const n = byId.get(id), b = n.absoluteBoundingBox;
  if (!b) continue;
  const root = { ...n }; // root drawn at 0,0 — parent box = own box
  const body = render(root, b, id);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${Math.round(b.width)}">
<title>${esc(n.name)}</title>
<link rel="stylesheet" href="../fonts/fonts.css">
<style>html,body{margin:0;padding:0;background:transparent}body{width:${Math.round(b.width)}px;height:${Math.round(b.height)}px;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}.n{position:absolute;box-sizing:border-box}.t{margin:0}</style>
</head><body>
${body.replace(/^<div class="n"/, '<div class="n" role="group"').replace(/style="left:[^;]*;top:[^;]*;/, 'style="left:0;top:0;')}
</body></html>
`;
  await writeFile(path.join(FR, safe(id) + ".html"), html);
  bytes += html.length; done++;
}
for (const p of manifest.pages) for (const n of p.nodes || []) if (n.type !== "text" && byId.has(n.id) && (!only || only.has(n.id))) n.html = "frames/" + safe(n.id) + ".html";
await writeFile(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(`✓ ${slug}: ${done} frames → frames/*.html (${(bytes / 1e6).toFixed(1)} MB), ${imgRefs.size} image fills`);
