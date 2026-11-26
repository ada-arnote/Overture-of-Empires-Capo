// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's game screen: the world map full-screen, a top bar, the dock and the province card, as in the original
// Ancient Kingdom: choose any country and a mode, write actions, jump time, read what happened. The AI proposes
// moves; the rules in src/story/worldrules.js decide which stand, and the map follows.
import { JUMPS, MODES, jumpFrom, monthsOf, newWorldGame, readWorldReply, turnCode, worldPrompt } from "../src/story/turn.js";
import { applyMoves, mightOf, placesFor, treatiesOf, warsOf } from "../src/story/worldrules.js";
import { crossesLine } from "../src/story/rules.js";
import { loadWorld, ownerColour, worldMap } from "./worldmap.js";
import { ask, forgetKey, loadRoute, saveRoute } from "./ai.js";

const KEEP = "capo-game-1";
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "plain") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };
let world, map, state = null, past = [], route = loadRoute(), sheet = null, pending = null, chosen = null, jump = "1m", hush = 0, ledgerTab = "events";

// games saved before wars and treaties existed get empty lists
const mend = (s) => ({ wars: [], treaties: [], offers: [], ...s });
const save = () => { try { localStorage.setItem(KEEP, JSON.stringify({ state, past: past.slice(-10) })); } catch { /* the game still runs for this visit */ } };
const load = () => { try { return JSON.parse(localStorage.getItem(KEEP) || "null"); } catch { return null; } };
function toast(t) { const b = $("toast"); b.textContent = t; b.classList.add("on"); clearTimeout(hush); hush = setTimeout(() => b.classList.remove("on"), 3400); }
const name = (code) => world.countries[code] || code;
const ownerOf = (id) => state?.owners[id] || world.provinces.get(id).country;
const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// the largest province of each country, where the camera goes to show it
let homes = new Map();
function index() {
  homes = new Map();
  for (const p of world.provinces.values()) {
    const a = (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]), h = homes.get(p.country);
    if (!h || a > h.a) homes.set(p.country, { a, id: p.id });
  }
}
const showCountry = (code) => { const h = homes.get(code); if (h) map.show(h.id); };
const held = (code) => [...world.provinces.keys()].filter((id) => ownerOf(id) === code);
function landNeighbours(code) {
  const out = new Set();
  for (const id of held(code)) for (const n of world.neighbours.get(id)) { const o = ownerOf(n); if (o !== code) out.add(o); }
  return [...out];
}

/** What the rules may ask of the map. */
function geo() {
  return {
    name, place: (id) => world.provinces.get(id), owner: ownerOf, neighbours: (id) => world.neighbours.get(id), coastal: (id) => world.coast.has(id),
    holds: (c) => held(c).length, known: (c) => homes.has(c), hasCoast: (c) => held(c).some((id) => world.coast.has(id)),
    find: (s) => { const k = String(s || "").trim(); if (world.provinces.has(k)) return k; const low = k.toLowerCase(), hits = [...world.provinces.values()].filter((p) => p.name.toLowerCase() === low); return hits.length === 1 ? hits[0].id : null; },
  };
}

