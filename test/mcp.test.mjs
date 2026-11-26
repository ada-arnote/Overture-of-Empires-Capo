// SPDX-License-Identifier: AGPL-3.0-or-later
// The MCP bridge (tools/capo-mcp.mjs) and the page's side of it (site/aimore.js): the protocol by hand, the tokens,
// who may connect, a whole turn from the page through the bridge to an AI app and back, and orders an AI app proposes.
// Everything runs on 127.0.0.1 with made-up tokens; no AI and no outside address is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, VERSIONS, howTo, loadTokens, makeBridge, stdio } from "../tools/capo-mcp.mjs";
import { PRESETS, ask, forgetKeys, keyOf, loadRoute, setKey } from "../site/ai.js";
import { BRIDGE, aiHost, bridgeBase, bridgeCheck, proposals, unhear } from "../site/aimore.js";
import { SITE_URL, VERSION } from "../site/config.js";
import { BRIDGE_PORT, digest, judgeOrder, shapeOf } from "../src/story/bridge.js";
import { sampleReply } from "../src/story/replyform.js";
import { chatPrompt } from "../src/story/talk.js";
import { newWorldGame, readWorldReply, turnCode, worldPrompt } from "../src/story/turn.js";
import { PassThrough } from "node:stream";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), script = path.join(root, "tools", "capo-mcp.mjs");
const TOKENS = { page: "a".repeat(48), client: "b".repeat(48) }, SITE = new URL(SITE_URL).origin;
class Shelf { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } clear() { this.m.clear(); } }
for (const k of ["localStorage", "sessionStorage"]) Object.defineProperty(globalThis, k, { value: new Shelf(), configurable: true, writable: true });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const until = async (f, what) => { for (let i = 0; i < 200; i++) { if (f()) return; await sleep(10); } throw new Error(`never: ${what}`); };

