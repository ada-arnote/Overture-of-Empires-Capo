// SPDX-License-Identifier: AGPL-3.0-or-later
// Promise forms: the fixed shapes a promise can take, so the game can judge it against the orders after a reveal.
// A form is a small piece of data: { form, by, to, at, a, b }. `to` is a seat, or -1 for a promise made to everyone
// (a public pledge). The game records promises and marks them kept, broken or void after the reveal; it never
// enforces one. Free talk, aloud or anywhere else, is never read by the rules.

export const FORMS = {
  "keep-out": "I will not enter {at} this season.",
  "back-move": "I will support your move into {at}.",
  "back-hold": "I will support your hold of {at}.",
  "stand": "I will hold {at}.",
  "no-strike": "I will not move into any province of yours.",
  "carry": "I will carry your move from {a} to {b}.",
};
/** The same forms, said of the speaker by someone else (an ask) or to everyone (a public pledge). */
const ASKED = {
  "keep-out": "Do not enter {at} this season.",
  "back-move": "Support my move into {at}.",
  "back-hold": "Support my hold of {at}.",
  "stand": "Hold {at}.",
  "no-strike": "Do not move into any province of mine.",
  "carry": "Carry my move from {a} to {b}.",
};
const PUBLIC = { "no-strike": "I will not move into anyone's province this season." };
export const MARKS = ["kept", "broken", "void"];

/**
 * The bots' characters: each has a name and one plain public line, shown before and during the game, so a solo player
 * is reading people, not noise. What each does is in bot.js, and the line says it exactly. A person's seat has none.
 */
export const CAST = [
  { id: "steward", name: "the Steward", line: "Keeps every promise it makes." },
  { id: "merchant", name: "the Merchant", line: "Keeps faith with every seat that has kept faith with it; breaks its word to any seat that broke a promise to it." },
  { id: "elder", name: "the Elder", line: "Forgives each seat one broken promise; after a second, it breaks its own word to that seat." },
  { id: "climber", name: "the Climber", line: "Keeps its word, except to a seat that leads it in ports." },
  { id: "gambler", name: "the Gambler", line: "When a promise stands in its way, it breaks it one time in two." },
  { id: "herald", name: "the Herald", line: "Never breaks a public pledge; breaks a private promise whenever it stands in its way." },
];

/** A form in words. name(i): a place's name. asked: said as an ask of someone else. */
export function formText(f, name, asked = false) {
  const t = (f.to < 0 && PUBLIC[f.form]) || (asked ? ASKED : FORMS)[f.form] || f.form;
  return t.replace("{at}", f.at !== undefined ? name(f.at) : "").replace("{a}", f.a !== undefined ? name(f.a) : "").replace("{b}", f.b !== undefined ? name(f.b) : "");
}

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
