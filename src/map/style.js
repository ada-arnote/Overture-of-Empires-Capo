// SPDX-License-Identifier: AGPL-3.0-or-later
// Styles, as data. A style is a palette, a set of finishes, a lamp, a table to lie on and a named set of models:
// nothing in the mesh layer or the recipes knows one style from another, so a new style is a new entry here (and, for
// sculpted sets, a pack of models to fetch), never new code.
/** The palette's slots, by name. Recipes paint with these, never with a colour of their own. */
export const SLOT = { metal: 0, wood: 1, stone: 2, roof: 3, thatch: 4, wall: 5, pine: 6, leaf: 7, snow: 8, gold: 9, cloth: 10, hull: 11, dark: 12, field: 13, iron: 14, bone: 15 };
/** The finishes, by row: matte paint, the owner's enamel, metal, the ground's own colour. Each: how much the lamp adds, shine, how tight the shine is, rim light. */
export const STYLES = {
  painted: {
    name: "Painted miniatures",
    set: "code", // which models: the ones made in code
    pal: [[142, 150, 162], [104, 76, 54], [146, 142, 134], [142, 70, 56], [190, 158, 92], [214, 204, 180], [44, 82, 62], [70, 112, 66], [238, 240, 240], [214, 176, 84], [232, 224, 202], [112, 80, 56], [40, 34, 32], [200, 170, 92], [74, 78, 86], [226, 220, 204]],
    fin: [[0.62, 0.04, 12, 0.05], [0.6, 0.16, 28, 0.07], [0.5, 0.42, 20, 0.1], [0.62, 0.02, 10, 0.03]],
    sun: [-0.6, -0.8, 1.3], // where the lamp is: up and to the left, as on a drawn map
    amb: [0.54, 0.14, 0.7], // light with no lamp, more of it from above, and how dark a cast shadow is
    tone: [0.92, 0.14], // the owner's colour as paint on a miniature: a little darker and greyer than on a screen
    ground: 0.36, // how dark a cast shadow is on the ground
    table: { baize: [14, 27, 51], rule: [184, 196, 212], wood: [0.8, 0.35] }, // the cloth, the line round it, and the wood: how bright, how far toned to one brown
  },
};
