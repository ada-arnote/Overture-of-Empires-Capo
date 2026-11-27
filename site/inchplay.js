// SPDX-License-Identifier: AGPL-3.0-or-later
// An Inch of Ink in real time, live between two browsers (ruling 155; the servers paper's real-time lockstep). Two people share one
// map and the bots fill the other nations, played the same on both sides. The invitation and the reply are the live link's
// (site/livelink.js): a link with a WebRTC offer, a reply link, then a data channel straight between the two browsers; the one outside
// address is the STUN service in config.js, reached only after a player asks for live play. The exchange is src/core/lockstep.js:
// orders in frames four times a second, a short input delay, the clock in game ticks, dice from both browsers' secrets, a check
// every second, a pause both see, and joining again after a drop. If no direct path is found, the page says so and nothing is lost.
import { Refusal, canon, createMatch, openSave, readOptions } from "../src/core/index.js";
import { DELAY, FRAME_MS, createLockstep } from "../src/core/lockstep.js";
import { DEALT } from "../src/core/session.js";
import { inch } from "../src/games/inch/rules.js";
import { LIVE_ADDRESSES } from "./config.js";
import { makeLink, newId, readLink } from "./link.js";
import { PARTS, PRIVACY, canLive } from "./livelink.js";
import { $, el, sheet, toast } from "./table.js";
import { useInviter, useNet } from "./inchlive.js";

const { GATHER, HAND, OPEN, blobOf, gathered, secret, squeeze, unsqueeze } = PARTS;
const V = 1, INVITE = "capo-inch-live-invite", SIDE_KEY = "capo-inch-live", MOST = 400000;
export const FAIR_RT = "Both browsers play every tick by the same rules from the same orders and compare the game every second. Nobody can peek at the dice: the bots' chances each tick are drawn from secrets of both browsers, shown only after both have sent their orders. Both browsers hold the whole game, so live play is for friends.";
const button = (text, cls, go) => { const b = el("button", text, cls); b.type = "button"; b.onclick = go; return b; };
const closeSheet = () => { if ($("sheet").open) $("sheet").close(); };
const cap = (t) => `${t[0].toUpperCase()}${t.slice(1)}`;
const STYLE = { classic: "Traditional", ours: "Capo, The Ink Dries", custom: "Custom" }, MAP = { world: "the world map", continents: "a map of continents", islands: "a map of islands" }, RIVAL = { gentle: "gentle", even: "normal", hard: "hard" };
const about = (o) => `${STYLE[o.style] || "Real time"}${o.style === "ours" ? "" : `, on ${MAP[o.map] || o.map}, ${o.nations} nations`}, ${RIVAL[o.rivals] || o.rivals} rivals.`;

let T = null, game = null, wire = null, driver = 0, budget = 0, last = 0, hand = null, shown = "";
const useNetLine = () => (game ? handle(game).line() : "");
/** This browser's side in the live game with this seed, kept so a game brought back after a reload is played from the right seat. */
const keepSide = (seed, side) => { try { localStorage.setItem(SIDE_KEY, JSON.stringify({ seed, side })); } catch { /* the seat is then asked of the other browser */ } };
const sideOf = (seed) => { try { const k = JSON.parse(localStorage.getItem(SIDE_KEY) || "null"); return k?.seed === seed ? k.side : null; } catch { return null; } };

