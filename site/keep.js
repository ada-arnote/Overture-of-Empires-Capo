// SPDX-License-Identifier: AGPL-3.0-or-later
// Capo's save, kept so that it cannot fill the browser without saying so. The rules of it are in
// src/story/keep.js; this file does the measuring, the writing, the warning and the file.
// keeper(key, x) -> {save(state, past) -> past, rows(state, past) -> elements for the Game sheet, file(state), state()}.
// x is what the game page lends: {el, button, toast}.
import { ROOM, compact, compactNote, pressure, sizeWords } from "../src/story/keep.js";
import { RULES } from "../src/story/check.js";

const PROMISE = `The save promise: this game is saved under rules version ${RULES}. Until launch one a save may end when the rules version changes; this build brings older games up to date where it can, and says so. From launch one, a game saved under the previous rules version will always load.`;

// a browser that keeps nothing (storage switched off) gives a store that refuses every write, so the page says so
const CLOSED = { length: 0, key: () => null, getItem: () => null, setItem: () => { throw new Error("closed"); } };
const own = () => { try { return globalThis.localStorage || CLOSED; } catch { return CLOSED; } };

export function keeper(key, x, store = own()) {
  const st = { size: 0, other: 0, pc: 0, warn: false, failed: false, note: "", warned: false, count: 0, filed: 0 };
  let bar = null;
  // everything else this site keeps in this browser: other games, opened scenarios, settings
  const others = () => { let n = 0; try { for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k !== key) n += k.length + (store.getItem(k) || "").length; } } catch { /* a closed store measures as empty */ } return n; };
  const file = (state) => { const a = x.el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: "application/json" })); a.download = `capo-${state.player}-turn-${state.turn}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); st.filed = state.turn; banner(state); };
  /** A bar across the top while the game is not saved: it stays until a save works. */
  function banner(state) {
    bar?.remove(); bar = null;
    if (!st.failed || typeof document === "undefined") return;
    bar = x.el("div", undefined, "glass"); bar.id = "unsaved"; bar.setAttribute("role", "alert");
    Object.assign(bar.style, { position: "fixed", left: "8px", right: "8px", top: "72px", zIndex: 9, padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", borderColor: "var(--danger)" });
    bar.append(x.el("b", "Not saved."), x.el("span", st.filed === state.turn ? "This browser has no room for the game. Your file holds it up to this turn; save again after the next." : "This browser has no room for the game, so closing the page would lose it. Save it to a file now."), x.button("Save to a file", () => file(state), "go"));
    document.body.append(bar);
  }
  const write = (state, past) => { const text = JSON.stringify({ state, past }); store.setItem(key, text); return text.length; };
  /** Save the game. Returns the take-back records to keep (fewer when room had to be made). */
  function save(state, past) {
    if (st.count++ % 20 === 0 || st.failed) st.other = others();
    let size = JSON.stringify({ state, past }).length, p = pressure(size + key.length, st.other), done = 0, ok = false;
    const shrink = (step) => { const c = compact(state, past, step); past = c.past; done = step; st.note = compactNote(c) || st.note; };
    if (p.step) shrink(1);
    for (;;) {
      try { size = write(state, past); ok = true; break; } catch { if (done >= 2) break; shrink(done + 1); }
    }
    p = pressure(size + key.length, st.other);
    const was = st.failed;
    Object.assign(st, { size, pc: p.pc, warn: p.warn, failed: !ok });
    if (!ok) { if (!was) x.toast("Not saved: this browser has no room left. Save the game to a file now."); banner(state); }
    else {
      if (was) { banner(state); x.toast("Saved again."); }
      if (done && st.note !== st.told) x.toast(st.told = st.note);
      else if (p.warn && !st.warned) x.toast(`This site's games fill ${p.pc} in 100 of the room this browser gives it. Open Game to save to a file and see what is kept.`);
      st.warned = p.warn;
    }
    return past;
  }
  /** The Game sheet's storage part: the size, the room, what happens when it runs short, and the file. */
  function rows(state, past) {
    const { el, button } = x, meter = el("meter"), r = el("div", undefined, "row"), short = state.log.filter((t) => t.short).length;
    Object.assign(meter, { min: 0, max: 100, low: ROOM.warn, high: ROOM.tight, optimum: 0, value: Math.min(100, st.pc) }); meter.style.width = "100%"; meter.setAttribute("aria-label", `Room used in this browser: ${st.pc} in 100`);
    r.append(button("Save to a file", () => file(state), st.warn || st.failed ? "go" : "plain"));
    return [el("h3", "Storage"),
      ...(st.failed ? [el("p", "Not saved: this browser has no room left for the game. Save it to a file now; the file holds everything.", "warn")] : []),
      el("p", `This game: ${sizeWords(st.size)}, holding ${state.log.length} turn${state.log.length === 1 ? "" : "s"}${short ? ` (${short} in short)` : ""} and ${past.length} take-back${past.length === 1 ? "" : "s"}. Everything this site keeps in this browser: ${sizeWords(st.size + st.other)} of about ${sizeWords(ROOM.allow)}, ${st.pc} in 100.`, "note"), meter,
      ...(st.warn && !st.failed ? [el("p", `More than half the room is used${st.other > st.size ? ", most of it by other games and scenarios kept on this site" : ""}. Save to a file to keep every turn whole.`, "warn")] : []),
      ...(st.note ? [el("p", st.note, "note")] : []),
      el("p", "At three quarters full, turns older than the newest 20 are kept in short (what the rules decided and one sentence), take-backs fall to 5 and each chat keeps its newest 30 messages. If the browser still refuses the game, the page says so and stays saying so. A file always holds the game as it is now.", "note"), r,
      el("p", PROMISE, "note")];
  }
  if (typeof addEventListener === "function") addEventListener("beforeunload", (e) => { if (st.failed) { e.preventDefault(); e.returnValue = ""; } });
  return { save, rows, file, state: () => st };
}
