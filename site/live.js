// SPDX-License-Identifier: AGPL-3.0-or-later
// The front page's desk: a real game of Brass and Banners, four easy bots on the world board, watched and never played here.
// The same rules, bot, board and War table as the game's own page; this file only deals the game, asks the bot, and shows each move.
import { chance, createMatch, seedState } from "../src/core/index.js";
import { NONE, banners, boardOf, bonusOf, cellsOf } from "../src/games/banners/rules.js";
import { choose } from "../src/games/banners/bot.js";
import { areaPicture } from "../src/map/areas.js";
import { canDraw, createBoard } from "../src/map/board.js";
import { shelf } from "./shelf.js";

// the table's first four seats, in the colour-blind-safe colours of table.js
const SEATS = [["Azure", [0, 114, 178]], ["Saffron", [212, 146, 0]], ["Teal", [0, 158, 115]], ["Plum", [163, 97, 134]]];
const SEA = [68, 108, 122], LAND = [[222, 190, 150], [206, 206, 150], [228, 200, 180], [190, 206, 178], [214, 190, 200], [226, 214, 158], [196, 200, 214], [210, 180, 150], [178, 204, 200], [224, 206, 190]];
/** Each game is dealt and played unseen to this round, so the desk opens on a game under way: the same position as the still picture (site/shots/banners.webp is game "front 0" at this round). */
export const FROM = 4;
/** How close the desk stands: the whole world at the desk's own shape (20 by 9), a narrower desk closer in, and a phone's closer still, on the middle of the world, so its pieces do not crowd. */
const ZOOM = 1.15, WIDE = 20 / 9, PHONE = 560, NEAR = 2.6, BAND = 52;
const SLOW = "capo-3d-slow", weak = () => { try { return navigator.deviceMemory <= 2 || navigator.hardwareConcurrency < 4 || !!localStorage.getItem(SLOW); } catch { return true; } };
const rest = () => new Promise((r) => setTimeout(r, 0));

/** Returns { start, stop }, or null where the board cannot be drawn. say(text) is told how the game stands; lost() when the graphics go. */
export async function live(stage, say, lost) {
  if (!canDraw()) return null;
  let match = null, moves = 0, games = 0, timer = 0, running = false, dealing = false;
  const bot = () => match.play(choose(match.position, chance(seedState(`${match.seed}/${moves++}`)), "easy"));
  /** A new game, played unseen to round FROM a few moves at a time, so the page stays free to answer. */
  const deal = async () => {
    match = createMatch(banners, { seed: `front ${games++ % 9}`, options: { seats: SEATS.length, map: "world" } }); moves = 0;
    const under = () => match.position.round < FROM || Math.max(...match.position.str) < 5; // into round FROM, until someone has mustered a stack of five
    for (let n = 1; match.turn !== null && under() && n < 600; n++) { bot(); if (n % 12 === 0) await rest(); }
  };
  await deal();
  const b = boardOf(match.position), picture = areaPicture(b.fine, b.of, b.mid, 11, true);
  const labels = b.lands.map((name, k) => ({ at: picture.at[b.marks[k]], sea: true, text: `${name.replace(/^the /, "")} +${bonusOf(b, k)}` }));
  const lines = b.ends.flatMap((e) => {
    const [x, y] = e.map((i) => picture.at[i]).sort((i, j) => i[0] - j[0]);
    return y[0] - x[0] < picture.w / 2 ? [[x, y]] : [[x, [2, (x[1] + y[1]) / 2]], [y, [picture.w - 2, (x[1] + y[1]) / 2]]]; // round the back of the world
  });
  // tilted on the walnut War table with its sculpted pieces, as the game opens; Flat where the device is weak or proves slow (hexboard.js does the same)
  const board = createBoard(stage, { picture, lines, labels, lands: b.region, cells: [], sea: [...b.mid.map(() => false), true], seats: SEATS.map((s) => s[1]), icons: [0, 1, 2, 3], ground: (i) => (i >= b.n ? SEA : LAND[b.region[i] % LAND.length]), look: weak() ? "flat" : "relief", style: "war", wood: "textures/walnut.webp", era: "early", shelf, probe: !weak() });
  board.setLight("lamp"); // the front page is the dark blue of lamplight
  board.on("slow", () => { try { localStorage.setItem(SLOW, "1"); } catch { /* timed again next visit */ } board.setLook("flat"); });
  // zoom() is relative and stops at the whole board, so a tiny factor first brings it to the whole board, then it stands at ZOOM from there
  // on a phone the board keeps clear of a band at the foot of the desk, where Play this game sits, so it never covers a piece
  const fit = () => {
    const w = stage.clientWidth, phone = w < PHONE, h = stage.clientHeight - (phone ? BAND : 0);
    board.layout(phone ? { bottom: BAND } : {});
    board.zoom(1e-6);
    board.zoom(phone ? NEAR : ZOOM * Math.max(1, WIDE / (w / Math.max(1, h))));
  };
  const watch = new ResizeObserver(fit);
  watch.observe(stage);
  board.on("lost", () => { stop(); watch.disconnect(); lost(); });

  const show = (order, quick) => {
    const p = match.position;
    return board.show([...p.owner, NONE], { order, quick, pieces: p.owner.map((seat, at) => ({ kind: "army", at, seat, rgb: SEATS[seat]?.[1], count: p.str[at], now: seat === match.turn })) });
  };
  const tell = () => {
    const p = match.position, held = SEATS.map((_, s) => cellsOf(p, s)), best = Math.max(...held), who = SEATS[held.indexOf(best)][0];
    say(match.turn === null ? `Live on this page: ${who} has won. A new game is being dealt.` : `Live on this page: four bots at Brass and Banners. Round ${p.round}, ${who} leads with ${best} of ${p.owner.length} provinces.`);
  };
  async function step() {
    if (!running) return;
    if (match.turn === null) { dealing = true; await deal(); dealing = false; if (!running) return; show([], true); tell(); timer = setTimeout(step, 900); return; }
    const events = bot();
    const took = show(events.flatMap((e) => (e.kind === "take" ? [e.at] : [])), false);
    if (match.turn === null || events.some((e) => e.kind === "take" || e.kind === "done")) tell();
    timer = setTimeout(step, match.turn === null ? 4000 : Math.max(340, took + 140));
  }
  function stop() { running = false; clearTimeout(timer); }
  fit();
  show([], true);
  tell();
  return { start() { if (running) return; running = true; if (!dealing) timer = setTimeout(step, 600); }, stop }; // while a game is dealt, the deal goes on to the next step itself
}