/** The live table for one game: made once, kept across dropped connections, so promised secrets stay promised. */
function lockFor(g) {
  g.lock ??= createLockstep({
    side: g.side, secret, game: inch, options: g.options, now: () => performance.now(),
    match: () => (g.m && T.match === g.m && !T.demo ? g.m : null), // the game on the table, while it is this one
    clock: (m) => m.position.phase === "play" && !m.position.over,
    play: (mv, salt) => { try { T.flow(mv, salt); return true; } catch (e) { if (e instanceof Refusal) return false; throw e; } },
    dealt: (seed) => { g.seed = seed; keepSide(seed, g.side); g.m = createMatch(inch, { seed, options: g.options }); T.begin(g.m, ["you"]); toast("Dealt live: both browsers drew the map together. Choose where to start."); },
    adopt: (save) => {
      const m = openSave(save, [inch]).match;
      if (canon(m.options) !== canon(g.options) || !m.seed.startsWith(DEALT)) throw new Refusal("live", "the other browser sent another game");
      g.seed = m.seed; g.m = m; keepSide(m.seed, g.side);
      T.begin(m, ["you"]);
      toast("Your browser took the game from your friend's, where it stands now.");
    },
    paused: (on, who) => { toast(on ? (who === g.side ? "You paused the clock for you both." : "Your friend paused the clock.") : who === g.side ? "The clock runs again." : "Your friend started the clock again."); T.refresh(); },
    stop: (text) => { end(); stopped(text); },
    note: (text) => toast(text),
  });
  return g.lock;
}

/** What the move panel asks of the live game (site/inchlive.js). */
function handle(g) {
  return {
    seat: g.seat,
    get alone() { return g.alone; },
    joined: () => !g.alone && !!g.lock?.up,
    order: (m) => { lockFor(g).order(m); if (!g.lock.up) toast("Your order waits until your friend's browser is joined again."); },
    pause: () => g.lock.control(g.lock.paused ? "go" : "pause"),
    paused: () => !!g.lock?.paused && !g.alone,
    line() {
      if (g.alone) return "Played on alone: your friend's nation stands still.";
      const l = g.lock;
      if (!l?.up) return wire && !wire.open ? "Joining your friend's browser..." : "Your friend's browser is not joined, so the clock waits for you both. Invite them back, or play on alone.";
      if (l.frame > 0 && performance.now() - (g.moved || 0) > 1500) return "Waiting for your friend's browser..."; // no frame played for a while: the other side is slow or gone
      const f = l.figures(), ms = f.lag || (DELAY + 1) * FRAME_MS;
      return `${l.paused ? "Paused. Either of you can start the clock again. " : ""}Live with your friend: your orders reach both maps in about ${ms < 950 ? `${Math.round(ms / 50) * 50} ms` : `${(ms / 1000).toFixed(1)} seconds`}.`;
    },
    offers() {
      if (g.alone) return [];
      if (g.lock?.stopped) return [["Play on alone", () => alone()]];
      if (g.lock?.up || (wire && !wire.open)) return [];
      return [["Invite your friend back", () => invite()], ["Play on alone", () => alone()]];
    },
  };
}

function end() {
  const w = wire;
  wire = null;
  clearInterval(driver); driver = 0;
  game?.lock?.detach();
  if (!w) return;
  clearTimeout(w.timer);
  try { w.dc?.close(); } catch { /* already closed */ }
  try { w.pc.close(); } catch { /* already closed */ }
}
/** Four frames a second, by this browser's clock; a frame the other side has not answered waits, and a short backlog is caught up. */
function drive() {
  clearInterval(driver);
  last = performance.now(); budget = 0;
  driver = setInterval(() => {
    const t = performance.now(), l = game?.lock;
    budget = Math.min(budget + (t - last) / FRAME_MS, DELAY + 2); last = t;
    while (l && budget >= 1 && l.step()) budget -= 1;
    if (l && l.frame !== game.at) { game.at = l.frame; game.moved = t; }
    const say = T.match?.position.people && !T.demo ? useNetLine() : "";
    if (say !== shown) { shown = say; T.refresh(); } // the panel's live line follows the connection, without drawing every beat
  }, 50);
}
function stopped(text) {
  const box = el("div", undefined, "stack");
  box.append(el("p", text), el("p", "The game stays here as it stands. Play on alone (your friend's nation stands still), or save it from the menu."), button("Play on alone", "main", () => { closeSheet(); alone(); }));
  sheet("Live play stopped", box);
  T.refresh();
}
function alone() {
  if (!game) return;
  end();
  game.alone = true;
  toast("Playing on alone. The clock is yours again; your friend's nation stands still.");
  T.refresh();
}
function noPath() {
  end();
  const box = el("div", undefined, "stack");
  box.append(el("p", "No direct path was found between the two browsers. About one pair of networks in five needs a relay, which this site does not have yet."));
  if (game?.seed && T.match?.seed === game.seed) box.append(el("p", "The game waits here as it stands. Try again, or play on alone."), button("Try again", "main", () => invite()), button("Play on alone", "quiet", () => { closeSheet(); alone(); }));
  else box.append(el("p", "Play on your own instead, or try again from another network."));
  sheet("Not joined", box);
}
function dropped() {
  if (!wire) return;
  end();
  toast("The live connection dropped. The clock waits for you both: invite your friend back from the move panel.");
  T.refresh();
}

