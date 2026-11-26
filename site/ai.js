// SPDX-License-Identifier: AGPL-3.0-or-later
// How Capo reaches an AI: a service the player connects with their own key, or a server on the player's computer
// (addresses in config.js; the page's rule reaches only those and this computer). There is no copy-and-paste route
// (ruling 142). A key is kept apart from the settings, in this tab only or on this device if
// asked, and never goes in a save, a file, a web address, a message shown or the console, nor to another service.
// The page parts at the end (settings, waiting box, connect box) are built from elements and text, never markup.
import { AI_BASES } from "./config.js";
import { formatOf, linesFrom, toolOf } from "../src/story/replyform.js";
import { SHAPES, splitEvents } from "../src/story/wire.js";

/** The reply allowance in tokens for each kind of call (lane 2 review). A thinking model gets four times as much. */
export const BUDGET = { turn: 1800, chat: 400, council: 500, ask: 500, character: 300, check: 300 };
export const thinks = (r) => !!r.think || /gpt-5|\bo[134]\b|o[134]-|reasoner|gemini-[23]|thinking|gpt-oss|qwen3|\br1\b/i.test(r.model || "");
export const allowance = (r, kind, tool) => Math.round((BUDGET[kind] || BUDGET.turn) * (thinks(r) ? 4 : 1) * (tool ? 1.5 : 1));

