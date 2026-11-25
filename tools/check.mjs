// SPDX-License-Identifier: AGPL-3.0-or-later
// The gate: what may ship, how big it may be, and whether every borrowed thing has its record.
// node tools/check.mjs            everyday rules
// node tools/check.mjs --release  also needs the licence file and the source address
// node tools/check.mjs --root X   check another folder (used by the tests)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KB = 1000;
export const LIMITS = {
  file: 250 * KB, // any one shipped file, as stored
  code: { "src/core": 12 * KB, "src/map": 45 * KB, "src/games": 90 * KB, site: 40 * KB }, // compressed
  first: 500 * KB, // everything shipped, compressed
  lines: { "src/map": 2400, "src/games": 6500, "src/core": 700, tools: 1000 },
};
const SHIPPED = ["src", "site"];
const TYPES = new Set([".js", ".css", ".html", ".json", ".svg", ".png", ".webp", ".ogg", ".mp3", ".woff2", ".bin", ".rl", ".csv", ".txt", ".webmanifest"]);
const MEDIA = new Set([".svg", ".png", ".webp", ".ogg", ".mp3", ".woff2"]);
const WHO_MAY_IMPORT = { "src/core": ["src/core"], "src/games": ["src/core", "src/games"], "src/map": ["src/map"] };

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** A small CSV reader: commas, quotes, no line breaks inside a field. */
export function rows(text) {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => [...l.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map((m) => (m[1] !== undefined ? m[1].replaceAll('""', '"') : m[2]).trim()));
}

/** Code with comments and the insides of plain strings blanked, for the word rules. */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');

