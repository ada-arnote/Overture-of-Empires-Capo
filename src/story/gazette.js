// SPDX-License-Identifier: AGPL-3.0-or-later
// The gazette: a turn told by the rules alone, as a short piece of prose. No AI writes it. Every sentence comes
// from one line of the turn's receipt (what the rules decided), through a template in our own words, two or three
// to a case; which one is drawn from the game's seed and the turn, so a turn always reads the same and no text is
// stored. Countries and provinces are named, never coded, dates are in words, and the sums stay out: the page
// keeps them behind "Why". The gazette changes no fact and decides nothing.
// First what touched the player's country, then the world: wars and battles before treaties, at most seven
// sentences abroad, the rest counted. A turn in which nothing was decided says so, and may carry the turn's beat
// (beats.js) as colour.
import { hash32 } from "./line.js";
import { monthsApart, treatyName } from "./relations.js";
import { BEATS } from "./beats.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** A date in words, the same in every browser: "1 October 2027". A year and month alone gives "October 2027". */
export function wordDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return MONTHS[m - 1] ? `${d ? `${d} ` : ""}${MONTHS[m - 1]} ${y}` : String(iso || "");
}
/** The stretch a turn covered, in a word. */
export function spanWord(from, to) {
  const n = monthsApart(from, to);
  return n < 1 ? "week" : n < 2 ? "month" : n < 5 ? "season" : n < 9 ? "half-year" : n < 18 ? "year" : "years";
}
const list = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// the receipt's words without the sums in brackets, and without the page's own directions
const bare = (t) => String(t || "").replace(/ \((?:[^()]|\([^()]*\))*\)/g, "").replace(/; (?:accept it|pay or refuse) from your actions.*$/, "").replace(/[.!?]$/, "").trim();

// {a} the mover, {b} the other country, {p} a province, {k} a kind of treaty, {d} a date, {me} the player's country
const T = {
  war: ["{a} declares war on {b}.", "{a} has gone to war with {b}.", "War: {a} marches against {b}."],
  joins: ["{j} {take} {b}'s side, as {their} treat{ies} require{s}.", "Bound by treaty, {j} {join} the war against {a}."],
  clean: ["{a} takes {p} from {b}.", "{p} falls to {a}; {b} gives ground.", "{a}'s army enters {p}, and {b} cannot hold it."],
  costly: ["{a} takes {p} from {b} at a price: its army is spent for now.", "{p} changes hands after hard fighting; {a} holds it with a worn-out army."],
  failed: ["{a} attacks {p} and is thrown back.", "{p} holds against {a}.", "{a}'s attack on {p} breaks on the defenders' lines."],
  peace: ["{a} and {b} make peace; each keeps the land it holds.", "The war between {a} and {b} is over. Each keeps what it holds, and a truce of two years begins."],
  nopeace: ["{b} will not hear of peace with {a} yet.", "{a} sounds out {b} for peace and is turned away."],
  white: ["Worn out, {a} and {b} stop fighting: a white peace, each keeping the land it holds.", "{a} and {b} have fought each other to a standstill, and the guns fall silent."],
  treaty: ["{a} and {b} sign {k}.", "{k} now binds {a} and {b}.", "{a} and {b} put their names to {k}."],
  no: ["{b} turns down {a}'s offer of {k}.", "{a} asks {b} for {k} and is refused."],
  broke: ["{a} ends its treaty with {b}.", "{a} tears up its treaty with {b}, and will be known for it."],
  pact: ["{a} and {b} sign a pact of non-aggression, to last five years.", "{a} and {b} promise each other five years of peace."],
  tribute: ["{a} agrees to pay {b} a yearly tribute rather than refuse it.", "{b} now takes a yearly tribute from {a}."],
  asks: ["{a} demands {p} from {b}, and wants an answer by {d}.", "{a} lays claim to {p}; {b} has until {d} to answer."],
  yield: ["{b} yields {p} to {a} rather than fight.", "{p} passes to {a}: {b} gave way."],
  refuse: ["{b} refuses {a}'s demand for {p}.", "{b} will not give up {p}, and {a} is left with its grievance."],
  gave: ["{a} hands a province to {b} by agreement.", "By agreement, land passes from {a} to {b}."],
  fell: ["{a} has lost the last of its land and is gone from the map.", "{a} is no more: its last province has fallen."],
  formed: ["{a} breaks away from {b} with {n} province{s}; a truce of two years follows.", "A new country, {a}, is founded on {n} province{s} of {b}."],
  offer: ["{a} offers {me} {k}; the answer waits under Actions.", "An envoy from {a} brings an offer of {k}. It can be accepted under Actions."],
  due: ["{a} demands a yearly tribute of {me}: pay or refuse under Actions before the next turn ends."],
  incident: ["Patrols from {a} cross into {p} and shots are exchanged. {me} must protest or let it pass.", "A border incident at {p}: soldiers of {a} fire on a frontier post. The answer is {me}'s to give."],
  pass: ["{me} lets the incident at {p} pass, and is thought the weaker for it."],
  sorry: ["{a} apologises to {me} for the incident at {p}."],
  rebuff: ["{a} rejects {me}'s protest over {p}. Relations cool, and {me} holds a cause."],
  bloc: ["{a} and {b} sign a defence treaty, each wary of {me}: a war on one is now a war on both.", "Wary of {me}, {a} and {b} bind themselves to defend each other."],
  unrest: ["At home, {why}: the streets grow restless.", "{cwhy} unsettles {me}."],
  call: ["{a} calls on {me} to join its war against {b}. Refuse, and their treaty is cut back.", "{a}, at war with {b}, asks {me} to stand by its word."],
  kept: ["{a} thanks {me} for standing by its word against {b}."],
  cut: ["{me} did not answer {a}'s call against {b}, and their treaty is cut back a rung."],
  met: ["{me} has met its ambition: {k}.", "It is done: {k}. {me} has what it set out to win."],
  over: ["{me} holds no land. Its story as a country ends here."],
  calm: ["Nothing troubled {me} this {span}.", "At home the {span} passes quietly.", "For {me} the {span} is an easy one."],
  quiet: ["A quiet {span}: no army marched and nothing was signed.", "The {span} passes without a war begun or a treaty signed.", "Little to report this {span}; the borders stand where they stood."],
};
// a line with no case of its own, in plain words: the receipt's text after the country's name
const GAUGE = /^its (stability|treasury|mandate) (rises|falls) to ([a-z ]+?) \((.+)\)$/;
function plain(name, rest) {
  const g = rest.match(GAUGE);
  if (g) return `${name}'s ${g[1]} ${g[2]} to ${g[3]}: ${g[4]}.`;
  const t = bare(rest);
  if (/^with time, its /.test(t)) return `With time, ${name}'s ${t.slice(15)}.`;
  if (/^its /.test(t)) return `${name}'s ${t.slice(4)}.`;
  if (/^(?:the |unrest )/.test(t)) return `In ${name}, ${t}.`;
  return `${name} ${t}.`;
}
const ORDER = ["over", "met", "fell", "formed", "war", "clean", "costly", "failed", "peace", "white", "asks", "yield", "refuse", "bloc", "treaty", "broke", "pact", "tribute", "gave", "no", "plain"];

