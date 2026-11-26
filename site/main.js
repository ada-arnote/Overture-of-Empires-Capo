// SPDX-License-Identifier: AGPL-3.0-or-later
// The front page: its footer, the lantern (daylight or lamplight, kept in this browser) and the threads on Coda's board.
import { footer } from "./footer.js";

footer();

const root = document.documentElement, lantern = document.getElementById("lantern"), dusk = matchMedia("(prefers-color-scheme: dark)");
// guard() empties the page when it is shown inside another site; then there is nothing more to do
if (lantern) {
  const night = () => (root.dataset.theme ? root.dataset.theme === "dark" : dusk.matches);
  const show = () => lantern.setAttribute("aria-pressed", String(night()));
  try { const kept = localStorage.getItem("capo-tent-theme"); if (kept === "dark" || kept === "light") root.dataset.theme = kept; } catch { /* storage may be off */ }
  show();
  dusk.addEventListener("change", show);
  lantern.addEventListener("click", () => {
    const next = night() ? "light" : "dark";
    root.dataset.theme = next;
    show();
    try { localStorage.setItem("capo-tent-theme", next); } catch { /* kept for this visit only */ }
  });
  threads();
}

/** Red thread from the middle paper's pin to every other pin, behind the papers. Decoration only. */
function threads() {
  const pins = document.getElementById("pins"), svg = document.getElementById("threads"), NS = "http://www.w3.org/2000/svg";
  const draw = () => {
    const r = pins.getBoundingClientRect(), at = [];
    for (const el of pins.querySelectorAll(".pinned")) {
      if (!el.offsetParent) continue;
      const b = el.getBoundingClientRect();
      at.push([b.left + b.width / 2 - r.left, b.top + 11 - r.top]);
    }
    svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    const line = (a, b) => {
      const p = document.createElementNS(NS, "path"), sag = 10 + Math.abs(a[0] - b[0]) * 0.06, f = (n) => n.toFixed(1);
      p.setAttribute("d", `M${f(a[0])} ${f(a[1])}Q${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2 + sag)} ${f(b[0])} ${f(b[1])}`);
      return p;
    };
    const lines = at.slice(1).map((p) => line(at[0], p));
    if (at.length > 4) lines.push(line(at[1], at[3]), line(at[2], at[4]));
    svg.replaceChildren(...lines);
  };
  draw();
  if (window.ResizeObserver) new ResizeObserver(draw).observe(pins);
  document.fonts?.ready.then(draw);
}
