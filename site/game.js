// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's game screen: the world map full-screen, a top bar, the dock and the province card, as in the original
// Ancient Kingdom: choose any country and a mode, write actions, jump time, read what happened. The AI proposes
// moves; the rules in src/story/worldrules.js decide which stand, and the map follows.
import { JUMPS, MODES, UNITS, closeTurn, jumpFrom, monthsBetween, newWorldGame, readWorldReply, turnCode, worldPrompt } from "../src/story/turn.js";
import { APPROACHES, attackPlan, commanders, mightOf, placesFor, treatiesOf, warsOf } from "../src/story/worldrules.js";
import { NEED, relOf, relWord, treatyAnswer, treatyName } from "../src/story/relations.js";
import { factWords, factsOf } from "../src/story/chronicle.js";
import { oddsLine, partsLine } from "../src/story/check.js";
import { crossesLine } from "../src/story/line.js";
import { checkSave as checkSaveOf, convertNote, keptRecords, mendGame, snapGame, takeBack } from "../src/story/saves.js";
import { CHARACTER, SCENARIOS, SOON, characterPrompt, checkScenario, readCharacter, scenarioFrom, scenarioText } from "../src/story/scenarios.js";
import { askPrompt, chatPrompt, councilPrompt, readAsk, readChat, readCouncil, seatsFor, talkLines } from "../src/story/talk.js";
import { loadWorld, ownerColour, worldMap } from "./worldmap.js";
import { ask, forgetKey, loadRoute, saveRoute } from "./ai.js";
import { BUILD, SOURCE_URL, VERSION } from "./config.js";
import { guard } from "./guard.js";

const KEEP = "capo-game-1";
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "plain") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };
const ICONS = {
  actions: "M4 20l4.5-1L19 8.5 15.5 5 5 15.5z M13.5 7l3.5 3.5",
  chats: "M4 5h11v8H9l-4 3v-3H4z M18 9h2v8h-1.5v3l-3-3H11v-2",
  ledger: "M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z M6 18a2 2 0 0 1 2-2h10 M10 8h5 M10 11h5",
  advisors: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3.5 20a5.5 5.5 0 0 1 11 0 M16 5.5a3 3 0 0 1 0 5.5 M17.5 14.5a5 5 0 0 1 3 5.5",
  master: "M4 4h16v16H4z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01",
  game: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 3v2.5 M12 18.5V21 M3 12h2.5 M18.5 12H21 M5.6 5.6l1.8 1.8 M16.6 16.6l1.8 1.8 M5.6 18.4l1.8-1.8 M16.6 7.4l1.8-1.8",
  go: "M5 12h13 M13 6l6 6-6 6",
  close: "M6 6l12 12 M18 6L6 18",
};
function icon(key) {
  const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "i"); s.setAttribute("aria-hidden", "true");
  path.setAttribute("d", ICONS[key]); s.append(path);
  return s;
}
let world, map, state = null, past = [], route = loadRoute(), sheet = null, pending = null, jump = { key: "1m", n: 2, unit: "weeks" }, hush = 0, ledgerTab = "events", view = "countries";

// games saved before wars and treaties existed get empty lists
const mend = mendGame;
// A take-back record is the game without its log (the log only grows; the record keeps its length), so twenty
// of them cost about what one full copy used to. Each says what it takes back.
const snap = (why) => snapGame(state, why);
const restore = (rec) => takeBack(state, rec);
const remember = (why) => { past.push(snap(why)); past = past.slice(-20); };
let saveFailed = false;
const save = () => {
  try { localStorage.setItem(KEEP, JSON.stringify({ state, past })); saveFailed = false; }
  catch { if (!saveFailed) toast("This browser would not keep the game; it may be full. Use Game, then Save to a file."); saveFailed = true; }
};
const load = () => { try { return JSON.parse(localStorage.getItem(KEEP) || "null"); } catch { return null; } };
const checkSave = (s) => checkSaveOf(s, (id) => world.provinces.has(id), (c) => homes.has(c));
const keptPast = keptRecords;
function toast(t) { const b = $("toast"); b.textContent = t; b.classList.add("on"); clearTimeout(hush); hush = setTimeout(() => b.classList.remove("on"), 3400); }
// a country still being made goes by YOU (no country on the map uses it) until it has a code of its own
const ownCode = () => (/^[A-Z]{3}$/.test(draft?.own.code || "") ? draft.own.code : "YOU");
// scenarios opened from files are kept in this browser beside the built-in ones
const SHELF = "capo-scenarios-1";
const shelf = () => { try { return JSON.parse(localStorage.getItem(SHELF) || "[]"); } catch { return []; } };
const shelve = (list) => { try { localStorage.setItem(SHELF, JSON.stringify(list.slice(-12))); } catch { toast("This browser would not keep the scenario; it works for this visit."); } };
const allScenarios = () => [...SCENARIOS, ...shelf()];
const scen = () => (draft ? allScenarios().find((x) => x.id === draft.scenario) || SCENARIOS[0] : null);
const custom = () => state?.custom || (draft?.kind === "own" ? { code: ownCode(), name: draft.own.name.trim() || "Your new country", colour: draft.own.colour } : scen()?.custom || null);
const name = (code) => (custom()?.code === code ? custom().name : world.countries[code] || code);
const colourOf = (code) => (custom()?.code === code ? custom().colour : undefined);
const ownerOf = (id) => (state ? state.owners[id] || world.provinces.get(id).country : draft?.kind === "own" && draft.own.provinces.has(id) ? ownCode() : scen()?.owners?.[id] || world.provinces.get(id).country);
const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// the largest province of each country, where the camera goes to show it
let homes = new Map();
// A country's home is its largest province on its main landmass (the group of its provinces joined by land that has
// the most of them), so France is centred on France and not on an overseas region that happens to be wide.
function index() {
  homes = new Map();
  const byCountry = new Map();
  for (const p of world.provinces.values()) { if (!byCountry.has(p.country)) byCountry.set(p.country, []); byCountry.get(p.country).push(p); }
  const area = (p) => (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]);
  for (const [c, list] of byCountry) {
    const seen = new Set();
    let best = null;
    for (const start of list) {
      if (seen.has(start.id)) continue;
      const group = [start]; seen.add(start.id);
      for (let i = 0; i < group.length; i++) for (const n of world.neighbours.get(group[i].id)) { const q = world.provinces.get(n); if (q.country === c && !seen.has(n)) { seen.add(n); group.push(q); } }
      if (!best || group.length > best.length) best = group;
    }
    const top = best.reduce((m, p) => (area(p) > area(m) ? p : m));
    homes.set(c, { a: area(top), id: top.id });
  }
}
/** A country's code from its code or its name, as an AI may write either; "" when it is neither. */
function codeOf(s) {
  const k = String(s || "").trim().toLowerCase().replace(/^the\s+/, "");
  if (!k) return "";
  if (custom()?.name?.toLowerCase() === k) return custom().code;
  for (const [c, n] of Object.entries(world.countries)) if (n.toLowerCase().replace(/^the\s+/, "") === k && homes.has(c)) return c;
  return "";
}
const showCountry = (code) => { const h = homes.get(code), first = h ? h.id : held(code)[0]; if (first) map.show(first); };
const held = (code) => [...world.provinces.keys()].filter((id) => ownerOf(id) === code);
function landNeighbours(code) {
  const out = new Set();
  for (const id of held(code)) for (const n of world.neighbours.get(id)) { const o = ownerOf(n); if (o !== code) out.add(o); }
  return [...out];
}
/** Countries across a narrow sea from this one, that it does not also border by land. */
function seaNeighbours(code) {
  const out = new Set(), land = new Set(landNeighbours(code));
  for (const id of held(code)) for (const n of world.across.get(id)) { const o = ownerOf(n); if (o !== code && !land.has(o)) out.add(o); }
  return [...out];
}

// disputed areas: the provinces each touches, and the countries that claim it, read from the source's note
const claimsOf = new Map();
function claims() {
  const byName = new Map(Object.entries(world.countries).map(([c, n]) => [n.toLowerCase(), c]));
  const code = (s) => byName.get(s.trim().replace(/^the\s+/i, "").toLowerCase()) || [...byName].find(([n]) => n.startsWith(s.trim().toLowerCase()))?.[1];
  const probe = document.createElement("canvas").getContext("2d");
  for (const d of world.disputes || []) {
    const m = d.note.match(/Claimed by ([^.]+)/), claimants = m ? m[1].split(/\s+and\s+|,\s*/).map(code).filter(Boolean) : [];
    if (!claimants.length) continue;
    const [x0, y0, x1, y1] = d.box, mid = [(x0 + x1) / 2, (y0 + y1) / 2];
    for (const p of world.provinces.values()) {
      const b = p.box;
      if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
      if (probe.isPointInPath(d.path, p.label[0], p.label[1], "evenodd") || probe.isPointInPath(p.path, mid[0], mid[1], "evenodd")) {
        claimsOf.set(p.id, [...(claimsOf.get(p.id) || []), { name: d.name, note: d.note, claimants }]);
      }
    }
  }
}
/** Disputed land in or next to the player's provinces, for the prompt. */
function disputeLines() {
  const near = new Set();
  for (const id of held(state.player)) { near.add(id); for (const n of [...world.neighbours.get(id), ...world.across.get(id)]) near.add(n); }
  const found = new Map();
  for (const id of near) for (const d of claimsOf.get(id) || []) {
    if (!found.has(d.name)) found.set(d.name, { note: d.note, ids: [] });
    found.get(d.name).ids.push(id);
  }
  return [...found].slice(0, 12).map(([n, d]) => `- ${n}: ${d.note} Provinces: ${d.ids.join(", ")}`);
}

