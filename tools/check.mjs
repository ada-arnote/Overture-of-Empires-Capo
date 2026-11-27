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
// Guides, not limits (ruling 141): going past one prints a note, never stops a release. Efficiency stays a focus.
export const LIMITS = {
  file: 250 * KB, // any one shipped file, as stored
  code: { "src/core": 12 * KB, "src/map": 45 * KB, "src/games": 90 * KB, "src/story": 90 * KB, site: 200 * KB }, // compressed. site: 200, the owner's ruling (rulings 121, 125, 134 and 137)
  first: 700 * KB, // everything shipped, compressed (rulings 130 and 139)
  map: 300 * KB, // one map file in maps/, compressed: fetched by the page that needs it, never by the first page
  lines: { "src/map": 2400, "src/games": 6500, "src/core": 700, tools: 1300 }, // tools: 1,300 (ruling 150)
  // vendored assets, apart from code (lane 7's rule of thumb); still inside the 600 kB above. Each folder holds only its own kinds, plus .txt licence texts
  assets: { "site/fonts": { max: 110 * KB, types: [".woff2", ".txt"] }, "site/icons": { max: 25 * KB, types: [".svg", ".png", ".webp", ".txt"] }, "site/sounds": { max: 60 * KB, types: [".ogg", ".mp3", ".txt"] }, "site/textures": { max: 32 * KB, types: [".webp", ".png", ".txt"] }, "site/shots": { max: 120 * KB, types: [".webp", ".txt"] }, "site/models": { max: 120 * KB, types: [".bin", ".txt"] } }, // models: sculpted packs in our own small format, fetched by a game page only when a style asks for them (ruling 140) // textures: ruling 128; shots (our own in-game screenshots): ruling 130
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
  const ai = (read("site/config.js") || "").split("AI_BASES")[1] || "", aiOrigins = [...new Set([...ai.matchAll(/"(https:\/\/[^/"]+)/g)].map((m) => m[1]))]; // the AI services Capo may call
  const home = (read("site/config.js") || "").match(/SITE_URL\s*=\s*"(https:\/\/[^"]*\/)play\/"/)?.[1]; // the site's own public address, for a share card

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
    if (size > LIMITS.file) note.push(`${name}: ${Math.round(size / KB)} kB, above the ${LIMITS.file / KB} kB guide for one file`);
    if (![".js", ".css", ".html", ".svg"].includes(ext)) continue;
    const text = body.toString("utf8"), plain = ext === ".js" ? bare(text) : text;
    // a page's own rule: nothing by default, trusted types kept, fonts and sounds from its own site only
    const csp = ext === ".html" && text.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
    if (csp) {
      const rule = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
      if (rule["default-src"]?.join(" ") !== "'none'") bad.push(`${name}: its page rule must start from default-src 'none'`);
      if (rule["require-trusted-types-for"]?.join(" ") !== "'script'") bad.push(`${name}: its page rule must keep require-trusted-types-for 'script'`);
      for (const k of ["font-src", "media-src"]) if (!rule[k] || rule[k].some((v) => !["'self'", "data:"].includes(v))) bad.push(`${name}: its page rule needs ${k} with only 'self' or data:`);
      const reach = rule["connect-src"] || [], want = ["'self'", ...aiOrigins, "http://localhost:*", "http://127.0.0.1:*"]; // past its own site: exactly the AI services and this computer
      if (reach.some((v) => v !== "'self'") && [...reach].sort().join(" ") !== [...want].sort().join(" ")) bad.push(`${name}: its connect-src must list exactly 'self', the AI services in site/config.js and this computer`);
    }
    if (ext === ".js" && !text.startsWith("// SPDX-License-Identifier: AGPL-3.0-or-later")) bad.push(`${name}: first line must be the licence mark`);
    if (ext !== ".svg" && text.includes("—")) bad.push(`${name}: has an em dash`);
    // Nothing is fetched from elsewhere. Links a person follows are fine, and so are the two fixed names below.
    for (const m of text.matchAll(/\b(?:https?|wss?):\/\/[^\s"'`<>)]+/g)) {
      if (/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(m[0])) continue; // this computer is not elsewhere
      const card = home && ext === ".html" && m[0].startsWith(home) && new RegExp(`<meta (?:property|name)="(?:og|twitter):[\\w:]+" content="${m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(text); // a share card names the site's own pages
      if (card || /^http:\/\/www\.w3\.org\//.test(m[0]) || (csp && aiOrigins.includes(m[0]) && csp.includes(` ${m[0]} `)) || (ext === ".html" && new RegExp(`<a [^>]*href="${m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) || name === "site/config.js") continue;
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
    if (![".json", ".webp", ".bin"].includes(path.extname(f))) bad.push(`${rel(f)}: only map data (JSON, and baked pictures and tables as .webp and .bin) goes in maps/`); // ruling 140
    else if (zip > LIMITS.map) note.push(`${rel(f)}: ${Math.round(zip / KB)} kB compressed, above the ${LIMITS.map / KB} kB guide for one map`);
  }
  for (const [k, n] of Object.entries(code)) if (n > LIMITS.code[k]) note.push(`${k}: ${Math.round(n / KB)} kB compressed, above its ${LIMITS.code[k] / KB} kB guide`);
  for (const [k, n] of Object.entries(assets)) if (n > LIMITS.assets[k].max) note.push(`${k}: ${Math.round(n / KB)} kB, above its ${LIMITS.assets[k].max / KB} kB asset guide`);
  if (total > LIMITS.first) note.push(`everything shipped: ${Math.round(total / KB)} kB compressed, above the ${LIMITS.first / KB} kB guide`);
  // sizes are reported, not limited (ruling 141): efficiency stays a focus, so every check shows where the weight is
  note.push(`sizes: ${Object.entries(code).map(([k, n]) => `${k} ${(n / KB).toFixed(1)}`).join(", ")}; ${Object.entries(assets).map(([k, n]) => `${k.replace("site/", "")} ${(n / KB).toFixed(1)}`).join(", ")} (kB)`);

  for (const [area, max] of Object.entries(LIMITS.lines)) {
    const n = walk(path.join(root, area)).filter((f) => /\.m?js$/.test(f)).reduce((s, f) => s + readFileSync(f, "utf8").split("\n").length, 0);
    if (n > max) note.push(`${area}: ${n} lines, above its ${max}-line guide`);
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
    if (r[0].startsWith("site/models/") && r[3].startsWith("CC-BY") && !notices.includes(r[0])) bad.push(`${r[0]}: NOTICES.md must name it with its credit line (CC BY, ruling 146)`);
  }
  for (const r of A) if (!existsSync(path.join(root, r[0]))) bad.push(`ADAPTED.csv: ${r[0]} does not exist`);
  const credited = new Set(C.map((r) => r[0])), known = new Set(A.map((r) => r[0]));
  for (const f of files) {
    const name = rel(f), ext = path.extname(f).toLowerCase();
    if (MEDIA.has(ext) && !credited.has(name)) bad.push(`${name}: has no row in CREDITS.csv`);
    if (name.startsWith("site/models/") && ext === ".bin" && !credited.has(name)) bad.push(`${name}: a sculpted model needs its row in CREDITS.csv`); // ruling 146
    if (ext === ".js" && /^\/\/ Adapted from /m.test(readFileSync(f, "utf8")) && !known.has(name)) bad.push(`${name}: says it is adapted but has no row in ADAPTED.csv`);
  }
  if (read("NOTICES.md") === null) bad.push("NOTICES.md is missing");

  const licence = read("LICENSE"), config = read("site/config.js") || "", source = (config.match(/SOURCE_URL\s*=\s*"([^"]*)"/) || [])[1] || "";
  if (!licence || !/GNU AFFERO GENERAL PUBLIC LICENSE/.test(licence)) (release ? bad : note).push("LICENSE is missing or is not the AGPL text");
  if (!/^https:\/\//.test(source)) (release ? bad : note).push("site/config.js has no source address yet");
  return { bad, note, total, code, assets, files: files.length };
}

// The style packs (src/map/style.js, ruling 147): every pack's schema, and its seat colours on its own board. Hard stops only where a
// player would really lose something: a set that promises contrast or colour-blind safety and does not keep it, or pieces with no owner's colour.
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const luma = (c) => c.reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * lin(v), 0);
export const contrast = (a, b) => { const [x, y] = [luma(a) + 0.05, luma(b) + 0.05]; return Math.max(x, y) / Math.min(x, y); };
// colour vision: Machado, Oliveira and Fernandes (2009) at full strength, in linear light; distances in Oklab (Ottosson, 2020)
export const VISION = { normal: null, protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] };
function oklab(c, m) {
  let v = c.map(lin);
  if (m) v = m.map((r) => Math.max(0, Math.min(1, r[0] * v[0] + r[1] * v[1] + r[2] * v[2])));
  const [l, n, s] = [[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]].map((r) => Math.cbrt(r[0] * v[0] + r[1] * v[1] + r[2] * v[2]));
  return [0.2104542553 * l + 0.793617785 * n - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * n + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * n - 0.808675766 * s];
}
/** The two colours of a list nearest each other under one kind of colour vision: [distance, i, j]. */
export const nearest = (rgbs, m) => { let best = [9, 0, 0]; rgbs.forEach((a, i) => rgbs.forEach((b, j) => { if (j > i) { const p = oklab(a, m), q = oklab(b, m), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < best[0]) best = [d, i, j]; } })); return best; };
export async function styleGate(root) {
  const bad = [], note = [], at = (f) => pathToFileURL(path.join(root, f)).href;
  const { STYLES, SEATS, LANDS, washed, darkBoard, seatsOf } = await import(at("src/map/style.js")), { models } = await import(at("src/map/models.js"));
  const W = STYLES.war, names = new Set(Object.keys(models())), shown = [], told = new Map(), tell = (k, v) => told.set(k, [...(told.get(k) || []), v]); // notes, one line a kind
  const colour = (v) => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => Number.isFinite(x) && x >= 0 && x <= 255);
  const same = (want, got, where) => { // the shape War table gives: the same keys, numbers where numbers, arrays of the same length
    if (/\.sculpt$/.test(where)) { if (!Array.isArray(got) || !got.every((x) => want.includes(x))) bad.push(`style ${where}: wants a list drawn from ${want.join(", ")}`); return; } // a list of kinds, not a vector: any of War table's, in any number
    if (Array.isArray(want)) { if (!Array.isArray(got) || got.length !== want.length) return bad.push(`style ${where}: wants ${want.length} values`); want.forEach((w, i) => same(w, got[i], `${where}[${i}]`)); }
    else if (want && typeof want === "object") { if (!got || typeof got !== "object") return bad.push(`style ${where}: wants a table`); for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) if (!(k in want)) bad.push(`style ${where}.${k}: not a key War table has`); else if (!(k in got)) bad.push(`style ${where}.${k}: missing`); else same(want[k], got[k], `${where}.${k}`); }
    else if (typeof got !== typeof want || (typeof got === "number" && !Number.isFinite(got))) bad.push(`style ${where}: wants a ${typeof want}`);
  };
  const { models: _m, lamp: _l, ...root0 } = W;
  for (const [key, s] of Object.entries(STYLES)) {
    const { models: swap, lamp, ...rest } = s;
    same(root0, rest, key);
    for (const [k, v] of Object.entries(swap)) if (!names.has(k) || (v !== "" && !names.has(v))) bad.push(`style ${key}.models: ${k} to ${v} is not a model`);
    for (const [k, v] of Object.entries(lamp)) if (["name", "set", "pack", "models", "kit", "seats", "lamp"].includes(k) || !(k in W)) bad.push(`style ${key}.lamp.${k}: lamplight may change light, colour and surfaces only`); else same(W[k], v, `${key}.lamp.${k}`);
    for (const c of [...s.pal, s.table.baize, s.table.rule, s.table.tone, s.surface.wash, s.surface.rim, s.surface.contour, s.surface.sea, s.map.wash]) if (!colour(c)) bad.push(`style ${key}: ${JSON.stringify(c)} is not a colour`);
    if (!SEATS[s.seats]) bad.push(`style ${key}.seats: ${s.seats} is not a seat set`);
    if (s.pack && !existsSync(path.join(root, "site/models", s.pack))) bad.push(`style ${key}.pack: site/models/${s.pack} is missing`);
    if (!s.kit.cast && s.tone[1] >= 0.9) bad.push(`style ${key}: pieces would show no owner's colour (the tone greys it, and there is no enamel base)`);
    if (s.kit.base < 0.8 || s.kit.base * s.scale > 1.6) bad.push(`style ${key}.kit.base: a piece must keep to its cell`);
    // seat colours as this style's ground shows them, against the land they spread over
    const lands = LANDS.map((l) => washed(l, s)), dark = darkBoard(s);
    for (const [set, def] of Object.entries(SEATS)) {
      if (!def.light) continue;
      if (![def.light, def.dark || def.light].every((v) => v.length === 6 && v.every(([n, c]) => n && colour(c)))) { bad.push(`seat set ${set}: wants six named colours`); continue; }
      const list = seatsOf(set, key), rgbs = list.map(([, c]) => washed(c, s, s.surface.own)), low = Math.min(...rgbs.flatMap((c) => lands.map((l) => contrast(c, l))));
      const promise = set === "contrast" || set === s.seats; // High contrast everywhere, and a style's own default set on its own board
      if (low < 3 && promise) bad.push(`${s.name}, ${def.name} seats: ${low.toFixed(2)}:1 against the ${dark ? "dark" : "light"} land, under 3:1`);
      else if (low < 3) tell(`${def.name} seats under 3:1 against the land (borders and patterns carry it)`, `${s.name} ${low.toFixed(2)}`);
      for (const [v, m] of Object.entries(VISION)) {
        const [d, i, j] = nearest(rgbs, m), floor = set === "safe" ? 0.06 : 0.03;
        if (d < floor) bad.push(`${s.name}, ${def.name} seats: ${list[i][0]} and ${list[j][0]} are ${d.toFixed(3)} apart in ${v} vision, under ${floor}`);
        else if (d < 0.06) tell(`${def.name} seats close in ${v} vision (patterns carry it)`, `${s.name} ${list[i][0]} and ${list[j][0]} ${d.toFixed(3)}`);
      }
      // greyscale: High contrast must also part every two seats by lightness alone
      const [g, i, j] = rgbs.flatMap((a, i) => rgbs.slice(i + 1).map((b, k) => [contrast(a, b), i, i + 1 + k])).sort((a, b) => a[0] - b[0])[0];
      if (g < 1.1 && set === "contrast") bad.push(`${s.name}, ${def.name} seats: ${list[i][0]} and ${list[j][0]} are ${g.toFixed(2)}:1 in greyscale, under 1.1:1`);
      else if (g < 1.1) tell(`${def.name} seats alike in greyscale (patterns carry it)`, `${s.name} ${list[i][0]} and ${list[j][0]} ${g.toFixed(2)}:1`);
      if (promise) shown.push(low);
    }
  }
  for (const [k, v] of told) note.push(`${k}: ${v.join(", ")}`);
  note.push(`styles: ${Object.keys(STYLES).length} packs and ${Object.keys(SEATS).length} seat sets checked; promised seat colours stand at least ${Math.min(...shown).toFixed(2)}:1 from their land`);
  return { bad, note };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf("--root"), root = at > 0 ? path.resolve(process.argv[at + 1]) : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const r = check(root, { release: process.argv.includes("--release") });
  if (at < 0) { // the map report card, quick sweep: stops on a check the maps pass now, notes the to-do list (tools/report.mjs)
    const card = await import("./report.mjs"), v = card.verdict(card.sweep({ seeds: 2 }));
    r.bad.push(...v.bad);
    r.note.push(...v.note);
  }
  if (existsSync(path.join(root, "src/map/style.js"))) { const v = await styleGate(root); r.bad.push(...v.bad); r.note.push(...v.note); }
  for (const n of r.note) console.log("note  " + n);
  for (const b of r.bad) console.log("STOP  " + b);
  console.log(`${r.files} files ship, ${(r.total / KB).toFixed(1)} kB compressed (guide ${LIMITS.first / KB}, not a limit). ${r.bad.length ? r.bad.length + " to fix" : "All clear"}.`);
  process.exitCode = r.bad.length ? 1 : 0;
}
