// SPDX-License-Identifier: AGPL-3.0-or-later
// A small static server for trying things. This computer only, unless --lan is given.
// node tools/serve.mjs [--lan] [--port 8080] [--root folder]
// --lan lets any device on your network read the files in src, site, test and lab. Stop it with Ctrl+C.
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".csv": "text/csv; charset=utf-8", ".md": "text/plain; charset=utf-8", ".bin": "application/octet-stream", ".rl": "application/octet-stream" };
const OPEN = ["src", "site", "play", "maps", "shelf", "test", "lab", "story-test"]; // shelf: the community shelf the pages read (ruling 155) // never docs, never the records of other projects

export async function find(root, url) {
  let p;
  try { p = decodeURIComponent(new URL(url, "http://x").pathname); } catch { return null; }
  if (p.endsWith("/")) p += "index.html";
  if (/[\0\\]|(^|\/)\.|:/.test(p) || !OPEN.includes(p.split("/")[1]) || !TYPES[path.extname(p).toLowerCase()]) return null;
  try {
    const base = await realpath(root), full = await realpath(path.join(base, p));
    if (!full.startsWith(base + path.sep) || !(await stat(full)).isFile()) return null;
    return full;
  } catch { return null; }
}

export function makeServer(root, extra) {
  return createServer(async (req, res) => {
    if (extra && (await extra(req, res))) return;
    const head = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, head).end(); return; }
    if (req.url === "/") { res.writeHead(302, { ...head, Location: "/site/" }).end(); return; } // so the page's own paths work
    const file = await find(root, req.url);
    if (!file) { res.writeHead(404, { ...head, "Content-Type": "text/plain" }).end("Not found"); return; }
    const body = await readFile(file);
    res.writeHead(200, { ...head, "Content-Type": TYPES[path.extname(file).toLowerCase()], "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const root = path.resolve(arg("--root", path.dirname(path.dirname(fileURLToPath(import.meta.url))))), port = Number(arg("--port", 8080)), lan = process.argv.includes("--lan");
  makeServer(root).listen(port, lan ? "0.0.0.0" : "127.0.0.1", () => {
    console.log(`This computer: http://127.0.0.1:${port}/`);
    if (lan) for (const list of Object.values(networkInterfaces())) for (const a of list) if (a.family === "IPv4" && !a.internal) console.log(`Your network:  http://${a.address}:${port}/`);
  });
}
