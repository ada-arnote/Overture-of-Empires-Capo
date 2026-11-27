// SPDX-License-Identifier: AGPL-3.0-or-later
// Promise forms: the fixed shapes a promise can take, so the game can judge it against the orders after a reveal.
// A form is a small piece of data: { form, by, to, at, a, b }. `to` is a seat, or -1 for a promise made to everyone.
// The game records promises; it never enforces one. Early: the forms and their judging are here and tested; making
// them in play, the ledger and bots that bargain come next.

export const FORMS = {
  "keep-out": "I will not enter {at} this season.",
  "back-move": "I will support your move into {at}.",
  "back-hold": "I will support your hold of {at}.",
  "stand": "I will hold {at}.",
  "no-strike": "I will not move into any province of yours.",
  "carry": "I will carry your move from {a} to {b}.",
};

/**
 * Was a promise kept? results: the season's orders as the reveal gave them (one per province held, `of` the seat that wrote it),
 * owner: who held what when the orders were written. Returns "kept", "broken" or "void" (it could not apply).
 */
export function judge(f, results, owner) {
  const mine = results.filter((r) => r.of === f.by), theirs = results.filter((r) => r.of === f.to);
  const pair = (r) => (r.a === f.a && r.b === f.b) || (r.a === f.b && r.b === f.a);
  switch (f.form) {
    case "keep-out": return mine.some((r) => r.kind === "move" && r.to === f.at) ? "broken" : "kept";
    case "back-move":
      if (!theirs.some((r) => r.kind === "move" && r.to === f.at)) return "void";
      return mine.some((r) => r.kind === "support" && r.to === f.at && r.seat === f.to) ? "kept" : "broken";
    case "back-hold":
      if (owner[f.at] !== f.to) return "void";
      return mine.some((r) => r.kind === "support" && r.to === f.at && r.seat === f.to) ? "kept" : "broken";
    case "stand":
      if (owner[f.at] !== f.by) return "void";
      return mine.some((r) => r.at === f.at && r.kind === "move") ? "broken" : "kept";
    case "no-strike": return mine.some((r) => r.kind === "move" && owner[r.to] >= 0 && (f.to < 0 ? owner[r.to] !== f.by : owner[r.to] === f.to)) ? "broken" : "kept";
    case "carry":
      if (!theirs.some((r) => r.kind === "move" && r.sea && ((r.at === f.a && r.to === f.b) || (r.at === f.b && r.to === f.a)))) return "void";
      return mine.some((r) => r.kind === "transport" && pair(r)) ? "kept" : "broken";
    default: return "void";
  }
}
