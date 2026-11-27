// SPDX-License-Identifier: AGPL-3.0-or-later
// Hedge and Highway (working name) on the table, in an early version: choose a place for the tile in hand, turn it,
// send a steward if you like, see what it would score, then lay it. Nothing is played until it is laid.
// Reached only at play/tile.html for now: it is not on the front page or in the list of games.
import { KINDS, ROTS } from "../src/games/tile/tiles.js";
import { NONE, SWITCHES, pointsOf, shape, tile, tilesLeft, worth } from "../src/games/tile/rules.js";
import { choose, thinking } from "../src/games/tile/bot.js";
import { $, NAMES, createTable, el, radio, toast } from "./table.js";
import { anchorOf, squareBoard, tilePicture, turned } from "./squareboard.js";

const FEATURE = { lane: "lane", town: "town", meadow: "meadow", well: "well" };
/** The placement being put together: which tile of the row, where, turned how, and a steward or none. */
let pick = 0, at = null, rot = 0, put = NONE;
const legal = (T) => (T.ready() ? T.match.legal() : []);
const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
/** A cell by where it lies from the first tile, which never moves: "2 north, 1 east". */
const placeName = ([x, y]) => (x || y ? [y < 0 ? `${-y} north` : y > 0 ? `${y} south` : "", x > 0 ? `${x} east` : x < 0 ? `${-x} west` : ""].filter(Boolean).join(", ") : "the first tile");
const kindName = (k) => KINDS[k].name;
/** Where on the tile a feature lies, in words, so two lanes on one tile can be told apart. */
function sideOf(k, r, f) {
  const [x, y] = turned(anchorOf(k, f), r), ns = y < 0.4 ? "north" : y > 0.6 ? "south" : "", ew = x < 0.4 ? "west" : x > 0.6 ? "east" : "";
  return ns || ew ? [ns, ew].filter(Boolean).join("-") : "middle";
}
const who = (seats) => seats.map((s) => NAMES[s]).join(" and ");

/** What a placement would score, said before it is laid: the same move played on a copy of the position. */
function previewOf(T, p, m) {
  const { position: q, events } = tile.apply(p, m), gains = q.score.map((v, s) => v - p.score[s]), me = p.seat;
  const scored = events.filter((e) => e.kind === "score").map((e) => `${who(e.seats)} ${e.points} for the ${e.done ? "finished " : ""}${e.what}`);
  if (!scored.length) return { text: "Scores nothing now.", gains };
  return { text: `Laying it here scores: ${scored.join("; ")}.${gains[me] ? "" : " Nothing for you."}`, gains };
}
/** The feature a steward would join, in a few words: how big, and how near finished. */
function featureNote(p, x, y, k, r, f) {
  const laid = [...p.laid, [x, y, k, r]], S = shape(laid), i = S.info.get(S.find((laid.length - 1) * 8 + f)), R = { ...S, men: new Map() };
  if (i.kind === "meadow") return `worth ${worth(R, i)} now`;
  if (i.kind === "well") return `${i.tiles} of 9 round it`;
  return i.open ? `${i.tiles} ${i.tiles === 1 ? "tile" : "tiles"}, ${i.open} open` : "finishes now";
}

function tap(T, x, y) {
  if (!T.ready()) return;
  const mine = legal(T).filter((m) => m.pick === pick && m.put === NONE && same(m.at, [x, y]));
  if (!mine.length) { if (!T.match.position.laid.some((t) => t[0] === x && t[1] === y)) toast(`${kindName(T.match.position.row[pick])} does not fit there.`); return; }
  if (same(at, [x, y])) spin(T); else { at = [x, y]; put = NONE; if (!mine.some((m) => m.rot === rot)) rot = mine[0].rot; T.refresh(); }
}
/** Turn the tile to its next way that fits; with no place chosen, only the picture turns. */
function spin(T) {
  const p = T.match.position, k = p.row[pick], ways = at ? legal(T).filter((m) => m.pick === pick && m.put === NONE && same(m.at, at)).map((m) => m.rot) : ROTS[k];
  if (ways.length < 2) { if (at) toast("It fits here only one way."); return; }
  rot = ways[(ways.indexOf(rot) + 1) % ways.length];
  put = NONE;
  T.refresh();
}
const STATS = (p, s) => [["Stewards", p.home[s]]];

