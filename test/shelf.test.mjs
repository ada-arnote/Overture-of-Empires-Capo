// SPDX-License-Identifier: AGPL-3.0-or-later
// The community shelf (ruling 155): its format, its gate, and the readers every entry must pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, LIMIT, cardOf, checkEntry, idFor, indexOf, makeEntry, readIndex, refused, storyOf } from "../src/story/shelf.js";
import { checkShelf, readerSays, TABLE } from "../tools/shelf.mjs";
import { find } from "../tools/serve.mjs";
import { createMatch, openSave } from "../src/core/index.js";
import { newWorldGame } from "../src/story/turn.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shelfDir = path.join(root, "shelf");
const files = readdirSync(shelfDir).filter((f) => f !== "index.json");
const read = (f) => JSON.parse(readFileSync(path.join(shelfDir, f), "utf8"));
const winter = () => read("a-hard-winter-in-the-north.json"), replay = () => read("fable-three-bots-small-island.json");
const why = (e) => { const r = checkEntry(e); assert.equal(r.ok, false, "should be refused"); return r.why; };
const DASH = String.fromCharCode(8212);

test("shelf: our own examples pass the shelf's rules and the game's readers, and the index lists each as its file says", () => {
  assert.ok(files.length >= 3, "two or three examples of our own");
  const r = checkShelf(root);
  assert.deepEqual(r.bad, []);
  assert.equal(r.cards.length, files.length);
  const index = JSON.parse(readFileSync(path.join(shelfDir, "index.json"), "utf8"));
  assert.deepEqual(index, indexOf(r.cards), "node tools/shelf.mjs writes the index the gate expects");
  assert.deepEqual(readIndex(index).map((c) => c.id), index.entries.map((c) => c.id), "the page keeps every card");
  const types = new Set(r.cards.map((c) => c.type));
  assert.ok(types.has("scenario") && types.has("replay"), "a scenario and a replay");
  assert.ok(r.cards.some((c) => c.from && r.cards.some((d) => d.id === c.from)), "a fork names the entry it was made from");
  for (const f of files) { const t = readFileSync(path.join(shelfDir, f), "utf8"); assert.ok(!t.includes(DASH), `${f}: no em dash`); assert.ok(t.length <= LIMIT.file[read(f).type]); }
});

test("shelf: an entry's shape, fields and licence are checked", () => {
  assert.equal(checkEntry(winter()).ok, true);
  assert.match(why({ ...winter(), kind: "capo-scenario" }), /not a shelf entry/);
  assert.match(why({ ...winter(), extra: 1 }), /field the shelf does not know/);
  assert.match(why({ ...winter(), id: "Not An Id" }), /id must be/);
  assert.match(why({ ...winter(), game: "fable" }), /Capo's; replays are the table games'/);
  assert.match(why({ ...winter(), type: "film" }), /type or game/);
  assert.match(why({ ...winter(), title: "x".repeat(61) }), /title/);
  assert.match(why({ ...winter(), title: "  padded " }), /title/);
  assert.match(why({ ...winter(), licence: "MIT" }), /CC-BY-4.0 or CC0-1.0/);
  assert.match(why({ ...winter(), licence: "CC-BY-4.0", by: "" }), /naming who made it/);
  assert.equal(checkEntry({ ...winter(), licence: "CC-BY-4.0", by: "Juniper" }).ok, true);
  assert.match(why({ ...winter(), made: "soon" }), /date/);
  assert.match(why({ ...winter(), from: "a-hard-winter-in-the-north" }), /another shelf id/);
  assert.match(why({ ...winter(), data: { kind: "capo-pack" } }), /must hold a Capo scenario/);
  assert.match(why({ ...winter(), result: { moves: 0, winners: null } }), /Only a replay/);
  const r = replay();
  assert.match(why({ ...r, result: { ...r.result, moves: r.result.moves + 1 } }), /how many moves/);
  assert.match(why({ ...r, data: { ...r.data, game: "glass" } }), /of its own game/);
  assert.match(why({ ...r, data: { ...r.data, note: "x" } }), /of its own game/);
});

