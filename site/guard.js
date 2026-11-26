// SPDX-License-Identifier: AGPL-3.0-or-later
// A page shown inside another site's frame could be dressed up to mislead a player. It shows a plain link instead.
export function guard() {
  let framed = false;
  try { framed = window.top !== window.self; } catch { framed = true; }
  if (!framed) return;
  const p = document.createElement("p"), a = document.createElement("a");
  a.href = location.href; a.target = "_top"; a.rel = "noopener"; a.textContent = "Open this game in its own tab";
  p.append("This page cannot be shown inside another site. ", a);
  p.style.cssText = "margin:40px auto;max-width:30em;font:18px/1.5 Georgia,serif;color:#f1e9d6;text-align:center";
  document.body.replaceChildren(p);
  document.body.style.background = "#12171a";
}
