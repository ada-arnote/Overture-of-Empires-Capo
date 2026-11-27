// SPDX-License-Identifier: AGPL-3.0-or-later
// The garden game on the table (early): choose a plant from your pouch or one on the bed, then where it goes.
// Not on the front page or the list of games yet: reached only by its own address, play/garden.html.
import { KINDS, NONE, PLANTS, SWITCHES, boardOf, garden, linksOf, meterOf, nameOf, pouchOf, scoreOf, shiftsFrom } from "../src/games/garden/rules.js";
import { choose, thinking } from "../src/games/garden/bot.js";
import { $, NAMES, createTable, el, radio, toast } from "./table.js";
import { gardenBoard, plantMark } from "./gardenboard.js";

let source = null, where = null; // source: "k2" a kind from the pouch, "c17" a plant on the bed; where: the aimed cell
const legal = (T) => (T.ready() ? T.match.legal() : []);
const from = (m) => (m.do === "sow" ? `k${m.kind}` : m.do === "shift" ? `c${m.from}` : m.do);
const options = (T) => legal(T).filter((m) => from(m) === source);
const verb = (p, m) => (m.do === "sow" ? `Sow ${PLANTS[m.kind]} at` : p.owner[m.to] !== NONE ? `${PLANTS[p.kind[m.from]]} overgrows` : `Shift ${PLANTS[p.kind[m.from]]} to`);
const next = (k, n) => PLANTS[(k + n + KINDS) % KINDS];
/** One kind's place on the wheel, in a sentence. */
const wheel = (k) => `${PLANTS[k]} links with ${next(k, 1)} and ${next(k, -1)}, overgrows ${next(k, 2)}, and is overgrown by ${next(k, -2)}.`;
/** A plant on the bed in words: whose, what, and where. */
const whatAt = (p, i) => (p.owner[i] === NONE ? (boardOf(p).pond[i] ? "Pond" : "Empty") : `${NAMES[p.owner[i]]} ${PLANTS[p.kind[i]]}`);

function tap(T, i) {
  if (!T.ready()) return;
  const p = T.match.position, all = legal(T), go = source && options(T).find((m) => m.to === i);
  if (go) return T.play(go);
  if (p.owner[i] === p.seat && all.some((m) => from(m) === `c${i}`)) { source = source === `c${i}` ? null : `c${i}`; where = null; return T.refresh(); }
  if (p.owner[i] === p.seat) return toast(p.free ? "This is the free sow: choose a plant from your pouch." : `That ${PLANTS[p.kind[i]]} has nowhere to shift.`);
  if (p.owner[i] !== NONE) return toast(`${NAMES[p.owner[i]]}'s ${PLANTS[p.kind[i]]}. ${next(p.kind[i], -2)} overgrows it.`);
  if (boardOf(p).pond[i]) return undefined;
  return toast(source?.[0] === "c" ? "A plant shifts in a straight line through empty cells." : p.rule.sowing === "rim" ? "Sow on an empty cell of the rim." : "Sow on an empty cell of your home beds.");
}

/** The wheel as a small dial: the five kinds round it, the chosen one ringed, what it links with and what it overgrows marked. */
function dial(k) {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), seat = T.match.position.seat;
  svg.setAttribute("viewBox", "-60 -60 120 120"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("dial");
  const at = (n) => { const a = (Math.PI / 180) * (72 * n - 90); return [40 * Math.cos(a), 40 * Math.sin(a)]; };
  for (let n = 0; n < KINDS; n++) {
    const [x, y] = at(n), [x2, y2] = at(n + 1), line = document.createElementNS(ns, "line");
    const near = k >= 0 && (n === k || (n + 1) % KINDS === k);
    Object.entries({ x1: x, y1: y, x2, y2, stroke: near ? "currentColor" : "rgba(127,127,127,.5)", "stroke-width": near ? 3 : 1.5 }).forEach(([a, v]) => line.setAttribute(a, String(v)));
    svg.append(line);
  }
  if (k >= 0) {
    const [x, y] = at(k), [x2, y2] = at(k + 2), arrow = document.createElementNS(ns, "line");
    Object.entries({ x1: x * 0.8, y1: y * 0.8, x2: x2 * 0.7, y2: y2 * 0.7, stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "4 3" }).forEach(([a, v]) => arrow.setAttribute(a, String(v)));
    svg.append(arrow);
  }
  for (let n = 0; n < KINDS; n++) { const [x, y] = at(n), m = plantMark(n, seat, x, y, n === k ? 0.62 : 0.5); svg.append(m); }
  return svg;
}

