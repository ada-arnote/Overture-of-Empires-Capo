#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// The Capo bridge: an optional script the player runs so their own AI app (Claude Code, Claude Desktop, Codex, any
// MCP client) can tell Capo's story. One process, nothing to install, this computer only:
//   - an MCP server for the AI app, over stdio (when the app starts this script) and over Streamable HTTP at
//     http://127.0.0.1:<port>/mcp, with four tools: capo_next, capo_reply, capo_state, capo_order;
//   - an endpoint for the Capo page at http://127.0.0.1:<port>/capo/..., which the page calls only after the player
//     chooses the bridge in its AI settings and pastes the page token. The page never starts this script.
// Two random tokens guard it, one for the page and one for an AI app over HTTP; they are kept in a file in the
// player's home folder. It binds 127.0.0.1 only, checks the Host and Origin of every request, runs nothing, reads and
// writes only its token file, and calls nowhere (but an earlier bridge on the same port, to pass an app's calls on).
//
// node tools/capo-mcp.mjs                 start it (in a terminal: prints how to connect; started by an AI app: stdio)
// node tools/capo-mcp.mjs --tokens        print the tokens and how to connect, and stop
// node tools/capo-mcp.mjs --new-tokens    make new tokens (the old ones stop working)
//   --port 8125   --stdio | --no-stdio   --origin https://example.org (another address Capo is served from)
//   --allow-file  (let a Capo page opened by double-click connect)   --tokens-file path
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SITE_URL, VERSION } from "../site/config.js";
import { APPROACH_NAMES, BRIDGE_PORT, ORDER_VERBS, shapeOf } from "../src/story/bridge.js";

/** The MCP revisions this server speaks; it offers only tools, which all of them share. Newest first. */
export const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MOST = { body: 600000, prompt: 400000, state: 30000, wait: 50, tries: 2, answer: 10000 };
const KIND = { turn: "a turn of the story", chat: "a chat message", ask: "a question to the council", council: "a council to name", character: "a character to fill in" };

const INSTRUCTIONS = "Capo is a story game the player has open in a browser. The player decides what to do and Capo's rules decide what is true; you tell the story. " +
  "When the player asks you to play their Capo turn: call capo_next, write the reply in exactly the format the prompt ends with, and hand it back with capo_reply. " +
  "capo_state is read-only. capo_order only proposes an order to the player, who must accept it in Capo. Never loop on your own: one prompt waits at a time, and the player starts each one.";

