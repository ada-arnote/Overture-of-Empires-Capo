// SPDX-License-Identifier: AGPL-3.0-or-later
// The check (ruling 124): one whole-number roll against a chance out of 100, with three results.
//   chance = 50 + 10 x (skill - difficulty) + approach + named modifiers, held between 10 and 75
//   roll 1 to 100: at or under the chance, clean; up to 20 over, costly; higher, failed
// So no plan is certain: at 75, rolls of 96 to 100 still fail (5 in 100). At 10, a clean result is still possible.
// Every roll is named (turn, mission, checkpoint, person) and drawn from the game's seed, so it replays exactly and
// changing one step leaves every other roll alone. The AI never rolls: it tells what the check decided.
import { draw100 } from "./line.js";

export const LOW = 10, HIGH = 75, COSTLY = 20, MOST_PARTS = 4;
export const BANDS = ["clean", "costly", "failed"];
// Which rules a game is played under. 2: attacks on the check, with odds out of 100 and a commander (ruling 124).
// 3: relations and treaty answers by rule, a chronicle, one skill a person dealt by rule, take-backs on numbered lines.
// 4: people and threads remembered by code, peace answered by rule, wars that end by rule with a truce, strength that
// changes, other countries moving by rule when no AI proposes for them, the player's moves reviewed, both endings told.
export const RULES = 4;

/** A roll's name: the same name always draws the same number in the same game. */
export const drawKey = ({ turn, mission, checkpoint = "main", person = "-" }) => `${turn}:${mission}:${checkpoint}:${person}`;

const whole = (n, what) => {
  if (!Number.isInteger(n)) throw new Error(`${what} must be a whole number, not ${n}`);
  return n;
};

/**
 * The chance, out of 100, with its labelled parts. approach is [name, value] or null; parts are [label, value]
 * pairs, at most four, none of them zero. skill and difficulty are whole numbers on the same scale.
 */
export function chanceOf({ skill, difficulty, approach = null, parts = [] }) {
  whole(skill, "skill"); whole(difficulty, "difficulty");
  const kept = parts.filter(([, n]) => whole(n, "a modifier") !== 0);
  if (kept.length > MOST_PARTS) throw new Error(`a check takes at most ${MOST_PARTS} modifiers`);
  const base = 50 + 10 * (skill - difficulty), lean = approach ? whole(approach[1], "the approach") : 0;
  const raw = base + lean + kept.reduce((s, [, n]) => s + n, 0);
  return { base, raw, chance: Math.min(HIGH, Math.max(LOW, raw)), approach, parts: kept };
}

/** Which of the three results a roll gives at a chance. */
export const bandOf = (chance, roll) => (roll <= chance ? "clean" : roll <= chance + COSTLY ? "costly" : "failed");

/** The odds before the order, out of 100: they add up to 100 and are exactly what the check will do. */
export const odds = (chance) => ({ clean: chance, costly: Math.min(COSTLY, 100 - chance), failed: Math.max(0, 100 - chance - COSTLY) });
export const oddsLine = (chance) => { const o = odds(chance); return `clean ${o.clean} in 100, costly ${o.costly}, failed ${o.failed}`; };

/**
 * Make one check and return its beat record, all whole numbers and short words, ready to store and to replay.
 * plan: {turn, mission, checkpoint, person, who, role, skill, difficulty, approach, parts}.
 */
export function check(seed, plan) {
  const c = chanceOf(plan), key = drawKey(plan), roll = draw100(seed, key);
  return { key, who: plan.who || plan.person || "", role: plan.role || "", skill: plan.skill, difficulty: plan.difficulty, approach: c.approach, parts: c.parts, chance: c.chance, roll, band: bandOf(c.chance, roll) };
}

/** Whether a stored beat recomputes to the same chance, roll and result under these rules. */
export function replays(seed, beat) {
  const c = chanceOf(beat), roll = draw100(seed, beat.key);
  return c.chance === beat.chance && roll === beat.roll && bandOf(c.chance, roll) === beat.band;
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
/** The parts in words: "Marshal Ana Ruiz +8, bold +10, its own land +15". */
export const partsLine = (beat) => [...(beat.approach && beat.approach[1] ? [`${beat.approach[0]} ${signed(beat.approach[1])}`] : []), ...beat.parts.map(([l, n]) => `${l} ${signed(n)}`)].join(", ");
/** The receipt's numbers: "might 5 against 4, bold +10: chance 70; drew 83; costly". */
export const checkLine = (beat, scale = "skill") => {
  const extra = partsLine(beat);
  return `${scale} ${beat.skill} against ${beat.difficulty}${extra ? `, ${extra}` : ""}: chance ${beat.chance}; drew ${beat.roll}; ${beat.band}`;
};
