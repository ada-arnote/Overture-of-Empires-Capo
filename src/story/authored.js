// SPDX-License-Identifier: AGPL-3.0-or-later
// Three authored starts on the real map, as scenario files (the same shape a player saves and shares): a
// believable present day, a regional brink, and an armed peace a few years on. Fiction, every one: not news and
// not a forecast. The two later starts name offices, never people. "Late 2026" names the real leaders in office as
// it begins (rulings 48 and 149): fiction with real names, kept current, and marked so in its blurb, its opening and
// its first fact. Text is a draft for the owner's review; it becomes the first choice only after that review.
//
// Real people named in "Late 2026", for the owner's review. Holders as of 26 November 2026, checked against news
// reports that day; the ones marked * changed during 2026 and are the likeliest to need a second look:
//   Donald Trump (President of the United States); Vladimir Putin (President of Russia); Volodymyr Zelenskyy
//   (President of Ukraine); Xi Jinping (General Secretary, China); Friedrich Merz (Chancellor of Germany); Emmanuel
//   Macron (President of France); *Andy Burnham (Prime Minister of the United Kingdom, since July 2026); *Keir
//   Starmer (named as his predecessor); *Mojtaba Khamenei (Supreme Leader of Iran, since March 2026); *Ali Khamenei
//   (his father and predecessor, named as killed in the strikes of 2026); Kim Jong Un (North Korea); *Benjamin
//   Netanyahu (Prime Minister of Israel, caretaker after the October 2026 election); Narendra Modi (Prime Minister of
//   India); Shehbaz Sharif (Prime Minister of Pakistan); Lai Ching-te (President of Taiwan); Sanae Takaichi (Prime
//   Minister of Japan); *Delcy Rodriguez (acting President of Venezuela, since January 2026); *Nicolas Maduro (named
//   as seized by the United States in January 2026).
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
    blurb: "Fiction with real names. The present day with its quarrels in place: a great war in Europe, a dozen cold borders, strained alliances, and the leaders of late 2026.",
    opening: "The story begins on 1 December 2026, in a world drawn from the headlines and then let go. A war in eastern Europe is in its fifth year. The great powers trade tariffs, chips and warnings instead of shots. The old alliances still stand, and nobody is sure what they are worth. This start names the real people who hold office as it begins; everything they say and do from the first turn is invented. The rules decide wars and borders, and the story tells the rest.",
    wars: ["RUS|UKR"],
    treaties: {
      alliance: ["RUS|BLR"],
      defence: [...hub("USA", ATLANTIC), ...hub("USA", "JPN KOR AUS PHL"), "FRA|DEU", "DEU|POL", "GBR|FRA", "POL|LTU", "FIN|SWE", "GBR|NOR", "AUS|GBR", "RUS|PRK", "CHN|PRK", "TUR|AZE"],
      trade: ["CHN|RUS", "CHN|PAK", "IND|RUS", "USA|MEX", "USA|ISR", "BRA|ARG", "BRA|URY", "BRA|PRY", "IRN|RUS", "SAU|ARE", "JPN|AUS", "IND|ARE", "CHN|BRA", "CHN|ZAF", "EGY|SAU"],
    },
    rel: {
      "RUS|USA": -2, "CHN|USA": -1, "IRN|USA": -3, "PRK|USA": -2, "USA|VEN": -1, "CUB|USA": -2, "IRN|ISR": -3, "CHN|TWN": -2, "CHN|JPN": -1, "CHN|IND": -1, "CHN|PHL": -2,
      "IND|PAK": -2, "KOR|PRK": -2, "JPN|PRK": -2, "AFG|PAK": -2, "ISR|LBN": -2, "ISR|SYR": -1, "KHM|THA": -2, "ERI|ETH": -2, "EGY|ETH": -1, "DZA|MAR": -2, "KOS|SRB": -2,
      "GUY|VEN": -2, "COD|RWA": -2, "ARM|AZE": -1, "GRC|TUR": -1, "EST|RUS": -2, "LVA|RUS": -2, "LTU|RUS": -2, "POL|RUS": -2, "FIN|RUS": -2, "GEO|RUS": -1, "MDA|RUS": -1,
      "BLR|UKR": -2, "BLR|POL": -1, "DEU|RUS": -2, "GBR|RUS": -2, "FRA|RUS": -2, "IRN|SAU": -1,
      "TWN|USA": 2, "POL|UKR": 2, "DEU|UKR": 2, "GBR|UKR": 2, "FRA|UKR": 2, "JPN|KOR": 1, "CHN|RUS": 2, "CHN|PAK": 2,
    },
    facts: [
      "Fiction with real names: this start names the real people in office on 1 December 2026, and all they do from then on is invented. Donald Trump is President of the United States, Vladimir Putin of Russia and Volodymyr Zelenskyy of Ukraine; Xi Jinping leads China; Friedrich Merz is Chancellor of Germany, Emmanuel Macron President of France, and Andy Burnham Prime Minister of Britain.",
      "Russia and Ukraine have been at war since February 2022. The front runs through Ukraine's east and south; Russia holds Crimea and much of four eastern regions. Talks in Abu Dhabi in November 2026, with American mediation, agreed an exchange of prisoners and nothing else.",
      "Donald Trump governs by tariff and by deal, and presses allies to pay for their own defence. Washington's word still decides most alliances, and is trusted less than it was.",
      "Europe is re-arming faster than at any time since the Cold War. Friedrich Merz and Emmanuel Macron agree that it must, and disagree on who leads it. Andy Burnham took office in London in July 2026, when Keir Starmer stepped down.",
      "The Atlantic alliance has thirty-two members and one promise: an attack on one is an attack on all. In this story it is written as defence treaties between the United States and each ally.",
      "Xi Jinping calls Taiwan a province to be brought home, by pressure if it can be done. Chinese ships and aircraft circle the island most weeks. The island governs itself under Lai Ching-te, and the United States arms it. Sanae Takaichi, Prime Minister of Japan, says a war over Taiwan would be Japan's concern.",
      "The United States and China quarrel over tariffs, advanced chips and rare earths, and keep talking: each is the other's largest problem and one of its largest customers.",
      "Kim Jong Un has a defence pact with Moscow, has sent soldiers and shells to Russia's war, and tests missiles when he chooses. The two Koreas have an armistice from 1953 and no peace.",
      "Israel and the United States went to war with Iran in 2026. Ali Khamenei was killed in the first strikes and his son Mojtaba Khamenei is Supreme Leader. A deal in June to end the war frayed within weeks; the nuclear question is open and ships in the Gulf sail nervously.",
      "Israel voted in October 2026 and no bloc won a majority; Benjamin Netanyahu stays on as caretaker Prime Minister while the bargaining goes on. A ceasefire in Gaza holds badly.",
      "India and Pakistan fought four days in the air in May 2025 and went back to a wary ceasefire. Both hold nuclear weapons. Narendra Modi keeps their river treaty suspended; Shehbaz Sharif's government leans on its army. Pakistan and the rulers in Kabul have fought along their border too.",
      "Sudan is in civil war between its army and a paramilitary force, with famine in the west. It is a war inside one country: no other state has declared itself in it, though several feed it.",
      "Soldiers govern Mali, Burkina Faso and Niger; they sent French troops home and took Russian help. In eastern Congo a rebel army holds cities, and Rwanda is accused of standing behind it.",
      "Armenia and Azerbaijan have initialled a peace after more than thirty years of war; it is not yet a settled one. Syria has had a new government since the old one fell in December 2024.",
      "The United States seized Nicolas Maduro in January 2026; Delcy Rodriguez governs Venezuela as acting President and sells Washington oil. Venezuela still claims the western two thirds of Guyana. Thailand and Cambodia fought along their border in 2025. Serbia does not recognise Kosovo. Algeria and Morocco have had no relations since 2021.",
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
