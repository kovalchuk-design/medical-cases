// Inserts the portfolio bar (back to all cases, prev/next, Figma) at the top of a case page.
// Usage on a case page: <body data-case="03-visitready"> … <script src="../../portfolio/cases.js"></script><script src="../../portfolio/case-bar.js"></script>
// Optional: <div id="stub"></div> renders a placeholder page for a case without its own page yet.
(function () {
  var slug = document.body.dataset.case;
  var list = window.CASES || [];
  var i = list.findIndex(function (c) { return c.slug === slug; });
  if (i < 0) return;
  var c = list[i], prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); };

  var bar = document.createElement("header");
  bar.className = "shell-bar";
  bar.innerHTML = '<div class="shell-wrap">' +
    '<a href="../../">← All cases</a>' +
    '<span class="shell-pos">' + esc(c.n) + ' / ' + list.length + ' · ' + esc(c.title) + '</span>' +
    '<nav aria-label="Case navigation">' +
      '<a href="../' + esc(prev.slug) + '/" aria-label="Previous case: ' + esc(prev.title) + '">← ' + esc(prev.n) + '</a>' +
      '<a href="../' + esc(next.slug) + '/" aria-label="Next case: ' + esc(next.title) + '">' + esc(next.n) + ' →</a>' +
    '</nav></div>';
  document.body.insertBefore(bar, document.body.firstChild);

  var stub = document.getElementById("stub");
  if (!stub) return;
  var LABEL = { ready: "Ready in Figma — case page coming next", wip: "In progress", planned: "Planned" };
  document.title = c.title + " · Healthcare product design";
  stub.className = "shell-wrap";
  stub.innerHTML =
    '<section class="stub-hero">' +
      '<p class="shell-over">Case ' + esc(c.n) + ' · ' + esc(c.tags.join(" · ")) + '</p>' +
      '<h1 class="shell-title">' + esc(c.title) + '</h1>' +
      '<p class="shell-lead">' + esc(c.tagline) + '</p>' +
      '<p class="shell-meta" style="margin-top:12px">' + esc(c.platform) + ' · <span class="shell-status ' + c.status + '">' + LABEL[c.status] + '</span></p>' +
    '</section>' +
    '<div class="stub-cover" style="--accent:' + esc(c.accent) + '">' +
      (c.cover ? '<img src="../../' + esc(c.cover) + '" alt="' + esc(c.title) + ' cover">'
               : '<div class="shell-ph" aria-hidden="true"><span class="shell-ph-n">' + esc(c.n) + '</span><span class="shell-ph-t">' + esc(c.title) + '</span></div>') +
    '</div>' +
    '<div class="stub-actions">' +
      (c.figma ? '<a class="stub-btn" href="' + esc(c.figma) + '" target="_blank" rel="noopener">Open in Figma</a>' : '') +
      '<a class="stub-btn ghost" href="../../">All cases</a>' +
    '</div>';
})();
