// SPDX-License-Identifier: AGPL-3.0-or-later
// Brass and Banners' campaign screens (early): start a campaign of 5 or 10 games, play each with the campaign's rules,
// save and open the campaign file, and break the seals a finished game opens. Reached only from "Campaign (early)" in
// Banners' own setup. The record and its fold: src/core/campaign.js; the story and the marks: src/games/banners/legacy.js.
import { Refusal, createMatch } from "../src/core/index.js";
import { addGame, beginCampaign, foldCampaign, nameLast, nextGame, readCampaign, standings, takeBack, writeCampaign } from "../src/core/campaign.js";
import { LEGACY, LONG_MUSTER as S, chapterOf } from "../src/games/banners/legacy.js";
import { areaBoard } from "../src/games/areas.js";
import { $, NAMES, el, radio, sheet, sign, toast } from "./table.js";

const KEY = "capo-banners-campaign", KINDS = [["you", "A person"], ["normal", "Bot"], ["easy", "Easy bot"], ["hard", "Hard bot"]];
const SWITCHED = { capitals: "Capitals are on", forts: "Forts can be built", leaders: "Leaders take the field" };
const store = (v) => { try { if (v === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* the file still works */ } };
const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const place = (at) => areaBoard(0, S.start.map).names[at]; // the map's own name for a place: the story's map never changes
const cap = (t) => t[0].toUpperCase() + t.slice(1);
let T = null, broken = "", form = { length: 5, seats: 3, who: ["you", "normal", "normal", "normal"] };

/** The campaign kept in this browser, replayed from its record: { record, state, played }, or null. */
function load() {
  const text = stored();
  broken = "";
  if (!text) return null;
  try { return readCampaign(text, LEGACY); } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    broken = e.message;
    return null;
  }
}
function keep(record) {
  store(writeCampaign(record));
  return { record, ...foldCampaign(LEGACY, record) };
}
const button = (t, f, cls = "quiet") => { const b = el("button", t, cls); b.type = "button"; b.onclick = f; return b; };
/** A button that asks once more before it acts. */
function sure(t, f) {
  const b = button(t, () => { if (b.dataset.armed) f(); else { b.dataset.armed = "1"; b.textContent = `${t}: press again to be sure`; } }, "quiet danger");
  return b;
}
function line(label, host) { const l = el("div", undefined, "line"); host.className = "pick small"; host.setAttribute("role", "radiogroup"); host.setAttribute("aria-label", label); l.append(el("span", label), host); return l; }

/** What the campaign has changed so far, in plain sentences; the bonus is for the next game only. */
function changes(c, sealed = []) {
  const s = c.state, out = [], hidden = S.seals.filter((x) => sealed.includes(x.id)).flatMap((x) => x.do.map((d) => d.name)); // a seal not yet broken keeps its rule to itself
  for (const [k, on] of Object.entries(s.switches)) if (on && !hidden.includes(k)) out.push(`${SWITCHED[k] || cap(k)}.`);
  for (const [at, text, seat, n] of s.names) out.push(`${place(at)} is called ${text}: ${NAMES[seat]} named it after winning game ${n}.`);
  for (const [at, , n] of s.works) if (!hidden.includes("forts")) out.push(`A fort stands at ${place(at)}, since game ${n}.`);
  s.bonus.forEach((k, seat) => { if (k) out.push(`${NAMES[seat]} sets out ${k} more at the start of the next game, for placing last.`); });
  return out;
}
function standingsTable(c) {
  const box = el("div", undefined, "ranks"), t = el("table"), head = el("tr");
  head.append(...["Place", "Player", "Points", "Wins"].map((x) => { const th = el("th", x); th.scope = "col"; return th; }));
  t.append(head, ...standings(c.state).map((r) => { const tr = el("tr"), who = el("th"); who.scope = "row"; who.append(sign(r.seat), NAMES[r.seat]); tr.append(el("td", String(r.place)), who, el("td", String(r.points)), el("td", String(r.wins))); return tr; }));
  t.setAttribute("aria-label", "The campaign's standings");
  box.append(t);
  return box;
}
function list(items, none) { if (!items.length) return el("p", none, "about"); const u = el("ul"); u.append(...items.map((x) => el("li", x))); return u; }

