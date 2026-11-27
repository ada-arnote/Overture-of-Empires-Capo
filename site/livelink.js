// SPDX-License-Identifier: AGPL-3.0-or-later
// Live play by two pasted links (ruling 155; option A of the servers paper). A game by link is upgraded: its invitation is the
// game's own link with a WebRTC offer added, the friend's page answers with a reply link, and the two browsers then talk straight
// to each other over a data channel. No server of ours is involved; the one outside address is the STUN service in config.js,
// reached only after a player asks for live play. If no direct path is found, nothing is lost: the game goes on by links.
// The rules of the exchange (dealing, salted dice, checks, catching up) are in src/core/session.js.
import { Refusal, createMatch, createSession, openSave, packGame } from "../src/core/index.js";
import { LIVE_ADDRESSES } from "./config.js";
import { makeLink, readLink } from "./link.js";

const GATHER = 4000, OPEN = 25000, SHAKY = 7000, HAND = "capo-live-reply", MOST = 2000000;
export const canLive = () => typeof RTCPeerConnection === "function" && !!globalThis.crypto?.getRandomValues;
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const secret = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const join = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
/** A session description, made small: deflated where the browser can (first byte 1), else as it is (0). */
async function squeeze(text) {
  const raw = new TextEncoder().encode(text);
  return typeof CompressionStream === "function" ? join([1], await pipe(raw, new CompressionStream("deflate-raw"))) : join([0], raw);
}
async function unsqueeze(b) {
  if (b[0] === 0) return new TextDecoder().decode(b.subarray(1));
  if (b[0] !== 1 || typeof DecompressionStream !== "function") throw new Refusal("live", "this browser cannot read that invitation");
  try { return new TextDecoder().decode(await pipe(b.subarray(1), new DecompressionStream("deflate-raw"))); } catch { throw new Refusal("live", "that invitation is broken or not complete"); }
}
/** Wait until the browser has found its addresses, or a few seconds: a slow or blocked STUN service only loses the outside address. */
const gathered = (pc) => new Promise((done) => {
  if (pc.iceGatheringState === "complete") { done(); return; }
  const t = setTimeout(done, GATHER);
  pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); done(); } });
});
const blobOf = (url) => url.slice(url.indexOf("#t=") + 3);

export const PRIVACY = "Live play joins your browser straight to your friend's. To find the way, each browser asks a public address service (stun.cloudflare.com) for its own internet address; nothing about the game goes there. Your friend's browser sees your internet address, and the invitation and the reply carry it, so send them only to the person you play with.";
export const FAIR = "Every move is checked by the rules in both browsers, and nobody can peek at the dice: each roll is drawn from secrets of both browsers, shown only after the move is sent. Both browsers hold the whole game, so among friends all is well, but a changed browser could see hidden cards.";

/**
 * The table's side of live play. t: { T, G, begin, sheet, closeSheet, toast, el, names, send }; send is the move panel's link box.
 * Returns what table.js asks: arrive(hash), begun(), box(), and T.live: on(), waits(seat), salt(move, n).
 */