function fresh() {
  end();
  const pc = new RTCPeerConnection({ iceServers: LIVE_ADDRESSES.map((a) => ({ urls: a.url })) });
  wire = { pc, dc: null, open: false, timer: 0, waiting: false };
  const w = wire;
  pc.addEventListener("connectionstatechange", () => {
    if (wire !== w) return;
    const s = pc.connectionState;
    if (s === "failed" || s === "closed") { if (w.open) dropped(); else noPath(); }
  });
  return pc;
}
function channel(dc) {
  const w = wire, g = game;
  w.dc = dc;
  dc.onopen = () => {
    if (wire !== w) return;
    clearTimeout(w.timer);
    w.open = true;
    useNet(handle(g));
    lockFor(g).attach((x) => { if (dc.readyState === "open") dc.send(JSON.stringify(x)); });
    closeSheet();
    drive();
    toast("Joined: your browsers talk straight to each other.");
    T.refresh();
  };
  dc.onmessage = (e) => {
    if (wire !== w || typeof e.data !== "string" || e.data.length > MOST) return;
    let x;
    try { x = JSON.parse(e.data); } catch { return; }
    try { g.lock.receive(x); } catch (err) { if (!(err instanceof Refusal)) throw err; end(); stopped(`${cap(err.message)}.`); }
  };
  dc.onclose = () => { if (wire === w && w.open) dropped(); };
}
/** The text to copy, with a Copy button and the field selected for a long press. */
function copyRow(url, what) {
  const t = el("textarea"), row = el("div", undefined, "go");
  t.value = url; t.rows = 3; t.readOnly = true; t.className = "paste"; t.setAttribute("aria-label", what); t.id = `live-${what}`;
  const c = button(`Copy the ${what}`, "main", async () => { try { await navigator.clipboard.writeText(url); c.textContent = "Copied"; } catch { t.select(); toast("Select the text and copy it."); } });
  row.append(c);
  if (navigator.share) row.append(button("Share", "quiet", () => navigator.share({ url }).catch(() => {})));
  return [t, row];
}

