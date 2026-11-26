// SPDX-License-Identifier: AGPL-3.0-or-later
// The smoke test: every built page and the front page in a headless Chrome or Edge, Play (or Begin) pressed where there is
// one; fails on any console error, uncaught exception, page-rule (CSP) refusal or failed request, and on front-page fonts.
// node tools/smoke.mjs [--browser path]  (or CAPO_BROWSER=path). Driven over the DevTools protocol; a new profile, removed after.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeServer } from "./serve.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), env = process.env, started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), at = process.argv.indexOf("--browser");
const until = async (test, ms, why) => { for (const end = Date.now() + ms; !test(); await sleep(100)) if (Date.now() > end) throw new Error(why); };
const places = process.platform === "win32" ? [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean).flatMap((d) => ["Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"].map((r) => path.join(d, r)))
  : process.platform === "darwin" ? ["Google Chrome", "Chromium", "Microsoft Edge"].map((n) => `/Applications/${n}.app/Contents/MacOS/${n}`)
  : (env.PATH || "").split(":").flatMap((d) => ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"].map((n) => path.join(d, n)));
const exe = (at > 0 ? process.argv[at + 1] : env.CAPO_BROWSER) || places.find((p) => existsSync(p));
if (!exe || !existsSync(exe)) { console.log(`No Chrome or Edge found${exe ? " at " + exe : ""}. Give one with --browser path.`); process.exit(1); }
const pages = [...readdirSync(path.join(root, "play")).filter((f) => f.endsWith(".html")).sort().map((f) => "play/" + f), "site/"];

const server = makeServer(root), dir = mkdtempSync(path.join(tmpdir(), "capo-smoke-"));
const base = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}/`)));
const flags = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--mute-audio", "--window-size=1280,800", "--remote-debugging-port=0", `--user-data-dir=${dir}`];
if (process.platform === "linux" && env.CI) flags.push("--no-sandbox"); // CI runners may not allow Chrome's sandbox; only our own pages are opened
// Edge on Windows hands itself to a new process and its first one ends at once, so only a failing end counts here.
const child = spawn(exe, [...flags, "about:blank"], { stdio: "ignore" }), stop = setTimeout(() => { console.log("Gave up after 4 minutes"); finish(1); }, 240000);
let gone = "", ws, failed = 0, id = 0;
child.on("exit", (code) => { if (code) gone = `the browser ended with code ${code}`; }).on("error", (e) => { gone = `could not start ${exe}: ${e.message}`; });

// The DevTools protocol over one socket: calls wait for their answer, events go to whoever listens.
const waiting = new Map(), listeners = new Set();
const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
  const n = ++id, timer = setTimeout(() => { waiting.delete(n); no(new Error(`${method} had no answer in 20 s`)); }, 20000);
  waiting.set(n, { ok: (r) => { clearTimeout(timer); ok(r); }, no: (e) => { clearTimeout(timer); no(e); } }), ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});
const run = (expression, sessionId) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId).then((r) => { if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; });

async function visit(page) {
  const problems = new Set(), urls = new Map(), busy = new Set(), say = (s) => problems.add(s.replace(/\s+/g, " ").slice(0, 200));
  let loaded = false, quiet = Date.now(), done = "loaded";
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }), { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const on = ({ method, params: p, sessionId: s }) => {
    if (s !== sessionId) return;
    if (method === "Page.loadEventFired") loaded = true;
    else if (method === "Runtime.exceptionThrown") say("uncaught: " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text).split("\n")[0]);
    else if (method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert")) say("console: " + p.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
    else if (method === "Log.entryAdded" && p.entry.level === "error") say(`${p.entry.source}: ${p.entry.text} ${p.entry.url || ""}`);
    else if (method === "Network.requestWillBeSent") { urls.set(p.requestId, p.request.url); busy.add(p.requestId); quiet = Date.now(); }
    else if (method === "Network.responseReceived" && p.response.status >= 400) say(`request: ${p.response.status} ${p.response.url}`);
    else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") { busy.delete(p.requestId); quiet = Date.now(); if (p.errorText && !p.canceled) say(`request failed: ${p.errorText}${p.blockedReason ? " (" + p.blockedReason + ")" : ""} ${urls.get(p.requestId) || ""}`); }
  };
  listeners.add(on);
  try {
    for (const m of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) await send(m, {}, sessionId);
    await send("Page.addScriptToEvaluateOnNewDocument", { source: 'addEventListener("securitypolicyviolation", (e) => console.error("page rule refused", e.violatedDirective, e.blockedURI))' }, sessionId);
    const nav = await send("Page.navigate", { url: base + page }, sessionId);
    if (nav.errorText) say("navigation: " + nav.errorText);
    await until(() => loaded && !busy.size && Date.now() - quiet > 600, 20000, "did not settle in 20 s");
    // Press the first visible Play, else Begin, as a person would: with the mouse, at its middle.
    const spot = await run(`(() => { const all = [...document.querySelectorAll("button")].filter((b) => !b.disabled && b.getClientRects().length);
      const b = all.find((b) => b.textContent.trim() === "Play") || all.find((b) => b.textContent.trim() === "Begin"); if (!b) return null;
      b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: b.textContent.trim() }; })()`, sessionId);
    if (spot) { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: spot.x, y: spot.y, button: "left", clickCount: 1 }, sessionId); done = "pressed " + spot.name; }
    await sleep(spot ? 3000 : 1500);
    if (page === "site/") {
      const fonts = await run(`(async () => { await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); return [...document.fonts].map((f) => [f.family.replace(/"/g, "") + " " + f.weight, f.status]); })()`, sessionId);
      for (const [name, status] of fonts.length ? fonts : [["(none declared)", "missing"]]) if (status !== "loaded") say(`font ${name}: ${status}`);
      done += `, ${fonts.filter((f) => f[1] === "loaded").length} fonts loaded`;
    }
  } catch (e) { say(e.message); }
  listeners.delete(on);
  await send("Target.closeTarget", { targetId }).catch(() => {});
  return { problems: [...problems], done };
}

async function finish(code) {
  clearTimeout(stop);
  try { if (ws?.readyState === 1) await Promise.race([send("Browser.close"), sleep(3000)]); } catch {}
  // and in case it did not close: end whatever uses this run's own folder, and nothing else
  if (process.platform !== "win32") child.kill("SIGKILL");
  else spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'msedge.exe','chrome.exe' -and $_.CommandLine -like ('*' + $env:CAPO_SMOKE + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: "ignore", env: { ...env, CAPO_SMOKE: path.basename(dir) } });
  ws?.close(), server.close(), server.closeAllConnections();
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { console.log(`(left a temporary folder: ${dir})`); }
  process.exit(code);
}