// cors: "yes" it answers web pages; "check" not yet seen doing so; "local" on this computer, which must let this page in.
const P = (id, name, shape, cors, models, about, more) => ({ id, name, shape, cors, tools: true, models, about, base: AI_BASES[id] || "", ...more });
export const PRESETS = [
  P("openrouter", "OpenRouter", "openai", "yes", ["openrouter/auto", "meta-llama/llama-3.3-70b-instruct:free"], "Many models on one key, some free: about 50 free calls a day. Give the key a spending limit."),
  P("groq", "Groq", "openai", "yes", ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"], "Fast open models; a free tier limited by tokens a day."),
  P("openai", "OpenAI", "openai", "yes", ["gpt-5-mini", "gpt-4.1-mini", "gpt-5"], "Paid by use.", { limit: "max_completion_tokens" }),
  P("anthropic", "Anthropic (Claude)", "anthropic", "yes", ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5"], "Paid by use."),
  P("gemini", "Google Gemini", "gemini", "yes", ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"], "A free tier, where Google may use what you send to improve its products; its terms ask for 18 or over."),
  P("mistral", "Mistral", "openai", "yes", ["mistral-small-latest", "mistral-large-latest"], "Needs billing: the free plan has no app access.", { choice: "any" }),
  P("deepseek", "DeepSeek", "openai", "check", ["deepseek-chat", "deepseek-reasoner"], "Paid by use, cheap."),
  P("together", "Together AI", "openai", "check", ["meta-llama/Llama-3.3-70B-Instruct-Turbo"], "Paid by use."),
  P("cerebras", "Cerebras", "openai", "yes", ["llama-3.3-70b", "gpt-oss-120b"], "Very fast; a trial credit, then paid."),
  P("ollama", "Ollama, on this computer", "openai", "local", ["llama3.1", "qwen2.5"], "Free and private. Set OLLAMA_ORIGINS to this site's address, then restart Ollama.", { local: true }),
  P("lmstudio", "LM Studio, on this computer", "openai", "local", [], "Free and private. Start its server with CORS turned on.", { local: true }),
  P("llamacpp", "llama.cpp server, on this computer", "openai", "local", [], "Free and private; llama-server lets pages in by default.", { local: true, tools: false }),
  P("custom", "Other, on this computer", "openai", "local", [], "Any server here that speaks the common chat-completions form (vLLM, LiteLLM, Jan, KoboldCpp), at an address ending in /v1.", { custom: true, tools: false }),
];
/** These need a server in between (they turn web pages away, or this page may not reach them). Capo ships none. */
export const NEEDS_PROXY = ["Azure OpenAI", "Amazon Bedrock", "Google Vertex AI", "SambaNova", "any service not listed"];
/** The services that work, in a player's words: shown wherever Capo needs an AI and none is connected. */
export const WORKS = "Free to start: OpenRouter's free models, Groq and Google Gemini have free tiers, and Cerebras a trial credit. Free and private, on your own computer: Ollama, LM Studio or a llama.cpp server. Paid by use: OpenAI, Anthropic (Claude), Mistral, DeepSeek and Together AI.";

const ORIGINS = [...new Set(Object.values(AI_BASES).map((b) => new URL(b).origin).filter((o) => o.startsWith("https:")))];
/** The page rule's connect-src, exactly: its own site, each service above, and this computer. */
export const CONNECT = ["'self'", ...ORIGINS, "http://localhost:*", "http://127.0.0.1:*"];
export function reachable(base) {
  let u; try { u = new URL(base); } catch { return false; }
  return (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) || (u.protocol === "https:" && ORIGINS.includes(u.origin));
}

// ---- the settings and the keys, kept apart ----
const PLACE = "capo-ai", KEYS = "capo-ai-key", L = "localStorage", S = "sessionStorage";
const shelf = (k) => { try { return globalThis[k] || null; } catch { return null; } }; // a browser that blocks storage throws on the name alone
const get = (k, n) => { try { return JSON.parse(shelf(k)?.getItem(n) || "null"); } catch { return null; } };
const put = (k, n, v) => { try { const s = shelf(k); if (!s) return false; if (v == null) s.removeItem(n); else s.setItem(n, JSON.stringify(v)); return true; } catch { return false; } };
let held = {}; // the keys in use this visit, by service

/** Connected means a service or a server on this computer is set to answer; anything else, a saved "paste" too, is not. */
export const connected = (r) => r?.route === "address";
export function loadRoute() {
  const old = get(L, PLACE) || get(S, PLACE) || {}, r = { preset: "openrouter", base: "", model: "", keep: "session", tools: true, calls: 0, sent: 0, got: 0, day: "", ...old };
  if (old.route === "address" && !old.preset) r.preset = "custom"; // before presets, an address was the custom form
  if (!connected(r)) { if (old.route === "paste") r.gone = true; r.route = "none"; } // the paste route is gone (ruling 142): a note says so until an AI is connected
  if (old.route === "paste") saveRoute(r);
  if ("remember" in old) r.keep = old.remember ? "device" : "session";
  delete r.remember; delete r.key;
  if ("key" in old || "remember" in old) { if (old.key) setKey(r, old.key); saveRoute(r); } // the key once lived in the settings: move it out
  return r;
}
/** Keeps the settings. Never a key, whatever the object carries. */
export function saveRoute(r) { const { key, remember, ...plain } = r; if (put(L, PLACE, plain)) put(S, PLACE, null); else put(S, PLACE, plain); }
const where = (keep) => (keep === "device" ? L : S);
export const keyOf = (r) => held[r.preset] ?? get(S, KEYS)?.[r.preset] ?? get(L, KEYS)?.[r.preset] ?? "";
/** Keeps a service's key in this tab only ("session") or on this device ("device"), never both. */
export function setKey(r, key) {
  const k = String(key || "").trim();
  held = { ...held, [r.preset]: k };
  for (const s of [S, L]) { const all = { ...get(s, KEYS) }; delete all[r.preset]; if (k && s === where(r.keep)) all[r.preset] = k; put(s, KEYS, Object.keys(all).length ? all : null); }
}
/** Moves every kept key to where the player now wants keys kept. */
export function setKeep(r, keep) {
  r.keep = keep === "device" ? "device" : "session";
  const all = { ...get(L, KEYS), ...get(S, KEYS), ...Object.fromEntries(Object.entries(held).filter(([, v]) => v)) };
  put(where(r.keep), KEYS, Object.keys(all).length ? all : null);
  put(r.keep === "device" ? S : L, KEYS, null);
  saveRoute(r);
}
export function forgetKeys() { held = {}; put(S, KEYS, null); put(L, KEYS, null); }
/** A text with the key, and anything shaped like a key, taken out: for every message shown. */
export const scrub = (text, key = "") => (key.length > 3 ? String(text).split(key).join("[your key]") : String(text)).replace(/\b(?:sk|gsk|csk|xai|AIza)[-_A-Za-z0-9*.]{10,}/g, "[a key]");

export const presetOf = (r) => PRESETS.find((p) => p.id === r.preset) || PRESETS.at(-1);
export const baseOf = (r) => String((presetOf(r).custom ? r.base : presetOf(r).base) || "").trim().replace(/\/+$/, "");

// ---- errors in plain words, each with a kind the page and the retries act on ----
const fail = (kind, message, more) => Object.assign(new Error(message), { kind, ...more });
/** What a refusal means, from its status and the service's own words (shown, short, without the key). */
export function explain(status, said, { p = PRESETS[0], key = "", model = "", wait = 0, code = "" } = {}) {
  const s = `${code} ${said}`, n = p.name, words = scrub(String(said || "").replace(/\s+/g, " ").trim().slice(0, 160), key);
  const tell = (kind, plain) => fail(kind, words ? `${plain} It said: "${words}"` : plain, { status, wait });
  if (status === 401 || /api[_ ]key[_ ]invalid|api key not valid|invalid (x-)?api[- _]key|incorrect api key|invalid authentication|unauthori[sz]ed/i.test(s) || (status === 403 && /\bkey\b/i.test(s))) return tell("key", `${n} refused the key. Check that it is whole, is for ${n}, and has not been revoked.`);
  if (status === 402 || /insufficient_quota|insufficient (account )?balance|credit balance|not enough credits|more credits|out of credits|payment required/i.test(s)) return tell("credit", `The account behind this key has no credit, or no billing set up. Add credit at ${n}, or choose a free model or another service.`);
  if (status === 400 && /max_tokens|max_completion_tokens|maxOutputTokens/i.test(s)) return tell("limit", `${n} refused the reply allowance.`);
  if ([400, 404, 422, 500].includes(status) && /\btools?\b|function[_ ]?call|tool_choice/i.test(s)) return tell("tools", `${n} refused a structured reply for this model.`);
  if (status === 404 || /model.{0,40}(not found|does not exist|unknown|not supported|invalid)|no such model|model_not_found|no endpoints found/i.test(s)) return tell("model", `${n} does not know the model "${model || "(none)"}". Check its name, or choose one that Check connection lists.`);
  if (status === 429) return tell("rate", `${n} says too many requests${p.shape === "gemini" ? ", or today's free limit is used up" : ""}.`);
  if (status === 403) return tell("denied", `${n} refused this request: the key may not be allowed this model, or the service is not offered where you are.`);
  if (status >= 500 || /overloaded/i.test(s)) return tell("busy", `${n} is busy or having trouble${status ? ` (${status})` : ""}.`);
  return tell("other", `${n} answered with an error${status ? ` (${status})` : ""}.`);
}
function unreachable(p, base) {
  if (globalThis.navigator?.onLine === false) return fail("offline", "This device is offline. Connect, then ask again.");
  if (p.local || p.custom) return fail("blocked", `Nothing answered at ${base}, or it turned this page away. Is it running? ${p.about.split(". ").slice(1).join(". ") || "It must allow calls from web pages (CORS)."} Your browser may also ask whether this page may reach devices on your network: allow it.`);
  return fail("blocked", `The call to ${p.name} was blocked or did not get through. Check your connection.${p.cors === "check" ? ` ${p.name} may not accept calls from a web page (CORS); then it needs a server in between, which Capo does not ship.` : " A browser extension or the network may be blocking it."}`);
}
const stopped = (why) => (why === "time" ? fail("time", "The AI sent nothing for two minutes. Ask again, or choose another model or service.") : fail("stop", "Stopped."));
const pause = (ms, signal) => new Promise((ok, no) => { const t = setTimeout(ok, ms); signal?.addEventListener("abort", () => { clearTimeout(t); no(stopped("stop")); }, { once: true }); });

/** One request: gives up when nothing arrives for two minutes (o.idle) or at ten in all (o.cap). */
async function once(c, o) {
  const shape = SHAPES[c.p.shape], ctl = new AbortController(), a = { text: "", args: "", thinking: 0, end: "", sent: 0, got: 0 };
  let why = "", timer = 0;
  if (c.signal?.aborted) throw stopped("stop");
  const quit = () => { why = c.signal.reason === "time" ? "time" : "stop"; ctl.abort(); }, end = () => { why = "time"; ctl.abort(); };
  const idle = () => { clearTimeout(timer); timer = setTimeout(end, o.idle || 120000); }, cap = setTimeout(end, o.cap || 600000);
  c.signal?.addEventListener("abort", quit);
  idle();
  try {
    let res;
    try {
      res = await fetch(shape.url(c), { method: "POST", signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
        headers: { "Content-Type": "application/json", ...shape.head(c.key) }, body: JSON.stringify(shape.body(c)) });
    } catch { throw why ? stopped(why) : unreachable(c.p, c.base); }
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let d = null; try { d = JSON.parse(raw); } catch { /* the words themselves */ }
      if (Array.isArray(d)) d = d[0];
      const e = d?.error, said = e?.message || (typeof e === "string" ? e : "") || d?.message || d?.detail || raw.slice(0, 200);
      throw explain(res.status, said, { p: c.p, key: c.key, model: c.model, wait: Math.min(60, Number(res.headers.get("retry-after")) || 0) * 1000, code: e?.code || e?.type || e?.status || "" });
    }
    if (c.stream && res.body && /event-stream/.test(res.headers.get("content-type"))) {
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (let buf = "", done = false; !done;) {
        const piece = await reader.read();
        done = piece.done; buf += dec.decode(piece.value, { stream: !done }); idle();
        const got = splitEvents(buf, done);
        buf = got.rest; for (const d of got.out) shape.take(d, a);
        o.onText?.(a);
      }
    } else {
      const raw = await res.text(); // asked to stream or not, a service may answer either way
      for (const d of /^\s*(data|event):/.test(raw) ? splitEvents(raw, true).out : [JSON.parse(raw)]) shape.take(d, a);
      o.onText?.(a);
    }
    return a;
  } catch (e) {
    if (why) throw stopped(why);
    if (e?.kind) throw e;
    if (e instanceof SyntaxError) throw fail("empty", `${c.p.name} sent something that is not a reply.`);
    if (e && !(e instanceof Error)) throw explain(Number(e.code) || 0, e.message || e.type || "", { p: c.p, key: c.key, model: c.model, code: e.type || e.status }); // an error inside the stream
    throw unreachable(c.p, c.base);
  } finally { clearTimeout(timer); clearTimeout(cap); c.signal?.removeEventListener("abort", quit); }
}

/**
 * Send one prompt and return the reply's text, in its own lines (a structured reply is turned back into them, and read
 * and judged like any other). o: kind (a key of BUDGET), onText(progress), onStatus(sentence) before a retry, idle, cap, sleep.
 * Throws an Error with a plain sentence and a kind: key, credit, model, rate, busy, blocked, time, stop, cut, empty,
 * filter, denied, address, offline, connect, other.
 */
export async function ask(r, prompt, signal, o = {}) {
  if (!connected(r)) throw fail("connect", "No AI is connected yet. Connect one in Game, How Capo reaches an AI.");
  const p = presetOf(r), base = baseOf(r), key = keyOf(r), kind = o.kind || "turn", model = r.model || p.models[0] || "";
  if (!reachable(base)) throw fail("address", "The address must be a server on this computer, such as http://localhost:8000/v1: this page may reach only the services it lists and this computer.");
  if (!key && !p.local && !p.custom) throw fail("key", `Give your ${p.name} key first: Game, How Capo reaches an AI.`);
  if (!model && p.shape !== "openai") throw fail("model", `Choose a model for ${p.name}.`);
  const fmt = p.tools && r.tools !== false && !r.plain?.[p.id] && kind !== "check" && formatOf(prompt), tool = fmt && toolOf(fmt);
  const c = { p, base, key, model, prompt, signal, tool, stream: !!o.onText && kind !== "check", max: r.loose?.[p.id] ? 0 : allowance(r, kind, !!tool) };
  let a;
  for (let tries = 0; !a;) {
    try { a = await once(c, o); } catch (e) {
      if (e.kind === "limit" && c.max) { c.max = 0; r.loose = { ...r.loose, [p.id]: 1 }; continue; } // ask again without the allowance, and remember
      if (e.kind === "tools" && c.tool) { c.tool = null; r.plain = { ...r.plain, [p.id]: 1 }; continue; } // ask again for plain lines, and remember
      if (!["rate", "busy"].includes(e.kind) || tries >= 3) throw e;
      const ms = e.wait || [2000, 6000, 15000][tries];
      tries++;
      o.onStatus?.(`${e.message.split(" It said")[0]} Trying again in ${Math.round(ms / 1000)} seconds (${tries} of 3).`);
      await (o.sleep || pause)(ms, signal);
    }
  }
  if (a.end === "filter") throw fail("filter", `${p.name}'s safety filter stopped the reply. Ask again, or choose another model or service.`);
  const text = c.tool && a.args.trim() ? linesFrom(fmt, a.args) : a.text; // a model may answer in plain lines anyway: they are read as they are
  if (kind === "check") return (text || "").trim() || (a.end === "length" ? "(it spent its allowance thinking)" : "(nothing)");
  if (text === null) throw fail("cut", "The AI's structured reply was broken or cut off. Ask again.");
  if (!text.trim()) throw a.end === "length" ? fail("cut", "The model spent its whole allowance before writing, as thinking models do. Tick Thinking model, then ask again.") : fail("empty", `${p.name} sent no text back.`);
  if (a.end === "length" && kind === "turn" && !/\bEND\b/.test(text)) throw fail("cut", "The reply was cut off before its end. Ask again, or tick Thinking model for a longer allowance.");
  const today = new Date().toISOString().slice(0, 10);
  if (r.day !== today) Object.assign(r, { day: today, calls: 0, sent: 0, got: 0 });
  r.calls++; r.sent += a.sent || Math.ceil(prompt.length / 4); r.got += a.got || Math.ceil(text.length / 4);
  saveRoute(r);
  return text;
}

/** Check connection: lists the service's models (no tokens spent), then asks for one word. Returns { models, said, ms }. */
export async function check(r, signal) {
  const p = presetOf(r), base = baseOf(r), key = keyOf(r), t0 = Date.now();
  let models = [];
  if (reachable(base) && (key || p.local || p.custom)) {
    let res;
    try { res = await fetch(`${base}/models`, { signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", headers: SHAPES[p.shape].head(key) }); }
    catch { throw signal?.aborted ? stopped("stop") : unreachable(p, base); }
    if ([401, 402, 403].includes(res.status)) { const d = await res.json().catch(() => null); throw explain(res.status, d?.error?.message || d?.message || "", { p, key }); }
    if (res.ok) models = SHAPES[p.shape].list(await res.json().catch(() => ({}))).filter((m) => typeof m === "string").slice(0, 200);
  }
  const said = await ask({ ...r, route: "address", model: r.model || (!models.length || models.includes(p.models[0]) ? p.models[0] : models[0]) || "" }, "Reply with the single word READY.", signal, { kind: "check" });
  return { models, said, ms: Date.now() - t0 };
}

// ---- on the page: the waiting box, the connect box and the settings, each step spoken through a polite status line ----
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "plain") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };
const status = (text = "", cls = "note") => { const p = el("p", text, cls); p.setAttribute("role", "status"); p.setAttribute("aria-live", "polite"); return p; };
let ids = 0;
const uid = (s) => `ai-${s}-${++ids}`;
const later = (f) => (globalThis.requestAnimationFrame || setTimeout)(f);
const lost = () => !document.activeElement || document.activeElement === document.body || document.activeElement.disabled;

// ---- waiting for the AI: who, how long, what has come so far, and Stop ----
let live = null;
const boxes = new Set();
const paint = () => { for (const b of boxes) if (b.isConnected) b.paint(); else boxes.delete(b); };
/** Starts the clock for one call; hand the result's onText and onStatus to ask(), and call done() when it ends. */
export function watch(r) {
  const p = presetOf(r);
  live = { who: `${p.name}${r.model ? `, ${r.model}` : ""}`, since: Date.now(), text: "", thinking: 0, status: "" };
  const tick = setInterval(paint, 1000);
  return {
    onText: (a) => { if (!live) return; live.text = a.text || (a.args ? `A structured reply: ${a.args.length} characters so far.` : ""); live.thinking = a.thinking; paint(); },
    onStatus: (s) => { if (live) { live.status = s; paint(); } },
    done: () => { clearInterval(tick); live = null; },
  };
}
/** The waiting box. It keeps itself up to date while the call lasts. */
export function waitBox(stop) {
  const wrap = el("div", undefined, "wait"), say = status(), clock = el("p", "", "note"), seen = el("div", "", "stream"), row = el("div", undefined, "row"), halt = button("Stop", stop);
  say.textContent = `Waiting for ${live?.who || "the AI"}. The prompt is kept if this fails.`;
  seen.setAttribute("aria-label", "The reply so far");
  row.append(halt);
  wrap.paint = () => {
    if (!live) return;
    const s = Math.round((Date.now() - live.since) / 1000);
    clock.textContent = `${s < 60 ? `${s} second${s === 1 ? "" : "s"}` : `${Math.floor(s / 60)} min ${s % 60} s`}${live.text ? `, ${live.text.length} characters so far` : live.thinking ? ", thinking" : ""}.`;
    if (live.status && say.textContent !== live.status) say.textContent = live.status;
    seen.textContent = live.text.slice(-1500);
    seen.hidden = !live.text;
  };
  wrap.append(say, clock, seen, row);
  wrap.paint(); boxes.add(wrap);
  later(() => { if (wrap.isConnected && lost()) halt.focus(); }); // Advance is disabled while waiting, so focus would fall to the page
  return wrap;
}

// ---- when a call cannot go: no AI connected yet, or the AI did not answer ----
let shown = "";
/**
 * What stands in for a reply that has not come. With no AI connected: what works, and the settings to connect one
 * (o.connected() runs once a check succeeds). Connected: the error, and Ask again. o: title, route, error, again(),
 * cancel(), connected(), note(text), more (buttons of the caller's own).
 */
export function connectBox(o) {
  const wrap = el("div", undefined, "connectbox"), on = connected(o.route), row = el("div", undefined, "row"), again = on && o.again ? button("Ask again", o.again, "go") : null;
  const error = o.error ? el("p", o.error, "warn") : null;
  if (error) error.tabIndex = -1;
  row.append(...(again ? [again] : []), ...(o.more || []), button("Cancel", o.cancel));
  const head = el("h3", o.title || (on ? "The AI did not answer" : "Connect an AI"));
  head.tabIndex = -1;
  if (on) wrap.append(head, ...(error ? [error] : []), row);
  else wrap.append(head, ...(error ? [error] : []), el("p", `Capo needs an AI to tell the story, and asks it for you. ${WORKS}`, "note"), aiPanel(o.route, o.note, { onConnect: o.connected, title: "Your AI" }), row);
  // something new to show: scrolled into view, focus on the error, Ask again or the heading
  const fresh = `${on}:${o.title || ""}:${o.error || ""}`;
  if (fresh !== shown) {
    shown = fresh;
    later(() => { if (!wrap.isConnected) return; wrap.scrollIntoView?.({ block: "start", behavior: "smooth" }); (error || again || head).focus({ preventScroll: true }); });
  }
  return wrap;
}

// ---- the Game panel: how Capo reaches an AI ----
const CORS = { yes: "Works from this page.", check: "Not yet seen working from a web page: Check connection tells.", local: "Runs on your computer, which must let this page in." };
/**
 * The settings section. r is the route object, changed in place and kept; done(text) may show a short note.
 * Check connection is the one way to connect: when it succeeds, r is connected and o.onConnect() runs. o.title names it.
 */
export function aiPanel(r, done = () => {}, o = {}) {
  const box = el("section", undefined, "aipanel");
  const draw = (focus) => { box.replaceChildren(...parts()); if (focus) box.querySelector(`[data-k="${focus}"]`)?.focus(); };
  const keep = () => saveRoute(r);
  let said = ""; // what Check connection found, kept across the redraw that follows a first connection
  const line = (label, input, k) => { const l = el("label", undefined, "note field"); input.dataset.k = k; l.append(label, input); return l; };
  const radios = (legend, k, list, value, on) => {
    const f = el("fieldset", undefined, "choices"), name = uid(k); f.append(el("legend", legend, "note"));
    for (const [v, text] of list) { const l = el("label"), i = el("input"); Object.assign(i, { type: "radio", name, value: v, checked: v === value }); i.dataset.k = `${k}-${v}`; i.onchange = () => on(v); l.append(i, ` ${text}`); f.append(l); }
    return f;
  };
  function parts() {
    const head = el("h3", o.title || "How Capo reaches an AI"), result = status(), p = presetOf(r);
    head.id = uid("head"); box.setAttribute("aria-labelledby", head.id); result.id = uid("result"); result.textContent = said; said = "";
    const out = [head, connected(r) ? el("p", `Connected: ${p.name}${r.model ? `, ${r.model}` : ""}. Capo asks it for each turn, chat and question.`, "note")
      : el("p", "No AI is connected. Choose a service, give its key if it needs one, and press Check connection.", "note")];
    if (r.gone && !connected(r)) out.push(el("p", "Copying prompts into a chat and pasting replies back is no longer part of Capo. Connect a service or an AI on this computer here; a turn can also move by the rules alone.", "warn"));
    const pick = el("select", undefined, "plain"), groups = [["Hosted: your own key", (x) => !x.local && !x.custom], ["On this computer: no key", (x) => x.local || x.custom]];
    for (const [label, test] of groups) { const g = el("optgroup"); g.label = label; g.append(...PRESETS.filter(test).map((x) => new Option(x.name, x.id))); pick.append(g); }
    pick.value = p.id;
    pick.onchange = () => { r.preset = pick.value; r.model = ""; keep(); draw("preset"); };
    out.push(line("Service", pick, "preset"), el("p", `${p.about} ${CORS[p.cors] || ""}`, "note"));
    const fields = {};
    if (p.custom) {
      const base = Object.assign(el("input", undefined, "plain"), { type: "url", value: r.base, placeholder: "For example http://localhost:8000/v1", spellcheck: false });
      base.onchange = () => { r.base = base.value.trim(); keep(); };
      out.push(line("Address", base, "base")); fields.address = base;
    }
    const model = Object.assign(el("input", undefined, "plain"), { type: "text", value: r.model, placeholder: p.models[0] || "The model's name, as the service writes it", spellcheck: false }), list = el("datalist");
    list.id = uid("models"); model.setAttribute("list", list.id);
    const fill = (names) => list.replaceChildren(...[...new Set([...p.models, ...names])].map((m) => new Option(m, m)));
    fill(r.seen?.[p.id] || []);
    model.onchange = () => { r.model = model.value.trim(); keep(); };
    out.push(line("Model", model, "model"), list); fields.model = model;
    if (!p.local) {
      const key = Object.assign(el("input", undefined, "plain"), { type: "password", value: keyOf(r), placeholder: p.custom ? "Key, if the server needs one" : `Your ${p.name} key`, autocomplete: "off", spellcheck: false });
      key.oninput = () => setKey(r, key.value);
      out.push(line("Key", key, "key"), radios("Keep the key", "keep", [["session", "Only while this tab is open"], ["device", "Remember on this device"]], r.keep, (v) => { setKeep(r, v); draw(`keep-${v}`); }));
      if (r.keep === "device") out.push(el("p", `A remembered key stays in this browser, where every page at ${location.host || "this site"} can read it, not only Capo, until Capo has an address of its own. Only on your own device, with a spending limit.`, "warn"));
      fields.key = key;
    }
    const think = Object.assign(el("input"), { type: "checkbox", checked: !!r.think }), tl = el("label", undefined, "note");
    think.dataset.k = "think"; think.onchange = () => { r.think = think.checked; keep(); };
    tl.append(think, ` Thinking model: allow four times the reply length${!r.think && thinks(r) ? " (on already for this model's name)" : ""}`);
    out.push(tl);
    if (p.tools) {
      const tools = Object.assign(el("input"), { type: "checkbox", checked: r.tools !== false }), l = el("label", undefined, "note");
      tools.dataset.k = "tools"; tools.onchange = () => { r.tools = tools.checked; if (r.plain) delete r.plain[p.id]; keep(); };
      l.append(tools, " Structured replies: the AI fills in a form (a tool call). The rules check it the same way.");
      out.push(l);
    }
    const ask = button("Check connection", async () => {
      ask.disabled = true; ask.textContent = "Checking..."; result.className = "note"; result.textContent = `Checking ${p.name}...`;
      for (const f of Object.values(fields)) { f.removeAttribute("aria-invalid"); f.removeAttribute("aria-describedby"); }
      const stop = new AbortController(), t = setTimeout(() => stop.abort(), 60000);
      try {
        const got = await check(r, stop.signal);
        if (got.models.length) { r.seen = { ...r.seen, [p.id]: got.models.slice(0, 100) }; keep(); fill(got.models); }
        const first = !connected(r);
        r.route = "address"; delete r.gone; keep();
        result.textContent = `Connected to ${p.name}${r.model ? `, ${r.model}` : ""}. It answered "${got.said.slice(0, 40)}" in ${(got.ms / 1000).toFixed(1)} seconds.${got.models.length ? ` It lists ${got.models.length} models: the Model field offers them.` : ""}`;
        if (first && o.onConnect) { done(`Connected to ${p.name}.`); o.onConnect(); return; }
        if (first) { said = result.textContent; draw("check"); }
      } catch (e) {
        result.className = "warn"; result.textContent = e.message;
        const at = { key: fields.key, credit: fields.key, denied: fields.key, model: fields.model, address: fields.address || fields.model }[e.kind];
        if (at) { at.setAttribute("aria-invalid", "true"); at.setAttribute("aria-describedby", result.id); }
      } finally { clearTimeout(t); ask.disabled = false; ask.textContent = "Check connection"; ask.focus(); }
    }, "go");
    ask.dataset.k = "check";
    const row = el("div", undefined, "row");
    row.append(ask, button("Forget my key", () => { forgetKeys(); draw("key"); done("Every key is forgotten: none is kept in this browser now."); }));
    if (connected(r)) row.append(button("Disconnect", () => { r.route = "none"; keep(); draw("preset"); done("Disconnected: Capo calls no AI until you connect one again."); }));
    out.push(row, result, el("p", `Today: ${r.calls || 0} calls, about ${r.sent || 0} tokens sent and ${r.got || 0} received.`, "note"));
    return [...out, ...tail()];
  }
  function tail() {
    return [el("p", `Capo has no server: a key goes only to its service, never into a save, a file or a web address. Needing a server in between, which Capo does not ship: ${NEEDS_PROXY.join(", ")}.`, "note")];
  }
  draw();
  return box;
}
