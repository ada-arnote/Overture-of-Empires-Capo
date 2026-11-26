// SPDX-License-Identifier: AGPL-3.0-or-later
// Three authored starts on the real map, as scenario files (the same shape a player saves and shares): a
// believable present day, a regional brink, and an armed peace a few years on. Fiction, every one: not news and
// not a forecast. Facts name offices, never people, so no line goes stale when an office changes hands and no
// real person is given words or deeds. Text is a draft for the owner's review.
// How each is tuned for the rules: a war starts on the scenario's first day (so nobody begins worn out); a pair
// at -2 or lower that shares a land border, with no treaty and a gap of 2 in might, is one the rules-only turn may
// take to war, so those pairs are chosen on purpose and named in the notes beside each start.

const pair = (p) => p.split("|").sort().join("|");
const pacts = (kind, list, start) => list.map((p) => ({ pair: pair(p), kind, since: start }));
const hub = (c, others) => others.split(" ").map((o) => `${c}|${o}`);
/** A whole scenario from short notes. */
function start(s) {
  const t = s.treaties || {};
  return {
    kind: "authored", v: 1, id: s.id, title: s.title, blurb: s.blurb, opening: s.opening, start: s.start, owners: {}, custom: null,
    wars: (s.wars || []).map((p) => ({ pair: pair(p), since: s.start, by: "scenario" })),
    treaties: [...pacts("alliance", t.alliance || [], s.start), ...pacts("defence", t.defence || [], s.start), ...pacts("trade", t.trade || [], s.start)],
    facts: s.facts.map((text) => ({ text, turn: 0 })), might: s.might || {},
    rel: Object.fromEntries(Object.entries(s.rel || {}).map(([p, n]) => [pair(p), n])),
  };
}

// The Atlantic alliance, written as defence treaties between the United States and each other member.
const ATLANTIC = "ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR";

