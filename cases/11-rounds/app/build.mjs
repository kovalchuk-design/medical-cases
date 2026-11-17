#!/usr/bin/env node
// Builds app/screens.json: for every slide of the Figma "Case presentation" page, which raster "Screen" rectangle in the
// phone mockup is replaced by which live product screen (frames/<id>.html). Run from the repo root:
//   node cases/11-rounds/app/build.mjs        (needs .cache/<fileKey>.json from tools/figma-to-html.mjs)
// SCREENS was matched by image similarity (slide phone image vs. product frame render) and checked by eye.
import { readFile, writeFile } from "node:fs/promises";
const KEY = "WJLm1lMxLmretjcMmGhqRy";
const file = JSON.parse(await readFile(`.cache/${KEY}.json`, "utf8"));
const man = JSON.parse(await readFile("cases/11-rounds/manifest.json", "utf8"));
const raw = new Map(); (function w(n) { raw.set(n.id, n); (n.children || []).forEach(w); })(file.document);
const pres = man.pages.find(p => p.links);
const nodeById = new Map(man.pages.flatMap(p => p.nodes || []).map(n => [n.id, n]));
const SCREENS = {
  "J1·1": "15:191", "J1·2": "17:3", "J1·3": "17:182", "J1·4": "18:3", "J1·5": "18:312",
  "J2·1": "20:484", "J2·2": "20:626", "J2·3": "113:1259", "J2·4": "20:771", "J2·5": "21:3", "J2·6": "22:3",
  "J3·1": "26:3", "J3·2": "26:104", "J3·3": "118:691", "J3·4": "26:227", "J3·5": "118:762"
};
const rel = (n, o) => { const b = n.absoluteBoundingBox; return [b.x - o.x, b.y - o.y, b.width, b.height].map(v => +v.toFixed(2)); };
const screenInfo = id => { const n = nodeById.get(id); return { screenId: id, html: n.html, w: n.w, h: n.h, name: n.name }; };
const out = {};
for (const sl of pres.nodes.filter(n => n.type === "frame")) {
  const r = raw.get(sl.id), o = r.absoluteBoundingBox, list = [];
  const m = sl.name.match(/^J(\d) · (\d)/);
  if (m) {
    let disp; (function w(n) { if (n.name === "Display") disp = n; (n.children || []).forEach(w); })(r);
    const dx = disp.absoluteBoundingBox.x;
    const rect = disp.children.find(c => Math.abs(c.absoluteBoundingBox.x - dx) < 2);
    list.push({ rectId: rect.id, box: rel(rect, o), display: rel(disp, o), ...screenInfo(SCREENS[`J${m[1]}·${m[2]}`]), figma: true });
  } else if (/^Overview/.test(sl.name)) {
    for (const [k, j] of [["Discover", "J1·1"], ["Booking", "J2·1"], ["Messaging", "J3·1"]]) {
      let card; (function w(n) { if (n.name === "Card · " + k) card = n; (n.children || []).forEach(w); })(r);
      let rect; (function w(n) { if (n.name === "Screen preview") rect = n; (n.children || []).forEach(w); })(card);
      list.push({ rectId: rect.id, box: rel(rect, o), preview: true, ...screenInfo(SCREENS[j]) });
    }
  }
  let open = null; (function w(n) { if (n.type === "TEXT" && n.characters === "Open this screen in the file") open = rel(n, o); (n.children || []).forEach(w); })(r);
  out[sl.id] = { name: sl.name, html: sl.html, screens: list, open };
}
await writeFile("cases/11-rounds/app/screens.json", JSON.stringify({ fileKey: KEY, start: pres.nodes.find(n => /^Overview/.test(n.name)).id, slides: out }, null, 1) + "\n");
console.log(Object.keys(out).length, "slides;", Object.values(out).reduce((a, s) => a + s.screens.length, 0), "live screens");
