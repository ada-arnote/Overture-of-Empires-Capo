// SPDX-License-Identifier: AGPL-3.0-or-later
// Makes one self-contained page for each game, that opens by double-click, with no server. node tools/bundle.mjs
// The same pages go in play/, which is what the web address serves: one file cannot be half an old version.
// Each module becomes a function; imports and exports become plain objects. Only the forms this project uses are understood.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The names one `const a = ..., b = ...;` declares, starting after the keyword. */
function declared(text, from) {
  const names = [];
  let depth = 0, quote = "", start = from;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    // comments are skipped whole, so an apostrophe in one is not taken for a quote
    if (c === "/" && text[i + 1] === "/") { const e = text.indexOf("\n", i); i = e < 0 ? text.length : e - 1; continue; }
    if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (depth === 0 && (c === "," || c === ";")) {
      const m = text.slice(start, i).match(/^\s*([\w$]+)\s*=/);
      if (m) names.push(m[1]);
      start = i + 1;
      if (c === ";") break;
    }
  }
  return names;
}

export function bundle(entry) {
  const done = new Map(), parts = [], gives = [];
  const need = (file, list, id) => { for (const x of list.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!gives[id].includes(x)) throw new Error(`${file}: ${x} is not exported where it is imported from`); };
  const add = (file) => {
    if (done.has(file)) return done.get(file);
    const id = done.size, names = gives[done.size] = [];
    done.set(file, id);
    let t = readFileSync(file, "utf8");
    const from = (spec) => { if (!spec.startsWith(".")) throw new Error(`${file}: cannot bundle ${spec}`); return add(path.resolve(path.dirname(file), spec)); };
    const pairs = (list, sep) => list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, sep)).join(", ");
    t = t.replace(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?$/gm, (_, list, spec) => { const n = from(spec); need(file, list, n); return `const { ${pairs(list, ": ")} } = $m[${n}];`; });
    t = t.replace(/^export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?$/gm, (_, list, spec) => { const n = from(spec); need(file, list, n); names.push(...list.split(",").map((x) => x.trim()).filter(Boolean)); return list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `$x.${x} = $m[${n}].${x};`).join(" "); });
    t = t.replace(/^export\s+(const|let|(?:async\s+)?function\*?|class)\s+([\w$]+)/gm, (all, kind, name, at, whole) => { names.push(...(kind === "const" || kind === "let" ? declared(whole, at + all.length - name.length) : [name])); return `${kind} ${name}`; });
    if (/^\s*(?:import|export)\b/m.test(t.replace(/\/\*[\s\S]*?\*\//g, ""))) throw new Error(`${file}: an import or export this tool does not understand`);
    parts.push(`$m[${id}] = (($x) => {\n${t}\n${names.filter((n) => !t.includes(`$x.${n} = $m`)).map((n) => `$x.${n} = ${n};`).join(" ")}\nreturn $x; })({});`);
    return id;
  };
  add(path.resolve(entry));
  return `"use strict";\nconst $m = [];\n${parts.join("\n")}`;
}

const KINDS = { woff2: "font/woff2", ogg: "audio/ogg", mp3: "audio/mpeg", svg: "image/svg+xml", png: "image/png", webp: "image/webp" };

/** Points a page at the site's fonts, icons and sounds, named as whole quoted or url() paths relative to site/ ("sounds/move.ogg"):
 *  from the site when served (home is the way back to site/), or inlined as data: when the page has to stand alone. */
export function assets(text, home, from) {
  return text.replace(/(["'(])(?:\.\/)?((?:fonts|icons|sounds)\/[\w./-]+?\.(woff2|ogg|mp3|svg|png|webp))(?=["')])/g, (_, q, ref, ext) => {
    const file = path.join(from, ref);
    if (ref.split("/").includes("..") || !existsSync(file)) throw new Error(`${ref}: no such file in site/`);
    return q + (home ? home + ref : `data:${KINDS[ext]};base64,${readFileSync(file).toString("base64")}`);
  });
}

export function page(html, css, js, home = "", fetches = false, from = path.join(root, "site")) {
  const safe = assets(js, home, from).replace(/<\/script/gi, "<\\/script"), hash = createHash("sha256").update(`\n${safe}\n`).digest("base64");
  // a page that fetches keeps the addresses it may reach (its own site for map data, an AI for the story); the games reach nothing
  const reach = html.match(/connect-src ([^;"]*)/)?.[1]?.trim() || "", talk = fetches && reach ? ` connect-src ${reach};` : "";
  // served pages load fonts, pictures and sounds from their own site; the double-click page carries them inside, as data:
  const own = home ? "'self'" : "data:", img = home ? "'self' data:" : "data:";
  return assets(html, home, from)
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, () => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src ${img}; font-src ${own}; media-src ${own};${talk} base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'">`)
    .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${assets(css, home, from)}</style>`)
    .replace(/<a href="\.\/" class="text">All games<\/a>/, home ? `<a href="${home}" class="text">All games</a>` : "")
    .replace(/<script type="module"[^>]*><\/script>/, () => `<script>\n${safe}\n</script>`);
}

if (process.argv[1]?.endsWith("bundle.mjs")) {
  const at = (f) => readFileSync(path.join(root, "site", f), "utf8"), out = path.join(root, "dist");
  mkdirSync(out, { recursive: true });
  for (const name of ["inch", "fable", "banners", "glass", "world", "game"]) {
    // each page is stamped with a short fingerprint of its own code, so the footer says exactly which build is live
    const raw = `(() => {\n${bundle(path.join(root, "site", `${name}.js`))}\n})();`, stamp = createHash("sha256").update(raw).digest("hex").slice(0, 8);
    const fetches = ["world", "game"].includes(name), js = raw.replace('const BUILD = "dev";', `const BUILD = "${stamp}";`), text = page(at(`${name}.html`), at("table.css"), js, "", fetches);
    mkdirSync(path.join(root, "play"), { recursive: true });
    writeFileSync(path.join(root, "play", `${name}.html`), page(at(`${name}.html`), at("table.css"), js, "../site/", fetches));
    writeFileSync(path.join(out, `play-${name}.html`), text);
    console.log(`dist/play-${name}.html, ${Math.round(text.length / 1000)} kB. Open it by double-click.`);
  }
}
