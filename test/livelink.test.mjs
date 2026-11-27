// SPDX-License-Identifier: AGPL-3.0-or-later
// The live link: salted dice, the session between two browsers (two fake peers here), and the gate's named addresses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEALT, Refusal, chance, commitOf, createMatch, createSession, openSave, packGame, saltOf, seedState, unpackGame } from "../src/core/index.js";
import { banners } from "../src/games/banners/rules.js";
import { choose } from "../src/games/banners/bot.js";
import { check } from "../tools/check.mjs";

const OPTIONS = { seats: 2 };
const pick = (m) => choose(m.position, chance(seedState(`${m.seed}/${m.list.length}`)), "easy");
let counter = 0;
const secret = () => (++counter).toString(16).padStart(32, "a");
const tick = () => new Promise((r) => setImmediate(r));

test("salts mix into a move's dice, are kept only where dice were thrown, and replay through saves and links", () => {
  const plain = createMatch(banners, { seed: "salt", options: OPTIONS }), salted = createMatch(banners, { seed: "salt", options: OPTIONS });
  let differed = false;
  for (let i = 0; i < 160 && plain.turn !== null; i++) {
    const mv = pick(salted);
    if (!plain.isLegal(mv)) { differed = true; break; }
    plain.play(mv);
    salted.play(mv, saltOf(i, "a", "b"));
    if (plain.fingerprint() !== salted.fingerprint()) differed = true;
  }
  assert.ok(differed, "the salt changed some dice");
  const salts = salted.salts;
  assert.ok(salts.some(Boolean) && salts.some((x) => x === ""), "salts only where dice rolled");
  const back = openSave(salted.save(), [banners]).match;
  assert.equal(back.fingerprint(), salted.fingerprint());
  assert.deepEqual(back.salts, salts);
  const { match } = unpackGame(packGame(salted, ["host", "friend"], [[0, 0], [1, 1]]), [banners]);
  assert.equal(match.fingerprint(), salted.fingerprint());
  // a game without salts keeps the old save shape and link layout
  assert.ok(!("salts" in JSON.parse(plain.save())));
  assert.equal(packGame(plain, ["host", "friend"], [[0, 0], [1, 1]])[0], 2);
  // the table keeps a look for all six seats; a link holds only the seats in play, so it opens again
  assert.deepEqual(unpackGame(packGame(plain, ["host", "friend"], [[0, 0], [4, 1], [5, 2], [3, 3], [1, 8], [14, 4]]), [banners]).look, [[0, 0], [4, 1]]);
  assert.throws(() => salted.play(pick(salted), "nothex!!"), (e) => e instanceof Refusal);
});

/** Two sides joined by a fake channel. Each keeps a table match, as the page does, and plays what the session hands it. */
function pair({ hostSeed = "deal me", guestSeed = hostSeed, tamper = null } = {}) {
  const sides = {}, notes = [];
  for (const side of ["host", "guest"]) {
    const me = { side, tm: createMatch(banners, { seed: side === "host" ? hostSeed : guestSeed, options: OPTIONS }), stopped: false };
    me.s = createSession({
      side, secret,
      owns: (seat) => (side === "host" ? seat === 0 : seat === 1),
      moved: async (mv) => { const n = me.tm.list.length; me.tm.play(mv, await me.s.salt(mv, n)); },
      dealt: (seed) => { me.tm = createMatch(banners, { seed, options: OPTIONS }); },
      adopt: (m) => { me.tm = openSave(m.save(), [banners]).match; },
      // a stop closes the channel, so the other side hears it dropped
      trouble: (text, stop) => { notes.push(`${side}: ${text}`); if (stop) { me.stopped = true; setImmediate(() => sides[side === "host" ? "guest" : "host"].s.detach()); } },
    });
    me.s.start(me.tm);
    sides[side] = me;
  }
  const link = () => {
    for (const [a, b] of [["host", "guest"], ["guest", "host"]]) sides[a].s.attach((x) => { const y = JSON.parse(JSON.stringify(x)); setImmediate(() => sides[b].s.receive(tamper ? tamper(a, y) : y)); });
  };
  return { ...sides, notes, link, cut: () => { sides.host.s.detach(); sides.guest.s.detach(); } };
}
async function settle(p) { for (let i = 0; i < 20; i++) await tick(); }
async function playOn(p, moves) {
  for (let k = 0; k < moves; k++) {
    const m = p.host.tm;
    if (m.turn === null || p.host.stopped || p.guest.stopped) return;
    const mover = m.turn === 0 ? p.host : p.guest, other = mover === p.host ? p.guest : p.host, n = mover.tm.list.length, mv = pick(mover.tm);
    let salt;
    try { salt = await mover.s.salt(mv, n); } catch (e) { if (e instanceof Refusal) return; throw e; } // the table is told the move was not played
    mover.tm.play(mv, salt);
    for (let i = 0; i < 50 && other.tm.list.length <= n; i++) await tick();
  }
}

test("two fake peers: the seed is dealt by both, every move is checked, and both end on the same game", async () => {
  const p = pair();
  p.link();
  await settle(p);
  assert.ok(p.host.tm.seed.startsWith(DEALT), "dealt live");
  assert.equal(p.host.tm.seed, p.guest.tm.seed);
  assert.notEqual(p.host.tm.seed, "deal me");
  await playOn(p, 120);
  assert.deepEqual(p.notes, []);
  assert.ok(p.host.tm.list.length >= 100);
  assert.equal(p.host.tm.fingerprint(), p.guest.tm.fingerprint());
  assert.equal(p.host.s.match.fingerprint(), p.host.tm.fingerprint());
  assert.ok(p.host.tm.salts.some(Boolean), "the dice were salted");
  // knowing the seed is not enough to know the dice: the same moves without salts lead elsewhere
  const blind = createMatch(banners, { seed: p.host.tm.seed, options: OPTIONS });
  let apart = false;
  for (const mv of p.host.tm.list) { if (!blind.isLegal(mv)) { apart = true; break; } blind.play(mv); }
  assert.ok(apart || blind.fingerprint() !== p.host.tm.fingerprint());
});

