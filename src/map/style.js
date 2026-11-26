// SPDX-License-Identifier: AGPL-3.0-or-later
// Styles, as data. A style is a palette, a set of finishes, a lamp, a surface, a table to lie on and a named set of models:
// nothing in the grounds, the mesh layer or the recipes knows one style from another, so a new style is a new entry here
// (and, for sculpted sets, a pack of models to fetch), never new code. Packs are data; features are code, written once.
// A style never sets the camera, the rules, the seats' colours or the page's own bars and menus.
/** The palette's slots, by name. Recipes paint with these, never with a colour of their own. */
export const SLOT = { metal: 0, wood: 1, stone: 2, roof: 3, thatch: 4, wall: 5, pine: 6, leaf: 7, snow: 8, gold: 9, cloth: 10, hull: 11, dark: 12, field: 13, iron: 14, bone: 15 };

/** War table, the default and the root of the others: matte painted miniatures on a walnut table. */
const WAR = {
  name: "War table",
  set: "code", // which models: the ones made in code
  pack: "", // a sculpted set to fetch on top of them (a file in site/models/), or none
  models: {}, // one model in place of another, by name: { foot: "army" } stands a block where a soldier would be; "" stands nothing
  scale: 1, // pieces larger or smaller
  outline: 0, // a dark line round every model, in screen points; 0 for none
  pal: [[142, 150, 162], [104, 76, 54], [146, 142, 134], [142, 70, 56], [190, 158, 92], [214, 204, 180], [44, 82, 62], [70, 112, 66], [238, 240, 240], [214, 176, 84], [232, 224, 202], [112, 80, 56], [40, 34, 32], [200, 170, 92], [74, 78, 86], [226, 220, 204]],
  // the finishes, by row: matte paint, the owner's enamel, metal, the ground's own colour. Each: how much the lamp adds, shine, how tight the shine is, rim light
  fin: [[0.62, 0.04, 12, 0.05], [0.6, 0.16, 28, 0.07], [0.5, 0.42, 20, 0.1], [0.62, 0.02, 10, 0.03]],
  sun: [-0.6, -0.8, 1.3], // where the lamp is: up and to the left, as on a drawn map
  amb: [0.54, 0.14, 0.7], // light with no lamp, more of it from above, and how dark a cast shadow is on a model
  tone: [0.92, 0.14], // the owner's colour as paint on a miniature: a little darker and greyer than on a screen
  ground: 0.36, // how dark a cast shadow is on the ground
  // the ground: paper grain, how strongly heights are lit, how deep a tile's rim is cut, gloss on water and wet ink;
  // wash: every colour drawn toward one (r, g, b, how far); hatch: slopes drawn as pen strokes; ruled: water drawn with ruled lines; edge: how heavy the ink lines are
  surface: { grain: 1, relief: 1, bevel: 1, gloss: 1, wash: [0, 0, 0, 0], hatch: 0, ruled: 0, edge: 1 },
  map: { tint: 0.56, relief: 1, wash: [0, 0, 0, 0] }, // Capo's world: how much of the owner's colour lies over the land's own, how strongly its heights are lit, and a wash as above
  table: { baize: [14, 27, 51], rule: [184, 196, 212], wood: [0.8, 0.35] }, // the cloth, the line round it, and the wood: how bright, how far toned to one brown
};

export const STYLES = {
  war: WAR,
  // paper and ink: a survey chart on the desk, with stained blocks stamped with map symbols in place of figures
  campaign: {
    ...WAR, name: "Campaign map",
    models: { foot: "army", horse: "armour", gun: "guns", unit1: "army", unit2: "guns", unit3: "armour", unit4: "leader", hill: "", peak: "" },
    pal: [[120, 126, 138], [124, 96, 70], [150, 150, 150], [96, 104, 128], [176, 164, 132], [226, 226, 222], [72, 96, 92], [96, 116, 100], [240, 242, 244], [178, 160, 112], [228, 226, 218], [116, 96, 76], [27, 42, 68], [186, 176, 140], [70, 78, 96], [238, 236, 228]],
    fin: [[0.34, 0.02, 10, 0.02], [0.34, 0.04, 14, 0.03], [0.34, 0.1, 14, 0.04], [0.3, 0.02, 10, 0.02]],
    amb: [0.74, 0.1, 0.4], tone: [0.82, 0.3], ground: 0.2,
    surface: { grain: 1.7, relief: 0.4, bevel: 0.3, gloss: 0, wash: [233, 237, 242, 0.5], hatch: 0.55, ruled: 0.3, edge: 1.25 },
    map: { tint: 0.4, relief: 0.75, wash: [233, 237, 242, 0.55] },
    table: { baize: [36, 52, 78], rule: [206, 214, 226], wood: [0.66, 0.6] },
  },
  // high clarity: flat, outlined, no texture, larger pieces
  clear: {
    ...WAR, name: "Clear",
    scale: 1.15, outline: 1.6,
    fin: [[0.3, 0, 10, 0], [0.3, 0, 10, 0], [0.3, 0.06, 12, 0], [0.3, 0, 10, 0]],
    amb: [0.82, 0.06, 0.25], tone: [1, 0], ground: 0.14,
    surface: { grain: 0, relief: 0.3, bevel: 0.7, gloss: 0, wash: [0, 0, 0, 0], hatch: 0, ruled: 0, edge: 1.45 },
    map: { tint: 0.86, relief: 0.35, wash: [0, 0, 0, 0] },
    table: { baize: [14, 18, 26], rule: [232, 238, 246], wood: [0.42, 0.9] },
  },
};
/** Where the player's choice of style is kept, the same for every game. */
export const STYLE_KEY = "capo-style";
/** The style of a name, or the default. */
export const styleOf = (name) => STYLES[name] || STYLES.war;