export function liveLink({ T, G, begin, sheet, closeSheet, toast, el, names, send }) {
  const sessions = new Map(); // by link id: a session outlives a dropped connection, so promised secrets stay promised
  let wire = null, offerIn = null, chain = Promise.resolve(), hand = null, shaky = 0;
  const button = (text, cls, go) => { const b = el("button", text, cls); b.type = "button"; b.onclick = go; return b; };
  const mySeat = () => T.kinds.indexOf("you");
  const sideOf = () => (T.link?.roles[mySeat()] === "host" ? "host" : "guest");
  const other = () => { const s = T.link.roles.findIndex((r, i) => (r === "host" || r === "friend") && T.kinds[i] === "away"); return s < 0 ? "your friend" : names[s]; };
  /** Live play needs a game by link between this browser and one other, played by turns. */
  const fits = () => !!T.link && !T.demo && !T.realtime() && T.link.roles.filter((r) => r === "friend").length === 1 && mySeat() >= 0 && (sideOf() === "host" || T.link.roles[mySeat()] === "friend");
  // joined: from the moment the channel opens, so the table holds its moves until both sides stand at the same move
  const on = () => !!wire?.open && !!wire.session;
  async function inStep() {
    while (on() && !wire.session.up()) await new Promise((r) => setTimeout(r, 40));
    if (!on()) throw new Refusal("down", "the live connection dropped");
  }

  function sessionFor(id) {
    if (sessions.has(id)) return sessions.get(id);
    const side = sideOf(), s = createSession({
      side, secret,
      owns: (seat) => (side === "host" ? T.link.roles[seat] !== "friend" : seat === mySeat()),
      // a move from the other side waits for the table to finish showing the last one
      moved: (mv) => { chain = chain.then(async () => { while (T.busy || T.catching) await new Promise((r) => setTimeout(r, 40)); await T.play(mv); }).catch((e) => { end(); fallback(e instanceof Refusal ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : "A move from the other browser could not be played here, so live play stopped."); }); },
      dealt: (seed) => { begin(createMatch(G.game, { seed, options: T.match.options }), T.kinds, { ...T.link, floor: 0 }); toast("Dealt live: both browsers drew the deal together."); },
      adopt: (m) => { const from = T.match.list.length, copy = openSave(m.save(), [G.game]).match; begin(copy, T.kinds, { ...T.link, floor: copy.list.length }, from); },
      trouble: (text, stop) => { if (stop) { end(); fallback(text); } else toast(text); },
    });
    sessions.set(id, s);
    return s;
  }

  function end() {
    const w = wire;
    wire = null;
    clearTimeout(shaky);
    if (!w) return;
    w.session?.detach();
    try { w.dc?.close(); } catch { /* already closed */ }
    try { w.pc.close(); } catch { /* already closed */ }
  }
  /** No live table: say why, and carry on by links. */
  function fallback(why) {
    const box = el("div", undefined, "stack");
    box.append(el("p", why), el("p", "The game goes on by links, as before: when it is your friend's turn, the move panel offers the link to send."));
    sheet("Playing by links", box);
    if (T.link && !T.demo) begin(T.match, T.kinds, T.link); // the table picks up link play where it stands
  }
  function dropped() {
    if (!wire) return;
    end();
    toast("The live connection dropped. Play goes on by links; to join again, choose Play live in Link play.");
    if (T.link && !T.demo) begin(T.match, T.kinds, T.link);
  }
  function watch(pc) {
    pc.addEventListener("connectionstatechange", () => {
      if (wire?.pc !== pc) return;
      const s = pc.connectionState;
      if (s === "connected") clearTimeout(shaky);
      else if (s === "disconnected") { clearTimeout(shaky); shaky = setTimeout(() => { if (wire?.pc === pc && pc.connectionState !== "connected") dropped(); }, SHAKY); }
      else if (s === "failed" || s === "closed") {
        if (wire.open) dropped();
        else { end(); fallback("No direct path was found between the two browsers. About one pair in five needs a relay, which this site does not have yet."); }
      }
    });
  }
  function channel(dc) {
    const w = wire;
    w.dc = dc;
    dc.onopen = () => {
      if (wire !== w) return;
      clearTimeout(w.timer);
      w.open = true;
      w.session = sessionFor(T.link.id);
      w.session.start(T.match);
      w.session.attach((x) => { if (dc.readyState === "open") dc.send(JSON.stringify(x)); });
      closeSheet();
    };
    dc.onmessage = (e) => {
      if (wire !== w || typeof e.data !== "string" || e.data.length > MOST) return;
      let x;
      try { x = JSON.parse(e.data); } catch { return; }
      const was = w.session.up();
      try {
        w.session.receive(x);
        if (!was && w.session.up()) { toast(`Live with ${other()}: your browsers are joined directly.`); T.refresh(); } // both sides now stand at the same move
      } catch (err) { if (!(err instanceof Refusal)) throw err; end(); fallback("The other browser sent something the rules do not allow, so live play stopped."); }
    };
    dc.onclose = () => { if (wire === w && w.open) dropped(); };
  }
  function fresh() {
    end();
    const pc = new RTCPeerConnection({ iceServers: LIVE_ADDRESSES.map((a) => ({ urls: a.url })) });
    wire = { pc, dc: null, id: T.link.id, open: false, session: null, timer: 0 };
    watch(pc);
    return pc;
  }
  /** The text to copy, with a Copy button and the field selected for a long press. */
  function copyRow(url, what) {
    const t = el("textarea"), row = el("div", undefined, "go");
    t.value = url; t.rows = 3; t.readOnly = true; t.className = "paste"; t.setAttribute("aria-label", what);
    const c = button(`Copy the ${what}`, "main", async () => { try { await navigator.clipboard.writeText(url); c.textContent = "Copied"; } catch { t.select(); toast("Select the text and copy it."); } });
    row.append(c);
    if (navigator.share) row.append(button("Share", "quiet", () => navigator.share({ url }).catch(() => {})));
    return [t, row];
  }

  /** This browser invites: the game's link with an offer added. */
  async function invite() {
    if (!fits() || !canLive()) return;
    const box = el("div", undefined, "stack"), say = el("p", "Making the invitation...");
    box.append(say);
    sheet("Play live", box, "Not now");
    const pc = fresh(), w = wire;
    channel(pc.createDataChannel("capo", { ordered: true }));
    let url;
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const pass = T.link.pass, game = await makeLink(G.key, T.link.id, packGame(T.match, T.link.roles, T.look), pass);
      url = `${game}&o=${blobOf(await makeLink(G.key, T.link.id, await squeeze(pc.localDescription.sdp), pass))}`;
    } catch (e) { if (wire === w) { end(); say.textContent = e instanceof Refusal ? `${e.message}.` : "This browser could not make an invitation for live play."; } return; }
    if (wire !== w) return;
    w.waiting = true;
    const reply = el("textarea"), named = el("label", undefined, "stack"), status = el("p", "", "line");
    reply.rows = 2; reply.className = "paste"; reply.placeholder = "Paste the reply here";
    named.append(el("span", `The reply from ${other()}`), reply);
    say.textContent = `Send this invitation to ${other()}. Opening it on their side makes a reply link; when it comes back, open it or paste it here.`;
    box.append(...copyRow(url, "invitation"), named, button("Join", "main", () => answered(reply.value, status)), status, el("small", PRIVACY));
    listen(status);
  }
  /** The reply has come back: join, or fall back to links if no path is found. */
  async function answered(text, status) {
    const w = wire;
    if (!w || w.open || !w.waiting) return false;
    const m = String(text).trim().match(/#a=([\w-]{12,60000})/);
    if (!m) { status.textContent = "That is not a reply to this invitation."; return false; }
    try {
      const l = readLink(`#t=${m[1]}`);
      if (l.id !== w.id) throw new Refusal("live", "that reply is for another game");
      const sdp = await unsqueeze(await l.open(T.link.pass));
      w.waiting = false;
      await w.pc.setRemoteDescription({ type: "answer", sdp });
    } catch (e) { status.textContent = e instanceof Refusal ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : "That reply could not be read."; return false; }
    status.textContent = "Joining...";
    w.timer = setTimeout(() => { if (wire === w && !w.open) { end(); fallback("No direct path was found between the two browsers. About one pair in five needs a relay, which this site does not have yet."); } }, OPEN);
    return true;
  }
  /** A reply opened in another tab of this browser is handed to the tab that is waiting for it. */
  function listen(status) {
    if (typeof BroadcastChannel !== "function") return;
    hand?.close();
    hand = new BroadcastChannel(HAND);
    hand.onmessage = async (e) => { if (typeof e.data?.a === "string" && (await answered(e.data.a, status))) hand?.postMessage({ took: true }); };
  }

  /** This browser was invited: after the game is open, offer to answer. */
  function answerPrompt() {
    const o = offerIn;
    offerIn = null;
    const box = el("div", undefined, "stack"), say = el("p", `${other()} asks to play this game live, straight between your two browsers.`);
    if (!canLive()) { box.append(say, el("p", "This browser cannot play live. The game goes on by links.")); sheet("Play live", box); return; }
    box.append(say, el("small", PRIVACY), el("small", FAIR));
    const go = button("Play live", "main", () => reply(o.o, box, say)), no = button("By links instead", "quiet", () => { end(); closeSheet(); });
    const row = el("div", undefined, "go");
    row.append(no, go);
    box.append(row);
    sheet("Play live", box, null);
    go.focus();
  }
  async function reply(o, box, say) {
    const pc = fresh(), w = wire;
    pc.addEventListener("datachannel", (e) => { if (wire === w) channel(e.channel); });
    box.replaceChildren(say);
    say.textContent = "Making your reply...";
    let url;
    try {
      const sdp = await unsqueeze(await readLink(`#t=${o}`).open(T.link.pass));
      await pc.setRemoteDescription({ type: "offer", sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      const at = await makeLink(G.key, T.link.id, await squeeze(pc.localDescription.sdp), T.link.pass);
      url = at.replace("#t=", "#a=");
    } catch (e) { if (wire === w) { end(); say.textContent = e instanceof Refusal ? `${e.message[0].toUpperCase()}${e.message.slice(1)}.` : "This browser could not answer the invitation. The game goes on by links."; } return; }
    if (wire !== w) return;
    say.textContent = `Send this reply to ${other()}. The game starts live as soon as they open it.`;
    box.append(...copyRow(url, "reply"), el("p", `Waiting for ${other()}...`, "line"), button("Play by links instead", "quiet", () => { end(); closeSheet(); }));
  }

  const offer = button("Play live instead", "quiet", () => invite());
  offer.hidden = true;
  send?.append(offer);
  T.live = {
    on,
    /** The table waits for the other browser to play this seat (the host plays the bots). */
    waits: (seat) => on() && wire.session.waits(seat),
    salt: async (mv, n) => { await inStep(); return wire.session.salt(mv, n); },
  };
  return {
    /** A page opened from a link. A reply is handed to the waiting tab; an invitation is kept until its game is open. */
    arrive(hash) {
      const a = hash.match(/^#a=([\w-]{12,60000})/);
      if (a) {
        if (typeof BroadcastChannel !== "function") { sheet("A reply for live play", el("p", "Paste this reply into the game that sent the invitation.")); return true; }
        const ch = new BroadcastChannel(HAND);
        let took = false;
        ch.onmessage = (e) => { if (e.data?.took) { took = true; ch.close(); sheet("Reply handed over", el("p", "Your game in the other tab has the reply and is joining. You can close this tab.")); } };
        ch.postMessage({ a: hash });
        setTimeout(() => { if (took) return; ch.close(); sheet("A reply for live play", el("p", "No game in this browser is waiting for this reply. Paste it into the game that sent the invitation, in the Play live window.")); }, 1500);
        return true;
      }
      const o = hash.match(/^#t=([\w-]{12,60000})&o=([\w-]{12,60000})/);
      if (o) { try { offerIn = { id: readLink(`#t=${o[1]}`).id, o: o[2] }; } catch { offerIn = null; } }
      return false;
    },
    /** The table has begun a game. */
    begun() {
      if (wire && wire.id !== T.link?.id) end(); // another game: the live table was for the last one
      offer.hidden = !fits() || !canLive();
      if (offerIn && T.link?.id === offerIn.id && !T.demo && fits()) setTimeout(answerPrompt, 0);
      else if (offerIn && T.link?.id === offerIn.id) offerIn = null;
    },
    /** The Link play tab's part. */
    box() {
      if (!T.link || T.demo) return [];
      if (on()) return [el("p", `Live with ${other()}: your browsers are joined directly, and every move goes across at once.`), button("Leave live play", "quiet", () => { end(); closeSheet(); fallback("You left live play."); })];
      if (!fits()) return T.realtime() ? [el("p", "Live play is for games by turns. A game on the clock goes by links for now.")] : [];
      if (!canLive()) return [el("p", "This browser cannot play live.")];
      return [el("p", `Play live: join your browser straight to ${other()}'s, so every move goes across at once. ${FAIR}`), button("Play live", "quiet", invite)];
    },
  };
}
