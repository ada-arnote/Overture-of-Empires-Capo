// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { check, rows } from "../tools/check.mjs";
import { find, makeServer } from "../tools/serve.mjs";
import { bundle, page } from "../tools/bundle.mjs";
import { chance, fingerprint, seedState } from "../src/core/index.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MARK = "// SPDX-License-Identifier: AGPL-3.0-or-later\n";

/** A copy of what ships, with changes, checked and thrown away. */
function withFiles(files, opts) {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-check-"));
  try {
    for (const d of ["src", "site", "maps"]) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
    for (const f of ["CREDITS.csv", "ADAPTED.csv", "NOTICES.md"]) cpSync(path.join(root, f), path.join(dir, f));
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      if (text === null) rmSync(path.join(dir, f)); else writeFileSync(path.join(dir, f), text);
    }
    return check(dir, opts);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const stops = (files, re, opts) => { const { bad } = withFiles(files, opts); assert.ok(bad.some((b) => re.test(b)), `wanted ${re}, got ${JSON.stringify(bad)}`); };
const clear = (files) => assert.deepEqual(withFiles(files).bad, []);
const noted = (files, re) => { const { bad, note } = withFiles(files); assert.ok(note.some((n) => re.test(n)), `wanted a note ${re}, got ${JSON.stringify(note)}`); assert.ok(!bad.some((b) => re.test(b)), "a size guide never stops"); }; // sizes are reported, not limited (ruling 141)

test("the gate is clear for what is here now", () => assert.deepEqual(check(root).bad, []));
test("a release needs the licence text and a source address", () => {
  stops({}, /LICENSE is missing/, { release: true });
  stops({ "site/config.js": MARK + 'export const SOURCE_URL = "";\nexport const VERSION = "1";\n' }, /no source address/, { release: true });
  // the AI services stay as they are: the Capo page's connect-src must match them (p5-ai)
  const services = readFileSync(path.join(root, "site/config.js"), "utf8").match(/export const AI_BASES[\s\S]*?\};\n/)[0];
  const ok = withFiles({ LICENSE: "GNU AFFERO GENERAL PUBLIC LICENSE", "site/config.js": MARK + 'export const SOURCE_URL = "https://example.org/capo";\nexport const VERSION = "1";\n' + services }, { release: true });
  assert.deepEqual(ok.bad, []);
});
test("rules code may not use chance, the clock, the page, uneven maths or language settings", () => {
  for (const [code, re] of [["Math.random()", /chance/], ["Date.now()", /clock/], ["performance.now()", /clock/], ["Math.sin(1)", /maths/], ["Math.sqrt(2)", /maths/], ["document.title", /page/], ["fetch('x')", /page/], ["[].toLocaleString()", /language/], ["'a'.localeCompare('b')", /language/]]) stops({ "src/games/x.js": `${MARK}export const x = () => ${code};\n` }, re);
  clear({ "src/games/x.js": `${MARK}// Math.random and Date.now are only words here\nexport const x = "document.title, Math.sin";\n` });
});
test("parts may only import what they are allowed to", () => {
  stops({ "src/games/x.js": `${MARK}import { a } from "../map/a.js";\nexport { a };\n` }, /may not import src\/map/);
  stops({ "src/map/x.js": `${MARK}import { canon } from "../core/index.js";\nexport { canon };\n` }, /may not import src\/core/);
  stops({ "src/core/x.js": `${MARK}import fs from "node:fs";\nexport { fs };\n` }, /may not import node:fs/);
  stops({ "src/games/x.js": `${MARK}export const x = () => import("../map/a.js");\n` }, /may not import/);
  clear({ "src/games/x.js": `${MARK}import { canon } from "../core/index.js";\nexport { canon };\n` });
});
test("outside addresses, markup from text, and code from text are stopped", () => {
  stops({ "site/x.js": `${MARK}fetch("https://example.com/a");\n` }, /outside address/);
  stops({ "site/x.css": "@import url(https://example.com/a.css);" }, /outside address/);
  stops({ "site/x.js": `${MARK}document.body.innerHTML = location.hash;\n` }, /markup/);
  stops({ "site/x.js": `${MARK}eval("1");\n` }, /code/);
  stops({ "site/x.html": '<script src="https://example.com/a.js"></script>' }, /outside address/);
  clear({ "site/x.html": '<a href="https://example.com/">A link to follow</a>' });
});
test("file types, sizes, marks and dashes", () => {
  stops({ "site/x.exe": "x" }, /do not ship/);
  noted({ "site/x.json": "x".repeat(250001) }, /above the 250 kB guide/);
  stops({ "site/x.js": "export const a = 1;\n" }, /licence mark/);
  stops({ "site/x.html": "a \u2014 b" }, /em dash/);
  let noise = ""; const d = chance(seedState("noise")); while (noise.length < 200000) noise += d.below(2 ** 32).toString(36);
  noted({ "src/core/x.js": `${MARK}export const x = "${noise}";\n` }, /src\/core: .*above its 12 kB guide/);
});
test("line counts are reported against their guide", () => noted({ "src/core/x.js": MARK + "export const a = 1;\n".repeat(1).concat("\n".repeat(800)) }, /lines, above its \d+-line guide/));
test("borrowed pictures and adapted code need their rows", () => {
  stops({ "site/icons/a.png": "x" }, /no row in CREDITS/);
  stops({ "site/a.js": `${MARK}// Adapted from somewhere\n` }, /no row in ADAPTED/);
  const head = readFileSync(path.join(root, "CREDITS.csv"), "utf8");
  clear({ "site/icons/a.png": "x", "CREDITS.csv": head + 'site/icons/a.png,"A, picture",Someone,CC0-1.0,https://example.org,2026-11-25,none\n' });
  stops({ "site/icons/a.png": "x", "CREDITS.csv": head + "site/icons/a.png,A,Someone,CC-BY-NC-4.0,x,2026-11-25,none\n" }, /may not ship/);
  stops({ "site/icons/a.png": "x", "CREDITS.csv": head + "site/icons/a.png,A,,CC0-1.0,x,2026-11-25,none\n" }, /not complete/);
  stops({ "CREDITS.csv": head + "site/gone.png,A,B,CC0-1.0,x,2026-11-25,none\n" }, /does not exist/);
  stops({ "ADAPTED.csv": "a,b\n" }, /first line must be/);
  stops({ "NOTICES.md": null }, /NOTICES/);
});
const HEAD = readFileSync(path.join(root, "CREDITS.csv"), "utf8"), NOTES = readFileSync(path.join(root, "NOTICES.md"), "utf8");
const OFL = "Copyright 2017 The Test Sans Project Authors\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n\nSIL OPEN FONT LICENSE\nVersion 1.1 - 26 February 2007\n";
test("a font ships with its OFL text and copyright beside it and a line in NOTICES.md; an OFL row passes", () => {
  const font = "site/fonts/test/test-400.woff2", files = { [font]: "wOF2", "CREDITS.csv": HEAD + `${font},Test Sans,Test Sans Project Authors,OFL-1.1,https://example.org,2026-11-26,subset\n`, "NOTICES.md": NOTES + "\nTest Sans, in site/fonts/test/, is under the SIL Open Font License 1.1; its text is beside it.\n" };
  clear({ ...files, "site/fonts/test/OFL.txt": OFL });
  stops(files, /test-400\.woff2: needs its OFL-1\.1 licence text/);
  stops({ ...files, "site/fonts/test/OFL.txt": "SIL OPEN FONT LICENSE Version 1.1" }, /with the copyright line/);
  stops({ ...files, "site/fonts/test/OFL.txt": OFL, "NOTICES.md": NOTES }, /NOTICES\.md must name it/);
  stops({ "site/fonts/test/OFL.txt": OFL, "site/fonts/test/a.js": MARK }, /only \.woff2 \.txt go in site\/fonts/);
  stops({ "site/a.woff2": "wOF2", "CREDITS.csv": HEAD + "site/a.woff2,A,B,OFL-1.1,x,2026-11-26,none\n" }, /ship only from site\/fonts/);
});
test("MIT and ISC icons pass with their notice text and copyright line in NOTICES.md", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  for (const [licence, words] of [["MIT", "Permission is hereby granted, free of charge, to any person obtaining a copy"], ["ISC", "Permission to use, copy, modify, and/or distribute this software for any purpose"]]) {
    const icon = "site/icons/set/menu.svg", credits = HEAD + `${icon},Menu,Icon Makers,${licence},https://example.org,2026-11-26,none\n`;
    clear({ [icon]: svg, "CREDITS.csv": credits, "NOTICES.md": NOTES + `\nThe icons in site/icons/set/: Copyright (c) 2026 Icon Makers. ${words}.\n` });
    stops({ [icon]: svg, "CREDITS.csv": credits, "NOTICES.md": NOTES + "\nThe icons in site/icons/set/.\n" }, new RegExp(`${licence} notice text`));
    stops({ [icon]: svg, "CREDITS.csv": credits, "NOTICES.md": NOTES + `\nCopyright (c) 2026 Icon Makers. ${words}.\n` }, /must name it or site\/icons\/set\//);
  }
});
test("assets have their own budgets, counted at full size and apart from the site code budget", () => {
  const credit = (f) => `${f},A,Someone,CC0-1.0,https://example.org,2026-11-26,none\n`, s = "site/sounds/a.ogg", f = "site/fonts/a/a.woff2", i = "site/icons/a.webp";
  noted({ [s]: "x".repeat(61000), "CREDITS.csv": HEAD + credit(s) }, /site\/sounds: 61 kB, above its 60 kB asset guide/);
  { const { bad } = withFiles({ [s]: "x".repeat(59000), "CREDITS.csv": HEAD + credit(s) }); assert.deepEqual(bad.filter((x) => /site\/sounds|^site:/.test(x)), [], JSON.stringify(bad)); } // 59 kB fits the sound shelf and is not counted as site code (the whole-site total is checked elsewhere)
  noted({ [f]: "x".repeat(111000), "CREDITS.csv": HEAD + credit(f), "NOTICES.md": NOTES + "\nsite/fonts/a/\n" }, /site\/fonts: \d+ kB, above its 110 kB/);
  noted({ [i]: "x".repeat(26000), "CREDITS.csv": HEAD + credit(i) }, /site\/icons: \d+ kB, above its 25 kB/);
  stops({ "site/a.ogg": "x", "CREDITS.csv": HEAD + credit("site/a.ogg") }, /ship only from/);
});
test("textures have their own 32 kB budget, at full size, for WebP and PNG tiles only", () => {
  const credit = (f) => `${f},A,Someone,CC0-1.0,https://example.org,2026-11-26,none\n`, t = "site/textures/a.webp", used = check(root).assets["site/textures"];
  noted({ [t]: "x".repeat(32001 - used), "CREDITS.csv": HEAD + credit(t) }, /site\/textures: \d+ kB, above its 32 kB asset guide/);
  clear({ [t]: "x".repeat(31999 - used), "CREDITS.csv": HEAD + credit(t) });
  stops({ "site/textures/a.svg": "<svg/>", "CREDITS.csv": HEAD + credit("site/textures/a.svg") }, /only \.webp \.png \.txt go in site\/textures/);
  stops({ "site/textures/a.png": "x" }, /no row in CREDITS/);
});
test("screenshots have their own 120 kB budget, at full size, for WebP only", () => {
  const credit = (f) => `${f},A,Someone,own work,taken from this project's pages,2026-11-26,none
`, t = "site/shots/a.webp", used = check(root).assets["site/shots"];
  noted({ [t]: "x".repeat(120001 - used), "CREDITS.csv": HEAD + credit(t) }, /site\/shots: \d+ kB, above its 120 kB asset guide/);
  stops({ "site/shots/a.png": "x", "CREDITS.csv": HEAD + credit("site/shots/a.png") }, /only \.webp \.txt go in site\/shots/);
});
test("site pages keep their rule: nothing by default, trusted types, fonts and sounds only from their own site", () => {
  const meta = (rule) => `<meta http-equiv="Content-Security-Policy" content="${rule}">`, ok = "default-src 'none'; script-src 'self'; font-src 'self'; media-src 'self'; require-trusted-types-for 'script'";
  clear({ "site/x.html": meta(ok) });
  stops({ "site/x.html": meta(ok.replace("font-src 'self'", "font-src 'self' https:")) }, /needs font-src with only/);
  stops({ "site/x.html": meta(ok.replace(" media-src 'self';", "")) }, /needs media-src/);
  stops({ "site/x.html": meta(ok.replace("; require-trusted-types-for 'script'", "")) }, /require-trusted-types-for/);
  stops({ "site/x.html": meta(ok.replace("default-src 'none'", "default-src 'self'")) }, /default-src 'none'/);
});
test("bundled pages: served ones take fonts and sounds from their site, double-click ones carry them as data:", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-assets-"));
  try {
    for (const [f, b] of [["fonts/a.woff2", "wOF2"], ["sounds/a.ogg", "OggS"], ["icons/a.svg", "<svg/>"]]) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), b); }
    const html = readFileSync(path.join(root, "site/inch.html"), "utf8"), css = '@font-face { font-family: T; src: url("fonts/a.woff2"); } .x { background: url(icons/a.svg); }', js = 'const cue = new Audio("sounds/a.ogg");';
    const served = page(html, css, js, "../site/", false, dir), alone = page(html, css, js, "", false, dir), rule = (h) => h.match(/Content-Security-Policy" content="([^"]*)"/)[1];
    assert.match(rule(served), /^default-src 'none'; .*img-src 'self' data:; font-src 'self'; media-src 'self';.* require-trusted-types-for 'script'$/);
    assert.match(rule(alone), /^default-src 'none'; .*img-src data:; font-src data:; media-src data:;.* require-trusted-types-for 'script'$/);
    assert.ok(!/'self'|:\/\//.test(rule(alone)));
    assert.ok(served.includes('url("../site/fonts/a.woff2")') && served.includes("url(../site/icons/a.svg)") && served.includes('"../site/sounds/a.ogg"'));
    const b64 = (t) => Buffer.from(t).toString("base64");
    assert.ok(alone.includes(`url("data:font/woff2;base64,${b64("wOF2")}")`) && alone.includes(`url(data:image/svg+xml;base64,${b64("<svg/>")})`) && alone.includes(`"data:audio/ogg;base64,${b64("OggS")}"`));
    const body = alone.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.ok(alone.includes(`sha256-${createHash("sha256").update(body).digest("base64")}`));
    assert.throws(() => page(html, 'b { src: url("fonts/gone.woff2"); }', js, "", false, dir), /no such file/);
    assert.throws(() => page(html, css, 'x("sounds/../../a.ogg")', "", false, dir), /no such file/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("the CSV reader handles quotes and commas", () => assert.deepEqual(rows('a,"b, c","d ""e"""\n\n1,,3\n'), [["a", "b, c", 'd "e"'], ["1", "", "3"]]));
test("the page and package carry the same version", () => {
  const v = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
  assert.ok(readFileSync(path.join(root, "site/config.js"), "utf8").includes(`"${v}"`));
});
test("the server gives only open folders, and nothing outside", async () => {
  for (const ok of ["/site/", "/src/core/index.js", "/site/style.css?x=1"]) assert.ok(await find(root, ok), ok);
  for (const no of ["/package.json", "/docs/decisions.md", "/docs/", "/../package.json", "/site/../package.json", "/site/%2e%2e/package.json", "/site/..%2fpackage.json", "/site/..%5cpackage.json", "/.gitignore", "/site/.x.js", "/src", "/tools/check.mjs", "/site/%00.js", "/site/%", "/C:/Windows/win.ini", "//docs/README.md", "/relay/README.md"]) assert.equal(await find(root, no), null, no);
});
test("the server answers with safe headers and refuses to take anything", async () => {
  const s = makeServer(root);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const at = `http://127.0.0.1:${s.address().port}`, a = await fetch(at + "/");
    assert.equal(a.status, 200); assert.equal(a.headers.get("x-content-type-options"), "nosniff"); const page = await a.text(); assert.match(page, /<h1>Overture of Empires: Capo<\/h1>/); assert.ok(a.url.endsWith("/site/"));
    for (const m of page.matchAll(/(?:href|src)="([^":]+)"/g)) assert.equal((await fetch(new URL(m[1], a.url))).status, 200, m[1]);
    assert.equal((await fetch(at + "/docs/decisions.md")).status, 404); assert.equal((await fetch(at + "/", { method: "POST", body: "x" })).status, 405);
  } finally { s.close(); s.closeAllConnections(); }
});
test("the double-click page holds everything: no imports, no outside files, and its script is the one its rule allows", () => {
  for (const name of ["inch", "fable", "banners"]) {
  const js = bundle(path.join(root, `site/${name}.js`));
  new vm.Script(`(() => {${js}})();`);
  const html = page(readFileSync(path.join(root, `site/${name}.html`), "utf8"), "body{}", js);
  assert.ok(!/<link rel="stylesheet"|type="module"|src="/.test(html));
  const body = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.ok(html.includes(`sha256-${createHash("sha256").update(body).digest("base64")}`));
  }
});
