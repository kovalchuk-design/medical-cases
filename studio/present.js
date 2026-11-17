// Presentation mode: replays the "▶ Case presentation" page like Figma's prototype player.
// Frames come from the page nodes; clickable areas come from Figma prototype links (page.links).

export class Presenter {
  constructor({ onClose = () => {} } = {}) {
    this.onClose = onClose;
    this.el = document.createElement("div");
    this.el.className = "st-present";
    this.el.hidden = true;
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "true");
    this.el.setAttribute("aria-label", "Case presentation");
    this.el.innerHTML =
      '<div class="st-stage" id="stStage"></div>' +
      '<div class="st-present-bar">' +
        '<button class="st-btn" type="button" data-act="prev" aria-label="Previous (Left arrow)">←</button>' +
        '<span class="st-present-pos" aria-live="polite"></span>' +
        '<button class="st-btn" type="button" data-act="next" aria-label="Next (Right arrow)">→</button>' +
        '<button class="st-btn" type="button" data-act="restart">Start here</button>' +
        '<button class="st-btn" type="button" data-act="close">Close (Esc)</button>' +
      '</div>';
    document.body.appendChild(this.el);
    this.stage = this.el.querySelector(".st-stage");
    this.pos = this.el.querySelector(".st-present-pos");
    this.el.addEventListener("click", e => {
      const act = e.target.closest("[data-act]");
      if (act) { this[act.dataset.act](); return; }
      const hot = e.target.closest(".st-hot");
      if (hot) { this.go(hot.dataset.to); return; }
      if (e.target.closest(".st-stage")) this.hint();
    });
    this.onKey = e => {
      if (this.el.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); this.close(); }
      else if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.target.closest(".st-hot"))) { e.preventDefault(); this.next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); this.prev(); }
      else if (e.key === "Home") { e.preventDefault(); this.restart(); }
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", () => !this.el.hidden && this.layout());
  }

  open(page, base, startId) {
    this.page = page;
    this.base = base;
    this.frames = page.nodes.filter(n => n.type !== "text" && n.w >= 400 && n.h >= 300).sort((a, b) => a.y - b.y || a.x - b.x);
    this.byId = new Map(this.frames.map(f => [f.id, f]));
    this.links = page.links || [];
    this.start = (page.flows && page.flows[0] && page.flows[0].start) || (this.frames[0] && this.frames[0].id);
    this.history = [];
    this.el.hidden = false;
    document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    this.show(this.byId.has(startId) ? startId : this.start);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    history.replaceState(null, "", location.pathname + location.search);
    this.onClose(this.current);
  }

  go(id) { if (!this.byId.has(id) || id === this.current) return; this.history.push(this.current); this.show(id); }
  restart() { this.history = []; this.show(this.start); }

  next() {
    const l = this.linkBy(/^(next|start|hotspot)/i);
    if (l) return this.go(l.to);
    const i = this.frames.findIndex(f => f.id === this.current);
    if (i >= 0 && i < this.frames.length - 1) this.go(this.frames[i + 1].id);
  }
  prev() {
    const l = this.linkBy(/^back/i);
    if (l) { this.history.pop(); this.show(l.to); return; }
    if (this.history.length) { this.show(this.history.pop()); return; }
    const i = this.frames.findIndex(f => f.id === this.current);
    if (i > 0) this.show(this.frames[i - 1].id);
  }
  linkBy(re) { return this.links.find(l => l.from === this.current && re.test(l.label || "")); }

  show(id) {
    const f = this.byId.get(id);
    if (!f) return;
    this.current = id;
    history.replaceState(null, "", "#present/" + encodeURIComponent(id));
    this.stage.replaceChildren();
    const img = new Image();
    img.alt = f.name;
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "st-ph";
      ph.textContent = f.name + " — image not synced yet";
      img.replaceWith(ph);
    };
    img.src = this.base + f.img + ((f.scale || 1) >= 2 ? "@2x" : "@1x") + ".webp";
    this.stage.appendChild(img);
    const mine = this.links.filter(l => l.from === id);
    for (const l of mine) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "st-hot";
      b.dataset.to = l.to;
      b.setAttribute("aria-label", (l.label || "Go") + " → " + ((this.byId.get(l.to) || {}).name || ""));
      Object.assign(b.style, {
        left: (l.rect[0] / f.w) * 100 + "%", top: (l.rect[1] / f.h) * 100 + "%",
        width: (l.rect[2] / f.w) * 100 + "%", height: (l.rect[3] / f.h) * 100 + "%"
      });
      this.stage.appendChild(b);
      preload(this.base, this.byId.get(l.to));
    }
    const i = this.frames.findIndex(x => x.id === id);
    this.pos.textContent = f.name + "  ·  " + (i + 1) + " / " + this.frames.length;
    this.layout();
  }

  layout() {
    const f = this.byId.get(this.current);
    if (!f) return;
    const k = Math.min(window.innerWidth / f.w, window.innerHeight / f.h);
    Object.assign(this.stage.style, { width: f.w * k + "px", height: f.h * k + "px" });
  }

  hint() {
    this.stage.classList.add("is-hint");
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.stage.classList.remove("is-hint"), 600);
  }
}

const loaded = new Set();
function preload(base, f) {
  if (!f || !f.img) return;
  const src = base + f.img + ((f.scale || 1) >= 2 ? "@2x" : "@1x") + ".webp";
  if (loaded.has(src)) return;
  loaded.add(src);
  const i = new Image(); i.src = src;
}
