// SPDX-License-Identifier: AGPL-3.0-or-later
// The front page's desk: a real game of Brass and Banners, four easy bots on the world board, watched and never played here.
// The same rules, bot and board as the game's own page; this file only deals the game, asks the bot, and shows each move.
import { chance, createMatch, seedState } from "../src/core/index.js";
import { NONE, banners, boardOf, bonusOf, cellsOf } from "../src/games/banners/rules.js";
import { choose } from "../src/games/banners/bot.js";
import { areaPicture } from "../src/map/areas.js";
import { canDraw, createBoard } from "../src/map/board.js";

// the table's first four seats, in the colour-blind-safe colours of table.js
const SEATS = [["Azure", [0, 114, 178]], ["Saffron", [212, 146, 0]], ["Teal", [0, 158, 115]], ["Plum", [163, 97, 134]]];
const SEA = [68, 108, 122], LAND = [[222, 190, 150], [206, 206, 150], [228, 200, 180], [190, 206, 178], [214, 190, 200], [226, 214, 158], [196, 200, 214], [210, 180, 150], [178, 204, 200], [224, 206, 190]];

/** Returns { start, stop }, or null where the board cannot be drawn. say(text) is told how the game stands; lost() when the graphics go. */
export function live(stage, say, lost) {
  if (!canDraw()) return null;
  let match = null, moves = 0, games = 0, timer = 0, running = false;
  const deal = () => { match = createMatch(banners, { seed: `front ${games++ % 9}`, options: { seats: SEATS.length, map: "world" } }); moves = 0; };
  deal();
  const b = boardOf(match.position), picture = areaPicture(b.fine, b.of, b.mid, 11, true);
  const labels = b.lands.map((name, k) => ({ at: picture.at[b.marks[k]], sea: true, text: `${name.replace(/^the /, "")} +${bonusOf(b, k)}` }));
  const lines = b.ends.flatMap((e) => {
    const [x, y] = e.map((i) => picture.at[i]).sort((i, j) => i[0] - j[0]);
    return y[0] - x[0] < picture.w / 2 ? [[x, y]] : [[x, [2, (x[1] + y[1]) / 2]], [y, [picture.w - 2, (x[1] + y[1]) / 2]]]; // round the back of the world
  });
  const board = createBoard(stage, { picture, lines, labels, lands: b.region, cells: [], sea: [...b.mid.map(() => false), true], seats: SEATS.map((s) => s[1]), icons: [0, 1, 2, 3], ground: (i) => (i >= b.n ? SEA : LAND[b.region[i] % LAND.length]), look: "flat" });
  const watch = new ResizeObserver(() => board.layout());
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
  function step() {
    if (!running) return;
    if (match.turn === null) { deal(); show([], true); tell(); timer = setTimeout(step, 900); return; }
    const events = match.play(choose(match.position, chance(seedState(`${match.seed}/${moves++}`)), "easy"));
    const took = show(events.flatMap((e) => (e.kind === "take" ? [e.at] : [])), false);
    if (match.turn === null || events.some((e) => e.kind === "take" || e.kind === "done")) tell();
    timer = setTimeout(step, match.turn === null ? 4000 : Math.max(340, took + 140));
  }
  function stop() { running = false; clearTimeout(timer); }
  board.layout();
  show([], true);
  tell();
  return { start() { if (running) return; running = true; timer = setTimeout(step, 600); }, stop };
}
