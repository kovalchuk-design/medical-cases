#!/usr/bin/env node
// Downloads Google Fonts (latin subset, woff2) into cases/<slug>/fonts/ and writes fonts.css with relative urls.
// Usage: node tools/fetch-fonts.mjs <slug> "Poppins:300,400,500,600" "Inter:100..900"
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());
const [slug, ...fams] = process.argv.slice(2);
const dir = path.resolve("cases", slug, "fonts");
await mkdir(dir, { recursive: true });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
let css = "";
for (const f of fams) {
  const [name, w] = f.split(":");
  const spec = w.includes("..") ? `wght@${w}` : `wght@${w.split(",").join(";")}`;
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:${spec}&display=swap`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(name + " " + res.status);
  const text = await res.text();
  for (const m of text.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)) {
    if (m[1] !== "latin") continue;
    let block = m[2];
    const url = block.match(/url\((https:[^)]+)\)/)[1];
    const weight = block.match(/font-weight:\s*([^;]+);/)[1].replace(/\s+/g, "-");
    const file = `${name.replace(/ /g, "")}-${weight}.woff2`;
    await writeFile(path.join(dir, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
    css += block.replace(/url\([^)]+\)/, `url(${file})`) + "\n";
  }
}
await writeFile(path.join(dir, "fonts.css"), css);
console.log("fonts:", css.match(/font-weight:[^;]+/g));
