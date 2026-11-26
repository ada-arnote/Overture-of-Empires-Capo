// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo, the story game, on one page: choose a country, give orders, let an AI tell what happened, and keep the facts.
import { ADVICE, VERBS, addMonths, buildAsk_, buildPrompt_, changeCouncil_, crossesLine, factLines_, habits_, newGame, parseAsk_, runTurn_, seated_, trusted_ } from "../src/story/rules.js";
import { WORLDS } from "../src/story/worlds.js";
import { FRAME, OUTLINES, toMap } from "../src/story/maps/andes.js";
import { ask, forgetKey, loadRoute, saveRoute } from "./ai.js";
import { footer } from "./footer.js";

const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "quiet") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };
const KEEP = "capo-story-1", MONTHS = [[1, "A month"], [3, "Three months"], [6, "Six months"], [12, "A year"]];
let state = null, route = loadRoute(), tab = "story", orders = [], months = 1, pending = null, hush = 0;

function toast(t) { const b = $("toast"); b.textContent = t; b.classList.add("on"); clearTimeout(hush); hush = setTimeout(() => b.classList.remove("on"), 3200); }
function sheet(title, body) { $("sheet-title").textContent = title; $("sheet-body").replaceChildren(body); if (!$("sheet").open) $("sheet").showModal(); }
$("sheet-close").onclick = () => $("sheet").close();
const save = () => { try { localStorage.setItem(KEEP, JSON.stringify(state)); } catch { /* the story still runs for this visit */ } };
const load = () => { try { return JSON.parse(localStorage.getItem(KEEP) || "null"); } catch { return null; } };
const game = () => state.history[state.history.length - 1];
const world = () => WORLDS[game().world];
const country = (c) => game().countries[c]?.name || world().others[c] || c;
const placeName = (k) => world().places[k]?.[0] || k;
const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// ---- the first screen ----
function setup() {
  const box = el("div", undefined, "panel"), w = WORLDS.andes, pick = el("select"), kept = load();
  pick.append(...Object.entries(w.countries).map(([c, v]) => new Option(`${v.name}, led by ${v.leader}`, c)));
  pick.value = w.player;
  const line = (label, input) => { const l = el("label", undefined, "field-line"); l.append(label, input); return l; };
  box.append(el("h2", w.title), el("p", w.note, "note"), line("Your country", pick),
    el("p", "Fiction for adults. Not news and not a forecast. Real public figures appear as the story's characters, from a dated list.", "note"),
    el("p", "Needs an AI: paste each turn into any AI you use, or give it an address in the AI tab. The table games never need one.", "note"));
  const go = el("div", undefined, "go");
  go.append(button("Begin", () => { const seed = [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join(""); state = { history: [newGame("andes", pick.value, seed)], log: [] }; orders = []; save(); tab = "orders"; render(); }, "main"));
  if (kept?.history?.length) go.prepend(button(`Continue: ${WORLDS[kept.history[0].world].countries[kept.history[0].player].name}, turn ${kept.history[kept.history.length - 1].turn}`, () => { state = kept; render(); }));
  box.append(go);
  $("view").replaceChildren(box);
}

// ---- the playing screen ----
function render() {
  if (!state) return setup();
  const g = game(), me = g.countries[g.player], tabs = el("nav", undefined, "tabs");
  for (const [k, label] of [["story", "Story"], ["orders", "Orders"], ["council", "Council"], ["ledger", "Ledger"], ["ai", "AI"], ["saves", "Saves"]]) {
    const b = button(label, () => { tab = k; render(); }); b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(tab === k)); tabs.append(b);
  }
  const status = el("div", undefined, "status");
  for (const [k, v] of [["", `${fmtDate(g.date)}, turn ${g.turn}`], ["", me.name], ["Strength", me.strength], ["Coin", me.coin], ["Unrest", me.unrest]]) { const s = el("span"); if (k) s.append(`${k} `); s.append(el("b", String(v))); status.append(s); }
  const body = el("div");
  ({ story, orders: orderTab, council, ledger, ai: aiTab, saves }[tab])(body);
  $("view").replaceChildren(status, tabs, body);
}

