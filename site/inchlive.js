// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time, on the table: a clock, a share to send, a click on where it goes, and a leaderboard.
import { NONE, PCTS, TICK_MS, bordersOf, cityPrice, gainOf, goalOf, landingPrice, landings, maxOf } from "../src/games/inch/live.js";
import { liveBoardFor } from "../src/games/inch/rules.js";
import { $, RGB, el, sheet, toast } from "./table.js";
import { hexBoard } from "./hexboard.js";
import { areaPicture } from "../src/map/areas.js";

const SEA = [64, 104, 128], LAND = [[214, 204, 170], [206, 198, 162], [220, 210, 178]], HILL = [178, 160, 128];
let pct = 40, paused = false, speed = 1, clock = 0, building = false, box = null;

/** Colours for every nation: yours first, the rest spread round the wheel. */
export function colours(p) {
  return p.troops.map((_, s) => {
    if (s === 0) return RGB[0];
    const h = (s * 137.508) % 360, f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.52 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  });
}

function controls(T) {
  if (box) return box;
  box = el("div");
  box.id = "live";
  const row = el("label", undefined, "live-row"), slider = el("input"), out = el("output"), btns = el("div", undefined, "go"), pause = el("button", "Pause", "quiet"), fast = el("button", "Speed 1x", "quiet"), city = el("button", "Build a city", "quiet");
  Object.assign(slider, { type: "range", min: "0", max: String(PCTS.length - 1), step: "1", value: String(PCTS.indexOf(pct)) });
  slider.setAttribute("aria-label", "Share of your strength to send");
  slider.oninput = () => { pct = PCTS[Number(slider.value)]; out.textContent = `${pct}%`; };
  out.textContent = `${pct}%`;
  row.append(el("span", "Send"), slider, out);
  for (const b of [pause, fast, city]) b.type = "button";
  pause.onclick = () => { paused = !paused; pause.textContent = paused ? "Play" : "Pause"; T.refresh(); };
  fast.onclick = () => { speed = speed === 4 ? 1 : speed * 2; fast.textContent = `Speed ${speed}x`; };
  city.onclick = () => { building = !building; city.setAttribute("aria-pressed", String(building)); toast(building ? "Tap one of your cells to build a city there." : "Building stopped."); };
  btns.append(pause, fast, city);
  const board = el("ol");
  board.id = "leaders";
  box.append(el("p", "", "live-info"), row, btns, board);
  box.city = city;
  box.slider = slider;
  $("choice").append(box);
  return box;
}

/** The clock: a tick every half second, faster when asked, never while a sheet is open or the game is paused. */
export function start(T) {
  clearInterval(clock);
  clock = setInterval(() => {
    const p = T.match?.position;
    if (!p?.live || T.demo || paused || p.phase !== "play" || document.querySelector("#sheet").open || !T.ready()) return;
    T.flow({ do: "tick", n: speed });
  }, TICK_MS);
}

export function tap(T, i) {
  if (!T.ready()) return undefined;
  const p = T.match.position, b = liveBoardFor(p);
  if (i < 0 || !b.land[i]) return toast("That is sea.");
  if (p.phase === "spawn") { const m = T.match.legal().find((x) => x.at === i); return m ? T.play(m) : toast("Too close to someone. Choose empty land away from others."); }
  if (!p.alive[p.human]) return toast("You are out. Watch to the end, or start again from the menu.");
  const o = p.owner[i];
  if (o === p.human) {
    if (building && p.building) { const m = { do: "city", at: i }; if (p.troops[p.human] < cityPrice(p)) return toast(`A city costs ${cityPrice(p)} strength.`); building = false; box?.city.setAttribute("aria-pressed", "false"); return T.play(m); }
    return toast("That land is yours. Tap a neighbour's, or empty land beside yours.");
  }
  if (bordersOf(p, b)[p.human].has(o)) return T.play({ do: "attack", to: o, pct });
  if (p.boats && landings(p, b).has(i)) {
    const need = landingPrice(p, b, i) + 1;
    if (Math.floor((p.troops[p.human] * pct) / 100) < need) return toast(`Landing there takes ${need} strength. Send a bigger share, or wait and grow.`);
    return T.play({ do: "boat", at: i, pct });
  }
  return toast(p.boats ? "Too far, even by boat." : "You can only attack land beside yours.");
}