// ---- the first screen ----
function startScreen() {
  const box = $("start-box"), kept = load(), pick = el("input", undefined, "plain"), list = el("datalist");
  list.id = "countries";
  const byName = new Map(Object.entries(world.countries).filter(([c]) => homes.has(c)).map(([c, n]) => [n, c]));
  list.append(...[...byName.keys()].sort().map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
  Object.assign(pick, { type: "search", placeholder: "Type a country, or tap one on the map", value: chosen ? name(chosen) : "" });
  pick.setAttribute("list", "countries");
  pick.onchange = () => { const c = byName.get(pick.value); if (c) { chosen = c; showCountry(c); } };
  const modes = el("div", undefined, "modes");
  for (const [k, [label, what]] of Object.entries(MODES)) {
    const l = el("label"), r = el("input"), t = el("span");
    Object.assign(r, { type: "radio", name: "mode", value: k, checked: k === "nation" });
    t.append(el("b", label), el("small", `You play as ${what}.`));
    l.append(r, t); modes.append(l);
  }
  const begin = () => {
    const c = byName.get(pick.value) || chosen;
    if (!c) return toast("Choose a country first.");
    const mode = modes.querySelector("input:checked").value, seed = [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join("");
    state = newWorldGame(c, mode, seed); past = []; save();
    $("start").classList.remove("open"); play();
  };
  const go = el("div", undefined, "row");
  go.append(button("Begin", begin, "go"));
  if (kept?.state) go.append(button(`Continue as ${name(kept.state.player)}, ${fmtDate(kept.state.date)}`, () => { state = mend(kept.state); past = (kept.past || []).map(mend); $("start").classList.remove("open"); play(); }));
  const l1 = el("label"); l1.append("Your country", pick, list);
  box.replaceChildren(el("p", "Overture of Empires", "eyebrow"), el("h1", "Capo"),
    el("p", "Lead any country in the world today, or live in one. You decide what to do; an AI tells what happens; the rules keep the facts. An early test build of the new screen.", "note"),
    l1, el("div", "How you play", "note"), modes, go,
    el("p", "Fiction for adults. Not news and not a forecast. Real public figures may appear. Needs an AI: paste each turn into any AI you use, or give an address.", "note"));
  $("start").classList.add("open");
}

// ---- the game ----
function play() {
  $("top").hidden = false; $("dock").hidden = false;
  map.redraw(); showCountry(state.player);
  topBar(); dock();
}

function topBar() {
  const top = $("top"), who = el("button", undefined, "who"), chip = el("span", undefined, "chip");
  chip.style.background = ownerColour(state.player);
  who.append(chip, name(state.player)); who.onclick = () => showCountry(state.player);
  const jumpPick = el("select", undefined, "plain");
  jumpPick.append(...JUMPS.map(([k, t]) => new Option(t, k))); jumpPick.value = jump; jumpPick.onchange = () => { jump = jumpPick.value; };
  jumpPick.setAttribute("aria-label", "How far to jump");
  const date = el("span", undefined, "date"); date.append("Turn ", el("b", String(state.turn)), ", ", el("b", fmtDate(state.date)));
  top.replaceChildren(who, el("span", MODES[state.mode][0], "mode"), date, jumpPick, button("Advance", advance, "go"), button("Game", () => open("game")));
}

const DOCK = [["actions", "Actions"], ["chats", "Chats"], ["ledger", "Ledger"], ["advisors", "Advisors"], ["master", "Game Master"]];
function dock() {
  $("dock").replaceChildren(...DOCK.map(([k, t]) => { const b = button(t, () => open(sheet === k ? null : k)); b.setAttribute("aria-pressed", String(sheet === k)); return b; }));
}

function open(which) {
  sheet = which;
  const box = $("sheet");
  dock();
  if (!which) { box.classList.remove("open"); return; }
  box.replaceChildren(button("Close", () => open(null), "plain shut"));
  ({ actions, chats, ledger, advisors, master, game: gameSheet }[which])(box);
  box.classList.add("open");
}

function actions(box) {
  const input = el("textarea", undefined, "plain"), list = el("ul", undefined, "list");
  input.rows = 3; input.maxLength = 600; input.placeholder = "What do you do? For example: Offer our neighbours a trade pact, and quietly move troops to the border.";
  input.setAttribute("aria-label", "A new action");
  const add = () => { const t = input.value.trim(); if (!t) return; state.actions = [...(state.actions || []), t]; save(); open("actions"); };
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } };
  list.append(...(state.actions || []).map((a, i) => { const li = el("li"); li.append(el("span", a), button("Remove", () => { state.actions.splice(i, 1); save(); open("actions"); })); return li; }));
  const near = landNeighbours(state.player).slice(0, 3), ideas = el("div", undefined, "row");
  for (const t of ["Strengthen the army.", "Spend on schools and hospitals.", ...near.map((c) => `Seek closer ties with ${name(c)}.`)]) ideas.append(button(t, () => { state.actions = [...(state.actions || []), t]; save(); open("actions"); }));
  const go = el("div", undefined, "row");
  go.append(button("Add", add), button(`Advance ${JUMPS.find((j) => j[0] === jump)[1].toLowerCase()}`, advance, "go"));
  box.append(el("h2", "Actions"), el("p", "Write what you do, in your own words, as many as you like. The AI reads them all and proposes moves; the rules decide what stands: wars, peace, treaties, attacks and handovers.", "note"), list, input, go, el("h3", "Ideas"), ideas);
  if (pending) box.append(pasteBox());
}