// ---- the map: outlines from the borders file; each place is a dot in the colour of whoever holds it ----
const HUES = { BOL: "#d9b45a", BRA: "#4fa070", ARG: "#6ea6d8", CHL: "#d0675f", PER: "#b583d0", COL: "#4fb3b0" };
let wide = false;
function map(body) {
  const g = game(), w = world(), ns = "http://www.w3.org/2000/svg", box = el("div", undefined, "panel map"), say = el("p", "Choose a place to see who holds it.", "note");
  const make = (t, at, parent) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); parent?.append(e); return e; };
  const svg = make("svg", { viewBox: (wide ? FRAME.whole : FRAME.near).join(" "), role: "group", "aria-label": `Map of ${w.title}: the border places and who holds them` });
  for (const [c, d] of Object.entries(OUTLINES)) {
    make("path", { d, fill: HUES[c] || "#56605f", "fill-opacity": HUES[c] ? (c === g.player ? 0.42 : 0.24) : 0.16, stroke: c === g.player ? "#e2b866" : "rgba(255,244,214,.35)", "stroke-width": c === g.player ? 2.5 : 1, "stroke-linejoin": "round" }, svg);
  }
  for (const [c, [lon, lat]] of Object.entries(w.labels)) {
    const [x, y] = toMap(lon, lat);
    make("text", { x, y, "text-anchor": "middle", class: "map-name" }, svg).textContent = country(c);
  }
  const at = (k) => toMap(...w.spots[k]), seen = new Set();
  for (const [k, [, , next]] of Object.entries(w.places)) for (const n of next) {
    const pair = [k, n].sort().join("|");
    if (seen.has(pair)) continue;
    seen.add(pair);
    const [[x1, y1], [x2, y2]] = [at(k), at(n)];
    make("line", { x1, y1, x2, y2, class: "map-link" }, svg);
  }
  for (const [k, p] of Object.entries(g.places)) {
    const [x, y] = at(k), taken = p.holder !== p.owner, tell = `${placeName(k)}: held by ${country(p.holder)}${taken ? `, taken from ${country(p.owner)}` : ""}`;
    const dot = make("circle", { cx: x, cy: y, r: 8, fill: HUES[p.holder] || "#9aa", class: taken ? "map-dot taken" : "map-dot", tabindex: 0, role: "button", "aria-label": tell }, svg);
    make("title", {}, dot).textContent = tell;
    const show = () => { say.textContent = `${tell}. Borders: ${w.places[k][2].map(placeName).join(", ")}.`; };
    dot.onclick = show;
    dot.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); } };
  }
  const head = el("div", undefined, "map-head");
  head.append(el("h2", "The border places"), button(wide ? "Border region" : "Whole continent", () => { wide = !wide; render(); }, "small"));
  box.append(head, svg, say);
  body.append(box);
}

function story(body) {
  const last = state.log[state.log.length - 1];
  map(body);
  if (!last) { body.append(el("p", "Nothing has happened yet. Give your first orders in the Orders tab and advance.", "note")); return; }
  body.append(el("h2", `What happened, ${fmtDate(last.from)} to ${fmtDate(last.to)}`));
  const feed = el("ol", undefined, "feed");
  for (const e of last.events) {
    const li = el("li", undefined, e.dropped.length || e.refused ? "held" : "");
    li.append(el("div", `${e.date}, ${placeName(e.at) || country(e.at)}`, "when"), el("p", e.text));
    if (e.refused) li.append(el("div", `Held back: the rules refused this (${e.refused}).`, "why"));
    if (e.dropped.length) li.append(el("div", `Left out: ${e.dropped.join("; ")}.`, "why"));
    feed.append(li);
  }
  for (const l of last.letters) { const li = el("li", undefined, "letter"); li.append(el("div", `Letter from ${country(l.from)} to ${country(l.to)}`, "when"), el("p", l.text)); if (l.dropped.length) li.append(el("div", `Left out: ${l.dropped.join("; ")}.`, "why")); feed.append(li); }
  if (last.adviser?.word) { const li = el("li"); li.append(el("div", `Your trusted adviser, ${last.adviser.name}`, "when"), el("p", `${last.adviser.word}: ${last.adviceText || ""}`)); feed.append(li); }
  body.append(feed);
  const why = el("details"), list = el("ul", undefined, "receipt");
  list.append(...last.receipt.map((r) => el("li", r)));
  why.append(el("summary", "What the rules decided"), list);
  body.append(why);
}

