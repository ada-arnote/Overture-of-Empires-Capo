// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game's first puzzles, on the small board: positions met in games between bots, each with exactly one first
// move that traps the rival Lodestone in time, whatever they answer (the tests check it by trying every line). Each is the
// open option `puzzle` of the rules: cells as [cell, stones from the bottom], pouches, the seat to move, which seat plays
// up the board, and the turns allowed. `answer` is for the tests and the page's "Show the answer"; it is not in the option.
export const PUZZLES = [
  { name: "Trap in one: the strike", turns: 1, cells: [[0, 9, 5], [6, 1], [7, 9, 7, 4], [10, 9], [15, 2], [16, 1], [17, 9, 0], [21, 4], [25, 4, 3], [26, 2], [33, 2], [35, 3]], pouch: [[0, 0, 0, 0, 1], [0, 0, 0, 0, 0]], seat: 0, south: 1, answer: { do: "strike", from: 16, to: 10 } },
  { name: "Trap in one: the long slide", turns: 1, cells: [[3, 1], [5, 9], [10, 2, 5], [12, 4, 9], [18, 4], [22, 8], [28, 6], [30, 2], [31, 3], [32, 4, 0], [33, 7], [35, 4], [36, 4]], pouch: [[0, 0, 1, 0, 1], [0, 0, 0, 0, 0]], seat: 0, south: 0, answer: { do: "move", from: 30, to: 17 } },
  { name: "Trap in one: the quiet step", turns: 1, cells: [[5, 6], [6, 7], [10, 9, 9], [13, 7, 0], [18, 4], [19, 4, 3], [21, 2], [23, 6], [24, 9, 8], [28, 5], [33, 7]], pouch: [[0, 0, 0, 0, 1], [0, 0, 0, 0, 2]], seat: 1, south: 0, answer: { do: "move", from: 6, to: 7 } },
  { name: "Trap in two: from the pouch", turns: 2, cells: [[6, 4, 3], [8, 0], [9, 2], [11, 4], [12, 4, 2], [13, 1], [19, 4], [22, 5], [25, 9], [26, 4], [30, 9], [32, 3], [34, 7]], pouch: [[0, 1, 1, 0, 0], [0, 0, 0, 0, 1]], seat: 0, south: 0, answer: { do: "drop", kind: 2, to: 17 } },
  { name: "Trap in two: take the guard", turns: 2, cells: [[1, 4], [3, 2], [5, 4], [7, 2], [14, 0], [15, 6], [17, 3], [19, 4, 3], [20, 1], [22, 5], [26, 4], [29, 7], [30, 2], [35, 9]], pouch: [[0, 0, 0, 0, 3], [0, 0, 0, 0, 0]], seat: 0, south: 0, answer: { do: "strike", from: 30, to: 29 } },
  { name: "Trap in two: the crowd", turns: 2, cells: [[0, 9], [1, 9], [3, 7], [6, 9], [9, 1], [11, 9], [12, 3], [13, 6], [14, 5], [16, 0], [19, 2], [23, 3], [24, 7], [25, 9], [26, 4], [29, 7]], pouch: [[0, 0, 0, 0, 1], [0, 0, 0, 0, 1]], seat: 0, south: 1, answer: { do: "strike", from: 19, to: 13 } },
];
/** The option a puzzle is played with. */
export const optionOf = (z) => ({ cells: z.cells, pouch: z.pouch, seat: z.seat, south: z.south, turns: z.turns });