function pasteBox() {
  const wrap = el("div"), out = el("textarea", undefined, "plain paste"), back = el("textarea", undefined, "plain paste");
  out.value = pending.prompt; out.readOnly = true; out.setAttribute("aria-label", "The prompt");
  back.placeholder = "Paste the AI's whole reply here."; back.setAttribute("aria-label", "The AI's reply");
  const go = el("div", undefined, "row");
  go.append(button("Copy the prompt", async () => { try { await navigator.clipboard.writeText(pending.prompt); toast("Copied. Paste it into a new chat."); } catch { out.select(); } }), button("Read the reply", () => finish(back.value), "go"), button("Cancel", () => { pending = null; open("actions"); }));
  if (route.route === "address") go.prepend(button("Ask again", () => viaAddress()));
  wrap.append(el("h3", route.route === "paste" ? "Paste this into a new chat" : "The AI did not answer"), ...(pending.error ? [el("p", pending.error, "warn")] : []), el("p", "Start a new chat for every turn. Paste the whole reply back.", "note"), out, back, go);
  return wrap;
}

function advance() {
  const acts = state.actions || [], bad = crossesLine(acts);
  if (bad.length) return toast(`Action ${bad.join(", ")} is refused: nothing sexual involving minors.`);
  const to = jumpFrom(state.date, jump);
  const g = geo();
  pending = { prompt: worldPrompt(state, { name, neighbours: landNeighbours, size: (c) => held(c).length, geo: g, places: placesFor(state, g, [...world.provinces.keys()]) }, acts, to), to, actions: acts, months: monthsOf(jump) };
  if (route.route === "paste") { open("actions"); return; }
  viaAddress();
}
async function viaAddress() {
  toast("Asking the AI...");
  try { finish(await ask(route, pending.prompt)); } catch (e) { pending.error = e.message; open("actions"); toast(e.message); }
}
function finish(text) {
  const r = readWorldReply(text, state, (c) => homes.has(c), pending.to);
  if (!r.matched) { pending.error = `That reply is not for this turn: it must start with TURN: ${turnCode(state)}.`; open("actions"); return; }
  if (!r.events.length) { pending.error = `No event could be read${r.dropped.length ? `: ${r.dropped.slice(0, 3).join("; ")}` : ""}.`; open("actions"); return; }
  past.push(structuredClone(state));
  const receipt = applyMoves(state, r.moves, geo(), pending.actions, pending.months);
  state.log.push({ from: state.date, to: pending.to, actions: pending.actions, events: r.events, summary: r.summary, dropped: r.dropped, receipt });
  state.log = state.log.slice(-60);
  state.date = pending.to; state.turn++; state.actions = [];
  pending = null; save(); topBar(); ledgerTab = "events"; open("ledger"); map.refresh();
  const changed = receipt.filter((x) => x.ok && / takes it from | hands /.test(x.text)).length;
  toast(`Now ${fmtDate(state.date)}.${changed ? ` ${changed} province${changed > 1 ? "s" : ""} changed hands.` : ""}`);
}

