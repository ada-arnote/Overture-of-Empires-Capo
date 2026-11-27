// SPDX-License-Identifier: AGPL-3.0-or-later
// Sculpted pieces in place of the recipes made in code, where they are better: which model stands for a piece in each era and
// region, and fetching each one only when a board in 3D first shows it. Looks only: no rule ever reads a model. The recipes stay
// as the fallback (Flat, a page with no shelf, a style that keeps to its own set, a model not yet arrived) and nothing waits on one.
import { SHELF } from "./shelf.js";
import { unpack } from "./models.js";

/** Which shelf model takes a recipe's place, by era. A name missing here, or from the shelf, keeps its recipe. */
export const ERAS = {
  ancient: { foot: "legionary", unit2: "legionary", gun: "ballista", horse: "horse", unit4: "general", leader: "general", ship: "longboat", fleet: "longboat" },
  medieval: { unit3: "knight", foot: "knight", horse: "horse", ship: "longboat", fleet: "longboat", town: "townhouse", depot: "cottage" },
  early: { foot: "redcoat", gun: "cannon", horse: "horse", ship: "liner", fleet: "liner", town: "townhouse", depot: "cottage" },
  industrial: { foot: "fusilier", gun: "cannon", ship: "torpedo", fleet: "torpedo", town: "block", depot: "townhouse" },
  fable: { unit2: "legionary", unit3: "knight", unit4: "general", horse: "horse", town: "townhouse", depot: "cottage" }, // The Island Fable's guard, knight and marshal
  modern: { foot: "marine", ship: "destroyer", fleet: "destroyer", town: "block", depot: "block" },
};
/** Buildings by region: on sand (terrain 4) a town is a flat-roofed desert house, in any era but the modern. */
export const REGIONS = { 4: { town: "adobe", depot: "adobe" } };
/** What sort each shelf model is, so a style can wear sculpted ships and houses but keep its own figures (style.sculpt). */
export const SORT = { knight: "figures", legionary: "figures", redcoat: "figures", fusilier: "figures", marine: "figures", general: "figures", horse: "figures", ballista: "figures", cannon: "figures",
  longboat: "ships", liner: "ships", torpedo: "ships", destroyer: "ships", cottage: "buildings", townhouse: "buildings", block: "buildings", adobe: "buildings" };

/** The era of a year, for Capo's map. */
export const eraOf = (year) => (year < 500 ? "ancient" : year < 1500 ? "medieval" : year < 1850 ? "early" : year < 1945 ? "industrial" : "modern");

/**
 * The figures for one board. era: a key of ERAS. fetch(file) -> a promise of the file's bytes, or nothing (then only recipes stand).
 * got(models): called with each model as it arrives, to send to the mesh layer and stand the pieces again.
 * pick(name, kind, style, on) -> the model to stand: the sculpted one if it is here, else the recipe (asking for the sculpted one if on).
 */
export function figures(era, fetch, got) {
  const have = new Set(), asked = new Set();
  let table = ERAS[era] || {};
  const want = (name, kind, style) => {
    const s = (era !== "modern" && REGIONS[kind]?.[name]) || table[name];
    return s && SHELF[s] && (style.sculpt || []).includes(SORT[s]) ? s : "";
  };
  return {
    get era() { return era; },
    set era(e) { era = e; table = ERAS[e] || {}; },
    pick(name, kind, style, on) {
      const s = fetch ? want(name, kind, style) : "";
      if (!s) return name;
      if (have.has(s)) return s;
      if (on && !asked.has(s)) {
        asked.add(s);
        Promise.resolve(fetch(SHELF[s].file)).then((buf) => {
          if (!buf) return;
          const m = unpack(buf);
          if (!m[s]) return;
          have.add(s); got(m);
        }).catch(() => { /* the recipe stays */ });
      }
      return name;
    },
  };
}
