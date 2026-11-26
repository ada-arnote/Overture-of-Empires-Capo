// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time, on the table: a clock, a share to send, a click on where it goes, and a leaderboard.
// Traditional adds an ink to choose at the start, places on the map, and a mark and a card that wait in gold.
import { AGES, CARDS, INKS, MARKS, NONE, PCTS, PLACES, SAFE, TICK_MS, ageOf, bordersOf, cardDue, cityPrice, gainOf, goalOf, inkOf, landingPrice, landings, markDue, markOf, maxOf, rangeOf } from "../src/games/inch/live.js";
import { liveBoardFor } from "../src/games/inch/rules.js";
import { $, RGB, el, radio, sheet, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";
import { areaPicture } from "../src/map/areas.js";
import { ledger, note, title } from "./ledger.js";

const SEA = [64, 104, 128], LAND = [[214, 204, 170], [206, 198, 162], [220, 210, 178]], HILL = [178, 160, 128], GLYPH = ["cairn", "port", "fort", "depot"];
let pct = 40, paused = false, speed = 1, clock = 0, building = false, box = null, ink = "draw", me = null;

/** Colours for every nation: yours first, the rest spread round the wheel. */
export function colours(p) {
  return p.troops.map((_, s) => {
    if (s === 0) return RGB[0];
    const h = (s * 137.508) % 360, f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.52 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  });
}
const button = (t, cls = "quiet") => { const b = el("button", t, cls); b.type = "button"; return b; };

function controls(T) {
  if (box) return box;
  box = el("div");
  box.id = "live";
  const row = el("label", undefined, "live-row"), slider = el("input"), out = el("output"), btns = el("div", undefined, "go"), pause = button("Pause"), fast = button("Speed 1x"), city = button("Build a city");
  Object.assign(slider, { type: "range", min: "0", max: String(PCTS.length - 1), step: "1", value: String(PCTS.indexOf(pct)) });
  slider.setAttribute("aria-label", "Share of your strength to send");
  slider.oninput = () => { pct = PCTS[Number(slider.value)]; out.textContent = `${pct}%`; };
  out.textContent = `${pct}%`;
  row.append(el("span", "Send"), slider, out);
  pause.onclick = () => { paused = !paused; pause.textContent = paused ? "Play" : "Pause"; T.refresh(); };
  fast.onclick = () => { speed = speed === 4 ? 1 : speed * 2; fast.textContent = `Speed ${speed}x`; };
  city.onclick = () => { building = !building; city.setAttribute("aria-pressed", String(building)); toast(building ? "Tap one of your cells to build a city there." : "Building stopped."); };
  btns.append(pause, fast, city);
  const board = el("ol"), inks = el("div", undefined, "pick small"), due = el("div", undefined, "go");
  board.id = "leaders";
  inks.setAttribute("role", "radiogroup");
  inks.setAttribute("aria-label", "Your ink");
  box.append(el("p", "", "live-info"), inks, due, row, btns, board);
  Object.assign(box, { city, slider, inks, due });
  $("choice").append(box);
  return box;
}

/** The clock: a tick every half second, faster when asked, never while a sheet is open or the game is paused. */
export function start(T) {
  clearInterval(clock);
  clock = setInterval(() => {
    const p = T.match?.position;
    if (!p?.live || T.demo || paused || p.phase !== "play" || document.querySelector("#sheet").open || !T.ready()) return;
    T.flow({ do: "tick", n: speed });
  }, TICK_MS);
}

const placeAt = (p, i) => p.places.find(([at]) => at === i);
export function tap(T, i) {
  if (!T.ready()) return undefined;
  const p = T.match.position, b = liveBoardFor(p), spot = placeAt(p, i);
  if (i < 0 || !b.land[i]) return toast("That is sea.");
  if (spot) toast(`${PLACES[spot[1]].name}: ${PLACES[spot[1]].line}`);
  if (p.phase === "spawn") {
    const want = p.choose ? INKS[ink === "draw" ? p.ink[0] : ink].id : undefined, m = T.match.legal().find((x) => x.at === i && x.ink === want);
    return m ? T.play(m) : spot || toast("Too close to someone or to a place. Choose empty land away from others.");
  }
  if (!p.alive[p.human]) return toast("You are out. Watch to the end, or start again from the menu.");
  const o = p.owner[i];
  if (o === p.human) {
    if (building && p.building) { const m = { do: "city", at: i }; if (p.troops[p.human] < cityPrice(p)) return toast(`A city costs ${cityPrice(p)} strength.`); building = false; box?.city.setAttribute("aria-pressed", "false"); return T.play(m); }
    return spot || toast("That land is yours. Tap a neighbour's, or empty land beside yours.");
  }
  if (bordersOf(p, b)[p.human].has(o)) return T.play({ do: "attack", to: o, pct });
  if (p.boats && landings(p, b).has(i)) {
    const need = landingPrice(p, b, i) + 1;
    if (Math.floor((p.troops[p.human] * pct) / 100) < need) return toast(`Landing there takes ${need} strength. Send a bigger share, or wait and grow.`);
    return T.play({ do: "boat", at: i, pct });
  }
  return toast(p.boats ? "Too far, even by boat." : "You can only attack land beside yours.");
}

export function board(T, stage) {
  const p = T.match.position, b = liveBoardFor(p), cs = colours(p), slot = new Map(b.dry.map((c, k) => [c, k])), of = b.cells.map((_, i) => (slot.has(i) ? slot.get(i) : -1));
  const picture = areaPicture(b.cells, of, b.dry, 9, true);
  document.body.classList.add("atlas");
  return hexBoard(T, stage, {
    picture, cells: [], rough: [], sea: [...b.dry.map(() => false), true], seats: cs, plain: true, fine: { cells: b.cells, of, mid: b.dry },
    ground: (k) => (k >= b.dry.length ? SEA : b.hill[b.dry[k]] ? HILL : LAND[k % 3]),
    owner: () => [...b.dry.map((c) => T.match.position.owner[c]), NONE],
    pieces: () => { const q = T.match.position, rgb = (at) => cs[q.owner[at]] || [180, 170, 150]; return [...q.cities.map((at) => ({ kind: "town", at: slot.get(at), rgb: rgb(at) })), ...q.places.map(([at, k]) => ({ kind: GLYPH[k], at: slot.get(at), rgb: rgb(at), good: 4 }))]; },
    names() { // a nation's name sits in the middle of its land, larger the more it holds
      const q = T.match.position, sum = q.troops.map(() => [0, 0, 0]);
      q.owner.forEach((o, i) => { if (o >= 0) { const [x, y] = picture.at[i]; sum[o][0] += x; sum[o][1] += y; sum[o][2]++; } });
      return sum.flatMap(([x, y, n], s) => (n > 25 ? [{ at: [x / n, y / n], text: q.names[s], sea: true }] : []));
    },
    tap: (k) => tap(T, k < b.dry.length ? b.dry[k] : -1),
    can: (k) => k < b.dry.length,
  });
}

/** A nation's card: its ink, its mark and its card, opened from the leaderboard. */
function card(p, s) {
  const u = el("ul"), i = inkOf(p, s), m = markOf(p, s);
  u.append(...[i.name && `${i.name}: ${i.line}`, m.name && `${m.name}: ${m.line}`, p.card[s] >= 0 && `Played ${CARDS[p.card[s]].name}.`, `${p.land[s]} cells, ${p.troops[s]} strength.`].filter(Boolean).map((t) => el("li", t)));
  sheet(s === p.human ? "You" : p.names[s], u);
}
/** Two gold buttons for a waiting mark or card. */
function due(T, p) {
  const d = box.due, list = markDue(p) ? MARKS.map((k) => ["mark", k]) : cardDue(p) ? CARDS.map((k) => ["card", k]) : [];
  d.hidden = !list.length;
  if (d.dataset.at === String(list.length && list[0][0])) return;
  d.dataset.at = String(list.length && list[0][0]);
  d.replaceChildren(...list.map(([kind, k]) => { const b = button(k.name, "main"), n = el("small", k.line); n.style.display = "block"; b.append(n); b.style.whiteSpace = "normal"; b.onclick = () => T.ready() && T.play({ do: kind, [kind]: k.id }); return b; }));
}

export function panel(T) {
  const p = T.match.position, s = p.human, c = controls(T);
  for (const id of ["targets", "shares", "pour", "wait"]) $(id).closest(".go, .pick")?.setAttribute("hidden", "");
  $("targets").hidden = $("shares").hidden = true;
  $("pour").parentElement.hidden = true;
  c.hidden = false;
  c.city.hidden = !p.building || !p.alive[s];
  c.querySelector(".live-row").hidden = !p.alive[s];
  c.inks.hidden = p.phase !== "spawn" || !p.choose;
  if (p.phase === "spawn") {
    const pick = ink === "draw" ? p.ink[0] : ink;
    $("status").textContent = p.choose ? "Choose your ink, then tap empty land to start" : "Tap empty land to start your nation";
    c.querySelector(".live-info").textContent = `${p.ink[0] >= 0 ? `${INKS[pick].name}: ${INKS[pick].line} ` : ""}${p.troops.length - 1} other nations are on the map. Choose a place with room to grow.`;
    if (p.choose) radio(c.inks, [{ value: "draw", label: "Draw for me" }, ...INKS.map((k, v) => ({ value: v, label: k.name, rgb: k.rgb }))], ink, (v) => { ink = v; T.refresh(); });
    c.due.hidden = true;
    return;
  }
  due(T, p);
  const going = p.attacks.filter((a) => a.by === s), out = !p.alive[s], mine = inkOf(p, s);
  $("status").textContent = out ? (paused ? "You are out. Paused" : "You are out. Watching") : paused ? "Paused" : `Strength ${p.troops[s]} of ${maxOf(p, s)}`;
  c.querySelector(".live-info").textContent = out ? "The other nations play on to the end. Speed up the clock, or start again from the menu." : `${mine.name ? `${mine.name}: ${mine.line} ` : ""}+${gainOf(p, s)} every half second. ${going.length ? `${going.length} ${going.length === 1 ? "attack" : "attacks"} under way, ${going.reduce((n, a) => n + a.left, 0)} strength in them.` : "Tap a neighbour to attack with the share below."}`;
  const top = p.land.map((n, k) => [n, k]).filter(([n]) => n).sort((x, y) => y[0] - x[0]).slice(0, 8), cs = colours(p);
  me ??= title();
  if (!top.some(([, k]) => k === s) && p.land[s]) top.push([p.land[s], s]);
  $("leaders").replaceChildren(...top.map(([n, k]) => {
    const li = el("li"), dot = el("i", undefined, "dot"), sw = el("i", undefined, "dot"), i = inkOf(p, k);
    dot.style.background = `rgb(${cs[k]})`;
    if (i.rgb) { sw.style.background = `rgb(${i.rgb})`; sw.title = i.name; }
    li.append(dot, el("b", k === s && me ? `${p.names[k]}, ${me}` : p.names[k]), ...(i.rgb ? [sw] : []), el("span", `${Math.round((100 * n) / p.total)}%`));
    li.onclick = () => card(p, k);
    li.style.cursor = "pointer";
    if (k === s) li.className = "me";
    return li;
  }));
  if (!clock) start(T);
}

export const ending = (T) => {
  const p = T.match.position, w = T.match.result.winners[0];
  return w === p.human ? "The map is yours." : p.alive[p.human] ? `${p.names[w]} wins.` : `You were out. ${p.names[w]} wins.`;
};
/** The end screen's words: who won and how, then the leading nations' inks and marks. */
export function summary(T) {
  const p = T.match.position, r = T.match.result, m = Math.round(p.tick / 120), who = (s) => [inkOf(p, s).name, markOf(p, s).name].filter(Boolean).join(", ");
  const lead = p.land.map((n, s) => [n, s]).filter(([n, s]) => n || s === p.human).sort((x, y) => y[0] - x[0]).slice(0, 5);
  if (!lead.some(([, s]) => s === p.human)) lead.push([0, p.human]);
  return `${p.names[r.winners[0]]} ${r.why}, after ${m < 1 ? "less than a minute" : `${m} ${m === 1 ? "minute" : "minutes"}`} of game time. ${lead.map(([, s]) => `${p.names[s]}${who(s) ? `: ${who(s)}` : ""}`).join("; ")}.`;
}
export const lineOf = (e, p) => (e.kind === "out" ? (e.seat === p.human ? "You are out." : `${p.names[e.seat]} is gone.`) : e.kind === "city" ? "You build a city." : e.kind === "boat" ? (e.landed ? "Your boats land." : `Your boats are thrown back. They lose ${e.lost ?? 0}; the rest come home.`) : e.kind === "age" ? (e.age === 2 ? "Age II, Ink: choose your mark." : "Age III, Seal: your card is ready, and the goal begins to ease.") : e.kind === "mark" || e.kind === "card" ? `You take ${[...MARKS, ...CARDS].find((k) => k.id === e[e.kind]).name}.` : "");
/** When you lose your last cell the game goes on without you: watch it to the end, or start again. The open sheet holds the clock.
 *  When a game you played ends, the ledger notes it. */
export function seen(T, events) {
  const p = T.match.position;
  if (p.over && events.some((e) => e.kind === "end") && !T.demo && T.kinds[0] === "you") note({ seed: T.match.seed, map: p.map, rivals: p.rivals, ticks: p.tick, ink: p.ink[0], mark: p.mark[0], nations: p.troops.length, won: p.over.winners[0] === p.human }) && (me = null);
  if (p.over || !events.some((e) => e.kind === "out" && e.seat === p.human)) return;
  const box = el("div", undefined, "stack"), again = button("Restart", "main");
  again.onclick = () => { $("sheet").close(); $("again").click(); };
  box.append(el("p", "Your last land has fallen. Watch the other nations play on to the end, or start a new game."), again);
  sheet("You are out", box, "Watch");
}
export const leave = () => { if (box) box.hidden = true; for (const id of ["targets", "shares"]) $(id).hidden = false; $("pour").parentElement.hidden = false; };
export const liveGoal = goalOf;
/** The time line: the age, then game time. */
export const time = (p) => `${p.ages ? `Age ${"I".repeat(ageOf(p))}, ` : ""}${Math.floor(p.tick / 120)}:${String(Math.floor((p.tick / 2) % 60)).padStart(2, "0")}`;
/** The ledger, from the menu. */
const show = () => { me = null; sheet("Your record", ledger(show)); };
export const record = { label: "Your record", body: () => ledger(show) };
/** Keys in real time: Space pauses, 1 to 0 choose the share. */
export function key(T, k) {
  if (k === " ") { box?.querySelector(".go button")?.click(); return true; }
  const n = "1234567890".indexOf(k);
  if (n < 0) return false;
  pct = PCTS[n];
  if (box) { box.slider.value = String(n); box.slider.oninput(); }
  return true;
}

/** The rules sheet for real time, read from the same table as the rules. With no game yet, Traditional's. */
export function rules(p) {
  const limit = p ? p.limit : SAFE, ages = p ? p.ages : true, inks = p ? p.ink.some((k) => k >= 0) : true, places = p ? p.places.length > 0 : true, ease = p ? p.ease : true;
  return [
    "Real time: the clock runs on its own. Pause it, or run it faster, with the buttons.",
    `${inks ? "Choose an ink, or Draw for me, then tap" : "Tap"} empty land to start your nation. Your strength grows every half second: more for more land, a little more for saving, up to a limit set by your land.`,
    "Choose a share with the slider, then tap a neighbour, or empty land beside yours. That share of your strength goes, and the border creeps forward until it is spent.",
    "Each cell costs 2, 3 more on hills, and more where the owner holds much strength on little land. Taking a cell costs its owner some strength too.",
    ...(inks ? ["Every nation has an ink with one rule. Tap a nation in the list to see its ink.", ...INKS.map((k) => `${k.name}: ${k.line}`)] : []),
    ...(places ? ["Places on the map help whoever holds them. Take the cell to take the place; tap one to read it.", ...PLACES.map((k) => `${k.name}: ${k.line}`)] : []),
    ...(ages ? [`Three ages. At 3:00 choose a mark: ${MARKS.map((k) => `${k.name} (${k.line.toLowerCase().replace(/\.$/, "")})`).join(" or ")}. At 7:00 you get one card to play when you like: ${CARDS.map((k) => `${k.name} (${k.line.toLowerCase().replace(/\.$/, "")})`).join(" or ")}. A choice waits in gold; the game never stops for it.`] : []),
    `Win by holding 80% of the land, or by being the last one left.${ease ? ` From ${AGES[2] / 120}:00 the goal eases a point every 30 seconds, down to 66%.` : ""}`,
    limit ? `If nobody has after ${Math.floor(limit / 120)} minutes${limit % 120 ? ` ${(limit % 120) / 2} seconds` : ""}, the biggest nation wins.` : "There is no time limit.",
    "Land wholly inside one nation, with no sea beside it, soaks into that nation a ring every half second. A landing on the ring breaks the circle.",
    "If you lose all your land you are out: watch the others play on to the end, or start again.",
    ...[({ gentle: "Rivals are gentle: they grow slower than you and leave you alone for the first three minutes.", even: "Rivals are even: they grow as fast as you.", hard: "Rivals are hard: they grow faster than you and attack sooner." })[p ? p.rivals : "gentle"]],
    ...(p?.building ? ["Cities: tap Build a city, then one of your cells. A city holds more and grows faster; each costs more than the last."] : []),
    ...(!p || p.boats ? [`Boats: tap a coast across the water, ${p ? `up to ${rangeOf(p, liveBoardFor(p), p.human)} cells of sea away` : "within the map's reach"}. Landing costs double the cell (Indigo: only the cell); boats that cannot pay it lose one cell's price, and the rest come home.`] : []),
    "Your record and titles are kept in this browser only, under Your record in the menu. Nothing there changes a game.",
    "Keys: 1 to 0 choose the share, Space pauses.",
  ];
}