function orderTab(body) {
  const g = game(), box = el("div", undefined, "panel"), list = el("ol", undefined, "orders"), input = el("textarea"), chips = el("div", undefined, "chips");
  input.rows = 2; input.maxLength = 280; input.placeholder = "Type an order in your own words, for example: Offer Peru a trade treaty.";
  input.setAttribute("aria-label", "A new order");
  list.append(...orders.map((o, i) => { const li = el("li"); li.append(el("span", `${i + 1}. ${o}`), button("Remove", () => { orders.splice(i, 1); render(); }, "small")); return li; }));
  const add = () => { const t = input.value.trim(); if (!t) return; if (orders.length >= 8) return toast("Eight orders a turn at most."); orders.push(t.slice(0, 280)); render(); };
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } };
  const neighbours = Object.keys(g.countries).filter((c) => c !== g.player);
  for (const [t, f] of [["Mobilise", () => "Mobilise the army."], ["Reform", () => "Spend on reform to calm the country."], ...neighbours.slice(0, 3).map((c) => [`Talk to ${country(c)}`, () => `Open talks with ${country(c)}.`])]) chips.append(button(t, () => { if (orders.length < 8) { orders.push(f()); render(); } }, "small"));
  const jump = el("select"); jump.append(...MONTHS.map(([v, t]) => new Option(t, String(v)))); jump.value = String(months); jump.onchange = () => { months = Number(jump.value); };
  jump.setAttribute("aria-label", "How far to jump");
  const go = el("div", undefined, "go");
  go.append(button("Add order", add), button(`Advance${orders.length ? "" : " with no orders"}`, advance, "main"));
  box.append(el("h2", "Your orders"), el("p", `Up to eight. The AI reads them; the rules decide what happens. Moves the rules know: ${Object.keys(VERBS).map((v) => v.toLowerCase()).join(", ")}.`, "note"), list, input, chips, jump, go);
  body.append(box);
  if (pending) body.append(pasteBox(pending));
}

/** The turn: check, build the prompt, reach the AI by paste or by address, then let the rules run it. */
async function advance() {
  const g = game(), bad = crossesLine(orders);
  if (bad.length) return toast(`Order ${bad.join(", ")} is refused: nothing sexual involving minors.`);
  const prompt = buildPrompt_(g, orders, months);
  pending = { kind: "turn", prompt, orders: [...orders], months, tries: 0 };
  if (route.route === "paste") { render(); return; }
  await viaAddress();
}
async function viaAddress() {
  toast("Asking the AI...");
  try { finishPending(await ask(route, pending.prompt)); } catch (e) { pending.error = e.message; render(); toast(e.message); }
}
function pasteBox(p) {
  const box = el("div", undefined, "panel"), out = el("textarea", undefined, "paste"), back = el("textarea", undefined, "paste");
  out.value = p.prompt; out.readOnly = true; out.setAttribute("aria-label", "The prompt");
  back.placeholder = "Paste the AI's whole reply here."; back.setAttribute("aria-label", "The AI's reply");
  const go = el("div", undefined, "go");
  go.append(button("Copy the prompt", async () => { try { await navigator.clipboard.writeText(p.prompt); toast("Copied. Paste it into a new chat."); } catch { out.select(); } }), button("Read the reply", () => finishPending(back.value), "main"));
  if (route.route === "address") go.prepend(button("Ask again", () => viaAddress()));
  go.append(button("Cancel", () => { pending = null; render(); }));
  box.append(el("h2", route.route === "paste" ? "Paste this into a new chat" : "The AI did not answer"), ...(p.error ? [el("p", p.error, "warn")] : []), el("p", "Start a new chat for every turn. Paste the whole reply back, from the TURN line to END.", "note"), out, back, go);
  return box;
}
function finishPending(text) {
  const g = game(), p = pending;
  if (p.kind === "ask") {
    const r = parseAsk_(text, g);
    if (!r.matched) { p.error = "That reply is not for this question. Ask again, or paste the right reply."; render(); return; }
    pending = null;
    const box = el("div");
    box.append(...r.says.map((s) => { const d = el("div", undefined, "member"); d.append(el("b", `${s.name}: ${s.word}`), el("p", s.text)); return d; }), ...(r.dropped.length ? [el("p", `Left out: ${r.dropped.join("; ")}.`, "note")] : []));
    sheet("The council answers", box);
    render();
    return;
  }
  const r = runTurn_(g, p.orders, p.months, text);
  if (!r.ok) { p.error = r.reply.dropped.length ? `The reply could not be read: ${r.reply.dropped.slice(0, 3).join("; ")}.` : "The reply could not be read."; p.tries++; render(); return; }
  state.history.push(r.game);
  state.log.push({ from: g.date, to: r.game.date, events: r.events, letters: r.letters, receipt: r.receipt, adviser: r.adviser, adviceText: r.reply.advice?.text || "" });
  state.history = state.history.slice(-30);
  state.log = state.log.slice(-30);
  pending = null; orders = []; tab = "story";
  save();
  render();
}

