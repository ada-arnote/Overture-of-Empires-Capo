// SPDX-License-Identifier: AGPL-3.0-or-later
// A legacy campaign: a run of 5 or 10 games where each game leaves marks the next one keeps (early: the basic structure).
// The record is a plain file every player holds: the story it follows, the rules version it began on, and each finished
// game's seed and moves, with the one choice made after it. Points, marks and opened seals are never stored: they are
// folded again from the record, game by game, so a campaign replays the same on every machine and a file cannot lie.
//
// A game's legacy layer (for Brass and Banners: src/games/banners/legacy.js) gives:
//   game                 the game's id
//   rules                { version: game }   every rules version a campaign may be pinned to
//   story                { id, tale, title, lengths, seats, pool, rewards, seals, chapters }   plain data
//   optionsFor(record, state, n)   the options of game n, marks included
//   factsOf(match, steps, n)       what a finished game leaves: { game, winners, order, out, strongest, happened, slots }
import { canon } from "./canon.js";
import { fingerprint } from "./digest.js";
import { Refusal, createMatch, readOptions } from "./match.js";

export const CAMPAIGN = 1;
const KIND = "capo-campaign", MOST = 4000000, KINDS = ["you", "normal", "easy", "hard"];
const FIELDS = "format,game,games,id,kind,length,print,rules,seats,story,takeBacks,tale,who";
/** The only tests a seal may open on, judged on a finished game: no expressions, no code. */
export const TESTS = ["after_game", "first", "wins"];
const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const notOne = () => new Refusal("file", "that is not a campaign file");

/** A new campaign record, before its first game. Pinned to the newest rules version unless one is named. */
export function beginCampaign(legacy, { id, length, seats, who, rules = newest(legacy) }) {
  const s = legacy.story;
  if (typeof id !== "string" || !/^[a-z0-9]{4,24}$/.test(id)) throw new Refusal("campaign", "a campaign needs an id of letters and digits");
  if (!s.lengths.includes(length)) throw new Refusal("campaign", `${s.title} is ${s.lengths.join(" or ")} games long`);
  if (!s.seats.includes(seats)) throw new Refusal("campaign", `${s.title} is for ${s.seats.join(", ")} players`);
  if (!Array.isArray(who) || who.length !== seats || !who.every((k) => KINDS.includes(k))) throw new Refusal("campaign", "each seat needs a person or a bot");
  if (!legacy.rules[rules]) throw new Refusal("version", `there is no version ${rules} of these rules here`);
  return { format: CAMPAIGN, kind: KIND, game: legacy.game, rules, story: s.id, tale: s.tale, id, length, seats, who: [...who], games: [], takeBacks: 0 };
}
const newest = (legacy) => Object.keys(legacy.rules).sort((a, b) => b.length - a.length || (b > a ? 1 : -1))[0];

/** The state before any game: no marks, no points. */
function opening(story, record) {
  const n = record.seats;
  return { game: 1, over: false, points: Array(n).fill(0), wins: Array(n).fill(0), signed: [], switches: { ...story.switches }, names: [], works: [], bonus: Array(n).fill(0), opened: [], used: [] };
}

/** Does a seal open after this game? */
export function opens(when, facts, state) {
  if (when.test === "after_game") return facts.game === when.n;
  if (when.test === "first") return facts.happened.includes(when.what);
  if (when.test === "wins") return state.wins.some((w) => w >= when.n);
  return false;
}
/** A place a mark names: a number, or a slot the facts fill ("@fallen_capital"). -1 when the game left it empty. */
const placeOf = (at, facts) => (typeof at === "string" && at[0] === "@" ? facts.slots[at.slice(1)] ?? -1 : at);

/**
 * One finished game folded into the campaign: points, a name, a bonus for the next game, and the seals it opens.
 * name: the winner's pick from the story's pool, or null for the first not yet used. Returns { state, opened, named }.
 */