/** What the rules may ask of the map. */
function geo() {
  return {
    name, place: (id) => world.provinces.get(id), owner: ownerOf, neighbours: (id) => world.neighbours.get(id), across: (id) => world.across.get(id), coastal: (id) => world.coast.has(id),
    home: (c) => homes.get(c)?.id, holds: (c) => held(c).length, known: (c) => homes.has(c) || custom()?.code === c, hasCoast: (c) => held(c).some((id) => world.coast.has(id)), might: (c) => state?.might?.[c],
    claims: (id, c) => (claimsOf.get(id) || []).some((d) => d.claimants.includes(c) && ownerOf(id) !== c),
    find: (s) => { const k = String(s || "").trim(); if (world.provinces.has(k)) return k; const low = k.toLowerCase(), hits = [...world.provinces.values()].filter((p) => p.name.toLowerCase() === low); return hits.length === 1 ? hits[0].id : null; },
  };
}

/** The way back to every game, when this page has one (the double-click copy does not). */
function home() {
  const a = $("homelink").querySelector("a"), p = el("p", undefined, "note");
  if (a) { const b = a.cloneNode(true); b.textContent = "Back to all games"; p.append(b); }
  return p;
}

// ---- map views: countries in their own colours, friends and foes of the player, or might ----
const RELATION = { you: "#d3dbe4", alliance: "#4f9a6b", defence: "#5fa08a", trade: "#4a7fa8", war: "#c9553f", none: "#4b5354" };
function viewColour(code) {
  if (!state || view === "countries") return colourOf(code);
  if (view === "might") { const m = mightOf(geo(), code); return `hsl(${40 - m * 4} ${30 + m * 5}% ${20 + m * 5}%)`; }
  if (code === state.player) return RELATION.you;
  if (warsOf(state, state.player).includes(code)) return RELATION.war;
  const t = treatiesOf(state, state.player).find((x) => x.with === code);
  return RELATION[t?.kind || "none"];
}

// ---- the first screen: a wizard, as in the original: scenario, country, you, begin ----
const PALETTE = ["#c9553f", "#d9a43a", "#4f9a6b", "#3f7fb5", "#8a5fb5", "#c46a9a", "#5fb3b0", "#b07a43", "#6f8f3a", "#a33f5f", "#4a5fa8", "#d07f50"];
const blankCharacter = () => Object.fromEntries(CHARACTER.map(([k]) => [k, ""]));
let draft = null;
const STEPS = [["scenario", "Scenario"], ["country", "Country"], ["you", "You"], ["begin", "Begin"]];

function startScreen() {
  draft = draft || { step: "scenario", scenario: SCENARIOS[0].id, kind: "map", country: null, own: { name: "", code: "", colour: PALETTE[0], history: "", provinces: new Set() }, mode: "nation", character: blankCharacter(), fill: null };
  const box = $("start-box"), pills = el("div", undefined, "row"), at = STEPS.findIndex(([k]) => k === draft.step);
  // while picking on the map, the wizard shrinks to a bar so the map can be tapped, even on a phone
  $("start").classList.toggle("min", !!draft.picking);
  if (draft.picking) {
    const what = draft.kind === "own" ? `${draft.own.provinces.size} of up to 12 provinces chosen. Tap provinces to add or remove them.` : draft.country ? `${name(draft.country)} chosen. Tap another to change.` : "Tap a country to choose it.";
    const r = el("div", undefined, "row");
    r.append(button("Done", () => { draft.picking = false; startScreen(); }, "go"));
    box.replaceChildren(el("p", what, "note"), r);
    $("start").classList.add("open");
    return;
  }
  STEPS.forEach(([k, t], i) => { const b = button(`${i + 1}. ${t}`, () => { if (i <= at || ready(i)) { draft.step = k; startScreen(); } }); b.setAttribute("aria-pressed", String(k === draft.step)); pills.append(b); });
  box.replaceChildren(el("p", "Overture of Empires", "eyebrow"), el("h1", "Capo"), pills);
  ({ scenario: stepScenario, country: stepCountry, you: stepYou, begin: stepBegin })[draft.step](box);
  box.append(home(), el("p", "Fiction for adults. Not news and not a forecast. Real public figures may appear. Needs an AI: paste each turn into any AI you use, or give an address.", "note"));
  $("start").classList.add("open");
}
const nextRow = (label, ok, to) => { const r = el("div", undefined, "row"); r.append(button(label, () => { const why = ok(); if (why) return toast(why); draft.step = to; startScreen(); }, "go")); return r; };
// can the wizard jump ahead to step i? only when every step before it is done
function ready(i) { return (i <= 1 || !countryProblem()) && (i <= 2 || !youProblem()); }

function stepScenario(box) {
  const kept = load(), list = el("div", undefined, "modes"), mine = shelf();
  for (const s of allScenarios()) {
    const l = el("label"), r = el("input"), t = el("span"), opened = mine.some((x) => x.id === s.id);
    Object.assign(r, { type: "radio", name: "scenario", value: s.id, checked: s.id === draft.scenario });
    r.onchange = () => { draft.scenario = s.id; if (s.custom && draft.kind === "own") draft.kind = "map"; map.refresh(); };
    t.append(el("b", s.title), el("small", `${s.blurb || ""}${opened ? ` From a file; starts ${fmtDate(s.start)}.` : ""}`));
    l.append(r, t);
    if (opened) l.append(button("Remove", () => { shelve(shelf().filter((x) => x.id !== s.id)); if (draft.scenario === s.id) draft.scenario = SCENARIOS[0].id; map.refresh(); startScreen(); }));
    list.append(l);
  }
  const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    if (f.size > 400000) return toast("That file is too big to be a scenario.");
    let raw; try { raw = JSON.parse(await f.text()); } catch { return toast("That file is not a Capo scenario."); }
    const r = checkScenario(raw, (c) => homes.has(c), (id) => world.provinces.has(id));
    if (!r.ok) return toast(r.why);
    if (crossesLine(scenarioText(r.scenario)).length) return toast("That scenario is refused: nothing sexual involving minors.");
    shelve([...shelf().filter((x) => x.id !== r.scenario.id), r.scenario]); draft.scenario = r.scenario.id; map.refresh(); startScreen(); toast(`Opened: ${r.scenario.title}.`);
  };
  const openRow = el("div", undefined, "row"); openRow.append(button("Open a scenario file", () => file.click()), file);
  for (const [title, what] of SOON) { const l = el("label"), t = el("span"); l.style.opacity = ".55"; t.append(el("b", `${title}: coming soon`), el("small", what)); l.append(t); list.append(l); }
  box.append(el("p", "Lead a country, a leader's life or an ordinary one. You decide what to do; an AI tells what happens; the rules decide wars, borders and treaties.", "note"), el("h3", "Choose where the story starts"), list, openRow, nextRow("Next: your country", () => "", "country"));
  const good = kept?.state ? checkSave(kept.state) : null;
  if (good) { const r = el("div", undefined, "row"); r.append(button(`Continue as ${good.custom?.name || name(good.player)}, ${fmtDate(good.date)}`, () => { state = good; past = keptPast(kept); draft = null; $("start").classList.remove("open"); play(); })); box.append(el("h3", "Or carry on"), r); }
}

function countryProblem() {
  if (draft.kind === "map") return draft.country ? "" : "Choose a country first: type it, or tap it on the map.";
  const o = draft.own;
  if (!o.name.trim()) return "Give your country a name.";
  if (!/^[A-Z]{3}$/.test(o.code)) return "Its code must be three capital letters.";
  if (world.countries[o.code]) return `${o.code} is already ${world.countries[o.code]}; choose another code.`;
  if (!o.provinces.size) return "Tap at least one province on the map to start your country.";
  if (crossesLine([o.name, o.history]).length) return "That history is refused: nothing sexual involving minors.";
  return "";
}