const text = (t, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError && { isError: true }) });
const str = { type: "string" };
export const TOOLS = [
  { name: "capo_next", title: "Read the prompt Capo is waiting on",
    description: "Returns the prompt Capo is waiting for a reply to (a turn of the story, a chat message or a question to the council), or says that nothing is waiting. Write the reply in exactly the format the prompt ends with, then call capo_reply.",
    inputSchema: { type: "object", properties: { wait: { type: "integer", minimum: 0, maximum: MOST.wait, description: "Seconds to wait for the player to start a prompt if none is waiting now (0 to 50; default 0)." } }, additionalProperties: false },
    annotations: { title: "Read the prompt Capo is waiting on", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "capo_reply", title: "Hand a reply to Capo",
    description: "Hands your reply to the prompt from capo_next back to Capo, as plain text in the reply format. It is the same as a reply from any AI service: Capo reads its lines and the rules decide which moves stand. If the reply does not have the format's shape you are told why and may correct it.",
    inputSchema: { type: "object", properties: { text: { ...str, description: "The whole reply, in exactly the lines the prompt asks for." } }, required: ["text"], additionalProperties: false },
    annotations: { title: "Hand a reply to Capo", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "capo_state", title: "Read the state of the game",
    description: "Read-only: the game's date and turn, the player's country and mode, its wars, treaties and offers, the actions waiting, and what the rules decided last turn (the receipt). It is what the page last told the bridge.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Read the state of the game", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "capo_order", title: "Propose an order to the player",
    description: "Proposes one order for the player's country: a treaty, peace, or an attack on a province. Capo's rules answer at once (who would agree, the odds, or why it cannot be given). Nothing is ordered unless the player accepts it in Capo, and the rules carry it out only when the player advances the turn. Works only if the player has ticked 'Let my AI app propose orders' in Capo.",
    inputSchema: { type: "object", properties: {
      verb: { ...str, enum: ORDER_VERBS, description: "TREATY, PEACE or ATTACK." },
      target: { ...str, description: "A country code for TREATY and PEACE; a province id for ATTACK." },
      detail: { ...str, enum: ["trade", "defence", "alliance"], description: "For TREATY: which kind." },
      leader: { ...str, description: "For ATTACK: the council seat that leads (for example war), or generals. Optional." },
      approach: { ...str, enum: APPROACH_NAMES, description: "For ATTACK: how. Optional; steady by default." } }, required: ["verb", "target"], additionalProperties: false },
    annotations: { title: "Propose an order to the player", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const local = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/**
 * The bridge itself, apart from sockets: rpc(message) answers one MCP message, and http(req, res) serves both the MCP
 * endpoint and the page's. o: tokens {page, client}, origins (pages that may connect besides this computer),
 * allowFile, log(sentence), now() and the limits in `most`, for the tests.
 */
export function makeBridge(o) {
  const tokens = o.tokens, origins = new Set(o.origins || []), log = o.log || (() => {}), most = { ...MOST, ...o.most };
  let job = null, state = null, stateAt = 0, listener = null, seen = 0, count = 0;
  const waiters = new Set(), answers = new Map();
  const wake = () => { for (const w of [...waiters]) w(); };

  // ---- the four tools ----
  const tools = {
    async capo_next(a) {
      const wait = Math.max(0, Math.min(most.wait, Math.floor(Number(a.wait) || 0)));
      if (!job && wait) await new Promise((ok) => { const done = () => { clearTimeout(t); waiters.delete(done); ok(); }, t = setTimeout(done, wait * 1000); waiters.add(done); });
      if (!job) return text("Nothing is waiting. The player starts each prompt in Capo (Advance, a chat message or a question to the council); then call capo_next again. Do not poll in a loop: ask the player.");
      job.taken = true; job.send({ at: "taken" });
      const head = `Capo is waiting for a reply to this prompt (${KIND[job.kind] || job.kind}). You tell the story; Capo's rules decide what stands. Write the reply in exactly the format the prompt ends with, and nothing else, then call capo_reply with it as text.`;
      return { content: [{ type: "text", text: job.note ? `${head}\n\n${job.note}` : head }, { type: "text", text: job.prompt }] };
    },
    async capo_reply(a) {
      if (!job) return text("Nothing is waiting for a reply. Call capo_next first; the player starts each prompt in Capo.", true);
      if (!job.taken) return text("Read the prompt first: call capo_next, then reply to what it returns.", true);
      if (typeof a.text !== "string" || !a.text.trim()) return text("Give the reply as text.", true);
      const why = shapeOf(job.prompt, a.text);
      if (why && job.tries < most.tries) { job.tries++; return text(`Not handed to Capo: ${why} Correct the reply and call capo_reply again.`, true); }
      const j = job; job = null;
      j.send({ text: a.text.slice(0, 60000) }); j.end();
      return text(`Handed to Capo.${why ? ` It may not be readable: ${why}` : ""} Capo's reader and rules judge it now; after a turn, capo_state shows what the rules decided.`);
    },
    async capo_state() {
      if (!state) return text("Capo has not told the bridge anything yet. The player opens Capo, chooses the bridge in Game, How Capo reaches an AI, and starts a turn.");
      return text(JSON.stringify({ ...state, toldSecondsAgo: Math.round((Date.now() - stateAt) / 1000), waiting: job ? job.kind : "nothing" }, null, 1));
    },
    async capo_order(a) {
      if (!listener) return text("Capo is not listening for proposals. The player must have Capo open with the bridge chosen and tick 'Let my AI app propose orders' in Game, How Capo reaches an AI.", true);
      const order = { id: `o${++count}`, verb: String(a.verb || "").slice(0, 12), target: String(a.target || "").slice(0, 80), detail: String(a.detail || "").slice(0, 20), leader: String(a.leader || "").slice(0, 20), approach: String(a.approach || "").slice(0, 12) };
      const got = await new Promise((ok) => { const t = setTimeout(() => { answers.delete(order.id); ok(null); }, most.answer); answers.set(order.id, (v) => { clearTimeout(t); answers.delete(order.id); ok(v); }); listener.send({ order }); });
      if (!got) return text("Capo did not answer in time. Is the page still open?", true);
      if (!got.ok) return text(`Not proposed. Capo's rules say: ${got.why}`, true);
      return text(`Proposed to the player: "${got.text}" By the rules today: ${got.note}. Nothing is ordered until the player accepts it in Capo, and the rules carry it out when the player advances the turn.`);
    },
  };

  // ---- MCP: JSON-RPC 2.0, the same over stdio and HTTP ----
  async function call(method, p) {
    if (method === "initialize") return { protocolVersion: VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "capo-bridge", title: "Capo bridge", version: VERSION }, instructions: INSTRUCTIONS };
    if (method === "ping") return {};
    if (method === "tools/list") return { tools: TOOLS };
    if (method === "tools/call") {
      const run = Object.hasOwn(tools, p.name) ? tools[p.name] : null;
      if (!run) throw Object.assign(new Error(`Unknown tool: ${String(p.name).slice(0, 60)}`), { code: -32602 });
      if (p.arguments != null && (typeof p.arguments !== "object" || Array.isArray(p.arguments))) throw Object.assign(new Error("A tool's arguments must be an object"), { code: -32602 });
      seen = Date.now();
      return run(p.arguments || {});
    }
    throw Object.assign(new Error(`Method not found: ${String(method).slice(0, 60)}`), { code: -32601 });
  }
  /** One message in, its answer out: null for a notification or a response, which need none. */
  async function rpc(m) {
    if (Array.isArray(m)) { if (!m.length) return rpcError(null, -32600, "Invalid Request"); const out = (await Promise.all(m.map(rpc))).filter(Boolean); return out.length ? out : null; }
    if (!m || typeof m !== "object" || m.jsonrpc !== "2.0") return rpcError(m?.id, -32600, "Invalid Request");
    if (typeof m.method !== "string") return "result" in m || "error" in m ? null : rpcError(m.id, -32600, "Invalid Request");
    const note = !("id" in m);
    if (m.params != null && typeof m.params !== "object") return note ? null : rpcError(m.id, -32602, "Invalid params");
    try { const result = await call(m.method, m.params || {}); return note ? null : { jsonrpc: "2.0", id: m.id, result }; }
    catch (e) { return note ? null : rpcError(m.id, e.code || -32603, e.code ? e.message : "Internal error"); }
  }

  // ---- HTTP: /mcp for an AI app, /capo/... for the page ----
  const body = (req) => new Promise((ok, no) => {
    const parts = []; let size = 0;
    req.on("data", (d) => { size += d.length; if (size > most.body) { no(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else parts.push(d); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(parts).toString("utf8"))); } catch { no(Object.assign(new Error("not JSON"), { status: 400 })); } });
    req.on("error", no);
  });
  /** A reply that stays open: one JSON object a line, with a line every ten seconds so nothing in between closes it. */
  function stream(res, head, gone) {
    res.writeHead(200, { ...head, "Content-Type": "application/x-ndjson; charset=utf-8" });
    const send = (obj) => { if (!res.writableEnded) res.write(`${JSON.stringify(obj)}\n`); }, beat = setInterval(() => send({ at: "waiting" }), o.beat || 10000);
    res.on("close", () => { clearInterval(beat); gone(); });
    return { send, end: () => { clearInterval(beat); res.end(); } };
  }
  async function http(req, res) {
    const base = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
    const end = (status, obj, more = {}) => { const t = obj === undefined ? "" : JSON.stringify(obj); res.writeHead(status, { ...base, ...more, ...(t && { "Content-Type": "application/json; charset=utf-8" }), "Content-Length": Buffer.byteLength(t) }); res.end(t); };
    try {
      let url; try { url = new URL(req.url, "http://127.0.0.1"); } catch { return end(400, { error: "bad address" }); }
      const mcp = url.pathname === "/mcp", origin = req.headers.origin;
      // a name that is not this computer means another site's address was pointed here (DNS rebinding): refuse it
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || "")) return end(403, { error: "this bridge answers only as 127.0.0.1 or localhost" });
      // a browser page says where it is from: only this computer, the Capo site and pages the player named may ask; never for /mcp
      const allowed = origin === undefined || local(origin) || (!mcp && (origins.has(origin) || (origin === "null" && !!o.allowFile)));
      if (!allowed) return end(403, { error: "this page may not use the bridge" });
      const cors = origin === undefined ? {} : { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Private-Network": "true", "Access-Control-Max-Age": "600" };
      if (req.method === "OPTIONS") return end(204, undefined, cors);
      const given = (req.headers.authorization || "").match(/^Bearer\s+(\S+)$/i)?.[1] || "";
      if (!given || !same(given, mcp ? tokens.client : tokens.page)) return end(401, { error: "the token is missing or wrong" }, { ...cors, "WWW-Authenticate": "Bearer" });

      if (mcp) {
        if (req.method !== "POST") return end(405, { error: "POST one JSON-RPC message; this server opens no stream of its own" }, { ...cors, Allow: "POST, OPTIONS" });
        const v = req.headers["mcp-protocol-version"];
        if (v && !VERSIONS.includes(v)) return end(400, rpcError(null, -32600, `Unsupported MCP-Protocol-Version: ${String(v).slice(0, 20)}`), cors);
        let m; try { m = await body(req); } catch (e) { return end(e.status || 400, rpcError(null, -32700, "Parse error"), cors); }
        const out = await rpc(m);
        return out ? end(200, out, cors) : end(202, undefined, cors);
      }

      const at = url.pathname, tell = (s) => { if (s && typeof s === "object" && !Array.isArray(s) && JSON.stringify(s).length <= most.state) { state = s; stateAt = Date.now(); } };
      if (at === "/capo/hello" && req.method === "GET") return end(200, { ok: true, bridge: "capo-bridge", version: VERSION, appSecondsAgo: seen ? Math.round((Date.now() - seen) / 1000) : null, waiting: !!job }, cors);
      if (at === "/capo/ask" && req.method === "POST") {
        const b = await body(req);
        if (typeof b?.prompt !== "string" || !b.prompt.trim() || b.prompt.length > most.prompt) return end(400, { error: "no prompt, or one too long" }, cors);
        tell(b.state);
        if (job) { job.send({ gone: true }); job.end(); } // one prompt waits at a time: a new one takes the old one's place
        const mine = { id: ++count, kind: Object.hasOwn(KIND, b.kind) ? b.kind : "turn", prompt: b.prompt, note: typeof b.note === "string" ? b.note.slice(0, 2000) : "", taken: false, tries: 0 };
        Object.assign(mine, stream(res, { ...base, ...cors }, () => { if (job === mine) { job = null; log("The page stopped waiting: the prompt is withdrawn."); } }));
        job = mine; mine.send({ at: "waiting" });
        log(`A prompt is waiting (${KIND[mine.kind]}). Tell your AI app: play my Capo turn.`);
        wake();
        return;
      }
      if (at === "/capo/listen" && req.method === "GET") {
        if (listener) { listener.send({ gone: true }); listener.end(); }
        const mine = stream(res, { ...base, ...cors }, () => { if (listener === mine) listener = null; });
        listener = mine; mine.send({ at: "ready" });
        return;
      }
      if (at === "/capo/state" && req.method === "POST") { tell((await body(req))?.state); return end(204, undefined, cors); }
      if (at === "/capo/answer" && req.method === "POST") {
        const b = await body(req), done = answers.get(String(b?.id));
        if (done) done({ ok: b.ok === true, text: String(b.text || "").slice(0, 300), note: String(b.note || "").slice(0, 400), why: String(b.why || "").slice(0, 400) });
        return end(204, undefined, cors);
      }
      return end(404, { error: "not found" }, cors);
    } catch (e) { if (!res.headersSent) end(e.status || 500, { error: e.status ? e.message : "the bridge failed" }); else res.end(); }
  }
  const close = () => { job?.end(); listener?.end(); job = listener = null; wake(); };
  return { rpc, http, close, peek: () => ({ job: job && { kind: job.kind, taken: job.taken }, listening: !!listener, state }) };
}

/** MCP over stdio: one JSON message a line in, one a line out, and nothing else on the output. */
export function stdio(handle, input, output, ended = () => {}) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let busy = Promise.resolve();
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let m; try { m = JSON.parse(line); } catch { output.write(`${JSON.stringify(rpcError(null, -32700, "Parse error"))}\n`); return; }
    const answer = Promise.resolve(handle(m)).catch(() => rpcError(m?.id, -32603, "Internal error"));
    busy = Promise.all([busy, answer.then((out) => { if (out) output.write(`${JSON.stringify(out)}\n`); })]); // a slow tool does not hold up the next message
  });
  rl.on("close", () => busy.then(ended));
  return rl;
}