/** Play the campaign's next game, with its rules and marks. */
function play(c) {
  const nx = nextGame(LEGACY, c.record, c.state);
  if (!nx) return;
  if ($("sheet").open) $("sheet").close();
  T.begin(createMatch(nx.game, { seed: nx.seed, options: nx.options }), [...c.record.who]);
  toast(`${S.title}, game ${nx.n} of ${c.record.length}. ${chapterOf(nx.n)}`);
}
function download(record) {
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([writeCampaign(record)], { type: "application/json" }));
  a.download = `banners-campaign-${record.id}-${record.games.length}-of-${record.length}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** The campaign: where it stands, what it has changed, and what comes next. Or, with none kept here, a new one. */
function hub() {
  const c = load(), box = el("div", undefined, "stack");
  box.append(el("p", "Early: the first shape of legacy campaigns. Each game leaves marks that the next one keeps. The campaign is a file you hold: save it after each game and open it again here.", "about"));
  if (!c) return fresh(box);
  const n = c.record.games.length, over = c.state.over;
  box.append(el("h3", S.title), el("p", over ? `Finished: all ${c.record.length} games played.` : `Game ${n + 1} of ${c.record.length} comes next.${n ? "" : ` ${chapterOf(1)}`}`), standingsTable(c));
  if (over) { const top = standings(c.state).filter((r) => r.place === 1).map((r) => NAMES[r.seat]); box.append(el("p", `${top.join(" and ")} ${top.length > 1 ? "share" : "wins"} the campaign.`)); }
  box.append(el("h3", "What this campaign has changed"), list(changes(c), "Nothing yet: the first game is played on the story's own rules."));
  box.append(el("p", `Rules version ${c.record.rules}, kept from the campaign's start. Games taken back: ${c.record.takeBacks}.`, "about"));
  if (!over) box.append(button(`Play game ${n + 1}`, () => play(c), "main"));
  box.append(button("Save the campaign to a file", () => download(c.record)));
  if (n) box.append(sure(`Take back game ${n}, if everyone agrees`, () => { const k = keep(takeBack(c.record)); toast(`Game ${n} is taken back and will be dealt anew. Games taken back: ${k.record.takeBacks}.`); hub(); }));
  box.append(button("Open a campaign file", () => $("campaign-file").click()), sure("Start a new campaign in its place", () => { store(null); hub(); }));
  sheet("Campaign (early)", box, "Close", "wide");
}

/** A new campaign: how long, how many, and who sits where. */
function fresh(box) {
  if (broken) box.append(el("p", `The campaign kept in this browser could not be opened: ${broken}.`), sure("Forget it", () => { store(null); hub(); }));
  const length = el("div"), count = el("div"), who = el("ul");
  Object.assign(who.style, { listStyle: "none", padding: "0", margin: "0 0 12px", display: "grid", gap: "6px" }); // as the title card's seats
  const draw = () => {
    radio(length, S.lengths.map((v) => ({ value: v, label: `${v} games` })), form.length, (v) => { form.length = v; draw(); });
    radio(count, S.seats.map((v) => ({ value: v, label: String(v) })), form.seats, (v) => { form.seats = v; draw(); });
    who.replaceChildren(...Array.from({ length: form.seats }, (_, s) => {
      const li = el("li"), k = el("select"), name = el("span", undefined, "wear");
      k.append(...KINDS.map(([v, t]) => new Option(t, v)));
      k.value = form.who[s];
      k.setAttribute("aria-label", NAMES[s]);
      k.onchange = () => { form.who[s] = k.value; };
      const mark = sign(s);
      Object.assign(mark.style, { width: "28px", height: "28px", flex: "none" });
      Object.assign(li.style, { display: "flex", alignItems: "center", gap: "10px" });
      name.append(mark, el("b", NAMES[s]));
      li.append(name, k);
      return li;
    }));
  };
  draw();
  box.append(el("h3", S.title), el("p", `${chapterOf(1)} A campaign of Brass and Banners on the world map: the war is dealt out and won at 65% of the land or on the most land after 20 rounds. A win is worth ${S.rewards.win} points and holding on to the end ${S.rewards.live}. The winner names a province, the seat that placed last starts the next game with ${S.rewards.bonus} more, and sealed changes open when their moment comes.`),
    line("Length", length), line("Players", count), who,
    button("Begin the campaign", () => {
      const id = [...crypto.getRandomValues(new Uint32Array(2))].map((v) => v.toString(36)).join("").slice(0, 12);
      const c = keep(beginCampaign(LEGACY, { id, length: form.length, seats: form.seats, who: form.who.slice(0, form.seats) }));
      play(c);
    }, "main"),
    button("Open a campaign file", () => $("campaign-file").click()));
  sheet("Campaign (early)", box, "Close", "wide");
}