// ---- a small world: Peru and Chile at war, with a third country beside them ----
const P = { "PER-1": { name: "Tacna", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" }, "CHL-2": { name: "Santiago", country: "CHL" }, "BOL-1": { name: "La Paz", country: "BOL" } };
const NB = { "PER-1": ["CHL-1", "BOL-1"], "CHL-1": ["PER-1", "CHL-2"], "CHL-2": ["CHL-1"], "BOL-1": ["PER-1"] }, NAMES = { PER: "Peru", CHL: "Chile", BOL: "Bolivia" };
const geoOf = (g) => {
  const owner = (id) => g.owners[id] || P[id].country;
  return { name: (c) => NAMES[c] || c, place: (id) => P[id], find: (s) => (P[s] ? s : null), owner, neighbours: (id) => NB[id], across: () => [], coastal: () => false,
    holds: (c) => Object.keys(P).filter((id) => owner(id) === c).length, known: (c) => !!NAMES[c], hasCoast: () => false, might: (c) => ({ PER: 3, CHL: 4, BOL: 2 })[c] };
};
const warGame = (seed, extra = {}) => ({ ...newWorldGame("PER", "nation", seed), wars: [{ pair: "CHL|PER", since: "2026-12-01", by: "PER" }], ...extra });
const promptOf = (g, to = "2027-01-01") => worldPrompt(g, { name: (c) => NAMES[c] || c, neighbours: () => ["CHL", "BOL"], size: () => 1, geo: geoOf(g), places: [] }, ["Strengthen the army."], to);

// ---- a bridge on a port of its own, and an AI app that calls it over HTTP ----
async function open(more = {}) {
  const said = [], bridge = makeBridge({ tokens: TOKENS, origins: [SITE], log: (s) => said.push(s), beat: 40, ...more }), server = createServer(bridge.http);
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port, at = `http://127.0.0.1:${port}`;
  let n = 0;
  const mcp = async (method, params, token = TOKENS.client) => { const r = await fetch(`${at}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const tool = async (name, args = {}) => (await mcp("tools/call", { name, arguments: args })).body.result;
  const close = async () => { unhear(); bridge.close(); server.closeAllConnections(); await new Promise((ok) => server.close(ok)); };
  const route = (extra = {}) => { const r = { ...loadRoute(), route: "address", preset: "bridge", bridgePort: port, ...extra }; setKey(r, TOKENS.page); return r; };
  return { bridge, server, port, at, mcp, tool, close, route, said };
}
/** A plain request, for the headers fetch will not let a test set. */
const raw = (port, { method = "GET", path: p = "/capo/hello", headers = {}, body } = {}) => new Promise((ok, no) => {
  const req = request({ host: "127.0.0.1", port, method, path: p, headers }, (res) => { let t = ""; res.on("data", (d) => { t += d; }); res.on("end", () => ok({ status: res.statusCode, headers: res.headers, text: t })); });
  req.on("error", no); req.end(body);
});
const fresh = () => { localStorage.clear(); sessionStorage.clear(); forgetKeys(); };

test("MCP by hand: initialize settles a version, tools are listed with their hints, and errors use JSON-RPC's codes", async () => {
  const { rpc } = makeBridge({ tokens: TOKENS });
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  assert.deepEqual([init.id, init.result.protocolVersion, init.result.serverInfo.name, init.result.serverInfo.version], [1, "2025-06-18", "capo-bridge", VERSION]);
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } }, "it offers tools and nothing else");
  assert.match(init.result.instructions, /capo_next[\s\S]*capo_reply/);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).result.protocolVersion, VERSIONS[0], "an unknown version is answered with the newest it speaks");
  assert.equal(await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }), null, "a notification gets no answer");
  assert.deepEqual((await rpc({ jsonrpc: "2.0", id: "p", method: "ping" })).result, {});
  const list = (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).result.tools;
  assert.deepEqual(list.map((t) => t.name), ["capo_next", "capo_reply", "capo_state", "capo_order"]);
  for (const t of list) { assert.equal(t.inputSchema.type, "object"); assert.equal(t.annotations.destructiveHint, false, `${t.name} destroys nothing`); assert.equal(t.annotations.openWorldHint, false); }
  assert.deepEqual(list.filter((t) => t.annotations.readOnlyHint).map((t) => t.name), ["capo_next", "capo_state"]);
  assert.equal(list, TOOLS);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 4, method: "resources/list" })).error.code, -32601);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "constructor" } })).error.code, -32602, "only its own four tools, never a name from the language");
  assert.equal((await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "capo_state", arguments: "x" } })).error.code, -32602);
  assert.equal((await rpc({ id: 7, method: "ping" })).error.code, -32600);
  assert.equal((await rpc([])).error.code, -32600);
  assert.equal(await rpc({ jsonrpc: "2.0", id: 9, result: {} }), null, "an answer to a question it never asked is let go");
  const both = await rpc([{ jsonrpc: "2.0", id: 10, method: "ping" }, { jsonrpc: "2.0", method: "notifications/cancelled" }, { jsonrpc: "2.0", id: 11, method: "nope" }]);
  assert.deepEqual(both.map((x) => x.id), [10, 11]);
  const idle = (await rpc({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "capo_next" } })).result;
  assert.match(idle.content[0].text, /Nothing is waiting/);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "capo_reply", arguments: { text: "EVENT: x" } } })).result.isError, true, "no reply without a prompt");
  assert.match((await rpc({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "capo_order", arguments: { verb: "PEACE", target: "CHL" } } })).result.content[0].text, /not listening/);
});

test("MCP over stdio: one JSON message a line, a broken line is a parse error, and nothing else is written", async () => {
  const { rpc } = makeBridge({ tokens: TOKENS }), input = new PassThrough(), output = new PassThrough(), lines = [];
  let ended = false;
  output.on("data", (d) => lines.push(...String(d).split("\n").filter(Boolean)));
  stdio(rpc, input, output, () => { ended = true; });
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })}\n\n{not json\n`);
  input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\r\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  await until(() => lines.length === 3, "three answers");
  const got = lines.map((l) => JSON.parse(l));
  assert.deepEqual(got.map((x) => x.id).sort(), [1, 2, null].sort());
  assert.equal(got.find((x) => x.id === null).error.code, -32700);
  assert.equal(got.find((x) => x.id === 1).result.protocolVersion, "2025-03-26");
  assert.ok(lines.every((l) => !l.includes("\n")));
  input.end(); await until(() => ended, "the end is told");
});

test("the tokens: made once, kept in a file, the same next time, and made anew only when asked", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-bridge-")), file = path.join(dir, "tokens.json");
  try {
    const a = loadTokens(file), b = loadTokens(file), c = loadTokens(file, true);
    assert.match(a.page, /^[a-f0-9]{48}$/); assert.match(a.client, /^[a-f0-9]{48}$/);
    assert.notEqual(a.page, a.client, "the page and the AI app each have their own");
    assert.deepEqual(b, a); assert.notEqual(c.page, a.page);
    assert.deepEqual(loadTokens(file), c);
    if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o077, 0, "only its owner may read the file");
    const how = howTo(8125, a, "/x/tools/capo-mcp.mjs");
    assert.ok(how.includes(a.page) && how.includes(a.client) && how.includes("claude mcp add"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("who may connect: this computer only, by name and by origin, and never without the right token", async () => {
  const b = await open();
  try {
    const auth = { Authorization: `Bearer ${TOKENS.page}` };
    assert.equal(b.server.address().address, "127.0.0.1");
    assert.equal((await raw(b.port)).status, 401, "no token");
    assert.equal((await raw(b.port, { headers: { Authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await raw(b.port, { headers: { Authorization: `Bearer ${TOKENS.client}` } })).status, 401, "the AI app's token does not open the page's door");
    assert.equal((await raw(b.port, { path: "/mcp", method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" })).status, 401, "nor the page's token the AI app's");
    assert.equal((await raw(b.port, { headers: auth })).status, 200);
    assert.equal((await raw(b.port, { headers: { ...auth, Host: "evil.example:80" } })).status, 403, "a name pointed at this computer from outside is refused");
    assert.equal((await raw(b.port, { headers: { ...auth, Origin: "https://evil.example" } })).status, 403, "another site's page is refused even with the token");
    assert.equal((await raw(b.port, { headers: { ...auth, Origin: "null" } })).status, 403, "a page opened as a file, unless the player allows it");
    const site = await raw(b.port, { headers: { ...auth, Origin: SITE } });
    assert.deepEqual([site.status, site.headers["access-control-allow-origin"]], [200, SITE], "Capo's own site may");
    assert.equal((await raw(b.port, { headers: { ...auth, Origin: "http://localhost:8124" } })).status, 200);
    const pre = await raw(b.port, { method: "OPTIONS", path: "/capo/ask", headers: { Origin: SITE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type", "Access-Control-Request-Private-Network": "true" } });
    assert.deepEqual([pre.status, pre.headers["access-control-allow-origin"], pre.headers["access-control-allow-private-network"]], [204, SITE, "true"]);
    assert.match(pre.headers["access-control-allow-headers"], /Authorization/);
    assert.equal((await raw(b.port, { method: "OPTIONS", path: "/capo/ask", headers: { Origin: "https://evil.example" } })).status, 403);
    const client = { Authorization: `Bearer ${TOKENS.client}`, "Content-Type": "application/json" }, ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
    assert.equal((await raw(b.port, { path: "/mcp", method: "POST", headers: { ...client, Origin: SITE }, body: ping })).status, 403, "no web site reaches the AI app's door, Capo's included");
    assert.equal((await raw(b.port, { path: "/mcp", method: "POST", headers: client, body: ping })).status, 200);
    assert.equal((await raw(b.port, { path: "/mcp", headers: client })).status, 405, "it opens no stream of its own");
    assert.equal((await raw(b.port, { path: "/mcp", method: "POST", headers: { ...client, "MCP-Protocol-Version": "1999-01-01" }, body: ping })).status, 400);
    assert.equal((await raw(b.port, { path: "/mcp", method: "POST", headers: client, body: "{not json" })).status, 400);
    assert.equal((await raw(b.port, { path: "/mcp", method: "POST", headers: client, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })).status, 202);
    assert.equal((await raw(b.port, { path: "/capo/nothing", headers: auth })).status, 404);
    assert.equal((await raw(b.port, { path: "/capo/ask", method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "" }) })).status, 400);
    const allowed = await open({ allowFile: true });
    try { assert.equal((await raw(allowed.port, { headers: { ...auth, Origin: "null" } })).status, 200); } finally { await allowed.close(); }
  } finally { await b.close(); }
});

test("a whole turn: the page asks, the AI app takes the prompt, corrects a bad reply, and the usual reader reads it", async () => {
  fresh();
  const b = await open();
  try {
    const g = warGame("turnone"), geo = geoOf(g), prompt = promptOf(g), r = b.route(), heard = [];
    aiHost({ g: () => g, geo: () => geo, route: () => r, most: () => 1, order: () => {}, toast: () => {} });
    assert.ok(PRESETS.includes(BRIDGE) && PRESETS.at(-1).custom, "the bridge is a service like the others, before Other");
    assert.equal(bridgeBase(r), b.at); assert.equal(bridgeBase({}), `http://127.0.0.1:${BRIDGE_PORT}`);
    assert.match(await bridgeCheck(r, keyOf(r)), /No AI app has called it yet/);
    const waiting = b.tool("capo_next", { wait: 5 }); // the AI app is already waiting when the player advances
    await sleep(30);
    const asked = ask(r, prompt, undefined, { kind: "turn", onStatus: (s) => heard.push(s) });
    const next = await waiting;
    assert.match(next.content[0].text, /a turn of the story/);
    assert.equal(next.content[1].text, prompt, "the prompt, whole and unchanged");
    const bad = await b.tool("capo_reply", { text: "Here is a lovely story about Peru." });
    assert.equal(bad.isError, true); assert.match(bad.content[0].text, new RegExp(`TURN: ${turnCode(g)}`));
    assert.equal(b.bridge.peek().job.kind, "turn", "the prompt still waits for a corrected reply");
    const good = sampleReply(g, "2027-01-01", false, (c) => NAMES[c] || c, ["CHL", "BOL"]);
    assert.equal((await b.tool("capo_reply", { text: good })).isError, undefined);
    const text = await asked, read = readWorldReply(text, g, (c) => !!NAMES[c], "2027-01-01");
    assert.equal(text, good); assert.ok(read.matched && read.events.length === 3, "read by the same reader as any reply");
    assert.ok(heard.some((s) => /Tell your AI app/.test(s)) && heard.some((s) => /has the prompt/.test(s)));
    assert.equal(b.bridge.peek().job, null);
    assert.equal((await b.tool("capo_reply", { text: good })).isError, true, "one reply a prompt");
    const state = JSON.parse((await b.tool("capo_state")).content[0].text);
    assert.deepEqual([state.game, state.player, state.country, state.turn, state.waiting], ["Capo", "PER", "Peru", g.turn, "nothing"]);
    assert.deepEqual(state.wars, ["Chile (CHL)"]);
    assert.match(await bridgeCheck(r, keyOf(r)), /last called it \d+ seconds ago/);
    assert.ok(b.said.some((s) => /A prompt is waiting/.test(s)));
  } finally { await b.close(); }
});

test("one prompt waits at a time; Stop withdraws it; a reply that stays wrong is handed over for the reader to refuse", async () => {
  fresh();
  const b = await open();
  try {
    const g = warGame("turntwo"), r = b.route(), chat = chatPrompt(g, { name: (c) => NAMES[c] || c }, { id: "c1", with: ["CHL"], log: [], lines: [], messages: [] }, "Shall we talk?");
    const first = ask(r, promptOf(g), undefined, { kind: "turn" }).catch((e) => e);
    await until(() => b.bridge.peek().job, "the first prompt");
    assert.equal((await b.tool("capo_reply", { text: "EVENT: x" })).isError, true, "the prompt must be read before it is answered");
    const second = ask(r, chat, undefined, { kind: "chat" });
    assert.equal((await first).kind, "other", "the first is told another took its place");
    await until(() => b.bridge.peek().job?.kind === "chat", "the second prompt");
    assert.match((await b.tool("capo_next")).content[0].text, /a chat message/);
    for (let i = 0; i < 2; i++) assert.equal((await b.tool("capo_reply", { text: "no format at all" })).isError, true);
    assert.match((await b.tool("capo_reply", { text: "no format at all" })).content[0].text, /Handed to Capo\. It may not be readable/);
    assert.equal(await second, "no format at all");
    const stop = new AbortController(), third = ask(r, promptOf(g), stop.signal, { kind: "turn" }).catch((e) => e);
    await until(() => b.bridge.peek().job, "the third prompt");
    stop.abort("stop");
    assert.equal((await third).kind, "stop");
    await until(() => !b.bridge.peek().job, "the prompt withdrawn");
    assert.ok(b.said.some((s) => /withdrawn/.test(s)));
  } finally { await b.close(); }
});

test("the page's side says plainly what is wrong: no token, a wrong one, no bridge, something else on the port", async () => {
  fresh();
  const b = await open();
  try {
    const r = b.route();
    setKey(r, ""); assert.equal((await ask(r, "x", undefined, {}).catch((e) => e)).kind, "key");
    setKey(r, "c".repeat(48));
    const wrong = await ask(r, "x", undefined, {}).catch((e) => e);
    assert.equal(wrong.kind, "key"); assert.doesNotMatch(wrong.message, /cccc/, "the token is never shown");
    assert.equal((await bridgeCheck(r, keyOf(r)).catch((e) => e)).kind, "key");
  } finally { await b.close(); }
  const r = { ...loadRoute(), route: "address", preset: "bridge", bridgePort: b.port }; setKey(r, TOKENS.page);
  const none = await ask(r, "x", undefined, {}).catch((e) => e);
  assert.equal(none.kind, "blocked"); assert.match(none.message, /node tools\/capo-mcp\.mjs/);
  const other = createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); });
  await new Promise((ok) => other.listen(0, "127.0.0.1", ok));
  try { assert.match((await bridgeCheck({ ...r, bridgePort: other.address().port }, TOKENS.page).catch((e) => e)).message, /Something else answers/); } finally { other.closeAllConnections(); other.close(); }
});

test("an order an AI app proposes is answered by the rules and waits for the player; it is never given by itself", async () => {
  fresh();
  const b = await open();
  try {
    const council = { seats: { war: { name: "Iva Rojas", skill: 5, favour: 0, likes: [], hates: [] }, treasury: null, foreign: null, home: null, outsider: null }, trusted: null, former: [] };
    const g = warGame("order-1", { council }), geo = geoOf(g), r = b.route(), given = [];
    aiHost({ g: () => g, geo: () => geo, route: () => r, most: () => 3, order: (o) => given.push(o), toast: () => {} });
    await sleep(50);
    assert.equal(b.bridge.peek().listening, false, "the page does not listen until the player ticks it");
    assert.equal((await b.tool("capo_order", { verb: "PEACE", target: "CHL" })).isError, true);
    r.propose = true; aiHost({ g: () => g, geo: () => geo, route: () => r, most: () => 3, order: (o) => given.push(o), toast: () => {} });
    await until(() => b.bridge.peek().listening, "the page listens");
    await until(() => b.bridge.peek().state, "the page tells the state");
    const peace = await b.tool("capo_order", { verb: "PEACE", target: "CHL" });
    assert.match(peace.content[0].text, /Proposed to the player: "Propose peace to Chile \(CHL\)\." By the rules today: Chile would (agree|refuse)/);
    assert.match(peace.content[0].text, /Nothing is ordered until the player accepts/);
    const attack = await b.tool("capo_order", { verb: "ATTACK", target: "CHL-1", leader: "war", approach: "bold" });
    assert.match(attack.content[0].text, /Attack Arica \(CHL-1\), led by Iva Rojas, bold\.[\s\S]*odds: clean \d+ in 100/);
    const treaty = await b.tool("capo_order", { verb: "TREATY", target: "CHL", detail: "trade" });
    assert.equal(treaty.isError, true); assert.match(treaty.content[0].text, /at war with Chile/);
    assert.equal((await b.tool("capo_order", { verb: "ATTACK", target: "CHL-2" })).isError, true, "the attack rules refuse land it cannot reach");
    assert.equal((await b.tool("capo_order", { verb: "ANNEX", target: "CHL" })).isError, true);
    assert.deepEqual(proposals().map((o) => [o.verb, o.target]), [["PEACE", "CHL"], ["ATTACK", "CHL-1"]]);
    assert.deepEqual([given.length, g.orders.length, (g.actions || []).length], [0, 0, 0], "nothing was ordered: the proposals wait for the player");
    unhear(); await until(() => !b.bridge.peek().listening, "the page stopped listening");
    assert.equal((await b.tool("capo_order", { verb: "PEACE", target: "CHL" })).isError, true);
  } finally { await b.close(); }
});

test("the rules' answer to a proposed order is the card's own, and a citizen gives none", () => {
  const g = warGame("judge-1"), geo = geoOf(g);
  assert.deepEqual(judgeOrder(g, geo, { verb: "treaty", target: "bol", detail: "Trade" }).order, { text: "Propose a trade treaty to Bolivia (BOL).", verb: "TREATY", target: "BOL", detail: "trade" });
  assert.match(judgeOrder(g, geo, { verb: "TREATY", target: "BOL", detail: "alliance" }).note, /Bolivia would (agree|refuse) \(relations/);
  assert.equal(judgeOrder(g, geo, { verb: "TREATY", target: "BOL", detail: "marriage" }).ok, false);
  assert.equal(judgeOrder(g, geo, { verb: "TREATY", target: "PER", detail: "trade" }).ok, false, "not with itself");
  assert.equal(judgeOrder(g, geo, { verb: "TREATY", target: "XXX", detail: "trade" }).ok, false);
  assert.equal(judgeOrder(g, geo, { verb: "PEACE", target: "BOL" }).ok, false, "no peace where there is no war");
  assert.equal(judgeOrder({ ...g, offers: [{ from: "CHL", kind: "peace", date: g.date }] }, geo, { verb: "PEACE", target: "CHL" }).order.text, "Accept Chile's offer of peace.");
  assert.equal(judgeOrder({ ...g, treaties: [{ pair: "BOL|PER", kind: "trade", since: g.date }] }, geo, { verb: "TREATY", target: "BOL", detail: "trade" }).ok, false, "not one it already has");
  const a = judgeOrder(g, geo, { verb: "ATTACK", target: "CHL-1", approach: "patient" }, 1);
  assert.deepEqual([a.order.seat, a.order.approach], ["generals", "steady"]); assert.match(a.note, /too short to be patient/);
  assert.equal(judgeOrder(g, geo, { verb: "ATTACK", target: "Atlantis" }).ok, false);
  assert.equal(judgeOrder({ ...g, mode: "citizen" }, geo, { verb: "PEACE", target: "CHL" }).ok, false);
  assert.equal(judgeOrder(null, geo, { verb: "PEACE", target: "CHL" }).ok, false);
  assert.equal(judgeOrder(g, geo, null).ok, false);
});

test("a reply's shape, and what an AI app may read of a game", () => {
  const g = warGame("shapeone"), prompt = promptOf(g), code = turnCode(g);
  assert.equal(shapeOf(prompt, `TURN: ${code}\nEVENT: 2026-12-02 | PER | Something happened.\nEND`), "");
  assert.equal(shapeOf(prompt, `**turn: ${code}**\n- EVENT: 2026-12-02 | PER | Something happened.`), "", "as forgiving as the readers are");
  assert.match(shapeOf(prompt, "EVENT: 2026-12-02 | PER | Something happened."), /TURN:/);
  assert.match(shapeOf(prompt, `TURN: ${code}\nNothing else.`), /EVENT/);
  assert.ok(shapeOf(prompt, "  ") && shapeOf(prompt, "x".repeat(60001)));
  assert.equal(shapeOf("Say anything.", "Anything."), "", "a prompt with no format asks for no shape");
  g.log.push({ from: "2026-12-01", to: "2027-01-01", summary: "A hard month.", events: [], receipt: [{ ok: true, text: "Peru takes Arica from Chile" }, { ok: false, text: "attack on Santiago refused" }] });
  g.actions = ["Strengthen the army."];
  const d = digest(g, geoOf(g));
  assert.deepEqual(d.last.receipt, ["stood: Peru takes Arica from Chile", "refused: attack on Santiago refused"]);
  assert.deepEqual(d.actions, ["Strengthen the army."]);
  assert.ok(!JSON.stringify(d).includes(g.seed), "the seed, which the rules roll from, is not told");
  assert.equal(digest(null, geoOf(g)), null);
});

test("the script itself: started by an AI app it speaks MCP on stdout only, and a second one passes its calls on to the first", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-bridge-")), file = path.join(dir, "tokens.json"), probe = createServer();
  await new Promise((ok) => probe.listen(0, "127.0.0.1", ok));
  const port = probe.address().port; await new Promise((ok) => probe.close(ok));
  const start = () => {
    const child = spawn(process.execPath, [script, "--port", String(port), "--tokens-file", file], { stdio: ["pipe", "pipe", "pipe"] }), out = [], err = [];
    let buf = "";
    child.stdout.on("data", (d) => { buf += d; const all = buf.split("\n"); buf = all.pop(); out.push(...all.filter(Boolean)); });
    child.stderr.on("data", (d) => err.push(String(d)));
    const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`), gone = new Promise((ok) => child.on("exit", ok));
    return { child, out, err, send, gone };
  };
  const a = start();
  let b = null;
  try {
    a.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    a.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    a.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await until(() => a.out.length === 2, `two answers from the script: ${a.err.join("")}`);
    const got = a.out.map((l) => JSON.parse(l));
    assert.equal(got[0].result.serverInfo.name, "capo-bridge"); assert.equal(got[1].result.tools.length, 4);
    const tokens = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(!a.out.join("").includes(tokens.page) && !a.err.join("").includes(tokens.page), "started by an app, it prints no token");
    assert.match(a.err.join(""), /--tokens/);
    const hello = await fetch(`http://127.0.0.1:${port}/capo/hello`, { headers: { Authorization: `Bearer ${tokens.page}` } }).then((r) => r.json());
    assert.equal(hello.bridge, "capo-bridge");
    b = start(); // a second AI app starts its own: the port is taken, so it passes its calls on
    b.send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "capo_state", arguments: {} } });
    await until(() => b.out.length === 1, `an answer through the first: ${b.err.join("")}`);
    assert.match(JSON.parse(b.out[0]).result.content[0].text, /has not told the bridge anything yet/);
    assert.match(b.err.join(""), /already running/);
  } finally {
    for (const x of [b, a]) { if (!x) continue; x.child.stdin.end(); await Promise.race([x.gone, sleep(3000).then(() => x.child.kill())]); }
    rmSync(dir, { recursive: true, force: true });
  }
});
