// Rounds clickable prototype = the Figma "Case presentation" slides, played literally.
//  • each slide is its converted HTML (../frames/<id>.html) scaled to fit; the Atmosphere layer is cloned onto the whole page
//  • the raster phone screen on the slide is replaced by the live product screen (screens.json)
//  • hotspots are the Figma prototype links (../manifest.json), so tabs, Back/Next and the outlined control all work
const [man, S] = await Promise.all([fetch("../manifest.json").then(r => r.json()), fetch("screens.json").then(r => r.json())]);
const pres = man.pages.find(p => p.links);
const nodes = new Map(pres.nodes.map(n => [n.id, n]));
const stage = document.getElementById("stage"), bg = document.getElementById("bg"), live = document.getElementById("live");
const FIGMA = "https://www.figma.com/design/" + S.fileKey;
const W = 1920, H = 1080, BAR = 110;
let cur = null, history_ = [], bgDone = false, hintT = 0;

function fit() {
  const vw = innerWidth, vh = innerHeight, k = Math.min(vw / W, vh / H);
  stage.style.transform = `translate(${(vw - W * k) / 2}px,${(vh - H * k) / 2}px) scale(${k})`;
  const b = bg.firstElementChild; if (b) b.style.transform = `scale(${vw / W},${vh / H})`;
}
addEventListener("resize", fit);

function setBackground(doc) {
  if (bgDone) return;
  const atm = doc.querySelector('[data-name="Atmosphere"]');
  if (!atm) return;
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
  const c = atm.cloneNode(true); c.style.left = "0"; c.style.top = "0";
  wrap.append(c); bg.replaceChildren(wrap); bgDone = true; fit();
}

function injectScreen(doc, sc, hot) {
  const host = doc.querySelector(`[data-id="${CSS.escape(sc.rectId)}"]`);
  if (!host) return;
  const k = sc.box[2] / sc.w;
  host.style.backgroundImage = "none"; host.style.overflow = "hidden";
  const f = doc.createElement("iframe");
  f.src = new URL(sc.html, location.href.replace(/app\/.*$/, "")).href;
  f.title = sc.name; if (sc.preview) f.setAttribute("tabindex", "-1");
  f.style.cssText = `position:absolute;left:0;top:0;width:${sc.w}px;height:${sc.h > 874 ? 874 : sc.h}px;border:0;transform:scale(${k});transform-origin:0 0;background:#F2F3F1;${sc.preview ? "pointer-events:none;" : ""}`;
  if (sc.h > 874 && !sc.preview) f.style.height = (sc.box[3] / k) + "px";
  f.addEventListener("load", () => {
    const d = f.contentDocument, w = f.contentWindow; if (!d) return;
    const st = d.createElement("style");
    st.textContent = `html{overflow-y:auto;scrollbar-width:none}html::-webkit-scrollbar{display:none}body{overflow:visible!important}[data-name="Action bar"]{position:fixed!important;top:auto!important;bottom:0!important}`;
    d.head.append(st);
    d.addEventListener("click", flash);
    if (hot && hot.dataset.fixed !== "1") w.addEventListener("scroll", () => { hot.style.transform = `translateY(${-w.scrollY * k}px)`; });
  });
  host.append(f);
}

function flash() { stage.classList.add("hint"); clearTimeout(hintT); hintT = setTimeout(() => stage.classList.remove("hint"), 600); }

function show(id, push = true) {
  const sl = S.slides[id], node = nodes.get(id); if (!sl || !node) return;
  if (push && cur) history_.push(cur);
  cur = id;
  history.replaceState(null, "", "#" + id);
  document.title = node.name.replace(/^J\d · /, "") + " · Rounds prototype";
  live.textContent = node.name;
  const old = stage.querySelector("iframe.slide"), oldHot = [...stage.querySelectorAll(".hot")];
  oldHot.forEach(h => h.remove());
  // hotspots from Figma prototype links
  const hotBtns = [];
  let mainHot = null;
  for (const l of pres.links.filter(l => l.from === id)) {
    const [x, y, w, h] = l.rect;
    if (w >= W - 2 && h >= H - 2) continue;                 // whole-slide link: handled by the keyboard
    const to = nodes.get(l.to);
    const b = Object.assign(document.createElement("button"), { type: "button", className: "hot" });
    b.setAttribute("aria-label", `${l.label.replace(/^Tab · /, "")} → ${to ? to.name.replace(/^J\d · /, "") : ""}`);
    Object.assign(b.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    b.dataset.to = l.to; b.dataset.label = l.label;
    b.onclick = () => show(l.to);
    stage.append(b); hotBtns.push(b);
    if (l.label === "Hotspot") mainHot = b;
  }
  const sc0 = sl.screens.find(s => !s.preview);
  if (mainHot && sc0) { const d = sc0.display; mainHot.dataset.fixed = (+mainHot.style.top.slice(0, -2) + parseFloat(mainHot.style.height) - d[1]) > d[3] - BAR ? "1" : "0"; }
  if (sl.open && sc0) {
    const a = Object.assign(document.createElement("a"), { className: "hot", href: `${FIGMA}?node-id=${sc0.screenId.replace(":", "-")}`, target: "_blank", rel: "noopener" });
    a.setAttribute("aria-label", "Open this screen in the Figma file");
    Object.assign(a.style, { left: sl.open[0] + "px", top: sl.open[1] + "px", width: sl.open[2] + "px", height: sl.open[3] + "px", borderRadius: "4px" });
    stage.append(a);
  }
  // slide
  const f = document.createElement("iframe");
  f.className = "slide in"; f.title = node.name; f.src = "../" + sl.html;
  f.addEventListener("load", () => {
    const d = f.contentDocument; if (!d) return;
    setBackground(d);
    const atm = d.querySelector('[data-name="Atmosphere"]'); if (atm) atm.style.display = "none";
    for (const sc of sl.screens) injectScreen(d, sc, sc.preview ? null : mainHot);
    d.addEventListener("click", flash);
    requestAnimationFrame(() => f.classList.remove("in"));
    if (old) setTimeout(() => old.remove(), 260);
  });
  stage.prepend(f);
  fit();
}

const link = re => pres.links.find(l => l.from === cur && re.test(l.label || ""));
function next() { const l = link(/^(next|start|hotspot)/i) || link(/^card/i); if (l) show(l.to); else { const ids = Object.keys(S.slides), i = ids.indexOf(cur); if (i < ids.length - 1) show(ids[i + 1]); } }
function prev() { const l = link(/^back/i); if (l) { history_.pop(); show(l.to, false); } else if (history_.length) show(history_.pop(), false); }
addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight") { next(); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
  else if (e.key === "Escape") show(S.start);
});
document.addEventListener("click", e => { if (!e.target.closest(".hot")) flash(); });

fit();
const h = decodeURIComponent(location.hash.slice(1));
show(S.slides[h] ? h : S.start, false);
