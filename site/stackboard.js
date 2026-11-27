// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game's boards. A lit table on the shared 3D layer (src/map/board.js) with turned stones (src/map/stones.js),
// where every stone carries notches for its tier and only the top stone shows its kind; and a flat board drawn as a picture,
// which is the fallback (no graphics, a slow device, a lost context) and one tap away as the Flat look. Both show the tower
// chip: the stack last touched, side on, stone by stone, in the corner of the board, so height reads on a phone without hover.
// It answers the table as a board does (site/table.js): show, light, clear, layout, at, looks, styles, destroy.
import { COURIER, KINDS, LODE, SLINGER, WARDEN, boardOf, kindOf, nameOf, ownerOf, sideOf } from "../src/games/stacking/rules.js";
import { canDraw, createBoard } from "../src/map/board.js";
import { STYLES, STYLE_KEY } from "../src/map/style.js";
import { stoneModels } from "../src/map/stones.js";
import { RGB } from "./table.js";

const NS = "http://www.w3.org/2000/svg", S = 30, W = Math.sqrt(3) * S;
const GROUND = [[176, 184, 192], [166, 175, 184], [184, 191, 198]], SLATE = [[132, 140, 150], [124, 133, 143], [140, 147, 156]], LIT = "#f2c14e";
const make = (t, a, into) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); into?.append(e); return e; };
export const ink = (rgb) => (rgb.reduce((s, v, i) => s + [0.21, 0.72, 0.07][i] * (v / 255) ** 2.2, 0) > 0.19 ? "#1a1411" : "#fdf6e4");
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
/** The looks: the lit table from two angles, and the flat picture. */
const TABLE = { relief: "Lit table", isometric: "Lit table, from the corner", flat: "Flat" };

