// SPDX-License-Identifier: AGPL-3.0-or-later
// Alternate histories: the real map with one turn of history gone another way. Fiction, every one: none of these
// worlds happened, and none is a claim about what should have. Each entry is shaped like a scenario and carries an
// `overlay` that src/story/overlay.js lays over maps/world.json when the map is loaded (whole countries merged,
// single provinces given, countries renamed or made, disputes dropped and added). Leaders are offices only.

export const ALTHIST = [
  {
    id: "althist-kaiser", kind: "althist", title: "The Kaiser's Peace", start: "1936-06-01",
    blurb: "1936. The Great War ended in a compromise that left Germany master of the continent. Three old empires still stand, and none of them stands easily.",
    turn: "1917: Germany never loosed its submarines on neutral shipping, America stayed out, and the war ended in 1918 in an exhausted peace on Berlin's terms.",
    opening: "Fiction: an alternate history. It is 1 June 1936. The Great War ended in 1918 with no victor in the west and a German peace in the east. Germany kept Alsace-Lorraine, ringed itself with client kingdoms from Finland to Ukraine, and took the Congo basin as its price for leaving Belgium. Austria-Hungary and the Ottoman Empire survived, tired and restless. Russia is a republic shorn of its western lands. Britain and France kept their empires overseas and their grudge. Eighteen years on the peace is old, the clients are impatient, the colonies are stirring, and nobody believes the last war settled anything.",
    balance: "Germany is the strongest power and has the most to guard: nine treaties pull it into any war on its clients. Britain is nearly its match at sea and overseas. Austria-Hungary and the Ottoman Empire are large and brittle, with claimed land on most borders. Russia, France and Italy each start with a grievance and no ally strong enough to act on it alone.",
    overlay: {
      lands: {
        DEU: ["German Empire"], AHE: ["Austria-Hungary", "#8f7d3c"], TUR: ["Ottoman Empire"], RUS: ["Russian Republic"], GBR: ["British Empire"], RAJ: ["Indian Empire", "#b0703a"],
        JPN: ["Empire of Japan"], POL: ["Kingdom of Poland"], BLT: ["United Baltic Duchy", "#5f7f8f"], BLR: ["White Ruthenia"], UKR: ["Ukrainian State"], FIN: ["Kingdom of Finland"],
        LTU: ["Kingdom of Lithuania"], SRB: ["Kingdom of Serbia"], ITA: ["Kingdom of Italy"], THA: ["Siam"], IRN: ["Persia"], ETH: ["Abyssinia"], SAU: ["Sultanate of Nejd"],
        TIB: ["Tibet", "#a0522d"], CHN: ["Republic of China"], IRL: ["Irish Free State"], EGY: ["Kingdom of Egypt"], ZAF: ["Union of South Africa"],
      },
      merge: {
        DEU: ["LUX", "NAM", "TZA", "RWA", "BDI", "COD", "COG", "GAB", "CAF", "CMR", "TGO"],
        AHE: ["AUT", "HUN", "CZE", "SVK", "SVN", "HRV", "BIH"],
        TUR: ["SYR", "LBN", "ISR", "PSX", "JOR", "IRQ"],
        RUS: ["KAZ", "UZB", "TKM", "KGZ", "TJK", "KAB"],
        BLT: ["EST", "LVA"],
        GBR: ["NGA", "GHA", "SLE", "GMB", "KEN", "UGA", "ZMB", "ZWE", "MWI", "BWA", "LSO", "SWZ", "SDN", "SDS", "SOL", "MYS", "SGP", "BRN", "HKG", "LKA", "CYP", "CYN", "ESB", "WSB", "MLT", "GUY", "BLZ", "JAM", "TTO", "BHS", "MUS", "SYC", "FJI", "SLB"],
        RAJ: ["IND", "PAK", "BGD", "MMR", "KAS"],
        FRA: ["DZA", "TUN", "MAR", "MRT", "SEN", "MLI", "GIN", "CIV", "BFA", "BEN", "NER", "TCD", "MDG", "DJI", "COM", "VNM", "LAO", "KHM"],
        ITA: ["LBY", "ERI", "SOM"],
        PRT: ["AGO", "MOZ", "GNB", "CPV", "STP", "TLS", "MAC"],
        ESP: ["GNQ", "SAH"],
        NLD: ["IDN", "SUR", "CUW", "ABW"],
        USA: ["PHL", "PRI"],
        JPN: ["KOR", "PRK", "TWN"],
        AUS: ["PNG"],
        ROU: ["MDA"],
        BGR: ["MKD"],
        SRB: ["KOS"],
        DNK: ["GRL"],
      },
      give: {
        DEU: ["FRA-5273", "POL-3144", "POL-3140", "POL-3145", "POL-3141", "POL-3167", "POL-3146", "POL-3142", "POL-3143", "POL-3139", "RUS-2324"],
        AHE: ["POL-3170", "POL-3152", "UKR-291", "UKR-289", "UKR-292", "UKR-293", "UKR-288", "ROU-276", "ROU-278", "ROU-280", "ROU-294", "ROU-296", "ROU-298", "ROU-301", "ROU-305", "ROU-307", "ROU-311", "ITA-5459", "SRB-1059", "SRB-1060", "SRB-275"],
        TUR: ["SAU-888", "SAU-845", "SAU-848", "SAU-885"],
        UKR: ["RUS-283"],
        TIB: ["CHN-1662"],
        GBR: ["YEM-3510", "YEM-157", "YEM-3511", "YEM-3497", "YEM-332", "YEM-336"],
      },
      disputes: { drop: "all", add: [
        { name: "Alsace-Lorraine", note: "Held by the German Empire. Claimed by France.", provinces: ["FRA-5273"] },
        { name: "Posen and West Prussia", note: "Held by the German Empire. Claimed by the Kingdom of Poland.", provinces: ["POL-3144", "POL-3140", "POL-3145"] },
        { name: "Trentino and South Tyrol", note: "Held by Austria-Hungary. Claimed by the Kingdom of Italy.", provinces: ["ITA-5459"] },
        { name: "Transylvania", note: "Held by Austria-Hungary. Claimed by Romania.", provinces: ["ROU-294", "ROU-296", "ROU-305", "ROU-307", "ROU-301", "ROU-298"] },
        { name: "The Bachka and the Banat", note: "Held by Austria-Hungary. Claimed by the Kingdom of Serbia.", provinces: ["SRB-1059", "SRB-1060", "SRB-275"] },
        { name: "Crimea", note: "Held by the Ukrainian State. Claimed by the Russian Republic.", provinces: ["RUS-283"] },
        { name: "The Hejaz", note: "Held by the Ottoman Empire. Claimed by the Sultanate of Nejd.", provinces: ["SAU-888", "SAU-845"] },
      ] },
      treaties: {
        alliance: ["DEU|AHE", "DEU|TUR", "DEU|BGR", "DEU|POL", "DEU|BLT", "DEU|LTU", "DEU|UKR", "DEU|BLR", "GBR|FRA", "GBR|RAJ", "GBR|CAN", "GBR|AUS", "GBR|NZL", "GBR|ZAF"],
        defence: ["DEU|FIN", "FRA|BEL", "GBR|EGY", "GBR|PRT", "FRA|SRB"],
        trade: ["USA|GBR", "USA|DEU", "USA|JPN", "DEU|SWE", "DEU|NLD", "RUS|CHN"],
      },
      might: {
        DEU: 10, GBR: 9, USA: 8, FRA: 7, JPN: 7, RUS: 6, ITA: 6, AHE: 6, TUR: 5, RAJ: 4, CHN: 4, UKR: 4, ESP: 4, BRA: 4, ARG: 4, CAN: 4, AUS: 4, ZAF: 4, SWE: 4, NLD: 4,
        POL: 3, IRN: 3, EGY: 3, MEX: 3, THA: 3, COL: 3, CHL: 3, ETH: 3, GRC: 3, NOR: 3, FIN: 3, NZL: 3, BEL: 3, CHE: 3, PRT: 3, ROU: 3, BGR: 3, SRB: 3, BLT: 2, BLR: 2, SAU: 2, ARE: 2, CUB: 2, TIB: 1,
      },
      offices: {
        DEU: "the Kaiser, and the Imperial Chancellor who answers to him", AHE: "the Emperor-King, with one prime minister in Vienna and another in Budapest", TUR: "the Sultan, and the Grand Vizier who governs",
        GBR: "the King-Emperor's Prime Minister in London", RAJ: "the Viceroy, facing an elected assembly that wants him gone", RUS: "the President of the Republic and a quarrelling Duma",
        FRA: "the President of the Council", JPN: "the Prime Minister, watched by the army and the navy", USA: "the President", ITA: "the King's Prime Minister",
      },
      facts: [
        "The year is 1936. There are no jet aircraft, no rockets, no atomic weapons, no computers and no television in homes; armies move by rail, lorry and horse, navies count battleships, and news travels by wireless, telegraph and newspaper.",
        "The peace of 1918 is called the Peace of the Exhausted. Germany's client kingdoms (Poland, Lithuania, the Baltic Duchy, White Ruthenia, Ukraine, Finland) have German princes or German-approved rulers, their own parliaments and growing national parties.",
        "Mittelafrika, the German colony from Kamerun to the Indian Ocean, is vast, thinly held and costly. Britain's and France's colonies have independence movements; the Indian Empire has been promised dominion status and is waiting.",
        "Spain is on the edge of civil war. The world slump that began in 1929 has not lifted. There is no League of Nations: disputes go to conferences of the great powers, or to arms.",
        "The sheikhdoms of the Gulf are under British protection. The Ottoman Empire has begun to sell oil from Mosul and Basra through a German-built railway to Berlin.",
      ],
    },
  },
  {
    id: "althist-federation", kind: "althist", title: "The Imperial Federation", start: "2026-12-01",
    blurb: "Today. The British dominions never drifted apart: Britain, Ireland, Canada, Australia and New Zealand are one federal state with one parliament.",
    turn: "1887: the first Colonial Conference in London did not end in speeches; it agreed a common parliament for defence, trade and foreign affairs, with home rule for every member.",
    opening: "Fiction: an alternate history. It is 1 December 2026. In 1887 the self-governing colonies and the mother country agreed to federate, and the bargain held: home rule all round, Ireland included, and one Imperial Parliament for defence, trade and the sea. India, Africa and the rest took their independence in the twentieth century much as in our world. What remains is a federal state on three oceans, with five home parliaments, one navy and one seat at every table. Its members argue about money, about distance and about whether Westminster still listens.",
    balance: "The Federation is a third great power beside the United States and China, strong at sea and stretched across the world: its lands share no border, so it defends each alone. It starts with strong allies and no enemies. The pressure is inside: the facts give Ireland, Quebec and Australia reasons to pull at the union.",
    overlay: {
      lands: { GBR: ["Imperial Federation"] },
      merge: { GBR: ["IRL", "CAN", "AUS", "NZL", "FLK"] },
      disputes: { drop: ["Hans Island", "Falkland Is."], add: [
        { name: "Falkland Is.", note: "Held by the Imperial Federation. Claimed by Argentina.", provinces: ["FLK-5152"] },
      ] },
      treaties: {
        alliance: ["GBR|USA"],
        defence: ["GBR|FRA", "GBR|DEU", "GBR|JPN", "USA|JPN", "USA|KOR", "USA|DEU", "USA|FRA"],
        trade: ["GBR|IND", "GBR|ZAF", "GBR|SGP", "USA|MEX"],
      },
      might: { GBR: 9 },
      offices: { GBR: "the Federal Prime Minister at Westminster, and a First Minister in each of London, Dublin, Ottawa, Canberra and Wellington" },
      facts: [
        "The Imperial Federation has one foreign policy, one navy and one currency board, and five home parliaments that tax and spend for themselves. A member may leave by a vote of its own people; none has.",
        "In Dublin an independence party holds a third of the seats. Quebec has twice voted narrowly to stay. Australians complain that the fleet is kept in the Atlantic while the Pacific grows dangerous.",
        "India, South Africa and the former colonies are independent and deal with the Federation as equals; several keep trade treaties with it. Hong Kong returned to China in 1997.",
      ],
    },
  },
  {
    id: "althist-yangtze", kind: "althist", title: "Two Chinas", start: "2026-12-01",
    blurb: "Today. The civil war stopped at the Yangtze in 1949 and never ended. A People's Republic in the north and a Republic in the south face each other across the river.",
    turn: "April 1949: the crossing of the Yangtze failed. The river became an armistice line, and the two governments of China have each claimed the whole country ever since.",
    opening: "Fiction: an alternate history. It is 1 December 2026. In the spring of 1949 the northern armies were thrown back from the Yangtze, and an armistice in 1950 froze the war along the river. The People's Republic of China governs the north from Beijing, with the plains, the coal, the heavy industry and the long land borders. The Republic of China governs the south from Guangzhou, with Shanghai, the southern coast, Taiwan and the trade of the sea. Each calls itself the only China. The river is the most heavily armed line on earth, and seventy-six years of armistice have never become a peace.",
    balance: "The two Chinas are near equals: the north slightly stronger on land, the south richer and allied to the United States. Each claims the other's river provinces, which makes attacks there easier for both. Neither can win quickly, and each has an ally who would rather not be dragged in.",
    overlay: {
      lands: { CHN: ["People's Republic of China"], TWN: ["Republic of China"] },
      give: { TWN: ["CHN-1152", "CHN-1153", "CHN-1178", "CHN-1180", "CHN-1775", "CHN-1808", "CHN-1810", "CHN-1817", "CHN-1820", "CHN-1819"] },
      disputes: { drop: ["Taiwan"], add: [
        { name: "The north bank (Jiangsu, Anhui, Hubei)", note: "Held by the People's Republic of China. Claimed by the Republic of China.", provinces: ["CHN-1818", "CHN-1179", "CHN-1807"] },
        { name: "The south bank (Shanghai, Zhejiang, Jiangxi, Hunan)", note: "Held by the Republic of China. Claimed by the People's Republic of China.", provinces: ["CHN-1819", "CHN-1820", "CHN-1817", "CHN-1808"] },
      ] },
      treaties: {
        alliance: ["CHN|PRK"],
        defence: ["TWN|USA", "CHN|RUS", "USA|JPN", "USA|KOR", "USA|GBR", "USA|DEU", "USA|FRA"],
        trade: ["TWN|JPN", "TWN|VNM", "TWN|SGP", "CHN|MNG", "CHN|KAZ"],
      },
      might: { CHN: 8, TWN: 7 },
      offices: {
        CHN: "the General Secretary of the ruling party in Beijing", TWN: "the President of the Republic in Guangzhou, elected since the 1990s", USA: "the President",
      },
      facts: [
        "The armistice of 1950 set a demilitarised strip along the Yangtze. Nanjing and Wuhan lie on the northern side of the line, Shanghai on the southern; all three can see the other China from their waterfronts.",
        "Both Chinas hold a seat nowhere together: most countries recognise one and trade with both. Families divided in 1949 have been allowed to visit across the river since the 1980s.",
        "The south became a democracy in the 1990s and lives by trade, shipping and electronics. The north is a one-party state with the larger army, the heavy industry and the nuclear arsenal; the south is believed to be able to build its own.",
      ],
    },
  },
  {
    id: "althist-union", kind: "althist", title: "The Union Treaty", start: "1996-08-20",
    blurb: "1996. The new union treaty was signed in August 1991 and the old state did not fall apart: nine republics remain one loose, quarrelsome Union.",
    turn: "August 1991: no coup interrupted the signing. On 20 August nine republics signed the new union treaty, and the state was remade instead of dissolved.",
    opening: "Fiction: an alternate history. It is 20 August 1996, five years to the day since the treaty. The Union of Sovereign States is a federation of nine republics, from Minsk and Kyiv to the Pacific and the Caspian. The Baltic states, Georgia, Armenia and Moldova refused to sign and went their own way. The command economy is gone and nothing steady has replaced it; the republics hold most of the money and the centre holds the army, the rockets and the foreign ministry. The treaty lets any republic leave by referendum. So far none has dared, and none has stopped talking about it.",
    balance: "The Union is the second power after the United States, with a great army and an empty treasury. It has no allies worth the name and six small former republics on its border who fear it. The West is stronger together and bound by treaty. The Union's real contest is to stay whole.",
    overlay: {
      lands: { SOV: ["Union of Sovereign States", "#a8433a"], SRB: ["Yugoslavia"], COD: ["Zaire"] },
      merge: { SOV: ["RUS", "UKR", "BLR", "KAZ", "UZB", "KGZ", "TJK", "TKM", "AZE", "KAB"], SDN: ["SDS"], SRB: ["KOS", "MNE"], IDN: ["TLS"], GBR: ["HKG"], PRT: ["MAC"] },
      disputes: { drop: ["Crimea", "Luhansk People's Republic", "Donetsk People's Republic", "Abyei", "Ilemi Triangle", "Artsakh"], add: [
        { name: "Nagorno-Karabakh", note: "Governs itself. Claimed by the Union of Sovereign States and Armenia.", provinces: ["AZE-1734", "AZE-1735"] },
      ] },
      treaties: {
        alliance: ["USA|GBR", "USA|FRA", "USA|DEU", "USA|ITA", "USA|CAN", "USA|TUR"],
        defence: ["USA|JPN", "USA|KOR", "CHN|PRK"],
        trade: ["SOV|DEU", "SOV|CHN", "SOV|IND", "SOV|MNG", "SOV|FIN", "USA|MEX"],
      },
      might: { SOV: 9, CHN: 6, IND: 5, KOR: 5, POL: 4, VNM: 4, TWN: 4, IDN: 4, SAU: 4, IRQ: 3, EGY: 4, ARE: 3, SGP: 3, SRB: 4 },
      offices: {
        SOV: "the President of the Union in Moscow, and the presidents of the nine republics who must agree to anything that matters", USA: "the President",
        SRB: "the federal President in Belgrade", CHN: "the General Secretary of the ruling party",
      },
      facts: [
        "The year is 1996. There are no smartphones and no social media; few homes have the internet; news comes by television, radio and newspapers, and armies still plan around tanks, conscripts and the bomb.",
        "The nine republics of the Union are Russia, Ukraine, Belarus, Kazakhstan, Uzbekistan, Kyrgyzstan, Tajikistan, Turkmenistan and Azerbaijan. Each has its own president, budget and flag. Ukraine and Kazakhstan are the ones most often said to be leaving.",
        "Lithuania, Latvia, Estonia, Georgia, Armenia and Moldova have been independent since 1991 and want Western guarantees they have not been given. The western alliance has not moved east.",
        "The Union keeps the whole nuclear arsenal under one command. Its army is unpaid for months at a time. A war smoulders in the North Caucasus, inside the Union's own borders, and the centre calls it a police matter.",
        "Hong Kong is to pass from Britain to China on 1 July 1997. The wars of the Yugoslav break-up ended with a peace signed late in 1995, and it is holding badly.",
      ],
    },
  },
  {
    id: "althist-cusco", kind: "althist", title: "The Four Quarters", start: "2026-12-01",
    blurb: "Today. The conquest of the Andes failed in 1532. Tawantinsuyu, the realm of the four quarters, is a modern state ruled from Cusco.",
    turn: "November 1532: the Sapa Inca did not walk into the square at Cajamarca. The strangers were destroyed in the hills, and the Andes learned their weapons and their sicknesses before the next ones came.",
    opening: "Fiction: an alternate history. It is 1 December 2026. The realm the Incas called Tawantinsuyu, the four quarters, was never conquered. It lost a third of its people to the plagues, fought off three expeditions, traded silver for guns and horses, and survived the colonial centuries as the one great native state of the Americas, playing Spain against Britain and both against Portugal. Today it is a constitutional monarchy of the high Andes and the Pacific coast, Quechua-speaking, rich in copper, silver and lithium. Its neighbours were all colonies once, and some of them hold land it calls its own, as it holds land they call theirs.",
    balance: "Tawantinsuyu is the second power of South America after Brazil, a mountain state that is hard to attack and awkward to supply. Chile and Argentina are smaller than in our world, bound to each other by treaty, and both claim land it holds. Brazil is the stronger neighbour and has no quarrel yet.",
    overlay: {
      lands: { TAW: ["Tawantinsuyu", "#c9a227"], BOL: ["Santa Cruz"] },
      merge: { TAW: ["PER", "ECU"] },
      give: { TAW: ["BOL-1936", "BOL-1937", "BOL-1939", "BOL-1291", "BOL-1292", "BOL-1941", "CHL-2694", "CHL-2693", "CHL-2695", "CHL-2696", "CHL-2697", "ARG-1301", "ARG-1303", "ARG-1305", "ARG-1300", "COL-1406"] },
      disputes: { add: [
        { name: "Atacama and Coquimbo", note: "Held by Tawantinsuyu. Claimed by Chile.", provinces: ["CHL-2696", "CHL-2697"] },
        { name: "Tucumán and Catamarca", note: "Held by Tawantinsuyu. Claimed by Argentina.", provinces: ["ARG-1305", "ARG-1300"] },
        { name: "The Maule valleys", note: "Held by Chile. Claimed by Tawantinsuyu.", provinces: ["CHL-2698", "CHL-2699"] },
      ] },
      treaties: {
        defence: ["CHL|ARG", "USA|COL"],
        trade: ["TAW|BRA", "TAW|MEX", "TAW|CHN", "TAW|JPN", "TAW|BOL", "BRA|ARG"],
      },
      might: { TAW: 5, CHL: 3, ARG: 4, BOL: 1 },
      offices: {
        TAW: "the Sapa Inca, who reigns, and the Speaker of the Assembly of the Four Quarters, who governs", CHL: "the President", ARG: "the President", BRA: "the President",
      },
      facts: [
        "Tawantinsuyu's capital is Cusco; its great port is Lima. Quechua is the language of state, with Aymara and Spanish beside it. The four quarters each send delegates to the Assembly, and the crown has reigned without ruling since the constitution of 1911.",
        "Outside the Andes history ran close to ours: Spain and Portugal colonised the rest of the continent, the republics won their independence in the 1820s, and the wider world of 2026 is the one we know.",
        "The salt flats of the south hold most of the world's known lithium, and the Atacama most of its copper. Chile lost the Atacama in a war of the 1880s and has not forgotten. Santa Cruz is the small lowland republic east of the mountains.",
      ],
    },
  },
  {
    id: "althist-europe", kind: "althist", title: "The European Federation", start: "2026-12-01",
    blurb: "Today. The European army was voted through in 1954 and a federal state followed. Ten countries of western Europe are one, with one government in Strasbourg.",
    turn: "30 August 1954: the French National Assembly ratified the European Defence Community. A common army needed a common government, and the political community came with it.",
    opening: "Fiction: an alternate history. It is 1 December 2026. In 1954 six countries pooled their armies, and an army must answer to someone: within ten years France, Germany, Italy and the Low Countries had one federal government, one parliament and one foreign policy. Spain, Portugal, Greece and Austria joined as their own histories allowed. The Federation is a single state of some three hundred and fifty million people, with a federal army and a seat among the great powers. Britain and the north stayed out. The countries to its east are friends by treaty and wonder whether to ask for more.",
    balance: "The Federation is a great power on land, the equal of any but the United States, and it starts allied to the Americans and tied by defence treaties to its eastern neighbours, so a war on any of them is a war with it. Russia faces a far stronger west than in our world. Britain, alone outside, is weaker than the bloc beside it.",
    overlay: {
      lands: { EUF: ["European Federation", "#2f5fa8"] },
      merge: { EUF: ["FRA", "DEU", "ITA", "BEL", "NLD", "LUX", "ESP", "PRT", "AUT", "GRC"] },
      disputes: { drop: ["Olivenza", "Mayotte", "Lawa Headwaters"], add: [
        { name: "Mayotte", note: "Held by the European Federation. Claimed by Comoros.", provinces: ["FRA-4602"] },
      ] },
      treaties: {
        alliance: ["EUF|USA", "USA|GBR", "USA|CAN"],
        defence: ["EUF|GBR", "EUF|POL", "EUF|CZE", "EUF|HUN", "EUF|ROU", "EUF|DNK", "USA|JPN", "USA|KOR", "USA|TUR"],
        trade: ["EUF|CHE", "EUF|NOR", "EUF|SWE", "EUF|TUR", "EUF|MAR", "EUF|JPN"],
      },
      might: { EUF: 9, GBR: 6 },
      offices: {
        EUF: "the Federal Chancellor in Strasbourg, chosen by the federal parliament, and a President with little power", GBR: "the Prime Minister", USA: "the President", RUS: "the President",
      },
      facts: [
        "The European Federation has ten member states, each with its own government for schools, police and culture. Defence, money, trade and foreign affairs are federal. Its capital is Strasbourg and it works in French, German, Italian and Spanish.",
        "The Federation holds the nuclear forces France built and one seat on every council where its members once had several. Federal elections are fought by parties that cross the old borders; the loudest quarrel is between the richer north and the poorer south.",
        "Poland, the Czech Republic, Hungary, Romania and Denmark have defence treaties with the Federation and are not members. Membership is offered to none of them yet, and asked for by parties in all of them.",
      ],
    },
  },
];
