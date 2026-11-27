// SPDX-License-Identifier: AGPL-3.0-or-later
// Choose an AI (site/aiguide.js, ruling 153.8): free routes first, each route a real service with its steps, cost,
// expectations and links to the service's own pages; the help covers the errors the page gives; built from text only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS, explain } from "../site/ai.js";
import { AI_BASES, AI_LINKS } from "../site/config.js";
import { CHECKED, HELP, ROUTES, guideParts } from "../site/aiguide.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("free routes come first, then this computer, then paid; each is a service the page can reach", () => {
  const groups = ROUTES.map((x) => x.group);
  assert.deepEqual([...new Set(groups)], ["free", "home", "paid"]);
  assert.deepEqual(groups, [...groups].sort((a, b) => ["free", "home", "paid"].indexOf(a) - ["free", "home", "paid"].indexOf(b)));
  for (const want of ["openrouter", "gemini", "groq"]) assert.equal(ROUTES.find((x) => x.preset === want).group, "free");
  for (const want of ["ollama", "lmstudio", "bridge"]) assert.equal(ROUTES.find((x) => x.preset === want).group, "home");
  const ids = new Set(PRESETS.map((p) => p.id));
  for (const x of ROUTES) {
    assert.ok(ids.has(x.preset), x.preset);
    assert.ok(x.steps.length >= 3 && x.cost && x.expect && x.tag, x.name);
    assert.ok(x.links.length, `${x.name} links to its own pages`);
    for (const [, k] of x.links) assert.ok(k === "source" || AI_LINKS[k], `${x.name}: ${k}`);
  }
  assert.ok(ROUTES.find((x) => x.preset === "openrouter").model.endsWith("/free"));
});

test("every link is https, and none is an address the page calls: its rule does not change", () => {
  for (const [k, u] of Object.entries(AI_LINKS)) {
    assert.equal(new URL(u).protocol, "https:", k);
    assert.ok(!Object.values(AI_BASES).some((b) => u.startsWith(b)), `${k} is a page to read, not an address the page calls`);
  }
  const config = readFileSync(path.join(root, "site/config.js"), "utf8");
  assert.ok(config.indexOf("AI_LINKS") < config.indexOf("AI_BASES"), "the links sit above the services the gate reads");
  const csp = readFileSync(path.join(root, "site/game.html"), "utf8").match(/connect-src ([^;]*)/)[1];
  for (const u of Object.values(AI_LINKS)) if (!Object.values(AI_BASES).some((b) => new URL(b).origin === new URL(u).origin)) assert.ok(!csp.includes(new URL(u).origin), u);
});

test("the help answers each error the page gives, by the words it shows", () => {
  const p = PRESETS[0];
  const said = { key: explain(401, "", { p }), credit: explain(402, "", { p }), rate: explain(429, "", { p }), model: explain(404, "", { p, model: "x" }), denied: explain(403, "", { p }), busy: explain(503, "", { p }) };
  for (const [kind, e] of Object.entries(said)) {
    assert.equal(e.kind, kind);
    const h = HELP.find(([k]) => k === kind);
    assert.ok(h && e.message.includes(h[1]), `${kind}: "${e.message}"`);
  }
  for (const k of ["blocked", "local", "time", "cut", "tools", "filter"]) assert.ok(HELP.some(([x]) => x === k), k);
});

test("the guide is built from text, says no AI is needed, and names its day of checking", () => {
  const made = [];
  class Node { constructor(tag) { this.tag = tag; this.kids = []; this.attrs = {}; this.dataset = {}; made.push(this); } append(...k) { this.kids.push(...k); } setAttribute(k, v) { this.attrs[k] = v; } }
  globalThis.document = { createElement: (t) => new Node(t) };
  try {
    const { head, parts } = guideParts(() => {}, () => {});
    assert.equal(head.textContent, "Choose an AI");
    const text = (n) => (typeof n === "string" ? n : `${n.textContent || ""} ${n.kids.map(text).join(" ")}`);
    const all = parts.map(text).join(" ");
    assert.match(all, /You do not need an AI: Advance moves the world by the rules/);
    assert.ok(all.includes(CHECKED) && /2026/.test(CHECKED));
    assert.ok(!/—/.test(all), "no em dash");
    assert.ok(!/claude code|claude desktop/i.test(all), "no AI app is named");
    const links = made.filter((n) => n.tag === "a");
    assert.ok(links.length >= ROUTES.length);
    for (const a of links) { assert.match(a.href, /^https:\/\//); assert.equal(a.target, "_blank"); assert.equal(a.rel, "noopener noreferrer"); }
    assert.equal(made.filter((n) => n.tag === "details").length, ROUTES.length);
    assert.ok(made.every((n) => !("innerHTML" in n)));
  } finally { delete globalThis.document; }
});