/**
 * A turn as prose. g: the game (its seed and player); entry: the turn's log entry; geo: name(code), place(id).
 * Returns {lead, home: [sentences], abroad: [sentences], more: how many matters abroad went untold, span}.
 */
export function gazette(g, entry, geo) {
  const me = g.player, name = (c) => (c ? geo.name(c) || c : ""), place = (id) => geo.place?.(id)?.name || id || "the border", rec = entry.receipt || [];
  const draw = (set, label) => set[hash32(g.seed, `gazette:${entry.turn}:${entry.branch || 0}:${label}`) % set.length];
  const fill = (key, v, label) => cap(draw(T[key], `${key}:${label}`).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ""));
  // what a treaty of the player's changes, in a clause: the numbers are on the country's sheet
  const means = (k) => (k === "trade" ? " Trade lets the treasury fill further." : ` Each will fight if the other is attacked, and may call the other to its wars.`);
  const items = [], span = spanWord(entry.from, entry.to);
  let war = null;
  const said = new Set(); // what a treaty means is said once a gazette
  rec.forEach((x, i) => {
    const [kind, a, b, n] = x.fact || [], who = x.country, mine = who === me || a === me || b === me || x.asks?.[1] === me;
    const add = (key, v, home = mine) => items.push({ key, home, text: fill(key, { me: name(me), ...v }, i) });
    if (x.over) return add("over", {}, true);
    if (x.met) return add("met", { k: (x.text.match(/"([^"]+)"/) || [])[1] || "its goal" }, true);
    if (x.press === "incident") return add("incident", { a: name(who), p: place(x.at) }, true);
    if (x.press === "unrest") { const why = x.gauge?.[0]?.[3] || "a hard season"; return add("unrest", { why, cwhy: cap(why) }, true); }
    if (x.press === "bloc") return add("bloc", { a: name(a), b: name(b), me: name(x.wary || me) }, true);
    if (x.incident) return add(x.incident[0], { a: name(x.incident[1]), p: place(x.at) }, true);
    if (x.call) return add(x.call[0] === "asks" ? "call" : x.call[0], { a: name(x.call[1]), b: name(x.call[2]) }, true);
    if (x.offer === "due") return add("due", { a: name(who) }, true);
    if (x.offer) return add("offer", { a: name(who), k: x.offer === "peace" ? "peace" : x.offer === "pact" ? "a pact of non-aggression" : treatyName(x.offer) }, true);
    if (!x.ok && kind === "no") return add("no", { a: name(a), b: name(b), k: treatyName(n) });
    if (!x.ok && x.verb === "PEACE" && /, which refuses/.test(x.text)) return add("nopeace", { a: name(who), b: (x.text.match(/^[^:]+: asks (.+?) for peace/) || [])[1] || "its enemy" });
    if (!x.ok) return mine && who === me && x.verb ? items.push({ key: "plain", home: true, text: `An order was not carried out: ${bare(x.text.replace(/^[^:]+: /, ""))}.` }) : null;
    if (x.asks) return add("asks", { a: name(x.asks[0]), b: name(x.asks[1]), p: place(x.asks[2]), d: wordDate(x.asks[3]) });
    if (x.crisis) return add(x.crisis[0], { a: name(x.crisis[1]), b: name(x.crisis[2]), p: place(x.land) });
    if (x.check && x.verb === "ATTACK") return add(x.check.band, { a: name(who), b: name(b), p: place(x.at) });
    if (kind === "war" && x.verb === "WAR") { const text = fill("war", { a: name(a), b: name(b) }, i); war = { by: a, on: name(b), who: [], base: text, item: { key: "war", home: mine, text } }; return items.push(war.item); }
    if (kind === "war") {
      // those who join a war just declared read as one sentence with it
      if (war?.by !== b) { war = { by: b, on: "", who: [], base: "", item: { key: "war", home: false, text: "" } }; items.push(war.item); }
      war.who.push(name(a)); war.item.home ||= mine;
      const many = war.who.length > 1, v = { j: list(war.who), b: war.on, a: name(b), take: many ? "take" : "takes", join: many ? "join" : "joins", their: many ? "their" : "its", ies: many ? "ies" : "y", s: many ? "" : "s" };
      war.item.text = `${war.base} ${(war.on ? draw(T.joins, `joins:${war.by}`) : T.joins[1]).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "")}`.trim();
      return null;
    }
    if (kind === "peace") return add(/white peace/.test(x.text) ? "white" : "peace", { a: name(a), b: name(b) });
    if (kind === "treaty") { const [p, q] = b === me ? [b, a] : [a, b]; add("treaty", { a: name(p), b: name(q), k: treatyName(n) }); if (mine && !said.has(n === "trade")) { said.add(n === "trade"); items[items.length - 1].text += means(n); } return null; }
    if (kind === "no") return add("no", { a: name(a), b: name(b), k: treatyName(n) });
    if ((kind === "peace" || kind === "pact") && b === me) return add(/white peace/.test(x.text) ? "white" : kind, { a: name(b), b: name(a) });
    if (kind === "formed") return add("formed", { a: name(a), b: name(b), n, s: n > 1 ? "s" : "" });
    if (T[kind] && kind !== "took") return add(kind, { a: name(a), b: name(b) });
    if (x.mission) return items.push({ key: "plain", home: true, text: `${bare(x.text)}.` });
    const m = String(x.text || "").match(/^([^:]{1,60}): (.+)$/);
    if (!m || !who || /played again after a take-back/.test(x.text)) return null;
    return items.push({ key: "plain", home: mine, text: plain(m[1], m[2]) });
  });
  const rank = (x) => { const k = ORDER.indexOf(x.key); return k < 0 ? ORDER.length : k; };
  const home = items.filter((x) => x.home).map((x) => x.text), far = items.filter((x) => !x.home).sort((x, y) => rank(x) - rank(y)), abroad = far.slice(0, 7).map((x) => x.text);
  const beat = (g.beats || []).find(([, t]) => t === entry.turn), told = beat && (BEATS.find(([id]) => id === beat[0])?.[2] || (g.script || []).find((s) => s.id === beat[0])?.text), colour = told && !/player/.test(told) ? told : "";
  home.unshift(...(home.length ? [] : [fill(abroad.length ? "calm" : "quiet", { span, me: name(me) }, "quiet")]));
  if (colour && home.length < 3) home.push(`${cap(colour.replace(/[.!?]$/, ""))}.`);
  return { lead: (home[0] || abroad[0]).slice(0, 200), home, abroad, more: far.length - abroad.length, span };
}
