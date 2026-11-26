// SPDX-License-Identifier: AGPL-3.0-or-later
// Overlays: how an alternate history is laid over the real map. A preset names which country holds which province,
// which countries exist and what they are called, and which land is disputed; with an opening, wars, treaties and
// facts that makes a scenario. Applying one is plain bookkeeping on the map: the same preset gives the same world everywhere.
// An alternate history is fiction: a world that never was. Leaders are offices, and no real living person is written in.

const CODE = /^[A-Z]{3}$/, COLOUR = /^#[0-9a-f]{6}$/i;
const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v) => (Array.isArray(v) ? v : []), dict = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * The part of a scenario or a save (`alt`) that makes an alternate world, checked before use: where history turned, the
 * countries that are new or renamed (`lands`), the map's countries that do not exist (`gone`), and disputed land
 * (`drop`: the map's own disputes to leave out, by name or "all"; `add`: new ones, each a name, a note in the map's
 * form "Held by X. Claimed by Y." and its provinces). Returns null when there is none.
 */
export function checkAlt(w, isCountry, isProvince) {
  if (!w || typeof w !== "object") return null;
  const lands = {};
  for (const [c, l] of Object.entries(dict(w.lands)).slice(0, 80)) {
    const name = text(l?.name, 40);
    if (CODE.test(c) && name) lands[c] = COLOUR.test(l.colour || "") ? { name, colour: l.colour } : { name };
  }
  const d = dict(w.disputes);
  return {
    turn: text(w.turn, 240), lands, gone: list(w.gone).filter((c) => isCountry(c)).slice(0, 220),
    disputes: {
      drop: d.drop === "all" ? "all" : list(d.drop).map((n) => text(n, 60)).filter(Boolean).slice(0, 80),
      add: list(d.add).map((a) => ({ name: text(a?.name, 60), note: text(a?.note, 200), provinces: list(a?.provinces).filter((id) => isProvince(id)).slice(0, 40) })).filter((a) => a.name && a.provinces.length).slice(0, 24),
    },
  };
}
/** Every piece of text in a world of its own, for the hard-line check. */
export const altText = (w) => (w ? [w.turn, ...Object.values(w.lands).map((l) => l.name), ...w.disputes.add.flatMap((a) => [a.name, a.note])] : []);

/**
 * Lay a preset over a map and give the scenario it makes, or say what is wrong with it. Strict: a preset that names
 * a province or a country the map does not have is refused whole, never half applied.
 * map: {countries: {code: name}, provinces: every province as {id, country}}, as maps/world.json holds them.
 * The preset is shaped like a scenario: {id, kind, title, blurb, opening, start, turn, balance, overlay}, and its overlay is
 * {lands: {code: [name, colour]}, merge: {holder: [countries]}, give: {holder: [province ids]} (a province given
 * wins over its country merged), disputes, wars: ["A|B"], treaties: {kind: ["A|B"]}, might: {code: 1 to 10},
 * offices: {code: "who leads, as an office"}, facts: [text]}.
 */