test("shelf: the hard line, web addresses and email addresses are refused anywhere in an entry, however deep", () => {
  for (const t of ["See https://example.com", "visit www.example.org", "mailto:a", "our site, example.io/page", "write to someone@example.com"]) assert.ok(refused(t), t);
  for (const t of ["The U.S. and the U.K. sign a pact", "e.g. a dry year", "Port of St. Petersburg", "3.5 million people", "the ice closed the ports"]) assert.equal(refused(t), "", t);
  const deep = winter(); deep.data.facts.push({ text: "Details at https://example.com/winter" });
  assert.match(why(deep), /web address/);
  const mail = winter(); mail.about = "Ask me: a.person@example.net";
  assert.match(why(mail), /email/);
  const line = winter(); line.data.opening = "A scene that describes a sexual act with a 12-year-old child.";
  assert.match(why(line), /hard line/);
  const key = winter(); key.data.owners = { "https://x.y": "FIN" };
  assert.match(why(key), /web address/, "keys are text too");
});

test("shelf: a new entry is made from the player's own data, with a tidy id, no em dashes, and the result a replay claims", () => {
  assert.match(idFor("A Hard Winter: the Thaw!", "Ab12"), /^a-hard-winter-the-thaw-ab12$/);
  assert.match(idFor("!!!", ""), /^entry-x$/);
  const s = winter().data;
  s.opening = `The ice came early ${DASH} and stayed.`;
  const e = makeEntry({ type: "scenario", game: "capo", title: `Ice ${DASH} and fire`, about: "", by: "Juniper", licence: "CC-BY-4.0", made: "2026-11-27", tail: "k3" }, s);
  assert.equal(checkEntry(e).ok, true, checkEntry(e).why);
  assert.equal(e.title, "Ice, and fire");
  assert.equal(e.data.opening, "The ice came early, and stayed.");
  assert.ok(!JSON.stringify(e).includes(DASH));
  assert.notEqual(e.data, s, "the data is a copy");
  assert.equal(readerSays(root, e), "", "and it still opens in the game");
  const m = createMatch(TABLE.glass, { seed: "t", options: { seats: 2 } });
  for (let i = 0; i < 5 && m.turn !== null; i++) m.play(m.legal()[0]);
  const r = makeEntry({ type: "replay", game: "glass", title: "Five moves", by: "", licence: "CC0-1.0", made: "2026-11-27", tail: "q" }, JSON.parse(m.save()), { moves: m.list.length, winners: null });
  assert.equal(checkEntry(r).ok, true, checkEntry(r).why);
  assert.equal(readerSays(root, r), "");
  assert.equal(openSave(JSON.stringify(r.data), [TABLE.glass]).match.fingerprint(), m.fingerprint(), "it replays to the same position");
  assert.equal(cardOf(r, 100).result.winners, null);
});

test("shelf: a Capo story leaves out the chats, the counsel and this browser's notes, and opens as a saved game", () => {
  const g = { ...newWorldGame("FIN", "nation", "abc", {}), chats: [{ id: 1, messages: ["private words"] }], counsel: [{ q: "asked" }], actions: ["draft"], orders: [{ text: "x" }], shelf: "old", seen: 3 };
  const s = storyOf(g);
  assert.deepEqual([s.chats, s.counsel, s.actions, s.orders, s.shelf, s.seen], [[], [], undefined, undefined, undefined, undefined]);
  assert.ok(!JSON.stringify(s).includes("private words"));
  const e = makeEntry({ type: "story", game: "capo", title: "Finland, turn one", by: "", licence: "CC0-1.0", made: "2026-11-27", tail: "s" }, s);
  assert.equal(checkEntry(e).ok, true, checkEntry(e).why);
  assert.equal(readerSays(root, e), "");
  assert.equal(readerSays(root, { ...e, data: { ...e.data, player: "ZZZ" } }), "it is not a Capo game this version can open");
  assert.deepEqual(cardOf(e, 10).turn, 1);
});

