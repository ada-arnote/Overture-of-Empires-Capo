// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink's ledger: a record of your real-time games, kept in this browser only, and titles for what you have done.
// Words only: nothing here changes a later game. Export, import and wipe are yours.
import { el } from "./table.js";
import { INKS, MARKS } from "../src/games/inch/live.js";

const KEY = "capo-inch-ledger", MAPS = { world: "The world", continents: "Continents", islands: "Islands" }, TIERS = ["gentle", "even", "hard"];
const clean = (g) => g && typeof g === "object" && typeof g.seed === "string" && Object.hasOwn(MAPS, g.map) && TIERS.includes(g.rivals) && Number.isInteger(g.ticks) && Number.isInteger(g.ink) && Number.isInteger(g.mark) && Number.isInteger(g.nations) ? { seed: g.seed.slice(0, 40), map: g.map, rivals: g.rivals, ticks: g.ticks, ink: g.ink, mark: g.mark, nations: g.nations, won: !!g.won } : null;
const load = () => { try { const x = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(x) ? x.map(clean).filter(Boolean) : []; } catch { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-1000))); return true; } catch { return false; } };

/** Each title, hardest last, and what earns it. */
const won = (l) => l.filter((g) => g.won);
const TITLES = [
  ["First Blot", "Win a game", (l) => won(l).length > 0],
  ["Steady Hand", "Win against normal rivals", (l) => won(l).some((g) => g.rivals === "even")],
  ["Ten Pages", "Play ten games", (l) => l.length >= 10],
  ["Quick Quill", "Win within five minutes of game time", (l) => won(l).some((g) => g.ticks <= 600)],
  ["Late Seal", "Win after seven minutes, in the last age", (l) => won(l).some((g) => g.ticks > 840)],
  ["Both Marks", "Win once with Broad stroke and once with Full pot", (l) => MARKS.every((_, k) => won(l).some((g) => g.mark === k))],
  ["Crowded Page", "Win among 50 nations", (l) => won(l).some((g) => g.nations >= 50)],
  ["Ten Wins", "Win ten games", (l) => won(l).length >= 10],
  ["Islander", "Win on the islands against hard rivals", (l) => won(l).some((g) => g.map === "islands" && g.rivals === "hard")],
  ["Hard Ink", "Win against hard rivals", (l) => won(l).some((g) => g.rivals === "hard")],
  ["Every Page", "Win on every map", (l) => Object.keys(MAPS).every((m) => won(l).some((g) => g.map === m))],
  ["Every Ink", "Win with every ink", (l) => INKS.every((_, k) => won(l).some((g) => g.ink === k))],
];
/** The hardest title earned, to stand beside "You", or "". */
export const title = () => { const l = load(); return TITLES.filter((t) => t[2](l)).pop()?.[0] || ""; };

/** Notes a finished game once, by its seed. Returns whether it was kept. */
export function note(g) {
  const l = load(), c = clean(g);
  if (!c || l.some((x) => x.seed === c.seed)) return false;
  l.push(c);
  return store(l);
}

const clock = (t) => `${Math.floor(t / 120)}:${String(Math.floor(t / 2) % 60).padStart(2, "0")}`;
/** The ledger's sheet: the record, the titles, and export, import and wipe. */
export function ledger(again) {
  const l = load(), box = el("div", undefined, "stack"), u = el("ul"), line = (t) => u.append(el("li", t));
  line(l.length ? `${l.length} ${l.length === 1 ? "game" : "games"}, ${won(l).length} won. Kept in this browser only.` : "No games yet. Finish a real-time game to start your record.");
  for (const [m, name] of Object.entries(MAPS)) {
    const here = l.filter((g) => g.map === m), w = won(here), fast = Math.min(...w.map((g) => g.ticks));
    if (here.length) line(`${name}: ${here.length} played, ${w.length} won${w.length ? `, fastest ${clock(fast)}` : ""}.`);
  }
  for (const t of TIERS) { const here = l.filter((g) => g.rivals === t); if (here.length) line(`Against ${t === "even" ? "normal" : t} rivals: ${here.length} played, ${won(here).length} won.`); }
  const inks = INKS.filter((_, k) => won(l).some((g) => g.ink === k)).map((k) => k.name);
  if (inks.length) line(`Won with ${inks.join(", ")}.`);
  const t = el("ul");
  t.append(...TITLES.map(([name, how, got]) => el("li", `${got(l) ? "Earned" : "Not yet"}: ${name}. ${how}.`)));
  const row = el("div", undefined, "go"), out = el("button", "Export", "quiet"), take = el("button", "Import", "quiet"), wipe = el("button", "Wipe", "quiet"), file = el("input");
  for (const b of [out, take, wipe]) b.type = "button";
  Object.assign(file, { type: "file", accept: ".json,application/json", hidden: true });
  out.onclick = () => { const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(load())], { type: "application/json" })); a.download = "inch-ledger.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  take.onclick = () => file.click();
  file.onchange = async () => {
    try {
      const list = JSON.parse(await file.files[0].text());
      if (!Array.isArray(list)) throw new Error();
      const seen = new Set(load().map((g) => g.seed)), add = list.map(clean).filter((g) => g && !seen.has(g.seed));
      store([...load(), ...add]);
      again();
    } catch { take.textContent = "Not a ledger"; }
  };
  wipe.onclick = () => { if (wipe.textContent === "Wipe") { wipe.textContent = "Sure?"; return; } store([]); again(); };
  row.append(out, take, wipe);
  box.append(u, el("b", "Titles"), t, row, file);
  return box;
}
