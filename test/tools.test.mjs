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
    for (const d of ["src", "site"]) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
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

test("the gate is clear for what is here now", () => assert.deepEqual(check(root).bad, []));
test("a release needs the licence text and a source address", () => {
  stops({}, /LICENSE is missing/, { release: true });
  stops({ "site/config.js": MARK + 'export const SOURCE_URL = "";\nexport const VERSION = "1";\n' }, /no source address/, { release: true });
  const ok = withFiles({ LICENSE: "GNU AFFERO GENERAL PUBLIC LICENSE", "site/config.js": MARK + 'export const SOURCE_URL = "https://example.org/capo";\nexport const VERSION = "1";\n' }, { release: true });
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
  stops({ "site/x.json": "x".repeat(250001) }, /over the 250 kB/);
  stops({ "site/x.js": "export const a = 1;\n" }, /licence mark/);
  stops({ "site/x.html": "a \u2014 b" }, /em dash/);
  let noise = ""; const d = chance(seedState("noise")); while (noise.length < 200000) noise += d.below(2 ** 32).toString(36);
  stops({ "src/core/x.js": `${MARK}export const x = "${noise}";\n` }, /src\/core: .*over 12 kB/);
});
test("line ceilings hold", () => stops({ "src/core/x.js": MARK + "export const a = 1;\n".repeat(1).concat("\n".repeat(800)) }, /lines is over its ceiling/));
test("borrowed pictures and adapted code need their rows", () => {
  stops({ "site/a.png": "x" }, /no row in CREDITS/);
  stops({ "site/a.js": `${MARK}// Adapted from somewhere\n` }, /no row in ADAPTED/);
  const head = readFileSync(path.join(root, "CREDITS.csv"), "utf8");
  clear({ "site/a.png": "x", "CREDITS.csv": head + 'site/a.png,"A, picture",Someone,CC0-1.0,https://example.org,2026-11-25,none\n' });
  stops({ "site/a.png": "x", "CREDITS.csv": head + "site/a.png,A,Someone,CC-BY-NC-4.0,x,2026-11-25,none\n" }, /may not ship/);
  stops({ "site/a.png": "x", "CREDITS.csv": head + "site/a.png,A,,CC0-1.0,x,2026-11-25,none\n" }, /not complete/);
  stops({ "CREDITS.csv": head + "site/gone.png,A,B,CC0-1.0,x,2026-11-25,none\n" }, /does not exist/);
  stops({ "ADAPTED.csv": "a,b\n" }, /first line must be/);
  stops({ "NOTICES.md": null }, /NOTICES/);
});
test("the CSV reader handles quotes and commas", () => assert.deepEqual(rows('a,"b, c","d ""e"""\n\n1,,3\n'), [["a", "b, c", 'd "e"'], ["1", "", "3"]]));
test("the page's own check expects the answer Node gives", () => {
  const d = chance(seedState("page check"));
  assert.ok(readFileSync(path.join(root, "site/main.js"), "utf8").includes(`"${fingerprint(Array.from({ length: 1000 }, () => d.die()))}"`));
});
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
    assert.equal(a.status, 200); assert.equal(a.headers.get("x-content-type-options"), "nosniff"); const page = await a.text(); assert.match(page, /<h1>Capo<\/h1>/); assert.ok(a.url.endsWith("/site/"));
    for (const m of page.matchAll(/(?:href|src)="([^":]+)"/g)) assert.equal((await fetch(new URL(m[1], a.url))).status, 200, m[1]);
    assert.equal((await fetch(at + "/docs/decisions.md")).status, 404); assert.equal((await fetch(at + "/", { method: "POST", body: "x" })).status, 405);
  } finally { s.close(); s.closeAllConnections(); }
});
test("the double-click page holds everything: no imports, no outside files, and its script is the one its rule allows", () => {
  const js = bundle(path.join(root, "site/inch.js"));
  new vm.Script(`(() => {${js}})();`);
  const html = page(readFileSync(path.join(root, "site/inch.html"), "utf8"), "body{}", js);
  assert.ok(!/<link rel="stylesheet"|type="module"|src="/.test(html));
  const body = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.ok(html.includes(`sha256-${createHash("sha256").update(body).digest("base64")}`));
});