export function check(root, { release = false } = {}) {
  const bad = [], note = [], rel = (f) => path.relative(root, f).split(path.sep).join("/");
  const files = SHIPPED.flatMap((d) => walk(path.join(root, d)));
  const read = (name) => (existsSync(path.join(root, name)) ? readFileSync(path.join(root, name), "utf8") : null);

  let total = 0;
  const code = Object.fromEntries(Object.keys(LIMITS.code).map((k) => [k, 0]));
  for (const f of files) {
    const name = rel(f), ext = path.extname(f).toLowerCase(), size = statSync(f).size, body = readFileSync(f), zip = gzipSync(body).length;
    total += zip;
    for (const k of Object.keys(code)) if (name.startsWith(k + "/")) code[k] += zip;
    if (!TYPES.has(ext)) bad.push(`${name}: files of type "${ext}" do not ship`);
    if (size > LIMITS.file) bad.push(`${name}: ${Math.round(size / KB)} kB is over the ${LIMITS.file / KB} kB limit for one file`);
    if (![".js", ".css", ".html", ".svg"].includes(ext)) continue;
    const text = body.toString("utf8"), plain = ext === ".js" ? bare(text) : text;
    if (ext === ".js" && !text.startsWith("// SPDX-License-Identifier: AGPL-3.0-or-later")) bad.push(`${name}: first line must be the licence mark`);
    if (ext !== ".svg" && text.includes("—")) bad.push(`${name}: has an em dash`);
    // Nothing is fetched from elsewhere. Links a person follows are fine, and so are the two fixed names below.
    for (const m of text.matchAll(/\b(?:https?|wss?):\/\/[^\s"'`<>)]+/g)) {
      if (/^http:\/\/www\.w3\.org\//.test(m[0]) || (ext === ".html" && new RegExp(`<a [^>]*href="${m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) || name === "site/config.js") continue;
      bad.push(`${name}: names an outside address, ${m[0].slice(0, 60)}`);
    }
    if (ext === ".js") {
      for (const [re, why] of [[/\beval\s*\(|\bnew\s+Function\b/, "runs text as code"], [/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/, "writes markup from text"]]) if (re.test(plain)) bad.push(`${name}: ${why}`);
      if (/^src\/(core|games)\//.test(name)) {
        for (const [re, why] of [[/\bMath\.random\b/, "uses chance that cannot be replayed"], [/\bDate\b|\bperformance\b/, "reads the clock"], [/\bMath\.(?:sin|cos|tan|exp|log|pow|sqrt|cbrt|hypot|atan2?)\b/, "uses maths that differs between machines"], [/\b(?:document|window|localStorage|fetch|navigator)\b/, "touches the page"], [/\.toLocale|\bIntl\b|localeCompare/, "depends on language settings"]]) if (re.test(plain)) bad.push(`${name}: rules code ${why}`);
      }
      for (const [area, may] of Object.entries(WHO_MAY_IMPORT)) {
        if (!name.startsWith(area + "/")) continue;
        for (const m of text.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(?\s*["']([^"']+)["']/g)) {
          const spec = m[1] || m[2], to = spec.startsWith(".") ? rel(path.resolve(path.dirname(f), spec)) : spec;
          if (!may.some((d) => to.startsWith(d + "/"))) bad.push(`${name}: may not import ${to}`);
        }
      }
    }
  }
  for (const [k, n] of Object.entries(code)) if (n > LIMITS.code[k]) bad.push(`${k}: ${Math.round(n / KB)} kB compressed is over ${LIMITS.code[k] / KB} kB`);
  if (total > LIMITS.first) bad.push(`everything shipped: ${Math.round(total / KB)} kB compressed is over ${LIMITS.first / KB} kB`);

  for (const [area, max] of Object.entries(LIMITS.lines)) {
    const n = walk(path.join(root, area)).filter((f) => /\.m?js$/.test(f)).reduce((s, f) => s + readFileSync(f, "utf8").split("\n").length, 0);
    if (n > max) bad.push(`${area}: ${n} lines is over its ceiling of ${max}`);
    else if (n > max * 0.9) note.push(`${area}: ${n} of ${max} lines`);
  }

  // Records. One row per borrowed picture, sound or font; one row per adapted code file.
  const credits = read("CREDITS.csv"), adapted = read("ADAPTED.csv");
  const table = (text, name, head) => {
    if (text === null) { bad.push(`${name} is missing`); return []; }
    const [h, ...body] = rows(text);
    if (h?.join() !== head.join()) { bad.push(`${name}: its first line must be ${head.join(",")}`); return []; }
    for (const r of body) if (r.length !== head.length || r.some((x) => !x)) bad.push(`${name}: a row is not complete: ${r.join(", ").slice(0, 80)}`);
    return body;
  };
  const C = table(credits, "CREDITS.csv", ["file", "title", "maker", "licence", "source", "date", "changes"]);
  const A = table(adapted, "ADAPTED.csv", ["file", "repository", "path", "branch", "date", "notice", "lines", "capo_only"]);
  for (const r of C) {
    if (!["CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "public domain", "own work"].includes(r[3])) bad.push(`CREDITS.csv: ${r[0]} has a licence that may not ship, ${r[3]}`);
    if (!existsSync(path.join(root, r[0]))) bad.push(`CREDITS.csv: ${r[0]} does not exist`);
  }
  for (const r of A) if (!existsSync(path.join(root, r[0]))) bad.push(`ADAPTED.csv: ${r[0]} does not exist`);
  const credited = new Set(C.map((r) => r[0])), known = new Set(A.map((r) => r[0]));
  for (const f of files) {
    const name = rel(f), ext = path.extname(f).toLowerCase();
    if (MEDIA.has(ext) && !credited.has(name)) bad.push(`${name}: has no row in CREDITS.csv`);
    if (ext === ".js" && /^\/\/ Adapted from /m.test(readFileSync(f, "utf8")) && !known.has(name)) bad.push(`${name}: says it is adapted but has no row in ADAPTED.csv`);
  }
  if (read("NOTICES.md") === null) bad.push("NOTICES.md is missing");

  const licence = read("LICENSE"), config = read("site/config.js") || "", source = (config.match(/SOURCE_URL\s*=\s*"([^"]*)"/) || [])[1] || "";
  if (!licence || !/GNU AFFERO GENERAL PUBLIC LICENSE/.test(licence)) (release ? bad : note).push("LICENSE is missing or is not the AGPL text");
  if (!/^https:\/\//.test(source)) (release ? bad : note).push("site/config.js has no source address yet");
  return { bad, note, total, code, files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--root"), root = at > 0 ? path.resolve(process.argv[at + 1]) : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const r = check(root, { release: process.argv.includes("--release") });
  for (const n of r.note) console.log("note  " + n);
  for (const b of r.bad) console.log("STOP  " + b);
  console.log(`${r.files} files ship, ${(r.total / KB).toFixed(1)} kB compressed of ${LIMITS.first / KB}. ${r.bad.length ? r.bad.length + " to fix" : "All clear"}.`);
  process.exitCode = r.bad.length ? 1 : 0;
}
