// SPDX-License-Identifier: AGPL-3.0-or-later
// The front page, in one dark blue (ruling 151): its footer, the folding menu,
// and the desk, where a real game of Brass and Banners is played by bots when the device can draw it (live.js).
// The board on the desk is a link into that game; its Pause button sits outside the link, in the caption.
import { footer } from "./footer.js";
import { VERSION } from "./config.js";

footer();

const $ = (id) => document.getElementById(id);
// guard() empties the page when it is shown inside another site; then there is nothing more to do
if ($("burger")) {
  document.documentElement.classList.add("js");
  $("version").textContent = `Version ${VERSION}`; // the front page names its version only; the build stamp is for the game pages
  menu();
  saved();
  desk();
}

/** A table game left unfinished in this browser is offered as "Continue": its own page will pick it up. */
function saved() {
  for (const a of document.querySelectorAll("a[data-save]")) {
    let kept = null;
    try { kept = localStorage.getItem(a.dataset.save); } catch { /* storage may be off */ }
    if (!kept) continue;
    a.lastChild.textContent = "Continue";
    a.setAttribute("aria-label", a.getAttribute("aria-label").replace("Play", "Continue"));
  }
}

/** On a narrow screen the page links fold behind a Menu button; choosing one, or Escape, folds them again. */
function menu() {
  const top = document.querySelector(".top"), burger = $("burger");
  const set = (open) => { top.classList.toggle("open", open); burger.setAttribute("aria-expanded", String(open)); };
  burger.hidden = false;
  burger.addEventListener("click", () => set(!top.classList.contains("open")));
  $("nav").addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && top.classList.contains("open")) { set(false); burger.focus(); } });
  document.addEventListener("click", (e) => { if (top.classList.contains("open") && !top.contains(e.target)) set(false); }); // a tap outside folds it too
}

/**
 * The live board. It starts only when the desk is on screen, the browser is idle, and the visitor has not asked for less
 * motion or less data; it rests whenever the desk is off screen or the tab is hidden; and it can always be paused.
 * Until it runs, and wherever it cannot, the still picture of the same board stays.
 */
function desk() {
  const stage = $("stage"), fig = stage.parentElement, say = $("live-say"), go = $("live-go"), still = say.textContent, calm = matchMedia("(prefers-reduced-motion: reduce)");
  let game = null, loading = false, seen = false, wanted = !calm.matches && !navigator.connection?.saveData, told = still;
  // the caption says Paused, not Live, while the visitor has paused it
  const tell = (text = told) => { told = text; say.textContent = game && !wanted ? text.replace(/^Live on this page/, "Paused") : text; };
  const sync = () => {
    const run = !!game && wanted && seen && !document.hidden;
    if (game) { if (run) game.start(); else game.stop(); go.textContent = wanted ? "Pause" : "Resume"; tell(); }
    fig.classList.toggle("on", run);
  };
  const gone = () => { game = null; stage.classList.remove("live"); go.hidden = true; tell(still); sync(); };
  const load = async () => {
    if (game || loading) return;
    loading = true;
    try { game = (await import("./live.js")).live(stage, tell, gone); } catch (e) { console.warn("The live board did not start:", e); }
    loading = false;
    go.hidden = !game; // where this device cannot draw it, the picture stays and nothing is offered
    if (!game) return;
    stage.classList.add("live");
    sync();
  };
  go.addEventListener("click", () => { wanted = game ? !wanted : true; if (game) sync(); else load(); });
  if (!wanted) go.hidden = false; // less motion or less data was asked for: the visitor may still choose to watch
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    if (seen && wanted && !game) (window.requestIdleCallback || setTimeout)(load, { timeout: 1500 });
    sync();
  }, { threshold: 0.2 }).observe(stage);
  document.addEventListener("visibilitychange", sync);
}