/** The two tokens, kept in a file only its owner may read; made the first time, or again when asked. */
export function loadTokens(file, renew = false) {
  if (!renew && existsSync(file)) {
    try { const t = JSON.parse(readFileSync(file, "utf8")); if ([t.page, t.client].every((x) => typeof x === "string" && /^[a-f0-9]{48}$/.test(x))) return { page: t.page, client: t.client }; } catch { /* made again below */ }
  }
  const t = { page: randomBytes(24).toString("hex"), client: randomBytes(24).toString("hex") };
  writeFileSync(file, `${JSON.stringify({ what: "Tokens of the Capo bridge (tools/capo-mcp.mjs). Keep them to yourself.", ...t }, null, 1)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* a file system without modes */ }
  return t;
}

/** How to connect, in plain words. */
export function howTo(port, tokens, script) {
  return [`Capo bridge ${VERSION}, on this computer only: http://127.0.0.1:${port}`, "",
    "1. In Capo: Game, How Capo reaches an AI, Connect a service, Service \"Your AI app (MCP bridge)\". Paste this page token:",
    `     ${tokens.page}`,
    "2. In your AI app, add this script as an MCP server. For example, in Claude Code:",
    `     claude mcp add capo -- node "${script}"${port === BRIDGE_PORT ? "" : ` --port ${port}`}`,
    "   Or over HTTP, while this window stays open:",
    `     claude mcp add --transport http capo http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${tokens.client}"`,
    "3. Start a turn in Capo, then tell your AI app: play my Capo turn.", "",
    "The tokens stay the same until you run this with --new-tokens. Stop with Ctrl+C."].join("\n");
}

