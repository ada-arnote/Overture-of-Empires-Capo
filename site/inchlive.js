// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time, on the table: a clock, a share to send, a click on where it goes, and a leaderboard.
// Traditional adds an ink to choose at the start, places on the map, and a mark and a card that wait in gold.
// Capo, The Ink Dries, adds a capital drawn as a tower and a page that dries from its edges.
// Everything the map does can be done from the move panel too: a list of good places to start, a list of neighbours and coasts
// to send to, and a button, so the game is played the same with a keyboard or a screen reader.
// Beside them: the attacks under way, yours to call back and a rival's to answer; Find me, which shows and says where your land is;
// five tips that follow your first minute; and, at the end, your figures and every leading nation's share over the game, read back from the moves.
import { CARDS, DRIES, INKS, MARKS, NONE, PACT, PCTS, PLACES, RIVALS, SAFE, TICK_MS, ageOf, agesOf, apart, bordersOf, cardDue, cityPrice, dryRank, driedOf, gainOf, goalOf, inkOf, landingPrice, landings, liveMovesOf, markDue, markOf, maxOf, pactIn, pactOn, pactWhy, rangeOf, recallLoss, recallable, shores, wetAt, wetOf } from "../src/games/inch/live.js";
import { inch, liveBoardFor } from "../src/games/inch/rules.js";
import { createMatch } from "../src/core/index.js";
import { $, RGB, el, radio, sheet, toast } from "./table.js";
import { settings } from "./shell.js";
import { hexBoard } from "./hexboard.js";
import { areaPicture } from "../src/map/areas.js";
import { ledger, note, title } from "./ledger.js";

const SEA = [64, 104, 128], DRY = [238, 232, 216], LAND = [[214, 204, 170], [206, 198, 162], [220, 210, 178]], HILL = [178, 160, 128], GLYPH = ["well", "quay", "watch", "archive"];
const SPEEDS = [0.5, 1, 2, 4], STEPS = [[0.25, "A quarter of the way to the goal"], [0.5, "Halfway to the goal"], [0.75, "Three quarters of the way to the goal"], [0.9, "Nearly at the goal"]];
let pct = 40, paused = false, speed = 1, beat = 0, clock = 0, building = false, box = null, ink = "draw", me = null;
// what the move panel has chosen: a start, a target; the ink sheet already shown; how far towards the goal was last said
let home = "", aim = "", asked = null, band = 0, reach = 0, drawn = "";
// Find me glows until `found`; who is attacking you now; the tips: on or off (kept in this browser), the one showing, what you have sent (empty land, a rival), when the last one goes
const TIPS_KEY = "capo-inch-tips", TIPS = ["",
  "Tip 1 of 5. Start where there is room: choose a row below, or tap empty land on the map.",
  "Tip 2 of 5. Grow first. Press the Send button to send a share into the empty land beside you, and watch your border creep.",
  "Tip 3 of 5. Strength comes back every half second, faster the more land you hold. Send again whenever it is above half its limit.",
  "Tip 4 of 5. Empty land runs out. Then choose a neighbour with little strength for its land, raise the share to 50% or more, and send.",
  "Tip 5 of 5. Under way lists your attacks and any against you: call one back, or answer an attacker. Reach the goal on the bar at the top to win."];
let found = 0, foes = new Set(), tips = (() => { try { return localStorage.getItem(TIPS_KEY) !== "off"; } catch { return true; } })(), tip = 0, sent = [false, false], tipEnds = 0;
// the clock waits for your first order: `begun` is the game whose clock has started; `struck` until when an attack on you shows, and by whom;
// `framed` the game whose phone view has been brought to your land; `told` when each attacker was last written in the log
let begun = null, struck = 0, struckBy = -1, framed = null;
// `held` the game brought back paused (Continue, or a saved file), until its clock runs again
let held = null;
const told = new Map();
// inchlive hook: a game for two people played live (site/inchplay.js). `net` is that game's live table: this browser's seat,
// whether the two browsers are joined, and where orders and the pause go. Every position this page reads is seen from that seat.
let net = null, inviter = null;
export const useNet = (x) => { net = x; };
/** Invite a friend to play this game live: set by site/inchplay.js. */
export const useInviter = (f) => { inviter = f; };
const views = new WeakMap();
/** A position as this browser's person sees it: in a game for two, their own seat is `human`. */
export const view = (p) => { if (!p?.people || !net || net.seat === p.human) return p; if (!views.has(p)) views.set(p, Object.freeze({ ...p, human: net.seat })); return views.get(p); };
const pos = (T) => view(T.match.position);
/** An order of this browser's person: in a game for two it names its seat and goes to the live table (or, played on alone, to the table here). */
const act = (T, m) => { const p = T.match.position; if (!p.people) return T.play(m); if (net && !net.alone) return void net.order(m); return T.play({ ...m, by: net ? net.seat : p.human }); };
const keepTips = () => { try { localStorage.setItem(TIPS_KEY, tips ? "on" : "off"); } catch { /* the tips still work for this visit */ } };

/** Colours for every nation: yours first, the rest spread round the wheel, never a near twin of yours, in two lightnesses
 *  so that nations sharing one of the six seat patterns also differ in lightness. */