test("a changed secret, a move out of the list, or another game each stop live play", async () => {
  const lie = pair({ tamper: (from, x) => (from === "guest" && x.t === "reveal" ? { ...x, r: "f".repeat(32) } : x) });
  lie.link(); await settle(lie); await playOn(lie, 6);
  assert.ok(lie.notes.some((t) => /changed a secret/.test(t)) && lie.host.stopped);

  const bad = pair({ tamper: (from, x) => (from === "guest" && x.t === "move" ? { ...x, i: 99999 } : x) });
  bad.link(); await settle(bad); await playOn(bad, 6);
  assert.ok(bad.notes.some((t) => /not allow/.test(t)));

  const other = pair();
  other.link(); await settle(other); await playOn(other, 4);
  other.cut();
  other.guest.tm.play(other.guest.tm.legal()[0]); // apart from each other, each goes its own way
  other.host.tm.play(other.host.tm.legal().at(-1));
  assert.ok(other.host.tm.legal().length > 0);
  other.host.s.start(other.host.tm); other.guest.s.start(other.guest.tm);
  other.link(); await settle(other);
  assert.ok(other.notes.some((t) => /differently|different/.test(t)));
});

test("reconnect: a side that fell behind takes the other's game, and play goes on live", async () => {
  const p = pair();
  p.link(); await settle(p); await playOn(p, 10);
  p.cut();
  // while apart, the host plays on by link (no salts): its moves are taken when they meet again
  for (let i = 0; i < 3; i++) p.host.tm.play(pick(p.host.tm));
  p.host.s.start(p.host.tm);
  p.link(); await settle(p);
  assert.equal(p.guest.tm.fingerprint(), p.host.tm.fingerprint());
  await playOn(p, 20);
  assert.deepEqual(p.notes, []);
  assert.equal(p.guest.tm.fingerprint(), p.host.tm.fingerprint());
});

test("a fresh secret for a roll already promised is said to the other side", async () => {
  const p = pair();
  p.link(); await settle(p);
  const n = p.host.tm.list.length;
  p.host.s.receive({ t: "commit", n, c: commitOf("b".repeat(32)), f: p.host.tm.fingerprint() });
  assert.ok(p.notes.some((t) => /new secret/.test(t)));
  assert.equal(commitOf("x").length, 64);
});

// the gate: named outside addresses for live play, each with a reason, and nothing else
function site(stunLine, csp, extra = "") {
  const root = mkdtempSync(path.join(tmpdir(), "capo-gate-"));
  for (const d of ["site", "src"]) mkdirSync(path.join(root, d));
  writeFileSync(path.join(root, "site/config.js"), `// SPDX-License-Identifier: AGPL-3.0-or-later\nexport const AI_BASES = {\n  openai: "https://api.openai.com/v1",\n};\nexport const LIVE_ADDRESSES = [\n${stunLine}\n];\n`);
  writeFileSync(path.join(root, "site/banners.html"), `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src 'self'; media-src 'self'; connect-src ${csp}; require-trusted-types-for 'script'">\n`);
  writeFileSync(path.join(root, "site/livelink.js"), `// SPDX-License-Identifier: AGPL-3.0-or-later\n${extra}\n`);
  for (const [f, t] of [["CREDITS.csv", "file,title,maker,licence,source,date,changes\n"], ["ADAPTED.csv", "file,repository,path,branch,date,notice,lines,capo_only\n"], ["NOTICES.md", "notices\n"]]) writeFileSync(path.join(root, f), t);
  return check(root).bad;
}
const NAMED = `  { url: "stun:stun.example.org:3478", why: "finds this browser's public address for a direct connection" },`;
test("gate: a table page may list exactly the named live addresses, each with a reason", () => {
  assert.deepEqual(site(NAMED, "'self' stun://stun.example.org:3478"), []);
  assert.deepEqual(site(NAMED, "'self'"), [], "a page that does not list them is fine too");
});
test("gate: anything else is still a hard stop", () => {
  assert.ok(site(NAMED, "'self' stun://stun.other.net:3478").some((b) => /connect-src/.test(b)), "an address not named in config");
  assert.ok(site(NAMED, "'self' stun://stun.example.org:3478 https://evil.example").some((b) => /connect-src/.test(b)), "a named address beside an unnamed one");
  assert.ok(site(NAMED, "'self' stun:stun.example.org:3478").some((b) => /connect-src/.test(b)), "the form browsers ignore, with a warning");
  assert.ok(site(`  { url: "stun:stun.example.org:3478", why: "" },`, "'self' stun://stun.example.org:3478").some((b) => /reason/.test(b)), "a named address needs a reason");
  assert.ok(site(`  { url: "stun:stun.example.org:3478" },`, "'self'").some((b) => /reason/.test(b)), "no reason at all");
  assert.ok(site(`  { url: "https://relay.example.org", why: "a relay" },`, "'self'").some((b) => /stun: or turn:/.test(b)), "only STUN and TURN addresses may be named");
  assert.ok(site(NAMED, "'self'", `const x = "stun:stun.sneaky.net:3478";`).some((b) => /outside address/.test(b)), "a STUN address written in code but not named");
  assert.deepEqual(site(NAMED, "'self'", `const x = "stun:stun.example.org:3478";`), [], "the named one may be written in code");
  assert.ok(site(NAMED, "'self' https://api.openai.com").some((b) => /connect-src/.test(b)), "a table page may not borrow the AI list piecemeal");
});