export const AUTHORED = [
  // 1. The present day. Rules-only wars are possible between: Pakistan and Afghanistan, India and Pakistan,
  // Thailand and Cambodia, Israel and Lebanon, Ethiopia and Eritrea; and, once its war ends, Russia and a neighbour.
  start({
    id: "late-2026", title: "Late 2026: the world as it stands", start: "2026-12-01",
    blurb: "Fiction. The present day with its quarrels in place: a great war in Europe, a dozen cold borders, old alliances under strain. Leaders are offices, not names.",
    opening: "The story begins on 1 December 2026, in a world drawn from the headlines and then let go. A war in eastern Europe is in its fifth year. The great powers trade tariffs, chips and warnings instead of shots. The old alliances still stand, and nobody is sure what they are worth. From here on everything is invented: the rules decide wars and borders, and the story tells the rest. This start names offices (a president, a chancellor, a supreme leader), never the people who hold them.",
    wars: ["RUS|UKR"],
    treaties: {
      alliance: ["RUS|BLR"],
      defence: [...hub("USA", ATLANTIC), ...hub("USA", "JPN KOR AUS PHL"), "FRA|DEU", "DEU|POL", "GBR|FRA", "POL|LTU", "FIN|SWE", "GBR|NOR", "AUS|GBR", "RUS|PRK", "CHN|PRK", "TUR|AZE"],
      trade: ["CHN|RUS", "CHN|PAK", "IND|RUS", "USA|MEX", "USA|ISR", "BRA|ARG", "BRA|URY", "BRA|PRY", "IRN|RUS", "SAU|ARE", "JPN|AUS", "IND|ARE", "CHN|BRA", "CHN|ZAF", "EGY|SAU"],
    },
    rel: {
      "RUS|USA": -2, "CHN|USA": -1, "IRN|USA": -3, "PRK|USA": -2, "USA|VEN": -2, "CUB|USA": -2, "IRN|ISR": -3, "CHN|TWN": -2, "CHN|JPN": -1, "CHN|IND": -1, "CHN|PHL": -2,
      "IND|PAK": -2, "KOR|PRK": -2, "JPN|PRK": -2, "AFG|PAK": -2, "ISR|LBN": -2, "ISR|SYR": -1, "KHM|THA": -2, "ERI|ETH": -2, "EGY|ETH": -1, "DZA|MAR": -2, "KOS|SRB": -2,
      "GUY|VEN": -2, "COD|RWA": -2, "ARM|AZE": -1, "GRC|TUR": -1, "EST|RUS": -2, "LVA|RUS": -2, "LTU|RUS": -2, "POL|RUS": -2, "FIN|RUS": -2, "GEO|RUS": -1, "MDA|RUS": -1,
      "BLR|UKR": -2, "BLR|POL": -1, "DEU|RUS": -2, "GBR|RUS": -2, "FRA|RUS": -2, "IRN|SAU": -1,
      "TWN|USA": 2, "POL|UKR": 2, "DEU|UKR": 2, "GBR|UKR": 2, "FRA|UKR": 2, "JPN|KOR": 1, "CHN|RUS": 2, "CHN|PAK": 2,
    },
    facts: [
      "This start names offices, not people: the President of the United States, the President of Russia, the General Secretary in Beijing, the Chancellor in Berlin, the Supreme Leader in Tehran.",
      "Russia and Ukraine have been at war since February 2022. The front runs through Ukraine's east and south; Russia holds Crimea and much of four eastern regions. Talks have opened and stalled more than once.",
      "The President of the United States governs by tariff and by deal, and presses allies to pay for their own defence. Washington's word still decides most alliances, and is trusted less than it was.",
      "Europe is re-arming faster than at any time since the Cold War. The Chancellor in Berlin and the President in Paris agree that it must, and disagree on who leads it.",
      "The Atlantic alliance has thirty-two members and one promise: an attack on one is an attack on all. In this story it is written as defence treaties between the United States and each ally.",
      "The General Secretary in Beijing calls Taiwan a province to be brought home, by pressure if it can be done. Chinese ships and aircraft circle the island most weeks. The island governs itself, and the United States arms it.",
      "The United States and China quarrel over tariffs, advanced chips and rare earths, and keep talking: each is the other's largest problem and one of its largest customers.",
      "North Korea's Supreme Leader has a defence pact with Moscow, has sent soldiers and shells to Russia's war, and tests missiles when he chooses. The two Koreas have an armistice from 1953 and no peace.",
      "Israel and Iran exchanged direct strikes in 2024 and 2025. Iran's nuclear sites were bombed; its programme is damaged, not ended. A ceasefire in Gaza holds badly. The Supreme Leader in Tehran is old, and who follows him is the quiet question.",
      "India and Pakistan fought four days in the air in May 2025 and went back to a wary ceasefire. Both hold nuclear weapons. India keeps their river treaty suspended. Pakistan and the rulers in Kabul have fought along their border too.",
      "Sudan is in civil war between its army and a paramilitary force, with famine in the west. It is a war inside one country: no other state has declared itself in it, though several feed it.",
      "Soldiers govern Mali, Burkina Faso and Niger; they sent French troops home and took Russian help. In eastern Congo a rebel army holds cities, and Rwanda is accused of standing behind it.",
      "Armenia and Azerbaijan have initialled a peace after more than thirty years of war; it is not yet a settled one. Syria has had a new government since the old one fell in December 2024.",
      "Venezuela claims the western two thirds of Guyana, where the oil is. Thailand and Cambodia fought along their border in 2025 and signed a truce neither trusts. Serbia does not recognise Kosovo. Algeria and Morocco have had no relations since 2021.",
      "Money moves this world as much as armies do: sanctions on Russia and Iran, tariffs on almost everyone, and a race for the energy to run data centres. Artificial intelligence is the new measure of a great power.",
    ],
  }),
  // 2. A regional brink. Rules-only wars are possible between Ethiopia and Eritrea, and Ethiopia and Somalia
  // (which would bring in Egypt and Turkey by treaty). The drought of 2027 and the mobilisation are invented.
  start({
    id: "nile-horn-2027", title: "The Nile and the Horn, 2027", start: "2027-03-01",
    blurb: "Fiction. A dry year on the Nile, a great dam upstream, a landlocked giant that wants a port. No war yet. Small countries, hard choices, and everyone's patrons watching.",
    opening: "The story begins on 1 March 2027, at the end of a failed rainy season. The Nile is lower at Aswan than anyone living has seen it, and upstream the great dam is full. Ethiopia, a hundred and thirty million people without a coast, says again that it will have a port on the Red Sea. Eritrea has called up its reserves. Somalia will not forgive the deal its breakaway north made for a harbour. Egypt has soldiers in Mogadishu and friends in Asmara. Nobody has fired yet. The drought and the call-up are invented for this story; the quarrels are old.",
    treaties: {
      defence: ["EGY|ERI", "EGY|SOM", "TUR|SOM"],
      trade: ["ERI|SOM", "ETH|SOL", "ETH|KEN", "ETH|DJI", "ARE|ETH", "ARE|SOL", "EGY|SAU", "EGY|SDN", "KEN|UGA", "SAU|DJI"],
    },
    rel: { "ERI|ETH": -3, "EGY|ETH": -2, "ETH|SOM": -2, "SOL|SOM": -2, "ETH|SDN": -1, "SDN|SDS": -1, "ARE|SDN": -2, "DJI|ERI": -1, "ARE|ETH": 2, "ETH|KEN": 1, "SOM|TUR": 2, "EGY|SDN": 1 },
    might: { EGY: 5, ETH: 4, ERI: 3, SDN: 3, KEN: 3, UGA: 3, SOM: 2, SOL: 2, DJI: 2, SDS: 2, SAU: 5, ARE: 4, TUR: 6, YEM: 2 },
    facts: [
      "This start names offices, not people: the Prime Minister in Addis Ababa, the President in Cairo, the President in Asmara, the federal government in Mogadishu, the general who heads Sudan's army.",
      "Ethiopia finished its great dam on the Blue Nile in 2025 and fills it as it sees fit. Egypt, which lives on the river, calls that a threat to its existence. No treaty binds either of them on the water.",
      "Invented for this story: the rains of 2026 failed across the highlands. The Nile is at a record low, Egypt has cut water to its farms, and Cairo blames the dam as much as the sky.",
      "Ethiopia lost its coast when Eritrea left in 1993. The Prime Minister in Addis Ababa says a country of its size cannot stay landlocked. Its trade goes by one railway to Djibouti.",
      "Ethiopia and Eritrea fought a border war from 1998 to 2000, made peace in 2018, fought on the same side in Tigray, and fell out again. Invented for this story: Eritrea has called up its reserves, and Ethiopian armour is moving north.",
      "Somaliland has governed itself since 1991, and almost no state recognises it. In 2024 it offered Ethiopia a naval base and a harbour in return for recognition. Somalia calls that a theft of its coast.",
      "Egypt has a defence pact with Somalia and soldiers there, and stands with Eritrea. Turkey trains Somalia's army and guards its waters. The United Arab Emirates run the port at Berbera and are close to Addis Ababa.",
      "Sudan is in civil war between its army and a paramilitary force. The army's government has broken with the United Arab Emirates, which it accuses of arming the other side, and leans on Egypt.",
      "South Sudan's peace is thin and its oil leaves through Sudan. Kenya wants calm and trade. Djibouti lives on port fees and hosts the bases of several great powers at once.",
      "Across the strait, Yemen's war has never properly ended, and ships in the Red Sea have been fired on. Whoever holds a port here holds a piece of the world's trade.",
    ],
  }),
  // 3. An armed peace: no war on the first day and treaties everywhere. Rules-only: Russia may break the armistice
  // (Ukraine's guarantors would join), as may India and Pakistan. Everything dated after 2026 is invented.
  start({
    id: "cold-peace-2029", title: "A Cold Peace, 2029", start: "2029-01-01",
    blurb: "Fiction. Two years after an armistice in Europe: no war anywhere on the first day, three armed blocs, and a treaty for every suspicion. A game of diplomacy first.",
    opening: "The story begins on 1 January 2029. Everything in it after 2026 is invented. The war in Ukraine stopped in 2027 on the line where the armies stood: an armistice, not a peace. The United States kept a handful of treaties and let the rest go quiet. Europe signed a defence union of its own and guaranteed what is left of Ukraine. Moscow and Beijing wrote down what had only been said. India trades with all of them and has promised none of them anything. Nobody is at war today. Every government is armed as if it will be.",
    treaties: {
      alliance: ["RUS|BLR"],
      defence: [...hub("USA", "GBR CAN JPN KOR AUS POL ISR"), ...hub("FRA", "DEU POL ITA ESP NLD GBR UKR"), ...hub("DEU", "POL NLD SWE FIN"), ...hub("POL", "UKR LTU SWE FIN"), "GBR|UKR", "FIN|SWE", "LTU|LVA", "EST|LVA", "EST|FIN",
        "CHN|RUS", "CHN|PRK", "RUS|PRK", "CHN|PAK", "SAU|ARE", "TUR|AZE", "AUS|JPN", "JPN|PHL"],
      trade: ["IND|USA", "IND|RUS", "IND|JPN", "IND|FRA", "IND|ARE", "CHN|BRA", "CHN|ZAF", "BRA|ARG", "BRA|IND", "USA|MEX", "IRN|RUS", "CHN|IRN", "TUR|UKR", "SAU|CHN", "IDN|CHN", "IDN|JPN", "EGY|SAU", "KAZ|CHN", "KAZ|RUS", "VNM|USA"],
    },
    rel: {
      "RUS|UKR": -2, "POL|RUS": -2, "EST|RUS": -2, "LVA|RUS": -2, "LTU|RUS": -2, "FIN|RUS": -2, "DEU|RUS": -2, "FRA|RUS": -1, "RUS|USA": -1, "CHN|USA": -2, "CHN|TWN": -2, "CHN|JPN": -2, "CHN|PHL": -2,
      "CHN|IND": -1, "IND|PAK": -2, "KOR|PRK": -2, "IRN|ISR": -2, "IRN|USA": -2, "IRN|SAU": -1, "BLR|POL": -1, "BLR|UKR": -2, "GRC|TUR": -1, "ARM|AZE": -1, "DEU|USA": -1, "FRA|USA": -1,
      "TWN|USA": 1, "JPN|TWN": 1, "FRA|DEU": 3, "DEU|POL": 2, "CHN|RUS": 3, "JPN|KOR": 2, "GBR|USA": 2,
    },
    might: { DEU: 8, POL: 6, UKR: 6, FRA: 7, JPN: 8, IND: 8, RUS: 8, TUR: 6, SAU: 6, KOR: 7, IDN: 6 },
    facts: [
      "Everything dated after 2026 is invented for this story. It names offices, not people: nobody here knows who holds them in 2029, so the story may invent them.",
      "The war in Ukraine ended in an armistice in 2027, on the line where the armies stood. Russia holds what it held. Ukraine signed nothing away. Each side says the other will break it.",
      "France, Germany, Poland, Italy, Spain, the Netherlands and Britain have signed a European defence union, with its own command, and have given Ukraine a written guarantee: war on it is war on them.",
      "The United States withdrew most of its troops from Europe in 2028. It keeps treaties with Britain, Canada, Poland, Japan, South Korea, Australia and Israel, and tells everyone else that its attention is on the Pacific and on its own hemisphere.",
      "Russia and China signed a defence treaty in 2028: what had been a partnership without limits now has clauses. Russia is the junior partner and knows it. Belarus, North Korea and Pakistan stand inside that circle.",
      "India is the third power: it buys Russian oil, American aircraft and French submarines, sits in every room and has signed no defence treaty with anyone. Whoever wins India wins the argument.",
      "Germany has the largest army in western Europe for the first time since 1990, and Poland the largest in the east. Their neighbours are glad of it and uneasy about it in the same breath.",
      "Taiwan is still self-governing, and still circled. Japan has doubled its defence spending and signed with the Philippines. Beijing calls this encirclement; Tokyo calls it arithmetic.",
      "The Gulf monarchies sell oil to China, buy arms from America and host talks for everyone. Iran is rebuilding what was bombed. Turkey sells drones to both sides of most quarrels.",
      "No country is at war on 1 January 2029. Sanctions, tariffs and export bans are the weapons in use, and every staff college is studying the armistice line.",
    ],
  }),
];