export function colours(p) {
  const hue = ([r, g, b]) => { const x = Math.max(r, g, b), d = x - Math.min(r, g, b) || 1; return ((x === r ? (g - b) / d + 6 : x === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) % 360; }, mine = hue(RGB[0]);
  return p.troops.map((_, s) => {
    if (s === 0) return RGB[0];
    if (s === 1 && p.people) return RGB[1]; // inchlive hook: the second person wears the second seat's colour
    let h = (s * 137.508) % 360;
    if (Math.min(Math.abs(h - mine), 360 - Math.abs(h - mine)) < 28) h = (h + 56) % 360;
    const l = Math.floor(s / 6) % 2 ? 0.42 : 0.58, f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  });
}
const button = (t, cls = "quiet") => { const b = el("button", t, cls); b.type = "button"; return b; };
const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---- where things are, in words ----
/** Rough boxes of the world map's grid (columns, rows), the first that holds a cell names it. */
const WORLD = [["Greenland", 36, 53, 0, 9], ["Central America", 16, 36, 24, 30], ["North America", 0, 41, 0, 23], ["South America", 24, 50, 30, 55], ["the Middle East", 69, 86, 18, 27], ["Europe", 50, 76, 3, 19], ["Africa", 48, 80, 19, 47], ["India", 80, 95, 21, 32], ["Siberia", 76, 123, 0, 11], ["Central Asia", 76, 95, 12, 20], ["East Asia", 96, 123, 12, 26], ["South-east Asia", 88, 123, 27, 38], ["Australia and the islands", 82, 123, 39, 55]];
const colRow = (b, i) => { const [q, r] = b.cells[i]; return [q + (r - (r & 1)) / 2, r]; };
const COMPASS = [["North-west", "North", "North-east"], ["West", "The middle", "East"], ["South-west", "South", "South-east"]];
const third = (v, lo, hi) => Math.max(0, Math.min(2, Math.floor((3 * (v - lo)) / Math.max(1, hi - lo + 1))));
const boxes = new WeakMap();
/** A cell's place in words: its part of the world, or its part of a made map. */
function region(p, b, i) {
  const [c, r] = colRow(b, i);
  if (p.map === "world") { const w = WORLD.find(([, c0, c1, r0, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1); if (w) return w[0]; }
  if (!boxes.has(b)) { const all = b.dry.map((k) => colRow(b, k)); boxes.set(b, [Math.min(...all.map((x) => x[0])), Math.max(...all.map((x) => x[0])), Math.min(...all.map((x) => x[1])), Math.max(...all.map((x) => x[1]))]); }
  const [c0, c1, r0, r1] = boxes.get(b);
  return COMPASS[third(r, r0, r1)][third(c, c0, c1)];
}
const slots = new WeakMap();
/** A land cell's number on the drawn board. */
const slotOf = (b) => { if (!slots.has(b)) slots.set(b, new Map(b.dry.map((c, k) => [c, k]))); return slots.get(b); };

// ---- the lists that stand in for the map ----
let starts = { p: null, list: [] };
/** About eight good places to start, the one dealt for you first: the most empty land within six steps, far from others. */
function startsOf(T) {
  const p = pos(T);
  if (starts.p === p) return starts.list;
  const b = liveBoardFor(p), ok = [...new Set(liveMovesOf(p, b).map((m) => m.at))], far = Array(b.n).fill(14), queue = [];
  for (let i = 0; i < b.n; i++) if (p.owner[i] !== NONE) { far[i] = 0; queue.push(i); }
  for (let k = 0; k < queue.length; k++) for (const m of b.near[queue[k]]) if (far[m] > far[queue[k]] + 1) { far[m] = far[queue[k]] + 1; queue.push(m); }
  const room = (i) => { const d = new Map([[i, 0]]), l = [i]; for (let k = 0; k < l.length; k++) for (const m of b.near[l[k]]) if (b.land[m] && p.owner[m] === NONE && !d.has(m) && d.get(l[k]) < 6) { d.set(m, d.get(l[k]) + 1); l.push(m); } return l.length; };
  const scored = ok.map((i) => ({ at: i, room: room(i), far: far[i] })).sort((x, y) => y.room + 6 * y.far - (x.room + 6 * x.far) || x.at - y.at);
  const dealt = scored.find((x) => x.at === p.starts?.[p.human]), pick = dealt ? [dealt] : [];
  for (const gap of [12, 7, 3]) for (const x of scored) if (pick.length < 8 && pick.every((y) => apart(b, x.at, y.at) >= gap)) pick.push(x);
  const named = pick.map((x) => ({ ...x, where: region(p, b, x.at) })), seen = new Map();
  for (const x of named) seen.set(x.where, (seen.get(x.where) || 0) + 1);
  const twice = new Map(), list = named.map((x, k) => {
    const n = seen.get(x.where) > 1 ? (twice.set(x.where, (twice.get(x.where) || 0) + 1), twice.get(x.where)) : 0, place = p.places.find(([at]) => apart(b, at, x.at) <= 3);
    return { value: String(x.at), at: x.at, where: `${x.where}${n ? ` ${n}` : ""}`, note: `${k === 0 && dealt ? "dealt for you, " : ""}room for ${x.room}, ${x.far >= 14 ? "no nation close" : `nearest nation ${x.far} away`}${place ? `, near ${/^[aeiou]/i.test(PLACES[place[1]].name) ? "an" : "a"} ${PLACES[place[1]].name.toLowerCase()}` : ""}` };
  });
  starts = { p, list };
  return list;
}
/** Where you can send: empty land beside you, each neighbour by name, and by boat each owner's coast in each part of the map. */
function targetsOf(p, b) {
  const h = p.human, near = bordersOf(p, b)[h], cs = colours(p), wet = wetOf(p), share = (o) => `${Math.round((100 * p.land[o]) / wet)}% of the land`, out = [], kept = pactOn(p);
  if (near.has(NONE)) out.push({ value: "n-1", to: NONE, label: "Empty land", note: "beside you" });
  for (const o of [...near].filter((x) => x !== NONE && x !== kept).sort((x, y) => p.names[x].localeCompare(p.names[y]))) out.push({ value: `n${o}`, to: o, label: p.names[o], note: `${share(o)}, strength ${p.troops[o]}`, rgb: cs[o] });
  if (!p.boats) return out;
  const groups = new Map();
  for (const [at, d] of shores(p, b)) {
    if (p.owner[at] === kept && kept !== NONE) continue;
    const o = p.owner[at], key = `b${o}:${region(p, b, at)}`, need = landingPrice(p, b, at) + 1, g = groups.get(key);
    if (!g || need < g.need || (need === g.need && d < g.d)) groups.set(key, { at, d, need, o });
  }
  const who = (o) => (o === NONE ? "" : p.names[o]), boats = [...groups].sort((x, y) => x[1].d - y[1].d).slice(0, 10).sort((x, y) => (x[1].o === NONE) - (y[1].o === NONE) || who(x[1].o).localeCompare(who(y[1].o)) || x[0].localeCompare(y[0]));
  for (const [key, g] of boats) out.push({ value: key, boat: true, at: g.at, to: g.o, need: g.need, label: `By boat: ${g.o === NONE ? "empty land" : p.names[g.o]}`, note: `${region(p, b, g.at)}, needs ${g.need}`, rgb: g.o === NONE ? undefined : cs[g.o] });
  return out;
}
/** The shell's row of choices, changed in place while the same rows stand, so a focused row keeps its focus and is not read again. */
function rows(host, items, chosen, pick) {
  const keys = items.map((x) => x.value).join("|");
  if (host.dataset.keys !== keys) { radio(host, items, chosen, pick); host.dataset.keys = keys; } else [...host.children].forEach((b, k) => {
    const x = items[k], on = x.value === chosen, t = [...b.childNodes].find((n) => n.nodeType === 3), s = b.querySelector("small");
    b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1;
    if (t && t.data !== x.label) t.data = x.label;
    if (s && s.textContent !== x.note) s.textContent = x.note;
  });
  host.onkeydown = (e) => { // the arrows walk the rows as they are now; Home and End go to the ends
    const at = items.findIndex((x) => x.value === chosen), to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to === undefined || !items.length) return;
    e.preventDefault();
    pick(items[(to + items.length) % items.length].value);
    host.querySelector("[aria-checked=true]")?.focus();
  };
}

// ---- the panel ----
function controls(T) {
  if (box) return box;
  box = el("div");
  box.id = "live";
  const row = el("label", undefined, "live-row"), slider = el("input"), out = el("output"), btns = el("div", undefined, "go"), pause = button("Pause"), city = button("Build a city");
  Object.assign(slider, { type: "range", min: "0", max: String(PCTS.length - 1), step: "1", value: String(PCTS.indexOf(pct)) });
  slider.setAttribute("aria-label", "Share of your strength to send");
  slider.oninput = () => { pct = PCTS[Number(slider.value)]; out.textContent = `${pct}%`; slider.setAttribute("aria-valuetext", `${pct}%`); if (T.match) T.refresh(); };
  out.textContent = `${pct}%`;
  row.append(el("span", "Send"), slider, out);
  pause.onclick = () => {
    if (T.match?.position.people && net?.joined()) return net.pause(); // inchlive hook: the pause is shared
    if (T.match && waiting(T)) { begun = T.match; paused = false; held = null; speak("The clock runs."); return T.refresh(); } // before your first order the button starts the clock
    paused = !paused; held = null; speak(paused ? "Paused. You can still send orders." : "The clock runs again."); return T.refresh();
  };
  city.onclick = () => { building = !building; city.setAttribute("aria-pressed", String(building)); toast(building ? "Tap one of your cells to build a city there." : "Building stopped."); };
  const me = button("Find me"), help = button("Tips");
  me.onclick = () => find(T);
  help.setAttribute("aria-pressed", String(tips));
  help.onclick = () => { tips = !tips; tip = 0; sent = [false, false]; tipEnds = 0; keepTips(); help.setAttribute("aria-pressed", String(tips)); if (!tips) speak("Tips are off."); T.refresh(); };
  btns.append(pause, me, help, city);
  const runs = el("ul"), guide = el("p", "", "live-guide"), pact = button(""), pactSay = el("p", "", "live-info");
  pact.id = "live-pact"; pactSay.id = "live-truce";
  runs.id = "live-runs"; runs.setAttribute("aria-label", "Attacks under way");
  const fast = el("div", undefined, "line speed"), pace = el("div", undefined, "pick small");
  pace.setAttribute("role", "radiogroup"); pace.setAttribute("aria-label", "Speed of the clock");
  const pick = () => radio(pace, SPEEDS.map((v) => ({ value: v, label: `${v}x` })), speed, (v) => { speed = v; pick(); });
  pick();
  fast.append(el("span", "Speed"), pace);
  const board = el("ol"), due = el("div", undefined, "go"), head = el("p", "", "cap"), list = el("div", undefined, "pick list"), go = button("", "main"), mine = button("", "quiet");
  board.id = "leaders"; board.setAttribute("aria-label", "Largest nations. Choose one to read its card");
  head.id = "live-head"; list.id = "live-list"; go.id = "live-go"; mine.id = "live-ink";
  list.setAttribute("role", "radiogroup"); list.setAttribute("aria-labelledby", "live-head");
  mine.onclick = () => inkSheet(T);
  for (const e of [list, go]) { e.addEventListener("focusin", () => T.ready() && mark(T)); e.addEventListener("focusout", () => setTimeout(() => T.ready() && mark(T))); }
  const heading = el("p", "", "live-title"); // what to do, in plain words that are not read out at every tick
  const link = el("p", "", "live-info"), linkGo = el("div", undefined, "go"); // inchlive hook: live play with a friend, and how it stands
  link.id = "live-net"; linkGo.id = "live-net-go";
  box.append(heading, guide, el("p", "", "live-info"), link, linkGo, due, mine, head, list, row, go, pact, pactSay, runs, btns, fast, board);
  Object.assign(box, { city, slider, due, head, list, go, ink: mine, pause, row, btns, fast, heading, runs, guide, me, help, pact, pactSay, link, linkGo });
  $("choice").append(box);
  return box;
}

/** Whether the clock still waits for your first order: nothing but your start and the clock in the game's moves so far. */
function waiting(T) {
  const m = T.match;
  if (!m || begun === m || m.position.phase !== "play" || m.position.people) return false; // inchlive hook: a game for two starts when both have started
  if (m.list.some((x) => x.do !== "tick" && x.do !== "spawn")) { begun = m; return false; }
  return true;
}
/** The clock: a tick every half second, faster when asked, half as fast at 0.5x, never while a sheet is open or the game is paused,
 *  and not before your first order, so reading the panel costs nothing. */
export function start(T) {
  clearInterval(clock);
  clock = setInterval(() => {
    const p = T.match?.position;
    if (!p?.live || T.demo || paused || p.phase !== "play" || document.querySelector("#sheet").open || !T.ready() || waiting(T) || (p.people && !net?.alone)) return; // inchlive hook
    if (speed < 1 && beat++ % 2) return;
    T.flow({ do: "tick", n: Math.max(1, speed) });
  }, TICK_MS);
}

const placeAt = (p, i) => p.places.find(([at]) => at === i);
/** A spawn, an attack or a landing, from the map or from the panel. */
function send(T, t) {
  const p = pos(T), b = liveBoardFor(p);
  sent[t.to === NONE ? 0 : 1] = true;
  if (!t.boat) { aim = `n${t.to}`; return act(T, { do: "attack", to: t.to, pct }); }
  const need = landingPrice(p, b, t.at) + 1;
  if (Math.floor((p.troops[p.human] * pct) / 100) < need) return toast(`Landing there takes ${need} strength. Send a bigger share, or wait and grow.`);
  aim = `b${p.owner[t.at]}:${region(p, b, t.at)}`;
  return act(T, { do: "boat", at: t.at, pct });
}
const spawn = (T, at) => { const p = pos(T), want = p.choose ? INKS[ink === "draw" ? p.ink[p.human] : ink].id : undefined, m = liveMovesOf(p, liveBoardFor(p)).find((x) => x.at === at && x.ink === want); if (m) found = performance.now() + 3000; return m ? act(T, m) : undefined; };
export function tap(T, i) {
  if (!T.ready()) return undefined;
  const p = pos(T), b = liveBoardFor(p), spot = placeAt(p, i);
  if (i < 0 || !b.land[i]) return toast("That is sea.");
  if (!wetAt(p, b, i)) return toast("That land has dried. Nobody can hold it now.");
  if (spot) toast(`${PLACES[spot[1]].name}: ${PLACES[spot[1]].line}`);
  if (p.phase === "spawn") return spawn(T, i) ?? (spot || toast("Too close to someone or to a place. Choose empty land away from others, or a place in the list."));
  if (!p.alive[p.human]) return toast("You are out. Watch to the end, or start again from the menu.");
  const o = p.owner[i];
  if (o === p.human) {
    if (building && p.building) { const m = { do: "city", at: i }; if (p.troops[p.human] < cityPrice(p)) return toast(`A city costs ${cityPrice(p)} strength.`); building = false; box?.city.setAttribute("aria-pressed", "false"); return act(T, m); }
    return spot || toast("That land is yours. Tap a neighbour's, or empty land beside yours.");
  }
  if (o !== NONE && o === pactOn(p)) return toast(`You keep a truce with ${p.names[o]} for ${clockOf(pactIn(p).until - p.tick)} more. Neither of you can attack the other.`);
  if (bordersOf(p, b)[p.human].has(o)) return send(T, { to: o });
  if (p.boats && landings(p, b).has(i)) return send(T, { boat: true, at: i });
  if (!p.boats) return toast("You can only attack land beside yours.");
  reach = performance.now() + 5000;
  mark(T);
  return toast(`Too far, even by boat. Your boats cross ${rangeOf(p, b, p.human)} cells of sea; the coasts they reach now glow.`);
}

export function board(T, stage) {
  const p = pos(T), b = liveBoardFor(p), cs = colours(p), slot = slotOf(b), of = b.cells.map((_, i) => (slot.has(i) ? slot.get(i) : -1));
  const picture = areaPicture(b.cells, of, b.dry, 9, true);
  document.body.classList.add("atlas");
  drawn = "";
  // dried land is drawn as one more seat, the colour of bare paper; a capital is a tower showing its nation's strength
  const rank = dryRank(b), n = cs.length;
  return hexBoard(T, stage, {
    era: "early", // figures hook: which sculpted pieces stand in 3D (src/map/figures.js)
    picture, cells: [], rough: [], sea: [...b.dry.map(() => false), true], seats: [...cs, DRY], fine: { cells: b.cells, of, mid: b.dry },
    terrain: (k) => (k < b.dry.length && b.hill[b.dry[k]] ? 7 : 0),
    ground: (k) => (k >= b.dry.length ? SEA : b.hill[b.dry[k]] ? HILL : LAND[k % 3]),
    owner: () => { const q = pos(T), k = driedOf(q); return [...b.dry.map((c) => (rank[c] < k ? n : q.owner[c])), NONE]; },
    pieces: () => {
      const q = pos(T), rgb = (at) => cs[q.owner[at]] || [180, 170, 150], towers = q.cap ? q.cap.flatMap((at, s) => (at >= 0 && q.land[s] ? [{ kind: "tower", at: slot.get(at), rgb: cs[s], count: q.troops[s], now: s === q.human }] : [])) : [];
      return [...q.cities.map((at) => ({ kind: "town", at: slot.get(at), rgb: rgb(at) })), ...q.places.map(([at, k]) => ({ kind: GLYPH[k], at: slot.get(at), rgb: rgb(at), good: 4 })), ...towers];
    },
    names() { // every nation's name sits in the middle of its land, so colour is never the only sign of whose it is; a phone names the larger ones
      const q = pos(T), sum = q.troops.map(() => [0, 0, 0]), least = innerWidth > 820 ? 5 : 25;
      q.owner.forEach((o, i) => { if (o >= 0) { const [x, y] = picture.at[i]; sum[o][0] += x; sum[o][1] += y; sum[o][2]++; } });
      return sum.flatMap(([x, y, c], s) => (c >= least ? [{ at: [x / c, y / c], text: q.names[s], sea: true }] : []));
    },
    tap: (k) => tap(T, k < b.dry.length ? b.dry[k] : -1),
    can: (k) => k < b.dry.length,
  });
}

/** The cell of yours nearest the middle of your land (your capital when you have one), where arrows start. */
function centre(p, b) {
  const h = p.human;
  if (p.cap?.[h] >= 0 && p.owner[p.cap[h]] === h) return p.cap[h];
  let Q = 0, R = 0, n = 0, best = -1, d = Infinity;
  p.owner.forEach((o, i) => { if (o === h) { Q += b.cells[i][0]; R += b.cells[i][1]; n++; } });
  p.owner.forEach((o, i) => { if (o === h) { const dq = b.cells[i][0] - Q / n, dr = b.cells[i][1] - R / n, e = Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr); if (e < d) { d = e; best = i; } } });
  return best;
}
/** The cell of `to` on your border nearest `from`: where an attack on it is fought. */
function front(p, b, to, from) {
  const h = p.human, wet = dryRank(b), k = driedOf(p);
  let best = -1, d = Infinity;
  for (let i = 0; i < b.n; i++) if (p.owner[i] === to && b.land[i] && wet[i] >= k && b.near[i].some((m) => p.owner[m] === h)) { const e = apart(b, i, from); if (e < d) { d = e; best = i; } }
  return best;
}
/** The board shows what the panel says: the place chosen to start; the front of your biggest attack under way, with an arrow;
 *  where the next share would go while the panel has the keyboard or the pointer; and, when asked, how far your boats reach. */
function mark(T) {
  const p = pos(T), b = liveBoardFor(p), slot = slotOf(b), h = p.human, now = box && (box.contains(document.activeElement) || box.matches(":hover"));
  let glow = [], ring = -1, at = -1, arrow = null;
  if (p.phase === "spawn") { const s = Number(home); if (home && b.land[s]) { glow = [s, ...b.near[s]].filter((c) => b.land[c]); at = s; } }
  else if (p.alive[h] && p.land[h]) {
    const mid = centre(p, b), going = p.attacks.filter((a) => a.by === h).sort((x, y) => y.left - x.left), t = targetsOf(p, b).find((x) => x.value === aim);
    if (going.length) { const f = front(p, b, going[0].to, mid); if (f >= 0) { ring = f; arrow = [mid, f]; } }
    if (now && t) {
      const f = t.boat ? t.at : front(p, b, t.to, mid);
      if (f >= 0 && f !== ring) { at = f; if (!arrow) arrow = [t.boat ? p.owner.reduce((x, o, i) => (o === h && b.near[i].some((m) => !b.land[m]) && (x < 0 || apart(b, i, f) < apart(b, x, f)) ? i : x), -1) : mid, f]; }
    }
    if (p.boats && (reach > performance.now() || (now && t?.boat))) glow = [...landings(p, b)];
    // an attack on you: for a few seconds your border with the attacker glows and an arrow comes in from its land
    if (struck > performance.now() && p.alive[struckBy]) {
      const edge = [];
      p.owner.forEach((o, i) => { if (o === h && b.near[i].some((m) => p.owner[m] === struckBy)) edge.push(i); });
      const k = Math.ceil(edge.length / 200), from = front(p, b, struckBy, mid), to = from < 0 ? -1 : edge.reduce((x, i) => (x < 0 || apart(b, i, from) < apart(b, x, from) ? i : x), -1);
      if (edge.length) glow = edge.filter((_, j) => j % k === 0);
      if (from >= 0 && to >= 0) { arrow = [from, to]; ring = from; }
    }
    // Find me: your border glows and your middle is ringed, for a few seconds
    if (found > performance.now()) { const edge = []; p.owner.forEach((o, i) => { if (o === h && b.near[i].some((m) => p.owner[m] !== h)) edge.push(i); }); const k = Math.ceil(edge.length / 300); glow = edge.filter((_, j) => j % k === 0); if (ring < 0) ring = mid; }
  }
  const put = (c) => (c >= 0 && slot.has(c) ? slot.get(c) : -1), sig = `${glow.length}/${glow[0]}/${ring}/${at}/${arrow}`;
  if (glow.length && sig === drawn) return; // a glow pulses when it is drawn, so it is drawn again only when it changes
  drawn = sig;
  T.board?.light(glow.map(put), { ring: put(ring), aim: put(at), arrow: arrow && arrow[0] >= 0 && arrow[1] >= 0 ? arrow.map(put) : null });
}

/** A nation's card: its ink, its mark and its card, opened from the leaderboard. */
function card(p, s) {
  const u = el("ul"), i = inkOf(p, s), m = markOf(p, s);
  u.append(...[i.name && `${i.name}: ${i.line}`, m.name && `${m.name}: ${m.line}`, p.card[s] >= 0 && `Played ${CARDS[p.card[s]].name}.`, `${p.land[s]} cells, ${p.troops[s]} strength.`, s !== p.human && pactOn(p) === s && `At truce with you for ${clockOf(pactIn(p).until - p.tick)} more.`].filter(Boolean).map((t) => el("li", t)));
  sheet(s === p.human ? "You" : p.names[s], u);
}
/** Find me: the map moves to your land when it is out of sight, your border glows, and a line says where you are and who is beside you. */
function find(T) {
  const p = pos(T), b = liveBoardFor(p), h = p.human;
  if (p.phase !== "play") return toast("You have no land yet. Choose where to start.");
  if (!p.land[h]) return toast("You have no land left.");
  const mid = centre(p, b), slot = slotOf(b).get(mid), near = [...bordersOf(p, b)[h]].filter((o) => o !== NONE).map((o) => p.names[o]).sort();
  frame(T, p, b, mid, innerWidth > 820 ? 18 : 13);
  found = performance.now() + 3000; drawn = "";
  mark(T);
  setTimeout(() => { if (T.match?.position.live && T.ready()) mark(T); }, 3100); // the glow goes even while the clock is paused
  return toast(`Your land: ${region(p, b, mid)}. ${word(p.land[h], "cell", "cells")}, ${Math.round((100 * p.land[h]) / wetOf(p)) || "under 1"}% of the land. ${near.length ? `Beside you: ${near.slice(0, 4).join(", ")}${near.length > 4 ? ` and ${near.length - 4} more` : ""}.` : "Nobody is beside you."}`);
}
/** Bring the map in close enough that a cell is about `px` pixels across, then slide your land to the middle. A map already closer stays as close. */
function frame(T, p, b, mid, px) {
  const B = T.board, slot = slotOf(b), at = (i) => B?.at(slot.get(i)), next = b.near[mid].find((i) => slot.has(i));
  if (!B || next === undefined) return;
  const a = at(mid), c = at(next), gap = a && c ? Math.hypot(a.x - c.x, a.y - c.y) : 0;
  if (gap > 0 && gap < px * 0.8) B.zoom(px / gap);
  bring(T, slot.get(mid));
}
/** Slide a zoomed map so that a cell sits in the middle of the free part of the screen. The board is asked only what it already
 *  tells (where a cell is, and to slide by a little), so two small trial slides measure how far a slide moves it. */
function bring(T, slot) {
  const B = T.board, at = () => B?.at(slot), a = at();
  if (!a || !Number.isFinite(a.x)) return;
  const act = innerWidth > 820 ? null : $("act")?.getBoundingClientRect(), cx = innerWidth / 2, cy = act && act.top > 120 ? act.top / 2 : innerHeight / 2;
  if (Math.abs(a.x - cx) < innerWidth * 0.3 && Math.abs(a.y - cy) < innerHeight * 0.25) return; // in plain sight already
  const e = 0.02;
  B.pan(e, 0); const b1 = at(); B.pan(-e, 0); const a1 = at();
  B.pan(0, e); const b2 = at(); B.pan(0, -e);
  const ux = (b1.x - a1.x) / e, uy = (b1.y - a1.y) / e, vx = (b2.x - a1.x) / e, vy = (b2.y - a1.y) / e, det = ux * vy - uy * vx, dx = cx - a1.x, dy = cy - a1.y;
  if (Math.abs(det) > 1) B.pan((dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det); // at the widest view nothing slides, and nothing needs to
}
/** A truce with the neighbour chosen in the list: a button when one can be offered, else a line saying why not, or how long the one in force has left. */
function truce(T, p, b, t) {
  const c = box, kept = pactOn(p), o = t && !t.boat && t.to !== NONE ? t.to : NONE, why = o === NONE ? "near" : pactWhy(p, b, o);
  c.pact.hidden = !!why;
  if (!why) {
    const words = `Offer ${p.names[o]} a truce for ${span(PACT.long)}`;
    if (c.pact.textContent !== words) c.pact.textContent = words;
    c.pact.onclick = () => { const q = pos(T); if (T.ready() && !pactWhy(q, liveBoardFor(q), o)) act(T, { do: "pact", to: o }); };
  }
  const say = kept !== NONE ? `Truce with ${p.names[kept]}: ${clockOf(pactIn(p).until - p.tick)} left. Neither of you can attack the other.`
    : why === "strong" ? `${p.names[o]} holds more than ${PACT.most === 2 ? "twice" : `${PACT.most} times`} your strength and will not take a truce.`
    : why === "wait" ? `Another truce can be offered at ${clockOf(pactIn(p).next)}.` : "";
  if (c.pactSay.textContent !== say) c.pactSay.textContent = say;
  c.pactSay.hidden = !say;
}
/** The attacks under way: a rival's on you first, each with Answer, then yours, each with Call back. The rows stand while their
 *  attack does, so a button keeps the keyboard; a new attacker is said once. */
const runRows = new Map();
function under(T, p) {
  const h = p.human, c = box.runs, rows = [...p.attacks.filter((a) => a.to === h), ...p.attacks.filter((a) => a.by === h)], want = [], now = new Set();
  for (const a of rows) {
    const out = a.by === h, key = `${a.by}:${a.to}`, who = out ? (a.to === NONE ? "empty land" : p.names[a.to]) : p.names[a.by];
    if (!runRows.has(key)) {
      const li = el("li", undefined, out ? "" : "in"), b = button(out ? "Call back" : "Answer");
      b.setAttribute("aria-label", out ? `Call back your attack on ${who}` : `Answer ${who}: choose it to send to`);
      b.onclick = () => { if (!T.ready()) return; if (!out) return answer(T, a.by); const now = recallable(pos(T), a.to); if (now) { toast(lineOf({ kind: "recall", back: now.left - recallLoss(now.left), lost: recallLoss(now.left) })); act(T, { do: "recall", to: a.to }); } return undefined; };
      li.append(el("span"), b);
      runRows.set(key, li);
    }
    const li = runRows.get(key), t = out ? `You, ${a.to === NONE ? "into empty land" : `against ${who}`}: ${a.left}${a.fl ? ", a Flood" : ""}` : `${who} attacks you: ${a.left}`;
    if (li.firstChild.textContent !== t) li.firstChild.textContent = t;
    li.lastChild.hidden = out && !!a.fl; // a Flood cannot be called back
    want.push(li);
    if (!out) now.add(a.by);
  }
  for (const [key, li] of runRows) if (!want.includes(li)) runRows.delete(key);
  if (want.length !== c.children.length || want.some((li, k) => c.children[k] !== li)) {
    const had = c.contains(document.activeElement);
    c.replaceChildren(...want);
    if (had && !c.contains(document.activeElement)) box.go.focus({ preventScroll: true }); // the attack ended under the keyboard
  }
  c.hidden = !want.length;
  foes = now; // a new attacker is written in the log and shown on the map as it comes (seen)
}
/** An attack on you, as it starts: the edge of the board flashes, your border with the attacker glows, and an arrow comes in. */
function strike(T, by) {
  struck = performance.now() + 3000; struckBy = by; drawn = "";
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("stage")?.animate?.([{ boxShadow: "inset 0 0 0 5px rgba(226, 74, 52, .95)" }, { boxShadow: "inset 0 0 0 5px rgba(226, 74, 52, 0)" }], { duration: calm ? 600 : 1400, easing: "ease-out" });
  setTimeout(() => { if (T.match?.position.live && T.ready()) { drawn = ""; mark(T); } }, 3100);
}
/** Answer an attacker: it becomes where you send next, and the button takes the keyboard. */
function answer(T, by) {
  const p = pos(T), t = targetsOf(p, liveBoardFor(p)).find((x) => x.value === `n${by}`);
  if (!t) return toast(`${p.names[by]} is not beside your land now.`);
  aim = t.value;
  T.refresh();
  box.go.focus({ preventScroll: true });
  return undefined;
}
/** The first minute, in five tips that follow what you have done; each is shown, and said once. After the last they turn themselves off. */
function guide(T, p, b) {
  const h = p.human;
  let n = 0;
  if (tips && !T.demo && !p.over && (p.phase === "spawn" || p.alive[h])) {
    if (p.phase === "spawn") n = 1;
    else {
      const near = bordersOf(p, b)[h], open = near.has(NONE), rival = near.size > (open ? 1 : 0);
      n = sent[1] ? 5 : !open || (rival && p.tick > 240) ? 4 : sent[0] || p.land[h] > 12 ? 3 : 2;
      if (n === 5) { tipEnds ||= p.tick + 60; if (p.tick > tipEnds) { tips = false; n = 0; keepTips(); box.help.setAttribute("aria-pressed", "false"); speak("That was the first minute. Tips are off now; the Tips button brings them back."); } }
    }
  }
  if (n !== tip) { tip = n; box.guide.textContent = TIPS[n]; if (n) speak(TIPS[n]); }
  box.guide.hidden = !n;
}
/** Your ink, chosen before the map: a sheet, so that the map is free to look at once it closes. */
function inkSheet(T) {
  const p = pos(T), body = el("div", undefined, "stack"), list = el("div", undefined, "pick list inks");
  list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", "Your ink");
  const draw = () => radio(list, [{ value: "draw", label: "Draw for me", note: `The game drew ${INKS[p.ink[p.human]].name}: ${INKS[p.ink[p.human]].line}` }, ...INKS.map((k, v) => ({ value: String(v), label: k.name, note: k.line, rgb: k.rgb }))], String(ink), (v) => { ink = v === "draw" ? v : Number(v); draw(); T.refresh(); });
  draw();
  body.append(el("p", "Every nation has an ink with one rule. Choose yours, then choose where to start."), list);
  sheet("Choose your ink", body, "Choose where to start");
  list.querySelector("[aria-checked=true]")?.focus();
  // once it is put away (its button or Escape), the keyboard goes to the places to start
  const back = () => setTimeout(() => { if (!$("sheet").open && T.match?.position.phase === "spawn" && !box.contains(document.activeElement)) box.list.querySelector("[aria-checked=true]")?.focus(); });
  $("sheet-close").addEventListener("click", back, { once: true });
  const esc = (e) => { if (e.key === "Escape") { back(); $("sheet").removeEventListener("keydown", esc); } };
  $("sheet").addEventListener("keydown", esc);
}
/** Two gold buttons for a waiting mark or card. */
function due(T, p) {
  const d = box.due, list = markDue(p) ? MARKS.map((k) => ["mark", k]) : cardDue(p) ? CARDS.map((k) => ["card", k]) : [];
  d.hidden = !list.length;
  if (d.dataset.at === String(list.length && list[0][0])) return;
  d.dataset.at = String(list.length && list[0][0]);
  d.replaceChildren(...list.map(([kind, k]) => { const b = button(k.name, "main"), n = el("small", k.line); n.style.display = "block"; b.append(n); b.style.whiteSpace = "normal"; b.onclick = () => T.ready() && act(T, { do: kind, [kind]: k.id }); return b; }));
}
/** The status line is spoken, so it changes only when the state does; the numbers sit in the plain line below it. */
const state = (t) => { if ($("status").textContent !== t) $("status").textContent = t; };
const speak = (t) => { const s = $("live-say"); if (s) s.textContent = t; };
/** The leaderboard: a button for each of the largest nations, held still while the pointer or the keyboard is on it. */
const rowsOf = new Map();
function leaders(p) {
  const list = $("leaders"), s = p.human, cs = colours(p), wet = wetOf(p), hold = list.matches(":hover") || list.contains(document.activeElement);
  let top = p.land.map((n, k) => [n, k]).filter(([n]) => n).sort((x, y) => y[0] - x[0]).slice(0, 8).map(([, k]) => k);
  if (!top.includes(s) && p.land[s]) top.push(s);
  if (hold && list.children.length) top = [...list.children].map((li) => Number(li.dataset.s));
  me ??= title();
  for (const k of top) {
    if (!rowsOf.has(k)) {
      const li = el("li"), b = button("", "quiet"), dot = el("i", undefined, "dot"), sw = el("i", undefined, "dot ink"), i = inkOf(p, k), info = el("small");
      li.dataset.s = String(k);
      dot.style.background = `rgb(${cs[k]})`;
      if (i.rgb) sw.style.background = `rgb(${i.rgb})`;
      b.append(dot, el("b"), el("span"), info);
      if (i.name) info.prepend(sw);
      b.onclick = () => card(pos(T0), k);
      li.append(b);
      rowsOf.set(k, li);
    }
    const li = rowsOf.get(k), b = li.firstChild, n = Math.round((100 * p.land[k]) / wet), name = k === s && me ? `${p.names[k]}, ${me}` : p.names[k], i = inkOf(p, k);
    li.className = k === s ? "me" : "";
    b.children[1].textContent = name; b.children[2].textContent = `${n}%`;
    if (b.children[3].lastChild?.nodeType !== 3) b.children[3].append(""); // the ink's name, as words beside its dot
    b.children[3].lastChild.data = i.name ? `${i.name} ink` : "";
    b.setAttribute("aria-label", `${name}${i.name ? `, ${i.name} ink` : ""}, ${n}% of the land`);
  }
  const want = top.map((k) => rowsOf.get(k));
  if (want.length !== list.children.length || want.some((li, k) => list.children[k] !== li)) list.replaceChildren(...want);
}
let T0 = null;

/** inchlive hook: live play's line and buttons: an invitation from a game not yet begun, then how the live game stands. */
function linkRow(T, p, c) {
  const say = p.people && net ? net.line() : "", offers = p.people ? net?.offers() || [] : p.phase === "spawn" && inviter && !T.match.list.length && !T.demo ? [["Play live with a friend", () => inviter()]] : [];
  if (c.link.textContent !== say) c.link.textContent = say;
  c.link.hidden = !say;
  const key = offers.map(([t]) => t).join("|");
  if (c.linkGo.dataset.keys !== key) { c.linkGo.dataset.keys = key; c.linkGo.replaceChildren(...offers.map(([t, go], k) => { const x = button(t, k ? "quiet" : "main"); x.onclick = go; return x; })); }
  c.linkGo.hidden = !offers.length;
}
export function panel(T) {
  const p = pos(T), s = p.human, c = controls(T), b = liveBoardFor(p);
  T0 = T;
  linkRow(T, p, c);
  for (const id of ["targets", "shares", "pour", "wait"]) $(id).closest(".go, .pick")?.setAttribute("hidden", "");
  $("targets").hidden = $("shares").hidden = true;
  $("pour").parentElement.hidden = true;
  c.hidden = false;
  const spawning = p.phase === "spawn", out = !p.alive[s];
  c.city.hidden = !p.building || out || spawning;
  c.row.hidden = spawning || out;
  c.btns.hidden = c.fast.hidden = spawning;
  c.ink.hidden = !spawning || !p.choose;
  c.list.hidden = c.head.hidden = c.go.hidden = out;
  $("leaders").hidden = spawning;
  if (spawning && p.land[s]) { // inchlive hook: in a game for two, you have started and your friend is still choosing
    state("Your friend is choosing where to start. The clock starts when you both have.");
    c.heading.textContent = ""; c.list.hidden = c.head.hidden = c.go.hidden = c.ink.hidden = true; c.due.hidden = c.runs.hidden = c.me.hidden = true;
    c.querySelector(".live-info").textContent = "";
    mark(T);
    return;
  }
  if (spawning) {
    const list = startsOf(T), pick = ink === "draw" ? p.ink[p.human] : ink;
    if (!list.some((x) => x.value === home)) home = list[0]?.value ?? "";
    state("Choose where to start: a place in the list, or empty land on the map.");
    c.heading.textContent = "";
    c.querySelector(".live-info").textContent = `${p.people ? `Your friend and ${p.troops.length - 2} other nations` : `${p.troops.length - 1} other nations`} are on the map. Choose a place with room to grow.${p.dries ? " Your first cell is your capital, and the page dries from its edges inward." : ""}`;
    c.ink.textContent = p.choose ? `Your ink: ${ink === "draw" ? `drawn for you, ${INKS[pick].name}` : INKS[pick].name}. Change` : "";
    c.head.textContent = "Where to start";
    rows(c.list, list.map((x) => ({ value: x.value, label: x.where, note: x.note })), home, (v) => { home = v; T.refresh(); });
    const at = list.find((x) => x.value === home);
    c.go.textContent = at ? `Start in ${at.where}` : "Start";
    c.go.onclick = () => { if (T.ready() && at) spawn(T, at.at); };
    c.due.hidden = true;
    c.runs.hidden = true; c.me.hidden = true;
    runRows.clear(); c.runs.replaceChildren(); foes = new Set(); told.clear(); struck = 0;
    if (asked !== T.match && !p.choose) { asked = T.match; sent = [false, false]; tipEnds = 0; }
    guide(T, p, b);
    band = 0;
    rowsOf.clear(); $("leaders").replaceChildren(); // no standings left over from the last game
    if (p.choose && asked !== T.match && !T.demo) { asked = T.match; sent = [false, false]; tipEnds = 0; inkSheet(T); }
    const was = document.activeElement; // the game has just begun: the keyboard starts at the places to start
    if (!$("sheet").open && (!was || was === document.body || !was.getClientRects().length)) c.list.querySelector("[aria-checked=true]")?.focus({ preventScroll: true });
    mark(T);
    return;
  }
  due(T, p);
  const mine = inkOf(p, s), top = maxOf(p, s), have = p.troops[s];
  // the shell blanks the spoken status while a move plays out, so in play it holds only what lasts: that you are out
  state(out ? "You are out. Watching to the end" : "");
  const hold = waiting(T), shared = !!p.people && !!net && !net.alone, still = shared ? net.paused() : paused; // inchlive hook: a shared pause
  c.fast.hidden = c.fast.hidden || shared; // both browsers run at one speed
  c.heading.textContent = out ? "" : hold ? "The clock waits for your first order. Choose where to send a share of your strength." : shared ? (still ? "Paused for you both. You can still send orders." : "Choose where to send a share of your strength.") : paused ? `${held === T.match ? "Paused where you left it. Resume, or press Space, to go on." : "Paused."} You can still send orders.` : "Choose where to send a share of your strength.";
  c.pause.textContent = hold ? "Start the clock" : still ? "Resume" : "Pause";
  // on a phone the map comes in close on your land once you have it (and on a game brought back), not the whole world in a strip
  if (framed !== T.match && !T.demo && p.land[s]) { framed = T.match; if (innerWidth <= 820) requestAnimationFrame(() => { if (T.match?.position.live) frame(T, pos(T), b, centre(pos(T), b), 13); }); }
  const page = p.dries ? (p.tick < DRIES.from ? `The page dries from ${clockOf(DRIES.from)}. ` : `${Math.round((100 * wetOf(p)) / p.total)}% of the page is still wet. `) : "";
  const strength = have > top ? `Strength ${have}, over your limit of ${top}, so it falls back slowly.` : `Strength ${have} of a limit of ${top}, +${gainOf(p, s)} every half second.`;
  c.querySelector(".live-info").textContent = out ? "The other nations play on to the end. Speed up the clock, or start again from the menu." : `${strength} ${page}${mine.name ? `${mine.name}: ${mine.line}` : ""}${p.boats ? ` Your boats cross ${rangeOf(p, b, s)} cells of sea.` : ""}`;
  if (!out) {
    const list = targetsOf(p, b);
    if (!list.some((x) => x.value === aim)) aim = list[0]?.value ?? "";
    c.head.textContent = "Where to send";
    rows(c.list, list, aim, (v) => { aim = v; T.refresh(); });
    const t = list.find((x) => x.value === aim), amount = Math.floor((have * pct) / 100);
    c.go.textContent = !t ? "Nothing in reach" : `Send ${pct}% (${amount}) ${t.boat ? "by boat " : ""}${t.to === NONE ? "into empty land" : `to ${p.names[t.to]}`}`;
    c.go.onclick = () => { const now = targetsOf(pos(T), liveBoardFor(pos(T))).find((x) => x.value === aim); if (T.ready() && now) send(T, now); };
    truce(T, p, b, t);
    // said once each time your land passes a quarter, a half, three quarters or nine tenths of the goal, and when it falls back
    const r = p.land[s] / goalOf(p);
    if (band < STEPS.length && r >= STEPS[band][0]) { while (band < STEPS.length && r >= STEPS[band][0]) band++; speak(`${STEPS[band - 1][1]}: land ${p.land[s]}, goal ${goalOf(p)}.`); }
    else if (band > 0 && r < STEPS[band - 1][0] - 0.05) { band--; speak(`Your land falls back: ${p.land[s]}, goal ${goalOf(p)}.`); }
  }
  c.me.hidden = out;
  if (out) c.pact.hidden = c.pactSay.hidden = true;
  under(T, p);
  guide(T, p, b);
  leaders(p);
  mark(T);
  if (!clock) start(T);
}

export const ending = (T) => {
  const p = pos(T), w = T.match.result.winners[0];
  return w === p.human ? "The map is yours." : p.alive[p.human] ? `${p.names[w]} wins.` : `You were out. ${p.names[w]} wins.`;
};
/** The end screen's words: who won and how, then the leading nations' inks and marks. */
export function summary(T) {
  const p = pos(T), r = T.match.result, m = Math.round(p.tick / 120), who = (s) => [inkOf(p, s).name, markOf(p, s).name].filter(Boolean).join(", ");
  queueMicrotask(() => figures(T)); // the end sheet is built around these words; the figures join it once it stands
  return `${p.names[r.winners[0]]} ${r.why}, after ${m < 1 ? "less than a minute" : `${m} ${m === 1 ? "minute" : "minutes"}`} of game time${who(r.winners[0]) ? `, with ${who(r.winners[0])}` : ""}.`;
}
/** After a quick win against gentle rivals (under three minutes of game time), the end screen suggests Normal, with a button that
 *  starts the same game against normal rivals. */
export function nudge(T) {
  const m = T.match, p = m.position;
  if (!p.live || p.people || T.demo || T.kinds[0] !== "you" || p.rivals !== "gentle" || !p.over || p.over.winners[0] !== p.human || p.tick >= QUICK) return null;
  const wrap = el("section", undefined, "stack"), go = button("Try Normal rivals", "quiet");
  go.onclick = () => { $("sheet").close(); T.begin(createMatch(inch, { seed: [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join(""), options: { ...m.options, rivals: "even" } }), [...T.kinds]); };
  wrap.append(el("p", `A win in ${clockOf(p.tick)}: gentle rivals may be too easy for you now. Normal rivals leave you alone for ${span(RIVALS.even.truce)}, then up to ${RIVALS.even.pile} attack you at once.`, "live-info"), go);
  return wrap;
}
const QUICK = 360; // three minutes, in ticks
/** The figures on the end table: strength, and each nation's ink and mark where the game has them. */
export const stats = (p, s) => (p.over ? [["Strength", p.troops[s]], ...(p.ink.some((k) => k >= 0) ? [["Ink", inkOf(p, s).name || "none"]] : []), ...(p.ages ? [["Mark", markOf(p, s).name || "none"]] : [])] : [["Strength", p.troops[s]], ["Nations left", p.alive.filter(Boolean).length]]);
/** The end, in figures: the game is played again from its seed and moves, a little at a time, and what you did is counted on the way:
 *  where you finished, your best share and when, what you sent, what you took and lost, whom you finished. Then every leading
 *  nation's share of the land over the game, each line named at its end. */
function figures(T) {
  const m = T.match, p = view(m.position), h = p.human, host = $("sheet-body").firstElementChild, old = $("chart");
  if (!host || !p.over || !old) return;
  const wrap = el("section", undefined, "live-end"), wait = el("p", "Reading the game back for your figures.", "live-info"), again = createMatch(inch, { seed: m.seed, options: m.options });
  const st = { orders: 0, sent: 0, back: 0, took: 0, lost: 0, best: 0, bestAt: 0, top: 0, ended: [], outAt: -1, series: [] }, every = Math.max(2, Math.ceil(p.tick / 240));
  let k = 0, last = -every;
  old.hidden = true;
  wrap.append(el("h3", "Your game"), wait);
  old.before(wrap);
  const step = () => {
    if (T.match !== m || !wrap.isConnected) return undefined; // another game has begun
    for (const t0 = performance.now(); k < m.list.length && performance.now() - t0 < 10;) {
      const mv = m.list[k++], q = again.position, events = again.play(mv), r = again.position;
      if (mv.do === "attack" || mv.do === "boat") { st.orders++; st.sent += Math.max(0, q.troops[h] - r.troops[h]); }
      else if (mv.do === "recall") st.back++;
      const d = r.land[h] - q.land[h], share = Math.round((100 * r.land[h]) / wetOf(r));
      if (d > 0) st.took += d; else st.lost -= d;
      if (share > st.best) { st.best = share; st.bestAt = r.tick; }
      st.top = Math.max(st.top, r.troops[h]);
      for (const e of events) if (e.kind === "out") { if (e.seat === h) st.outAt = r.tick; else if (q.attacks.some((a) => a.by === h && a.to === e.seat)) st.ended.push(e.seat); }
      if (r.tick - last >= every || r.over) { last = r.tick; st.series.push([r.tick, wetOf(r), [...r.land], goalOf(r)]); }
    }
    if (k < m.list.length) return void setTimeout(step);
    const place = 1 + p.land.filter((n) => n > p.land[h]).length, dl = el("dl"), row = (a, b) => { const d = el("div"); d.append(el("dt", a), el("dd", String(b))); dl.append(d); };
    row("Finished", st.outAt >= 0 ? `Out at ${clockOf(st.outAt)}` : `${place}${["th", "st", "nd", "rd"][place % 10 < 4 && (place % 100 < 11 || place % 100 > 13) ? place % 10 : 0]} of ${p.troops.length}`);
    row("Best share", `${st.best}% at ${clockOf(st.bestAt)}`);
    row("Orders", st.back ? `${st.orders}, ${st.back} called back` : st.orders);
    row("Strength sent", st.sent);
    row("Most strength held", st.top);
    row("Land gained and lost", `${st.took} and ${st.lost}`);
    row("Nations you finished", st.ended.length ? `${st.ended.length}: ${st.ended.slice(0, 3).map((s) => p.names[s]).join(", ")}${st.ended.length > 3 ? " and more" : ""}` : "None");
    wait.replaceWith(dl, shares(p, st));
    return undefined;
  };
  setTimeout(step);
}
/** Share of the land over the game: a line for you and for the four largest of the others at their best, each named at its end. */
function shares(p, st) {
  const c = el("canvas"), W = 880, H = 300, L = 44, Rm = 150, T0 = 14, B = 30, x = c.getContext("2d"), cs = colours(p), h = p.human, s = st.series, ink = "#e8e0cc";
  c.id = "live-chart"; c.width = W; c.height = H;
  const best = p.troops.map((_, n) => Math.max(...s.map(([, wet, land]) => land[n] / wet))), who = [h, ...best.map((v, n) => [v, n]).filter(([, n]) => n !== h).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, n]) => n)];
  const goal = Math.max(...s.map(([, wet, , g]) => g / wet)), top = Math.min(1, Math.max(0.2, ...who.map((n) => best[n]), goal) * 1.05), end = s[s.length - 1][0] || 1;
  const px = (t) => L + ((W - L - Rm) * t) / end, py = (v) => H - B - ((H - B - T0) * v) / top;
  x.font = "16px system-ui, sans-serif"; x.textBaseline = "middle"; x.lineJoin = "round";
  x.globalAlpha = 0.25; x.strokeStyle = ink; x.lineWidth = 1;
  for (let v = 0; v <= top; v += top > 0.5 ? 0.2 : 0.1) { x.beginPath(); x.moveTo(L, py(v)); x.lineTo(W - Rm, py(v)); x.stroke(); }
  x.globalAlpha = 0.8; x.fillStyle = ink; x.textAlign = "right";
  for (let v = 0; v <= top; v += top > 0.5 ? 0.2 : 0.1) x.fillText(`${Math.round(v * 100)}%`, L - 6, py(v));
  x.textAlign = "center";
  const mins = Math.max(1, Math.ceil(end / 120 / 6));
  for (let t = 0; t <= end; t += mins * 120) x.fillText(`${t / 120}:00`, px(t), H - B / 2);
  // the goal, as a broken line that follows its easing and the drying page
  x.globalAlpha = 0.9; x.setLineDash([6, 5]); x.strokeStyle = "#d8ae3c"; x.lineWidth = 2; x.beginPath();
  s.forEach(([t, wet, , g], k) => (k ? x.lineTo(px(t), py(g / wet)) : x.moveTo(px(t), py(g / wet)))); x.stroke(); x.setLineDash([]);
  x.globalAlpha = 1;
  const ends = [];
  for (const n of [...who].reverse()) { // yours last, so it lies on top
    // a dark line under each, so pale inks show on the panel
    for (const [colour, more] of [["rgba(13, 22, 35, .7)", 2], [`rgb(${cs[n]})`, 0]]) { x.beginPath(); x.strokeStyle = colour; x.lineWidth = (n === h ? 5 : 2.5) + more; s.forEach(([t, wet, land], k) => (k ? x.lineTo(px(t), py(land[n] / wet)) : x.moveTo(px(t), py(land[n] / wet)))); x.stroke(); }
    const [, wet, land] = s[s.length - 1];
    ends.push({ n, y: py(land[n] / wet), v: Math.round((100 * land[n]) / wet) });
  }
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 18); // names never sit on each other
  ends[ends.length - 1].y = Math.min(ends[ends.length - 1].y, H - B);
  for (let k = ends.length - 2; k >= 0; k--) ends[k].y = Math.min(ends[k].y, ends[k + 1].y - 18); // and the lowest stays on the chart
  x.textAlign = "left";
  for (const e of ends) { x.fillStyle = `rgb(${cs[e.n]})`; x.beginPath(); x.arc(W - Rm + 12, e.y, 5, 0, 7); x.fill(); x.strokeStyle = ink; x.lineWidth = 1; x.stroke(); x.fillStyle = ink; x.font = `${e.n === h ? "700 " : ""}16px system-ui, sans-serif`; x.fillText(`${p.names[e.n]} ${e.v}%`, W - Rm + 22, e.y); }
  x.fillStyle = "#d8ae3c"; x.font = "14px system-ui, sans-serif"; x.fillText("goal", L + 6, py(s[0][3] / s[0][1]) + 12);
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", `Share of the land over the game. Your best was ${st.best}% at ${clockOf(st.bestAt)}. At the end: ${ends.map((e) => `${p.names[e.n]} ${e.v}%`).join(", ")}.`);
  return c;
}
/** "Holm attacks you.", once in half a minute for each attacker, so the log names who comes at you without filling up. */
function attacked(e, p) {
  if (e.to !== p.human) return "";
  const key = e.kind === "soaked" ? `s${e.by}` : e.by, last = told.get(key);
  if (last !== undefined && last <= p.tick && p.tick - last < 60) return "";
  told.set(key, p.tick);
  return e.kind === "soaked" ? `${p.names[e.by]} has your land surrounded: it soaks in a ring every half second.` : `${p.names[e.by]} attacks you.`;
}
/** inchlive hook: in a game for two, the other person's own doings are told by name, or not at all. */
const OWN = new Set(["pact", "pactend", "recall", "city", "boat", "mark", "card"]);
export const lineOf = (e, p) => (p?.people && e.seat !== undefined && e.seat !== p.human && OWN.has(e.kind) ? (e.kind === "pact" ? `${p.names[e.seat]} keeps a truce with ${p.names[e.to]}.` : "") : oneLine(e, p));
const oneLine = (e, p) => (e.kind === "dries" ? "The page begins to dry from its edges." : e.kind === "capital" ? (e.seat === p.human ? "Your capital is lost: it moves to your largest land, and a quarter of your strength goes with it." : "") : e.kind === "out" ? (e.seat === p.human ? (e.by >= 0 ? `You are out: ${p.names[e.by]} took your last land.` : "You are out.") : e.by === p.human ? `You finish ${p.names[e.seat]}.` : `${p.names[e.seat]} is gone.`) : e.kind === "attacked" || e.kind === "soaked" ? attacked(e, p) : e.kind === "pact" ? `You and ${p.names[e.to]} keep a truce for ${span(PACT.long)}: neither of you can attack the other.` : e.kind === "pactend" ? `Your truce with ${p.names[e.to]} is over.` : e.kind === "recall" ? `You call your attack back: ${e.back} come home, ${e.lost} are lost.` : e.kind === "city" ? "You build a city." : e.kind === "boat" ? (e.landed ? "Your boats land." : `Your boats are thrown back. They lose ${e.lost ?? 0}; the rest come home.`) : e.kind === "age" ? (e.age === 2 ? "Age II, Ink: choose your mark." : "Age III, Seal: your card is ready, and the goal begins to ease.") : e.kind === "mark" || e.kind === "card" ? `You take ${[...MARKS, ...CARDS].find((k) => k.id === e[e.kind]).name}.` : "");
/** When you lose your last cell the game goes on without you: watch it to the end, or start again. The open sheet holds the clock.
 *  When a game you played ends, the ledger notes it. */