export function advance(story, state, facts, name = null) {
  const s = structuredClone(state), r = story.rewards, n = facts.game, seats = s.points.length, opened = [];
  for (let seat = 0; seat < seats; seat++) {
    if (facts.winners.includes(seat)) { s.points[seat] += r.win; s.wins[seat]++; s.signed.push([seat, n]); } else if (!facts.out.includes(seat)) s.points[seat] += r.live;
  }
  // the winner names the province they held strongest at the end; a word on the map from then on
  const w = facts.winners[0], at = w === undefined ? -1 : facts.strongest[w];
  let named = null;
  if (at >= 0) {
    const free = story.pool.findIndex((_, i) => !s.used.includes(i)), pick = name ?? free;
    if (!Number.isInteger(pick) || pick < 0 || pick >= story.pool.length || s.used.includes(pick)) throw new Refusal("campaign", `game ${n}: that name is not in the story's list, or is taken`);
    s.names = [...s.names.filter((x) => x[0] !== at), [at, story.pool[pick], w, n]];
    s.used.push(pick);
    named = [at, story.pool[pick], w];
  } else if (name !== null) throw new Refusal("campaign", `game ${n}: nothing was there to name`);
  // the seat that placed last starts the next game with more, unless it leads the campaign: catch-up is given, never taken
  s.bonus = Array(seats).fill(0);
  const last = facts.order[facts.order.length - 1], top = Math.max(...s.points);
  if (last !== undefined && !facts.winners.includes(last) && s.points[last] < top) s.bonus[last] = r.bonus;
  for (const seal of story.seals) {
    if (s.opened.includes(seal.id) || !opens(seal.when, facts, s)) continue;
    s.opened.push(seal.id);
    opened.push(seal.id);
    for (const d of seal.do) {
      if (d.kind === "SWITCH") s.switches[d.name] = d.value;
      else if (d.kind === "WORK") { const p = placeOf(d.place, facts); if (p >= 0) s.works = [...s.works.filter((x) => x[0] !== p), [p, d.what, n]]; }
    }
  }
  s.game = n + 1;
  s.over = n >= story.length;
  return { state: s, opened, named };
}

/** Replay a whole campaign from its record. Returns { state, played: [{ facts, opened, named }] }, or refuses. */
export function foldCampaign(legacy, record) {
  const game = legacy.rules[record.rules], story = { ...legacy.story, length: record.length };
  if (!game) throw new Refusal("version", `this campaign is pinned to version ${String(record.rules).slice(0, 12)} of these rules, which this copy does not have. A campaign keeps the rules it began with`);
  let state = opening(story, record);
  const played = [];
  record.games.forEach((g, i) => {
    const n = i + 1, m = createMatch(game, { options: legacy.optionsFor(record, state, n), seed: g.seed }), steps = [];
    g.moves.forEach((move, k) => {
      const before = m.position;
      try { steps.push({ before, events: m.play(move) }); } catch (e) {
        if (e instanceof Refusal) throw new Refusal("campaign", `game ${n}, move ${k + 1}: ${e.message}`);
        throw e;
      }
    });
    if (m.result === null) throw new Refusal("campaign", `game ${n} was not played to its end`);
    if (m.fingerprint() !== g.end) throw new Refusal("campaign", `game ${n}'s moves lead somewhere other than the file says`);
    const facts = legacy.factsOf(m, steps, n), made = advance(story, state, facts, g.name);
    state = made.state;
    played.push({ facts, opened: made.opened, named: made.named });
  });
  return { state, played };
}

/** The game to play next: { n, seed, options, game }, or null when the campaign is over. */
export function nextGame(legacy, record, state) {
  if (state.over || record.games.length >= record.length) return null;
  const n = record.games.length + 1;
  return { n, seed: `${record.id}/${n}/${record.takeBacks}`, options: legacy.optionsFor(record, state, n), game: legacy.rules[record.rules] };
}

