// Rounds clickable prototype: live HTML screens (../frames/*.html) driven by the Figma "Case presentation" hotspots.
const J = await (await fetch("journeys.json")).json();
const $ = (s, r = document) => r.querySelector(s);
const el = (t, a = {}, ...kids) => { const e = Object.assign(document.createElement(t), a); kids.flat().forEach(k => e.append(k)); return e; };
const main = $("#main"), tabs = $("#tabs"), live = $("#live");
const STAT = { id: "j", sw: 874 };
const BAR = 110; // bottom zone (px) pinned like an iOS action bar

function parse() { const m = location.hash.match(/^#j(\d)\/(\d+)/); if (!m) return null; const j = J.find(x => x.id === "j" + m[1]); return j && j.steps[+m[2] - 1] ? { j, i: +m[2] - 1 } : null; }
function go(j, i) { location.hash = j ? `#${j.id.slice(0)}/${i + 1}` : ""; if (!j) history.replaceState(null, "", location.pathname + location.search); render(); }

function renderTabs(cur) {
  tabs.replaceChildren(el("a", { href: "#", textContent: "All journeys", onclick: e => { e.preventDefault(); go(null); } }), ...J.map(j => el("a", { href: `#${j.id}/1`, textContent: j.name, onclick: e => { e.preventDefault(); go(j, 0); } })));
  [...tabs.children].forEach((a, k) => a.toggleAttribute("aria-current", false) || (((!cur && k === 0) || (cur && k === J.indexOf(cur.j) + 1)) && a.setAttribute("aria-current", "page")));
}

function landing() {
  renderTabs(null);
  document.title = "Rounds · Clickable prototype";
  const cards = J.map(j => {
    const s = j.steps[0], last = j.steps[j.steps.length - 1];
    return el("article", { className: "card" },
      el("div", { className: "pv" }, el("iframe", { src: s.html, title: "", tabIndex: -1, loading: "lazy", ariaHidden: "true" })),
      el("div", { className: "tag", textContent: `${j.name} · ${j.steps.length} steps` }),
      el("h2", { textContent: s.headline }),
      s.metric ? el("div", { className: "metric" }, el("b", { textContent: s.metric.big }), el("span", { textContent: s.metric.small })) : "",
      el("p", { textContent: s.body }),
      el("a", { className: "btn pri", href: `#${j.id}/1`, textContent: "Start journey", onclick: e => { e.preventDefault(); go(j, 0); } }));
  });
  main.replaceChildren(el("section", { className: "land" },
    el("h1", { textContent: "Three moments in a locum’s week" }),
    el("p", { className: "lead", textContent: "Pick a journey and tap through it like the live app. Each step shows the real screen and the one control to press next. Concept case, synthetic data." }),
    el("div", { className: "cards" }, cards)));
  live.textContent = "All journeys";
}

let cur = null;
function step(j, i) {
  const s = j.steps[i];
  renderTabs({ j });
  document.title = `${s.headline} · Rounds prototype`;
  if (cur && cur.j === j && $(".phone")) return swap(s, j, i);   // keep the phone, swap the screen
  const k = Math.min(1, (innerHeight - 64 - 48) / 894);
  const phone = el("div", { className: "phone" }, el("div", { className: "screen", id: "screen" }));
  const pw = el("div", { className: "pw", id: "pw" }, phone);
  main.replaceChildren(el("section", { className: "step" }, el("div", { className: "info", id: "info" }), el("div", { className: "stage" }, pw)));
  window.__k = k; fit();
  cur = { j, i };
  info(s, j, i); loadScreen(s, false);
}
function fit() { const k = Math.min(1, (innerHeight - 64 - 48) / 894), pw = $("#pw"); if (!pw) return; pw.style.width = 422 * k + "px"; pw.style.height = 894 * k + "px"; $(".phone").style.transform = `scale(${k})`; }
addEventListener("resize", fit);

function info(s, j, i) {
  const isLast = i === j.steps.length - 1, hasPrev = i > 0;
  $("#info").replaceChildren(
    el("div", { className: "kick" }, el("span", { className: "chip", textContent: j.name }), `Step ${s.n} of ${s.total}`),
    el("h1", { textContent: s.headline }),
    el("p", { className: "body", textContent: s.body }),
    s.metric ? el("div", { className: "stat" }, el("b", { textContent: s.metric.big }), el("span", { textContent: s.metric.small })) : "",
    el("ol", { className: "prog", ariaHidden: "true" }, j.steps.map((_, k) => el("li", { className: k <= i ? "on" : "" }))),
    el("div", { className: "ctrl" },
      el("button", { className: "btn", textContent: hasPrev ? "Back" : "All journeys", onclick: back }),
      el("button", { className: "btn pri", textContent: isLast ? "Finish" : "Next", onclick: next })),
    el("p", { className: "hint", textContent: "Tap the outlined control on the phone, press Next, or use ← → keys. Esc returns to all journeys. Scroll inside the phone for longer screens." }));
  live.textContent = `Step ${s.n} of ${s.total}: ${s.headline}`;
}

function loadScreen(s, fade) {
  const scr = $("#screen"), old = scr.querySelector("iframe");
  const f = el("iframe", { src: s.html, title: s.name, className: fade ? "in" : "" });
  scr.querySelectorAll(".hot").forEach(h => h.remove());
  f.addEventListener("load", () => {
    const d = f.contentDocument, w = f.contentWindow;
    if (d) {
      const st = d.createElement("style");
      st.textContent = `html{overflow-y:auto;scrollbar-width:none}html::-webkit-scrollbar{display:none}body{overflow:visible!important}[data-name="Action bar"]{position:fixed!important;top:auto!important;bottom:0!important}`;
      d.head.append(st);
      d.addEventListener("click", hint);
      const hot = $(".hot");
      if (hot && hot.dataset.fixed !== "1") w.addEventListener("scroll", () => { hot.style.transform = `translateY(${-w.scrollY}px)`; });
    }
    requestAnimationFrame(() => f.classList.remove("in"));
    if (old) setTimeout(() => old.remove(), 260);
  });
  scr.append(f);
  scr.classList.remove("hint");
  if (s.hotspot) {
    const [x, y, w, h] = s.hotspot;
    const next = s.next;
    const b = el("button", { className: "hot", type: "button", ariaLabel: `Tap: ${s.headline}. Go to the next step`, onclick: next0 });
    Object.assign(b.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    b.dataset.fixed = y + h > 874 - BAR ? "1" : "0";
    scr.append(b);
  }
  scr.onclick = e => { if (!e.target.closest(".hot")) hint(); };
}
function swap(s, j, i) { cur = { j, i }; info(s, j, i); loadScreen(s, true); }
function hint() { const s = $("#screen"); if (!s) return; s.classList.add("hint"); clearTimeout(hint.t); hint.t = setTimeout(() => s.classList.remove("hint"), 600); }

function next0() { next(); }
function next() { if (!cur) return; const { j, i } = cur; if (i < j.steps.length - 1) go(j, i + 1); else { cur = null; go(null); } }
function back() { if (!cur) return; const { j, i } = cur; if (i > 0) go(j, i - 1); else { cur = null; go(null); } }

addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "ArrowRight") { next(); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { back(); e.preventDefault(); }
  else if (e.key === "Escape") { cur = null; go(null); }
  else if (/^[1-3]$/.test(e.key) && J[+e.key - 1]) go(J[+e.key - 1], 0);
});

function render() { const p = parse(); if (!p) { cur = null; landing(); } else step(p.j, p.i); }
addEventListener("hashchange", render);
render();
