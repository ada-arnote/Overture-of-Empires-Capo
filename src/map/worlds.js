// SPDX-License-Identifier: AGPL-3.0-or-later
// The starter worlds: recipes for src/map/worldgen.js, each with the words that tell an AI what kind of place it is.
// A recipe is a shape for the land, cultures as sounds for names, factions, a premise, a tone and what exists there.
// All of it is our own: nothing here comes from a real place or from anyone else's fiction.

// Cultures as sounds: starts, vowels, closes and endings of names.
const w = (s) => s.split(" ");
const CULTURES = {
  harn: ["Harnic", "h br d v sk th r m g k st", "a e o u ei", "r n ld rn th", "holt fell wick stead garth mere hald run"],
  orv: ["Orvese", "l m v s c t r p f d", "a e i o ia io", "n l r s", "ano essa ora ine elle ura ezzo ami"],
  maen: ["Maenish", "c g ll t m n rh p", "y a e o wy ae", "n r th dd l", "wen dor ach mor wyn eth ys"],
  sarr: ["Sarrane", "s z t k n m r l b", "a i u e ai ou", "n r sh m l", "ar oa une ika ale anu esh imo"],
  kett: ["Kettic", "k t p h w y n", "e i o a ei au", "k t p n", "kett pol tenn wek ook ip ut"],
  ulek: ["Ulek", "t k q b d j y s ch", "a u o y e", "r k n gh l", "gul tem dzin kesh urd bak yk ogh"],
  amar: ["Amari", "m n p t s h r kh", "a e i u aa", "m n r t sh", "epu anat ushu esh amun ir aba"],
  ysh: ["Ysh", "y n t k m w s ch", "a e i o ua", "k n sh", "aqa imi oro ettu ish ua ok"],
  stan: ["Landing Standard", "n v k t s l r d z", "o a e i y", "x n s r v", "is on ara ex ium ova yx ane"],
  drift: ["Second Wave", "q j x w f g m", "a e o uo io", "l ss m th", "une oth iss el aum io"],
  wend: ["Wendric", "w b f gr st p h tr m c", "a o e i ay", "n r l t", "ock ery ant ume ith ow ell"],
};
const culture = (k) => { const [name, a, b, c, z] = CULTURES[k]; return { name, a: w(a), b: w(b), c: w(c), z: w(z) }; };
// a faction, briefly: name (with * for its made name), culture, size 1 to 6, might 1 to 10, home (0 any, 1 coast, 2 inland), what it is
const f = (name, culture, size, might, at, what) => ({ name, culture, size, might, at, what });

