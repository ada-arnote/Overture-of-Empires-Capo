// SPDX-License-Identifier: AGPL-3.0-or-later
// The template report: how a mission is told when no AI tells it. Lines are keyed by step and result, two a
// case, and chosen by a named draw from the game's seed, so the same record always reads the same and no text
// needs storing. {who} is the person sent, {where} the country. The numbers beside each line are the rules' own.
import { checkLine } from "./check.js";
import { hash32 } from "./line.js";

const NAMES = { scout: "scouting", sabotage: "sabotage", rescue: "rescue" }, GRADES = ["clean", "costly", "failed", "disaster"];
// the headline's short words: [clean, costly, failed]
const SHORT = {
  enter: ["in unseen", "in, but noticed", "turned back on the way in"],
  scout: ["the papers copied", "the papers copied, and missed", "nothing learned"],
  sabotage: ["the works wrecked", "the works wrecked, loudly", "the charge never set"],
  rescue: ["the cell opened", "the cell opened, with the guard roused", "the cell never reached"],
  leave: ["out clean", "out, but seen", "a fight on the way out"],
};
const TOLD = {
  enter: [
    ["{who} crosses into {where} on a market day, one face among hundreds.", "{who} is over the border before the night shift changes."],
    ["{who} gets into {where}, but a clerk looks twice at the papers.", "{who} is in, though a patrol saw someone on the ridge."],
    ["{who} is stopped at the crossing and sent back the way they came.", "The way into {where} is shut: checkpoints on every road, and {who} turns round."],
  ],
  scout: [
    ["{who} reads the ministry's files for an hour and leaves them as they lay.", "A talkative officer tells {who} more than the files would have."],
    ["{who} gets the papers, and leaves a broken lock behind.", "{who} learns what was wanted, from a source who will be missed by morning."],
    ["The safe holds old rosters and nothing else; {who} learns nothing.", "{who} waits two days for a contact who never comes."],
  ],
  sabotage: [
    ["The depot burns at dawn, and the first report blames the wiring.", "{who} leaves the rail junction jammed, with nothing to show who did it."],
    ["The depot burns, and so does any doubt that it was set.", "The charge goes off early: the damage is done, and the alarm with it."],
    ["The guard has been doubled; {who} never gets near the yard.", "The fuse is damp. Nothing burns, and {who} cannot stay to try again."],
  ],
  rescue: [
    ["{who} walks the prisoner out through the kitchens, dressed as staff.", "A forged order opens the cell, and nobody checks it until evening."],
    ["The cell is opened, but a shout goes up before they reach the street.", "{who} gets the prisoner out over the wall, and leaves a guard who saw both."],
    ["The prisoner was moved yesterday; the cell is empty.", "{who} cannot get past the inner gate, and has to leave without them."],
  ],
  leave: [
    ["{who} is home before anyone in {where} knows what happened.", "{who} leaves by the coast road, unhurried and unseen."],
    ["{who} gets out, with {where}'s police a street behind.", "{who} is across the border by dark, but the description is on every wall."],
    ["{who} is cornered at the frontier, and what follows is not quiet.", "The last road out is watched, and {who} has to run it."],
  ],
};
const BAND = { clean: 0, costly: 1, failed: 2 };
const stepOf = (beat) => beat.key.split(":")[3].replace(/2$/, "");
const fill = (t, who, where) => t.replaceAll("{who}", who).replaceAll("{where}", where);

/** The receipt's headline: "Heron's scouting of Chile: in unseen, the papers copied, out but seen: costly". */
export function headline(seed, rec, where) {
  const words = rec.beats.map((b) => { const s = stepOf(b), again = /2$/.test(b.key.split(":")[3]) ? " at the second try" : ""; return `${SHORT[s === "task" ? rec.kind : s][BAND[b.band]]}${again}`; });
  return `${rec.who}'s ${NAMES[rec.kind]} of ${where}: ${words.join(", ")}: ${GRADES[rec.grade]}${rec.grade === 3 ? ", and held" : ""}`;
}

/** The mission step by step: [{step, band, text, numbers}], rebuilt from the record and the seed. */
export function report(seed, rec, where) {
  return rec.beats.map((b) => {
    const s = stepOf(b), set = TOLD[s === "task" ? rec.kind : s][BAND[b.band]];
    return { step: s, band: b.band, text: fill(set[hash32(seed, `${b.key}:told`) % set.length], rec.who, where), numbers: checkLine(b, "skill").replace(" against ", " against watch ") };
  });
}