function council(body) {
  const g = game(), t = trusted_(g), box = el("div", undefined, "panel");
  box.append(el("h2", "Your council"), el("p", "Invented people. The rules decide what they think and how much they like you; the AI only gives them a voice. Favour moves one step a turn at most; at minus three they resign.", "note"));
  for (const [seat, m] of Object.entries(g.council.seats)) {
    const d = el("div", undefined, `member${m && t && m.id === t.id ? " trusted" : ""}`);
    if (!m) { d.append(el("b", `${seat}: vacant`)); box.append(d); continue; }
    const row = el("div", undefined, "row");
    row.append(button("Make trusted", () => change("trust", m.id), "small"), button("Ask", () => askCouncil(m.id), "small"), button("Dismiss", () => change("dismiss", m.id), "small"));
    d.append(el("b", `${m.name}, ${seat}${t && m.id === t.id ? " (trusted adviser)" : ""}`), el("span", `${m.traits}. Wants ${m.wants}. Favour ${m.favour > 0 ? "+" : ""}${m.favour}.`, "note"), row);
    box.append(d);
  }
  const free = [...g.council.bench, ...g.council.former], empty = Object.entries(g.council.seats).filter(([, m]) => !m).map(([s]) => s);
  if (free.length && empty.length) {
    box.append(el("h2", "Could be appointed"));
    for (const p of free) { const d = el("div", undefined, "member"), row = el("div", undefined, "row"); for (const s of empty) row.append(button(`Appoint to ${s}`, () => change("appoint", p.id, s), "small")); d.append(el("b", p.name), el("span", `${p.traits}. Wants ${p.wants}.`, "note"), row); box.append(d); }
  }
  const go = el("div", undefined, "go");
  go.append(button("Ask the whole council", () => askCouncil("council"), "main"));
  box.append(go);
  body.append(box);
  if (pending?.kind === "ask") body.append(pasteBox(pending));
}
function change(act, id, seat) {
  const next = changeCouncil_(game(), act, id, seat);
  if (!next) return toast("That change makes no sense now.");
  state.history[state.history.length - 1] = next; save(); render();
}
async function askCouncil(who) {
  const q = prompt("What do you want to ask?", "What should we do next?");
  if (q === null) return;
  const text = buildAsk_(game(), who, q);
  if (!text) return toast("Nobody to ask.");
  pending = { kind: "ask", prompt: text, tries: 0 };
  if (route.route === "paste") { tab = "council"; render(); return; }
  await viaAddress();
}

