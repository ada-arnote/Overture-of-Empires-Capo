// SPDX-License-Identifier: AGPL-3.0-or-later
// People and threads: the second half of the story's memory, kept by code and never by an AI call.
// People: a reply may name up to two (PERSON lines, optional). After every turn the code looks through the lines
// it kept (events, news, summary, advice, receipt, this turn's chats) for the names it holds, by full name or
// surname, and marks who was mentioned. A prompt carries at most twelve, one line each of at most 120 characters:
// the council, people the player chats with and people the player pins are never trimmed; the rest go by the most
// recent mention. Forty are held; past that the one mentioned longest ago, and not pinned, is forgotten.
// Threads: a reply may open or move up to two (THREAD lines, optional). Six stay open. A thread nobody touches for
// twelve turns closes by rule, and its closing goes into the chronicle like any other thing the rules decided.

export const PEOPLE = { sent: 12, held: 40, line: 120, reply: 2 };
export const THREADS = { open: 6, rest: 12, reply: 2 };
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t; };
const low = (s) => String(s || "").toLowerCase();
const same = (a, b) => low(a) === low(b);
const CLOSED = /^(closed|resolved|ended|over|settled)\b/i;
const commands = (g) => g.mode !== "citizen";

/** Everything one finished turn kept, as one lower-case text to look for names in. */
const kept = (g, e) => low([e.summary, ...(e.events || []).map((x) => x.text), ...(e.news || []).map((n) => `${n.headline} ${n.text}`), e.advice?.text, ...(e.told || []).map((x) => x.text),
  ...(e.receipt || []).map((x) => x.text), ...(g.chats || []).flatMap((c) => c.messages.filter((m) => m.turn === e.turn).map((m) => m.text))].join("\n"));
const named = (text, name) => { const n = low(name), last = n.split(" ").pop(); return text.includes(n) || (last.length >= 4 && new RegExp(`(^|[^\\p{L}])${last.replace(/[^\p{L}\p{N}' -]/gu, ".")}([^\\p{L}]|$)`, "u").test(text)); };

/** Those who are never trimmed, in order: the council, the people of the player's chats (newest first), the pinned. */
function fixed(g) {
  const out = [], add = (name, text, pin) => { if (name && !out.some((p) => same(p.name, name))) out.push({ name, text: clip(text, PEOPLE.line), pin }); };
  for (const [seat, m] of Object.entries(g.council?.seats || {})) if (m) add(m.name, `${m.name} (${seat}, ${commands(g) ? "the player's council" : "the player's circle"}): ${m.traits}; wants ${m.wants}`);
  for (const c of (g.chats || []).slice().reverse()) if (c.person) add(c.person.split(",")[0].trim(), `${c.person} (the player talks with them)`);
  for (const p of g.people || []) if (p.pin) add(p.name, line(p), true);
  return out.slice(0, PEOPLE.sent);
}
const line = (p) => `${p.name}${p.role ? `, ${p.role}` : ""}${p.country ? ` (${p.country})` : ""}${p.line ? `: ${p.line}` : ""}`;

/** The people a prompt carries, as lines: at most twelve. With rest false, only those never trimmed. */
export function peopleLines(g, rest = true) {
  const out = fixed(g);
  if (rest) for (const p of (g.people || []).filter((x) => !x.pin).sort((a, b) => b.seen - a.seen)) if (out.length < PEOPLE.sent && !out.some((x) => same(x.name, p.name))) out.push({ name: p.name, text: clip(line(p), PEOPLE.line) });
  return out.map((p) => `- ${p.text}`);
}

/** Pin or unpin someone the game holds. Returns "" when done, or why not, in plain words. */
export function pin(g, name, on = true) {
  const p = (g.people || []).find((x) => same(x.name, name));
  if (!p) return "Nobody of that name is remembered.";
  if (on && !p.pin && fixed(g).length >= PEOPLE.sent) return `Twelve people are sent each turn, and your council, your chats and your pins already fill them. Unpin someone first.`;
  p.pin = !!on;
  return "";
}

/**
 * After a turn: mark who was mentioned, and take in up to two people the reply named (new, or new word on someone
 * held). entry is the turn's log entry; named is the reply's PERSON lines as read: [{name, role, country, line}].
 */
export function notePeople(g, entry, reply = []) {
  const text = kept(g, entry), list = (g.people ||= []);
  for (const p of list) if (named(text, p.name)) p.seen = entry.turn;
  for (const n of reply.slice(0, PEOPLE.reply)) {
    const old = list.find((p) => same(p.name, n.name));
    if (old) Object.assign(old, { role: n.role || old.role, country: n.country || old.country, line: n.line || old.line, seen: entry.turn });
    else list.push({ name: n.name, role: n.role, country: n.country, line: n.line, first: entry.turn, seen: entry.turn });
  }
  while (list.length > PEOPLE.held) {
    const loose = list.filter((p) => !p.pin).sort((a, b) => a.seen - b.seen)[0];
    if (!loose) break;
    list.splice(list.indexOf(loose), 1);
  }
}

/**
 * After a turn: open, move or close threads from the reply's THREAD lines ([{title, state}]), mark those the turn
 * mentioned, and close by rule what has lain untouched for twelve turns or no longer fits in six.
 * Returns receipt lines; each closing carries a fact for the chronicle.
 */
export function noteThreads(g, entry, reply = []) {
  const text = kept(g, entry), lines = [], t = entry.turn;
  let list = (g.threads ||= []);
  const shut = (th, why) => { list = list.filter((x) => x !== th); lines.push({ ok: true, text: `The thread "${th.title}" closes${why}`, fact: ["thread", th.title] }); };
  for (const th of list) if (text.includes(low(th.title))) th.t = t;
  for (const n of reply.slice(0, THREADS.reply)) {
    const old = list.find((x) => same(x.title, n.title));
    if (CLOSED.test(n.state)) { if (old) shut(old, `: ${n.state}`); continue; }
    if (old) Object.assign(old, { state: n.state, t });
    else list.push({ title: n.title, state: n.state, t0: t, t });
  }
  for (const th of list.slice()) if (t - th.t >= THREADS.rest) shut(th, " by rule: nothing touched it for twelve turns");
  while (list.length > THREADS.open) shut(list.slice().sort((a, b) => a.t - b.t)[0], " by rule: only six threads stay open, and it was the one longest untouched");
  g.threads = list;
  return lines;
}

/** Open threads as prompt lines, the most recently touched first: at most six. */
export const threadLines = (g) => (g.threads || []).slice().sort((a, b) => b.t - a.t).slice(0, THREADS.open).map((th) => `- ${th.title}: ${th.state} (open since turn ${th.t0})`);

/** People and threads from a save: only well-formed ones, clipped. known(code) answers for the map. */
export function keepMemory(s, known) {
  const str = (v, n) => clip(typeof v === "string" ? v : "", n), int = (v) => (Number.isInteger(v) && v > 0 ? v : 1), list = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === "object");
  return {
    people: list(s.people).filter((p) => str(p.name, 60)).slice(-PEOPLE.held).map((p) => ({ name: str(p.name, 60), role: str(p.role, 40), country: known(p.country) ? p.country : "", line: str(p.line, 100), first: int(p.first), seen: int(p.seen), ...(p.pin ? { pin: true } : {}) })),
    threads: list(s.threads).filter((x) => str(x.title, 60)).slice(-THREADS.open).map((x) => ({ title: str(x.title, 60), state: str(x.state, 100), t0: int(x.t0), t: int(x.t) })),
  };
}