function stepCountry(box) {
  const tabs = el("div", undefined, "row");
  for (const [k, t] of [["map", "A country on the map"], ["own", "One of your own"]]) {
    if (k === "own" && scen()?.custom) continue;
    const b = button(t, () => { draft.kind = k; map.refresh(); startScreen(); }); b.setAttribute("aria-pressed", String(draft.kind === k)); tabs.append(b);
  }
  if (scen()?.custom) box.append(el("p", `This scenario has a country of its own, ${scen().custom.name}; you can play it, or any country on the map.`, "note"));
  box.append(el("h3", "Your country"), tabs);
  if (draft.kind === "map") {
    const pick = el("input", undefined, "plain"), list = el("datalist");
    list.id = "countries";
    const byName = new Map(Object.entries(world.countries).filter(([c]) => homes.has(c)).map(([c, n]) => [n, c]));
    if (scen()?.custom) byName.set(scen().custom.name, scen().custom.code);
    list.append(...[...byName.keys()].sort().map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
    Object.assign(pick, { type: "search", placeholder: "Type a country, or tap one on the map", value: draft.country ? name(draft.country) : "" });
    pick.setAttribute("list", "countries"); pick.setAttribute("aria-label", "Your country");
    pick.onchange = () => { const c = byName.get(pick.value); if (c) { draft.country = c; showCountry(c); startScreen(); } };
    const r = el("div", undefined, "row");
    r.append(button("Choose on the map", () => { draft.picking = true; startScreen(); }));
    box.append(pick, list, r, el("p", draft.country ? `${name(draft.country)}: ${held(draft.country).length} provinces, might ${mightOf(geo(), draft.country)} of 10.` : "Every country on the map can be played.", "note"));
  } else {
    const o = draft.own, field = (label, input) => { const l = el("label"); l.append(label, input); return l; };
    const nm = Object.assign(el("input", undefined, "plain"), { type: "text", value: o.name, maxLength: 40, placeholder: "For example: The Free Highlands" });
    const code = Object.assign(el("input", undefined, "plain"), { type: "text", value: o.code, maxLength: 3, placeholder: "Three letters, for example FHL" });
    const story = Object.assign(el("textarea", undefined, "plain"), { value: o.history, maxLength: 500, rows: 3, placeholder: "A few lines of history: how it came to be, who leads it, what it wants." });
    nm.oninput = () => { o.name = nm.value; if (!code.dataset.typed) { o.code = (nm.value.replace(/^the\s+/i, "").replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase(); code.value = o.code; } };
    code.oninput = () => { code.dataset.typed = "1"; o.code = code.value.toUpperCase().replace(/[^A-Z]/g, ""); code.value = o.code; };
    story.oninput = () => { o.history = story.value; };
    const swatches = el("div", undefined, "row");
    for (const c of PALETTE) { const b = button("", () => { o.colour = c; map.refresh(); startScreen(); }); b.style.background = c; b.style.minWidth = "34px"; b.setAttribute("aria-label", `Colour ${c}`); b.setAttribute("aria-pressed", String(o.colour === c)); swatches.append(b); }
    const picked = el("ul", undefined, "list");
    picked.append(...[...o.provinces].map((id) => { const p = world.provinces.get(id), li = el("li"); li.append(el("span", `${p.name}, from ${name(p.country)}`), button("Remove", () => { o.provinces.delete(id); map.refresh(); startScreen(); })); return li; }));
    box.append(field("Name", nm), field("Code", code), el("div", "Colour", "note"), swatches, field("History", story),
      el("h3", `Starting land: ${o.provinces.size} of up to 12 provinces`), el("p", "Tap provinces on the map to add or remove them. They are taken from the countries that hold them now; no country may lose its last province.", "note"), picked);
    const r = el("div", undefined, "row");
    r.append(button("Pick provinces on the map", () => { draft.picking = true; startScreen(); }));
    box.append(r);
  }
  box.append(nextRow("Next: you", countryProblem, "you"));
}

/** Add or remove a province from the country being made. */
function toggleOwn(p) {
  const o = draft.own;
  if (o.provinces.has(p.id)) o.provinces.delete(p.id);
  else if (o.provinces.size >= 12) return toast("Twelve provinces at most to start.");
  else if (held(p.country).length <= 1) return toast(`${p.name} is the last province ${name(p.country)} holds.`);
  else o.provinces.add(p.id);
  map.refresh(); startScreen();
}

function youProblem() {
  if (draft.mode === "nation") return "";
  return crossesLine(Object.values(draft.character)).length ? "That character is refused: nothing sexual involving minors." : "";
}

function stepYou(box) {
  const modes = el("div", undefined, "modes");
  for (const [k, [label, what]] of Object.entries(MODES)) {
    const l = el("label"), r = el("input"), t = el("span");
    Object.assign(r, { type: "radio", name: "mode", value: k, checked: k === draft.mode });
    r.onchange = () => { draft.mode = k; startScreen(); };
    t.append(el("b", label), el("small", `You play as ${what}.${k === "citizen" ? " You cannot command the country; its government acts on its own." : ""}`)); l.append(r, t); modes.append(l);
  }
  box.append(el("h3", "How you play"), modes);
  if (draft.mode !== "nation") {
    const c = draft.character;
    box.append(el("h3", draft.mode === "leader" ? "You, the leader" : "You, a citizen"), el("p", "Invented, not a real person. Leave any field empty and the AI can fill it in.", "note"));
    for (const [k, label] of CHARACTER) {
      const input = Object.assign(el("input", undefined, "plain"), { type: "text", value: c[k], maxLength: 200 }), l = el("label");
      input.oninput = () => { c[k] = input.value; };
      l.append(label, input); box.append(l);
    }
    const r = el("div", undefined, "row");
    r.append(button("Fill the empty fields with AI", fillCharacter));
    box.append(r);
    if (draft.fill) {
      const out = Object.assign(el("textarea", undefined, "plain paste"), { value: draft.fill.prompt, readOnly: true }), back = Object.assign(el("textarea", undefined, "plain paste"), { placeholder: "Paste the AI's whole reply here." });
      const go = el("div", undefined, "row");
      go.append(button("Copy the prompt", async () => { try { await navigator.clipboard.writeText(draft.fill.prompt); toast("Copied. Paste it into a new chat."); } catch { out.select(); } }), button("Read the reply", () => takeCharacter(back.value), "go"), button("Cancel", () => { draft.fill = null; startScreen(); }));
      box.append(...(draft.fill.error ? [el("p", draft.fill.error, "warn")] : []), out, back, go);
    }
  }
  box.append(nextRow("Next: begin", youProblem, "begin"));
}

function ownName() { return draft.kind === "own" ? draft.own.name.trim() : name(draft.country); }
async function fillCharacter() {
  const why = youProblem(); if (why) return toast(why);
  draft.fill = { prompt: characterPrompt(ownName() || "their country", draft.mode, draft.character) };
  if (route.route !== "address") { startScreen(); return; }
  toast("Asking the AI...");
  try { takeCharacter(await call(draft.fill.prompt)); } catch (e) { draft.fill.error = e.message; startScreen(); }
}
function takeCharacter(text) {
  const next = readCharacter(text, draft.character);
  if (CHARACTER.every(([k]) => next[k] === draft.character[k])) { draft.fill.error = "Nothing could be read from that reply."; startScreen(); return; }
  if (crossesLine(Object.values(next)).length) { draft.fill.error = "That reply is refused: nothing sexual involving minors."; startScreen(); return; }
  draft.character = next; draft.fill = null; startScreen(); toast("Filled in.");
}

function stepBegin(box) {
  const s = scen(), c = draft.character, who = draft.mode === "nation" ? "the nation" : `${c.name || "a person the AI will name"}, ${MODES[draft.mode][0].toLowerCase()}`;
  const list = el("ul", undefined, "list");
  for (const t of [`Scenario: ${s.title}, from ${fmtDate(s.start)}.`, `Country: ${ownName()}${draft.kind === "own" ? ` (${draft.own.code}), your own, with ${draft.own.provinces.size} province${draft.own.provinces.size > 1 ? "s" : ""}` : ""}.`, `You play as ${who}.`]) { const li = el("li"); li.append(el("span", t)); list.append(li); }
  const r = el("div", undefined, "row");
  r.append(button("Begin", begin, "go"));
  box.append(el("h3", "Ready"), list, el("p", s.opening, "note"), r);
}

function begin() {
  const why = countryProblem() || youProblem(); if (why) return toast(why);
  const s = scen(), own = draft.kind === "own", seed = [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join("");
  const o = draft.own, code = own ? o.code : draft.country;
  const character = draft.mode === "nation" ? null : Object.fromEntries(Object.entries(draft.character).map(([k, v]) => [k, v.trim()]));
  state = newWorldGame(code, draft.mode, seed, {
    scenario: s,
    owners: own ? Object.fromEntries([...o.provinces].map((id) => [id, code])) : {},
    custom: own ? { code, name: o.name.trim(), colour: o.colour, history: o.history.trim() } : null,
    character,
  });
  past = []; draft = null; save();
  $("start").classList.remove("open"); map.refresh(); play(); guideOnce();
}

// ---- the game ----
function play() {
  $("top").hidden = false; $("dock").hidden = false;
  map.redraw(); showCountry(state.player);
  topBar(); dock();
}

function topBar() {
  const top = $("top"), who = el("button", undefined, "who"), chip = el("span", undefined, "chip");
  chip.style.background = colourOf(state.player) || ownerColour(state.player);
  who.append(chip, state.character?.name && state.mode !== "nation" ? `${state.character.name}, ${name(state.player)}` : name(state.player)); who.onclick = () => showCountry(state.player);
  const jumpPick = el("select", undefined, "plain");
  jumpPick.append(...JUMPS.map(([k, t]) => new Option(t, k))); jumpPick.value = jump.key; jumpPick.onchange = () => { jump = { ...jump, key: jumpPick.value }; topBar(); };
  jumpPick.setAttribute("aria-label", "How far to jump");
  const length = [];
  if (jump.key === "custom") {
    const n = Object.assign(el("input", undefined, "plain"), { type: "number", min: 1, max: 3650, value: jump.n, style: "width:72px" }), unit = el("select", undefined, "plain");
    unit.append(...UNITS.map(([k, t]) => new Option(t, k))); unit.value = jump.unit;
    n.setAttribute("aria-label", "How many"); unit.setAttribute("aria-label", "Of what");
    n.onchange = () => { jump = { ...jump, n: Number(n.value) || 1 }; }; unit.onchange = () => { jump = { ...jump, unit: unit.value }; };
    length.push(n, unit);
  }
  const date = el("span", undefined, "date"); date.append(el("b", fmtDate(state.date)), el("small", `Turn ${state.turn}`));
  const go = button(calling ? "Waiting..." : "Advance", advance, "go"); go.append(icon("go")); go.disabled = !!calling;
  const menu = button("", () => open(sheet === "game" ? null : "game"), "ic"); menu.append(icon("game")); menu.setAttribute("aria-label", "Game: saves, scenarios and the AI"); menu.title = "Game";
  top.replaceChildren(who, el("span", MODES[state.mode][0], "mode"), ...(state.sandbox ? [el("span", "Sandbox", "mode sandbox")] : []), date, jumpPick, ...length, go, menu);
}

const DOCK = [["actions", "Actions"], ["chats", "Chats"], ["ledger", "Ledger"], ["advisors", "Advisors"], ["master", "Game Master"]];
function dock() {
  const unread = state && state.log.length && state.turn > (state.seen || 0);
  $("dock").replaceChildren(...DOCK.map(([k, t]) => {
    const label = k === "chats" && state?.mode === "citizen" ? "Contacts" : k === "advisors" && state?.mode === "citizen" ? "Circle" : t;
    const b = button("", () => open(sheet === k ? null : k), ""); b.append(icon(k), el("span", label)); b.setAttribute("aria-pressed", String(sheet === k));
    if (k === "ledger" && unread) { b.append(el("span", undefined, "dot")); b.setAttribute("aria-label", "Ledger, new"); }
    return b;
  }));
}

function open(which) {
  sheet = which;
  const box = $("sheet");
  dock();
  if (!which) { box.classList.remove("open"); return; }
  if (which === "ledger" && state.seen !== state.turn) { state.seen = state.turn; save(); dock(); }
  box.replaceChildren();
  ({ actions, chats, ledger, advisors, master, game: gameSheet }[which])(box);
  const head = el("div", undefined, "head"), title = box.querySelector("h2"), shut = button("", () => open(null), "ic");
  shut.append(icon("close")); shut.setAttribute("aria-label", "Close");
  head.append(title || el("h2", ""), shut); box.prepend(head);
  box.classList.add("open");
}

function actions(box) {
  const input = el("textarea", undefined, "plain"), list = el("ul", undefined, "list");
  input.rows = 3; input.maxLength = 600; input.placeholder = "What do you do? For example: Offer our neighbours a trade pact, and quietly move troops to the border.";
  input.setAttribute("aria-label", "A new action");
  const add = () => { const t = input.value.trim(); if (!t) return; state.actions = [...(state.actions || []), t]; save(); open("actions"); };
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } };
  list.append(...(state.actions || []).map((a, i) => {
    const li = el("li"), o = (state.orders || []).find((x) => x.text === a), plan = o?.verb === "ATTACK" && attackPlan(state, geo(), state.player, o.target, o, turnAttacks());
    const ans = o?.verb === "TREATY" && !state.offers.some((x) => x.from === o.target && x.kind === o.detail) && answer(o.target, o.detail);
    li.append(el("span", plan?.ok ? `${a} Odds: ${oddsLine(plan.chance)}.` : ans ? `${a} ${name(o.target)} would ${ans.ok ? "agree" : "refuse"} (${ans.why}).` : a), button("Remove", () => { state.actions.splice(i, 1); state.orders = (state.orders || []).filter((x) => x.text !== a); save(); open("actions"); }));
    return li;
  }));
  const near = landNeighbours(state.player).slice(0, 3), ideas = el("div", undefined, "row");
  for (const t of ["Strengthen the army.", "Spend on schools and hospitals.", ...near.map((c) => `Seek closer ties with ${name(c)}.`)]) ideas.append(button(t, () => { state.actions = [...(state.actions || []), t]; save(); open("actions"); }));
  const go = el("div", undefined, "row");
  go.append(button("Add", add), button(jump.key === "custom" ? `Advance ${jump.n} ${jump.unit}` : `Advance: ${JUMPS.find((j) => j[0] === jump.key)[1].toLowerCase()}`, advance, "go"));
  // offers as cards: one tap accepts, and the rules carry it out whether or not the AI writes it down
  const offers = el("ul", undefined, "list");
  offers.append(...state.offers.map((o) => {
    const li = el("li"), peace = o.kind === "peace", what = peace ? "peace" : treatyName(o.kind), verb = peace ? "PEACE" : "TREATY";
    const taken = (state.orders || []).some((x) => x.verb === verb && x.target === o.from);
    li.append(el("span", `${name(o.from)} offers ${what} (${fmtDate(o.date)}).`), ...(taken ? [el("b", "Accepted")] : [button("Accept", () => order({ text: `Accept ${name(o.from)}'s offer of ${what}.`, verb, target: o.from, detail: peace ? "" : o.kind }))]),
      button("Decline", () => { state.offers = state.offers.filter((x) => x !== o); const old = (state.orders || []).find((x) => x.verb === verb && x.target === o.from); state.orders = (state.orders || []).filter((x) => x !== old); state.actions = (state.actions || []).filter((x) => x !== old?.text); save(); open("actions"); }));
    return li;
  }));
  box.append(el("h2", "Actions"), ...(state.offers.length ? [el("h3", "Offers to you"), offers] : []), el("p", "Write what you do, in your own words, as many as you like. The AI reads them all and proposes moves; the rules decide what stands: wars, peace, treaties, attacks and handovers.", "note"), list, input, go, el("h3", "Ideas"), ideas);
  if (pending) box.append(pasteBox());
}

/** How the paste route goes, in three steps. */
function steps() {
  const ol = el("ol", undefined, "steps");
  for (const s of route.route === "paste" ? ["Copy the prompt.", "Paste it into a new chat with any AI you use.", "Paste the whole reply back here, and read it."] : ["The AI at your address did not answer.", "Ask again, or copy the prompt into any AI chat.", "Paste the reply back here."]) ol.append(el("li", s));
  return ol;
}

function waiting() {
  const w = el("div", undefined, "row"); w.append(el("span", "Waiting for the AI (up to two minutes)...", "note"), button("Stop", stopCall));
  return w;
}

function pasteBox() {
  if (calling) return waiting();
  const wrap = el("div"), out = el("textarea", undefined, "plain paste"), back = el("textarea", undefined, "plain paste");
  out.value = pending.prompt; out.readOnly = true; out.setAttribute("aria-label", "The prompt");
  back.placeholder = "Paste the AI's whole reply here."; back.setAttribute("aria-label", "The AI's reply");
  const go = el("div", undefined, "row");
  go.append(button("Copy the prompt", async () => { try { await navigator.clipboard.writeText(pending.prompt); toast("Copied. Paste it into a new chat."); } catch { out.select(); } }), button("Read the reply", () => finish(back.value), "go"), button("Cancel", () => { pending = null; open("actions"); }));
  if (route.route === "address") go.prepend(button("Ask again", () => viaAddress()));
  wrap.append(el("h3", route.route === "paste" ? "Paste this into a new chat" : "The AI did not answer"), ...(pending.error ? [el("p", pending.error, "warn")] : []), steps(), out, back, go);
  return wrap;
}

function advance() {
  if (calling) return toast("Capo is already waiting for the AI.");
  const acts = state.actions || [], bad = crossesLine(acts);
  if (bad.length) return toast(`Action ${bad.join(", ")} is refused: nothing sexual involving minors.`);
  const to = jumpFrom(state.date, jump);
  const g = geo();
  const auto = jump.key === "auto";
  pending = { prompt: worldPrompt(state, { name, neighbours: landNeighbours, across: seaNeighbours, size: (c) => held(c).length, geo: g, places: placesFor(state, g, [...world.provinces.keys()]), talk: talkLines(state, { name }), disputes: disputeLines() }, acts, to, auto), to, auto, actions: acts };
  if (route.route === "paste") { open("actions"); return; }
  viaAddress();
}
// one call to an AI at a time, which can be stopped, and which gives up after two minutes
let calling = null;
async function call(prompt) {
  if (calling) throw new Error("Capo is already waiting for the AI.");
  calling = new AbortController();
  const timer = setTimeout(() => calling?.abort("time"), 120000);
  topBar(); if (sheet) open(sheet);
  try { return await ask(route, prompt, calling.signal); }
  finally { clearTimeout(timer); calling = null; topBar(); }
}
const stopCall = () => calling?.abort("stop");
async function viaAddress() {
  if (calling) return toast("Capo is already waiting for the AI.");
  pending.error = "";
  try { const text = await call(pending.prompt); finish(text); } catch (e) { if (pending) { pending.error = e.message; open("actions"); } toast(e.message); }
}
function finish(text) {
  const r = readWorldReply(text, state, (c) => homes.has(c) || custom()?.code === c, pending.to, pending.auto, codeOf);
  if (!r.matched) { pending.error = `That reply is not for this turn: it must start with TURN: ${turnCode(state)}.`; open("actions"); return; }
  if (!r.events.length) { pending.error = `No event could be read${r.dropped.length ? `: ${r.dropped.slice(0, 3).join("; ")}` : ""}.`; open("actions"); return; }
  remember(`turn ${state.turn}`);
  const { receipt } = closeTurn(state, r, geo(), pending.actions);
  pending = null; save(); topBar(); ledgerTab = "events"; open("ledger"); map.refresh();
  const changed = receipt.filter((x) => x.ok && / takes it from | hands /.test(x.text)).length;
  toast(`Now ${fmtDate(state.date)}.${changed ? ` ${changed} province${changed > 1 ? "s" : ""} changed hands.` : ""}`);
}

function ledger(box) {
  const tabs = el("div", undefined, "row");
  for (const [k, t] of [["events", "Events"], ["news", "News"], ["world", "World"], ["log", "Chronicle"]]) { const b = button(t, () => { ledgerTab = k; open("ledger"); }); b.setAttribute("aria-pressed", String(ledgerTab === k)); tabs.append(b); }
  box.append(el("h2", "Ledger"), tabs);
  const last = state.log[state.log.length - 1];
  if (ledgerTab === "world") { worldTab(box); return; }
  if (ledgerTab === "news") {
    const papers = state.log.slice().reverse().flatMap((t) => { const front = (t.receipt || []).filter((x) => x.check).map((x) => `${x.check.band}: ${x.text.replace(/[.!?]$/, "")}.`); return [...(front.length ? [{ outlet: "From the front, as the rules decided", headline: `${front.length} attack${front.length > 1 ? "s" : ""} settled`, text: front.join(" "), when: t.to }] : []), ...(t.news || []).map((n) => ({ ...n, when: t.to }))]; });
    if (!papers.length) { box.append(el("p", "No papers yet. The press writes after each turn.", "note")); return; }
    const feed = el("ol", undefined, "feed");
    feed.append(...papers.slice(0, 24).map((n) => { const li = el("li"); li.append(el("div", `${n.outlet}, ${fmtDate(n.when)}`, "note"), el("b", n.headline), ...(n.text ? [el("p", n.text)] : [])); return li; }));
    box.append(el("p", "What the world's press says. Papers can be slanted or wrong; the Events tab and the rules are what is true.", "note"), feed);
    return;
  }
  if (ledgerTab === "log") {
    if (!state.log.length) { box.append(el("p", "Nothing yet.", "note")); return; }
    // the chronicle: every turn the log still holds, then the eras older turns were folded into, newest first
    const feed = el("ol", undefined, "feed"), first = state.turn - state.log.length;
    const row = (when, did, told) => { const li = el("li"); li.append(el("div", when, "note"), ...(did ? [el("p", `${did}.`)] : []), ...(told ? [el("p", told, "note")] : [])); return li; };
    feed.append(...state.log.slice().reverse().map((t, i) => row(`${fmtDate(t.from)} to ${fmtDate(t.to)}, turn ${t.turn || state.turn - 1 - i}${t.branch ? `, line ${t.branch + 1}` : ""}`, factWords(factsOf(t.receipt), name), t.summary || `${t.events.length} events.`)),
      ...state.chron.eras.filter((e) => e.t0 < first).reverse().map((e) => row(`${fmtDate(e.from)} to ${fmtDate(e.to)}, turns ${e.t0} to ${e.t1}`, factWords(e.f, name), e.s.join(" ... "))));
    box.append(el("p", `Kept by the game, not by the AI: what the rules decided each turn, then how the turn was told. The AI is sent the same chronicle every turn, at the same length however long the game runs.${state.branch ? ` Settled turns played again after a take-back: ${state.branch}.` : ""}`, "note"), feed); return;
  }
  if (!last) { box.append(el("p", state.opening || "", "note"), el("p", "Nothing has happened yet. Write your actions and advance.", "note")); return; }
  const feed = el("ol", undefined, "feed");
  for (const e of last.events) {
    const li = el("li"), when = button(`${fmtDate(e.date)}, ${name(e.at)}`, () => showCountry(e.at), "when");
    when.style.setProperty("--c", colourOf(e.at) || ownerColour(e.at));
    li.append(when, el("p", e.text)); feed.append(li);
  }
  box.append(el("p", last.summary, "note"), feed);
  if (last.advice) box.append(el("h3", `Your trusted adviser, ${last.advice.name}`), el("p", `${last.advice.word}: ${last.advice.text}`));
  if (last.receipt?.length) {
    const list = el("ul", undefined, "list");
    list.append(...last.receipt.map((x) => { const li = el("li", undefined, x.ok ? "yes" : "no"); li.append(el("span", x.ok ? "✓" : "✗", "mark"), ...(x.check ? [el("b", `${x.check.band}: `)] : []), el("span", `${x.text.replace(/[.!?]$/, "")}.`)); return li; }));
    box.append(el("h3", "What the rules decided"), list);
  }
  if (last.dropped.length) box.append(el("p", `Left out of the reply: ${last.dropped.join("; ")}.`, "note"));
}

function worldTab(box) {
  const me = state.player, wars = state.wars.map((w) => w.pair.split("|")), list = (items, empty) => { const ul = el("ul", undefined, "list"); ul.append(...(items.length ? items : [empty]).map((t) => { const li = el("li"); li.append(el("span", t)); return li; })); return ul; };
  const taken = Object.entries(state.owners).map(([id, c]) => `${world.provinces.get(id).name}: held by ${name(c)}, taken from ${name(world.provinces.get(id).country)}`);
  box.append(el("h3", "Wars"), list(wars.map(([a, b]) => `${name(a)} and ${name(b)}, since ${fmtDate(state.wars.find((w) => w.pair === [a, b].join("|")).since)}`), "No wars."),
    el("h3", "Treaties"), list(state.treaties.map((t) => { const [a, b] = t.pair.split("|"); return `${name(a)} and ${name(b)}: ${t.kind}`; }), "No treaties."),
    el("h3", "Offers to you"), list(state.offers.map((o) => `${name(o.from)} offers ${o.kind === "peace" ? "peace" : treatyName(o.kind)} (${fmtDate(o.date)}). Answer it under Actions.`), "None."),
    el("h3", "Where you stand"), list([...new Set([...Object.keys(state.rel).filter((k) => k.split("|").includes(me)).map((k) => k.split("|").find((c) => c !== me)), ...warsOf(state, me), ...treatiesOf(state, me).map((t) => t.with)])].filter((c) => relOf(state, me, c)).map((c) => `${name(c)}: ${stand(c)}`), "Neutral with everyone: nothing has yet moved a relation."),
    el("h3", "Land that has changed hands"), list(taken, "None yet."),
    ...(state.facts?.length ? [el("h3", "Story facts"), list(state.facts.map((f) => f.text), "")] : []),
    ...(state.edits?.length ? [el("h3", "Changed by hand (Sandbox)"), list(state.edits.map((e) => `${fmtDate(e.date)}: ${e.text}`), "")] : []),
    el("p", `${name(me)}: might ${mightOf(geo(), me)} of 10 (invented, for this fiction), ${held(me).length} provinces.`, "note"));
}

// ---- the Game Master: facts the story must honour (canonical), or direct changes to what the rules hold (sandbox) ----
let gmPicking = false, gmPlace = null;
/** A box to type a country into, by name; `get()` gives its code or null. */
function countryInput(label) {
  const input = Object.assign(el("input", undefined, "plain"), { type: "search", placeholder: label }), id = `gm-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const dl = el("datalist"); dl.id = id; input.setAttribute("list", id); input.setAttribute("aria-label", label);
  const byName = new Map([...homes.keys(), ...(state.custom ? [state.custom.code] : [])].map((c) => [name(c), c]));
  dl.append(...[...byName.keys()].sort().map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
  const wrap = el("span"); wrap.append(input, dl);
  return { el: wrap, get: () => byName.get(input.value.trim()) || null };
}
/** Make one sandbox change: keep the old game to undo, mark the game as edited, record what was done. */
function edit(text, change) {
  remember(`the change "${text}"`);
  change();
  state.sandbox = true;
  state.edits = [...(state.edits || []), { turn: state.turn, date: state.date, text }].slice(-60);
  save(); topBar(); map.refresh(); open("master"); toast(text);
}
const pairOf = (a, b) => [a, b].sort().join("|");

function master(box) {
  box.append(el("h2", "Game Master"));
  // story facts: the AI is told these are true, every turn, until they are removed
  const facts = el("ul", undefined, "list");
  facts.append(...(state.facts || []).map((f, i) => { const li = el("li"); li.append(el("span", f.text), button("Remove", () => { state.facts.splice(i, 1); save(); open("master"); })); return li; }));
  const fact = Object.assign(el("textarea", undefined, "plain"), { rows: 2, maxLength: 400, placeholder: "Something true in this story, for example: A coup in Peru puts the army in charge." });
  fact.setAttribute("aria-label", "A story fact");
  const add = el("div", undefined, "row");
  add.append(button("Tell the story", () => {
    const t = fact.value.trim(); if (!t) return;
    if (crossesLine([t]).length) return toast("Refused: nothing sexual involving minors.");
    state.facts = [...(state.facts || []), { text: t, turn: state.turn }].slice(-20); save(); open("master"); toast("The AI will treat it as true.");
  }, "go"));
  box.append(el("h3", "Story facts"), el("p", "The AI is told these are true every turn until you remove them. They shape the story; they do not move land, wars or treaties.", "note"), facts, fact, add);

  // direct changes: the rules' own facts, by hand
  box.append(el("h3", "Change the world"), el("p", state.sandbox ? "This game is marked Sandbox: its facts have been changed by hand." : "Changes the rules' own facts directly. The first change marks this game Sandbox for good, so it is always clear the rules were overridden. Every change can be undone.", "note"));

  const place = gmPlace && world.provinces.get(gmPlace), to = countryInput("New holder"), r1 = el("div", undefined, "row");
  r1.append(button(gmPicking ? "Tap a province on the map..." : place ? `Province: ${place.name} (${name(ownerOf(place.id))})` : "Pick a province on the map", () => { gmPicking = true; open(null); toast("Tap a province on the map."); }));
  r1.append(to.el, button("Hand it over", () => {
    const c = to.get(); if (!place) return toast("Pick a province first."); if (!c) return toast("Choose the new holder.");
    const from = ownerOf(place.id); if (from === c) return toast(`${name(c)} already holds it.`);
    if (held(from).length <= 1) return toast(`It is the last land ${name(from)} holds.`);
    edit(`${place.name} handed from ${name(from)} to ${name(c)}`, () => { if (place.country === c) delete state.owners[place.id]; else state.owners[place.id] = c; });
  }));
  box.append(el("div", "Hand a province to another country", "note"), r1);

  const a = countryInput("First country"), b = countryInput("Second country"), kind = el("select", undefined, "plain"), r2 = el("div", undefined, "row");
  kind.append(...["trade", "defence", "alliance"].map((k) => new Option(`${k} treaty`, k))); kind.setAttribute("aria-label", "Kind of treaty");
  const two = () => { const x = a.get(), y = b.get(); if (!x || !y || x === y) { toast("Choose two different countries."); return null; } return [x, y]; };
  r2.append(a.el, b.el);
  const r3 = el("div", undefined, "row");
  r3.append(
    button("Start a war", () => { const p = two(); if (!p) return; if (state.wars.some((w) => w.pair === pairOf(...p))) return toast("They are already at war."); edit(`War between ${name(p[0])} and ${name(p[1])}`, () => { state.treaties = state.treaties.filter((t) => t.pair !== pairOf(...p)); state.wars.push({ pair: pairOf(...p), since: state.date, by: "gm" }); }); }),
    button("End their war", () => { const p = two(); if (!p) return; if (!state.wars.some((w) => w.pair === pairOf(...p))) return toast("They are not at war."); edit(`Peace between ${name(p[0])} and ${name(p[1])}`, () => { state.wars = state.wars.filter((w) => w.pair !== pairOf(...p)); }); }),
    kind,
    button("Make a treaty", () => { const p = two(); if (!p) return; edit(`A ${kind.value} treaty between ${name(p[0])} and ${name(p[1])}`, () => { state.wars = state.wars.filter((w) => w.pair !== pairOf(...p)); state.treaties = state.treaties.filter((t) => t.pair !== pairOf(...p)); state.treaties.push({ pair: pairOf(...p), kind: kind.value, since: state.date }); }); }),
    button("End their treaty", () => { const p = two(); if (!p) return; if (!state.treaties.some((t) => t.pair === pairOf(...p))) return toast("They have no treaty."); edit(`Treaty between ${name(p[0])} and ${name(p[1])} ended`, () => { state.treaties = state.treaties.filter((t) => t.pair !== pairOf(...p)); }); }));
  box.append(el("div", "Wars and treaties between two countries", "note"), r2, r3);

  const who = countryInput("Country"), level = el("select", undefined, "plain"), r4 = el("div", undefined, "row");
  level.append(...Array.from({ length: 10 }, (_, i) => new Option(String(i + 1), String(i + 1)))); level.setAttribute("aria-label", "Might from 1 to 10");
  r4.append(who.el, level, button("Set its might", () => { const c = who.get(); if (!c) return toast("Choose a country."); const n = Number(level.value); edit(`${name(c)}'s might set to ${n} (was ${mightOf(geo(), c)})`, () => { state.might = { ...(state.might || {}), [c]: n }; }); }));
  box.append(el("div", "Might, from 1 to 10 (decides battles)", "note"), r4);

  const r5 = el("div", undefined, "row");
  r5.append(button(past.length ? `Undo ${past[past.length - 1].why}` : "Undo the last change", () => { if (!past.length) return toast("Nothing to undo."); state = restore(past.pop()); save(); topBar(); map.refresh(); open("master"); toast("Undone."); }));
  box.append(r5);
  if (state.edits?.length) {
    const list = el("ul", undefined, "list");
    list.append(...state.edits.slice(-8).reverse().map((e) => { const li = el("li"); li.append(el("span", `${fmtDate(e.date)}: ${e.text}.`)); return li; }));
    box.append(el("h3", "Changes made by hand"), list);
  }
}

// ---- asking an AI for chats and counsel: by address straight away, or by paste inside the open panel ----
let asking = null;
function askAI(prompt, take, where) {
  asking = { prompt, take, where, error: "" };
  if (route.route !== "address") { open(where); return; }
  if (calling) return toast("Capo is already waiting for the AI.");
  open(where);
  call(prompt).then((text) => settle(text)).catch((e) => { if (asking) { asking.error = e.message; open(where); } });
}
function settle(text) {
  const why = asking.take(text);
  if (why) { asking.error = why; open(asking.where); return; }
  const where = asking.where; asking = null; save(); open(where);
}
function askBox() {
  if (calling) return waiting();
  const wrap = el("div"), out = Object.assign(el("textarea", undefined, "plain paste"), { value: asking.prompt, readOnly: true }), back = Object.assign(el("textarea", undefined, "plain paste"), { placeholder: "Paste the AI's whole reply here." });
  out.setAttribute("aria-label", "The prompt"); back.setAttribute("aria-label", "The AI's reply");
  const go = el("div", undefined, "row");
  if (route.route === "address") go.append(button("Ask again", () => askAI(asking.prompt, asking.take, asking.where)));
  go.append(button("Copy the prompt", async () => { try { await navigator.clipboard.writeText(asking.prompt); toast("Copied. Paste it into a new chat."); } catch { out.select(); } }), button("Read the reply", () => settle(back.value), "go"), button("Cancel", () => { const w = asking.where; asking = null; open(w); }));
  wrap.append(el("h3", route.route === "paste" ? "Paste this into a new chat" : "Waiting for the AI"), ...(asking.error ? [el("p", asking.error, "warn")] : []), steps(), out, back, go);
  return wrap;
}
const talkWorld = () => ({ name });

// ---- chats ----
let chatOpen = null;
function chats(box) {
  box.append(el("h2", state.mode === "citizen" ? "Contacts" : "Chats"));
  if (asking?.where === "chats") { box.append(askBox()); return; }
  const chat = state.chats.find((c) => c.id === chatOpen);
  if (chat) { chatView(box, chat); return; }
  box.append(el("p", "Talk with any country, a group of them, or a person. Words only: what is said reaches the next turn, and anything agreed still needs an action of yours.", "note"));
  const list = el("ul", undefined, "list");
  for (const c of state.chats) { const li = el("li"); li.append(el("span", `${chatTitle(c)} (${c.messages.length} message${c.messages.length === 1 ? "" : "s"})`), button("Open", () => { chatOpen = c.id; open("chats"); })); list.append(li); }
  if (state.chats.length) box.append(list);
  box.append(el("h3", "Start a chat"));
  const pick = Object.assign(el("input", undefined, "plain"), { type: "search", placeholder: "Add a country" }), dl = el("datalist"), chosen = [];
  dl.id = "chat-countries";
  const byName = new Map([...homes.keys(), ...(state.custom ? [state.custom.code] : [])].filter((c) => c !== state.player).map((c) => [name(c), c]));
  dl.append(...[...byName.keys()].sort().map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
  pick.setAttribute("list", "chat-countries"); pick.setAttribute("aria-label", "Add a country to the chat");
  const shown = el("p", "Nobody yet.", "note"), person = Object.assign(el("input", undefined, "plain"), { type: "text", maxLength: 80, placeholder: "Or a person, for example: Marta Ríos, union leader" });
  person.setAttribute("aria-label", "A person to talk to");
  const show = () => { shown.textContent = chosen.length ? `With: ${chosen.map(name).join(", ")}` : "Nobody yet."; };
  const add = (c) => { if (c && !chosen.includes(c) && chosen.length < 4) { chosen.push(c); show(); } };
  pick.onchange = () => { add(byName.get(pick.value)); pick.value = ""; };
  const quick = el("div", undefined, "row");
  for (const c of [...new Set([...warsOf(state, state.player), ...treatiesOf(state, state.player).map((t) => t.with), ...landNeighbours(state.player)])].slice(0, 6)) quick.append(button(name(c), () => add(c)));
  const go = el("div", undefined, "row");
  go.append(button("Start", () => {
    const p = person.value.trim();
    if (!chosen.length && !p) return toast("Add a country or name a person.");
    if (crossesLine([p]).length) return toast("Refused: nothing sexual involving minors.");
    const c = { id: `c${Date.now().toString(36)}`, with: chosen.slice(), person: p, messages: [] };
    state.chats.push(c); chatOpen = c.id; save(); open("chats");
  }, "go"));
  box.append(pick, dl, quick, shown, person, go);
}
const chatTitle = (c) => [...c.with.map(name), ...(c.person ? [c.person] : [])].join(", ");
function chatView(box, chat) {
  const feed = el("ol", undefined, "feed");
  for (const m of chat.messages) { const li = el("li"); li.append(el("div", m.who === "you" ? "You" : chat.with.includes(m.who) ? name(m.who) : m.who, "note"), el("p", m.text)); feed.append(li); }
  const input = Object.assign(el("textarea", undefined, "plain"), { rows: 3, maxLength: 800, placeholder: "Say something." });
  input.setAttribute("aria-label", "Your message");
  const go = el("div", undefined, "row");
  go.append(button("Send", () => {
    const t = input.value.trim(); if (!t) return;
    if (crossesLine([t]).length) return toast("Refused: nothing sexual involving minors.");
    const prompt = chatPrompt(state, talkWorld(), chat, t);
    askAI(prompt, (text) => {
      const got = readChat(text, chat, name);
      if (!got.length) return "No answer could be read: each must be a REPLY line from someone in the chat.";
      chat.messages.push({ who: "you", text: t, turn: state.turn }, ...got.map((g) => ({ ...g, turn: state.turn })));
      chat.messages = chat.messages.slice(-60);
      return "";
    }, "chats");
  }, "go"), button("All chats", () => { chatOpen = null; open("chats"); }), button("Close this chat", () => { state.chats = state.chats.filter((c) => c !== chat); chatOpen = null; save(); open("chats"); }));
  box.append(el("h3", chatTitle(chat)), feed, input, go, el("p", "Words only. To act on what is agreed, write it as an action.", "note"));
}

// ---- advisors ----
function advisors(box) {
  const seats = seatsFor(state), council = state.council;
  box.append(el("h2", state.mode === "citizen" ? "Your circle" : "Your council"));
  if (asking?.where === "advisors") { box.append(askBox()); return; }
  if (!council) {
    box.append(el("p", `Five people to advise you, from the circle someone of your standing has: ${seats.map(([, l]) => l.toLowerCase()).join(", ")}. An AI invents them once; they stay, and their favour moves with what you do.`, "note"));
    const r = el("div", undefined, "row");
    r.append(button("Form your council", () => formCouncil(seats), "go"));
    box.append(r); return;
  }
  for (const [seat, label] of seats) {
    const m = council.seats[seat], card = el("div", undefined, "feed");
    const li = el("li");
    if (!m) {
      li.append(el("div", `${label}: empty`, "note"));
      const r = el("div", undefined, "row");
      r.append(button("Find someone", () => formCouncil(seats, [[seat, label]])));
      for (const f of council.former.filter((x) => x.seat === seat && x.why === "dismissed").slice(-2)) r.append(button(`Bring back ${f.name}`, () => { council.seats[seat] = { ...f, favour: Math.max(-2, f.favour) }; council.former = council.former.filter((x) => x !== f); save(); open("advisors"); }));
      li.append(r);
    } else {
      const trusted = council.trusted === seat;
      li.append(el("div", `${label}${trusted ? ", your trusted adviser" : ""}`, "note"), el("b", m.name), ...(m.favour <= -2 ? [el("p", "Turned against you: may stall orders they dislike, and leak your plans.", "warn")] : []), el("p", `${m.traits}. Wants ${m.wants}. Favour ${m.favour > 0 ? "+" : ""}${m.favour}.${state.mode === "citizen" ? "" : ` Skill ${commanders(state).find((x) => x.seat === seat)?.command} of 5, dealt by the rules: it leads attacks and weighs their counsel.`}${m.record?.n ? ` Right ${m.record.right} of ${m.record.n}.` : ""}${m.likes.length ? ` Likes you to ${m.likes.map((v) => v.toLowerCase()).join(", ")}.` : ""}${m.hates.length ? ` Dislikes ${m.hates.map((v) => v.toLowerCase()).join(", ")}.` : ""}`));
      const r = el("div", undefined, "row");
      if (!trusted) r.append(button("Trust most", () => { council.trusted = seat; save(); open("advisors"); }));
      r.append(button("Ask", () => askCouncil([[seat, m]])), button("Dismiss", () => { if (!confirm(`Dismiss ${m.name}?`)) return; council.former.push({ ...m, seat, left: state.date, why: "dismissed", favour: m.favour - 2 }); council.seats[seat] = null; if (trusted) council.trusted = null; save(); open("advisors"); }));
      li.append(r);
    }
    card.append(li); box.append(card);
  }
  const q = Object.assign(el("textarea", undefined, "plain"), { rows: 2, maxLength: 600, placeholder: "Ask the whole council, for example: Should we answer Chile's insult with sanctions?" });
  q.id = "council-question"; q.setAttribute("aria-label", "Your question");
  const r = el("div", undefined, "row");
  r.append(button("Ask the whole council", () => askCouncil(Object.entries(council.seats).filter(([, m]) => m)), "go"));
  box.append(el("h3", "Ask"), q, r);
  if (!council.trusted) box.append(el("p", "Choose whom you trust most: they speak every turn, at no extra call.", "note"));
  const said = (state.counsel || []).slice(-3).reverse();
  if (said.length) {
    box.append(el("h3", "Recent counsel"));
    for (const c of said) { const f = el("ol", undefined, "feed"); f.append(...c.says.map((s) => { const li = el("li"); li.append(el("div", `${s.name}: ${s.word}`, "note"), el("p", s.text)); return li; })); box.append(el("p", `Turn ${c.turn}: ${c.question}`, "note"), f); }
  }
  if (council.former.length) box.append(el("p", `Former members: ${council.former.map((f) => `${f.name} (${f.why})`).join(", ")}.`, "note"));
}
function formCouncil(seats, open1 = seats) {
  askAI(councilPrompt(state, talkWorld(), seats, open1), (text) => {
    const got = readCouncil(text, open1);
    if (!Object.keys(got).length) return "No member could be read: each must be a MEMBER line for an open seat.";
    if (crossesLine(Object.values(got).map((m) => `${m.name} ${m.traits} ${m.wants}`)).length) return "Refused: nothing sexual involving minors.";
    state.council = state.council || { seats: Object.fromEntries(seats.map(([k]) => [k, null])), trusted: null, former: [] };
    for (const [k, m] of Object.entries(got)) state.council.seats[k] = { ...m, since: state.date };
    return "";
  }, "advisors");
}
function askCouncil(members) {
  const q = ($("council-question")?.value || "").trim() || "What should we do next?";
  if (crossesLine([q]).length) return toast("Refused: nothing sexual involving minors.");
  askAI(askPrompt(state, talkWorld(), members, q), (text) => {
    const says = readAsk(text, members);
    if (!says.length) return "No answer could be read: each must be a SAYS line from an adviser asked.";
    state.counsel = [...(state.counsel || []), { turn: state.turn, question: q, says }].slice(-30);
    return "";
  }, "advisors");
}


/** Which build this is, and where its source can be read (the AGPL asks that every copy says so). */
function about() {
  const p = el("p", `Overture of Empires: Capo, version ${VERSION}, build ${BUILD}. Free software under the GNU AGPL. `, "note"), a = el("a", "Source code");
  a.href = SOURCE_URL; a.target = "_blank"; a.rel = "noopener"; p.append(a);
  return p;
}

function gameSheet(box) {
  const pick = el("select", undefined, "plain"), base = el("input", undefined, "plain"), model = el("input", undefined, "plain"), key = el("input", undefined, "plain"), keep = el("input");
  pick.append(new Option("Paste by hand into any AI", "paste"), new Option("An address I give (chat-completions form)", "address")); pick.value = route.route;
  Object.assign(base, { type: "text", value: route.base, placeholder: "The service's address, ending in /v1" });
  Object.assign(model, { type: "text", value: route.model, placeholder: "Model name, as the service writes it" });
  Object.assign(key, { type: "password", value: route.key, placeholder: "Key, if the service needs one", autocomplete: "off" });
  Object.assign(keep, { type: "checkbox", checked: !!route.remember });
  const line = (label, input) => { const l = el("label", undefined, "note"); l.style.display = "grid"; l.style.gap = "4px"; l.append(label, input); return l; };
  const keepLine = el("label", undefined, "note"); keepLine.append(keep, " Remember the key in this browser (not on a shared device)");
  const store = () => { route = { ...route, route: pick.value, base: base.value.trim(), model: model.value.trim(), key: key.value, remember: keep.checked }; saveRoute(route); };
  const aiRow = el("div", undefined, "row");
  aiRow.append(button("Save", () => { store(); toast("Saved."); }, "go"), button("Test", async () => { store(); try { const t = await ask(route, "Reply with the single word READY."); toast(`It answered: ${t.slice(0, 40)}`); } catch (e) { toast(e.message); } }), button("Forget the key", () => { route = forgetKey(route); open("game"); toast("Key forgotten."); }));
  const file = el("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const raw = JSON.parse(await f.text()), s = checkSave(raw); if (!s) throw new Error(); state = s; past = []; save(); toast(convertNote(raw) || "Opened."); open(null); play(); } catch { toast("That file is not a Capo game."); } };
  const saves = el("div", undefined, "row");
  saves.append(button(past.length ? `Take back ${past[past.length - 1].why}` : "Take back the last turn", () => { if (!past.length) return toast("Nothing to take back."); state = restore(past.pop()); save(); topBar(); open("game"); map.refresh(); }),
    button("Save to a file", () => { const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: "application/json" })); a.download = `capo-${state.player}-turn-${state.turn}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }),
    button("Open a file", () => file.click()),
    button("New game", () => { if (confirm("Leave this game? It stays saved until you begin another.")) { open(null); $("top").hidden = true; $("dock").hidden = true; state = null; draft = null; map.refresh(); startScreen(); } }));
  const sTitle = Object.assign(el("input", undefined, "plain"), { type: "text", maxLength: 60, placeholder: "Title, for example: The Andean War of 2027" });
  const sBlurb = Object.assign(el("input", undefined, "plain"), { type: "text", maxLength: 200, placeholder: "One line on what it is" });
  const sOpen = Object.assign(el("textarea", undefined, "plain"), { rows: 3, maxLength: 1000, value: state.log[state.log.length - 1]?.summary || state.opening || "", placeholder: "How the story begins" });
  sTitle.setAttribute("aria-label", "Scenario title"); sBlurb.setAttribute("aria-label", "Scenario line"); sOpen.setAttribute("aria-label", "Scenario opening");
  const sRow = el("div", undefined, "row");
  sRow.append(button("Save as a scenario", () => {
    const s = scenarioFrom(state, { title: sTitle.value, blurb: sBlurb.value, opening: sOpen.value });
    if (!s.title) return toast("Give the scenario a title.");
    if (crossesLine(scenarioText(s)).length) return toast("Refused: nothing sexual involving minors.");
    const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: "application/json" }));
    a.download = `capo-scenario-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled"}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Saved. Open it from the first screen, or share the file.");
  }));
  const again = el("div", undefined, "row"); again.append(button("Show the guide", () => { open(null); guide(0); }));
  box.append(el("h2", "Game"), home(), again, ...(saveFailed ? [el("p", "This browser would not keep the game (its storage may be full). Save to a file now so nothing is lost.", "warn")] : []), el("h3", "Your game"), el("p", `Kept in this browser. ${past.length} turn${past.length === 1 ? "" : "s"} can be taken back. A turn with a settled attack, played again, draws fresh numbers and is marked in the chronicle.`, "note"), saves, file,
    el("h3", "Save the world as a scenario"), el("p", `A starting point others can play: today's date, who holds what, wars, treaties, story facts and might${state.custom ? `, and ${state.custom.name}` : ""}. Not your actions, chats or council.`, "note"), sTitle, sBlurb, sOpen, sRow,
    el("h3", "How Capo reaches an AI"), line("Route", pick), line("Address", base), line("Model", model), line("Key", key), keepLine, aiRow,
    el("p", `Today: ${route.calls || 0} calls, about ${route.sent || 0} tokens sent and ${route.got || 0} received.`, "note"),
    el("p", "A key goes only to the address you give, straight from this page; Capo has no server and never sees it. Use a key with a spending cap. A remembered key stays in this browser, where other pages at this site's address could read it, so leave Remember off on a shared or borrowed device.", "note"),
    about());
}