/** The starter settings. Each is whole on its own: saved as a file with kind "capo-setting" it opens like any other. */
export const SETTINGS = [
  {
    id: "throne", seed: "pretender", title: "The Vacant Throne", start: "0912-03-01", where: "a low-fantasy continent of rival kingdoms",
    blurb: "A continent of rival kingdoms, nine winters after the high king died without an heir.",
    premise: "The high king died without an heir, and the regency council broke within a year. Nine winters on, the crown lands are held by whoever can garrison them, the great dukes mint their own coin, and every court keeps a pretender in a back room. Nobody has yet dared to sit the throne.",
    tone: "Low fantasy: mud, oaths, hunger and ledgers. Grim but not hopeless; people are shrewd, not monstrous.",
    level: "Late medieval: pikes, crossbows, the first bombards, cogs and river barges. Magic is rumour: omens, relics and hedge cures that may be nothing. No wizards, no monsters, no peoples but humankind.",
    land: 34, rough: 70, blobs: [[50, 50, 36, 34]], isles: 5, provinces: 280, realms: 16, cultures: ["harn", "orv", "maen"],
    factions: [
      f("Regency of *", 0, 4, 7, 0, "holds the old capital and the seal, and claims to rule for an heir nobody has seen"),
      f("Duchy of *", 0, 3, 6, 0, "the late king's marshal, with the best heavy horse and the worst debts"),
      f("Kingdom of *", 1, 3, 6, 0, "a southern crown that never knelt willingly; rich in wine, wool and lawyers"),
      f("* League", 1, 2, 5, 1, "merchant towns bound by charter, who lend to every side and fear every winner"),
      f("Principality of *", 2, 2, 4, 2, "hill princes with long memories, longbows and a law older than the throne"),
      f("Holy See of *", 0, 1, 3, 0, "the temple state; its blessing makes a king lawful, and it has a price"),
    ],
    minors: ["County of *", "* March", "Free City of *", "Barony of *"],
  },
  {
    id: "ledger", seed: "cargo", title: "The Salt Ledger", start: "1604-05-01", where: "an archipelago of trading city-states in an age of sail",
    blurb: "A sea of islands, no king, and one shared book of debts that somebody has been forging.",
    premise: "A sea of islands and no king. The cities of the Inner Sea live by the Ledger, the shared book of debts, cargo marks and convoy shares kept by all the counting houses together. This spring one house was caught writing its own pages. Nobody trusts the book now, and every harbour is arming its merchantmen.",
    tone: "Mercantile intrigue and salt air: contracts, convoys, feuds between houses, sudden violence at sea. Wry rather than grim.",
    level: "Age of sail: galleons, cannon, compasses, printed bills of exchange. No magic. Sailors keep superstitions, charts are guarded like gold, and the far waters are honestly unknown.",
    land: 20, rough: 60, blobs: [[30, 35, 9, 10], [62, 30, 10, 9], [45, 66, 11, 9], [78, 62, 8, 10], [17, 68, 7, 8]], isles: 24, provinces: 220, realms: 18, reach: 9, cultures: ["sarr", "kett"],
    factions: [
      f("Serene City of *", 0, 2, 7, 1, "the oldest counting house and keeper of the Ledger; proud, slow, and the one accused"),
      f("* Compact", 0, 3, 6, 0, "a league of spice and sugar islands that wants the book rewritten in its favour"),
      f("Free Port of *", 1, 1, 5, 1, "asks no questions of any cargo; home to privateers with letters from everybody"),
      f("* Admiralty", 1, 2, 6, 1, "northern convoy captains who sell protection and are starting to prefer ruling"),
      f("Chartered Company of *", 0, 2, 5, 1, "a company that outgrew its city and now governs islands for its shareholders"),
    ],
    minors: ["City of *", "* Isles", "Port of *", "House of *"],
  },
  {
    id: "grass", seed: "tribute", title: "Grass and Granary", start: "0431-04-01", where: "a world of one great farming empire and the rider peoples of the steppe",
    blurb: "An old empire a season from famine, and steppe clans who have just chosen one war leader.",
    premise: "The Granary Throne has fed forty cities for six hundred years behind its canals and its long wall. This year the river failed, the wall garrisons went unpaid, and on the steppe a council of clans chose a single war leader for the first time in living memory. Between them lie the caravan cities, which pay tribute to both and trust neither.",
    tone: "Epic and dry: distance, weather, tribute and pride. Court whispers on one side, campfire councils on the other; both are clever.",
    level: "Iron and horse: composite bows, lancers, siege engineers, canals, relay riders. No gunpowder and no magic, but omens and sky readers move courts and clans alike.",
    land: 46, rough: 40, blobs: [[50, 45, 44, 26], [30, 72, 16, 14], [76, 72, 14, 12]], isles: 3, provinces: 300, realms: 14, cultures: ["ulek", "amar", "ysh"],
    factions: [
      f("Granary Throne of *", 1, 6, 9, 0, "the old empire: vast, rich, bound in paperwork, and a season from famine"),
      f("* Host", 0, 4, 7, 2, "the united clans under a new war leader, who must keep winning to stay leader"),
      f("* Clans", 0, 3, 5, 2, "riders who refused the council and sell their lances to whoever pays"),
      f("Caravan City of *", 2, 1, 4, 2, "an oasis market that pays tribute to both sides and spies for both"),
      f("Viceroyalty of *", 1, 2, 5, 0, "a frontier governor with the wall's best troops and plans of his own"),
      f("Kingdom of *", 2, 2, 5, 1, "a sea kingdom on the empire's flank, waiting for its moment"),
    ],
    minors: ["* Clans", "Caravan City of *", "Prefecture of *", "* Oasis"],
  },
  {
    id: "silence", seed: "signal", title: "The Long Silence", start: "2971-01-01", where: "a colony world in a far future, long cut off from old Earth",
    blurb: "A colony world four centuries old, two centuries after the signal from home stopped.",
    premise: "The arks reached this world four centuries ago. Two hundred years ago the signal from home stopped, and nobody knows why. The Charter that bound the landing sites into one colony has been amended until it means whatever the strongest site says. Now the orbital relay is failing, and whoever repairs it will speak for the whole planet, if home ever calls again.",
    tone: "Hard-edged science fiction: scarcity, engineering, law and loyalty. Hopeful about people, unsentimental about physics.",
    level: "Far future, but worn: fusion plants, orbital lift, tailored crops, drones and railguns, all hard to replace. No aliens, no travel faster than light, no powers of the mind. Old Earth is a memory, and none of its nations exist here.",
    land: 30, rough: 60, blobs: [[28, 46, 20, 28], [70, 52, 22, 26], [50, 13, 18, 6]], isles: 6, provinces: 240, realms: 12, reach: 8, cultures: ["stan", "drift"],
    factions: [
      f("* Charter Authority", 0, 3, 8, 0, "the first landing site; keeps the original Charter and the last working shipyard"),
      f("* Combine", 0, 3, 7, 2, "mining and fusion cooperatives that power everyone and resent being governed"),
      f("Free Habitats of *", 1, 2, 5, 1, "sea-farm towns of the second wave, democratic to the point of paralysis"),
      f("* Directorate", 0, 2, 6, 0, "engineers who run the terraforming grid and think votes are a design flaw"),
      f("* Commons", 1, 2, 4, 2, "settlers who left the Charter to live by older, slower rules"),
    ],
    minors: ["* Station", "* Township", "Free Habitat of *", "* Works"],
  },
  {
    id: "paper", seed: "railhead", title: "The Paper Republics", start: "1847-02-01", where: "a continent of new nations in an age of steam",
    blurb: "New nations with fresh constitutions, old debts, and an interior nobody asked.",
    premise: "Twenty years ago the colonies threw the old empire into the sea and wrote constitutions before the smoke cleared. The ink is dry now and the quarrels are not: where the borders run, who owes the war debt, who owns the railways, and what is owed to the peoples of the interior, who were here first and signed nothing.",
    tone: "Earnest, argumentative and ambitious: newspapers, elections, land fever and bad faith. Idealists and speculators share every table.",
    level: "Age of steam: rifles, field guns, river steamers, the first railways and telegraph lines. No magic. The interior is poorly mapped, and maps are political.",
    land: 40, rough: 55, blobs: [[58, 50, 34, 36], [18, 40, 8, 20]], isles: 4, provinces: 300, realms: 15, cultures: ["wend", "orv", "ysh"],
    factions: [
      f("Republic of *", 0, 3, 7, 1, "the largest of the new states; believes the revolution was for union, under itself"),
      f("United Provinces of *", 0, 3, 6, 0, "a loose federation that agrees on nothing but its dislike of the big republic"),
      f("Commonwealth of *", 1, 2, 5, 1, "a port state of bankers and shipowners that holds most of the war debt"),
      f("* Confederacy", 2, 4, 5, 2, "the interior nations, allied at last, with good horses and newly bought rifles"),
      f("* Territory", 0, 3, 3, 2, "charter land run by a railway company, with more surveyors than citizens"),
      f("Dominion of *", 1, 1, 6, 1, "the old empire's last foothold, garrisoned and patient"),
    ],
    minors: ["Republic of *", "State of *", "* Nation", "Free City of *"],
  },
].map((s) => ({ kind: "capo-setting", v: 1, ...s, cultures: s.cultures.map(culture) }));