async function main(argv) {
  const has = (n) => argv.includes(n), arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }, all = (n) => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]] : []));
  const port = Number(arg("--port", BRIDGE_PORT)), file = path.resolve(arg("--tokens-file", path.join(homedir(), ".capo-bridge.json"))), script = fileURLToPath(import.meta.url);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error("The port must be a number from 1 to 65535."); process.exitCode = 1; return; }
  const tokens = loadTokens(file, has("--new-tokens"));
  if (has("--tokens") || has("--new-tokens")) { console.log(`${howTo(port, tokens, script)}\n\nKept in ${file}`); return; }
  const piped = has("--stdio") || (!has("--no-stdio") && !process.stdin.isTTY), say = (s) => (piped ? process.stderr : process.stdout).write(`${s}\n`); // stdout belongs to MCP when an app started us
  const bridge = makeBridge({ tokens, origins: [new URL(SITE_URL).origin, ...all("--origin")], allowFile: has("--allow-file"), log: say });
  const server = createServer(bridge.http);
  const quit = () => { bridge.close(); server.close(); server.closeAllConnections?.(); };
  server.on("error", async (e) => {
    if (e.code !== "EADDRINUSE") { say(`The bridge could not start: ${e.message}`); process.exitCode = 1; return; }
    // the port is taken. If it is another Capo bridge with our tokens and an AI app started us, pass the app's calls on to it
    const at = `http://127.0.0.1:${port}`, ours = await fetch(`${at}/capo/hello`, { headers: { Authorization: `Bearer ${tokens.page}` } }).then((r) => r.ok && r.json()).then((j) => j?.bridge === "capo-bridge").catch(() => false);
    if (!piped || !ours) { say(ours ? `A Capo bridge is already running on port ${port}. Use that one, or stop it first.` : `Port ${port} is in use by something else. Try --port with another number, and give Capo the same number.`); process.exitCode = 1; return; }
    say(`A Capo bridge is already running on port ${port}: passing this app's calls on to it.`);
    stdio(async (m) => { const r = await fetch(`${at}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${tokens.client}` }, body: JSON.stringify(m) }); return r.status === 202 ? null : r.json(); }, process.stdin, process.stdout);
  });
  server.listen(port, "127.0.0.1", () => {
    say(piped ? `Capo bridge ${VERSION} on http://127.0.0.1:${port} (this computer only). For the page token: node "${script}" --tokens` : howTo(port, tokens, script));
    if (piped) stdio(bridge.rpc, process.stdin, process.stdout, quit); // the app that started us has gone: stop
  });
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { quit(); process.exit(0); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