function ledger(box) {
  const tabs = el("div", undefined, "row");
  for (const [k, t] of [["events", "Events"], ["world", "World"], ["log", "Log"]]) { const b = button(t, () => { ledgerTab = k; open("ledger"); }); b.setAttribute("aria-pressed", String(ledgerTab === k)); tabs.append(b); }
  box.append(el("h2", "Ledger"), tabs);
  const last = state.log[state.log.length - 1];
  if (ledgerTab === "world") { worldTab(box); return; }
  if (ledgerTab === "log") {
    if (!state.log.length) { box.append(el("p", "Nothing yet.", "note")); return; }
    const feed = el("ol", undefined, "feed");
    feed.append(...state.log.slice().reverse().map((t) => { const li = el("li"); li.append(el("div", `${fmtDate(t.from)} to ${fmtDate(t.to)}`, "note"), el("p", t.summary || `${t.events.length} events.`)); return li; }));
    box.append(feed); return;
  }
  if (!last) { box.append(el("p", "Nothing has happened yet. Write your actions and advance.", "note")); return; }
  const feed = el("ol", undefined, "feed");
  for (const e of last.events) {
    const li = el("li"), when = button(`${fmtDate(e.date)}, ${name(e.at)}`, () => showCountry(e.at), "when");
    li.append(when, el("p", e.text)); feed.append(li);
  }
  box.append(el("p", last.summary, "note"), feed);
  if (last.receipt?.length) {
    const list = el("ul", undefined, "list");
    list.append(...last.receipt.map((x) => { const li = el("li"); li.append(el("span", `${x.ok ? "✓" : "✗"} ${x.text}.`)); if (!x.ok) li.style.opacity = ".7"; return li; }));
    box.append(el("h3", "What the rules decided"), list);
  }
  if (last.dropped.length) box.append(el("p", `Left out of the reply: ${last.dropped.join("; ")}.`, "note"));
}

function worldTab(box) {
  const me = state.player, wars = state.wars.map((w) => w.pair.split("|")), list = (items, empty) => { const ul = el("ul", undefined, "list"); ul.append(...(items.length ? items : [empty]).map((t) => { const li = el("li"); li.append(el("span", t)); return li; })); return ul; };
  const taken = Object.entries(state.owners).map(([id, c]) => `${world.provinces.get(id).name}: held by ${name(c)}, taken from ${name(world.provinces.get(id).country)}`);
  box.append(el("h3", "Wars"), list(wars.map(([a, b]) => `${name(a)} and ${name(b)}, since ${fmtDate(state.wars.find((w) => w.pair === [a, b].join("|")).since)}`), "No wars."),
    el("h3", "Treaties"), list(state.treaties.map((t) => { const [a, b] = t.pair.split("|"); return `${name(a)} and ${name(b)}: ${t.kind}`; }), "No treaties."),
    el("h3", "Offers to you"), list(state.offers.map((o) => `${name(o.from)} offers ${o.kind === "peace" ? "peace" : `a ${o.kind} treaty`} (${fmtDate(o.date)}). To accept, write it in your actions.`), "None."),
    el("h3", "Land that has changed hands"), list(taken, "None yet."),
    el("p", `${name(me)}: might ${mightOf(geo(), me)} of 10 (invented, for this fiction), ${held(me).length} provinces.`, "note"));
}

const later = (title, what) => (box) => box.append(el("h2", title), el("p", what, "note"));
const advisors = later("Advisors", "Your council comes in a later step: advisers who follow your character's standing, give counsel before each turn, and gain or lose favour with what you do.");
const master = later("Game Master", "Comes in a later step: tell the story what is true, in canonical or free mode, with undo.");
function chats(box) {
  const near = landNeighbours(state.player);
  box.append(el("h2", "Chats"), el("p", "Talking with other countries comes in a later step: one chat per country or group, each a separate AI call, and what is said feeds the next turn.", "note"));
  if (near.length) box.append(el("h3", "Your neighbours by land"), el("p", near.map(name).join(", ")));
}

