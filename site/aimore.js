// SPDX-License-Identifier: AGPL-3.0-or-later
// Two additions to how Capo reaches an AI, kept apart from site/ai.js so its own lines stay few:
// 1. The MCP bridge: a service called "Your AI app (MCP bridge)". The player runs tools/capo-mcp.mjs themselves and
//    pastes its page token here; only then, and only when a call is made, does this page reach 127.0.0.1 on the
//    bridge's port, which the page rule already allows. The page never starts anything. An AI app may also propose an
//    order, if the player ticks that: the rules answer it, and it is given only when the player accepts it here.
// 2. Plugins: files of data the player opens (a prose style, a tone, a service preset), checked by
//    src/story/plugins.js like a save and kept in this browser. Never code: nothing in a plugin is run.
// The page parts are built from elements and text, never markup.
import { AI_BASES } from "./config.js";
import { BRIDGE_PORT, digest, judgeOrder } from "../src/story/bridge.js";
import { PLUGIN_KINDS, STYLES, TONES, checkPlugin, keepPlugins, toneWords, voice } from "../src/story/plugins.js";

const ORIGINS = [...new Set(Object.values(AI_BASES).map((b) => new URL(b).origin).filter((o) => o.startsWith("https:")))];
const fail = (kind, message) => Object.assign(new Error(message), { kind });
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "plain") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };

// ---- what site/ai.js lends: its list of services and the key's keeping ----
let ai = null;
/** Called once by site/ai.js: adds the bridge to its services, and every service preset kept from a file. */
export function aiMore(lent) { ai = lent; if (!ai.PRESETS.includes(BRIDGE)) ai.PRESETS.splice(Math.max(0, ai.PRESETS.length - 1), 0, BRIDGE); services(); }
function services() {
  if (!ai) return;
  for (let i = ai.PRESETS.length - 1; i >= 0; i--) if (ai.PRESETS[i].plugin) ai.PRESETS.splice(i, 1);
  ai.PRESETS.splice(Math.max(0, ai.PRESETS.length - 1), 0, ...kept().services);
}

// ---- 1. the bridge ----
export const BRIDGE = { id: "bridge", name: "Your AI app (MCP bridge), on this computer", shape: "bridge", cors: "local", local: true, tools: false, models: [], bridge: true, base: `http://127.0.0.1:${BRIDGE_PORT}`,
  about: "Your own AI app (Claude Code, Claude Desktop, Codex, any MCP client) tells the story, on its own sign-in: no key. You start the bridge yourself, with node tools/capo-mcp.mjs from Capo's source, and paste the token it prints." };
export const bridgeBase = (r) => `http://127.0.0.1:${Number.isInteger(r?.bridgePort) && r.bridgePort > 0 && r.bridgePort < 65536 ? r.bridgePort : BRIDGE_PORT}`;
const START = "Start it with: node tools/capo-mcp.mjs";
const to = (r, token, at, more = {}) => fetch(`${bridgeBase(r)}/capo/${at}`, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", ...more, headers: { Authorization: `Bearer ${token}`, ...(more.body && { "Content-Type": "application/json" }) } });
const post = (r, token, at, body) => to(r, token, at, { method: "POST", body: JSON.stringify(body) }).catch(() => null);
/** Reads a reply that stays open, one JSON object a line, handing each to take(); take returns true to stop. */
async function lines(res, take) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  try {
    for (let buf = "", done = false; !done;) {
      const piece = await reader.read();
      done = piece.done; buf += dec.decode(piece.value, { stream: !done });
      const all = buf.split("\n"); buf = done ? "" : all.pop();
      for (const l of all) { let d = null; try { d = JSON.parse(l); } catch { /* an empty line */ } if (d && take(d)) return true; }
    }
    return false;
  } finally { reader.cancel().catch(() => {}); }
}
const refusal = (res) => (res.status === 401 ? fail("key", "The bridge refused the token. Paste the page token it prints (node tools/capo-mcp.mjs --tokens shows it again).")
  : res.status === 403 ? fail("blocked", "The bridge turned this page away: it lets in Capo's own site and this computer. Start it with --origin and this page's address, or --allow-file for a page opened by double-click.")
    : fail("other", `The bridge answered with an error (${res.status}).`));

/**
 * One prompt through the bridge: it waits there until the player's AI app takes it (capo_next) and hands a reply back
 * (capo_reply). The reply is plain lines, read and judged like any other. o: kind, onStatus(sentence).
 */