/** A stone's mark, drawn in its owner's ink: the shape says what it does. */
export function mark(g, kind, x, y, colour, up, k = 1) {
  const line = { stroke: colour, "stroke-width": 2.6 * k, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, s = (v) => v * k;
  if (kind === LODE) { make("circle", { cx: x, cy: y, r: s(7.5), ...line }, g); make("circle", { cx: x, cy: y, r: s(2.6), fill: colour }, g); }
  else if (kind === WARDEN) make("rect", { x: x - s(6.5), y: y - s(6.5), width: s(13), height: s(13), fill: colour }, g);
  else if (kind === COURIER) make("path", { d: `M${x - s(7)} ${y - s(3)}h${s(14)}M${x - s(7)} ${y + s(3)}h${s(14)}`, ...line }, g);
  else if (kind === SLINGER) make("path", { d: `M${x - s(7)} ${y + s(6)}L${x + s(6)} ${y - s(7)}M${x - s(1)} ${y - s(7)}h${s(7)}v${s(7)}`, ...line }, g);
  else make("path", { d: up ? `M${x - s(6)} ${y + s(3)}L${x} ${y - s(4)}L${x + s(6)} ${y + s(3)}` : `M${x - s(6)} ${y - s(3)}L${x} ${y + s(4)}L${x + s(6)} ${y - s(3)}`, ...line }, g);
}

/** One person against bots sees their own side at the foot of the board, after a swap too; people sharing a screen see it fixed. */
const flipped = (T) => { const p = T.match.position, me = T.kinds.indexOf("you"); return !T.demo && T.solo() && me >= 0 && sideOf(p, me) === "north"; };

/** The flat board: hexes, stacks drawn as discs one on another with the top stone's mark, height pips, and lit cells. */
function flatBoard(T, stage, o) {
  let b = null, svg = null, cells = [], labels = [], lit = null, stones = null, flip = false, room = {}, shown = { list: [], o: {} };
  const xy = (i) => { const [q, r] = b.cells[i], x = W * (q + r / 2), y = S * 1.5 * r; return flip ? [-x, -y] : [x, y]; };
  const hex = (i) => { const [x, y] = xy(i); return [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 180) * (60 * k - 90); return `${(x + S * Math.cos(a)).toFixed(1)},${(y + S * Math.sin(a)).toFixed(1)}`; }).join(" "); };
  const fit = () => { if (svg) Object.assign(svg.style, { left: `${room.left || 0}px`, top: `${room.top || 0}px`, width: `calc(100% - ${(room.left || 0) + (room.right || 0)}px)`, height: `calc(100% - ${(room.top || 0) + (room.bottom || 0)}px)` }); };
  function build(size) {
    b = boardOf(size);
    const span = (b.radius + 1) * W;
    svg?.remove();
    svg = make("svg", { viewBox: `${-span} ${-S * 1.5 * b.radius - S * 1.3} ${2 * span} ${S * 3 * b.radius + S * 2.6}`, class: "flat", role: "img" });
    svg.setAttribute("aria-label", "The board, as a picture. The tower strip and the lists in the move panel say what is on it.");
    cells = b.cells.map((_, i) => {
      const poly = make("polygon", { class: "cell", fill: `rgb(${GROUND[(i * 7 + (i >> 2)) % 3]})`, stroke: "#3a4452", "stroke-width": 1.5 }, svg);
      poly.addEventListener("click", () => o.tap(i));
      return poly;
    });
    const names = make("g", { "aria-hidden": "true" }, svg);
    lit = make("g", { "pointer-events": "none" }, svg); stones = make("g", { "pointer-events": "none" }, svg);
    labels = b.cells.map((_, i) => { const t = make("text", { fill: "rgba(26,32,40,.55)", "font-size": 8 }, names); t.textContent = nameOf({ size }, i); return t; });
    place();
    stage.prepend(svg);
    fit();
  }
  const place = () => b.cells.forEach((_, i) => { const [x, y] = xy(i); cells[i].setAttribute("points", hex(i)); labels[i].setAttribute("x", (x - S * 0.62).toFixed(1)); labels[i].setAttribute("y", (y - S * 0.42).toFixed(1)); });
  const draw = () => {
    const p = T.match.position, last = p.last, turn = flipped(T);
    if (!b || b.radius !== (p.size || 4)) build(p.size || 4);
    if (turn !== flip) { flip = turn; place(); }
    stones.replaceChildren();
    if (last) for (const c of [last.from, last.to, last.behind]) if (c >= 0) { const [x, y] = xy(c); make("circle", { cx: x, cy: y, r: S * 0.78, fill: "none", stroke: "rgba(255,255,255,.55)", "stroke-width": 2, "stroke-dasharray": "4 3" }, stones); }
    p.cells.forEach((c, i) => {
      if (!c.length) return;
      const [x, y] = xy(i), h = c.length;
      c.forEach((st, k) => { // each tier sits on the one below with a visible lip
        const rgb = RGB[ownerOf(st)], cy = y + 5 - k * 6;
        make("ellipse", { cx: x, cy: cy + 3, rx: 17, ry: 15, fill: "rgba(10,14,20,.55)" }, stones);
        make("circle", { cx: x, cy, r: 16, fill: `rgb(${rgb})`, stroke: kindOf(st) === LODE ? "#f6e7b0" : "#141a22", "stroke-width": kindOf(st) === LODE ? 3 : 1.6 }, stones);
        if (k === h - 1) mark(stones, kindOf(st), x, cy, ink(rgb), (sideOf(p, ownerOf(st)) === "south") !== flip);
      });
      for (let k = 0; k < h; k++) make("circle", { cx: x + 19, cy: y + 10 - k * 7, r: 2.6, fill: "#fdf6e4", stroke: "#141a22", "stroke-width": 1 }, stones); // height pips
    });
    light(shown.list, shown.o);
  };
  function light(list, l = {}) {
    shown = { list, o: l };
    if (!lit) return;
    lit.replaceChildren();
    for (const i of list) { const [x, y] = xy(i); make("circle", { cx: x, cy: y, r: S * 0.62, fill: i === l.aim ? "rgba(242,193,78,.55)" : "rgba(242,193,78,.22)", stroke: LIT, "stroke-width": i === l.aim ? 3.5 : 2 }, lit); }
    if (l.ring >= 0) { const [x, y] = xy(l.ring); make("circle", { cx: x, cy: y, r: S * 0.8, fill: "none", stroke: "#fdf6e4", "stroke-width": 3 }, lit); }
  }
  return {
    layout(free) { room = free; fit(); },
    show() { draw(); return 0; },
    light, clear() { light([]); },
    at(i) { const r = cells[i]?.getBoundingClientRect(), s = stage.getBoundingClientRect(); return r ? { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top } : null; },
    destroy() { svg?.remove(); svg = null; },
  };
}

