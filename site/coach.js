// SPDX-License-Identifier: AGPL-3.0-or-later
// The coach: a guided first game. A game gives a fixed seed, a short preset and a few steps. Each step points at a place
// on the board or a control, says one plain sentence, and goes on when the player does the thing (or presses Next, for a step
// that only tells). It can be ended at any time; once finished or ended it is not offered again, and the menu teaches again.

const make = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const press = (text, cls) => { const b = make("button", text, cls); b.type = "button"; return b; };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* offered again next visit */ } };
const kept = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/**
 * L: { seed, options, kinds, steps: [{ at(T) -> a cell, an element or nothing; or(T) -> the element for a cell out of sight; say: text or (T) -> text; when(T): shown only then;
 *      done(T, events): the player did it, even while not shown; pass(T, events): it can no longer be done, so it is left out; next: a step that only tells }] }
 * `events` are what the player's own moves did since the last look. go() starts the lesson's game.
 */
export function coach(T, L, key, go) {
  const KEY = `capo-${key}-coach`, steps = L.steps, box = make("aside", undefined, "panel"), head = make("p"), words = make("p"), row = make("div", undefined, "go");
  const stop = press("End the lesson", "quiet"), next = press("Next", "main"), ring = make("i"), say = make("p", "", "sr"), learn = press("New here? Learn by playing", "text");
  box.id = "coach"; box.hidden = ring.hidden = true; box.tabIndex = -1;
  box.setAttribute("aria-label", "Lesson");
  ring.id = "coach-ring"; ring.setAttribute("aria-hidden", "true");
  say.setAttribute("aria-live", "polite");
  row.append(stop, next); box.append(head, words, row);
  document.body.append(ring, box, say);
  document.getElementById("preset")?.after(learn);
  let on = false, match = null, at = 0, shown = -1, events = [], lit = null, loop = 0, offer = null, starting = false, aimed = [];

  const unlight = () => { lit?.classList.remove("coached"); lit = null; ring.hidden = true; };
  /** Put away; keys on the card go back to the move panel rather than nowhere. */
  const hide = () => { const had = box.contains(document.activeElement); box.hidden = true; unlight(); cancelAnimationFrame(loop); if (had) keys(document.getElementById("act"))?.focus({ preventScroll: true }); };
  function end(text) { on = false; shown = -1; offer = null; keep(KEY, "1"); hide(); say.textContent = text; }
  function start() { offer = null; on = true; at = 0; shown = -1; events = []; match = null; starting = true; try { go(); } finally { starting = false; } match = T.match; check(); }

  /** The lesson lives at the top of the move panel, so it never lies on the board or takes a tap meant for it. Only the offer floats, over the title. */
  function dock() {
    const act = document.getElementById("act"), handle = act?.querySelector(".tray");
    if (!act || box.parentNode === act) return;
    if (handle) handle.after(box); else act.prepend(box);
    box.style.left = box.style.top = "";
  }
  function float() { if (box.parentNode !== document.body) document.body.append(box); box.style.left = `${Math.round((innerWidth - box.offsetWidth) / 2)}px`; box.style.top = `${Math.round(Math.max(8, (innerHeight - box.offsetHeight) / 2))}px`; }
  /** A control the step asks for, in the move panel: scrolled into sight below the lesson, which stays at the panel's top. */
  function show(e) {
    const act = document.getElementById("act");
    if (!act || !act.contains(e) || act.scrollHeight <= act.clientHeight) return;
    const a = act.getBoundingClientRect(), r = e.getBoundingClientRect(), top = box.getBoundingClientRect().bottom + 8;
    if (r.bottom > a.bottom - 8) act.scrollTop += r.bottom - a.bottom + 8;
    else if (r.top < top) act.scrollTop -= top - r.top;
  }
  const keys = (e) => (!e?.getClientRects?.().length ? null : e.matches("button:not(:disabled), input, [tabindex='0']") ? e : ["[aria-checked=true]", "[tabindex='0']", "button.main:not(:disabled)", "button:not(:disabled):not([hidden]), input"].reduce((f, q) => f || e.querySelector(q), null));
  /** Follow what is pointed at: the board moves under the finger, panels grow and shrink. */
  function frame() {
    loop = 0;
    if (offer) { float(); return; }
    if (!on || box.hidden) return;
    if (T.demo || T.match !== match || !T.ready()) { hide(); return; }
    let target = aimed[0];
    unlight();
    if (typeof target === "number") {
      const p = T.board?.at?.(target), stage = document.getElementById("stage").getBoundingClientRect(), x = p && stage.left + p.x, y = p && stage.top + p.y, over = p && document.elementFromPoint(x, y);
      if (over?.closest("#stage")) { ring.style.left = `${Math.round(x - 26)}px`; ring.style.top = `${Math.round(y - 26)}px`; ring.hidden = false; }
      else target = aimed[1]; // out of sight, or no moving board: point at the list that does the same
    }
    if (target?.getClientRects?.().length) { lit = target; lit.classList.add("coached"); }
    loop = requestAnimationFrame(frame);
  }
  function draw() {
    const s = steps[at], open = T.ready() && T.match.turn !== null && (!s.when || s.when(T));
    if (!open) { hide(); return; }
    const text = typeof s.say === "function" ? s.say(T) : s.say, fresh = shown !== at, last = at === steps.length - 1;
    head.replaceChildren(make("b", "Lesson"), make("small", ` step ${at + 1} of ${steps.length}`));
    words.textContent = text;
    next.hidden = !s.next;
    next.textContent = last ? "Done" : "Next";
    stop.textContent = "End the lesson";
    stop.hidden = last && !!s.next; // Done says it
    dock();
    box.hidden = false;
    shown = at;
    aimed = [s.at?.(T), s.or?.(T)]; // asked once a look, followed every frame
    cancelAnimationFrame(loop);
    frame();
    if (!fresh) return;
    if (lit) show(lit);
    say.textContent = `Lesson, step ${at + 1} of ${steps.length}. ${text}`;
    // a step that only tells waits on Next; one that asks for a move puts the keys on its control, or on the list that mirrors the board,
    // but only when they were nowhere in particular: on the page, or on this card
    const lost = document.activeElement === document.body || box.contains(document.activeElement), [t, or] = aimed;
    if (s.next && !s.done) next.focus({ preventScroll: true });
    else if (at === 0 || lost) (keys(typeof t === "number" ? or || document.getElementById("act") : t) || box).focus({ preventScroll: true });
  }
  /** Look again: after every move and every change of what is chosen. */
  function check() {
    if (offer) { offer = null; next.onclick = step; box.hidden = true; } // a game began some other way: ask again at the next Play
    if (!on || !match) return;
    if (T.match !== match) { on = false; hide(); return; } // another game began: the lesson waits for the menu
    if (!T.ready()) { hide(); return; } // judged only on the player's own turn, with what their moves did meanwhile
    const ev = events;
    events = [];
    while (at < steps.length && (steps[at].pass?.(T, ev) || steps[at].done?.(T, ev))) at++;
    if (at >= steps.length) { end(fin); return; }
    draw();
  }

  const fin = "Lesson finished. Play on, or start a new game from the menu.";
  function step() { if (at >= steps.length - 1) end(fin); else { at++; check(); } }
  next.onclick = step;
  stop.onclick = () => (offer ? offer() : end("Lesson ended. Teach me again is in the menu."));
  learn.onclick = start;
  box.addEventListener("keydown", (e) => { if (e.key === "Escape" && offer) { e.stopPropagation(); offer(); } });
  addEventListener("resize", () => { if (!box.hidden) { cancelAnimationFrame(loop); frame(); } });

  return {
    start,
    /** The first Play: offer the lesson once, before the game it was going to start. True when it was offered. */
    first(play) {
      if (kept(KEY)) return false;
      offer = () => { next.onclick = step; end(""); play(); };
      head.replaceChildren(make("b", "New here?"));
      words.textContent = "A short guided game teaches you by playing, one step at a time.";
      stop.textContent = "Just play";
      stop.hidden = false;
      next.textContent = "Learn by playing";
      next.hidden = false;
      next.onclick = () => { next.onclick = step; start(); };
      box.hidden = false;
      float();
      next.focus({ preventScroll: true });
      say.textContent = `New here? ${words.textContent}`;
      return true;
    },
    /** The lesson's own game is not kept over a game in this browser. */
    owns: () => starting || (!!match && T.match === match),
    seen(ev, person) { if (on && person) events.push(...ev); },
    check,
  };
}
