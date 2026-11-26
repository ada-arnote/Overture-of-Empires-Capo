// SPDX-License-Identifier: AGPL-3.0-or-later
// The recipes: every model the boards stand on the table, made in code with the kit (our own work, in the manner of painted
// war-game miniatures: metal bases, matte paint, the owner's colour as enamel). One cell's radius is 1; z is up; +y is toward the player.
// A recipe paints with the style's palette slots, so another style recolours all of them at once.
import { bake, box, lathe, move, prism } from "./kit.js";
import { SLOT } from "./style.js";

const c = (slot, shade = 128) => [SLOT[slot], shade, 0], TAU = Math.PI * 2, UP = Math.PI / 2;
const ring = (n, r, f) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU; f(Math.cos(a) * r, Math.sin(a) * r, a, i); } };
/** A roof with two slopes over a box 2w by 2d, ridge along y. */
const gable = (o, w, d, z, rise, col, fin = 0) => move(o, prism([], [[-w, 0], [w, 0], [0, rise]], -d, d, col, fin), 0, 0, z, 1, 0, UP);
/** A house: walls, a roof in the given colour and finish, a dark door. */
function house(o, w, d, h, rise, roof, fin, x = 0, y = 0, turn = 0) {
  const p = [];
  box(p, -w, -d, 0, w, d, h, c("wall"));
  gable(p, w + 0.03, d + 0.03, h, rise, roof, fin);
  box(p, -w * 0.25, d - 0.01, 0, w * 0.25, d + 0.012, h * 0.62, c("dark"));
  return move(o, p, x, y, 0, 1, turn);
}
/** A round tower with teeth, and a pointed roof if asked. */
function turret(o, r, h, x = 0, y = 0, roof = null, fin = 0, n = 8) {
  const p = lathe([], [[r * 1.08, 0], [r, 0.04], [r, h], [r * 1.16, h + 0.02], [r * 1.16, h + 0.1], [r * 0.9, h + 0.1], [r * 0.9, h + 0.04], [0, h + 0.04]], n, c("stone"));
  if (roof) lathe(p, [[r * 1.22, h + 0.08], [0, h + 0.08 + r * 2.1]], n, roof, fin, true);
  else ring(n / 2, r * 1.03, (x1, y1, a) => move(p, box([], -r * 0.2, -r * 0.13, 0, r * 0.2, r * 0.13, 0.07, c("stone", 140)), x1, y1, h + 0.1, 1, a + UP));
  return move(o, p, x, y);
}
const base = (o, r = 0.36) => lathe(o, [[r, 0], [r * 1.04, 0.02], [r * 1.04, 0.055], [r * 0.9, 0.085], [0, 0.085]], 14, c("metal"), 2);
const pole = (o, x, y, z0, z1, r = 0.018, col = c("wood")) => move(o, lathe([], [[r, z0], [r, z1], [0, z1 + r]], 5, col), x, y);
/** A flag on a pole, in the owner's colour. */
function flag(o, x, y, z0, z1, w = 0.26, h = 0.17) {
  pole(o, x, y, z0, z1 + 0.02, 0.016, c("iron"));
  return move(o, prism([], [[0, 0], [w, -h * 0.1], [w * 0.82, -h * 0.5], [w, -h * 0.9], [0, -h]], -0.008, 0.008, c("cloth"), 1), x, y, z1, 1, 0, UP);
}
/** A soldier turned on a lathe: a metal base, an enamel body, a head. */
function pawn(o, s = 1, head = "bone") {
  const p = base([]);
  lathe(p, [[0.27, 0.085], [0.27, 0.12], [0.16, 0.2], [0.11, 0.46], [0.15, 0.5], [0.15, 0.53], [0.09, 0.56]], 12, c("cloth"), 1);
  lathe(p, [[0.09, 0.56], [0.14, 0.61], [0.16, 0.68], [0.14, 0.75], [0.08, 0.8], [0, 0.82]], 10, c(head), head === "bone" ? 0 : 2);
  return move(o, p, 0, 0, 0, s);
}
const crown = (o, z, r = 0.15) => { lathe(o, [[r, z], [r * 1.12, z + 0.07], [r * 0.8, z + 0.07]], 10, c("gold"), 2); ring(5, r * 1.02, (x, y) => move(o, lathe([], [[0.035, 0], [0, 0.09]], 4, c("gold"), 2), x, y, z + 0.06)); return o; };
/** A tree: a trunk and tiers of needles, or a rounded crown. */
function tree(o, x, y, s, leafy, turn = 0) {
  const p = lathe([], [[0.05, 0], [0.04, 0.22]], 5, c("wood"), 0, true);
  if (leafy) lathe(p, [[0, 0.18], [0.2, 0.26], [0.27, 0.42], [0.21, 0.6], [0, 0.7]], 7, c("leaf"), 0, true, 0.3);
  else { lathe(p, [[0.27, 0.13], [0, 0.5]], 7, c("pine"), 0, true); lathe(p, [[0.21, 0.34], [0, 0.68]], 7, c("pine", 140), 0, true, 0.4); lathe(p, [[0.14, 0.54], [0, 0.86]], 6, c("pine", 152), 0, true, 0.8); }
  return move(o, p, x, y, 0, s, turn);
}
const stone = (o, x, y, z, r, shade = 128) => move(o, lathe([], [[r * 0.8, 0], [r, r * 0.3], [r * 0.7, r * 0.72], [0, r * 0.8]], 6, c("stone", shade), 0, true, x * 9), x, y, z);
/** A hull, pointed at the bow (+x). */
const hull = (o, l, w, h, col, fin = 0) => { const s = [[-l, -w * 0.7], [-l * 0.5, -w], [l * 0.35, -w * 0.9], [l, 0], [l * 0.35, w * 0.9], [-l * 0.5, w], [-l, w * 0.7]]; prism(o, s.map(([x, y]) => [x * 0.86, y * 0.7]), 0, h * 0.5, col, fin); return prism(o, s, h * 0.5, h, col, fin, 0.02); };
/** A cube with pips on three sides: n on top. */
function die(o, n) {
  const p = box([], -0.2, -0.2, 0, 0.2, 0.2, 0.4, c("cloth"), 1, 0.03), dots = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
  const pip = lathe([], [[0.036, 0], [0.03, 0.006], [0, 0.006]], 7, c("bone")); // in the thrower's colour, with pale pips
  for (const [x, y] of dots[n]) move(p, pip, x * 0.1, y * 0.1, 0.4);
  for (const [x, y] of dots[n > 3 ? n - 3 : n + 2]) move(p, pip, x * 0.1, 0.2, 0.2 + y * 0.1, 1, 0, -UP); // the side toward the player
  return move(o, p);
}

