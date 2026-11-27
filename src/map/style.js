// SPDX-License-Identifier: AGPL-3.0-or-later
// Styles, as data. A style is a palette, a set of finishes, a lamp, a surface, a table to lie on and a named set of models:
// nothing in the grounds, the mesh layer or the recipes knows one style from another, so a new style is a new entry here
// (and, for sculpted sets, a pack of models to fetch), never new code. Packs are data; features are code, written once.
// A style never sets the camera, the rules, the seats' colours or the page's own bars and menus.
/** The palette's slots, by name. Recipes paint with these, never with a colour of their own. */
export const SLOT = { metal: 0, wood: 1, stone: 2, roof: 3, thatch: 4, wall: 5, pine: 6, leaf: 7, snow: 8, gold: 9, cloth: 10, hull: 11, dark: 12, field: 13, iron: 14, bone: 15 };

/** War table, the default and the root of the others: matte painted miniatures on a walnut table. Every key a style may set is here. */
const WAR = {
  name: "War table",
  set: "code", // which models: the ones made in code
  pack: "", // a sculpted set to fetch on top of them (a file in site/models/), or none
  models: {}, // one model in place of another, by name: { foot: "army" } stands a block where a soldier would be; "" stands nothing
  kit: { base: 1, cast: 0 }, // the recipes' own settings: how wide a piece's base is; cast 1: figures in plain metal, the owner's enamel on base, shield and flag
  scale: 1, // pieces larger or smaller
  outline: 0, // a dark line round every model, in screen points; 0 for none
  pal: [[142, 150, 162], [104, 76, 54], [146, 142, 134], [142, 70, 56], [190, 158, 92], [214, 204, 180], [44, 82, 62], [70, 112, 66], [238, 240, 240], [214, 176, 84], [232, 224, 202], [112, 80, 56], [40, 34, 32], [200, 170, 92], [74, 78, 86], [226, 220, 204]],
  // the finishes, by row: matte paint, the owner's enamel, metal, the ground's own colour. Each: how much the lamp adds, shine, how tight the shine is, rim light
  fin: [[0.62, 0.04, 12, 0.05], [0.6, 0.16, 28, 0.07], [0.5, 0.42, 20, 0.1], [0.62, 0.02, 10, 0.03]],
  sun: [-0.6, -0.8, 1.3], // where the lamp is: up and to the left, as on a drawn map
  amb: [0.54, 0.14, 0.7], // light with no lamp, more of it from above, and how dark a cast shadow is on a model
  tone: [0.92, 0.14], // the owner's colour as paint on a miniature: a little darker and greyer than on a screen
  glow: [0, 0], // the owner's colour as light: how strongly a piece's edges glow with it, and how much its body is dimmed to show the glow
  steps: 0, // the lamp in two soft bands, as on a toy (how soft the step is); 0 for smooth light
  grade: [1, 1, 1, 0], // the last word on every colour: a tint (r, g, b, 1 for none), and how much darker the corners are
  ground: 0.36, // how dark a cast shadow is on the ground
  // the ground: paper grain, how strongly heights are lit, how deep a tile's rim is cut, gloss on water and wet ink;
  // wash: every colour drawn toward one (r, g, b, how far); own: how much of that wash lies on owned land; hatch: slopes drawn as pen strokes;
  // ruled: water drawn with ruled lines; edge: how heavy the ink lines are; rim: the line between cells in a colour of its own (r, g, b, how strong);
  // wood: grain on every tile; contour: lit lines along the heights (r, g, b, how strong) every `spacing`; sea: the water drawn toward a colour (r, g, b, how far)
  surface: { grain: 1, relief: 1, bevel: 1, gloss: 1, wash: [0, 0, 0, 0], own: 0.7, hatch: 0, ruled: 0, edge: 1, rim: [0, 0, 0, 0], wood: 0, contour: [0, 0, 0, 0], spacing: 12, sea: [0, 0, 0, 0] },
  map: { tint: 0.56, relief: 1, wash: [0, 0, 0, 0] }, // Capo's world: how much of the owner's colour lies over the land's own, how strongly its heights are lit, and a wash as above
  // the cloth, the line round it, and the wood: how bright, how far toned to one colour (tone); grid: faint lines on the table
  table: { baize: [14, 27, 51], rule: [184, 196, 212], wood: [0.8, 0.35], tone: [77, 48, 31], grid: 0 },
  seats: "standard", // the seat colours this style shows until the player chooses (SEATS)
  // lamplight: what changes when the page is in its Lamplight theme (any of the keys above; tables and surfaces as a whole)
  lamp: { sun: [-0.9, -0.5, 0.9], amb: [0.46, 0.12, 0.78], grade: [1.05, 0.94, 0.8, 0.22] },
};
/** A style from another: only what differs is listed, and a table, surface or map lists only the values it changes. */
const from = (base, o) => Object.fromEntries(Object.entries({ ...base, ...o }).map(([k, v]) => [k, base[k] && o[k] && !Array.isArray(v) && typeof v === "object" && k !== "models" && k !== "lamp" ? { ...base[k], ...v } : v]));