const T = createTable({
  game: garden, key: "garden", title: "The Garden", won: "The garden is yours.", outOf: () => false, seats: [2], normal: 2,
  lengths: [[16, "Short"], [24, "Normal"], [32, "Long"]], quick: { style: "ours", rounds: 24 }, pace: () => 520, hard: true,
  unit: "Pond", landText: (c) => `${c}/6`, cellsOf: (p, s) => meterOf(p, s).parts, goalOf: () => 6, landOf: () => 12, placeOf: scoreOf, nameOf, choose, thinking,
  roundText: (p) => (p.over ? null : `Round ${p.round} of ${p.rounds}`),
  // our own game in its genre: its family is named in plain words only
  family: "The Garden is our own abstract game for two: plants on a wheel of kinds, linked along lines, and a ring round a pond. Early: a first playable version, so its rules, looks and name will change. The rules text, names and pictures are our own.",
  about: {
    classic: "Traditional: the genre as remembered.\nA wide bed of 91 cells round the pond. Sow from your three home beds, shift up to three cells, and close a ring of links round the pond; after 40 turns each, the most links wins. The second gardener may swap sides after the first sow.",
    ours: "Capo: our own quick game.\nA bed of 61 cells. Sow on any empty rim cell, shift up to two cells, and close a ring round the pond; at the turn limit, 1 point a link standing and 2 for each plant you overgrew. About ten to fifteen minutes.",
    custom: "Custom: your own rules.\nSet every rule yourself: the bed's size, where you sow, how far a plant shifts, the free sow, overgrowth, the turn limit, the count at the end, the swap, and whether a ring in one move is called out.",
  },
  switches: [
    { key: "size", label: "Bed", normal: SWITCHES.size.normal, values: [[4, "61 cells"], [5, "91 cells"]] },
    { key: "sowing", label: "Sow on", normal: SWITCHES.sowing.normal, values: [["beds", "Your home beds"], ["rim", "Any rim cell"]] },
    { key: "reach", label: "A shift goes", normal: SWITCHES.reach.normal, values: SWITCHES.reach.values.map((v) => [v, `Up to ${v} cells`]) },
    { key: "bonus", label: "Free sow on a new link", normal: true, values: [[true, "On"], [false, "Off"]] },
    { key: "overgrow", label: "An overgrown plant", normal: SWITCHES.overgrow.normal, values: [["pouch", "Goes back to its pouch"], ["removed", "Is gone"], ["off", "No overgrowing"]] },
    { key: "limit", label: "Turns each", normal: SWITCHES.limit.normal, values: SWITCHES.limit.values.map((v) => [v, String(v)]) },
    { key: "score", label: "At the limit", normal: SWITCHES.score.normal, values: [["links", "Most links"], ["points", "Points: links and overgrowths"]] },
    { key: "swap", label: "Swap after the first sow", normal: true, values: [[true, "On"], [false, "Off"]] },
    { key: "called", label: "Call a ring in one move", normal: true, values: [[true, "On"], [false, "Off"]] },
  ],
  stats: (p, s) => [["Links", linksOf(p, s).length], ["Pouch", pouchOf(p, s)], ...(p.rule.score === "points" ? [["Points", scoreOf(p, s)]] : [])],
  summary(T) {
    const r = T.match.result, p = T.match.position, why = String(r.why);
    const count = p.rule.score === "points" ? `Points ${scoreOf(p, 0)} to ${scoreOf(p, 1)}` : `Links ${linksOf(p, 0).length} to ${linksOf(p, 1).length}`;
    return `${r.winners.length > 1 ? `They ${why}` : `${why[0].toUpperCase()}${why.slice(1)}`}, in round ${Math.min(p.round, p.rounds)}. ${count}.`;
  },
  line(e, p) {
    const who = NAMES[e.seat], at = (i) => nameOf(p, i);
    if (e.kind === "sow") return `${who} sows ${PLANTS[e.plant]} at ${at(e.at)}.`;
    if (e.kind === "shift") return `${who} shifts ${PLANTS[e.plant]} from ${at(e.from)} to ${at(e.at)}.`;
    if (e.kind === "overgrow") return `${who}'s ${PLANTS[e.plant]} overgrows ${NAMES[e.was]}'s ${PLANTS[e.lost]}${e.back ? ", which goes back to its pouch" : ""}.`;
    if (e.kind === "link") return `${who} makes ${e.n === 1 ? "a new link" : `${e.n} new links`}.`;
    if (e.kind === "free") return `${who} earns a free sow.`;
    if (e.kind === "skip") return `${who} lets the free sow go.`;
    if (e.kind === "swap") return `${who} swaps sides and takes the first plant.`;
    if (e.kind === "pass") return `${who} cannot move and passes.`;
    if (e.kind === "threat") return `${who} can close the ring.`;
    if (e.kind === "ring") return `${who} closes a ring round the pond.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.kind === "sow" || e.kind === "shift" ? [e.at] : [])),
  board: (T, stage) => gardenBoard(T, stage, { tap: (i) => tap(T, i), can: (i) => T.match.position.owner[i] === T.match.turn || (!!source && options(T).some((m) => m.to === i)) }),
  panel(T) {
    const p = T.match.position, all = legal(T), s = p.seat, kinds = [...new Set(all.filter((m) => m.do === "sow").map((m) => m.kind))].sort((a, b) => a - b);
    const plants = [...new Set(all.filter((m) => m.do === "shift").map((m) => m.from))];
    const sources = [...kinds.map((k) => `k${k}`), ...plants.map((c) => `c${c}`)];
    if (source && !sources.includes(source)) source = null;
    if (!source && kinds.length && !p.offer) source = `k${kinds[0]}`; // a plant from the pouch is ready in hand
    const list = source ? options(T).sort((a, b) => (p.owner[b.to] !== NONE) - (p.owner[a.to] !== NONE) || (nameOf(p, a.to) < nameOf(p, b.to) ? -1 : 1)) : []; // overgrowths first, then by name
    if (!list.some((m) => m.to === where)) where = null;
    const threat = p.rule.called ? [s, 1 - s].filter((x) => p.warned[x]) : [];
    const say = p.free ? "A new link: sow one more plant free, or let it go." : p.offer ? `You may swap sides and take ${NAMES[1 - s]}'s first plant as your own, or play on.` : "Sow a plant from your pouch, or shift one of yours in a straight line.";
    $("status").textContent = `${T.solo() ? "Your turn" : `${NAMES[s]}'s turn`}. ${say}${threat.length ? ` ${threat.map((x) => (x === s ? "You can close the ring now!" : `${NAMES[x]} can close the ring next turn.`)).join(" ")}` : ""}`;
    $("sources").hidden = !sources.length;
    radio($("sources"), sources.map((v) => {
      const c = Number(v.slice(1));
      if (v[0] === "k") return { value: v, label: PLANTS[c], note: `${p.pouch[s][c]} in pouch` };
      return { value: v, label: `${PLANTS[p.kind[c]]} ${nameOf(p, c)}`, note: `${shiftsFrom(p, c).length} places` };
    }), source, (v) => { source = source === v ? null : v; where = null; T.refresh(); });
    $("wheres").hidden = !list.length;
    radio($("wheres"), list.map((m) => ({ value: m.to, label: `${nameOf(p, m.to)}`, note: p.owner[m.to] !== NONE ? `overgrow ${PLANTS[p.kind[m.to]]}` : m.do === "sow" ? "sow" : "shift" })), where, (v) => { where = v; T.refresh(); });
    const k = source?.[0] === "k" ? Number(source.slice(1)) : source ? p.kind[Number(source.slice(1))] : -1;
    $("wheel").replaceChildren(...(k >= 0 ? [dial(k), el("span", wheel(k))] : [dial(-1), el("span", "Choose a plant to see what it links with and what it overgrows.")]));
    const m = list.find((x) => x.to === where), only = all.length === 1 && all[0].do === "pass";
    $("do").disabled = !m && !only;
    $("do").textContent = only ? "Pass" : m ? `${verb(p, m)} ${nameOf(p, m.to)}` : list.length ? "Choose where, on the bed or in the list" : "Choose a plant";
    $("do").onclick = () => { if (only) return T.play({ do: "pass" }); const now = options(T).find((x) => x.to === where); if (now) T.play(now); };
    const extra = p.free ? { do: "skip" } : p.offer ? { do: "swap" } : null;
    $("end").hidden = !extra;
    $("end").textContent = p.free ? "Let the free sow go" : "Swap sides";
    $("end").onclick = () => { if (T.ready() && extra) T.play(extra); };
    T.board.light(list.filter((x) => p.owner[x.to] !== NONE).map((x) => x.to), { ring: source?.[0] === "c" ? Number(source.slice(1)) : -1, aim: where ?? -1, dots: list.filter((x) => p.owner[x.to] === NONE).map((x) => x.to) });
  },
  listing: (T) => { const p = T.match.position; return { head: ["Cell", "What grows there"], rows: boardOf(p).cells.map((_, i) => i).filter((i) => p.owner[i] !== NONE).map((i) => [nameOf(p, i), whatAt(p, i)]) }; },
  changed: () => { where = null; source = null; },
  keys(T, k, e) {
    if (k === "e" && !$("end").hidden) $("end").click();
    else if (k === "escape") { source = null; where = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  rules: (classic, p) => [
    "Two gardeners share a bed of hex cells round a pond. Nothing grows in the pond, and no line crosses it.",
    `Each gardener has a pouch of ${KINDS * 3} plants: three each of ${PLANTS.join(", ")}. The five kinds stand on one wheel, shown in the move panel.`,
    "On the wheel, a kind links with the kinds either side of it, overgrows the kind two steps on, and is overgrown by the kind two steps back. Reed links with Fern and Clover and overgrows Sedge.",
    `A turn is one of two things. Sow: put a plant from your pouch on an empty ${(p ? p.rule.sowing === "rim" : !classic) ? "cell of the rim" : "cell of your home beds (the edged cells at your three corners)"}. Or shift: move one of your plants in a straight line through empty cells, up to ${p ? p.rule.reach : classic ? 3 : 2} cells.`,
    p?.rule.overgrow === "off" ? "Overgrowing is off in this game: plants never take each other." : `A shift may end on a rival plant that yours overgrows. That plant ${p?.rule.overgrow === "removed" ? "is gone" : "goes back to its owner's pouch"}.`,
    "Two of your plants on one line, with nothing between them, of kinds that link, are linked: a line joins them on the bed.",
    p && !p.rule.bonus ? "There is no free sow in this game." : "A shift that makes a new link earns one free sow straight after. You may let it go.",
    "Win by closing a chain of your links right round the pond. The six stones in the pond show how far round each gardener's best chain reaches.",
    (p ? p.rule.score === "points" : !classic) ? `Otherwise, after ${p ? p.rule.limit : 24} turns each, count points: 1 for each of your links standing and 2 for each plant you overgrew. Equal points share the garden.` : `Otherwise, after ${p ? p.rule.limit : 40} turns each, the most links standing wins. Equal links share the garden.`,
    (p ? p.rule.swap : true) ? "After the first sow, the second gardener may swap sides: the bed turns a sixth so that plant stands on their side, and it becomes theirs." : "There is no swap in this game.",
    (p ? p.rule.called : true) ? "When a gardener could close the ring with one move, the game says so to both." : "Rings in one move are not called out in this game.",
    "The first gardener stands on round bases, the second on square ones, and each kind has its own outline, so colour is never the only sign.",
    "Keys: Tab and arrows choose, Enter acts, E swaps or lets a free sow go, Escape lets go, U takes back.",
    "Early: this is a first playable version. Its rules, looks and name will change.",
  ],
});
