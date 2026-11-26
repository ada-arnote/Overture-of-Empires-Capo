// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's AI wiring: each service's shape, streaming, errors in plain words, retries, the reply allowance, structured
// replies, the key's rules and the page's connect-src. Every request goes to a stand-in fetch: no real service is
// called, and every key here is an obvious fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUDGET, CONNECT, PRESETS, allowance, ask, check, explain, forgetKeys, keyOf, loadRoute, reachable, saveRoute, scrub, setKeep, setKey } from "../site/ai.js";
import { AI_BASES } from "../site/config.js";
import { fold, formatOf, linesFrom, sampleReply, toolOf, unfold } from "../src/story/replyform.js";
import { splitEvents } from "../src/story/wire.js";
import { newWorldGame, readWorldReply, turnCode, worldPrompt } from "../src/story/turn.js";
import { chatPrompt, readChat } from "../src/story/talk.js";
import { check as gate } from "../tools/check.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FAKE = "sk-test-FAKE-0000-not-a-real-key";

// ---- stand-ins: browser storage and fetch ----
class Shelf { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } clear() { this.m.clear(); } }
for (const k of ["localStorage", "sessionStorage"]) Object.defineProperty(globalThis, k, { value: new Shelf(), configurable: true, writable: true });
const fresh = () => { localStorage.clear(); sessionStorage.clear(); forgetKeys(); };
let calls = [];
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const sse = (pieces) => new Response(new ReadableStream({ start(c) { for (const p of pieces) c.enqueue(new TextEncoder().encode(p)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
/** fetch answers in turn from the list (a function gets the request); every request is kept for the asserts. */
function serve(...answers) {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    const a = answers.length > 1 ? answers.shift() : answers[0];
    return typeof a === "function" ? a(url, init) : a.clone();
  };
}
const route = (preset, more = {}) => { const r = { ...loadRoute(), route: "address", preset, model: "", ...more }; setKey(r, FAKE); return r; };
const noWait = { sleep: async () => {} };

// ---- the page's rule ----
test("the Capo page's connect-src lists exactly its own site, each service in config.js and this computer", () => {
  const origins = [...new Set(Object.values(AI_BASES).map((b) => new URL(b).origin).filter((o) => o.startsWith("https:")))];
  assert.deepEqual([...CONNECT].sort(), ["'self'", ...origins, "http://localhost:*", "http://127.0.0.1:*"].sort());
  for (const page of ["site/game.html", "play/game.html"]) {
    if (!existsSync(path.join(root, page))) continue;
    const csp = readFileSync(path.join(root, page), "utf8").match(/connect-src ([^;"]*)/)[1].trim().split(/\s+/);
    assert.deepEqual([...csp].sort(), [...CONNECT].sort(), page);
    assert.ok(!csp.includes("https:") && !csp.includes("*"), `${page} names no wildcard`);
  }
  for (const p of PRESETS) if (p.base) assert.ok(reachable(p.base), `${p.id} is reachable under the rule`);
  assert.equal(reachable("https://example.org/v1"), false, "another site is not");
  assert.equal(reachable("http://192.168.1.5:8080/v1"), false, "nor another machine");
  assert.equal(reachable("http://localhost:11434/v1"), true);
});

test("the gate holds a page's connect-src to exactly the services and this computer", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-ai-"));
  try {
    mkdirSync(path.join(dir, "site"));
    writeFileSync(path.join(dir, "site/config.js"), readFileSync(path.join(root, "site/config.js")));
    const html = (reach) => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src 'self'; media-src 'self'; connect-src ${reach}; require-trusted-types-for 'script'">`;
    const stops = (reach) => { writeFileSync(path.join(dir, "site/game.html"), html(reach)); return gate(dir).bad.filter((b) => /site\/game\.html/.test(b)); };
    assert.deepEqual(stops(CONNECT.join(" ")), [], "the exact list passes");
    assert.ok(stops("'self' https: http://localhost:*").some((b) => /connect-src must list exactly/.test(b)), "any https site does not");
    assert.ok(stops(`${CONNECT.join(" ")} https://example.org`).length, "nor one more site");
    assert.deepEqual(stops("'self'"), [], "a page that reaches only its own site is fine");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the key ----
test("a key is kept apart: in this tab only, or on this device, never both, and never with the settings", () => {
  fresh();
  const r = { ...loadRoute(), route: "address", preset: "groq" };
  setKey(r, FAKE);
  assert.equal(keyOf(r), FAKE);
  assert.match(sessionStorage.getItem("capo-ai-key"), /FAKE/);
  assert.equal(localStorage.getItem("capo-ai-key"), null, "this session only by default");
  setKeep(r, "device");
  assert.equal(sessionStorage.getItem("capo-ai-key"), null);
  assert.match(localStorage.getItem("capo-ai-key"), /FAKE/, "remembered on this device when asked");
  saveRoute({ ...r, key: FAKE, remember: true });
  assert.ok(!localStorage.getItem("capo-ai").includes(FAKE), "the settings never carry a key");
  assert.ok(!("key" in JSON.parse(localStorage.getItem("capo-ai"))));
  forgetKeys();
  assert.equal(keyOf(r), "");
  assert.equal(localStorage.getItem("capo-ai-key"), null);
  assert.equal(sessionStorage.getItem("capo-ai-key"), null);
});

test("a key kept inside the old settings is moved out of them on load", () => {
  fresh();
  localStorage.setItem("capo-ai", JSON.stringify({ route: "address", base: "http://localhost:1234/v1", model: "m", key: FAKE, remember: true, calls: 2 }));
  const r = loadRoute();
  assert.equal(r.preset, "custom");
  assert.equal(r.keep, "device");
  assert.ok(!("key" in r) && !("remember" in r));
  assert.ok(!localStorage.getItem("capo-ai").includes(FAKE));
  forgetKeys(); // the copy in memory gone, the remembered one is still read back
  localStorage.setItem("capo-ai-key", JSON.stringify({ custom: FAKE }));
  assert.equal(keyOf(r), FAKE);
});

test("a key never goes into a save, a web address, the settings or a message shown", async () => {
  fresh();
  const g = newWorldGame("PER", "nation", "keytest1");
  for (const preset of ["openai", "anthropic", "gemini"]) {
    const r = route(preset);
    serve(preset === "anthropic" ? json({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }) : preset === "gemini" ? json({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }) : json({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    await ask(r, "Say ok.", undefined, { kind: "chat" });
    const c = calls[0];
    assert.ok(!c.url.includes(FAKE), `${preset}: not in the address`);
    assert.ok(!JSON.stringify(c.body).includes(FAKE), `${preset}: not in the body`);
    assert.ok(Object.values(c.init.headers).some((v) => v.includes(FAKE)), `${preset}: in a header`);
    assert.equal(c.init.credentials, "omit");
    assert.equal(c.init.referrerPolicy, "no-referrer");
    assert.ok(!JSON.stringify(r).includes(FAKE), `${preset}: not in the settings object`);
  }
  assert.ok(!JSON.stringify(g).includes(FAKE), "not in a game or its save file");
  for (const [k, v] of [...localStorage.m, ...sessionStorage.m]) if (k !== "capo-ai-key") assert.ok(!v.includes(FAKE), `not in ${k}`);
  serve(json({ error: { message: `Incorrect API key provided: ${FAKE}.`, code: "invalid_api_key" } }, 401));
  const e = await ask(route("openai"), "x").catch((x) => x);
  assert.equal(e.kind, "key");
  assert.ok(!e.message.includes(FAKE), "a service that repeats the key has it taken out");
  assert.equal(scrub("key gsk_abcdefghijklmnop here"), "key [a key] here");
});

// ---- each shape ----
test("the chat-completions form: address, key, allowance and reply", async () => {
  fresh();
  serve(json({ choices: [{ message: { content: "TURN: x\nEND" }, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 30 } }));
  const r = route("groq", { model: "llama-3.3-70b-versatile" });
  assert.equal(await ask(r, "Hello", undefined, { kind: "chat" }), "TURN: x\nEND");
  assert.equal(calls[0].url, `${AI_BASES.groq}/chat/completions`);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${FAKE}`);
  assert.equal(calls[0].body.max_tokens, BUDGET.chat);
  assert.equal(calls[0].body.model, "llama-3.3-70b-versatile");
  assert.deepEqual([r.calls, r.sent, r.got], [1, 120, 30], "today's count uses the service's own numbers");
  serve(json({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
  await ask(route("openai", { model: "gpt-5-mini" }), "Hello", undefined, { kind: "turn" });
  assert.equal(calls[0].body.max_completion_tokens, BUDGET.turn * 4, "OpenAI's own name for it, four times for a thinking model");
  assert.equal(calls[0].body.max_tokens, undefined);
});

test("Anthropic's form: its headers, a required allowance, and its reply", async () => {
  fresh();
  serve(json({ content: [{ type: "text", text: "SAYS: a | favourable | yes" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }));
  const r = route("anthropic", { model: "claude-haiku-4-5" });
  assert.match(await ask(r, "Hi", undefined, { kind: "ask" }), /SAYS/);
  const c = calls[0];
  assert.equal(c.url, `${AI_BASES.anthropic}/messages`);
  assert.equal(c.init.headers["x-api-key"], FAKE);
  assert.equal(c.init.headers["anthropic-version"], "2023-06-01");
  assert.equal(c.init.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(c.body.max_tokens, BUDGET.ask);
  assert.deepEqual(c.body.messages, [{ role: "user", content: "Hi" }]);
});

test("Gemini's form: the model in the address, the key in a header, and its reply", async () => {
  fresh();
  serve(json({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: "NAME: Ana" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } }));
  const r = route("gemini", { model: "gemini-2.5-flash" });
  assert.equal(await ask(r, "Hi", undefined, { kind: "character" }), "NAME: Ana", "thoughts are not the reply");
  assert.equal(calls[0].url, `${AI_BASES.gemini}/models/gemini-2.5-flash:generateContent`);
  assert.equal(calls[0].init.headers["x-goog-api-key"], FAKE);
  assert.equal(calls[0].body.generationConfig.maxOutputTokens, BUDGET.character * 4, "2.5 models think");
});

test("a server on this computer needs no key; the address must be this computer", async () => {
  fresh();
  serve(json({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }));
  const r = { ...loadRoute(), route: "address", preset: "ollama", model: "llama3.1" };
  assert.equal(await ask(r, "Hi", undefined, { kind: "chat" }), "hi");
  assert.equal(calls[0].url, "http://localhost:11434/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  serve(json({}));
  const far = await ask({ ...r, preset: "custom", base: "https://example.org/v1" }, "Hi").catch((e) => e);
  assert.equal(far.kind, "address");
  assert.equal(calls.length, 0, "nothing is sent to an address the page may not reach");
  const nokey = await ask({ ...r, preset: "mistral" }, "Hi").catch((e) => e);
  assert.equal(nokey.kind, "key");
});

// ---- streaming ----
test("streamed replies are read as they come, in all three shapes, across broken pieces", async () => {
  fresh();
  const seen = [];
  const onText = (a) => seen.push(a.text);
  serve(sse(['data: {"choices":[{"delta":{"content":"TURN: "}}]}\n\n: keep-alive\n\ndata: {"choi', 'ces":[{"delta":{"content":"t1"}}]}\r\n\r\n', 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n']));
  assert.equal(await ask(route("openrouter"), "x", undefined, { kind: "chat", onText }), "TURN: t1");
  assert.equal(calls[0].body.stream, true);
  assert.ok(seen.includes("TURN: ") && seen.at(-1) === "TURN: t1", "text shows as it arrives");
  serve(sse([
    'event: message_start\ndata: {"type":"message_start","message":{"content":[],"usage":{"input_tokens":7,"output_tokens":1}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n']));
  assert.equal(await ask(route("anthropic", { model: "claude-haiku-4-5" }), "x", undefined, { kind: "chat", onText }), "Hello");
  serve(sse(['data: {"candidates":[{"content":{"parts":[{"text":"Bon"}]}}]}\r\n\r\n', 'data: {"candidates":[{"content":{"parts":[{"text":"jour"}]},"finishReason":"STOP"}]}\r\n\r\n']));
  assert.equal(await ask(route("gemini", { model: "gemini-2.5-flash" }), "x", undefined, { kind: "chat", onText }), "Bonjour");
  assert.match(calls[0].url, /:streamGenerateContent\?alt=sse$/);
  assert.deepEqual(splitEvents('data: {"a":1}\n\ndata: {"b"', false), { out: [{ a: 1 }], rest: 'data: {"b"' });
});

// ---- errors and retries ----
test("refusals are told plainly, each with its kind", () => {
  const p = PRESETS.find((x) => x.id === "openai"), g = PRESETS.find((x) => x.id === "gemini");
  const kind = (status, said, more = {}) => explain(status, said, { p, model: "m", ...more }).kind;
  assert.equal(kind(401, "Incorrect API key provided"), "key");
  assert.equal(explain(400, "API key not valid. Please pass a valid API key.", { p: g }).kind, "key");
  assert.equal(kind(429, "You exceeded your current quota", { code: "insufficient_quota" }), "credit", "no credit is not a rate limit");
  assert.equal(kind(402, "Insufficient Balance"), "credit");
  assert.equal(kind(400, "Your credit balance is too low to access the Anthropic API."), "credit");
  assert.equal(kind(404, "The model `m` does not exist"), "model");
  assert.equal(kind(400, "model: claude-x is not found"), "model");
  assert.equal(kind(429, "Rate limit reached"), "rate");
  assert.equal(kind(529, "Overloaded"), "busy");
  assert.equal(kind(400, "Unsupported parameter: 'max_tokens'"), "limit");
  assert.equal(kind(400, "llama2 does not support tools"), "tools");
  assert.equal(kind(403, "Region not supported"), "denied");
  assert.match(explain(401, "bad", { p }).message, /OpenAI refused the key/);
});

test("rate limits and a busy service are tried again with waits; a blocked call, a stop and a silence are told apart", async () => {
  fresh();
  const waits = [], said = [];
  serve(json({ error: { message: "slow down" } }, 429, { "retry-after": "3" }), json({ error: { message: "busy" } }, 503), json({ choices: [{ message: { content: "fine" }, finish_reason: "stop" }] }));
  assert.equal(await ask(route("groq"), "x", undefined, { sleep: async (ms) => waits.push(ms), onStatus: (s) => said.push(s) }), "fine");
  assert.deepEqual(waits, [3000, 6000], "the service's own wait first, then the backoff");
  assert.match(said[0], /too many requests\. Trying again in 3 seconds \(1 of 3\)/);
  serve(json({ error: { message: "busy" } }, 503));
  const busy = await ask(route("groq"), "x", undefined, noWait).catch((e) => e);
  assert.equal(busy.kind, "busy");
  assert.equal(calls.length, 4, "three more tries, then it says so");
  serve(() => { throw new TypeError("Failed to fetch"); });
  const blocked = await ask(route("deepseek"), "x").catch((e) => e);
  assert.equal(blocked.kind, "blocked");
  assert.match(blocked.message, /CORS/, "a service not yet seen working from a page says why it may fail");
  const local = await ask({ ...route("ollama"), model: "llama3.1" }, "x").catch((e) => e);
  assert.match(local.message, /OLLAMA_ORIGINS/);
  const hang = (url, init) => new Promise((_, no) => init.signal.addEventListener("abort", () => no(new DOMException("aborted", "AbortError"))));
  serve(hang);
  const slow = await ask(route("groq"), "x", undefined, { idle: 30 }).catch((e) => e);
  assert.equal(slow.kind, "time");
  serve(hang);
  const stop = new AbortController();
  setTimeout(() => stop.abort("stop"), 10);
  assert.equal((await ask(route("groq"), "x", stop.signal).catch((e) => e)).kind, "stop");
});

test("a refused allowance or tool is dropped and asked again, and remembered; a cut or empty reply is caught", async () => {
  fresh();
  const r = route("groq");
  serve(json({ error: { message: "Unsupported parameter: 'max_tokens'" } }, 400), json({ choices: [{ message: { content: "TURN: a\nEND" }, finish_reason: "stop" }] }));
  await ask(r, "x", undefined, { kind: "turn" });
  assert.equal(calls[1].body.max_tokens, undefined);
  assert.equal(r.loose.groq, 1);
  serve(json({ choices: [{ message: { content: "EVENT: half" }, finish_reason: "length" }] }));
  assert.equal((await ask(route("groq"), "x").catch((e) => e)).kind, "cut");
  serve(json({ choices: [{ message: { content: "" }, finish_reason: "length" }] }));
  assert.match((await ask(route("groq"), "x").catch((e) => e)).message, /Thinking model/);
  serve(json({ candidates: [{ finishReason: "SAFETY" }] }));
  assert.equal((await ask(route("gemini", { model: "gemini-2.5-flash" }), "x").catch((e) => e)).kind, "filter");
  serve(sse(['event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n']), json({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }));
  assert.equal(await ask(route("anthropic", { model: "claude-haiku-4-5" }), "x", undefined, { onText() {}, ...noWait }), "ok", "an error inside a stream is read and tried again");
});

test("the reply allowance for each kind of call", () => {
  assert.deepEqual(BUDGET, { turn: 1800, chat: 400, council: 500, ask: 500, character: 300, check: 300 });
  assert.equal(allowance({ model: "llama-3.3-70b" }, "chat"), 400);
  assert.equal(allowance({ model: "llama-3.3-70b", think: true }, "chat"), 1600);
  assert.equal(allowance({ model: "deepseek-reasoner" }, "turn"), 7200);
  assert.equal(allowance({ model: "llama" }, "turn", true), 2700, "a structured reply gets half again for its form");
});

// ---- structured replies ----
const NAMES = { PER: "Peru", CHL: "Chile", BOL: "Bolivia" }, name = (c) => NAMES[c] || c;
const P = { "PER-1": { name: "Lima", country: "PER" }, "CHL-1": { name: "Arica", country: "CHL" } };
const geo = (g) => ({ name, place: (id) => P[id], find: (s) => (P[s] ? s : null), owner: (id) => g.owners[id] || P[id].country, neighbours: (id) => (id === "PER-1" ? ["CHL-1"] : ["PER-1"]),
  across: () => [], coastal: () => false, holds: () => 1, known: (c) => !!NAMES[c], hasCoast: () => false, might: () => 3 });

test("a turn as a tool call: the form is read from the prompt, and the answer goes back to lines the usual reader reads", async () => {
  fresh();
  const g = newWorldGame("PER", "nation", "toolturn1"), to = "2027-01-01";
  const prompt = worldPrompt(g, { name, neighbours: () => ["CHL"], size: () => 1, geo: geo(g), places: ["- PER-1 Lima (PER; own land)"] }, ["Offer Chile a trade treaty."], to);
  const fmt = formatOf(prompt);
  assert.deepEqual(fmt.rows.map((r) => r.label), ["MOVE", "EVENT", "NEWS", "SUMMARY", "PERSON", "THREAD"]); // PERSON and THREAD lines are optional (Phase 4, people and threads)
  assert.deepEqual(fmt.fixed, [`TURN: ${turnCode(g)}`], "the turn's code is Capo's to write");
  const tool = toolOf(fmt);
  assert.equal(tool.parameters.properties.EVENT.items.properties.f3.description, "two or three sentences");
  const args = { MOVE: [{ f1: "m1", f2: "1", f3: "PER", f4: "TREATY", f5: "CHL", f6: "trade" }], EVENT: [{ f1: "2026-12-05", f2: "PER", f3: "Lima offers Santiago a trade pact | and waits." }, { f1: "2026-12-20", f2: "CHL", f3: "Santiago weighs the offer from Lima with care." }], NEWS: [], SUMMARY: [{ f1: "Talks begin." }] };
  serve(json({ choices: [{ message: { content: null, tool_calls: [{ type: "function", function: { name: "capo_reply", arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }] }));
  const text = await ask(route("groq"), prompt, undefined, { kind: "turn" });
  assert.equal(calls[0].body.tools[0].function.name, "capo_reply");
  assert.equal(calls[0].body.tool_choice, "required");
  assert.equal(calls[0].body.max_tokens, 2700);
  const r = readWorldReply(text, g, (c) => !!NAMES[c], to);
  assert.equal(r.matched, true);
  assert.equal(r.events.length, 2);
  assert.match(r.events[0].text, /trade pact \/ and waits/, "a | inside a field cannot break the line");
  assert.deepEqual(r.moves[0], { action: 1, country: "PER", verb: "TREATY", target: "CHL", detail: "trade" });
  assert.equal(r.summary, "Talks begin.");
  // the same through Anthropic and Gemini, streamed
  serve(sse([
    'data: {"type":"message_start","message":{"content":[],"usage":{"input_tokens":3}}}\n\n',
    'data: {"type":"content_block_start","content_block":{"type":"tool_use","input":{}}}\n\n',
    `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: JSON.stringify(args).slice(0, 40) } })}\n\n`,
    `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: JSON.stringify(args).slice(40) } })}\n\n`,
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n']));
  assert.equal(await ask(route("anthropic", { model: "claude-haiku-4-5" }), prompt, undefined, { onText() {} }), text);
  assert.deepEqual(calls[0].body.tool_choice, { type: "tool", name: "capo_reply" });
  serve(json({ candidates: [{ content: { parts: [{ functionCall: { name: "capo_reply", args } }] }, finishReason: "STOP" }] }));
  assert.equal(await ask(route("gemini", { model: "gemini-2.5-flash" }), prompt), text);
  assert.equal(calls[0].body.toolConfig.functionCallingConfig.mode, "ANY");
});

test("a model that answers in plain lines anyway, or refuses tools, still works; a broken form is caught", async () => {
  fresh();
  const g = newWorldGame("PER", "nation", "toolchat1"), chat = { with: ["CHL"], person: "", messages: [] };
  const prompt = chatPrompt(g, { name }, chat, "Shall we trade?");
  serve(json({ choices: [{ message: { content: "REPLY: CHL | Perhaps." }, finish_reason: "stop" }] }));
  assert.equal(readChat(await ask(route("groq"), prompt, undefined, { kind: "chat" }), chat, name).length, 1);
  const r = route("groq");
  serve(json({ error: { message: "This model does not support tools" } }, 400), json({ choices: [{ message: { content: "REPLY: CHL | Yes." }, finish_reason: "stop" }] }));
  assert.equal(await ask(r, prompt, undefined, { kind: "chat" }), "REPLY: CHL | Yes.");
  assert.equal(calls[1].body.tools, undefined);
  assert.equal(r.plain.groq, 1, "remembered for this service");
  serve(json({ choices: [{ message: { tool_calls: [{ function: { arguments: '{"REPLY":[{"f1":"CHL","f2":"Ye' } }] }, finish_reason: "length" }] }));
  assert.equal((await ask(route("groq"), prompt, undefined, { kind: "chat" }).catch((e) => e)).kind, "cut");
  assert.equal(linesFrom(formatOf(prompt), { REPLY: [{ f1: "CHL", f2: "Fine." }, "CHL | Also fine."] }), "REPLY: CHL | Fine.\nREPLY: CHL | Also fine.");
  const off = route("groq", { tools: false });
  serve(json({ choices: [{ message: { content: "REPLY: CHL | ok" }, finish_reason: "stop" }] }));
  await ask(off, prompt, undefined, { kind: "chat" });
  assert.equal(calls[0].body.tools, undefined, "structured replies can be turned off");
  assert.equal(formatOf("No format here."), null);
});

// ---- Check connection ----
test("Check connection lists the models without spending tokens, then asks for one word", async () => {
  fresh();
  serve(json({ data: [{ id: "llama-3.3-70b-versatile" }, { id: "other" }] }), json({ choices: [{ message: { content: "READY" }, finish_reason: "stop" }] }));
  const got = await check(route("groq"));
  assert.deepEqual(got.models, ["llama-3.3-70b-versatile", "other"]);
  assert.equal(got.said, "READY");
  assert.equal(calls[0].url, `${AI_BASES.groq}/models`);
  assert.equal(calls[1].body.max_tokens, BUDGET.check);
  serve(json({ error: { message: "Invalid API Key" } }, 401));
  assert.equal((await check(route("groq")).catch((e) => e)).kind, "key");
  assert.equal(calls.length, 1, "a refused key stops at the free call");
  serve(json({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/embed", supportedGenerationMethods: ["embedContent"] }] }), json({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
  const thinking = await check(route("gemini"));
  assert.deepEqual(thinking.models, ["gemini-2.5-flash"]);
  assert.match(thinking.said, /thinking/, "connected, though it thought through its whole allowance");
});

// ---- the paste route ----
test("several questions fold into one paste and come back apart", () => {
  const one = fold([{ title: "This turn", prompt: "T" }]);
  assert.equal(one, "T");
  const three = fold([{ title: "This turn", prompt: "TURN PROMPT" }, { title: "A chat message", prompt: "CHAT PROMPT" }, { title: "A question to the council", prompt: "ASK PROMPT" }]);
  assert.match(three, /=== REQUEST 2: A chat message ===\nCHAT PROMPT/);
  const back = unfold("Sure!\n**=== ANSWER 1 ===**\nTURN: t1\nEND\n=== ANSWER 3 ===\nSAYS: a | favourable | go\n=== ANSWER 2 ===\nREPLY: CHL | hi", 3);
  assert.deepEqual(back, ["TURN: t1\nEND", "REPLY: CHL | hi", "SAYS: a | favourable | go"]);
  assert.deepEqual(unfold("TURN: t1\nEND", 2), ["TURN: t1\nEND", ""], "no markers: all of it is the turn");
});

test("the sample reply is a whole turn the reader takes, with no moves", () => {
  for (const auto of [false, true]) {
    const g = newWorldGame("PER", "nation", "sample01"), to = "2027-01-01";
    const r = readWorldReply(sampleReply(g, to, auto, name, ["CHL", "BOL"]), g, (c) => !!NAMES[c], to, auto);
    assert.equal(r.matched, true);
    assert.equal(r.events.length, 3);
    assert.equal(r.moves.length, 0);
    assert.deepEqual(r.dropped, []);
    assert.match(r.events[0].text, /sample turn/);
  }
  const island = newWorldGame("PER", "nation", "sample02");
  assert.equal(readWorldReply(sampleReply(island, "2027-01-01", false, name, []), island, (c) => !!NAMES[c], "2027-01-01").events.length, 3, "a country with no land neighbours");
});
