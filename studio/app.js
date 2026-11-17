// Case Studio entry: loads cases/<slug>/manifest.json and wires sidebar, canvas, presenter and URL state.
// URL: studio/?case=<slug>&page=<pageId>&node=<nodeId>   ·   #present/<nodeId> opens the presentation.
import { Canvas, isTyping } from "./canvas.js";
import { Presenter } from "./present.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const slug = params.get("case");
const base = `../cases/${slug}/`;

const canvas = new Canvas($("canvas"), $("world"), $("overlay"), {
  onChange: v => { $("zoomLabel").textContent = Math.round(v.z * 100) + "%"; saveView(); },
  onSelect: id => { markFrame(id); saveUrl(); }
});
const presenter = new Presenter({ onClose: id => { if (state.page && state.page.kind === "presentation" && id) canvas.focus(id, 1); $("canvas").focus(); } });

const state = { manifest: null, page: null };

init().catch(err => {
  $("caseTitle").textContent = "Case not found";
  showEmpty(`Could not load ${base}manifest.json — ${err.message}`);
});

async function init() {
  if (!slug || !/^[\w-]+$/.test(slug)) throw new Error("missing ?case=");
  const res = await fetch(base + "manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const m = await res.json();
  state.manifest = m;
  document.title = m.title + " · Case Studio";
  $("caseTitle").textContent = m.title;
  if (m.source && m.source.fileKey) {
    $("figmaBtn").hidden = false;
    if (m.app) { $("protoBtn").hidden = false; $("protoBtn").href = "../cases/" + slug + "/" + m.app; }
    $("figmaBtn").href = "https://www.figma.com/design/" + m.source.fileKey;
  }
  const pres = m.pages.find(p => p.kind === "presentation");
  $("presentBtn").hidden = !pres;
  $("presentBtn").onclick = () => startPresentation();
  $("fitBtn").onclick = () => canvas.fit();
  renderPages();
  const first = m.pages.find(p => p.id === params.get("page")) || m.pages.find(p => p.kind !== "divider");
  openPage(first, { node: params.get("node"), view: params.get("v") });
  const hash = location.hash.match(/^#present\/(.+)$/);
  if (hash && pres) startPresentation(decodeURIComponent(hash[1]));
}

function renderPages() {
  const nav = $("pages");
  nav.replaceChildren();
  for (const p of state.manifest.pages) {
    if (p.kind === "divider") { const d = document.createElement("div"); d.className = "st-divider"; d.setAttribute("role", "separator"); nav.appendChild(d); continue; }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "st-page";
    b.textContent = p.name;
    b.dataset.page = p.id;
    b.onclick = () => openPage(p);
    nav.appendChild(b);
  }
}

function openPage(p, { node, view } = {}) {
  if (!p) return;
  state.page = p;
  $("pageTitle").textContent = p.name;
  document.querySelectorAll(".st-page").forEach(b => b.dataset.page === p.id ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  const nodes = p.nodes || [];
  canvas.load(nodes, base);
  renderFrames(nodes);
  showEmpty(!p.nodes ? "Not synced yet. Run: node tools/figma-sync.mjs " + slug + " " + ((state.manifest.source || {}).fileKey || "<fileKey>") : nodes.length ? "" : "This page is empty.");
  const v = view && view.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite)) canvas.setView(v[0], v[1], v[2]);
  else if (node && canvas.byId.has(node)) canvas.focus(node, 1);
  else canvas.fit();
  if (node) canvas.select(node);
  saveUrl();
}

function renderFrames(nodes) {
  const ul = $("frames");
  ul.replaceChildren();
  const list = nodes.filter(n => n.type !== "text" || n.fontSize >= 24 || n.h >= 32);
  $("frameCount").textContent = "· " + list.filter(n => n.type !== "text").length;
  for (const n of list) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "st-frame" + (n.type === "text" ? " is-text" : "") + (n.parent ? " is-child" : "");
    b.textContent = n.name;
    b.title = n.name;
    b.dataset.id = n.id;
    b.setAttribute("aria-selected", "false");
    b.onclick = () => canvas.focus(n.id, 1);
    li.appendChild(b);
    ul.appendChild(li);
  }
}

function markFrame(id) {
  document.querySelectorAll(".st-frame").forEach(b => {
    const on = b.dataset.id === id;
    b.setAttribute("aria-selected", String(on));
    if (on) b.scrollIntoView({ block: "nearest" });
  });
  const key = state.manifest && state.manifest.source && state.manifest.source.fileKey;
  if (key) $("figmaBtn").href = "https://www.figma.com/design/" + key + (id ? "?node-id=" + id.replace(":", "-") : "");
}

function startPresentation(nodeId) {
  const p = state.manifest.pages.find(x => x.kind === "presentation");
  if (!p) return;
  if (!nodeId && state.page === p && canvas.selected) nodeId = canvas.selected;
  presenter.open(p, base, nodeId);
}

function showEmpty(msg) { $("empty").hidden = !msg; $("empty").textContent = msg; }

let urlT = 0;
function saveView() { clearTimeout(urlT); urlT = setTimeout(saveUrl, 300); }
function saveUrl() {
  if (!state.page) return;
  const q = new URLSearchParams({ case: slug, page: state.page.id });
  if (canvas.selected) q.set("node", canvas.selected);
  const v = canvas.view;
  q.set("v", [Math.round(v.x), Math.round(v.y), +v.z.toFixed(4)].join(","));
  history.replaceState(null, "", "?" + q.toString() + location.hash);
}

window.addEventListener("keydown", e => {
  if (isTyping(e) || !presenter.el.hidden || !state.manifest) return;
  const k = e.key;
  if (e.shiftKey && (e.code === "Digit1")) { e.preventDefault(); canvas.fit(); }
  else if (e.shiftKey && (e.code === "Digit2")) { e.preventDefault(); canvas.zoomToSelection(); }
  else if (e.shiftKey && (e.code === "Digit0")) { e.preventDefault(); canvas.zoomBy(1 / canvas.view.z); }
  else if ((k === "+" || k === "=") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); canvas.zoomBy(1.25); }
  else if (k === "-" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); canvas.zoomBy(0.8); }
  else if (k === "Escape") canvas.select(null);
  else if (k === "PageDown" || k === "PageUp") {
    e.preventDefault();
    const pages = state.manifest.pages.filter(p => p.kind !== "divider");
    const i = pages.indexOf(state.page) + (k === "PageDown" ? 1 : -1);
    if (pages[i]) openPage(pages[i]);
  } else if (k === "Enter" && e.altKey) { e.preventDefault(); startPresentation(); }
});
