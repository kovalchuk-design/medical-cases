// Infinite canvas: pan / zoom, viewport culling, level-of-detail images, frame titles, selection.
// World coordinates come straight from Figma (absoluteBoundingBox), so the layout matches the file 1:1.

const MIN_Z = 0.02, MAX_Z = 4, MARGIN = 300;
const TITLED = new Set(["frame", "section", "component", "component_set", "instance", "group"]);

export class Canvas {
  constructor(root, world, overlay, { onChange = () => {}, onSelect = () => {} } = {}) {
    Object.assign(this, { root, world, overlay, onChange, onSelect });
    this.view = { x: 0, y: 0, z: 1 };
    this.items = [];
    this.byId = new Map();
    this.selected = null;
    this.raf = 0;
    this.selBox = document.createElement("div");
    this.selBox.className = "st-sel";
    this.selBox.hidden = true;
    this.overlay.appendChild(this.selBox);
    this.bindEvents();
    new ResizeObserver(() => this.schedule()).observe(root);
  }

  // ---------- content ----------
  load(nodes, base) {
    this.world.replaceChildren();
    this.overlay.replaceChildren(this.selBox);
    this.items = [];
    this.byId.clear();
    this.base = base;
    this.selected = null;
    this.selBox.hidden = true;
    for (const n of nodes) {
      const el = document.createElement("div");
      el.className = "st-node is-" + n.type;
      el.dataset.id = n.id;
      Object.assign(el.style, { left: n.x + "px", top: n.y + "px", width: n.w + "px", height: n.h + "px", display: "none" });
      if (n.type === "text" && !n.img) {
        el.textContent = n.text || n.name;
        el.style.fontSize = (n.fontSize || Math.round(n.h * 0.8)) + "px";
        el.style.lineHeight = n.h + "px";
      }
      if (n.bg) el.style.background = n.bg;
      this.world.appendChild(el);
      let title = null;
      if (!n.parent && TITLED.has(n.type)) {
        title = document.createElement("div");
        title.className = "st-title";
        title.textContent = n.name;
        title.dataset.id = n.id;
        title.hidden = true;
        this.overlay.appendChild(title);
      }
      const item = { n, el, title, visible: false, level: null };
      this.items.push(item);
      this.byId.set(n.id, item);
    }
    this.bounds = unionBounds(nodes);
  }

