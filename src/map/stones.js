// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game's stones for the lit table, made in code with the kit (our own work). Every stone sits on a pewter base
// ring with one, two or three dark notches for its tier, repeated round the ring so its height reads from any side; above it,
// enamel in the owner's colour. Only the top stone of a stack shows its kind, by outline and by its move mark inlaid on top,
// as on the flat board: Lodestone a taller drum with a pewter band, a ring and a dot; Warden a hexagonal block with a square;
// Courier two bars; Slinger an arrow; Pebble a smaller disc with a chevron that points forward. A stone lower in a stack is
// a plain disc, so each tier sits on the one below with a visible lip. One cell's radius is 1; z is up.
// Models are named `stone<kind><tier>` (the top stone) and `disc<tier>` (one under it), tier 0 to 2: their height is built in.
import { bake, box, lathe, move, prism } from "./kit.js";
import { SLOT } from "./style.js";

const c = (slot, shade = 128) => [SLOT[slot], shade, 0], TAU = Math.PI * 2;
/** How high one stone stands: each tier sits this far above the one below. */
export const RISE = 0.17;
const R = 0.54;

/** The base ring, with its notches: `n` short dark slots, three times round. */
function ring(o, n, z) {
  lathe(o, [[R, z], [R + 0.02, z + 0.012], [R + 0.02, z + 0.05], [R - 0.02, z + 0.06], [0, z + 0.06]], 20, c("metal"), 2);
  for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) {
    const a = (k / 3) * TAU + (i - (n - 1) / 2) * 0.17;
    move(o, box([], -0.018, -0.008, 0, 0.018, 0.012, 0.04, c("dark")), Math.cos(a) * (R + 0.012), Math.sin(a) * (R + 0.012), z + 0.008, 1, a + Math.PI / 2);
  }
  return o;
}
/** The enamel body of a disc: the owner's colour, a little drawn in at the top edge. */
const body = (o, z, h = RISE - 0.06) => lathe(o, [[R - 0.02, z], [R - 0.01, z + 0.01], [R - 0.01, z + h - 0.02], [R - 0.05, z + h], [0, z + h]], 20, c("cloth"), 1);

/** A mark inlaid on a top face, in pale bone so it reads on any enamel: drawn pointing up the board (-y), as on the flat board. */
const bar = (o, x0, y0, x1, y1, z, w = 0.035) => { const l = Math.hypot(x1 - x0, y1 - y0); return move(o, box([], -l / 2, -w, 0, l / 2, w, 0.025, c("bone")), (x0 + x1) / 2, (y0 + y1) / 2, z, 1, Math.atan2(y1 - y0, x1 - x0)); };
const SHAPES = [
  (o, z) => { // Lodestone: a taller drum with a pewter band, a ring and a dot on top
    const t = z + 0.15;
    lathe(o, [[R - 0.02, z], [R - 0.01, z + 0.01], [R - 0.01, t - 0.02], [R - 0.05, t], [0, t]], 20, c("cloth"), 1);
    lathe(o, [[R + 0.005, z + 0.04], [R + 0.015, z + 0.05], [R + 0.015, z + 0.08], [R + 0.005, z + 0.09]], 20, c("metal"), 2);
    lathe(o, [[0.26, t], [0.26, t + 0.025], [0.19, t + 0.025], [0.19, t]], 18, c("bone"));
    return lathe(o, [[0.07, t], [0.07, t + 0.03], [0, t + 0.035]], 10, c("bone"));
  },
  (o, z) => { // Warden: a broad hexagonal block with a square on top
    const t = z + 0.13;
    prism(o, Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * TAU) * (R + 0.03), Math.sin((i / 6) * TAU) * (R + 0.03)]), z, t, c("cloth"), 1, 0.03);
    return box(o, -0.16, -0.16, t, 0.16, 0.16, t + 0.025, c("bone"));
  },
  (o, z) => { const t = z + 0.11; body(o, z, 0.11); bar(o, -0.25, -0.1, 0.25, -0.1, t); return bar(o, -0.25, 0.1, 0.25, 0.1, t); }, // Courier: two bars, for the slide
  (o, z) => { const t = z + 0.11; body(o, z, 0.11); bar(o, -0.22, 0.22, 0.2, -0.2, t); bar(o, 0.02, -0.24, 0.24, -0.24, t); return bar(o, 0.24, -0.24, 0.24, -0.02, t); }, // Slinger: an arrow, for the sling
  (o, z) => { const t = z + 0.09; lathe(o, [[R - 0.08, z], [R - 0.07, z + 0.01], [R - 0.07, t - 0.02], [R - 0.11, t], [0, t]], 18, c("cloth"), 1); bar(o, -0.2, 0.08, 0, -0.12, t); return bar(o, 0, -0.12, 0.2, 0.08, t); }, // Pebble: a smaller disc with a chevron, forward
];

let made = null;
/** The stones, packed for the mesh layer, made once. */
export function stoneModels() {
  if (made) return made;
  made = {};
  for (let t = 0; t < 3; t++) {
    const z = t * RISE;
    made[`disc${t}`] = bake(body(ring([], t + 1, z), z + 0.05));
    for (let k = 0; k < 5; k++) made[`stone${k}${t}`] = bake(SHAPES[k](ring([], t + 1, z), z + 0.05));
  }
  return made;
}