export function seen(T, events) {
  const p = pos(T);
  if (p.over && events.some((e) => e.kind === "end") && !T.demo && T.kinds[0] === "you" && !p.dries && !p.people) note({ seed: T.match.seed, map: p.map, rivals: p.rivals, ticks: p.tick, ink: p.ink[0], mark: p.mark[0], nations: p.troops.length, won: p.over.winners[0] === p.human }) && (me = null);
  // a new attack on you, or land of yours that has begun to soak away (said once in half a minute)
  const hit = events.find((e) => e.to === p.human && (e.kind === "attacked" || (e.kind === "soaked" && told.get(`s${e.by}`) === p.tick)));
  if (hit && p.alive[p.human] && !T.demo) strike(T, hit.by);
  const end = events.find((e) => e.kind === "out" && e.seat === p.human);
  if (p.over || !end) return;
  const box = el("div", undefined, "stack"), again = button("Restart", "main");
  again.onclick = () => { $("sheet").close(); $("again").click(); };
  box.append(el("p", `${end.by >= 0 ? `${p.names[end.by]} took your last land` : "Your last land has fallen"} at ${clockOf(p.tick)}. Watch the other nations play on to the end, or start a new game.`), again);
  sheet("You are out", box, "Watch");
}
/** Out of real time (a new game, or the duel): the turn game's controls back, and this game's choices forgotten. */
/** A real-time game brought back (Continue, or a saved file) opens paused: a new game's list of moves is empty. */
export const hold = (T) => { const m = T.match; if (m?.position.live && m.position.phase === "play" && !m.position.over && m.list.length) { paused = true; held = m; } };
/** The Continue button's words for a kept real-time game: where it stands, and that it opens paused. */
export const continueText = (p) => (p.live && p.phase === "play" && !p.over ? `Continue, paused at ${time(p)}` : null);
export const leave = () => {
  if (box) { box.hidden = true; box.list.dataset.keys = ""; box.pause.textContent = "Pause"; }
  for (const id of ["targets", "shares"]) $(id).hidden = false;
  $("pour").parentElement.hidden = false;
  paused = false; held = null; home = aim = drawn = ""; band = 0; rowsOf.clear(); $("leaders")?.replaceChildren();
  runRows.clear(); box?.runs.replaceChildren(); foes = new Set(); told.clear(); struck = 0; found = 0; tip = 0; if (box) box.guide.hidden = true;
};
export const liveGoal = goalOf, liveLand = wetOf;
/** A stretch of the clock in words: "a minute", "30 seconds", "2 minutes". */
const span = (t) => (t === 120 ? "a minute" : t % 120 ? `${t / 2} seconds` : `${t / 120} minutes`);
const clockOf = (tick) => `${Math.floor(tick / 120)}:${String(Math.floor((tick / 2) % 60)).padStart(2, "0")}`;
/** The time line: the age, then game time; in The Ink Dries, whether the page is drying. */
export const time = (p) => `${p.ages ? `Age ${"I".repeat(ageOf(p))}, ` : ""}${clockOf(p.tick)} of game time${p.dries && p.tick > DRIES.from ? ", drying" : ""}`;
/** The ledger, from the menu. */
const show = () => { me = null; sheet("Your record", ledger(show)); };
export const record = { label: "Your record", body: () => ledger(show) };
/** Space pauses whatever has the keyboard, the Send button included (which Space would otherwise press): it is caught before
 *  anything else sees it. Not in a text field, not while a sheet is open, not with single-key shortcuts turned off in Settings. */