  // ---------- view ----------
  apply() {
    const { x, y, z } = this.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    this.schedule();
    this.onChange(this.view);
  }
  setView(x, y, z) { this.view = { x, y, z: clamp(z, MIN_Z, MAX_Z) }; this.apply(); }
  zoomAt(z, cx, cy) {
    const v = this.view, nz = clamp(z, MIN_Z, MAX_Z), k = nz / v.z;
    this.setView(cx - (cx - v.x) * k, cy - (cy - v.y) * k, nz);
  }
  zoomBy(f) { const r = this.root.getBoundingClientRect(); this.zoomAt(this.view.z * f, r.width / 2, r.height / 2); }
  fit(b = this.bounds, pad = 64, maxZ = 1) {
    if (!b || !b.w || !b.h) return;
    const W = this.root.clientWidth, H = this.root.clientHeight;
    const z = clamp(Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h, maxZ), MIN_Z, MAX_Z);
    this.setView((W - b.w * z) / 2 - b.x * z, (H - b.h * z) / 2 - b.y * z, z);
  }
  focus(id, maxZ = 2) { const it = this.byId.get(id); if (!it) return; this.select(id); this.fit(it.n, 48, maxZ); }
  zoomToSelection() { this.selected ? this.focus(this.selected) : this.fit(); }

  select(id) {
    this.selected = this.byId.has(id) ? id : null;
    for (const it of this.items) if (it.title) it.title.classList.toggle("is-selected", it.n.id === this.selected);
    this.schedule();
    this.onSelect(this.selected);
  }

  // ---------- render loop ----------
  schedule() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.update(); }); }
  update() {
    const { x, y, z } = this.view, W = this.root.clientWidth, H = this.root.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    for (const it of this.items) {
      const n = it.n, sx = n.x * z + x, sy = n.y * z + y, sw = n.w * z, sh = n.h * z;
      const vis = sx < W + MARGIN && sy < H + MARGIN && sx + sw > -MARGIN && sy + sh > -MARGIN && sw > 0.5;
      if (vis !== it.visible) { it.visible = vis; it.el.style.display = vis ? "" : "none"; }
      if (vis) this.media(it, z * dpr);
      if (it.title) {
        const show = vis && sw > 48;
        it.title.hidden = !show;
        if (show) Object.assign(it.title.style, { left: sx + "px", top: sy + "px", maxWidth: Math.max(sw, 40) + "px" });
      }
    }
    const s = this.selected && this.byId.get(this.selected);
    this.selBox.hidden = !s;
    if (s) {
      const n = s.n;
      Object.assign(this.selBox.style, { left: n.x * z + x - 1 + "px", top: n.y * z + y - 1 + "px", width: n.w * z + 2 + "px", height: n.h * z + 2 + "px" });
    }
  }

  media(it, scale) {
    const n = it.n;
    if (n.img) {
      const want = scale > 0.6 && (n.scale || 1) >= 2 ? "@2x" : "@1x";
      if (it.level === want) return;
      it.level = want;
      const img = new Image();
      img.decoding = "async";
      img.alt = "";
      img.draggable = false;
      it.el.classList.add("is-loading");
      img.onload = () => {
        img.classList.add("ok");
        it.el.querySelectorAll("img, .st-ph").forEach(o => o !== img && o.remove());
        it.el.classList.remove("is-loading");
      };
      img.onerror = () => {
        img.remove();
        it.el.classList.remove("is-loading");
        if (!it.el.querySelector("img.ok")) placeholder(it.el, n.name);
      };
      img.src = this.base + n.img + want + ".webp";
      it.el.appendChild(img);
    } else if (n.html) {
      const live = scale >= (n.parent ? 0.03 : 0.25);   // screens live even zoomed out; big sections (bg + connectors) stay thumbnails until zoomed in
      if (it.level === (live ? "live" : "thumb")) return;
      it.level = live ? "live" : "thumb";
      it.el.replaceChildren();
      if (live) {
        const f = document.createElement("iframe");
        Object.assign(f, { src: this.base + n.html, title: n.name, loading: "lazy", tabIndex: -1 });
        Object.assign(f.style, { width: n.w + "px", height: n.h + "px" });
        it.el.appendChild(f);
      } else if (n.thumb) {
        const img = new Image(); img.src = this.base + n.thumb; img.alt = ""; it.el.appendChild(img);
      } else placeholder(it.el, n.name);
    } else if (it.level === null && n.type !== "text") {
      it.level = "ph";
      placeholder(it.el, n.name);
    }
  }

  // ---------- input ----------
  bindEvents() {
    const root = this.root;
    root.addEventListener("wheel", e => {
      e.preventDefault();
      const r = root.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        this.zoomAt(this.view.z * Math.exp(-e.deltaY * unit * 0.0025), e.clientX - r.left, e.clientY - r.top);
      } else {
        const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey ? 0 : e.deltaY) * unit;
        this.setView(this.view.x - dx, this.view.y - dy, this.view.z);
      }
    }, { passive: false });

    let drag = null;
    root.addEventListener("pointerdown", e => {
      if (e.button !== 0 && e.button !== 1) return;
      root.focus({ preventScroll: true });
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false, id: e.button === 0 && !this.space ? hitId(e) : null };
      root.setPointerCapture(e.pointerId);
    });
    root.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      root.classList.add("is-panning");
      this.setView(drag.vx + dx, drag.vy + dy, this.view.z);
    });
    const end = () => {
      if (drag && !drag.moved) this.select(drag.id);
      drag = null;
      root.classList.remove("is-panning");
    };
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("dblclick", e => { const id = hitId(e); id ? this.focus(id) : this.fit(); });

    window.addEventListener("keydown", e => {
      if (e.code === "Space" && !isTyping(e)) { this.space = true; root.classList.add("is-space"); if (e.target === root) e.preventDefault(); }
    });
    window.addEventListener("keyup", e => { if (e.code === "Space") { this.space = false; root.classList.remove("is-space"); } });
  }
}

function hitId(e) {
  const t = e.target.closest && e.target.closest("[data-id]");
  return t ? t.dataset.id : null;
}
function placeholder(el, name) {
  if (el.querySelector(".st-ph")) return;
  const d = document.createElement("div");
  d.className = "st-ph";
  d.textContent = name;
  el.appendChild(d);
}
export function unionBounds(nodes) {
  if (!nodes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + n.h); }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const isTyping = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