export async function bridgeAsk(r, token, prompt, signal, o = {}) {
  if (!token) throw fail("key", `Give the bridge's page token first: Game, How Capo reaches an AI. ${START}`);
  if (signal?.aborted) throw fail("stop", "Stopped.");
  const stopped = () => fail(signal?.reason === "time" ? "time" : "stop", "Stopped.");
  let res;
  try { res = await to(r, token, "ask", { method: "POST", signal, body: JSON.stringify({ kind: o.kind || "turn", prompt, note: voiceNow(o.kind), state: snapshot() }) }); }
  catch { throw signal?.aborted ? stopped() : fail("blocked", `Nothing answered at ${bridgeBase(r)}. ${START} Your browser may also ask whether this page may reach devices on your network: allow it.`); }
  if (!res.ok) throw refusal(res);
  o.onStatus?.("The prompt is at the bridge. Tell your AI app: play my Capo turn.");
  let text = null, gone = false;
  try {
    await lines(res, (d) => {
      if (d.at === "taken") o.onStatus?.("Your AI app has the prompt and is writing.");
      if (d.gone) gone = true;
      if (typeof d.text === "string") text = d.text;
      return gone || text !== null;
    });
  } catch { throw signal?.aborted ? stopped() : fail("blocked", "The bridge went away before a reply came. Start it again, then ask again."); }
  if (gone) throw fail("other", "Another prompt took this one's place at the bridge. Ask again.");
  if (text === null) throw fail("blocked", "The bridge closed before a reply came. Start it again, then ask again.");
  if (!text.trim()) throw fail("empty", "Your AI app sent no text back.");
  hear(); // the bridge is there: listen for proposals again, if the player allows them
  for (const ms of [1500, 12000]) setTimeout(() => tell(r, token), ms).unref?.(); // once the page has read the reply and the rules have run, capo_state can show the receipt
  return text;
}
/** Is the bridge there, does it take the token, and has an AI app called it? Returns a sentence. */
export async function bridgeCheck(r, token, signal) {
  if (!token) throw fail("key", "Paste the bridge's page token first.");
  let res;
  try { res = await to(r, token, "hello", { signal }); } catch { throw fail("blocked", `Nothing answered at ${bridgeBase(r)}. ${START}`); }
  if (!res.ok) throw refusal(res);
  const d = await res.json().catch(() => null);
  if (d?.bridge !== "capo-bridge") throw fail("other", `Something else answers at ${bridgeBase(r)}, not the Capo bridge. Give the bridge another port.`);
  hear();
  return `The bridge is running (version ${String(d.version).slice(0, 12)}). ${d.appSecondsAgo == null ? "No AI app has called it yet: add it to your AI app as an MCP server." : `Your AI app last called it ${d.appSecondsAgo} seconds ago.`}`;
}

// ---- orders an AI app proposes: answered by the rules, given only when the player accepts ----
let host = null, hearing = null, offers = [], card = null;
/** Called once by the game page: g() the game, geo(), route(), most() attacks this turn allows, order(o), toast(text). */
export function aiHost(h) { host = h; hear(); }
const snapshot = () => { try { const g = host?.g(); return g ? digest(g, host.geo()) : null; } catch { return null; } };
let told = "";
/** Tells the bridge the game's digest when it has changed; never the game itself. */
function tell(r, token) { const s = snapshot(), now = JSON.stringify(s); if (!s || now === told) return; told = now; post(r, token, "state", { state: s }); }
const wanted = (r) => !!r && r.route === "address" && r.preset === "bridge" && r.propose === true;
/** Listens for proposals while the player allows them. A bridge that is not there ends it quietly, until the next call or check. */
export function hear() {
  const r = host?.route(), token = r && ai ? ai.keyOf(r) : "";
  if (hearing || !wanted(r) || !token) return;
  const ctl = hearing = new AbortController();
  (async () => {
    try {
      const res = await to(r, token, "listen", { signal: ctl.signal });
      if (!res.ok) return;
      told = ""; tell(r, token);
      await lines(res, (d) => { if (d.order) take(r, token, d.order); else tell(r, token); if (offers.length && !host.g()) { offers = []; show(); } return !!d.gone || !wanted(host.route()); }); // a game that was left takes its proposals with it
    } catch { /* the bridge is not there, or the player stopped listening */ } finally { ctl.abort(); if (hearing === ctl) hearing = null; }
  })();
}
export function unhear() { hearing?.abort(); hearing = null; }
function take(r, token, o) {
  let v; try { v = judgeOrder(host.g(), host.geo(), o, host.most()); } catch { v = { ok: false, why: "Capo could not weigh that order." }; }
  post(r, token, "answer", { id: o.id, ok: v.ok, text: v.order?.text, note: v.note, why: v.why });
  if (!v.ok) return;
  offers = [...offers.filter((x) => !(x.verb === v.order.verb && x.target === v.order.target)), { ...v.order, note: v.note }].slice(-6);
  show();
}
/** The proposals waiting, in a small box over the map: each with the rules' answer, Accept and Dismiss. */
function show() {
  card?.remove(); card = null;
  if (!offers.length || !globalThis.document?.body) return;
  card = el("section", undefined, "glass");
  card.setAttribute("aria-label", "Orders your AI app proposes"); card.setAttribute("role", "region");
  Object.assign(card.style, { position: "fixed", right: "8px", top: "112px", zIndex: "6", width: "min(360px, calc(100vw - 16px))", maxHeight: "50vh", overflow: "auto", padding: "10px 14px", boxSizing: "border-box" });
  const list = el("ul", undefined, "list"), said = el("p", `Your AI app proposes ${offers.length === 1 ? "an order" : `${offers.length} orders`}. Nothing is ordered unless you accept it; the rules carry it out when you advance.`, "note");
  said.setAttribute("role", "status");
  for (const o of offers) {
    const li = el("li"), row = el("div", undefined, "row"), drop = () => { offers = offers.filter((x) => x !== o); show(); };
    row.append(button("Accept", () => {
      const v = judgeOrder(host.g(), host.geo(), { verb: o.verb, target: o.target, detail: o.detail, seat: o.seat, approach: o.approach }, host.most()); // the game may have moved on since it was proposed
      drop();
      if (!v.ok) return host.toast(`No longer possible: ${v.why}`);
      host.order(v.order);
    }, "go"), button("Dismiss", drop));
    const words = el("span", `${o.text} By the rules today: ${o.note}.`);
    li.style.display = "grid"; row.style.margin = "0"; li.append(words, row); list.append(li);
  }
  card.append(el("h3", "Proposed by your AI app"), said, list);
  document.body.append(card);
}
export const proposals = () => offers.slice();

