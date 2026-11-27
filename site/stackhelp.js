// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game's helper in a worker (site/stackbot.js): the bots from step 3 up, hints and reviews think there, held to
// counts of positions, so the result is the same as on the page. A page that cannot start a worker (opened as a file, an
// old browser) does the same work itself in short slices between frames.
// stacking hook: the built page carries the worker's code in BOT_CODE (tools/bundle.mjs); the source page loads stackbot.js.
const BOT_CODE = "";
let helper, n = 0;
const waiting = new Map();

function start() {
  if (helper !== undefined) return helper;
  helper = null;
  try {
    if (typeof Worker !== "function") return null;
    const url = BOT_CODE ? URL.createObjectURL(new Blob([BOT_CODE], { type: "text/javascript" })) : new URL("stackbot.js", document.baseURI).href;
    // the page keeps Trusted Types: the only address this policy passes is the helper's own
    const policy = globalThis.trustedTypes?.createPolicy?.("stacking-helper", { createScriptURL: (u) => (u === url ? u : "") });
    const w = new Worker(policy ? policy.createScriptURL(url) : url, BOT_CODE ? undefined : { type: "module" });
    w.onmessage = (e) => { const r = waiting.get(e.data.id); waiting.delete(e.data.id); if (r) { if (e.data.fail) r.no(new Error(e.data.fail)); else r.ok(e.data.out); } };
    w.onerror = (e) => { e.preventDefault?.(); helper = null; w.terminate(); for (const r of waiting.values()) r.no(new Error("the helper stopped")); waiting.clear(); };
    helper = w;
  } catch { helper = null; }
  return helper;
}
/** A job for the worker: a promise of its answer, or null when there is no worker. */
export function ask(job) {
  const w = start();
  if (!w) return null;
  const id = ++n;
  return new Promise((ok, no) => { waiting.set(id, { ok, no }); w.postMessage({ id, job }); });
}
/** Run a thinking generator here, in slices, so the page keeps drawing. */
export async function slowly(gen) {
  for (let t = performance.now(); ;) {
    const s = gen.next();
    if (s.done) return s.value;
    if (performance.now() - t > 8) { await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
}
/** A job in the worker, or here when there is none (or it failed). */
export async function work(job, here) {
  const p = ask(job);
  if (p) try { return await p; } catch { /* done here instead */ }
  return slowly(here());
}
