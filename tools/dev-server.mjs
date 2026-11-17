#!/usr/bin/env node
// Static server with live reload for Case Studio. Usage: node tools/dev-server.mjs [port]
// Any file change in the repo reloads open pages; the studio keeps page, zoom and selection in the URL.
import http from "node:http";
import { createReadStream, watch } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const CLIENT = `<script>(()=>{const s=new EventSource("/__reload");s.onmessage=()=>location.reload();})();</script>`;
const clients = new Set();

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": ok\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    let s = await stat(file);
    if (s.isDirectory()) { file = path.join(file, "index.html"); s = await stat(file); }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    if (type.startsWith("text/html")) {
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(file, "utf8");
      res.end(html.includes("</body>") ? html.replace("</body>", CLIENT + "</body>") : html + CLIENT);
    } else createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => console.log(`Case Studio: http://localhost:${PORT}/`));

let t = 0;
watch(ROOT, { recursive: true }, (_e, name) => {
  if (!name || /(^|\/)(node_modules|\.git|\.cache)(\/|$)/.test(name)) return;
  clearTimeout(t);
  t = setTimeout(() => { for (const c of clients) c.write("data: reload\n\n"); }, 120);
});