addEventListener("keydown", (e) => {
  const T = T0, p = T?.match?.position;
  if (e.key !== " " || !box || box.hidden || !p?.live || p.phase !== "play" || T.demo || $("sheet")?.open || e.ctrlKey || e.metaKey || e.altKey || settings.keys === "off") return;
  if (e.target.closest?.("input:not([type=range]), select, textarea, [contenteditable]")) return;
  e.preventDefault(); e.stopPropagation();
  if (!e.repeat) box.pause.click();
}, true);
/** Keys in real time: 1 to 0 choose the share, S says where you stand, F finds your land. Space is above. */
export function key(T, k) {
  if (k === "f") { find(T); return true; }
  if (k === "s") {
    const p = pos(T), s = p.human, going = p.attacks.filter((a) => a.by === s);
    if (p.phase !== "play") return false;
    toast(`Strength ${p.troops[s]}, limit ${maxOf(p, s)}. Land ${p.land[s]}, goal ${goalOf(p)}. ${going.length ? `${word(going.length, "attack", "attacks")} under way, ${going.reduce((n, a) => n + a.left, 0)} strength in them.` : "No attack under way."}`);
    return true;
  }
  const n = "1234567890".indexOf(k);
  if (n < 0) return false;
  pct = PCTS[n];
  if (box) { box.slider.value = String(n); box.slider.oninput(); }
  return true;
}