export const STYLES = {
  war: WAR,
  // paper and ink: a survey chart on the desk, with stained blocks stamped with map symbols in place of figures
  campaign: from(WAR, {
    name: "Campaign map",
    models: { foot: "army", horse: "armour", gun: "guns", unit1: "army", unit2: "guns", unit3: "armour", unit4: "leader", hill: "", peak: "" },
    pal: [[120, 126, 138], [124, 96, 70], [150, 150, 150], [96, 104, 128], [176, 164, 132], [226, 226, 222], [72, 96, 92], [96, 116, 100], [240, 242, 244], [178, 160, 112], [228, 226, 218], [116, 96, 76], [27, 42, 68], [186, 176, 140], [70, 78, 96], [238, 236, 228]],
    fin: [[0.34, 0.02, 10, 0.02], [0.34, 0.04, 14, 0.03], [0.34, 0.1, 14, 0.04], [0.3, 0.02, 10, 0.02]],
    amb: [0.74, 0.1, 0.4], tone: [0.82, 0.3], ground: 0.2,
    surface: { grain: 1.7, relief: 0.4, bevel: 0.3, gloss: 0, wash: [233, 237, 242, 0.5], own: 0.3, hatch: 0.55, ruled: 0.3, edge: 1.25 },
    map: { tint: 0.4, relief: 0.75, wash: [233, 237, 242, 0.55] },
    table: { baize: [36, 52, 78], rule: [206, 214, 226], wood: [0.66, 0.6] },
    lamp: { amb: [0.66, 0.1, 0.45], grade: [1.02, 0.96, 0.86, 0.14] }, // a desk lamp on the chart
  }),
  // high clarity: flat, outlined, no texture, larger pieces; the same in lamplight, with no vignette
  clear: from(WAR, {
    name: "Clear",
    scale: 1.15, outline: 1.6,
    fin: [[0.3, 0, 10, 0], [0.3, 0, 10, 0], [0.3, 0.06, 12, 0], [0.3, 0, 10, 0]],
    amb: [0.82, 0.06, 0.25], tone: [1, 0], ground: 0.14,
    surface: { grain: 0, relief: 0.3, bevel: 0.7, gloss: 0, edge: 1.45 },
    map: { tint: 0.86, relief: 0.35 },
    table: { baize: [14, 18, 26], rule: [232, 238, 246], wood: [0.42, 0.9] },
    lamp: {},
  }),
  // turned and painted hardwood on routed wooden tiles, in a light oak tray lined with felt; soft two-step light
  toys: from(WAR, {
    name: "Wooden toys",
    kit: { base: 1.12, cast: 0 },
    pal: [[204, 168, 120], [182, 138, 92], [196, 186, 168], [196, 72, 56], [222, 186, 110], [244, 236, 218], [52, 132, 84], [92, 168, 84], [250, 250, 246], [236, 188, 64], [240, 232, 212], [176, 122, 72], [58, 44, 36], [226, 196, 104], [120, 108, 98], [246, 238, 222]],
    fin: [[0.66, 0.12, 18, 0.05], [0.62, 0.3, 30, 0.06], [0.62, 0.2, 18, 0.05], [0.64, 0.04, 10, 0.03]], // satin varnish; the bases are bare wood
    sun: [-0.5, -0.7, 1.5], amb: [0.66, 0.12, 0.55], tone: [1, 0.04], steps: 0.07, ground: 0.26,
    surface: { grain: 0.3, relief: 0.75, bevel: 1.5, gloss: 0.7, wash: [252, 236, 206, 0.12], own: 0.3, wood: 1, edge: 0.9, sea: [64, 132, 176, 0.4] }, // painted blue sea tiles
    map: { tint: 0.64, relief: 0.8, wash: [252, 236, 206, 0.12] },
    table: { baize: [44, 86, 64], rule: [222, 190, 140], wood: [1.3, 0.5], tone: [196, 152, 100] },
    lamp: { sun: [-0.8, -0.5, 1], amb: [0.56, 0.12, 0.65], grade: [1.06, 0.94, 0.8, 0.18] }, // warm room light
  }),
  // cast pewter on a cloisonne plate: silver wire between cells, deep blue glass for the sea, brass only as trim
  pewter: from(WAR, {
    name: "Pewter and brass",
    kit: { base: 1.3, cast: 1 }, // larger enamel bases, so an owner reads on every piece
    pal: [[160, 164, 170], [118, 120, 124], [150, 152, 156], [128, 130, 136], [142, 142, 140], [176, 178, 182], [104, 110, 112], [120, 128, 124], [214, 218, 222], [184, 152, 86], [228, 226, 218], [112, 114, 120], [46, 48, 54], [168, 164, 150], [86, 90, 98], [210, 210, 206]],
    fin: [[0.5, 0.36, 22, 0.16], [0.56, 0.4, 44, 0.08], [0.5, 0.5, 26, 0.16], [0.6, 0.06, 14, 0.04]], // satin metal everywhere; enamel glossier
    sun: [-0.55, -0.75, 1.2], amb: [0.5, 0.16, 0.72], tone: [0.96, 0], ground: 0.38,
    surface: { grain: 0.2, relief: 0.8, bevel: 1.2, gloss: 1.5, wash: [222, 224, 232, 0.2], own: 0, rim: [214, 220, 230, 0.9], edge: 1.1, sea: [16, 40, 118, 0.7] },
    map: { tint: 0.66, relief: 0.8, wash: [222, 224, 232, 0.2] },
    table: { baize: [26, 34, 70], rule: [206, 212, 222], wood: [0.5, 0.7], tone: [40, 32, 30] }, // a velvet surround
    lamp: { sun: [-0.85, -0.55, 0.95], amb: [0.42, 0.16, 0.8], grade: [1.03, 0.95, 0.86, 0.26] },
  }),
  // a situation room: dark glass, lit contours, acrylic blocks lit at the edges in the owner's colour. Nothing moves while the board is idle
  modern: from(WAR, {
    name: "Modern command",
    models: { foot: "army", horse: "armour", gun: "guns", unit1: "army", unit2: "guns", unit3: "armour", unit4: "leader", hill: "", peak: "" },
    pal: [[72, 80, 92], [62, 68, 78], [84, 92, 104], [70, 80, 96], [100, 104, 100], [140, 150, 164], [36, 64, 68], [42, 76, 74], [200, 214, 228], [210, 220, 230], [120, 130, 144], [52, 58, 68], [14, 16, 22], [80, 96, 90], [60, 66, 76], [226, 236, 246]],
    fin: [[0.44, 0.08, 18, 0.12], [0.36, 0.22, 36, 0.16], [0.44, 0.3, 24, 0.16], [0.4, 0.02, 10, 0.06]],
    amb: [0.34, 0.1, 0.6], tone: [0.8, 0.12], glow: [0.9, 0.3], ground: 0.3,
    surface: { grain: 0.25, relief: 0.6, bevel: 0.6, gloss: 0.5, wash: [22, 26, 34, 0.88], own: 0, edge: 0.9, rim: [92, 136, 176, 0.5], contour: [120, 196, 236, 0.6], spacing: 10, sea: [10, 42, 82, 0.72] },
    map: { tint: 0.7, relief: 0.7, wash: [14, 20, 32, 0.8] },
    table: { baize: [30, 36, 46], rule: [120, 170, 210], wood: [1, 0.94], tone: [44, 52, 64], grid: 0.5 }, // daylight: smoked glass
    seats: "safe",
    lamp: { amb: [0.24, 0.08, 0.66], grade: [0.94, 0.97, 1.04, 0.2], table: { baize: [12, 16, 22], rule: [100, 160, 204], wood: [1, 0.97], tone: [18, 22, 30], grid: 0.6 } }, // lamplight: darker glass
  }),
};
/** Where the player's choice of style is kept, the same for every game. */
export const STYLE_KEY = "capo-style";
/** The style of a name, or the default. */
export const styleOf = (name) => STYLES[name] || STYLES.war;
/** A style as it is worn: in daylight as written, in lamplight with its lamp's values over it. */
export const wear = (name, light = "day") => { const s = styleOf(name); return light === "lamp" ? { ...s, ...s.lamp } : s; };

