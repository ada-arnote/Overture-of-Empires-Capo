// SPDX-License-Identifier: AGPL-3.0-or-later
// The content floor's last parts (road map 5, decision 9): one accept step before a first story game, "Fiction" on
// newspapers and on anything copied out of the story, and one sentence that each AI service's own rules bind the
// player's key. Text here is a draft for the owner's review.
const KEY = "capo-accept-1";
let said = false;

/** The one sentence on AI services, shown at the accept step and beside the AI settings. */
export const AI_RULES = "Each AI service has rules of its own, and they bind your key: what a service refuses, Capo cannot ask of it.";
/** What is added to anything copied out of the story. */
export const FICTION_MARK = "Fiction, from a game of Capo. Not news and not a forecast.";

/** Whether this browser has accepted (or this visit has, when the browser keeps nothing). */
export function accepted() {
  if (said) return true;
  try { return (said = localStorage.getItem(KEY) === "1"); } catch { return false; }
}

/**
 * The accept step, drawn in the start panel: what the story game is, the one line it never crosses, where words
 * go, and a tick that the player is an adult. x: {el, button, toast, box, shell}. then() runs once accepted.
 */
export function acceptStep(x, then, back) {
  const { el, button } = x, tick = Object.assign(el("input"), { type: "checkbox", id: "accept-adult" }), label = el("label"), row = el("div", undefined, "row"), list = el("ul", undefined, "list");
  label.append(tick, " I am 18 or older, and I understand that this is fiction."); label.style.display = "block"; label.style.margin = "12px 0";
  for (const t of [
    "Capo's story game is fiction for adults. Its wars, leaders and newspapers are made up as you play, by the rules and by an AI you choose. None of it is news or a forecast, and real public figures may appear in it as characters.",
    "It can be as dark as history is. One line is never crossed: nothing sexual involving minors. The game refuses it on the way in and on the way out.",
    "Your game is kept in this browser and nowhere else. What you write goes to the AI service you connect, and only there.",
    AI_RULES,
  ]) { const li = el("li"); li.append(el("span", t)); list.append(li); }
  const go = button("Accept and begin", () => {
    if (!tick.checked) return x.toast("Tick the box to say you are 18 or older.");
    said = true; try { localStorage.setItem(KEY, "1"); } catch { /* asked again next visit */ }
    then();
  }, "go");
  row.append(go, ...(back ? [button("Back", back)] : []));
  const head = el("h2", "Before your first story"); head.tabIndex = -1;
  x.box.replaceChildren(el("p", "Overture of Empires", "eyebrow"), el("h1", "Capo"), head, list, label, row);
  x.shell.classList.remove("min"); x.shell.classList.add("open");
  head.focus({ preventScroll: true });
}

/** A small "Fiction" label for a newspaper or anything else that could be taken for the real thing. */
export function fictionTag(el) {
  const t = el("span", "Fiction");
  Object.assign(t.style, { display: "inline-block", marginRight: "6px", padding: "1px 6px", border: "1px solid currentColor", borderRadius: "3px", font: "700 11px/1.5 var(--sans)", letterSpacing: ".08em", textTransform: "uppercase" });
  return t;
}

/** Anything copied out of the story's panels carries the mark with it. Typing in a field is left alone. */
export function fictionCopy(doc = document) {
  doc.addEventListener("copy", (e) => {
    const sel = doc.getSelection(), text = String(sel || ""), at = sel?.anchorNode, node = at?.nodeType === 1 ? at : at?.parentElement;
    if (!text.trim() || !e.clipboardData || e.target?.closest?.("input, textarea") || !node?.closest?.("#sheet, #card")) return;
    e.clipboardData.setData("text/plain", `${text}\n\n${FICTION_MARK}`);
    e.preventDefault();
  });
}
