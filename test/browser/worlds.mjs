// SPDX-License-Identifier: AGPL-3.0-or-later
// The browser check for Capo's fictional worlds: in a headless Chrome or Edge, pick each setting in the wizard, see
// its map drawn, choose a country, begin, and read the first prompt. Also rolls one new world from a seed.
// node test/browser/worlds.mjs [folder for screenshots] [--page site/game.html] [--browser path]   (or CAPO_BROWSER=path)
// Fails on any console error or uncaught exception, a map that is not drawn, or a prompt that does not name the world.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeServer } from "../../tools/serve.mjs";
import { PRESETS } from "../../src/story/presets.js";
import { SETTINGS } from "../../src/map/worlds.js";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), env = process.env, args = process.argv.slice(2);
const at = args.indexOf("--browser"), shots = args.find((a, i) => !a.startsWith("--") && !["--browser", "--page"].includes(args[i - 1])) || "";
const page = args.includes("--page") ? args[args.indexOf("--page") + 1] : "play/game.html"; // the built page, as served; or site/game.html
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const places = process.platform === "win32" ? [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean).flatMap((d) => ["Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"].map((r) => path.join(d, r)))
  : process.platform === "darwin" ? ["Google Chrome", "Chromium", "Microsoft Edge"].map((n) => `/Applications/${n}.app/Contents/MacOS/${n}`)
  : (env.PATH || "").split(":").flatMap((d) => ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"].map((n) => path.join(d, n)));
const exe = (at >= 0 ? args[at + 1] : env.CAPO_BROWSER) || places.find((p) => existsSync(p));
if (!exe || !existsSync(exe)) { console.log("No Chrome or Edge found. Give one with --browser path."); process.exit(1); }
if (shots) mkdirSync(shots, { recursive: true });

const server = makeServer(root), dir = mkdtempSync(path.join(tmpdir(), "capo-worlds-"));
const base = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}/`)));
const child = spawn(exe, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio", "--window-size=1280,800", "--remote-debugging-port=0", `--user-data-dir=${dir}`, ...(process.platform === "linux" && env.CI ? ["--no-sandbox"] : []), "about:blank"], { stdio: "ignore" });
const problems = [], waiting = new Map();
let ws, id = 0, session;
const send = (method, params = {}) => new Promise((ok, no) => { const n = ++id; waiting.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params, sessionId: session })); });
const run = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const until = async (expression, why, ms = 15000) => { for (const end = Date.now() + ms; !(await run(expression)); await sleep(120)) if (Date.now() > end) throw new Error(why); };
const press = (label) => run(`(() => { const b = [...document.querySelectorAll("button")].find((b) => b.getClientRects().length && b.textContent.trim() === ${JSON.stringify(label)}); if (!b) throw new Error("no button: " + ${JSON.stringify(label)}); b.click(); })()`);
const shot = async (name) => { if (!shots) return; await sleep(500); const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(shots, name), Buffer.from(data, "base64")); };
// the map is drawn when the canvas holds more than one colour of sea
const drawn = `(() => { const c = document.getElementById("map"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return seen.size > 8; })()`;

async function play(preset, n, seed) {
  await run("localStorage.clear()");
  await send("Page.navigate", { url: `${base}${page}` });
  await until(`!!document.querySelector("input[name=scenario]")`, "the wizard did not open");
  await run(`[...document.querySelectorAll("input[name=scenario]")].find((r) => r.value === ${JSON.stringify(preset.id)}).click()`);
  await until(`document.querySelector("[aria-label=\\"This world's seed\\"]")?.value === ${JSON.stringify(preset.world.seed)}`, `${preset.title}: its world was not made`);
  if (seed) {
    await run(`(() => { const i = document.querySelector("[aria-label=\\"This world's seed\\"]"); i.value = ${JSON.stringify(seed)}; i.dispatchEvent(new Event("change")); })()`);
    await until(`document.querySelector("[aria-label=\\"This world's seed\\"]")?.value === ${JSON.stringify(seed)}`, `${preset.title}: the world was not made again from ${seed}`);
  }
  const tag = `fantasy-${n}-${preset.world.setting}${seed ? "-" + seed : ""}`;
  await shot(`${tag}-1-wizard.png`);
  await press("Next: your country");
  const country = await run(`(() => { const o = [...document.querySelectorAll("#countries option")].map((x) => x.value); const i = document.querySelector("input[list=countries]"); i.value = o[0]; i.dispatchEvent(new Event("change")); return o.length + " countries, playing " + o[0]; })()`);
  await press("Choose on the map");
  await run(`document.getElementById("home").click()`); // the whole world, not only the country chosen
  await sleep(700);
  await until(drawn, `${preset.title}: the map was not drawn`);
  await shot(`${tag}-2-map.png`);
  await press("Done"); await press("Next: you"); await press("Next: begin"); await press("Begin");
  await until(`!document.getElementById("top").hidden`, `${preset.title}: the game did not begin`);
  await sleep(300);
  await run(`[...document.querySelectorAll("button")].find((b) => b.getClientRects().length && b.textContent.trim() === "Skip")?.click()`); // the first-game guide
  await press("Advance");
  await until(`!!document.querySelector("textarea.paste")`, `${preset.title}: no prompt was shown`);
  const prompt = await run(`document.querySelector("textarea.paste").value`), first = prompt.split("\n")[0];
  if (!first.includes(preset.title) || /the real world/.test(first)) problems.push(`${preset.title}: the prompt does not open on its world: ${first.slice(0, 120)}`);
  for (const need of ["Tone:", "What exists:", "Powers:", "PLACES"]) if (!prompt.includes(need)) problems.push(`${preset.title}: the prompt has no "${need}"`);
  await shot(`${tag}-3-prompt.png`);
  if (shots) writeFileSync(path.join(shots, `${tag}-prompt.txt`), prompt);
  // the game is kept in the browser: after a reload it opens on its own world, where it was
  const who = await run(`document.querySelector("#top .who").textContent`);
  await send("Page.reload");
  await sleep(400);
  await until(`document.getElementById("top") && !document.getElementById("top").hidden && document.querySelector("#top .who")?.textContent === ${JSON.stringify(who)}`, `${preset.title}: the kept game did not open again`);
  await until(drawn, `${preset.title}: the map was not drawn after a reload`);
  console.log(`ok    ${preset.title}${seed ? ` (seed ${seed})` : ""}: ${country}; prompt of ${prompt.length} characters`);
}

let code = 0;
try {
  const portFile = path.join(dir, "DevToolsActivePort");
  for (const end = Date.now() + 45000; !existsSync(portFile); await sleep(100)) if (Date.now() > end) throw new Error("the browser did not open its DevTools port");
  await sleep(200);
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${readFileSync(portFile, "utf8").split("\n")[0].trim()}/json/version`)).json();
  ws = new WebSocket(webSocketDebuggerUrl);
  ws.onmessage = ({ data }) => {
    const d = JSON.parse(data), w = d.id && waiting.get(d.id);
    if (w) { waiting.delete(d.id); d.error ? w.no(new Error(d.error.message)) : w.ok(d.result); }
    else if (d.method === "Runtime.exceptionThrown") problems.push("uncaught: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split("\n")[0]);
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") problems.push("console: " + d.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
  };
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("could not reach the browser")); });
  const { targetId } = await send("Target.createTarget", { url: `${base}${page}` });
  session = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  for (const m of ["Page.enable", "Runtime.enable"]) await send(m);
  await sleep(1500);
  const worlds = PRESETS.filter((p) => p.world);
  for (const [i, p] of worlds.entries()) await play(p, i + 1);
  await play(worlds[0], worlds.length + 1, "newworld7");
  // a setting opened from a file joins the list and makes its world; a bad file is refused and says why
  const give = (text) => run(`(() => { const i = document.querySelector("input[type=file]"), d = new DataTransfer(); d.items.add(new File([${JSON.stringify(text)}], "setting.json", { type: "application/json" })); i.files = d.files; i.dispatchEvent(new Event("change")); })()`);
  await run("localStorage.clear()"); await send("Page.navigate", { url: `${base}${page}` });
  await until(`!!document.querySelector("input[name=scenario]")`, "the wizard did not open");
  const own = { ...SETTINGS[1], id: "tidewater", title: "Tidewater Test" };
  await give(JSON.stringify({ ...own, cultures: [] }));
  await until(`document.getElementById("toast").textContent.includes("culture")`, "a bad setting file was not refused with its reason");
  await give(JSON.stringify(own));
  await until(`document.querySelector("input[name=scenario]:checked")?.value === "file-tidewater" && document.querySelector("[aria-label=\\"This world's seed\\"]")?.value === "first"`, "a setting file did not open as a world");
  await until(drawn, "the opened setting's map was not drawn");
  await shot("fantasy-file-setting.png");
  console.log("ok    a setting file opens as a world of its own, and a bad one is refused");
  // one world at a phone's size
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await play(worlds[1], worlds.length + 2);
} catch (e) { problems.push(e.message); }
for (const p of problems) console.log("FAIL  " + p);
console.log(problems.length ? `${problems.length} problem${problems.length > 1 ? "s" : ""}.` : "All worlds open, draw and write their first prompt.");
code = problems.length ? 1 : 0;
try { await Promise.race([send("Browser.close"), sleep(3000)]); } catch { /* already gone */ }
ws?.close(); server.close(); server.closeAllConnections(); child.kill();
await sleep(500);
try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* the browser may still hold it for a moment */ }
process.exit(code);
