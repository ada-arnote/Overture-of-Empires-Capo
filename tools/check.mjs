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
  code: { "src/core": 12 * KB, "src/map": 45 * KB, "src/games": 90 * KB, "src/story": 60 * KB, site: 200 * KB }, // compressed. site: 200, the owner's ruling (rulings 121, 125, 134 and 137)
  first: 600 * KB, // everything shipped, compressed (ruling 130)
  map: 300 * KB, // one map file in maps/, compressed: fetched by the page that needs it, never by the first page
  lines: { "src/map": 2400, "src/games": 6500, "src/core": 700, tools: 1000 },
  // vendored assets, apart from code (lane 7's rule of thumb); still inside the 600 kB above. Each folder holds only its own kinds, plus .txt licence texts
  assets: { "site/fonts": { max: 110 * KB, types: [".woff2", ".txt"] }, "site/icons": { max: 25 * KB, types: [".svg", ".png", ".webp", ".txt"] }, "site/sounds": { max: 60 * KB, types: [".ogg", ".mp3", ".txt"] }, "site/textures": { max: 32 * KB, types: [".webp", ".png", ".txt"] }, "site/shots": { max: 120 * KB, types: [".webp", ".txt"] } }, // textures: ruling 128; shots (our own in-game screenshots): ruling 130
};
export const LICENCES = ["CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "OFL-1.1", "MIT", "ISC", "public domain", "own work"];
// the words that show a licence's own text is there: beside a font in a .txt, and in NOTICES.md for MIT and ISC
const TEXT = { "OFL-1.1": /SIL OPEN FONT LICENSE[\s\S]*Version 1\.1/i, MIT: /Permission is hereby granted, free of charge/, ISC: /Permission to use, copy, modify, and\/or distribute/ };
const PACKED = new Set([".woff2", ".ogg", ".mp3", ".png", ".webp"]); // already compressed: counted at full size
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
  const code = Object.fromEntries(Object.keys(LIMITS.code).map((k) => [k, 0])), assets = Object.fromEntries(Object.keys(LIMITS.assets).map((k) => [k, 0]));
  for (const f of files) {
    const name = rel(f), ext = path.extname(f).toLowerCase(), size = statSync(f).size, body = readFileSync(f), zip = PACKED.has(ext) ? size : gzipSync(body).length;
    total += zip;
    const shelf = Object.keys(assets).find((k) => name.startsWith(k + "/"));
    if (shelf) { assets[shelf] += zip; if (!LIMITS.assets[shelf].types.includes(ext)) bad.push(`${name}: only ${LIMITS.assets[shelf].types.join(" ")} go in ${shelf}/`); }
    else { for (const k of Object.keys(code)) if (name.startsWith(k + "/")) code[k] += zip; }
    if (MEDIA.has(ext) && !shelf) bad.push(`${name}: fonts, pictures and sounds ship only from ${Object.keys(assets).join("/, ")}/`);
    if (!TYPES.has(ext)) bad.push(`${name}: files of type "${ext}" do not ship`);
    if (size > LIMITS.file) bad.push(`${name}: ${Math.round(size / KB)} kB is over the ${LIMITS.file / KB} kB limit for one file`);
    if (![".js", ".css", ".html", ".svg"].includes(ext)) continue;
    const text = body.toString("utf8"), plain = ext === ".js" ? bare(text) : text;
    // a page's own rule: nothing by default, trusted types kept, fonts and sounds from its own site only
    const csp = ext === ".html" && text.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
    if (csp) {
      const rule = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
      if (rule["default-src"]?.join(" ") !== "'none'") bad.push(`${name}: its page rule must start from default-src 'none'`);
      if (rule["require-trusted-types-for"]?.join(" ") !== "'script'") bad.push(`${name}: its page rule must keep require-trusted-types-for 'script'`);
      for (const k of ["font-src", "media-src"]) if (!rule[k] || rule[k].some((v) => !["'self'", "data:"].includes(v))) bad.push(`${name}: its page rule needs ${k} with only 'self' or data:`);
    }
    if (ext === ".js" && !text.startsWith("// SPDX-License-Identifier: AGPL-3.0-or-later")) bad.push(`${name}: first line must be the licence mark`);
    if (ext !== ".svg" && text.includes("—")) bad.push(`${name}: has an em dash`);
    // Nothing is fetched from elsewhere. Links a person follows are fine, and so are the two fixed names below.
    for (const m of text.matchAll(/\b(?:https?|wss?):\/\/[^\s"'`<>)]+/g)) {
      if (/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(m[0])) continue; // this computer is not elsewhere
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
  for (const f of walk(path.join(root, "maps"))) {
    const zip = gzipSync(readFileSync(f)).length;
    if (path.extname(f) !== ".json") bad.push(`${rel(f)}: only map data in JSON goes in maps/`);
    else if (zip > LIMITS.map) bad.push(`${rel(f)}: ${Math.round(zip / KB)} kB compressed is over the ${LIMITS.map / KB} kB limit for one map`);
  }
  for (const [k, n] of Object.entries(code)) if (n > LIMITS.code[k]) bad.push(`${k}: ${Math.round(n / KB)} kB compressed is over ${LIMITS.code[k] / KB} kB`);
  for (const [k, n] of Object.entries(assets)) if (n > LIMITS.assets[k].max) bad.push(`${k}: ${Math.round(n / KB)} kB is over its ${LIMITS.assets[k].max / KB} kB asset budget`);
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
  const notices = read("NOTICES.md") ?? "";
  for (const r of C) {
    if (!LICENCES.includes(r[3])) bad.push(`CREDITS.csv: ${r[0]} has a licence that may not ship, ${r[3]}`);
    if (!existsSync(path.join(root, r[0]))) { bad.push(`CREDITS.csv: ${r[0]} does not exist`); continue; }
    const dir = path.posix.dirname(r[0]);
    // a font carries its licence text and copyright line beside it, in the same folder
    const font = r[0].endsWith(".woff2"), beside = font ? readdirSync(path.join(root, dir)).filter((t) => t.endsWith(".txt")).map((t) => readFileSync(path.join(root, dir, t), "utf8")) : [];
    if (font && TEXT[r[3]] && !beside.some((t) => TEXT[r[3]].test(t) && /Copyright/i.test(t))) bad.push(`${r[0]}: needs its ${r[3]} licence text, with the copyright line, in a .txt beside it`);
    // fonts, and OFL, MIT and ISC things, are named in NOTICES.md by file or folder; MIT and ISC also keep their maker and permission text there
    if ((font || TEXT[r[3]]) && !notices.includes(r[0]) && !notices.includes(dir + "/")) bad.push(`${r[0]}: NOTICES.md must name it or ${dir}/ (${r[3]})`);
    if (["MIT", "ISC"].includes(r[3]) && !(TEXT[r[3]].test(notices) && notices.includes(r[2]))) bad.push(`${r[0]}: NOTICES.md must keep the ${r[3]} notice text and the copyright line for ${r[2]}`);
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
  return { bad, note, total, code, assets, files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--root"), root = at > 0 ? path.resolve(process.argv[at + 1]) : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const r = check(root, { release: process.argv.includes("--release") });
  if (at < 0) { // the map report card, quick sweep: stops on a check the maps pass now, notes the to-do list (tools/report.mjs)
    const card = await import("./report.mjs"), v = card.verdict(card.sweep({ seeds: 2 }));
    r.bad.push(...v.bad);
    r.note.push(...v.note);
  }
  for (const n of r.note) console.log("note  " + n);
  for (const b of r.bad) console.log("STOP  " + b);
  console.log(`${r.files} files ship, ${(r.total / KB).toFixed(1)} kB compressed of ${LIMITS.first / KB}. ${r.bad.length ? r.bad.length + " to fix" : "All clear"}.`);
  process.exitCode = r.bad.length ? 1 : 0;
}