/** How the rivals play, in words, read from the rules' own table. "even" is Normal's saved name. */
const rivalsLine = (p) => {
  const k = p ? p.rivals : "gentle", t = RIVALS[k] || RIVALS.even, secs = (n) => (n % 120 ? `${n / 2} seconds` : `${n / 120} ${n === 120 ? "minute" : "minutes"}`);
  return `Rivals are ${k === "even" ? "normal" : k}: they grow ${t.grow === 10 ? "as fast as you" : `${["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"][t.grow] || t.grow} tenths as fast as you`}, leave you alone for the first ${secs(t.truce)} of the clock, and then ${t.pile === 1 ? "only one attacks you at a time" : `no more than ${t.pile} attack you at once`}.`;
};
const TRUCE = `Truce: choose a neighbour in the list and offer it a truce. It holds for ${span(PACT.long)}, kept by the rules: neither of you can attack the other, and attacks between you come home whole. One truce at a time, and ${span(PACT.gap)} after one ends before the next. A neighbour holding more than ${PACT.most === 2 ? "twice" : `${PACT.most} times`} your strength will not take one.`;
const KEYS = "Without a mouse: the move panel lists good places to start, then the empty land, neighbours and coasts you can reach. Choose one with the arrow keys and press the button under the share. Under the button, the attacks under way: call yours back, or answer one against you. Keys: 1 to 0 choose the share, Space pauses, S tells your strength, land and goal, F finds your land.";
/** The rules sheet for The Ink Dries, read from the same table as the rules. */
const driesRules = (p) => [
  "Capo: The Ink Dries. A short real-time game for 12 nations on a map drawn for the game. The clock starts with your first order, then runs on its own; pause it, or run it slower or faster, with the buttons.",
  "Choose a place to start in the list, or tap empty land. That first cell is your capital, drawn as a tower with your strength on it. Strength grows every half second: more for more land, a little more for saving, up to a limit set by your land.",
  "Choose a share with the slider, then a neighbour or empty land beside yours, in the list or on the map. That share of your strength goes, and the border creeps forward until it is spent.",
  "Call an attack back from the list under the button: a quarter of what is left of it is lost, and the rest comes home.",
  TRUCE,
  `Each cell costs 2, 3 more on hills, and more where the owner holds much strength on little land. A capital and the cells around it cost ${DRIES.wall} times as much.`,
  `Land cut off from your capital fades to empty after ${DRIES.fade / 2} seconds unless you join it up again.${!p || p.boats ? " Where boats sail, land with a coast stays yours while your capital's land has a coast too." : ""}`,
  "If your capital is taken, or dries, it moves to your largest piece of land and you lose a quarter of your strength.",
  `${PLACES[0].name}s on the map give +${PLACES[0].grow} growth to whoever holds them.`,
  `From ${clockOf(DRIES.from)} the page dries from its edges inward, the land farthest from the middle first, until a tenth is left. Dried land is lost to everyone and no longer counts.`,
  `Win by holding ${DRIES.goal}% of the land still wet, or by being the last one left. Your chip shows your land and the goal. At ${clockOf(DRIES.from + DRIES.span)} the biggest nation wins.`,
  rivalsLine(p),
  ...(!p || p.boats ? [`Boats: where the map has more than one landmass, choose a coast across the water${p ? `, up to ${rangeOf(p, liveBoardFor(p), p.human)} cells of sea or dried land away` : ""}. Landing costs double the cell.`] : []),
  KEYS,
];

