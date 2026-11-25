// SPDX-License-Identifier: AGPL-3.0-or-later
// A tiny game for testing the core, not for players. Seats take turns; each rolls a die and
// either banks the pot or rolls again; a 1 loses the pot. First to the goal wins.
export const stones = {
  id: "stones", version: "1",
  options: { seats: { values: [2, 3, 4], normal: 2 }, goal: { values: [12, 20], normal: 20 } },
  setup: (o, dice) => ({ seat: dice.below(o.seats), banked: Array(o.seats).fill(0), pot: 0, goal: o.goal, won: null }),
  turn: (p) => (p.won === null ? p.seat : null),
  moves: (p) => (p.pot ? [{ do: "bank" }, { do: "roll" }] : [{ do: "roll" }]),
  apply(p, m, dice) {
    const pass = { ...p, pot: 0, seat: (p.seat + 1) % p.banked.length };
    if (m.do === "roll") {
      const n = dice.die();
      return n === 1 ? { position: pass, events: [{ kind: "lost", seat: p.seat }] } : { position: { ...p, pot: p.pot + n }, events: [{ kind: "rolled", seat: p.seat, n }] };
    }
    const banked = p.banked.map((b, i) => (i === p.seat ? b + p.pot : b));
    return { position: { ...pass, banked, won: banked[p.seat] >= p.goal ? p.seat : null }, events: [{ kind: "banked", seat: p.seat, n: p.pot }] };
  },
  result: (p) => (p.won === null ? null : { winners: [p.won], why: "reached the goal" }),
};

/** A fixed way to play it, so every machine makes the same list of moves. */
export function playScript(match) {
  for (let k = 0; match.turn !== null; k++) {
    const l = match.legal();
    match.play(l[(k * 7 + (k >> 2)) % l.length]);
  }
  return match;
}
