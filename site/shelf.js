// SPDX-License-Identifier: AGPL-3.0-or-later
// The community shelf in the pages (ruling 155, option D): browse what players have shared and open it, and make a
// shelf file from your own scenario, story or replay. The shelf is read from this site's own shelf/ folder; this page
// never sends anything. Offering a file is done by the player, on GitHub, with their own account, if they choose to.
// Used by Capo's first screen and Game menu (site/game.js) and by every table game's menu (site/table.js).
import { GAMES, LICENCES, LIMIT, TYPES, checkEntry, makeEntry, readIndex } from "../src/story/shelf.js";
import { SOURCE_URL } from "./config.js";

const HOME = "../shelf/", BRANCH = "main"; // the folder beside site/ and play/; the branch offers are made against
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "quiet") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };
const dateOf = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };
const SHORT = { "CC-BY-4.0": "CC BY 4.0", "CC0-1.0": "CC0" };
const asFile = () => location.protocol === "file:";

/** Fetch one file of the shelf, as text no longer than `most`. */
async function fetchText(name, most) {
  const res = await fetch(HOME + name);
  if (!res.ok) throw new Error(res.status === 404 ? "That is not on the shelf." : `The shelf could not be read (${res.status}).`);
  const text = await res.text();
  if (text.length > most) throw new Error("That file is larger than the shelf allows.");
  return text;
}
/** The shelf's index: its cards, checked. */
export async function loadIndex() {
  let x;
  try { x = JSON.parse(await fetchText("index.json", LIMIT.index)); } catch (e) { throw new Error(e instanceof SyntaxError ? "The shelf's index could not be read." : e.message); }
  return readIndex(x);
}
/** One entry, fetched and checked by the shelf's own rules. The game's readers check its data next. */
export async function loadEntry(card) {
  let raw;
  try { raw = JSON.parse(await fetchText(`${card.id}.json`, LIMIT.file[card.type])); } catch (e) { throw new Error(e instanceof SyntaxError ? "That entry is not a shelf file." : e.message); }
  const r = checkEntry(raw);
  if (!r.ok) throw new Error(r.why);
  if (r.entry.id !== card.id || r.entry.type !== card.type || r.entry.game !== card.game) throw new Error("That entry does not match the shelf's index.");
  return r.entry;
}

/**
 * The shelf for one game, as a block to put in a sheet. game: "capo" or a table game's key. open(entry) is the game's
 * own way in (it runs the game's readers and may refuse). version: a table game's rules version, so replays made under
 * other rules are shown but cannot be opened. note: the class for small print.
 */
export function shelfView({ game, open, version = "", note = "note", share = "" }) {
  const box = el("div", undefined, "shelf"), status = el("p", asFile() ? "" : "Reading the shelf...", note), list = el("div");
  status.setAttribute("role", "status");
  box.append(el("p", `${game === "capo" ? "Scenarios and stories" : "Replays"} players have shared. Each one was read by a person and passed the same checks the game uses before it was put here. Opening one reads it from this site; nothing is sent.`, note), status, list);
  if (asFile()) { status.textContent = "The shelf is read from the site. This copy was opened as a file, so it cannot reach it: open the game from its web address."; return box; }
  loadIndex().then((cards) => {
    const mine = cards.filter((c) => c.game === game), byId = new Map(cards.map((c) => [c.id, c]));
    status.textContent = mine.length ? `${mine.length} on the shelf.` : "Nothing on the shelf for this game yet.";
    for (const type of Object.keys(TYPES)) {
      const these = mine.filter((c) => c.type === type);
      if (!these.length) continue;
      if (game === "capo") list.append(el("h3", { scenario: "Scenarios", story: "Stories", replay: "Replays" }[type]));
      const ul = el("ul", undefined, "shelf-list");
      for (const c of these) {
        const li = el("li"), head = el("div", undefined, "shelf-head"), go = button("Open", () => {}, "main"), old = c.type === "replay" && version && c.version !== version;
        const said = [TYPES[c.type], c.by ? `by ${c.by}` : "", SHORT[c.licence], dateOf(c.made)].filter(Boolean).join(" · ");
        head.append(el("b", c.title), el("small", said));
        li.append(head);
        if (c.about) li.append(el("p", c.about));
        const facts = [c.type === "replay" ? `${c.result.moves} moves${c.result.winners ? ", to the end" : ", unfinished: you can play on"}` : "", c.start ? `Starts ${dateOf(c.start)}${c.turn > 1 ? `, turn ${c.turn}` : ""}` : "", c.from ? `Made from ${byId.get(c.from) ? `"${byId.get(c.from).title}"${byId.get(c.from).by ? ` by ${byId.get(c.from).by}` : ""}` : "an entry no longer on the shelf"}` : ""].filter(Boolean);
        if (facts.length) li.append(el("small", facts.join(". ") + ".", "shelf-facts"));
        const say = el("small", "", "shelf-say");
        say.setAttribute("role", "status");
        if (old) { go.disabled = true; say.textContent = "Made under other rules of this game, so it cannot be replayed here."; }
        go.setAttribute("aria-label", `Open ${c.title}`);
        go.onclick = async () => {
          go.disabled = true; go.textContent = "Opening..."; say.textContent = "";
          try { await open(await loadEntry(c)); } catch (e) { say.textContent = e.message || "That entry could not be opened."; }
          if (go.isConnected) { go.disabled = false; go.textContent = "Open"; }
        };
        const row = el("div", undefined, "shelf-row");
        row.append(go);
        li.append(row, say);
        ul.append(li);
      }
      list.append(ul);
    }
  }).catch((e) => { status.textContent = e.message || "The shelf could not be read."; });
  box.append(el("p", share || "Share your own from the menu, with Share to the shelf.", note));
  return box;
}

