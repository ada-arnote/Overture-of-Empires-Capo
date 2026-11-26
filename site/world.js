// SPDX-License-Identifier: AGPL-3.0-or-later
// A first look at the world province map that Capo's story worlds will be played on.
import { loadWorld, worldMap } from "./worldmap.js";

const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };

async function start() {
  let world;
  try { world = await loadWorld("../maps/world.json"); } catch (e) { $("note").textContent = `${e.message} It needs the web address, not a file opened by double-click.`; return; }
  $("note").remove();
  let chosen = null;
  const card = $("card");
  const choose = (p) => {
    chosen = p?.id || null;
    if (!p) { card.style.display = "none"; return; }
    const near = el("div", undefined, "near");
    for (const id of world.neighbours.get(p.id)) { const n = world.provinces.get(id), b = el("button", n.name); b.type = "button"; b.onclick = () => { choose(n); map.show(n.id); }; near.append(b); }
    card.replaceChildren(el("h2", p.name), el("p", `${world.countries[p.country] || p.country}. Id ${p.id}${p.members.length > 1 ? `, made of ${p.members.length} smaller provinces` : ""}.`), el("p", near.children.length ? "Borders by land:" : "No land borders: reached by sea."), near);
    card.style.display = "block";
  };
  const map = worldMap($("map"), world, { owner: (id) => world.provinces.get(id).country, pick: choose, picked: () => chosen });
  $("in").onclick = () => map.zoomBy(1.6);
  $("out").onclick = () => map.zoomBy(1 / 1.6);
  $("home").onclick = () => { choose(null); map.reset(); };
  const names = new Map();
  for (const p of world.provinces.values()) names.set(`${p.name}, ${world.countries[p.country] || p.country}`, p.id);
  for (const [code, name] of Object.entries(world.countries)) {
    const big = [...world.provinces.values()].filter((p) => p.country === code).sort((a, b) => (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) - (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]))[0];
    if (big) names.set(name, big.id);
  }
  $("names").append(...[...names.keys()].sort().map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
  $("find").addEventListener("change", (e) => { const id = names.get(e.target.value); if (id) { choose(world.provinces.get(id)); map.show(id); e.target.blur(); } });
}
start();