// ---- the guide: one turn, start to finish, pointing at each part of the screen; once, and again from the Game menu ----
const GUIDED = "capo-guide-1";
const dockButton = (i) => () => $("dock").children[i];
const GUIDE = [
  [() => null, "Welcome to Capo", () => `You lead ${name(state.player)}. This shows one turn, start to finish: about a minute.`],
  [() => $("map"), "The world", () => "Drag to move and pinch or scroll to zoom. Tap any province to see who holds it, its neighbours, and anything disputed. Your land has a silver edge."],
  [dockButton(0), "1. Decide", () => "Write what you do in Actions, in your own words, as many as you like. Ideas are there to start you off."],
  [() => $("top").querySelector("select"), "2. Choose how far", () => "Jump a week, a month, a year, any length, or until something happens."],
  [() => $("top").querySelector("button.go"), "3. Advance", () => "Capo writes a prompt. Copy it into a new chat with any AI you use and paste the whole reply back. Or give Capo an AI's address in the Game menu, and it asks for you."],
  [dockButton(2), "4. Read what happened", () => "The Ledger shows the events, the papers, and what the rules decided: which moves stood, which were refused, and why. The AI tells the story; the rules keep the facts."],
  [dockButton(3), "Your people", () => "Form a council in Advisors and choose whom you trust. In Chats, talk with any country. Words only: only actions change the world."],
  [dockButton(4), "Game Master", () => "Tell the story something true, or change the world by hand. Hand changes mark the game Sandbox, and every one can be undone."],
  [() => $("top").querySelector("button.ic"), "That's it", () => "Saves, scenario files and the AI's address are in the Game menu, along with this guide. Good luck."],
];
let guideAt = -1, lit = null;
function guide(i) {
  const box = $("guide");
  if (lit) { lit.classList.remove("lit"); lit = null; }
  if (i < 0 || i >= GUIDE.length) { guideAt = -1; box.classList.remove("open"); try { localStorage.setItem(GUIDED, "1"); } catch { /* shown again next time */ } return; }
  guideAt = i;
  const [target, title, words] = GUIDE[i], t = target();
  if (t && t !== $("map")) { lit = t; lit.classList.add("lit"); }
  const row = el("div", undefined, "row");
  row.append(el("span", `${i + 1} of ${GUIDE.length}`, "count"));
  if (i > 0) row.append(button("Back", () => guide(i - 1)));
  if (i < GUIDE.length - 1) row.append(button("Skip", () => guide(-1)));
  row.append(button(i === GUIDE.length - 1 ? "Done" : "Next", () => guide(i + 1 < GUIDE.length ? i + 1 : -1), "go"));
  box.replaceChildren(el("h2", title), el("p", words()), row);
  box.classList.add("open");
  // beside what it points at, inside the screen; centred when it points at nothing in particular
  const w = box.offsetWidth, h = box.offsetHeight, vw = innerWidth, vh = innerHeight;
  let x = (vw - w) / 2, y = (vh - h) / 2;
  if (t && t !== $("map")) {
    const r = t.getBoundingClientRect();
    x = Math.min(vw - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
    y = r.bottom + 12 + h < vh ? r.bottom + 12 : Math.max(12, r.top - h - 12);
  }
  box.style.left = `${Math.round(x)}px`; box.style.top = `${Math.round(y)}px`;
  row.querySelector("button.go")?.focus();
}
const guideOnce = () => { let seen = false; try { seen = localStorage.getItem(GUIDED) === "1"; } catch { /* treat as unseen */ } if (!seen) setTimeout(() => guide(0), 400); };

// ---- the province card ----
function card(p) {
  const box = $("card");
  if (!p) { box.style.display = "none"; return; }
  if (state && gmPicking) { gmPicking = false; gmPlace = p.id; picked = p.id; open("master"); return; }
  if (!state && draft?.step === "country") {
    if (draft.kind === "own") toggleOwn(p);
    else { draft.country = ownerOf(p.id); startScreen(); }
    if (draft.picking) { box.style.display = "none"; return; }
  }
  const owner = ownerOf(p.id), near = el("div", undefined, "near");
  for (const id of world.neighbours.get(p.id)) { const n = world.provinces.get(id); near.append(button(n.name, () => { card(n); map.show(n.id); })); }
  const over = el("div", undefined, "near");
  for (const id of world.across.get(p.id)) { const n = world.provinces.get(id); over.append(button(`${n.name} (${name(ownerOf(n.id))})`, () => { card(n); map.show(n.id); })); }
  const wars = state ? warsOf(state, owner) : [], pacts = state ? treatiesOf(state, owner) : [];
  const rows = [el("h2", p.name), ...(p.disputes || []).map((a) => el("p", `${{ disputed: "Disputed", breakaway: "Breakaway", unsettled: "Unsettled" }[a.kind]}: ${a.name}. ${a.note}`, "warn")), el("p", `${name(owner)}${owner !== p.country ? `, taken from ${name(p.country)}` : ""}.${wars.length ? ` At war with ${wars.map(name).join(", ")}.` : ""}${pacts.length ? ` Treaties: ${pacts.map((x) => `${name(x.with)} (${x.kind})`).join(", ")}.` : ""}`, "note"), el("p", near.children.length ? "Borders by land:" : "No land borders.", "note"), near, ...(over.children.length ? [el("p", "Across a narrow sea:", "note"), over] : [])];
  if (state && owner !== state.player) rows.push(el("div", undefined, "row")), rows[rows.length - 1].append(button(`Talk to ${name(owner)}`, () => open("chats")));
  if (state && state.mode !== "citizen" && owner !== state.player) rows.push(warsOf(state, state.player).includes(owner) ? attackBox(p) : treatyBox(owner));
  box.replaceChildren(...rows);
  box.style.display = "block";
  picked = p.id;
}
let picked = null;

// ---- orders by card: an attack, a treaty proposed, an offer accepted. Each is an action the rules carry out themselves ----
function order(o) {
  const old = (state.orders || []).find((x) => x.verb === o.verb && x.target === o.target);
  state.actions = [...(state.actions || []).filter((x) => x !== old?.text), o.text];
  state.orders = [...(state.orders || []).filter((x) => x !== old), o];
  save(); toast("Ordered: it is in your actions."); if (sheet === "actions") open("actions");
}
const answer = (c, kind) => treatyAnswer(state, state.player, c, kind, (x) => mightOf(geo(), x));
const stand = (c) => { const r = relOf(state, state.player, c); return `${relWord(r)} (${r > 0 ? "+" : ""}${r})`; };
/** Where you stand with a country, and what it would answer to each kind of treaty, before you ask. */
function treatyBox(c) {
  const box = el("div"), row = el("div", undefined, "row"), has = treatiesOf(state, state.player).find((x) => x.with === c)?.kind;
  for (const k of Object.keys(NEED)) if (k !== has) row.append(button(`${k[0].toUpperCase()}${k.slice(1)}: would ${answer(c, k).ok ? "agree" : "refuse"}`, () => order({ text: `Propose ${treatyName(k)} to ${name(c)} (${c}).`, verb: "TREATY", target: c, detail: k })));
  box.append(el("h3", "Treaties"), el("p", `Relations: ${stand(c)}. Its answer, by the rules: ${answer(c, "alliance").why.replace(/, needing.*/, "")}. Trade needs 0, defence 2, an alliance 4.`, "note"), row);
  return box;
}

// ---- the attack order: who leads, how, and the odds out of 100 before it is given (ruling 124) ----
const turnAttacks = () => Math.max(1, Math.ceil(monthsBetween(state.date, jumpFrom(state.date, jump))));
let attackPick = { seat: "", approach: "steady" };
function attackBox(p) {
  const box = el("div"), who = el("select", undefined, "plain"), how = el("select", undefined, "plain"), list = commanders(state);
  if (!list.some((c) => c.seat === attackPick.seat)) attackPick.seat = (list.find((c) => c.seat === "war") || list[list.length - 1]).seat;
  who.append(...list.map((c) => new Option(`${c.seat === "generals" ? "Your generals" : c.name}: skill ${c.command}${c.off ? ", out of role (-10)" : ""}`, c.seat)));
  how.append(...Object.entries(APPROACHES).map(([k, [, said]]) => new Option(`${k[0].toUpperCase()}${k.slice(1)}: ${said}`, k)));
  who.value = attackPick.seat; how.value = attackPick.approach; who.style.maxWidth = how.style.maxWidth = "100%"; who.setAttribute("aria-label", "Who leads the attack"); how.setAttribute("aria-label", "How to attack");
  who.onchange = () => { attackPick.seat = who.value; card(p); }; how.onchange = () => { attackPick.approach = how.value; card(p); };
  const a = attackPlan(state, geo(), state.player, p.id, attackPick, turnAttacks());
  if (!a.ok) { box.append(el("p", `${a.why.replace(/^attack on [^:]+ refused: /, "Cannot attack: ")}.`, "note")); return box; }
  const odds = el("p", `Odds: ${oddsLine(a.chance)}. Clean: taken. Costly: taken, but your army is spent for the turn. Failed: thrown back.`), row = el("div", undefined, "row");
  odds.setAttribute("aria-live", "polite");
  row.append(button("Order the attack", () => {
    const lead = list.find((c) => c.seat === a.boss.seat);
    order({ text: `Attack ${p.name} (${p.id}), led by ${lead.seat === "generals" ? "our generals" : lead.name}, ${a.approach}.`, verb: "ATTACK", target: p.id, seat: a.boss.seat, approach: a.approach });
  }, "go"));
  const parts = partsLine({ approach: a.plan.approach, parts: a.plan.parts.filter(([, n]) => n) });
  box.append(el("h3", "Attack"), who, how, el("p", `Might ${a.plan.skill} against ${a.plan.difficulty}${parts ? `, ${parts}` : ""}: chance ${a.chance} of 100 (never above 75).${a.note}`, "note"), odds, row);
  return box;
}

async function start() {
  try { world = await loadWorld("../maps/world.json", "../maps/disputes.json"); } catch (e) { toast(`${e.message} Capo needs its web address, not a file opened by double-click.`); return; }
  index(); claims();
  map = worldMap($("map"), world, { owner: ownerOf, name, colour: viewColour, pick: card, picked: () => picked, mine: () => state?.player });
  $("view").onchange = (e) => { view = e.target.value; map.refresh(); };
  $("in").onclick = () => map.zoomBy(1.6);
  $("out").onclick = () => map.zoomBy(1 / 1.6);
  $("home").onclick = () => (state ? showCountry(state.player) : map.reset());
  const kept = load();
  const good = kept?.state ? checkSave(kept.state) : null;
  if (good) { state = good; past = keptPast(kept); play(); const note = convertNote(kept.state); if (note) { save(); toast(note); } }
  else { if (kept) toast("The saved game in this browser could not be read, so a new one starts. Any game saved to a file can still be opened."); startScreen(); }
}
addEventListener("keydown", (e) => { if (e.key === "Escape" && guideAt >= 0) guide(-1); });
guard();
start();