// Seat colours: a setting of their own, in every style and game (ruling 147). Standard keeps what each player chose to wear;
// the others put a tested set on the seats in order, and keep to it whatever was chosen. High contrast has a set for light boards
// and one for dark ones. Checked by the gate (tools/check.mjs): contrast on every style's board, colour vision, greyscale.
export const SEATS = {
  standard: { name: "Standard" },
  safe: { // Okabe and Ito's set; on a dark board their yellow takes the place of their dark blue
    name: "Colour-blind safe",
    light: [["Blue", [0, 114, 178]], ["Orange", [230, 159, 0]], ["Green", [0, 158, 115]], ["Purple", [204, 121, 167]], ["Vermilion", [213, 94, 0]], ["Sky", [86, 180, 233]]],
    dark: [["Sky", [86, 180, 233]], ["Orange", [230, 159, 0]], ["Green", [0, 158, 115]], ["Purple", [204, 121, 167]], ["Vermilion", [213, 94, 0]], ["Yellow", [240, 228, 66]]],
  },
  contrast: {
    name: "High contrast",
    light: [["Black", [0, 0, 0]], ["Blue", [46, 77, 163]], ["Red", [185, 59, 36]], ["Navy", [0, 33, 61]], ["Violet", [55, 25, 136]], ["Umber", [69, 64, 56]]],
    dark: [["White", [255, 255, 255]], ["Yellow", [255, 225, 29]], ["Blue", [82, 166, 255]], ["Red", [255, 0, 0]], ["Cyan", [7, 227, 200]], ["Pink", [202, 115, 175]]],
  },
};
/** Where the player's choice of seat colours is kept, the same for every game. */
export const SEATS_KEY = "capo-seats";
/** The land most boards lie on (the table games' paper and Banners' plain), as a style shows it: what seat colours must stand out from. */
export const LANDS = [[231, 217, 185], [222, 190, 150]];
const lum = (c) => c.reduce((s, v, i) => s + [0.2126, 0.7152, 0.0722][i] * ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), 0);
/** A colour as a style's ground shows it: drawn toward the wash, by `k` of the way (all of it for open land; owned land takes `own` of it). */
export const washed = (rgb, s, k = 1) => { const w = s.surface.wash; return rgb.map((v, i) => v + (w[i] - v) * w[3] * k); };
/** Is this style's board dark? Then seat colours must be light to stand out on it. */
export const darkBoard = (s) => lum(washed(LANDS[0], s)) < 0.18;
/** The seat colours in force: the set chosen, or the style's own until one is. */
export const seatSet = (chosen, style) => (SEATS[chosen] ? chosen : styleOf(style).seats);
/** The colours a seat set puts on seats 0 to 5, [name, rgb] each, for this style's board; null for Standard (each seat as chosen). */
export function seatsOf(chosen, style) { const s = styleOf(style), set = SEATS[seatSet(chosen, style)]; return set.light ? (darkBoard(s) && set.dark) || set.light : null; }