/** Invite a friend: to a new game on these rules (from a game of your own not yet begun), or back into the live game after a drop. */
async function invite() {
  if (!canLive()) { toast("This browser cannot play live."); return; }
  const p = T.match?.position;
  if (!p?.live) return;
  if (!p.people) game = { id: newId(), side: "host", seat: 0, options: { ...T.match.options, people: 2 }, seed: null, m: null, lock: null, alone: false };
  else if (!game || game.m !== T.match || game.alone || game.lock?.stopped) return;
  const g = game, box = el("div", undefined, "stack"), say = el("p", "Making the invitation...");
  box.append(say);
  sheet(g.seed ? "Invite your friend back" : "Play live with a friend", box, "Not now");
  const pc = fresh(), w = wire;
  channel(pc.createDataChannel("capo-inch", { ordered: true }));
  let url;
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    const terms = new TextEncoder().encode(canon({ v: V, options: g.options, seed: g.seed, side: g.side }));
    url = `${(await makeLink("inch", g.id, terms)).replace("#t=", "#i=")}&o=${blobOf(await makeLink("inch", g.id, await squeeze(pc.localDescription.sdp)))}`;
  } catch (e) { if (wire === w) { end(); say.textContent = e instanceof Refusal ? `${cap(e.message)}.` : "This browser could not make an invitation for live play."; } return; }
  if (wire !== w) return;
  w.waiting = true;
  const reply = el("textarea"), named = el("label", undefined, "stack"), status = el("p", "", "line");
  reply.rows = 2; reply.className = "paste"; reply.placeholder = "Paste the reply here"; reply.id = "live-reply-in";
  named.append(el("span", "The reply from your friend"), reply);
  say.textContent = g.seed ? "Send this invitation to your friend. Opening it brings their browser back into this game; their reply joins you again." : `Send this invitation to your friend: ${about(g.options)} Opening it on their side makes a reply link; when it comes back, open it or paste it here. The map is dealt by both browsers once you are joined.`;
  box.append(...copyRow(url, "invitation"), named, button("Join", "main", () => answered(reply.value, status)), status, el("small", PRIVACY), el("small", FAIR_RT));
  listen(status);
}
/** The reply has come back: join, or say so if no path is found. */
async function answered(text, status) {
  const w = wire;
  if (!w || w.open || !w.waiting) return false;
  const m = String(text).trim().match(/#a=([\w-]{12,60000})/);
  if (!m) { status.textContent = "That is not a reply to this invitation."; return false; }
  try {
    const l = readLink(`#t=${m[1]}`);
    if (l.id !== game.id) throw new Refusal("live", "that reply is for another game");
    const sdp = await unsqueeze(await l.open(""));
    w.waiting = false;
    await w.pc.setRemoteDescription({ type: "answer", sdp });
  } catch (e) { status.textContent = e instanceof Refusal ? `${cap(e.message)}.` : "That reply could not be read."; return false; }
  status.textContent = "Joining...";
  w.timer = setTimeout(() => { if (wire === w && !w.open) noPath(); }, OPEN);
  return true;
}
/** A reply opened in another tab of this browser is handed to the tab that is waiting for it. */
function listen(status) {
  if (typeof BroadcastChannel !== "function") return;
  hand?.close();
  hand = new BroadcastChannel(HAND);
  hand.onmessage = async (e) => { if (typeof e.data?.a === "string" && (await answered(e.data.a, status))) hand?.postMessage({ took: true }); };
}

/** Read an invitation link: { id, options, seed, side, o }, or a refusal. */
async function readInvite(i, o) {
  const l = readLink(`#t=${i}`);
  let t;
  try { t = JSON.parse(new TextDecoder().decode(await l.open(""))); } catch (e) { if (e instanceof Refusal) throw e; throw new Refusal("live", "that invitation is broken"); }
  if (t?.v !== V || !["host", "guest"].includes(t.side) || (t.seed !== null && (typeof t.seed !== "string" || !t.seed.startsWith(DEALT)))) throw new Refusal("live", "that invitation is from another version of this game");
  const options = readOptions(inch, t.options);
  if (options.people !== 2 || canon(options) !== canon(t.options)) throw new Refusal("live", "that invitation is not for a live game");
  return { id: l.id, options, seed: t.seed, side: t.side, o };
}
/** A page opened from an invitation. One for a game already open in another tab of this browser is handed to that tab. */
async function arrive(hash) {
  const m = String(hash).match(/^#i=([\w-]{12,60000})&o=([\w-]{12,60000})/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  let inv;
  try { inv = await readInvite(m[1], m[2]); } catch (e) { if (!(e instanceof Refusal)) throw e; sheet("Play live", el("p", `${cap(e.message)}.`)); return; }
  if (inv.seed && !(game?.seed === inv.seed) && typeof BroadcastChannel === "function") {
    const ch = new BroadcastChannel(INVITE);
    const took = await new Promise((done) => { ch.onmessage = (e) => { if (e.data?.took === inv.seed) done(true); }; ch.postMessage({ seed: inv.seed, i: m[1], o: m[2] }); setTimeout(() => done(false), 600); });
    ch.close();
    if (took) { sheet("Invitation handed over", el("p", "Your game in the other tab has the invitation. You can close this tab.")); return; }
  }
  ask(inv);
}
function ask(inv) {
  if (!canLive()) { sheet("Play live", el("p", "This browser cannot play live.")); return; }
  const back = !!inv.seed, box = el("div", undefined, "stack");
  box.append(el("p", back ? "Your friend asks you back into your live game of An Inch of Ink." : `Your friend asks you to play An Inch of Ink live with them, in real time: ${about(inv.options)} You each play a nation; the bots play the rest.`), el("small", PRIVACY), el("small", FAIR_RT));
  const row = el("div", undefined, "go"), go = button(back ? "Join again" : "Play live", "main", () => reply(inv, box));
  row.append(button("Not now", "quiet", () => closeSheet()), go);
  box.append(row);
  sheet(back ? "Join your friend again" : "Play live", box, null);
  go.focus();
}
async function reply(inv, box) {
  const side = inv.side === "host" ? "guest" : "host";
  if (!game || game.seed !== inv.seed || inv.seed === null || game.alone || game.lock?.stopped) game = { id: inv.id, side, seat: side === "host" ? 0 : 1, options: inv.options, seed: inv.seed, m: null, lock: null, alone: false };
  else game.id = inv.id;
  const g = game, pc = fresh(), w = wire, say = el("p", "Making your reply...");
  pc.addEventListener("datachannel", (e) => { if (wire === w) channel(e.channel); });
  box.replaceChildren(say);
  let url;
  try {
    const sdp = await unsqueeze(await readLink(`#t=${inv.o}`).open(""));
    await pc.setRemoteDescription({ type: "offer", sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    url = (await makeLink("inch", g.id, await squeeze(pc.localDescription.sdp))).replace("#t=", "#a=");
  } catch (e) { if (wire === w) { end(); say.textContent = e instanceof Refusal ? `${cap(e.message)}.` : "This browser could not answer the invitation."; } return; }
  if (wire !== w) return;
  say.textContent = "Send this reply to your friend. You are joined as soon as they open it.";
  box.append(...copyRow(url, "reply"), el("p", "Waiting for your friend...", "line"), button("Not now", "quiet", () => { end(); closeSheet(); }));
  w.timer = setTimeout(() => { if (wire === w && !w.open) noPath(); }, OPEN + GATHER);
}

/**
 * Wires live play into the real-time table: the panel's invitation, invitations arriving by link or from another tab, and the
 * live table for a game for two brought back by Continue or a saved file (played from the seat this browser had).
 */
export function inchPlay(table) {
  T = table;
  useInviter(() => invite());
  addEventListener("hashchange", () => arrive(location.hash));
  if (typeof BroadcastChannel === "function") {
    const ch = new BroadcastChannel(INVITE);
    ch.onmessage = (e) => { const x = e.data; if (typeof x?.seed === "string" && game?.seed === x.seed && T.match?.seed === x.seed && !T.demo) { ch.postMessage({ took: x.seed }); readInvite(x.i, x.o).then(ask, () => {}); } };
  }
  arrive(location.hash);
}
/** The table began a game: a game for two not yet known here gets its live table (joined later by an invitation), any other ends live play. */
export function begun(table) {
  const p = table.match?.position;
  if (!p?.people) { if (game && !table.demo) { end(); game = null; useNet(null); } return; }
  if (game?.seed === table.match.seed) {
    // the same game brought back as another copy (Continue, a file): this side's live table starts afresh, and the next join takes the friend's game
    if (game.m !== table.match) { end(); game.lock = null; game.m = table.match; }
    useNet(handle(game));
    return;
  }
  end();
  const side = sideOf(table.match.seed) || "host";
  game = { id: newId(), side, seat: side === "host" ? 0 : 1, options: table.match.options, seed: table.match.seed, m: table.match, lock: null, alone: false };
  useNet(handle(game));
}