/** The bridge's part of the settings: the token, the port, a check, and whether an AI app may propose orders. ui: what site/ai.js lends its panel. */
export function bridgePart(r, ui) {
  const token = Object.assign(el("input", undefined, "plain"), { type: "password", value: ai.keyOf(r), placeholder: "The page token the bridge prints", autocomplete: "off", spellcheck: false });
  token.oninput = () => { ai.setKey(r, token.value); unhear(); };
  const port = Object.assign(el("input", undefined, "plain"), { type: "number", min: 1, max: 65535, value: String(new URL(bridgeBase(r)).port), inputMode: "numeric" });
  port.onchange = () => { const n = Number(port.value); r.bridgePort = Number.isInteger(n) && n > 0 && n < 65536 ? n : BRIDGE_PORT; port.value = String(new URL(bridgeBase(r)).port); ui.keep(); unhear(); hear(); };
  const result = ui.status(), steps = el("ol", undefined, "steps");
  for (const s of ["Get Capo's source and Node 22 or newer. Nothing else is installed.", "In a terminal there, run: node tools/capo-mcp.mjs. It prints a page token and how to add it to your AI app.", "Paste the page token below, and add the bridge to your AI app as it says.", "Start a turn here, then tell your AI app: play my Capo turn."]) steps.append(el("li", s));
  const check = button("Check the bridge", async () => {
    check.disabled = true; result.className = "note"; result.textContent = "Checking the bridge...";
    const stop = new AbortController(), t = setTimeout(() => stop.abort(), 8000);
    try { result.textContent = await bridgeCheck(r, ai.keyOf(r), stop.signal); } catch (e) { result.className = "warn"; result.textContent = e.message; }
    finally { clearTimeout(t); check.disabled = false; }
  }, "go");
  const may = Object.assign(el("input"), { type: "checkbox", checked: r.propose === true }), ml = el("label", undefined, "note"), row = el("div", undefined, "row");
  may.dataset.k = "propose";
  may.onchange = () => { r.propose = may.checked; ui.keep(); if (may.checked) hear(); else { unhear(); offers = []; show(); } };
  ml.append(may, " Let my AI app propose orders (a treaty, peace, an attack). The rules answer each one, and none is given unless I accept it here.");
  row.append(check, button("Forget the token", () => { ai.setKey(r, ""); unhear(); ui.draw("key"); ui.done("The bridge's token is forgotten."); }));
  return [steps, ui.line("Page token", token, "key"),
    ui.radios("Keep the token", "keep", [["session", "Only while this tab is open"], ["device", "Remember on this device"]], r.keep, (v) => { ai.setKeep(r, v); ui.draw(`keep-${v}`); }),
    ui.line("Port", port, "port"), ml, row, result,
    el("p", "This page reaches only 127.0.0.1 on that port, and only once you have chosen this and pasted the token. It never starts the bridge. Your AI app sees each prompt, as any AI service would, and a short summary of the game.", "note")];
}