/** The lit table: the shared 3D board with the stones as models; null when this device cannot draw it. */
function litTable(T, stage, o, look, lost) {
  if (!canDraw()) return null;
  const p = T.match.position, size = p.size || 4, flip = flipped(T), list = boardOf(size).cells.map(([q, r]) => (flip ? [-q, -r] : [q, r]));
  const root = document.documentElement, night = matchMedia("(prefers-color-scheme: dark)"), lamp = () => ((root.dataset.theme ? root.dataset.theme === "dark" : night.matches) ? "lamp" : "day");
  let b;
  try {
    b = createBoard(stage, { cells: list, seats: RGB, ground: (i) => SLATE[(i * 7 + (i >> 2)) % 3], style: get(STYLE_KEY) || "war", wood: "textures/walnut.webp", probe: !get("capo-3d-slow"), look, icons: [0, 1] });
    if (!b.add(stoneModels())) { b.destroy(); return null; } // no models here: the flat board reads better
  } catch (e) { b?.destroy(); console.warn("The lit table did not start; the flat board stands:", e); return null; }
  b.setLight(lamp());
  const relight = () => b.setLight(lamp()), seen = new MutationObserver(relight);
  seen.observe(root, { attributes: true, attributeFilter: ["data-theme"] }); night.addEventListener("change", relight);
  b.on("pick", (i) => { if (i >= 0) o.tap(i); });
  b.on("hover", (i) => b.setCursor(i >= 0 && T.ready()));
  b.on("slow", () => { try { localStorage.setItem("capo-3d-slow", "1"); } catch { /* timed again next time */ } lost("slow"); });
  b.on("lost", () => lost("lost"));
  let shown = { list: [], o: {} };
  const last = () => { const l = T.match.position.last; return l ? [l.from, l.to, l.behind].filter((c) => c >= 0) : []; };
  return {
    size, flip,
    show(quick) {
      const q = T.match.position, pieces = [];
      // each top stone's mark points up the board for its own side, as its owner sees it
      q.cells.forEach((c, i) => c.forEach((st, k) => pieces.push({ kind: "model", at: i, name: k === c.length - 1 ? `stone${kindOf(st)}${k}` : `disc${k}`, rgb: RGB[ownerOf(st)], size: 1, turn: (sideOf(q, ownerOf(st)) === "south") !== flip ? 0 : Math.PI })));
      const ms = b.show(q.cells.map(() => -1), { pieces, quick });
      b.preview(shown.list, { ...shown.o, dots: shown.list.length ? [] : last() });
      return ms;
    },
    light(list, l = {}) { shown = { list, o: l }; b.preview(list, { ring: l.ring ?? -1, aim: l.aim ?? -1, dots: list.length || l.ring >= 0 ? [] : last() }); },
    clear() { shown = { list: [], o: {} }; b.preview([], { dots: last() }); },
    layout: (free) => b.layout(free),
    at: (i) => b.screenOf(i),
    zoom: (f) => b.zoom(f), pan: (x, y) => b.pan(x, y),
    setLook: (k) => b.setLook(k), get styleName() { return b.styleName; }, setStyle: (k) => b.setStyle(k),
    patterns: (on) => b.patterns(on), motion: (m) => b.motion(m), recolour: () => b.recolour(),
    destroy() { seen.disconnect(); night.removeEventListener("change", relight); b.destroy(); },
  };
}

