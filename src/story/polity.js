// SPDX-License-Identifier: AGPL-3.0-or-later
// Polities that form: a rising that holds founds a new country. Rules only; the AI narrates.
// When a rising has stood a year unanswered (home.js) and its province cannot go back to an old holder, the rebel
// provinces leave: the province where it gathered and the provinces of the same country that touch it by land,
// in the map's own order, never the heartland, four at most and never more than half of what the country holds.
// They become a country: a three-letter code no map country uses, a name from the province and a fixed list of
// forms, a colour from a fixed list, might two below its parent's (held between 2 and 4), all dealt from the
// game's seed, so the same game founds the same country. It is kept in the game as g.lands[code] = {name, colour,
// from, since, seat}, and its land as owner entries like any other change of hands.
// What follows by rule: the two stand bitter (-2); a truce of two years holds between them, and for those two
// years a demand for the land back counts as already made; the parent holds a cause for five years (and, where the
// land was its own on the map, for as long as it is lost); the parent's unrest is over, its stability rises a
// step and its mandate falls one. From then on the new country is a country like any other: it moves by rule,
// answers treaties and demands, can be attacked, and can fall.
// A game holds forty founded countries at most; past that a rising costs mandate, as before.
import { hash32 } from "./line.js";
import { setCause } from "./state.js";
import { MIGHT, mightOf } from "./war.js";

export const POLITY = { most: 4, lands: 40, low: 2, high: 4, less: 2 };
export const FORMS = ["Republic of %", "Free State of %", "% Commonwealth", "% League", "% Confederation", "% Union"];
export const COLOURS = ["#b5651d", "#7a9e3f", "#3f8f8a", "#8f5fa8", "#c2783c", "#5a7fb8", "#a8a13f", "#b8577a", "#4f9a6b", "#9a6a4f", "#6f6fc0", "#c9933a", "#4a9ab0", "#a85f5f", "#7d8f4a", "#9a5fb0"];
const CODE = /^[A-Z]{3}$/, COLOUR = /^#[0-9a-f]{6}$/i, DATE = /^\d{4}-\d{2}-\d{2}$/, AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The countries founded in this game: {code: {name, colour, from, since, seat}}. */
export const landsOf = (g) => g?.lands || {};

/** A code for a new country: from the letters of its province's name, and never one the map, the table or the game uses. */
export function codeFor(g, geo, base) {
  const used = (c) => geo.known(c) || geo.name(c) !== c || Object.hasOwn(MIGHT, c) || Object.hasOwn(landsOf(g), c) || c === "YOU" || c === g.custom?.code || Object.hasOwn(g.alt?.lands || {}, c);
  const l = base.normalize("NFD").toUpperCase().replace(/[^A-Z]/g, "").padEnd(3, "X");
  const tries = [l.slice(0, 3), ...[...l.slice(3)].map((x) => l.slice(0, 2) + x), ...[...AZ].map((x) => l.slice(0, 2) + x), ...[...AZ].flatMap((x) => [...AZ].map((y) => l[0] + x + y))];
  return tries.find((c) => !used(c)) || "";
}

/** The provinces a rising would take with it: where it gathered first, then that country's land touching it. */
export function rebelLand(geo, c, id) {
  const held = geo.holds(c), home = geo.home?.(c);
  if (held < 2 || id === home || geo.owner(id) !== c) return [];
  const most = Math.max(1, Math.min(POLITY.most, Math.floor(held / 2)));
  return [id, ...geo.neighbours(id).filter((n) => n !== home && geo.owner(n) === c).sort()].slice(0, most);
}

/**
 * A rising founds a country on the day `to`. c: the country it rose in; u: its unrest {id, who}. Changes g and
 * returns {code, name, ids}, or null when no country can be founded (its last land, its heartland, no code left).
 */
export function found(g, geo, c, u, to) {
  const ids = rebelLand(geo, c, u.id), place = geo.place(u.id)?.name || "", code = ids.length && Object.keys(landsOf(g)).length < POLITY.lands ? codeFor(g, geo, place) : "";
  if (!code) return null;
  const taken = new Set(Object.values(landsOf(g)).map((l) => l.colour)), free = COLOURS.filter((x) => !taken.has(x)), pool = free.length ? free : COLOURS;
  const name = FORMS[hash32(g.seed, `polity:form:${u.id}:${to}`) % FORMS.length].replace("%", place), pair = [c, code].sort().join("|");
  const might = Math.max(POLITY.low, Math.min(POLITY.high, mightOf(geo, c) - POLITY.less));
  g.lands = { ...landsOf(g), [code]: { name, colour: pool[hash32(g.seed, `polity:colour:${u.id}:${to}`) % pool.length], from: c, since: to, seat: u.id } };
  for (const id of ids) g.owners[id] = code;
  g.might = { ...(g.might || {}), [code]: might };
  g.rel = { ...(g.rel || {}), [pair]: [-2, to] };
  g.truce = { ...(g.truce || {}), [pair]: to };
  g.asked = { ...(g.asked || {}), [`${c}>${code}`]: to };
  setCause(g, c, code, `the secession of ${to.slice(0, 4)}`, to);
  return { code, name, ids };
}

/** A line for the prompt: the countries founded in this story, newest first, six named and the rest counted. */
export function polityLines(g, geo) {
  const all = Object.entries(landsOf(g)).filter(([c]) => geo.holds(c)).sort(([, a], [, b]) => (a.since < b.since ? 1 : -1)), shown = all.slice(0, 6);
  return all.length ? [`- Countries founded in this story by a rising, real in it, by code: ${shown.map(([c, l]) => `${c} ${l.name} (broke from ${l.from} in ${l.since.slice(0, 4)})`).join("; ")}${all.length > shown.length ? `; and ${all.length - shown.length} more` : ""}`] : [];
}

/** Founded countries from a save or a scenario: a code, a name, a colour, and where and when each began. */
export function keepLands(s, isProvince = () => true) {
  const out = {};
  for (const [c, l] of Object.entries(s?.lands && typeof s.lands === "object" && !Array.isArray(s.lands) ? s.lands : {}).slice(0, POLITY.lands)) {
    if (!CODE.test(c) || !l || typeof l.name !== "string" || !l.name.trim()) continue;
    out[c] = { name: l.name.trim().slice(0, 60), colour: COLOUR.test(l.colour || "") ? l.colour : COLOURS[0], from: CODE.test(l.from || "") ? l.from : "", since: DATE.test(l.since || "") ? l.since : "", ...(typeof l.seat === "string" && isProvince(l.seat) ? { seat: l.seat } : {}) };
  }
  return out;
}