// ---- 2. plugins: data the player opens, never code ----
const PLACE = "capo-plugins-1";
let store = null;
function kept() {
  if (store) return store;
  let raw = null; try { raw = JSON.parse(globalThis.localStorage?.getItem(PLACE) || "null"); } catch { /* nothing kept */ }
  return (store = keepPlugins(raw, ORIGINS));
}
function keep(next) {
  store = keepPlugins(next, ORIGINS); // checked again on the way in, as on the way out
  try { globalThis.localStorage?.setItem(PLACE, JSON.stringify(store)); } catch { /* it works for this visit */ }
  services();
  return store;
}
/** Take one plugin file's contents. Returns {ok, said} with a sentence for the player. */
export function openPlugin(raw) {
  const r = checkPlugin(raw, ORIGINS);
  if (!r.ok) return { ok: false, said: r.why };
  if (!r.plugin) return { ok: false, said: "A scenario pack opens from the first screen: New game, then Open a scenario file." };
  const k = kept(), p = r.plugin, list = { "capo-style": "styles", "capo-tone": "tones", "capo-service": "services" }[p.kind];
  keep({ ...k, [list]: [...k[list].filter((x) => x.id !== p.id), p], ...(p.kind === "capo-style" && { style: p.id }), ...(p.kind === "capo-tone" && { tone: p.id }) });
  return { ok: true, said: `Opened the ${PLUGIN_KINDS[p.kind].toLowerCase()} "${p.name}".${p.kind === "capo-service" ? " It is in the Service list now." : " It is chosen now."}` };
}
export function dropPlugin(id, kind) { const k = kept(), list = { "capo-style": "styles", "capo-tone": "tones", "capo-service": "services" }[kind]; if (list) keep({ ...k, [list]: k[list].filter((x) => x.id !== id) }); }
export const choosePlugin = (what, id) => keep({ ...kept(), [what]: id });
export const pluginsNow = () => kept();
/** What the storyteller is told about wording for one call: the chosen style and tone, or "". Never for the connection check. */
export function voiceNow(kind) {
  if (kind === "check") return "";
  const k = kept();
  return voice([...STYLES, ...k.styles].find((s) => s.id === k.style), [...TONES, ...k.tones].find((t) => t.id === k.tone));
}

/** The plugins section of the settings. ui: what site/ai.js lends its panel (line, status, draw, done). */
export function pluginPart(r, ui) {
  const k = kept(), box = el("div"), said = ui.status(), file = el("input");
  const pick = (label, key, own, mine, about) => {
    const s = el("select", undefined, "plain"), a = el("optgroup"), b = el("optgroup");
    s.append(new Option("None: as the AI writes", ""));
    a.label = "With Capo"; a.append(...own.map((x) => new Option(x.name, x.id))); s.append(a);
    if (mine.length) { b.label = "From your files"; b.append(...mine.map((x) => new Option(x.name, x.id))); s.append(b); }
    s.value = k[key];
    s.onchange = () => { choosePlugin(key, s.value); ui.draw(`plug-${key}`); };
    const chosen = [...own, ...mine].find((x) => x.id === k[key]);
    return [ui.line(label, s, `plug-${key}`), ...(chosen ? [el("p", about(chosen), "note")] : [])];
  };
  file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    let got;
    if (f.size > 400000) got = { ok: false, said: "That file is too big to be a plugin." };
    else { try { got = openPlugin(JSON.parse(await f.text())); } catch { got = { ok: false, said: "That file is not a Capo plugin: it is not JSON." }; } }
    if (got.ok) { ui.draw("plug-open"); ui.done(got.said); } else { said.className = "warn"; said.textContent = got.said; }
  };
  const open = button("Open a plugin file", () => file.click()), row = el("div", undefined, "row"), list = el("ul", undefined, "list");
  open.dataset.k = "plug-open"; row.append(open, file);
  for (const p of [...k.styles, ...k.tones, ...k.services]) {
    const li = el("li");
    li.append(el("span", `${PLUGIN_KINDS[p.kind]}: ${p.name}${p.kind === "capo-service" ? `, at ${p.base}` : ""}`), button("Remove", () => { if (r.preset === p.id) { r.preset = "openrouter"; r.model = ""; ui.keep(); } dropPlugin(p.id, p.kind); ui.draw("plug-open"); ui.done(`Removed "${p.name}".`); }));
    list.append(li);
  }
  box.append(el("h3", "Plugins: files, never code"),
    el("p", "A plugin is a small JSON file you open: a prose style or a tone for the storyteller, or a service preset. Capo checks each like a save, keeps only the parts it knows, and runs nothing from it. Scenario packs open from the first screen, with Open a scenario file.", "note"),
    ...pick("Prose style", "style", STYLES, k.styles, (s) => s.text), ...pick("Tone", "tone", TONES, k.tones, (t) => `${toneWords(t)}.`),
    el("p", "A style and a tone shape the wording only. The reply format, the facts and the rules stay as they are, and the rules judge every move as before.", "note"),
    row, said, ...(list.children.length ? [list] : []));
  return box;
}