/** The tower chip: the stack last touched, side on, top first, with each stone's owner, kind and tier. */
function towerChip(stage) {
  const box = document.createElement("div");
  box.className = "chip";
  box.setAttribute("aria-hidden", "true"); // the tower strip in the move panel says the same in words
  stage.append(box);
  return {
    box,
    show(p, at, flip) {
      const c = at >= 0 ? p.cells[at] : null;
      box.hidden = !c?.length;
      if (box.hidden) return;
      const h = c.length, svg = make("svg", { viewBox: `0 0 74 ${16 + h * 22}`, width: 74, height: 16 + h * 22 });
      c.forEach((st, k) => {
        const y = 4 + (h - 1 - k) * 22, rgb = RGB[ownerOf(st)], up = (sideOf(p, ownerOf(st)) === "south") !== flip;
        make("rect", { x: 6, y, width: 44, height: 18, rx: 6, fill: `rgb(${rgb})`, stroke: kindOf(st) === LODE ? "#f6e7b0" : "#141a22", "stroke-width": kindOf(st) === LODE ? 2.4 : 1.4 }, svg);
        if (k === h - 1) mark(svg, kindOf(st), 28, y + 9, ink(rgb), up, 0.85);
        else make("rect", { x: 18, y: y + 7, width: 20, height: 4, rx: 2, fill: ink(rgb), opacity: 0.5 }, svg); // a stone under another does not act
        for (let n = 0; n <= k; n++) make("rect", { x: 54 + n * 6, y: y + 6, width: 4, height: 6, rx: 1, fill: "#fdf6e4", stroke: "#141a22", "stroke-width": 0.8 }, svg); // notches: its tier
      });
      const name = make("text", { x: 6, y: 12 + h * 22, fill: "currentColor", "font-size": 10, "font-weight": 700 }, svg);
      name.textContent = `${nameOf(p, at)}, ${h} high`;
      box.replaceChildren(svg);
      box.title = [...c].reverse().map((st) => KINDS[kindOf(st)]).join(", ");
    },
    place(room) { Object.assign(box.style, { left: `${(room.left || 0) + 8}px`, top: `${(room.top || 0) + 8}px` }); },
    remove: () => box.remove(),
  };
}

/** The board for the page: the lit table when it can be drawn and was not set aside, else the flat one. o: tap(i), seen() -> a cell or -1. */
export function stackBoard(T, stage, o) {
  const weak = navigator.deviceMemory <= 2 || navigator.hardwareConcurrency < 4 || !!navigator.connection?.saveData || !!get("capo-3d-slow");
  let look = TABLE[T.read()] ? T.read() : weak || T.demo ? "flat" : "relief", inner = null, room = {}, pat = false, mot = "system", dead = false;
  const chip = towerChip(stage), drawn = () => chip.show(T.match.position, o.seen(), !!inner?.flip || flipped(T));
  function open() {
    inner?.destroy();
    stage.replaceChildren(chip.box);
    inner = look === "flat" || dead ? null : litTable(T, stage, o, look, (why) => { dead = why === "lost" || dead; look = "flat"; open(); inner.layout(room); inner.show(true); });
    if (!inner) { inner = flatBoard(T, stage, o); if (look !== "flat") look = "flat"; }
    stage.append(chip.box);
    inner.patterns?.(pat); inner.motion?.(mot);
  }
  open();
  return {
    get looks() { return canDraw() && !dead ? Object.entries(TABLE) : []; },
    get look() { return look; },
    setLook(k) {
      if (!TABLE[k] || k === look) return;
      const was = look;
      look = k;
      if (k !== "flat" && was !== "flat" && inner.setLook) { inner.setLook(k); return; }
      open(); inner.layout(room); inner.show(true); drawn();
    },
    get styles() { return inner?.setStyle ? Object.entries(STYLES).map(([k, v]) => [k, v.name]) : []; },
    get style() { return inner?.styleName; },
    setStyle(k) { try { localStorage.setItem(STYLE_KEY, k); } catch { /* this visit only */ } inner?.setStyle?.(k); },
    patterns(on) { pat = !!on; inner?.patterns?.(pat); }, motion(m) { mot = m; inner?.motion?.(m); }, recolour() { inner?.recolour?.(); },
    zoom: (f) => inner?.zoom?.(f), pan: (x, y) => inner?.pan?.(x, y),
    layout(free) { room = free; inner.layout(free); chip.place(free); },
    show(order, quick) {
      if (inner.size && (inner.size !== (T.match.position.size || 4) || inner.flip !== flipped(T))) { open(); inner.layout(room); } // another board size, or the other side at the foot
      const ms = inner.show(quick);
      drawn();
      return ms || 0;
    },
    light(list, l) { inner.light(list, l); drawn(); },
    clear() { inner.clear(); drawn(); },
    at: (i) => inner.at(i),
    get moving() { return null; }, // no moves to play out over the table yet
    destroy() { inner?.destroy(); chip.remove(); },
  };
}