export function board(T, stage) {
  const p = T.match.position, b = liveBoardFor(p), cs = colours(p), slot = new Map(b.dry.map((c, k) => [c, k])), of = b.cells.map((_, i) => (slot.has(i) ? slot.get(i) : -1));
  const picture = areaPicture(b.cells, of, b.dry, 9, true);
  document.body.classList.add("atlas");
  return hexBoard(T, stage, {
    picture, cells: [], rough: [], sea: [...b.dry.map(() => false), true], seats: cs, plain: true, fine: { cells: b.cells, of, mid: b.dry },
    ground: (k) => (k >= b.dry.length ? SEA : b.hill[b.dry[k]] ? HILL : LAND[k % 3]),
    owner: () => [...b.dry.map((c) => T.match.position.owner[c]), NONE],
    pieces: () => T.match.position.cities.map((at) => ({ kind: "town", at: slot.get(at), rgb: cs[T.match.position.owner[at]] || [180, 170, 150] })),
    names() { // a nation's name sits in the middle of its land, larger the more it holds
      const q = T.match.position, sum = q.troops.map(() => [0, 0, 0]);
      q.owner.forEach((o, i) => { if (o >= 0) { const [x, y] = picture.at[i]; sum[o][0] += x; sum[o][1] += y; sum[o][2]++; } });
      return sum.flatMap(([x, y, n], s) => (n > 25 ? [{ at: [x / n, y / n], text: q.names[s], sea: true }] : []));
    },
    tap: (k) => tap(T, k < b.dry.length ? b.dry[k] : -1),
    can: (k) => k < b.dry.length,
  });
}

export function panel(T) {
  const p = T.match.position, s = p.human, c = controls(T);
  for (const id of ["targets", "shares", "pour", "wait"]) $(id).closest(".go, .pick")?.setAttribute("hidden", "");
  $("targets").hidden = $("shares").hidden = true;
  $("pour").parentElement.hidden = true;
  c.hidden = false;
  c.city.hidden = !p.building || !p.alive[s];
  c.querySelector(".live-row").hidden = !p.alive[s];
  if (p.phase === "spawn") { $("status").textContent = "Tap empty land to start your nation"; c.querySelector(".live-info").textContent = `${p.troops.length - 1} other nations are already on the map. Choose a place with room to grow.`; return; }
  const going = p.attacks.filter((a) => a.by === s), out = !p.alive[s];
  $("status").textContent = out ? (paused ? "You are out. Paused" : "You are out. Watching") : paused ? "Paused" : `Strength ${p.troops[s]} of ${maxOf(p, s)}`;
  c.querySelector(".live-info").textContent = out ? "The other nations play on to the end. Speed up the clock, or start again from the menu." : `+${gainOf(p, s)} every half second. ${going.length ? `${going.length} ${going.length === 1 ? "attack" : "attacks"} under way, ${going.reduce((n, a) => n + a.left, 0)} strength in them.` : "Tap a neighbour to attack with the share below."}`;
  const top = p.land.map((n, k) => [n, k]).filter(([n]) => n).sort((x, y) => y[0] - x[0]).slice(0, 8), cs = colours(p);
  if (!top.some(([, k]) => k === s) && p.land[s]) top.push([p.land[s], s]);
  $("leaders").replaceChildren(...top.map(([n, k]) => { const li = el("li"), dot = el("i", undefined, "dot"); dot.style.background = `rgb(${cs[k]})`; li.append(dot, el("b", p.names[k]), el("span", `${Math.round((100 * n) / p.total)}%`)); if (k === s) li.className = "me"; return li; }));
  if (!clock) start(T);
}

export const ending = (T) => {
  const p = T.match.position, w = T.match.result.winners[0];
  return w === p.human ? "The map is yours." : p.alive[p.human] ? `${p.names[w]} wins.` : `You were out. ${p.names[w]} wins.`;
};
export const lineOf = (e, p) => (e.kind === "out" ? (e.seat === p.human ? "You are out." : `${p.names[e.seat]} is gone.`) : e.kind === "city" ? "You build a city." : e.kind === "boat" ? (e.landed ? "Your boats land." : `Your boats are thrown back. They lose ${e.lost ?? 0}; the rest come home.`) : "");
/** When you lose your last cell the game goes on without you: watch it to the end, or start again. The open sheet holds the clock. */
export function seen(T, events) {
  const p = T.match.position;
  if (p.over || !events.some((e) => e.kind === "out" && e.seat === p.human)) return;
  const box = el("div", undefined, "stack"), again = el("button", "Restart", "main");
  again.type = "button";
  again.onclick = () => { $("sheet").close(); $("again").click(); };
  box.append(el("p", "Your last land has fallen. Watch the other nations play on to the end, or start a new game."), again);
  sheet("You are out", box, "Watch");
}
export const leave = () => { if (box) box.hidden = true; for (const id of ["targets", "shares"]) $(id).hidden = false; $("pour").parentElement.hidden = false; };
export const liveGoal = goalOf;
/** Keys in real time: Space pauses, 1 to 0 choose the share. */
export function key(T, k) {
  if (k === " ") { box?.querySelector(".go button")?.click(); return true; }
  const n = "1234567890".indexOf(k);
  if (n < 0) return false;
  pct = PCTS[n];
  if (box) { box.slider.value = String(n); box.slider.oninput(); }
  return true;
}