/** A finished match added as the campaign's next game. Refuses a match that is not that game. Returns a new record. */
export function addGame(legacy, record, match) {
  const { state } = foldCampaign(legacy, record), want = nextGame(legacy, record, state);
  if (!want) throw new Refusal("campaign", "this campaign is over");
  if (match.game.version !== record.rules || match.seed !== want.seed || canon(match.options) !== canon(readOptions(want.game, want.options))) throw new Refusal("campaign", `that game is not game ${want.n} of this campaign`);
  if (match.result === null) throw new Refusal("campaign", "that game is not over");
  const next = { ...record, games: [...record.games, { seed: match.seed, moves: match.list, end: match.fingerprint(), name: null }] };
  foldCampaign(legacy, next);
  return next;
}

/** The winner's name for the last game, chosen from the story's pool. Only while it is the last game. Returns a new record. */
export function nameLast(legacy, record, pick) {
  if (!record.games.length) throw new Refusal("campaign", "no game has been played");
  const games = [...record.games], last = games.length - 1;
  games[last] = { ...games[last], name: pick };
  const next = { ...record, games };
  foldCampaign(legacy, next);
  return next;
}

/** Take back the whole last game, by everyone's agreement. It is counted, the count is shown, and the game is dealt anew. */
export function takeBack(record) {
  if (!record.games.length) throw new Refusal("campaign", "no game to take back");
  return { ...record, games: record.games.slice(0, -1), takeBacks: record.takeBacks + 1 };
}

/** The file: the record written the one exact way, with its fingerprint. */
export function writeCampaign(record) {
  const { print, ...rest } = record;
  return canon({ ...rest, print: fingerprint(rest) });
}

/** Open a campaign file: checked, pinned to its rules version, and replayed. Returns { record, state, played }. */
export function readCampaign(text, legacy) {
  if (typeof text !== "string" || text.length > MOST) throw new Refusal("file", "that file is too large or not text");
  let f;
  try { f = JSON.parse(text); } catch { throw notOne(); }
  if (!plain(f) || Object.keys(f).sort().join() !== FIELDS || f.kind !== KIND) throw notOne();
  if (f.format !== CAMPAIGN) throw new Refusal("format", "this campaign was made by a different version of these games");
  if (f.game !== legacy.game) throw new Refusal("game", "this campaign is for another game. Open it from that game's page");
  if (f.story !== legacy.story.id || f.tale !== legacy.story.tale) throw new Refusal("story", "this campaign follows a story, or a version of it, that this copy does not have");
  const { print, ...rest } = f;
  let kept = false;
  try { kept = fingerprint(rest) === print; } catch { throw notOne(); }
  if (!kept) throw new Refusal("file", "this campaign file was changed after it was saved");
  const seatsOk = legacy.story.seats.includes(f.seats) && Array.isArray(f.who) && f.who.length === f.seats && f.who.every((k) => KINDS.includes(k));
  const gamesOk = Array.isArray(f.games) && f.games.length <= f.length && f.games.every((g) => plain(g) && Object.keys(g).sort().join() === "end,moves,name,seed" && typeof g.seed === "string" && Array.isArray(g.moves) && typeof g.end === "string" && (g.name === null || Number.isInteger(g.name)));
  if (typeof f.id !== "string" || !legacy.story.lengths.includes(f.length) || !seatsOk || !gamesOk || !Number.isInteger(f.takeBacks) || f.takeBacks < 0 || typeof f.rules !== "string") throw notOne();
  const { state, played } = foldCampaign(legacy, rest);
  return { record: rest, state, played };
}

/** Who leads: seats by points, then wins, best first. Level seats share a place. */
export function standings(state) {
  const order = state.points.map((_, s) => s).sort((a, b) => state.points[b] - state.points[a] || state.wins[b] - state.wins[a] || a - b);
  return order.map((seat) => ({ seat, points: state.points[seat], wins: state.wins[seat], place: 1 + order.filter((o) => state.points[o] > state.points[seat] || (state.points[o] === state.points[seat] && state.wins[o] > state.wins[seat])).length }));
}