test("shelf: the game's readers have the last word: a scenario that does not fit the map, a replay that breaks or claims the wrong winner", () => {
  const w = winter();
  w.data.owners = { "NOPE-1": "FIN" };
  assert.match(readerSays(root, w), /keeps 0 of its 1 owners/);
  w.data = { ...winter().data, start: "someday" };
  assert.match(readerSays(root, w), /start date/);
  const r = replay();
  assert.match(readerSays(root, { ...r, result: { ...r.result, winners: [1] } }), /claims \[1\] won/);
  const cut = replay(); cut.data.moves = cut.data.moves.slice(0, -1); cut.result.moves--;
  assert.match(readerSays(root, cut), /different position|replay/);
  const notes = [], old = replay(); old.data.version = "1";
  assert.equal(readerSays(root, old, (n) => notes.push(n)), "", "older rules stop nothing");
  assert.match(notes[0], /version 1 of fable's rules/);
});

test("shelf: the gate stops a bad file and a stale index, and notes a good file that is not listed yet", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "capo-shelf-"));
  const run = (put) => {
    rmSync(path.join(dir, "shelf"), { recursive: true, force: true });
    cpSync(shelfDir, path.join(dir, "shelf"), { recursive: true });
    for (const [f, t] of Object.entries(put)) if (t === null) rmSync(path.join(dir, "shelf", f)); else writeFileSync(path.join(dir, "shelf", f), typeof t === "string" ? t : JSON.stringify(t));
    return checkShelf(dir);
  };
  try {
    mkdirSync(path.join(dir, "maps")); cpSync(path.join(root, "maps/world.json"), path.join(dir, "maps/world.json"));
    assert.deepEqual(run({}).bad, []);
    const fresh = { ...winter(), id: "a-new-winter", title: "A New Winter" };
    const r = run({ "a-new-winter.json": fresh });
    assert.deepEqual(r.bad, []);
    assert.ok(r.note.some((n) => /a-new-winter\.json: passes, and is not in the index yet/.test(n)));
    const stop = (put, re) => { const b = run(put).bad; assert.ok(b.some((x) => re.test(x)), `wanted ${re}, got ${JSON.stringify(b)}`); };
    stop({ "wrong-name.json": fresh }, /file name must be its id/);
    stop({ "notes.txt": "hello" }, /only shelf entries/);
    stop({ "broken.json": "{" }, /not JSON/);
    stop({ "a-new-winter.json": JSON.stringify(fresh).replace("Fiction.", `Fiction ${DASH}`) }, /em dash/);
    stop({ "a-new-winter.json": { ...fresh, about: "x".repeat(LIMIT.about + 1) } }, /must be plain text/);
    stop({ "a-hard-winter-in-the-north.json": { ...winter(), about: "Changed after it was listed." } }, /does not match its file/);
    stop({ "a-hard-winter-in-the-north.json": null }, /a-hard-winter-in-the-north does not match its file/);
    stop({ "index.json": "[]" }, /not the shelf's index/);
    const big = { ...fresh }; big.data = { ...fresh.data, facts: Array.from({ length: 400 }, () => ({ text: "x".repeat(400) })) };
    stop({ "a-new-winter.json": big }, /above the \d+ a scenario may have|larger than any/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("shelf: the page reads only good cards, and the site serves the shelf to its own pages", async () => {
  const good = JSON.parse(readFileSync(path.join(shelfDir, "index.json"), "utf8"));
  assert.deepEqual(readIndex({ ...good, kind: "x" }), []);
  const bad = structuredClone(good); bad.entries[0].title = "go to www.example.com"; bad.entries[1].size = LIMIT.file.scenario + 1;
  assert.equal(readIndex(bad).length, good.entries.length - 2);
  assert.ok(await find(root, "/shelf/index.json"), "tools/serve.mjs serves shelf/");
  assert.equal(await find(root, "/shelf/../LICENSE"), null);
  // built pages served from the site may read their own site (the shelf); the double-click pages reach nothing
  for (const name of Object.keys(GAMES).filter((g) => g !== "capo")) {
    const rule = readFileSync(path.join(root, "play", `${name}.html`), "utf8").match(/Content-Security-Policy" content="([^"]*)"/)[1];
    assert.match(rule, / connect-src 'self';/, `${name}: its served page reads the shelf`);
  }
});
