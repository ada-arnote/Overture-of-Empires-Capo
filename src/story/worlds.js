// SPDX-License-Identifier: AGPL-3.0-or-later
// The worlds Capo can be played in. Fiction: not news, not a forecast.
// South America today. Leaders: Wikidata (CC0), head of state, read 2026-11-24. Strength, coin, unrest and relations are invented.
const andes = (() => {
  const asOf = "2026-11-24";
  const start = "2026-12-01";
  const player = "BOL";
  const countries = {
    BOL: { name: "Bolivia", leader: "Rodrigo Paz", since: "2025-11-08", strength: 3, coin: 5, unrest: 3 },
    BRA: { name: "Brazil", leader: "Luiz Inácio Lula da Silva", since: "2023-01-01", strength: 8, coin: 7, unrest: 2 },
    ARG: { name: "Argentina", leader: "Javier Milei", since: "2023-12-10", strength: 5, coin: 4, unrest: 3 },
    CHL: { name: "Chile", leader: "José Antonio Kast", since: "2026-03-11", strength: 5, coin: 6, unrest: 2 },
    PER: { name: "Peru", leader: "Keiko Fujimori", since: "2026-07-28", strength: 4, coin: 5, unrest: 3 },
    COL: { name: "Colombia", leader: "Abelardo de la Espriella", since: "2026-08-07", strength: 5, coin: 5, unrest: 3 },
  };
  // Named in one line only. They can be talked about and hold no listed place.
  const others = { ECU: "Ecuador", PRY: "Paraguay", URY: "Uruguay", VEN: "Venezuela", USA: "United States", CHN: "China" };
  // code: [name, owner, neighbours]. A hand-picked border set, not the whole map.
  const places = {
    "BR-AC": ["Acre", "BRA", ["BR-RO", "PE-MD", "BO-PA"]],
    "BR-RO": ["Rondônia", "BRA", ["BR-AC", "BR-MT", "BO-PA", "BO-SC"]],
    "BR-MT": ["Mato Grosso", "BRA", ["BR-RO", "BO-SC"]],
    "BR-PR": ["Paraná", "BRA", ["AR-MI"]],
    "AR-MI": ["Misiones", "ARG", ["BR-PR"]],
    "AR-SA": ["Salta", "ARG", ["AR-JU", "BO-PO", "BO-TJ", "CL-AN"]],
    "AR-JU": ["Jujuy", "ARG", ["AR-SA", "BO-PO", "CL-AN"]],
    "CL-AP": ["Arica y Parinacota", "CHL", ["CL-TA", "PE-TC", "BO-LP", "BO-OR"]],
    "CL-TA": ["Tarapacá", "CHL", ["CL-AP", "CL-AN", "BO-OR", "BO-PO"]],
    "CL-AN": ["Antofagasta", "CHL", ["CL-TA", "BO-PO", "AR-SA", "AR-JU"]],
    "PE-TC": ["Tacna", "PER", ["CL-AP", "PE-PU", "BO-LP"]],
    "PE-PU": ["Puno", "PER", ["PE-TC", "PE-MD", "BO-LP"]],
    "PE-MD": ["Madre de Dios", "PER", ["PE-PU", "BR-AC", "BO-PA", "BO-LP"]],
    "PE-LO": ["Loreto", "PER", ["CO-AM", "CO-PT"]],
    "CO-AM": ["Amazonas (Colombia)", "COL", ["PE-LO", "CO-PT"]],
    "CO-PT": ["Putumayo", "COL", ["PE-LO", "CO-AM"]],
    "BO-PA": ["Pando", "BOL", ["BR-AC", "BR-RO", "PE-MD", "BO-LP"]],
    "BO-LP": ["La Paz", "BOL", ["BO-PA", "PE-MD", "PE-PU", "PE-TC", "CL-AP", "BO-OR"]],
    "BO-OR": ["Oruro", "BOL", ["BO-LP", "CL-AP", "CL-TA", "BO-PO"]],
    "BO-PO": ["Potosí", "BOL", ["BO-OR", "CL-TA", "CL-AN", "AR-JU", "AR-SA", "BO-TJ"]],
    "BO-SC": ["Santa Cruz", "BOL", ["BR-RO", "BR-MT"]],
    "BO-TJ": ["Tarija", "BOL", ["BO-PO", "AR-SA"]],
  };
  // Relations from -3 to +3. Pairs not listed are 0.
  // Where each place's dot sits on the map: longitude, latitude, near the middle of the region (rounded, not a survey).
  const spots = {
    "BR-AC": [-70.5, -9.2], "BR-RO": [-62.8, -10.9], "BR-MT": [-55.9, -12.9], "BR-PR": [-51.6, -24.6], "AR-MI": [-54.6, -26.9],
    "AR-SA": [-64.6, -24.9], "AR-JU": [-65.9, -22.9], "CL-AP": [-69.6, -18.6], "CL-TA": [-69.4, -20.3], "CL-AN": [-69.1, -23.6],
    "PE-TC": [-70.6, -17.5], "PE-PU": [-70.0, -14.9], "PE-MD": [-70.6, -11.9], "PE-LO": [-75.0, -4.3], "CO-AM": [-71.5, -1.5],
    "CO-PT": [-75.6, 0.6], "BO-PA": [-67.5, -11.2], "BO-LP": [-68.4, -15.0], "BO-OR": [-67.6, -18.4], "BO-PO": [-66.7, -20.9],
    "BO-SC": [-61.5, -17.0], "BO-TJ": [-63.9, -21.6],
  };
  // Where each country's name is printed: longitude, latitude.
  const labels = { BOL: [-64.6, -15.6], BRA: [-52, -9], ARG: [-65.5, -35], CHL: [-71.6, -31], PER: [-75.2, -8.2], COL: [-73.4, 4.2], ECU: [-78.4, -1.2], PRY: [-58.4, -22.6], URY: [-56, -32.8], VEN: [-66, 7.4] };
  const relations = { "BOL|CHL": -1, "BOL|PER": 1, "BOL|BRA": 1, "BOL|ARG": 0, "ARG|BRA": 0, "ARG|CHL": 1, "CHL|PER": 0, "COL|PER": 0 };
  // Invented people. likes and hates are moves by the player that raise or lower favour.
  const person = (id, name, traits, lean, skill, likes, hates, wants) => ({ id, name, traits, lean, skill, likes, hates, wants });
  const seats = { war: "war", treasury: "treasury", foreign: "foreign affairs", home: "home affairs", outsider: "outside voice" };
  const council = {
    war: person("c1", "Nayra Condorcanqui Salas", "bold, blunt", 1, 3, ["MOBILISE", "ATTACK"], ["TREATY"], "a stronger army"),
    treasury: person("c2", "Ramiro Ustárez Pol", "careful, dry", -1, 4, ["TREATY"], ["MOBILISE", "SANCTION"], "full coffers and trade"),
    foreign: person("c3", "Inés Calvimonte Rey", "patient, proud", -1, 4, ["TALK", "TREATY"], ["DECLARE", "BREAK"], "a port by agreement"),
    home: person("c4", "Tadeo Huallpa Ortuño", "warm, stubborn", 0, 2, ["REFORM"], ["CRACKDOWN"], "calm in the mining towns"),
    outsider: person("c5", "Lucio Antequera Vidal", "witty, restless", 1, 2, ["SPY", "WARN"], ["AID"], "attention, and a newspaper war"),
  };
  const bench = [
    person("b1", "Marta Iporre Lanza", "steady, plain", 0, 5, ["TALK"], ["ATTACK"], "no surprises"),
    person("b2", "Julián Choque Arze", "bold, vain", 1, 3, ["DECLARE", "ATTACK"], ["TREATY"], "a victory with his name on it"),
    person("b3", "Rosa Tintaya Meruvia", "careful, kind", -1, 3, ["REFORM", "AID"], ["CRACKDOWN", "DECLARE"], "schools before guns"),
  ];
  // Invented names for advisers of countries that have none written for them.
  const names = ["Alma Quispe Rojas", "Bruno Salazar Medina", "Carla Ventura Ossio", "Diego Arrieta Paz", "Elena Mamani Cruz", "Fabio Lacerda Nunes", "Gloria Ibáñez Sol", "Hugo Restrepo Vela", "Irene Cabral Duarte", "Joaquín Ferreyra Sosa", "Karina Llanos Toro", "Lautaro Bianchi Rey", "Mónica Saavedra Lima", "Nicolás Uribe Prado", "Olga Pacheco Vaca", "Pablo Ortega Ruiz", "Renata Souza Brandão", "Sergio Calderón Mejía"];
  return { id: "andes", title: "South America today", note: "Six detailed countries and the border places between them. Every other country is one line.", asOf, start, player, countries, others, places, spots, labels, relations, seats, council, bench, councils: { BOL: { council, bench } }, names };
})();

export const WORLDS = { andes };
