// SPDX-License-Identifier: AGPL-3.0-or-later
// The Island Fable on the table: choose a hall or a unit, then where it goes.
import { ACTIONS, NONE, UPKEEP, boardOf, cellsOf, fable, goalOf, landOf, nameOf, raiseOf, territories } from "../src/games/fable/rules.js";
import { choose, thinking } from "../src/games/fable/bot.js";
import { $, NAMES, PAPER, RGB, createTable, el, radio, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";

const SEA = [72, 110, 122], SHALLOW = [98, 138, 146], RANK = ["", "Scout", "Guard", "Captain"];
let source = null, where = null; // source: "h12" a hall, "u7" a unit

const legal = (T) => (T.ready() ? T.match.legal() : []);
const from = (m) => (m.do === "raise" ? `h${m.hall}` : m.do === "move" ? `u${m.from}` : "end");
const options = (T) => legal(T).filter((m) => from(m) === source);
const verb = (p, m) => (p.owner[m.to] !== p.seat ? (p.owner[m.to] === NONE ? "Claim" : "Take") : p.unit[m.to] ? "Join" : "Stand");
const weight = { Take: 0, Claim: 1, Join: 2, Stand: 3 };
const worth = (p, m) => weight[verb(p, m)] * 100 - (p.hall[m.to] ? 60 : 0) - (p.owner[m.to] !== NONE && p.owner[m.to] !== p.seat ? p.unit[m.to] * 10 : 0);

function tap(T, i) {
  if (!T.ready() || i >= boardOf(T.match.position).size) return;
  const p = T.match.position, go = source && options(T).find((m) => m.to === i);
  if (go && !(p.unit[i] && !p.moved[i] && source === `u${i}`)) return T.play(go);
  if (p.owner[i] === p.seat) {
    const all = legal(T), t = territories(p, p.seat).find((x) => x.cells.includes(i)), unit = `u${i}`, hall = t && `h${t.hall}`;
    if (p.unit[i] && source !== unit && all.some((m) => from(m) === unit)) source = unit;
    else if (hall && source !== hall && all.some((m) => from(m) === hall)) source = hall;
    else if (source) source = null;
    else return toast(p.unit[i] ? "That unit has moved this turn." : !t ? "A lone hex earns nothing and cannot act." : `Raising a unit costs ${raiseOf(p)}. This territory has ${t.purse}.`);
    where = null;
    return T.refresh();
  }
  if (p.water[i]) return undefined;
  return toast(source ? "It cannot reach there, or the land is too well guarded." : "Choose one of your halls or units first.");
}

createTable({
  game: fable, key: "fable", title: "The Island Fable", won: "The island is yours.", lengths: [[10, "Short"], [14, "Normal"], [18, "Long"]], pace: (p) => (p.classic ? 240 : 480),
  cellsOf, goalOf, landOf, choose, thinking,
  stats(p, s) { const t = territories(p, s); return [["Coin", t.reduce((n, x) => n + x.purse, 0)], ["A turn", `${t.reduce((n, x) => n + x.net, 0) >= 0 ? "+" : ""}${t.reduce((n, x) => n + x.net, 0)}`]]; },
  line(e, p) {
    const who = NAMES[e.seat], name = (i) => nameOf(p, i);
    if (e.kind === "take") return e.was === NONE ? `${who} claims ${name(e.at)}.` : `${who} takes ${name(e.at)} from ${NAMES[e.was]}${e.won ? `, with ${e.won} coin` : e.lost ? `, whose purse of ${e.lost} is lost` : ""}.`;
    if (e.kind === "split") return `${who}'s land is cut in two.`;
    if (e.kind === "starve") return `${who} cannot pay: ${e.cells.length === 1 ? "a unit disbands" : `${e.cells.length} units disband`}.`;
    if (e.kind === "stranded") return `${who}'s stranded ${e.cells.length === 1 ? "unit disbands" : "units disband"}.`;
    if (e.kind === "raise") return `${who} raises a scout at ${name(e.at)}.`;
    if (e.kind === "merge") return `${who} makes a ${RANK[e.rank].toLowerCase()} at ${name(e.at)}.`;
    if (e.kind === "done") return `${who} ends the turn.`;
    return "";
  },
  order: (events) => events.flatMap((e) => (e.kind === "take" ? [e.at] : [])),
  board(T, stage) {
    const p = T.match.position, land = boardOf(p).cells, ring = [], R = Math.max(...land.map(([q]) => q)) + 1;
    for (let q = -R; q <= R; q++) for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === R) ring.push([q, r]);
    const cells = [...land, ...ring], sea = cells.map((_, i) => i >= land.length || !!p.water[i]), none = cells.map(() => false);
    return hexBoard(T, stage, {
      cells, rough: none, sea, ground: (i) => (sea[i] ? (i < land.length ? SHALLOW : SEA) : PAPER[(i * 7 + (i >> 2)) % 3]),
      owner: () => [...T.match.position.owner, ...ring.map(() => NONE)],
      pieces() {
        const q = T.match.position, out = [];
        for (let s = 0; s < q.seats; s++) for (const t of territories(q, s)) out.push({ kind: "tower", at: t.hall, rgb: RGB[s], count: t.purse, now: s === T.match.turn, warn: t.purse + t.net < 0 });
        q.unit.forEach((rank, at) => { if (rank) out.push({ kind: "unit", at, rank, rgb: RGB[q.owner[at]], tired: !!q.moved[at] || q.owner[at] !== T.match.turn, now: !q.moved[at] && q.owner[at] === T.match.turn }); });
        return out;
      },
      tap: (i) => tap(T, i),
      can: (i) => i < land.length && (T.match.position.owner[i] === T.match.turn || (!!source && options(T).some((m) => m.to === i))),
    });
  },
  panel(T) {
    const p = T.match.position, all = legal(T), sources = [...new Set(all.map(from))].filter((s) => s !== "end");
    if (source && !sources.includes(source)) source = null;
    const list = source ? options(T).sort((a, b) => worth(p, a) - worth(p, b) || a.to - b.to) : [];
    if (!list.some((m) => m.to === where)) where = list[0]?.to ?? null;
    $("status").textContent = `${T.solo() ? "Your turn" : `${NAMES[p.seat]}'s turn`}${p.classic ? "" : `: ${p.left} of ${ACTIONS} ${p.left === 1 ? "action" : "actions"} left`}`;
    $("sources").hidden = !sources.length;
    const ts = territories(p, p.seat);
    radio($("sources"), sources.map((s) => {
      const c = Number(s.slice(1));
      if (s[0] === "h") { const t = ts.find((x) => x.hall === c); return { value: s, label: `Raise at ${nameOf(p, c)}`, note: `${t.purse} coin, ${t.net >= 0 ? "+" : ""}${t.net} a turn` }; }
      return { value: s, label: `${RANK[p.unit[c]]} ${nameOf(p, c)}`, note: `costs ${UPKEEP[p.unit[c]]} a turn` };
    }), source, (v) => { source = source === v ? null : v; where = null; T.refresh(); });
    $("wheres").hidden = !list.length;
    radio($("wheres"), list.map((m) => ({ value: m.to, label: `${verb(p, m)} ${nameOf(p, m.to)}`, rgb: p.owner[m.to] === NONE ? PAPER[0] : RGB[p.owner[m.to]] })), where, (v) => { where = v; T.refresh(); });
    const m = list.find((x) => x.to === where);
    $("do").disabled = !m;
    $("do").replaceChildren(m ? `${verb(p, m)} ${nameOf(p, m.to)}` : sources.length ? "Choose a hall or unit" : "Nothing to do");
    if (m && m.do === "raise") $("do").append(el("small", ` for ${raiseOf(p)}`));
    $("do").onclick = () => { const now = options(T).find((x) => x.to === where); if (now) T.play(now); };
    $("end").onclick = () => { if (T.ready()) T.play({ do: "end" }); };
    T.board.light(list.filter((x) => verb(p, x) === "Take" || verb(p, x) === "Claim").map((x) => x.to), { ring: source ? Number(source.slice(1)) : -1, aim: where ?? -1, dots: list.filter((x) => verb(p, x) === "Join" || verb(p, x) === "Stand").map((x) => x.to) });
  },
  changed: () => { where = null; },
  keys(T, k, e) {
    if (k === "e") T.play({ do: "end" });
    else if (k === "escape") { source = null; T.refresh(); } else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  about: { classic: "The whole island is dealt out. As many actions a turn as you like.", ours: "A small island to settle. Three actions a turn." },
  rules: (classic) => ["Land that is joined up is a territory. Each has one hall and its own purse, the number on the tower.", `Every turn a territory earns 1 coin a hex and pays its units: 1 for a scout, 3 for a guard, 6 for a captain. If it cannot pay, all its units disband.`, `${classic ? "Act as often as you like, then end your turn." : `You have ${ACTIONS} actions a turn.`} Tap a hall to raise a scout for ${raiseOf({ classic })}, or tap a unit to move it, then tap where.`, "A unit moves anywhere in its territory, or takes a hex beside it. Two units on one hex join: scout and scout make a guard, guard and scout a captain.", "A unit guards its own hex and every hex beside it. A hall guards like a scout. You need a higher rank to take guarded land.", "Cut a rival's land in two, and the part without the hall starts with no money. Take a hall, and its purse is lost.", "A number turning red means that territory cannot pay next turn.", "Reach the gold mark on the bar to win, or hold the most land after the last round.", ...(classic ? ["The island is dealt out evenly at the start. The last round is the 40th."] : []), "Keys: Tab and arrows choose, Enter acts, E ends the turn, Escape lets go, U takes back."],
});