export function presetScenario(preset, map) {
  const p = { ...dict(preset?.overlay), id: preset?.id };
  const no = (why) => ({ ok: false, why: `Preset ${typeof p?.id === "string" ? p.id : "without an id"}: ${why}.` });
  if (!preset || typeof preset !== "object" || !preset.overlay || !/^[a-z][a-z0-9-]{1,40}$/.test(p.id || "")) return no("it needs an overlay and a short lower-case id");
  if (!text(preset.title, 60) || !text(preset.opening, 1000) || !text(preset.turn, 240)) return no("it needs a title, an opening and the point where history turned");
  const lands = {};
  for (const [c, v] of Object.entries(dict(p.lands))) {
    const [name, colour] = [].concat(v);
    if (!CODE.test(c) || !text(name, 40)) return no(`the country ${c} needs a three-letter code and a name`);
    lands[c] = COLOUR.test(colour || "") ? { name: text(name, 40), colour } : { name: text(name, 40) };
  }
  const all = [...map.provinces].map((q) => [q.id, q.home || q.country]), ids = new Set(all.map(([id]) => id)), had = new Set(all.map(([, c]) => c));
  const known = (c) => had.has(c) || Object.hasOwn(lands, c), into = new Map(), given = new Map();
  for (const [holder, some] of Object.entries(dict(p.merge))) for (const c of list(some)) {
    if (!known(holder) || !had.has(c) || c === holder || into.has(c)) return no(`${c} cannot be merged into ${holder}`);
    into.set(c, holder);
  }
  for (const holder of into.values()) if (into.has(holder)) return no(`${holder} takes in countries and is itself merged away`);
  for (const [holder, some] of Object.entries(dict(p.give))) for (const id of list(some)) {
    if (!known(holder) || into.has(holder) || !ids.has(id) || given.has(id)) return no(`the province ${id} cannot be given to ${holder}`);
    given.set(id, holder);
  }
  // the overlay itself: one pass over the map, in the map's own order
  const owners = {}, holds = new Set();
  for (const [id, home] of all) { const o = given.get(id) || into.get(home) || home; holds.add(o); if (o !== home) owners[id] = o; }
  for (const c of Object.keys(lands)) if (!holds.has(c)) return no(`${c} is named but holds no land`);
  const pairs = (some) => list(some).map((x) => String(x).split("|").sort()), bad = (ps) => ps.find((x) => x.length !== 2 || x[0] === x[1] || !x.every((c) => holds.has(c)));
  const wars = pairs(p.wars), treaties = Object.entries(dict(p.treaties)).flatMap(([kind, some]) => pairs(some).map((x) => ({ pair: x.join("|"), kind })));
  const off = bad(wars) || bad(treaties.map((t) => t.pair.split("|"))) || [...Object.keys(dict(p.might)), ...Object.keys(dict(p.offices))].find((c) => !holds.has(c));
  if (off) return no(`${[].concat(off).join("|")} names a country that holds no land in this world`);
  const d = dict(p.disputes), add = list(d.add);
  if (add.some((a) => !text(a?.name, 60) || !list(a.provinces).length || list(a.provinces).some((id) => !ids.has(id)))) return no("a disputed area needs a name and provinces the map has");
  // who leads, as offices: folded into facts the AI is told every turn
  const name = (c) => lands[c]?.name || map.countries[c] || c, lead = [];
  for (const [c, office] of Object.entries(dict(p.offices))) {
    const one = `${name(c)} (${c}): ${text(office, 120)}`;
    if (lead.length && lead[lead.length - 1].length + one.length < 330) lead[lead.length - 1] += `; ${one}`; else lead.push(one);
  }
  const facts = [...lead.map((l) => `Who leads, by office (every holder is an invented person): ${l}.`), ...list(p.facts)].map((t) => ({ text: t }));
  return { ok: true, scenario: {
    kind: "capo-scenario", v: 1, id: p.id, title: preset.title, blurb: preset.blurb, opening: preset.opening, start: preset.start, balance: preset.balance,
    owners, wars: wars.map((x) => ({ pair: x.join("|") })), treaties, facts, might: { ...dict(p.might) },
    alt: { turn: preset.turn, lands, gone: [...had].filter((c) => !holds.has(c)).sort(), disputes: { drop: d.drop === "all" ? "all" : list(d.drop), add } },
  } };
}

/**
 * Lay every preset that has an overlay over the loaded map, in place: afterwards each is a whole scenario (owners,
 * wars, treaties, facts, might, alt) and keeps its `kind`. check(scenario) is the same gate a scenario file passes
 * (checkScenario and the hard line); a preset that fails is marked `broken` with the reason, and cannot be chosen.
 */
export function layPresets(presets, map, check) {
  map = { countries: map.countries, provinces: [...map.provinces] };
  for (const p of presets) {
    if (!p.overlay) continue;
    const made = presetScenario(p, map), r = made.ok ? check(made.scenario) : made;
    if (r.ok) { Object.assign(p, r.scenario, { kind: p.kind }); delete p.overlay; } else p.broken = r.why;
  }
  return presets;
}

/**
 * Put a world's own borders and names under a loaded map: each province's home country and each country's name.
 * base: {province id: country} for the provinces that differ; lands: {code: {name}}. Called with neither, the map
 * is the plain map again. Everything that reads the map afterwards sees that world and needs no other change.
 */
export function rebase(world, base, lands) {
  world.names = world.names || world.countries;
  world.countries = { ...world.names, ...Object.fromEntries(Object.entries(lands || {}).map(([c, l]) => [c, l.name])) };
  for (const p of world.provinces.values()) { p.home = p.home || p.country; p.country = base?.[p.id] || p.home; }
}

// ---- what the AI is told when the world is not ours ----
export const ALT_RULES = [
  "- This story is an alternate history: its world is not the real present day, whatever the first line says, and never happened. Where it differs from real history, FACTS and PLACES are right, and whatever you remember of the real world from after the turning point did not happen here.",
  "- Keep to the date in FACTS: weapons, machines, money and daily life are those of that year, as this world's history would have them.",
  "- Call every leader by office, never by a real person's name. Anyone you name is invented. No real living person appears in this world.",
];
/** Lines for FACTS: the turning point, the countries that differ and those that are not there. size(code) -> provinces held. */
export function altLines(g, size = () => 0) {
  const w = g?.alt;
  if (!w) return [];
  const lands = Object.entries(w.lands).map(([c, l]) => `${c} ${l.name}`), gone = w.gone.filter((c) => !size(c));
  return [
    `- This world is an alternate history, invented for this story. Where history turned: ${w.turn}`,
    ...(lands.length ? [`- Countries that differ from our world, by code: ${lands.join(", ")}`] : []),
    ...(gone.length ? [`- Not countries in this world (others hold their land; never use these codes): ${gone.join(", ")}`] : []),
  ];
}