const RECIPES = {
  // The Island Fable's four ranks: a scout, a guard with shield and spear, a knight, a marshal with a crown
  unit1: (o) => pawn(o, 0.9),
  unit2(o) { pawn(o, 1); pole(o, 0.2, 0.02, 0.08, 0.95, 0.014, c("wood")); move(o, lathe([], [[0.025, 0], [0, 0.09]], 4, c("metal"), 2), 0.2, 0.02, 0.95); return move(o, prism([], [[-0.12, 0.17], [0.12, 0.17], [0.12, -0.02], [0, -0.17], [-0.12, -0.02]], -0.02, 0.02, c("metal"), 2, 0.012), -0.02, 0.19, 0.34, 1, 0, UP * 0.92); },
  unit3: (o) => RECIPES.horse(o),
  unit4(o) { pawn(o, 1.12, "metal"); crown(o, 0.9, 0.13); return flag(o, -0.22, 0, 0.08, 1.12); },
  foot: (o) => pawn(o, 0.82),
  horse(o) { // cavalry: a chess knight of our own drawing, until a rider is chosen
    base(o, 0.38);
    const side = [[-0.3, 0], [-0.27, 0.3], [-0.08, 0.55], [-0.02, 0.76], [0.05, 0.84], [0.1, 0.7], [0.3, 0.56], [0.4, 0.34], [0.32, 0.25], [0.12, 0.34], [0.07, 0.26], [0.24, 0]].map(([x, z]) => [x * 0.82, z * 0.86]);
    move(o, prism([], side, -0.1, 0.1, c("cloth"), 1, 0.025), 0, 0, 0.085, 1, 0, UP);
    return move(o, prism([], [[-0.24, 0.3], [-0.12, 0.72], [-0.02, 0.66], [-0.14, 0.3]], -0.115, 0.115, c("dark"), 0), 0, 0, 0.085, 0.82, 0, UP); // the mane
  },
  gun(o) { // artillery: a barrel on a carriage with two wheels
    base(o, 0.4);
    move(o, lathe([], [[0.06, 0], [0.085, 0.03], [0.08, 0.1], [0.06, 0.52], [0.075, 0.54], [0.075, 0.58], [0.04, 0.58], [0.04, 0.5]], 9, c("iron"), 2), -0.24, 0, 0.3, 1, UP, UP * 0.82);
    for (const y of [-0.17, 0.17]) { const w = lathe([], [[0.2, -0.025], [0.2, 0.025], [0, 0.03]], 12, c("wood")); lathe(w, [[0.2, 0.025], [0.2, -0.025], [0, -0.03]], 12, c("wood", 110)); move(o, w, -0.02, y, 0.285, 1, 0, UP); }
    return box(o, -0.32, -0.07, 0.15, 0.08, 0.07, 0.24, c("wood", 112));
  },
  ship(o) { hull(o, 0.42, 0.17, 0.16, c("hull")); pole(o, 0.02, 0, 0.14, 0.78); move(o, prism([], [[-0.26, 0], [0.26, 0], [0.2, 0.42], [-0.2, 0.42]], -0.012, 0.012, c("cloth"), 0), 0.035, 0, 0.26, 1, UP, UP); return move(o, prism([], [[0, 0], [0.16, -0.04], [0, -0.08]], -0.006, 0.006, c("cloth"), 1), 0.02, 0, 0.84, 1, 0, UP); },
  banner: (o) => flag(base(o, 0.16), 0, 0, 0.05, 0.95, 0.34, 0.24),
  crown: (o) => crown(o, 0, 0.2),
  // buildings
  hall(o) { // a village hall with a tower: the owner's roofs and flag
    house(o, 0.24, 0.3, 0.26, 0.2, c("cloth"), 1, 0.12, 0.02);
    turret(o, 0.13, 0.5, -0.2, -0.06, c("cloth", 110), 1);
    return flag(o, -0.2, -0.06, 0.85, 1.02, 0.2, 0.12);
  },
  depot: (o) => house(o, 0.2, 0.24, 0.2, 0.17, c("cloth"), 1),
  town(o) { house(o, 0.2, 0.25, 0.22, 0.18, c("cloth"), 1, -0.14, 0.05); house(o, 0.15, 0.2, 0.17, 0.14, c("cloth", 108), 1, 0.2, 0.12, UP); return turret(o, 0.1, 0.44, 0.14, -0.2, c("cloth"), 1, 6); },
  hut(o) { house(o, 0.17, 0.2, 0.15, 0.16, c("thatch")); return o; },
  farm(o) { house(o, 0.16, 0.2, 0.15, 0.16, c("thatch"), 0, -0.26, -0.2); for (const [x, y] of [[0.22, -0.3], [0.36, -0.16]]) move(o, lathe([], [[0.09, 0], [0.085, 0.08], [0, 0.17]], 7, c("field"), 0, true), x, y); for (let i = 0; i < 5; i++) box(o, -0.5 + i * 0.04, 0.08 + i * 0.085, 0, 0.5 - i * 0.04, 0.12 + i * 0.085, 0.035, c("field", i % 2 ? 118 : 138)); return o; },
  castle(o) { // a keep with four towers: a capital
    box(o, -0.24, -0.24, 0, 0.24, 0.24, 0.34, c("stone"));
    box(o, -0.15, -0.15, 0.34, 0.15, 0.15, 0.56, c("stone", 138));
    ring(4, 0.34, (x, y) => turret(o, 0.1, 0.4, x, y, c("cloth"), 1, 7));
    box(o, -0.07, 0.23, 0, 0.07, 0.25, 0.2, c("dark"));
    return flag(o, 0, 0, 0.56, 0.86, 0.22, 0.13);
  },
  wall(o) { ring(8, 0.74, (x, y, a) => { move(o, box([], -0.3, -0.035, 0, 0.3, 0.035, 0.13, c("stone")), x, y, 0, 1, a + UP); turret(o, 0.06, 0.16, Math.cos(a + TAU / 16) * 0.8, Math.sin(a + TAU / 16) * 0.8, null, 0, 6); }); return o; }, // a fort: a ring of wall round a province's middle
  fort(o) { ring(12, 0.46, (x, y, a, i) => { if (i !== 3) move(o, lathe([], [[0.055, 0], [0.05, 0.3], [0, 0.4]], 5, c("wood", 110 + (i % 3) * 14), 0, true), x, y); }); return turret(o, 0.13, 0.36, 0, -0.04); }, // a palisade and its watchtower
  cairn(o) { stone(o, -0.12, 0.04, 0, 0.17); stone(o, 0.13, 0.07, 0, 0.15, 116); stone(o, 0, -0.1, 0, 0.14, 138); return stone(o, 0.01, 0.02, 0.12, 0.11, 146); },
  tree: (o) => tree(o, 0, 0, 1, false),
  oak: (o) => tree(o, 0, 0, 1, true),
  hill: (o) => lathe(o, [[0.56, 0], [0.46, 0.09], [0.28, 0.19], [0, 0.24]], 9, c("leaf"), 3, true),
  peak(o) { lathe(o, [[0.5, 0], [0.36, 0.26], [0.17, 0.56], [0, 0.74]], 6, c("stone"), 0, true, 0.2); lathe(o, [[0.19, 0.53], [0, 0.76]], 6, c("snow"), 0, true, 0.2); return move(o, lathe([], [[0.3, 0], [0.16, 0.26], [0, 0.42]], 5, c("stone", 112), 0, true), 0.3, 0.2); },
  sheep(o) { for (const [x, y, t] of [[-0.2, 0.1, 0.4], [0.16, -0.12, 2.2], [0.24, 0.22, 4]]) { const p = lathe([], [[0.05, 0.04], [0.085, 0.08], [0.07, 0.15], [0, 0.17]], 6, c("bone"), 0, true); box(p, 0.06, -0.03, 0.09, 0.12, 0.03, 0.15, c("dark")); move(o, p, x, y, 0, 1, t); } for (let i = 0; i < 4; i++) { pole(o, -0.42 + i * 0.28, -0.36, 0, 0.11, 0.016); if (i < 3) box(o, -0.42 + i * 0.28, -0.37, 0.07, -0.14 + i * 0.28, -0.35, 0.09, c("wood", 140)); } return o; },
  port(o) { // a jetty on posts, a crane and a crate
    box(o, -0.12, -0.5, 0.1, 0.12, 0.2, 0.13, c("wood", 140));
    for (const y of [-0.45, -0.15, 0.15]) for (const x of [-0.1, 0.1]) pole(o, x, y, 0, 0.1, 0.02);
    pole(o, 0, 0.1, 0.13, 0.5, 0.022); move(o, box([], -0.02, -0.02, 0, 0.02, 0.02, 0.36, c("wood", 112)), 0, 0.1, 0.48, 1, 0, -UP * 0.8);
    return box(o, -0.09, -0.36, 0.13, 0.05, -0.22, 0.25, c("thatch"));
  },
  gate(o) { for (const x of [-0.42, 0.42]) turret(o, 0.07, 0.42, x, 0, null, 0, 6); box(o, -0.4, -0.03, 0.26, 0.4, 0.03, 0.33, c("gold"), 2); return box(o, -0.4, -0.02, 0.1, 0.4, 0.02, 0.14, c("gold", 100), 2); },
  bar: (o) => box(o, -0.2, -0.045, 0, 0.2, 0.045, 0.07, c("cloth"), 1, 0.012), // a route, laid along a hex's edge
  token: (o) => lathe(o, [[0.3, 0], [0.31, 0.02], [0.31, 0.05], [0.27, 0.075], [0, 0.075]], 18, c("bone")),
  plate: (o) => lathe(o, [[0.3, 0], [0.31, 0.02], [0.31, 0.05], [0.27, 0.075], [0, 0.075]], 18, c("metal"), 2),
  // An Inch of Ink's four places
  well(o) { lathe(o, [[0.2, 0], [0.2, 0.14], [0.14, 0.14], [0.14, 0.04], [0, 0.04]], 8, c("stone")); for (const x of [-0.16, 0.16]) pole(o, x, 0, 0.12, 0.42, 0.02); return gable(o, 0.22, 0.14, 0.4, 0.13, c("roof")); },
  quay: (o) => RECIPES.port(o),
  tower: (o) => turret(o, 0.16, 0.74, 0, 0, c("roof"), 0),
  archive(o) { box(o, -0.32, -0.24, 0, 0.32, 0.24, 0.05, c("stone", 140)); box(o, -0.24, -0.16, 0.05, 0.24, 0.16, 0.32, c("wall")); for (const x of [-0.26, -0.09, 0.09, 0.26]) pole(o, x, 0.2, 0.05, 0.31, 0.028, c("bone")); return gable(o, 0.32, 0.25, 0.33, 0.13, c("roof")); },
  // Capo's map: blocks with our own drawings of the public map symbols, not toy soldiers
  army(o) { box(o, -0.36, -0.25, 0, 0.36, 0.25, 0.2, c("cloth"), 1, 0.025); for (const t of [0.6, -0.6]) move(o, box([], -0.34, -0.022, 0, 0.34, 0.022, 0.012, c("bone")), 0, 0, 0.2, 1, t); return frame(o); },
  armour(o) { box(o, -0.36, -0.25, 0, 0.36, 0.25, 0.2, c("cloth"), 1, 0.025); const r = lathe([], [[0.2, 0], [0.2, 0.012], [0.16, 0.012], [0.16, 0]], 16, c("bone")); for (let i = 0; i < r.length; i += 10) r[i + 1] *= 0.6; move(o, r, 0, 0, 0.2); return frame(o); },
  guns(o) { box(o, -0.36, -0.25, 0, 0.36, 0.25, 0.2, c("cloth"), 1, 0.025); lathe(o, [[0.085, 0.2], [0.085, 0.214], [0, 0.214]], 12, c("bone")); return frame(o); },
  fleet(o) { hull(o, 0.5, 0.15, 0.13, c("cloth"), 1); box(o, -0.16, -0.07, 0.13, 0.12, 0.07, 0.21, c("metal"), 2, 0.015); return pole(o, 0, 0, 0.2, 0.36, 0.014, c("iron")); },
  wing(o) { pole(o, 0, 0, 0, 0.4, 0.014, c("iron")); lathe(o, [[0.1, 0], [0.11, 0.02], [0, 0.03]], 8, c("metal"), 2); return prism(o, [[0.36, 0], [-0.22, -0.32], [-0.1, 0], [-0.22, 0.32]], 0.4, 0.44, c("cloth"), 1, 0.01); },
  leader(o) { pawn(o, 0.9, "metal"); return flag(o, 0.2, 0, 0.07, 0.98, 0.24, 0.15); }, // a commander: a pewter-headed pawn with a banner
  keep(o) { box(o, -0.18, -0.18, 0, 0.18, 0.18, 0.3, c("metal"), 2, 0.02); ring(4, 0.25, (x, y) => move(o, lathe([], [[0.07, 0], [0.07, 0.36], [0, 0.46]], 6, c("metal"), 2), x, y)); return flag(o, 0, 0, 0.3, 0.62, 0.2, 0.12); }, // a capital
  city(o) { for (const [x, y, w, h] of [[-0.14, 0.02, 0.12, 0.2], [0.1, -0.08, 0.1, 0.3], [0.12, 0.16, 0.09, 0.14], [-0.08, -0.2, 0.08, 0.16]]) box(o, x - w, y - w, 0, x + w, y + w, h, c("metal"), 2, 0.012); return o; },
  pin(o) { pole(o, 0, 0, 0, 0.5, 0.012, c("iron")); return move(o, lathe([], [[0, 0], [0.07, 0.05], [0.07, 0.09], [0, 0.14]], 8, c("cloth"), 1), 0, 0, 0.46); },
};
function frame(o) { for (const [x0, y0, x1, y1] of [[-0.3, -0.19, 0.3, -0.165], [-0.3, 0.165, 0.3, 0.19], [-0.3, -0.19, -0.275, 0.19], [0.275, -0.19, 0.3, 0.19]]) box(o, x0, y0, 0.2, x1, y1, 0.212, c("bone")); return o; }
for (let n = 1; n <= 6; n++) RECIPES[`die${n}`] = (o) => die(o, n);

let made = null;
/** Every model, packed for the mesh layer. Made once, when a board first needs them. */
export function models() { return (made ||= Object.fromEntries(Object.entries(RECIPES).map(([k, f]) => [k, bake(f([]))]))); }