try {
  const portFile = path.join(dir, "DevToolsActivePort");
  await until(() => gone || existsSync(portFile), 45000, "the browser did not open its DevTools port in 45 s");
  if (gone) throw new Error(gone);
  await sleep(200); // the file is written in one go, but give it a moment
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${readFileSync(portFile, "utf8").split("\n")[0].trim()}/json/version`)).json();
  ws = new WebSocket(webSocketDebuggerUrl);
  ws.onmessage = ({ data }) => { const d = JSON.parse(data), w = d.id && waiting.get(d.id); if (w) { waiting.delete(d.id); d.error ? w.no(new Error(d.error.message)) : w.ok(d.result); } else for (const f of listeners) f(d); };
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("could not reach the browser's DevTools socket")); });
  console.log(`${(await send("Browser.getVersion")).product} at ${base}`);
  for (const page of pages) {
    const t = Date.now(), r = await visit(page);
    if (r.problems.length) failed++;
    console.log(`${r.problems.length ? "FAIL" : "ok  "}  ${page.padEnd(18)} ${((Date.now() - t) / 1000).toFixed(1).padStart(4)} s  ${r.problems.length ? r.problems.join(" | ") : r.done}`);
  }
} catch (e) { console.log("STOP  " + e.message); failed = pages.length; }
console.log(`${pages.length - failed} of ${pages.length} pages clean in ${((Date.now() - started) / 1000).toFixed(0)} s.${failed ? " Not ready to ship." : ""}`);
await finish(failed ? 1 : 0);