function ledger(body) {
  const g = game(), w = world(), box = el("div", undefined, "panel"), table = el("table", undefined, "grid");
  table.append(el("tr")); table.rows[0].append(...["Country", "Leader", "Strength", "Coin", "Unrest", "Holds"].map((h) => el("th", h)));
  for (const [c, v] of Object.entries(g.countries)) { const tr = el("tr"); tr.append(...[v.name, v.leader, v.strength, v.coin, v.unrest, Object.keys(g.places).filter((k) => g.places[k].holder === c).map(placeName).join(", ") || "none listed"].map((x) => el("td", String(x)))); table.append(tr); }
  box.append(el("h2", "The ledger: what is true"), el("p", "The AI may write anything, but only what the rules accept lands here. The places are the border lands the story knows; a map comes later.", "note"), table);
  const facts = factLines_(g).filter((f) => /^(Wars|Treaties|Open offers|Relations)/.test(f));
  box.append(el("h2", "Wars, treaties, relations"), ...facts.map((f) => el("p", f, "note")));
  if (g.facts.length) { box.append(el("h2", "What the rules have recorded")); const ul = el("ul", undefined, "receipt"); ul.append(...g.facts.slice(-15).reverse().map((f) => el("li", f))); box.append(ul); }
  const h = habits_(g); if (h.length) box.append(el("h2", "The AI's habits, corrected for"), ...h.map((x) => el("p", x, "note")));
  box.append(el("p", `Leaders as of ${w.asOf}, from a public list. One-line countries: ${Object.values(w.others).join(", ")}.`, "note"));
  body.append(box);
}

function aiTab(body) {
  const box = el("div", undefined, "panel"), pick = el("select"), base = el("input"), model = el("input"), key = el("input"), keep = el("input");
  pick.append(new Option("Paste by hand into any AI", "paste"), new Option("An address I give (chat-completions form)", "address"));
  pick.value = route.route;
  Object.assign(base, { type: "text", value: route.base, placeholder: "The service's address, ending in /v1" });
  Object.assign(model, { type: "text", value: route.model, placeholder: "Model name, as the service writes it" });
  Object.assign(key, { type: "password", value: route.key, placeholder: "Key, if the service needs one", autocomplete: "off" });
  Object.assign(keep, { type: "checkbox", checked: !!route.remember });
  const line = (label, input) => { const l = el("label", undefined, "field-line"); l.append(label, input); return l; }, keepLine = el("label", undefined, "field-line");
  keepLine.style.flexDirection = "row"; keepLine.append(keep, "Remember the key on this device (otherwise it is forgotten when you close the page)");
  const store = () => { route = { ...route, route: pick.value, base: base.value.trim(), model: model.value.trim(), key: key.value, remember: keep.checked }; saveRoute(route); };
  const go = el("div", undefined, "go");
  go.append(button("Save", () => { store(); toast("Saved."); render(); }, "main"), button("Test", async () => { store(); try { const t = await ask(route, "Reply with the single word READY."); toast(`It answered: ${t.slice(0, 40)}`); } catch (e) { toast(e.message); } }), button("Forget the key", () => { route = forgetKey(route); toast("Key forgotten."); render(); }));
  box.append(el("h2", "How Capo reaches an AI"), line("Route", pick), line("Address", base), line("Model", model), line("Key", key), keepLine, go,
    el("p", `Today: ${route.calls || 0} calls, about ${route.sent || 0} tokens sent and ${route.got || 0} received. Each turn is one call; asking the council is one more.`, "note"),
    el("p", "Your key goes only to the address you give, straight from this page. Capo has no server and never sees it. Check your service's own terms for this kind of use.", "note"));
  if (pending) box.append(el("h2", "The last prompt"), Object.assign(el("textarea", undefined, "paste"), { value: pending.prompt, readOnly: true }));
  body.append(box);
}

function saves(body) {
  const box = el("div", undefined, "panel"), go = el("div", undefined, "go"), file = el("input");
  file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const s = JSON.parse(await f.text()); if (!Array.isArray(s.history) || !s.history.length || !WORLDS[s.history[0].world]) throw new Error(); state = s; save(); toast("Opened."); render(); } catch { toast("That file is not a Capo story."); } };
  go.append(button("Take back the last turn", () => { if (state.history.length < 2) return toast("Nothing to take back."); state.history.pop(); state.log.pop(); save(); render(); }),
    button("Save to a file", () => { const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: "application/json" })); a.download = `capo-turn-${game().turn}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }),
    button("Open a file", () => file.click()),
    button("Start again", () => { if (confirm("Leave this story? It stays saved until you begin another.")) { state = null; render(); } }));
  box.append(el("h2", "Your story"), el("p", `Kept in this browser. Turn ${game().turn}, ${state.history.length - 1} turns can be taken back. Every reply is kept, so the story replays exactly.`, "note"), go, file);
  body.append(box);
}

footer();
state = null;
render();
void ADVICE; void seated_; void addMonths;
