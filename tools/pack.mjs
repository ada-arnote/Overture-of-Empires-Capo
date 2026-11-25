// SPDX-License-Identifier: AGPL-3.0-or-later
// Copies what ships into dist/, ready for any static host. Refuses when the gate is not clear.
// node tools/pack.mjs [--release]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "./check.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), dist = path.join(root, "dist");
const { bad, total } = check(root, { release: process.argv.includes("--release") });
if (bad.length) {
  for (const b of bad) console.log("STOP  " + b);
  process.exitCode = 1;
} else {
  if (existsSync(dist) && !existsSync(path.join(dist, ".made-by-pack"))) throw new Error("dist/ was not made by this tool; move it away first");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist);
  writeFileSync(path.join(dist, ".made-by-pack"), "");
  for (const d of ["src", "site"]) cpSync(path.join(root, d), path.join(dist, d), { recursive: true });
  for (const f of ["LICENSE", "NOTICES.md", "CREDITS.csv", "ADAPTED.csv"]) if (existsSync(path.join(root, f))) cpSync(path.join(root, f), path.join(dist, f));
  // Hosts open index.html at the top; send them to the page without a script.
  writeFileSync(path.join(dist, "index.html"), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=site/"><link rel="icon" href="data:,"><title>Capo</title><a href="site/">Open</a></html>\n');
  writeFileSync(path.join(dist, ".nojekyll"), "");
  writeFileSync(path.join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
  console.log(`dist/ is ready, ${(total / 1000).toFixed(1)} kB compressed, version ${JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version}. Nothing was uploaded.`);
}