/** The rules sheet for real time, read from the same table as the rules. With no game yet, Traditional's, or The Ink Dries' when asked. */
export function rules(p, dries = false) {
  if (p ? p.dries : dries) return driesRules(p);
  const limit = p ? p.limit : SAFE, ages = p ? p.ages : true, inks = p ? p.ink.some((k) => k >= 0) : true, places = p ? p.places.length > 0 : true, ease = p ? p.ease : true, at = agesOf(p || { map: "world" });
  return [
    p?.people ? "Live with a friend: you each play a nation and the bots play the rest, the same in both browsers. The clock starts when you have both chosen where to start, runs at one speed for you both, and either of you can pause it for both. An order reaches both maps in under a second." : "Real time: the clock starts with your first order, then runs on its own. Pause it (Space, or the button), or run it slower or faster, with the buttons.",
    `${inks ? "Choose an ink, or Draw for me, then choose" : "Choose"} a place to start in the list, or tap empty land. Your strength grows every half second: more for more land, a little more for saving, up to a limit set by your land.`,
    "Choose a share with the slider, then a neighbour or empty land beside yours, in the list or on the map. That share of your strength goes, and the border creeps forward until it is spent. An arrow on the map points at your biggest attack.",
    "Call an attack back from the list under the button: a quarter of what is left of it is lost, and the rest comes home. A Flood cannot be called back.",
    TRUCE,
    "Each cell costs 2, 3 more on hills, and more where the owner holds much strength on little land. Taking a cell costs its owner some strength too.",
    ...(inks ? ["Every nation has an ink with one rule. Choose a nation in the list to see its ink.", ...INKS.map((k) => `${k.name}: ${k.line}`)] : []),
    ...(places ? ["Places on the map help whoever holds them. Take the cell to take the place; tap one to read it.", ...PLACES.map((k) => `${k.name}: ${k.line}`)] : []),
    ...(ages ? [`Three ages. At ${clockOf(at[1])} choose a mark: ${MARKS.map((k) => `${k.name} (${k.line.toLowerCase().replace(/\.$/, "")})`).join(" or ")}. At ${clockOf(at[2])} you get one card to play when you like: ${CARDS.map((k) => `${k.name} (${k.line.toLowerCase().replace(/\.$/, "")})`).join(" or ")}. A choice waits in gold; the game never stops for it.`] : []),
    `Win by holding 80% of the land, or by being the last one left. Your chip shows your land and the goal.${ease ? ` From ${clockOf(at[2])} the goal eases a point every 30 seconds, down to 66%.` : ""}`,
    limit ? `If nobody has after ${Math.floor(limit / 120)} minutes${limit % 120 ? ` ${(limit % 120) / 2} seconds` : ""}, the biggest nation wins.` : "There is no time limit.",
    "Land wholly inside one nation, with no sea beside it, soaks into that nation a ring every half second. A landing on the ring breaks the circle.",
    "If you lose all your land you are out: watch the others play on to the end, or start again.",
    rivalsLine(p),
    ...(p?.building ? ["Cities: tap Build a city, then one of your cells. A city holds more and grows faster; each costs more than the last."] : []),
    ...(!p || p.boats ? [`Boats: choose a coast across the water, ${p ? `up to ${rangeOf(p, liveBoardFor(p), p.human)} cells of sea away` : "within the map's reach"}. Landing costs double the cell (Indigo: only the cell); boats that cannot pay it lose one cell's price, and the rest come home.`] : []),
    "Your record and titles are kept in this browser only, under Your record in the menu. Nothing there changes a game.",
    KEYS,
  ];
}