createTable({
  game: tile, key: "tile", title: "Hedge and Highway", won: "The countryside is yours.", outOf: () => false, seats: [2, 3, 4, 5], normal: 2, lengths: [], pace: () => 520,
  unit: "Points", cellsOf: pointsOf, goalOf: (p) => Math.max(1, ...p.score), landOf: (p) => Math.max(20, p.score.reduce((a, v) => a + v, 0)), landText: (c) => String(c),
  choose, thinking,
  family: "Early: a first playable version, with a flat board. Inspired by the family of tile-laying games, where players lay a landscape one square tile at a time and claim what grows on it. Not affiliated with or endorsed by the makers of any of them: the rules text, names and art are our own.",
  stands: "That move stands: the next tile has been seen.",
  roundText: (p) => (p.over ? null : `${tilesLeft(p)} ${tilesLeft(p) === 1 ? "tile" : "tiles"} left${p.rule.seasons > 1 ? `, season ${p.season} of ${p.rule.seasons}` : ""}`),
  summary: (T) => { const p = T.match.position; return `${p.laid.length} tiles laid${p.gone.length ? `, ${p.gone.length} set aside` : ""}.`; },
  about: {
    classic: "Traditional: the tile-laying game as players know it.\nDraw one tile, lay it so every edge matches, and send a steward to one of its lanes, towns, meadows or wells. Finished lanes and towns score at once and their stewards come home; meadows score at the end. Six stewards each.\nOur own tiles, mix, scores and names.",
    custom: "Custom: your own rules.\nChoose how many tiles to choose from, meadows, seasons, stewards, the length of the bag, and what an unfinished lane or town scores at the end.",
    ours: "Capo: our own variation.\nThree tiles face up to choose from, no meadows, four stewards, and a shorter bag played in three seasons: at each season's end what you hold scores half and every steward comes home.",
  },
  switches: [
    { key: "choice", label: "Tiles to choose from", normal: SWITCHES.choice.normal, values: [[1, "One, drawn"], [2, "Two, face up"], [3, "Three, face up"]] },
    { key: "meadows", label: "Meadows", normal: SWITCHES.meadows.normal, values: [[true, "On, scored at the end"], [false, "Off"]] },
    { key: "seasons", label: "Seasons", normal: SWITCHES.seasons.normal, values: [[1, "One"], [3, "Three, half scores at each end"]] },
    { key: "stewards", label: "Stewards each", normal: SWITCHES.stewards.normal, values: SWITCHES.stewards.values.map((v) => [v, String(v)]) },
    { key: "length", label: "Bag", normal: SWITCHES.length.normal, values: [["short", "Short"], ["normal", "Normal"], ["long", "Long"]] },
    { key: "rest", label: "Unfinished at the end", normal: SWITCHES.rest.normal, values: [["tile", "One a tile"], ["half", "Half"], ["none", "Nothing"]] },
  ],
  stats: STATS,
  figures: (T, s) => STATS(T.match.position, s).slice(1),
  line(e, p) {
    if (e.kind === "lay") return `${NAMES[e.seat]} lays ${kindName(e.tile).toLowerCase()} at ${placeName(e.at)}${e.put >= 0 ? `, with a steward on the ${FEATURE[e.what]}` : ""}.`;
    if (e.kind === "score") return `${who(e.seats)} ${e.seats.length > 1 ? "each score" : "scores"} ${e.points} for ${e.what === "meadow" ? "a" : e.done ? "a finished" : "an unfinished"} ${e.what}${e.when === "season" ? " at the season's end" : e.when === "end" ? " at the end" : ""}.`;
    if (e.kind === "discard") return `${kindName(e.tile)} fits nowhere and is set aside.`;
    if (e.kind === "season") return `Season ${e.n} ends: what is claimed scores half, and every steward comes home.`;
    if (e.kind === "end") return `The last tile is laid. ${p.seats > 1 ? "Final scores." : ""}`.trim();
    return "";
  },
  order: (events) => events.flatMap((e) => (e.kind === "lay" ? [e.at] : [])),
  board(T, stage) {
    return squareBoard(T, stage, { state: () => T.match.position, tap: (x, y) => tap(T, x, y) });
  },
  panel(T) {
    const p = T.match.position, all = legal(T), s = p.seat;
    if (!p.row[pick] || p.row.indexOf(p.row[pick]) !== pick) pick = 0;
    const k = p.row[pick], mine = all.filter((m) => m.pick === pick), places = [];
    for (const m of mine) if (m.put === NONE && !places.some((c) => same(c, m.at))) places.push(m.at);
    if (at && !places.some((c) => same(c, at))) at = null;
    const ways = at ? mine.filter((m) => m.put === NONE && same(m.at, at)).map((m) => m.rot) : ROTS[k];
    if (!ways.includes(rot)) rot = ways[0];
    const posts = at ? mine.filter((m) => same(m.at, at) && m.rot === rot && m.put !== NONE) : [];
    if (put !== NONE && !posts.some((m) => m.put === put)) put = NONE;
    const move = at ? { pick, at, rot, put } : null;
    $("status").textContent = `${T.solo() ? "Your turn" : `${NAMES[s]}'s turn`}: ${at ? "turn it, choose a steward, then lay it." : "choose a lit place on the board or in the list."}`;
    // the tile in hand, turned as it would be laid, and the counts that matter
    const pic = el("canvas"), dl = el("dl");
    pic.width = pic.height = 152; pic.setAttribute("role", "img"); pic.setAttribute("aria-label", `${kindName(k)}, turned ${rot} ${rot === 1 ? "time" : "times"}`);
    tilePicture(pic, k, rot);
    for (const [a, b] of [["Tile", kindName(k)], ["Stewards", `${p.home[s]} at home`], ["Points", String(pointsOf(p, s))]]) dl.append(el("dt", a), el("dd", b));
    $("info").replaceChildren(pic, dl);
    $("tiles").hidden = p.rule.choice < 2;
    radio($("tiles"), p.row.flatMap((kk, i) => (p.row.indexOf(kk) === i ? [{ value: i, label: kindName(kk) }] : [])), pick, (v) => { pick = v; at = null; put = NONE; rot = 0; T.refresh(); });
    radio($("wheres"), places.map((c) => ({ value: c.join(), label: placeName(c), note: (() => { const n = mine.filter((m) => m.put === NONE && same(m.at, c)).length; return `${n} ${n === 1 ? "way" : "ways"}`; })() })), at ? at.join() : null, (v) => { at = v.split(",").map(Number); put = NONE; T.refresh(); });
    const none = { value: NONE, label: "No steward", note: p.home[s] ? `${p.home[s]} at home` : "none at home" };
    radio($("men"), [none, ...posts.map((m) => ({ value: m.put, label: `${FEATURE[KINDS[k].feats[m.put].kind][0].toUpperCase()}${FEATURE[KINDS[k].feats[m.put].kind].slice(1)}, ${sideOf(k, rot, m.put)}`, note: featureNote(p, at[0], at[1], k, rot, m.put) }))], put, (v) => { put = v; T.refresh(); });
    $("men").hidden = $("men-cap").hidden = !at;
    $("preview").replaceChildren(...(move ? [previewOf(T, p, move).text] : []));
    $("spin").disabled = ways.length < 2;
    $("spin").onclick = () => spin(T);
    $("do").disabled = !move;
    $("do").textContent = move ? `Lay it${put !== NONE ? ", with a steward" : ""}` : "Choose a place";
    $("do").onclick = () => { if (move && T.ready()) T.play(move); };
    T.board.light(places, { ghost: at ? { x: at[0], y: at[1], k, r: rot, put, seat: s } : null });
  },
  changed: () => { at = null; put = NONE; pick = 0; },
  listing: (T) => { const p = T.match.position; return { head: ["Place", "Tile", "Stewards"], rows: p.laid.map(([x, y, k], t) => [placeName([x, y]), kindName(k), p.men.filter((m) => m[0] === t).map((m) => `${NAMES[m[2]]} on the ${KINDS[k].feats[m[1]].kind}`).join(", ")]) }; },
  more: { label: "Tiles left by kind", body(T) {
    const p = T.match.position, left = new Map(), box = el("div", undefined, "ranks"), t = el("table");
    for (const k of [...p.bag, ...p.row]) left.set(k, (left.get(k) || 0) + 1);
    const row = (cells, tag) => { const r = el("tr"); r.append(...cells.map((c) => el(tag, String(c)))); return r; };
    t.append(row(["Tile", "Left"], "th"), ...[...left].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([k, n]) => row([kindName(k), n], "td")));
    box.append(t);
    return box;
  } },
  keys(T, k, e) {
    if (k === "r") spin(T);
    else if (k === "enter" && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.id !== "do")) { e.preventDefault(); $("do").click(); }
  },
  rules: (_, p) => { const r = p?.rule || Object.fromEntries(Object.entries(SWITCHES).map(([k, o]) => [k, o.normal])); return [
    "Early: this is a first playable version, on a flat board. The look, the lesson and the stronger bots come later.",
    `Each turn, ${r.choice > 1 ? `choose one of ${r.choice} tiles face up` : "take the tile drawn"} and lay it beside the countryside so that every edge matches the edge it meets: lane to lane, town to town, meadow to meadow. Lit places on the board show where it fits; tap one, tap it again to turn the tile, or use the list.`,
    `Then you may send one of your stewards (${r.stewards} each) to a lane, town${r.meadows ? ", meadow" : ""} or well on the tile you laid, if nobody has one in it yet. Joining tiles later can bring two players into one feature.`,
    "A lane is finished when both its ends stop, at a junction, a well, a town's gate or by meeting itself. It scores 1 a tile, or 2 a tile when it runs between two different towns' gates.",
    "A town is finished when its wall is closed. It scores 2 a tile and 2 for each market (the blue flag).",
    "A well scores 1 for itself and 1 for each of the 8 tiles round it; with all 8 laid, it scores 9 at once.",
    "Whoever has most stewards in a finished feature scores it; tied players each score in full. Its stewards then come home.",
    ...(r.meadows ? ["Meadows score only at the end: 2 for each finished town the meadow touches and 1 for each well in it, to whoever has most stewards there. A steward in a meadow stays there all game."] : []),
    ...(r.seasons > 1 ? [`The bag is played in ${r.seasons} seasons. At each season's end, everything claimed scores half (rounded down), and every steward comes home.`] : []),
    `At the end, unfinished lanes, towns and wells with stewards score ${r.rest === "tile" ? "1 a tile (a town also 1 for each market)" : r.rest === "half" ? "half, rounded down" : "nothing"}. The most points wins; a tie is shared.`,
    "Before you lay a tile, the panel says what it would score, for you and for everyone. A tile that fits nowhere is set aside. Tiles left by kind are in the menu.",
    "Keys: Tab and arrows choose, R turns the tile, Enter lays it. Drag the board to move it; the wheel, two fingers or plus and minus zoom.",
  ]; },
});
