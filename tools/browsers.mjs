// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs the same probe in Node and in every browser found here, and compares the answers.
// Each browser runs headless with a new, empty profile that is removed afterwards.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probe } from "../test/fixtures/probe.js";
import { makeServer } from "./serve.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const places = (rel) => [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, rel));
const first = (list) => list.find((p) => existsSync(p));
const chromium = (exe) => exe && ((dir, url) => [exe, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${dir}`, url]]);
const found = {
  Edge: chromium(first(places("Microsoft/Edge/Application/msedge.exe"))),
  Chrome: chromium(first(places("Google/Chrome/Application/chrome.exe"))),
  Firefox: ((exe) => exe && ((dir, url) => [exe, ["--headless", "--no-remote", "--profile", dir, url]]))(first(places("Mozilla Firefox/firefox.exe"))),
};

const want = probe();
console.log(`Node ${process.version}: ${want.all}`);
let ran = 0, wrong = 0;
for (const [name, how] of Object.entries(found)) {
  if (!how) { console.log(`${name}: not installed, skipped`); continue; }
  const dir = mkdtempSync(path.join(tmpdir(), "capo-probe-"));
  let give;
  const answer = new Promise((r) => { give = r; });
  const server = makeServer(root, async (req, res) => {
    if (req.method !== "POST" || req.url !== "/answer") return false;
    let text = "";
    for await (const c of req) { text += c; if (text.length > 20000) break; }
    res.writeHead(204).end();
    try { give(JSON.parse(text)); } catch { give({ error: "unreadable answer" }); }
    return true;
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const [exe, args] = how(dir, `http://127.0.0.1:${server.address().port}/test/browser/probe.html`);
  const child = spawn(exe, args, { stdio: "ignore" });
  const timer = setTimeout(() => give({ error: "no answer in 60 seconds" }), 60000);
  child.on("error", (e) => give({ error: e.message }));
  const got = await answer;
  clearTimeout(timer);
  const closed = new Promise((r) => child.on("exit", r));
  // A browser may hand itself to a new process, so end whatever uses this run's own folder, and nothing else.
  if (process.platform === "win32") {
    const find = "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'msedge.exe','chrome.exe','firefox.exe' -and $_.CommandLine -like ('*' + $env:CAPO_PROBE + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    spawnSync("powershell", ["-NoProfile", "-Command", find], { stdio: "ignore", env: { ...process.env, CAPO_PROBE: path.basename(dir) } });
  }
  child.kill();
  await Promise.race([closed, new Promise((r) => setTimeout(r, 4000))]);
  server.close();
  server.closeAllConnections();
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { console.log(`(left a temporary folder: ${dir})`); }
  ran++;
  const diff = got.error ? [got.error] : Object.keys(want).filter((k) => got[k] !== want[k]);
  if (diff.length) wrong++;
  console.log(`${name}: ${diff.length ? "DIFFERENT, " + diff.join(", ") : got.all + " same"}${got.agent ? "  (" + got.agent.split(" ").pop() + ")" : ""}`);
}
console.log(wrong ? `${wrong} of ${ran} browsers differ` : `${ran} browsers and Node agree`);
process.exitCode = wrong || ran < 2 ? 1 : 0;
