// SPDX-License-Identifier: AGPL-3.0-or-later
// Fictional settings: worlds of our own for Capo's story game. A setting is a recipe (src/map/worlds.js holds the
// starters) and a seed; together they always make the same world. This file checks a setting read from a file, makes
// and keeps the world a game is set on, and turns a setting into a scenario with its might and its facts for the AI.
// The rules are the ones every game uses: might, relations, wars, treaties, the check.
import { GEN, makeWorld } from "../map/worldgen.js";
import { SETTINGS } from "../map/worlds.js";
import { crosses } from "./line.js";

const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const whole = (v, lo, hi, d) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : d);
const sounds = (l) => Array.isArray(l) && l.length >= 2 && l.length <= 24 && l.every((x) => typeof x === "string" && /^[a-z']{1,6}$/.test(x));
const SEED = /^[a-z0-9]{1,12}$/;

/**
 * Check a setting read from a file before anything uses it. Returns {ok: true, setting} with only the parts that
 * passed, or {ok: false, why}. Numbers are held to their ranges; a part that cannot be read refuses the whole file.
 */
export function checkSetting(s) {
  const no = (why) => ({ ok: false, why });
  if (!s || s.kind !== "capo-setting" || s.v !== 1) return no("That file is not a Capo setting.");
  const title = text(s.title, 60), premise = text(s.premise, 700);
  if (!title || !premise) return no("The setting needs a title and a premise.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.start || "") || Number.isNaN(Date.parse(`${s.start}T00:00:00Z`))) return no("The setting's start date is not a date.");
  if (!Array.isArray(s.cultures) || !s.cultures.length || s.cultures.length > 6 || !s.cultures.every((c) => c && text(c.name, 24) && [c.a, c.b, c.c, c.z].every(sounds))) return no("Each culture in a setting needs a name and four lists of sounds, in small letters.");
  const cultures = s.cultures.map((c) => ({ name: text(c.name, 24), a: c.a, b: c.b, c: c.c, z: c.z })), form = (t) => typeof t === "string" && t.length <= 40 && t.split("*").length === 2;
  const factions = Array.isArray(s.factions) ? s.factions : [], minors = Array.isArray(s.minors) ? s.minors : [];
  if (factions.length > 12 || minors.length > 8 || !factions.every((x) => x && form(x.name)) || !minors.every(form)) return no("A faction's name must be short and hold one * where its made name goes.");
  const blobs = Array.isArray(s.blobs) ? s.blobs : [];
  if (blobs.length > 12 || !blobs.every((b) => Array.isArray(b) && b.length === 4 && b.every((n) => Number.isInteger(n) && n >= 0 && n <= 100))) return no("The setting's land shapes are not four whole numbers each, from 0 to 100.");
  const out = {
    kind: "capo-setting", v: 1, id: text(s.id, 24).replace(/[^a-z0-9-]/g, "") || "own", title, blurb: text(s.blurb, 200), where: text(s.where, 120) || "a world of its own", premise, tone: text(s.tone, 300), level: text(s.level, 400), start: s.start,
    land: whole(s.land, 10, 60, 35), rough: whole(s.rough, 0, 100, 50), blobs, isles: whole(s.isles, 0, 40, 0), provinces: whole(s.provinces, 40, 400, 240), realms: whole(s.realms, 2, 24, 12), reach: whole(s.reach, 2, 16, 7), cultures,
    factions: factions.map((x) => ({ name: x.name, culture: whole(x.culture, 0, cultures.length - 1, 0), size: whole(x.size, 1, 6, 1), might: whole(x.might, 1, 10, 4), at: whole(x.at, 0, 2, 0), what: text(x.what, 160) })), minors,
  };
  if (settingText(out).some(crosses)) return no("That setting is refused: nothing sexual involving minors.");
  return { ok: true, setting: out };
}
const settingText = (s) => [s.title, s.blurb, s.where, s.premise, s.tone, s.level, ...s.cultures.map((c) => c.name), ...s.factions.flatMap((x) => [x.name, x.what]), ...s.minors];

const settingOf = (v) => (typeof v === "string" ? SETTINGS.find((s) => s.id === v) || null : (checkSetting(v).setting || null));
/** Which world a game or scenario is played on, checked: {setting (a starter's id, or a whole setting), seed, gen, where}, or null. */
export function worldRef(r) {
  const s = r && typeof r.seed === "string" && SEED.test(r.seed) && (r.gen === undefined || r.gen === GEN) ? settingOf(r.setting) : null;
  return s ? { setting: typeof r.setting === "string" ? s.id : s, seed: r.seed, gen: GEN, where: `${s.title}, ${s.where}. Everything in it is invented: no real country, person or event exists there, and nothing from anyone else's fiction` } : null;
}
export const worldKey = (r) => (r ? `${typeof r.setting === "string" ? r.setting : JSON.stringify(r.setting)}/${r.seed}` : "");

const made = [];
/** The world a reference stands for, made once and kept: {key, data (as maps/world.json), might, facts}, or null. */
export function madeWorld(r) {
  const ref = worldRef(r), key = worldKey(ref), hit = made.find((m) => m.key === key);
  if (!ref || hit) return hit || null;
  const s = settingOf(ref.setting), data = makeWorld(s, ref.seed), line = (x) => `${x.name} (${x.code})`;
  const great = data.realms.filter((x) => x.faction >= 0), small = data.realms.filter((x) => x.faction < 0), facts = [`Tone: ${s.tone}`, `What exists: ${s.level}`, `Peoples: ${s.cultures.map((c) => c.name).join(", ")}. New names of people and places follow the sounds of the names on the map.`];
  // the powers, a few to a fact so no fact outgrows what a scenario file may hold
  for (let i = 0; i < great.length; i += 3) facts.push(`Powers: ${great.slice(i, i + 3).map((x) => `${line(x)}, ${s.factions[x.faction].what}`).join("; ")}.`.slice(0, 400));
  for (let i = 0; i < small.length; i += 9) facts.push(`Lesser countries: ${small.slice(i, i + 9).map(line).join(", ")}.`.slice(0, 400));
  // features hook (ruling 143): the lie of the land, as one story fact; no rule reads terrain
  const lie = Object.entries(Object.values(data.terrain || {}).reduce((n, t) => ({ ...n, [t]: (n[t] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (lie.length) facts.push(`The land: mostly ${lie.slice(0, 3).map(([t]) => t).join(", ")}, with ${lie.slice(3).map(([t]) => t).join(", ")} in places. Each province has one of these as its terrain; let places feel like it.`);
  const out = { key, data, terrain: data.terrain || {}, facts: facts.filter((t) => t.length > 14).map((t) => ({ text: t, turn: 0 })), might: Object.fromEntries(data.realms.map((x) => [x.code, x.faction >= 0 ? s.factions[x.faction].might : x.size >= 12 ? 3 : 2])) };
  made.push(out); if (made.length > 3) made.shift();
  return out;
}

/** A setting as an entry in the list of scenarios, on a seed. */
export const settingScenario = (s, seed, own = false) => ({ id: `world-${s.id}`, kind: "fantasy", title: s.title, blurb: s.blurb, opening: s.premise, start: s.start, world: worldRef({ setting: own ? s.id : s, seed }) });
/**
 * A scenario ready to start: one on an invented world gets that world's seed (its own, or another), might and facts.
 * A scenario saved from a game keeps the facts and might it was saved with.
 */
export function staged(s, seed) {
  if (!s?.world) return s;
  const world = worldRef({ ...s.world, seed: seed || s.world.seed }), m = madeWorld(world);
  return m ? { ...s, world, might: { ...m.might, ...s.might }, facts: s.facts?.length ? s.facts : m.facts } : s;
}
export const FANTASY = SETTINGS.map((s) => settingScenario(s, s.seed, true));