/**
 * Make a shelf file from something of the player's own, and say how to offer it. Nothing is sent: the file is saved
 * on this device, and the links open GitHub's own pages, where the player decides. what: the words for what is in it.
 * {type, game, data, result, from, title, about, what, note}
 */
export function shareView({ type, game, data, result, from, title = "", about = "", what = "", note = "note" }) {
  const box = el("div", undefined, "shelf share"), say = el("p", "", note), steps = el("div", undefined, "shelf-steps");
  say.setAttribute("role", "status");
  const field = (label, value, max, hint) => { const l = el("label", undefined, "shelf-field"), f = el("input", undefined, "field"); Object.assign(f, { type: "text", value, maxLength: max, placeholder: hint, autocomplete: "off", spellcheck: true }); l.append(el("span", label), f); return [l, f]; };
  const [tl, tf] = field("Title", title.slice(0, LIMIT.title), LIMIT.title, "What it is called on the shelf");
  const [al, af] = field("A line about it", about.slice(0, LIMIT.about), LIMIT.about, "Optional");
  const [bl, bf] = field("The name it goes by", "", LIMIT.by, "Any name you choose, not your own unless you want");
  const lic = el("fieldset", undefined, "shelf-licence");
  lic.append(el("legend", "Licence"));
  for (const [k, words] of Object.entries(LICENCES)) { const l = el("label"), r = el("input"); Object.assign(r, { type: "radio", name: "shelf-licence", value: k, checked: k === "CC-BY-4.0" }); l.append(r, el("span", words)); lic.append(l); }
  const own = el("label", undefined, "shelf-own"), tick = el("input");
  tick.type = "checkbox";
  own.append(tick, el("span", "I made this, and I offer it under the licence above."));
  const make = button("Save the shelf file", () => {
    const licence = lic.querySelector("input:checked")?.value;
    if (!tick.checked) { say.textContent = "Tick that you made it and offer it under its licence first."; return; }
    const tail = [...crypto.getRandomValues(new Uint32Array(1))][0].toString(36).slice(0, 4);
    const entry = makeEntry({ type, game, title: tf.value, about: af.value, by: bf.value, licence, made: new Date().toISOString().slice(0, 10), from, tail }, data, result);
    if (!entry.title) { say.textContent = "Give it a title."; return; }
    const r = checkEntry(entry), text = JSON.stringify(entry, null, 1);
    if (!r.ok) { say.textContent = r.why; return; }
    if (text.length > LIMIT.file[type]) { say.textContent = `That is larger than the shelf takes (${Math.round(text.length / 1000)} of ${LIMIT.file[type] / 1000} thousand characters).`; return; }
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = `${entry.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say.textContent = `Saved as ${entry.id}.json.`;
    offer(entry);
  }, "main");
  const offer = (entry) => {
    const up = el("a", "Open GitHub's upload page for the shelf", "quiet"), issue = el("a", "Or open an offer on GitHub and attach the file", "text");
    up.href = `${SOURCE_URL}/upload/${BRANCH}/shelf`;
    issue.href = `${SOURCE_URL}/issues/new?template=shelf.yml&title=${encodeURIComponent(`Shelf: ${entry.title}`)}`;
    for (const a of [up, issue]) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    const ol = el("ol");
    for (const t of [`Read the file first: everything in it will be public. Leave out your own name, where you live and anything else about you.`,
      "On GitHub, with your own account, drop the file on the upload page and choose Propose changes. That makes a pull request. If you would rather not, open an offer and attach the file there.",
      `The checks run on it (the shelf's rules, then the game's own readers${type === "replay" ? ", which replay it from its seed and moves" : ""}), and a person reads it. If it is taken, it shows on the shelf in the next build.`]) ol.append(el("li", t));
    const links = el("div", undefined, "shelf-row");
    links.append(up, issue);
    steps.replaceChildren(el("h3", "Offer it to the shelf"), ol, links, el("p", "This page sends nothing and never will: offering is done by you, on GitHub, if you choose. GitHub shows your account's name on the offer.", note));
  };
  box.append(el("p", `Make a shelf file from ${what || `this ${TYPES[type].toLowerCase()}`} for ${GAMES[game]}. Others can then open it from the shelf${type === "replay" ? " and step through it, or play on from its end if it is unfinished" : ", play it, and share a game of their own made from it"}.`, note),
    tl, al, bl, el("p", "The name is how the shelf credits you. A licence of CC BY means it is shown wherever your entry is used.", note), lic, own);
  const row = el("div", undefined, "shelf-row");
  row.append(make);
  box.append(row, say, steps);
  return box;
}
