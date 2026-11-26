// SPDX-License-Identifier: AGPL-3.0-or-later
// How Capo reaches an AI. Two routes for now: paste by hand into any AI you use, or an address you give it
// (any service that speaks the common chat-completions form, including one running on your own computer).
// A key stays in this browser: for this visit only, unless you ask for it to be remembered.
const PLACE = "capo-ai";
const read = (s) => { try { return JSON.parse(s.getItem(PLACE) || "null"); } catch { return null; } };

export function loadRoute() {
  return read(localStorage) || read(sessionStorage) || { route: "paste", base: "", model: "", key: "", remember: false, calls: 0, sent: 0, got: 0, day: "" };
}
export function saveRoute(r) {
  try {
    sessionStorage.setItem(PLACE, JSON.stringify(r));
    if (r.remember) localStorage.setItem(PLACE, JSON.stringify(r)); else localStorage.removeItem(PLACE);
  } catch { /* the route still works for this visit */ }
}
export function forgetKey(r) { const n = { ...r, key: "", remember: false }; saveRoute(n); try { localStorage.removeItem(PLACE); } catch { /* nothing kept */ } return n; }

/** Send one prompt and return the reply's text. Throws an Error with a plain sentence when it fails. */
export async function ask(r, prompt, signal) {
  if (r.route !== "address") throw new Error("paste");
  const base = String(r.base || "").trim().replace(/\/+$/, "");
  let where = null;
  try { where = new URL(base); } catch { /* checked below */ }
  const near = where && where.protocol === "http:" && ["localhost", "127.0.0.1"].includes(where.hostname);
  if (!where || (where.protocol !== "https:" && !near)) throw new Error("The address must be a secure web address, or a service on this computer.");
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST", signal, credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", ...(r.key ? { Authorization: `Bearer ${r.key}` } : {}) },
      // no temperature or length is sent: some services refuse them, and thinking models can spend a short limit before answering
      body: JSON.stringify({ model: r.model || undefined, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(signal?.reason === "time" ? "The AI took more than two minutes. Ask again, or copy the prompt into a chat." : "Stopped.");
    throw new Error("The service could not be reached. Check the address, your connection, and whether it allows calls from a web page.");
  }
  if (!res.ok) {
    // the service's own words help more than a number; only a short, plain piece of them is shown
    const said = await res.json().then((d) => d?.error?.message || d?.message || "").catch(() => ""), why = String(said).replace(/\s+/g, " ").slice(0, 160);
    const plain = res.status === 401 || res.status === 403 ? "The service refused the key." : res.status === 429 ? "The service says too many requests; wait a little." : `The service answered with an error (${res.status}).`;
    throw new Error(why ? `${plain} It said: ${why}` : plain);
  }
  const data = await res.json().catch(() => null), text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("The service sent no text back.");
  if (data?.choices?.[0]?.finish_reason === "length" && !/\bEND\b/.test(text)) throw new Error("The reply was cut off before its end. Ask again, or use a model that allows longer replies.");
  const today = new Date().toISOString().slice(0, 10);
  if (r.day !== today) { r.day = today; r.calls = 0; r.sent = 0; r.got = 0; }
  r.calls++; r.sent += data.usage?.prompt_tokens || Math.ceil(prompt.length / 4); r.got += data.usage?.completion_tokens || Math.ceil(text.length / 4);
  saveRoute(r);
  return text;
}
