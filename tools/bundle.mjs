// SPDX-License-Identifier: AGPL-3.0-or-later
// Makes one self-contained page that opens by double-click, with no server. node tools/bundle.mjs
// Each module becomes a function; imports and exports become plain objects. Only the forms this project uses are understood.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function bundle(entry) {
  const done = new Map(), parts = [];
  const add = (file) => {
    if (done.has(file)) return done.get(file);
    const id = done.size, names = [];
    done.set(file, id);
    let t = readFileSync(file, "utf8");
    const from = (spec) => { if (!spec.startsWith(".")) throw new Error(`${file}: cannot bundle ${spec}`); return add(path.resolve(path.dirname(file), spec)); };
    const pairs = (list, sep) => list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, sep)).join(", ");
    t = t.replace(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?$/gm, (_, list, spec) => `const { ${pairs(list, ": ")} } = $m[${from(spec)}];`);
    t = t.replace(/^export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?$/gm, (_, list, spec) => { const n = from(spec); return list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `$x.${x} = $m[${n}].${x};`).join(" "); });
    t = t.replace(/^export\s+(const|let|function\*?|class)\s+([\w$]+)/gm, (_, kind, name) => { names.push(name); return `${kind} ${name}`; });
    if (/^\s*(?:import|export)\b/m.test(t.replace(/\/\*[\s\S]*?\*\//g, ""))) throw new Error(`${file}: an import or export this tool does not understand`);
    parts.push(`$m[${id}] = (($x) => {\n${t}\n${names.map((n) => `$x.${n} = ${n};`).join(" ")}\nreturn $x; })({});`);
    return id;
  };
  add(path.resolve(entry));
  return `"use strict";\nconst $m = [];\n${parts.join("\n")}`;
}

export function page(html, css, js) {
  const safe = js.replace(/<\/script/gi, "<\\/script"), hash = createHash("sha256").update(`\n${safe}\n`).digest("base64");
  return html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, () => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">`)
    .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}</style>`)
    .replace(/<a href="\.\/" class="text">Capo<\/a>/, "")
    .replace(/<script type="module"[^>]*><\/script>/, () => `<script>\n${safe}\n</script>`);
}

if (process.argv[1]?.endsWith("bundle.mjs")) {
  const at = (f) => readFileSync(path.join(root, "site", f), "utf8"), out = path.join(root, "dist");
  mkdirSync(out, { recursive: true });
  const text = page(at("inch.html"), at("inch.css"), `(() => {\n${bundle(path.join(root, "site", "inch.js"))}\n})();`);
  writeFileSync(path.join(out, "play-inch.html"), text);
  console.log(`dist/play-inch.html, ${Math.round(text.length / 1000)} kB. Open it by double-click.`);
}