/** A seal, closed: what opened it, and a button to break it. Broken, it shows the new rule. */
function seal(s, broke = () => {}) {
  const env = el("div"), wax = el("span");
  Object.assign(env.style, { border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px", display: "grid", gap: "8px", justifyItems: "start" });
  Object.assign(wax.style, { width: "34px", height: "34px", borderRadius: "50%", background: "#8a1f1a", boxShadow: "inset 0 0 0 4px #a8322b, 0 1px 3px rgba(0,0,0,.5)" });
  wax.setAttribute("aria-hidden", "true");
  const open = button("Break the seal", () => {
    env.replaceChildren(el("b", `A seal is broken: ${s.title}`), el("p", s.text), el("small", "From the next game on."));
    env.setAttribute("role", "status");
    broke(s.id);
  }, "main");
  env.append(wax, el("b", "A sealed change"), el("p", s.why), open);
  return env;
}

/** After a campaign game: it is in the record; the winner's name for a province; any seals it opened; then on. */
function after(n) {
  const c = load();
  if (!c || c.record.games.length < n) return hub();
  const g = c.played[n - 1], box = el("div", undefined, "stack"), last = n === c.record.games.length, nx = nextGame(LEGACY, c.record, c.state);
  box.append(el("p", `Game ${n} of ${c.record.length} is in the campaign.`), standingsTable(c));
  if (g.named) {
    const [at, text, seat] = g.named, mine = c.record.who[seat] === "you" && last;
    box.append(el("h3", "A name on the map"), el("p", `${NAMES[seat]} won, and names the province they held strongest, ${place(at)}: it is now called ${text}.`));
    if (mine) {
      const pick = el("div"), now = S.pool.indexOf(text);
      radio(pick, S.pool.map((t, i) => ({ value: i, label: t })).filter((x) => x.value === now || !c.state.used.includes(x.value)), now, (v) => { keep(nameLast(LEGACY, c.record, v)); after(n); $("sheet-body").querySelector("[aria-checked=true]")?.focus(); });
      box.append(line("Call it", pick));
    }
  }
  // what the next game brings leaves out a sealed rule until its seal is broken
  const sealed = [...g.opened], brings = el("div"), redraw = () => brings.replaceChildren(list(changes(c, last ? sealed : []), "The same rules as before."));
  if (g.opened.length) box.append(el("h3", g.opened.length > 1 ? "Seals open" : "A seal opens"), ...g.opened.map((id) => seal(S.seals.find((s) => s.id === id), (done) => { sealed.splice(sealed.indexOf(done), 1); redraw(); })));
  redraw();
  if (nx) box.append(el("h3", `What game ${nx.n} brings`), brings);
  else { const top = standings(c.state).filter((r) => r.place === 1).map((r) => NAMES[r.seat]); box.append(el("h3", "The campaign is over"), el("p", `${top.join(" and ")} ${top.length > 1 ? "share" : "wins"} ${S.title}.`)); }
  box.append(el("p", "Save the campaign to keep it: the file holds every game, and opening it replays them all.", "about"), button("Save the campaign to a file", () => download(c.record)));
  if (nx) box.append(button(`Play game ${nx.n}`, () => play(load()), "main"));
  box.append(button("The whole campaign", hub));
  sheet(S.title, box, "Close", "wide");
}

/** Opening a campaign file: checked and replayed; it takes the place of the one kept here, asked first if they differ. */
async function opened(f) {
  let c;
  try { c = readCampaign(await f.text(), LEGACY); } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    return sheet("That campaign was not opened", el("p", `${cap(e.message)}.`));
  }
  const here = load(), go = () => { keep(c.record); hub(); toast(`${S.title}: ${c.record.games.length} of ${c.record.length} games replayed.`); };
  if (!here || writeCampaign(here.record) === writeCampaign(c.record)) return go();
  const box = el("div", undefined, "stack");
  box.append(el("p", `This browser keeps one campaign, at game ${here.record.games.length} of ${here.record.length}. Save it to a file first if you want it. The file you opened is at game ${c.record.games.length} of ${c.record.length}.`), sure("Keep the opened campaign in its place", go), button("Back", hub));
  return sheet("Replace your campaign?", box, null);
}

/** Banners' table hooks (site/banners.js, marked "legacy hook"). */
export const campaign = {
  mount(table) {
    T = table;
    const file = el("input");
    Object.assign(file, { type: "file", accept: ".json,application/json", id: "campaign-file", hidden: true });
    file.onchange = () => { const f = file.files[0]; file.value = ""; if (f) opened(f); };
    document.body.append(file);
    $("campaign").onclick = hub;
  },
  /** A campaign game that ends goes into the campaign's record at once. */
  seen(table, events) {
    const marks = table.match.options.marks;
    if (table.demo || !marks || !events.some((e) => e.kind === "end")) return;
    const c = load();
    if (!c || c.record.id !== marks.campaign || c.record.games.length >= marks.game) return;
    try { keep(addGame(LEGACY, c.record, table.match)); } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      toast(`This game was not added to the campaign: ${e.message}.`);
    }
  },
  next(table) {
    const marks = table.match.options.marks, c = marks && !table.demo ? load() : null;
    if (!c || c.record.id !== marks.campaign || c.record.games.length < marks.game) return null;
    return { label: c.state.over ? "The campaign's end" : "On with the campaign", go: () => after(marks.game) };
  },
  summary(table) {
    const marks = table.match.options.marks;
    if (!marks || table.demo) return "";
    const p = table.match.position, r = table.match.result, why = String(r.why || "played to the end"), last = p.rounds ? Math.min(p.round, p.rounds) : p.round;
    return `${r.winners.length > 1 ? `They ${why}` : `${cap(why)}, in ${last} round${last === 1 ? "" : "s"}`}. Game ${marks.game} of ${S.title}.`;
  },
};
