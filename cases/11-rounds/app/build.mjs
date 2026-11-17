#!/usr/bin/env node
// Builds app/journeys.json for the Rounds prototype from the Figma "Case presentation" page:
//   journeys J1..J3 = slide sequences; each slide's phone shows a product screen (matched by image similarity and
//   verified by eye; see SCREENS) and one prototype hotspot (the control to tap) mapped from slide to screen coordinates.
// Run from the repo root:  node cases/11-rounds/app/build.mjs   (needs .cache/<fileKey>.json from tools/figma-to-html.mjs)
import { readFile, writeFile } from "node:fs/promises";
const KEY = "WJLm1lMxLmretjcMmGhqRy";
const file = JSON.parse(await readFile(`.cache/${KEY}.json`, "utf8"));
const man = JSON.parse(await readFile("cases/11-rounds/manifest.json", "utf8"));
const raw = new Map(); (function w(n) { raw.set(n.id, n); (n.children || []).forEach(w); })(file.document);
const pres = man.pages.find(p => p.links);
const nodeById = new Map(man.pages.flatMap(p => p.nodes || []).map(n => [n.id, n]));

// slide step → product screen frame (J1-2, J1-3, J2-2 are long scrolling screens whose top is shown in the slide)
const SCREENS = {
  "J1·1": "15:191", "J1·2": "17:3", "J1·3": "17:182", "J1·4": "18:3", "J1·5": "18:312",
  "J2·1": "20:484", "J2·2": "20:626", "J2·3": "113:1259", "J2·4": "20:771", "J2·5": "21:3", "J2·6": "22:3",
  "J3·1": "26:3", "J3·2": "26:104", "J3·3": "118:691", "J3·4": "26:227", "J3·5": "118:762"
};
const safe = id => id.replace(/[^a-zA-Z0-9]+/g, "-");
const texts = r => { const t = []; (function w(n) { if (n.visible === false) return; if (n.type === "TEXT") t.push({ s: n.style.fontSize, c: n.characters, b: n.absoluteBoundingBox }); (n.children || []).forEach(w); })(r); return t; };

const slides = pres.nodes.filter(n => /^J\d · \d\/\d/.test(n.name));
const journeys = {};
for (const sl of slides) {
  const [, j, step, total] = sl.name.match(/^J(\d) · (\d)\/(\d)/);
  const key = `J${j}·${step}`;
  const r = raw.get(sl.id), o = r.absoluteBoundingBox, T = texts(r);
  let disp; (function w(n) { if (n.name === "Display") disp = n; (n.children || []).forEach(w); })(r);
  const db = disp.absoluteBoundingBox, k = 402 / db.width;
  const screen = nodeById.get(SCREENS[key]);
  const hot = pres.links.find(l => l.from === sl.id && l.label === "Hotspot");
  const nextLink = hot ? hot.to : null;
  const rect = hot ? [Math.round((hot.rect[0] + o.x - db.x) * k), Math.round((hot.rect[1] + o.y - db.y) * k), Math.round(hot.rect[2] * k), Math.round(hot.rect[3] * k)] : null;
  const metricBig = T.find(t => t.s === 22 && /→/.test(t.c));
  const j0 = journeys[j] ||= { id: "j" + j, name: "", steps: [] };
  j0.steps.push({
    n: +step, total: +total, slide: sl.id,
    kicker: T.find(t => t.s === 12 && t.b.y - o.y < 210 && t.b.x - o.x < 150)?.c || "",
    headline: T.find(t => t.s === 48)?.c || "",
    body: T.find(t => t.s === 22 && t.c.length > 40)?.c || "",
    metric: metricBig ? { big: metricBig.c, small: T.find(t => t.s === 14 && Math.abs(t.b.y - metricBig.b.y) < 12 && t.b.x > metricBig.b.x)?.c || "" } : null,
    screen: screen.id, name: screen.name, html: "../" + screen.html, w: screen.w, h: screen.h,
    hotspot: rect,
    next: nextLink && nodeById.get(nextLink) && /^J/.test(nodeById.get(nextLink).name) ? slides.find(s => s.id === nextLink) && `J${nodeById.get(nextLink).name.match(/^J(\d) · (\d)/)[1]}·${nodeById.get(nextLink).name.match(/^J(\d) · (\d)/)[2]}` : null
  });
}
const out = Object.values(journeys).map(j => { j.steps.sort((a, b) => a.n - b.n); j.name = j.steps[0].kicker; return j; });
await writeFile("cases/11-rounds/app/journeys.json", JSON.stringify(out, null, 1) + "\n");
console.log(out.map(j => `${j.id} ${j.name}: ${j.steps.length} steps, hotspots ${j.steps.filter(s => s.hotspot).length}, ends ${j.steps.filter(s => !s.next).length}`).join("\n"));
console.log(out[0].steps[1]);
