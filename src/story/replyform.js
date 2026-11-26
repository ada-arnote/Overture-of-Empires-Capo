// SPDX-License-Identifier: AGPL-3.0-or-later
// The shape of Capo's replies, apart from how they travel: a reply as a structured tool call and back to its lines,
// and a sample turn Capo writes itself. Whatever service a reply comes from, the same reader reads its lines and the
// rules judge them; nothing here decides anything.
import { turnCode } from "./turn.js";

/** The line kinds a prompt asks for (after "Reply with only ...": LABEL: field | field), or null. */
export function formatOf(prompt) {
  const lines = String(prompt).split("\n"), at = lines.findLastIndex((l) => /^Reply with only/.test(l));
  if (at < 0) return null;
  const rows = [], fixed = [];
  let end = false;
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === "END") { end = true; continue; }
    const m = l.match(/^([A-Z][A-Z ]*[A-Z]):\s*(.*)$/);
    if (!m) continue;
    if (/^t\d+-[\w-]+$/.test(m[2].trim())) fixed.push(l.trim()); // the turn's code: Capo writes it, not the AI (a seed may hold a hyphen, ruling 150)
    else if (!rows.some((r) => r.label === m[1])) rows.push({ label: m[1], fields: m[2].split(" | ").map((s) => s.trim()) });
  }
  return rows.length ? { rows, fixed, end } : null;
}

/** The one tool a reply comes back through: a property for each kind of line, an item for each line, its fields in order. */
export function toolOf(fmt) {
  const props = Object.fromEntries(fmt.rows.map(({ label, fields }) => [label, { type: "array", description: `${label} lines`,
    items: { type: "object", properties: Object.fromEntries(fields.map((d, i) => [`f${i + 1}`, { type: "string", description: d }])), required: fields.map((_, i) => `f${i + 1}`) } }]));
  return { name: "capo_reply", description: "The whole reply in the reply format: each property one kind of line, each item one line, its fields in order.", parameters: { type: "object", properties: props } };
}

/** A tool call's arguments as the reply's own lines, or null when they cannot be read. */
export function linesFrom(fmt, args) {
  let a = args;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { return null; } }
  if (!a || typeof a !== "object") return null;
  const field = (v) => String(v ?? "").replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim(), out = [...fmt.fixed];
  for (const { label, fields } of fmt.rows) {
    const v = a[label] ?? a[label.toLowerCase()];
    for (const item of Array.isArray(v) ? v : v == null ? [] : [v]) {
      // an item is its fields (a | inside one cannot break the line), or a whole line as the model wrote it
      const line = item && typeof item === "object" ? fields.map((_, i) => field(item[`f${i + 1}`] ?? Object.values(item)[i])).join(" | ") : String(item ?? "").replace(/\s+/g, " ").trim();
      if (line.replace(/[\s|]/g, "")) out.push(`${label}: ${line}`);
    }
  }
  if (fmt.end) out.push("END");
  return out.join("\n");
}

/** A turn's reply written by Capo itself in the reply format, so a first turn can be played as a demo with no AI. It proposes no moves. */
export function sampleReply(g, to, auto, nameOf, near) {
  const o = near.filter((c) => c !== g.player), a = o[0] || g.player, b = o[1] || a, t = (d) => Date.parse(`${d}T00:00:00Z`);
  const day = (f) => new Date(t(g.date) + (t(to) - t(g.date)) * f).toISOString().slice(0, 10);
  return [`TURN: ${turnCode(g)}`,
    `EVENT: ${g.date} | ${g.player} | The government of ${nameOf(g.player)} meets to weigh its next steps; ministers argue over money, the army and the neighbours. (A sample turn, written by Capo without an AI.)`,
    `EVENT: ${day(0.5)} | ${a} | ${nameOf(a)} watches its neighbour closely and quietly renews its own trade talks.`,
    `EVENT: ${day(1)} | ${b} | Markets in ${nameOf(b)} stay calm as officials promise a steady course for the season.`,
    "NEWS: a national daily | A quiet season | Commentators expect little to change before the next turn.",
    "SUMMARY: A quiet stretch. This sample turn was written by Capo, not an AI, so nobody proposed a move.",
    ...(auto ? [`STOP: ${to} | the sample turn runs to its end`] : []), "END"].join("\n");
}