function gameSheet(box) {
  const pick = el("select", undefined, "plain"), base = el("input", undefined, "plain"), model = el("input", undefined, "plain"), key = el("input", undefined, "plain"), keep = el("input");
  pick.append(new Option("Paste by hand into any AI", "paste"), new Option("An address I give (chat-completions form)", "address")); pick.value = route.route;
  Object.assign(base, { type: "text", value: route.base, placeholder: "The service's address, ending in /v1" });
  Object.assign(model, { type: "text", value: route.model, placeholder: "Model name, as the service writes it" });
  Object.assign(key, { type: "password", value: route.key, placeholder: "Key, if the service needs one", autocomplete: "off" });
  Object.assign(keep, { type: "checkbox", checked: !!route.remember });
  const line = (label, input) => { const l = el("label", undefined, "note"); l.style.display = "grid"; l.style.gap = "4px"; l.append(label, input); return l; };
  const keepLine = el("label", undefined, "note"); keepLine.append(keep, " Remember the key on this device");
  const store = () => { route = { ...route, route: pick.value, base: base.value.trim(), model: model.value.trim(), key: key.value, remember: keep.checked }; saveRoute(route); };
  const aiRow = el("div", undefined, "row");
  aiRow.append(button("Save", () => { store(); toast("Saved."); }, "go"), button("Test", async () => { store(); try { const t = await ask(route, "Reply with the single word READY."); toast(`It answered: ${t.slice(0, 40)}`); } catch (e) { toast(e.message); } }), button("Forget the key", () => { route = forgetKey(route); open("game"); toast("Key forgotten."); }));
  const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const s = JSON.parse(await f.text()); if (s?.v !== 1 || !homes.has(s.player)) throw new Error(); state = s; past = []; save(); toast("Opened."); open(null); play(); } catch { toast("That file is not a Capo game."); } };
  const saves = el("div", undefined, "row");
  saves.append(button("Take back the last turn", () => { if (!past.length) return toast("Nothing to take back."); state = past.pop(); save(); topBar(); open("game"); map.refresh(); }),
    button("Save to a file", () => { const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: "application/json" })); a.download = `capo-${state.player}-turn-${state.turn}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }),
    button("Open a file", () => file.click()),
    button("New game", () => { if (confirm("Leave this game? It stays saved until you begin another.")) { open(null); $("top").hidden = true; $("dock").hidden = true; state = null; startScreen(); } }));
  box.append(el("h2", "Game"), el("h3", "Your game"), el("p", `Kept in this browser. ${past.length} turn${past.length === 1 ? "" : "s"} can be taken back.`, "note"), saves, file,
    el("h3", "How Capo reaches an AI"), line("Route", pick), line("Address", base), line("Model", model), line("Key", key), keepLine, aiRow,
    el("p", `Today: ${route.calls || 0} calls, about ${route.sent || 0} tokens sent and ${route.got || 0} received.`, "note"),
    el("p", "A key goes only to the address you give, straight from this page. Capo has no server and never sees it.", "note"));
}

// ---- the province card ----
function card(p) {
  chosen = p ? (state ? chosen : p.country) : chosen;
  const box = $("card");
  if (!p) { box.style.display = "none"; return; }
  if (!state) { $("start-box").querySelector("input[type=search]").value = name(p.country); chosen = p.country; }
  const owner = ownerOf(p.id), near = el("div", undefined, "near");
  for (const id of world.neighbours.get(p.id)) { const n = world.provinces.get(id); near.append(button(n.name, () => { card(n); map.show(n.id); })); }
  const wars = state ? warsOf(state, owner) : [], pacts = state ? treatiesOf(state, owner) : [];
  const rows = [el("h2", p.name), el("p", `${name(owner)}${owner !== p.country ? `, taken from ${name(p.country)}` : ""}.${wars.length ? ` At war with ${wars.map(name).join(", ")}.` : ""}${pacts.length ? ` Treaties: ${pacts.map((x) => `${name(x.with)} (${x.kind})`).join(", ")}.` : ""}`, "note"), el("p", near.children.length ? "Borders by land:" : "No land borders: reached by sea.", "note"), near];
  if (state && owner !== state.player) rows.push(el("div", undefined, "row")), rows[rows.length - 1].append(button(`Talk to ${name(owner)}`, () => open("chats")));
  box.replaceChildren(...rows);
  box.style.display = "block";
  picked = p.id;
}
let picked = null;

async function start() {
  try { world = await loadWorld("../maps/world.json"); } catch (e) { toast(`${e.message} Capo needs its web address, not a file opened by double-click.`); return; }
  index();
  map = worldMap($("map"), world, { owner: ownerOf, name, pick: card, picked: () => picked });
  $("in").onclick = () => map.zoomBy(1.6);
  $("out").onclick = () => map.zoomBy(1 / 1.6);
  $("home").onclick = () => (state ? showCountry(state.player) : map.reset());
  const kept = load();
  if (kept?.state && homes.has(kept.state.player)) { state = mend(kept.state); past = (kept.past || []).map(mend); play(); } else startScreen();
}
start();
