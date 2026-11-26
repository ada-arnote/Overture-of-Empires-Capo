// SPDX-License-Identifier: AGPL-3.0-or-later
// Village names for The Island Fable: our own, each made of two plain parts. A village is named for the hex its hall
// stands on, from the game's own shuffle of the island, so a seed always gives the same names and no two villages share one.
const HEAD = ["Alder", "Amber", "Brack", "Bram", "Cold", "Crow", "Dove", "Elder", "Fen", "Gorse", "Grey", "Gull", "Hazel", "Heron", "Kelp", "Lark", "Marsh", "Moss", "Nettle", "Otter", "Pike", "Quill", "Reed", "Salt", "Stone", "Thorn", "Wren", "Yarrow"];
const TAIL = ["mere", "ford", "holt", "wick", "stead", "combe", "haven", "rise", "garth", "mouth", "wade", "hythe"];

/** The name of the village whose hall stands on this hex. */
export const villageName = (p, hall) => { const k = p.order[hall]; const h = k % HEAD.length; return HEAD[h] + TAIL[(Math.floor(k / HEAD.length) + 5 * h) % TAIL.length]; };
