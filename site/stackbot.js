// SPDX-License-Identifier: AGPL-3.0-or-later
// The stacking game's worker: the bots' search, hints and reviews, away from the page so it never stalls while a bot thinks.
// The page sends a job and gets back what the same code would give on the page itself (site/stackhelp.js falls back to that).
import { deciding, drain, hinting, reviewing } from "../src/games/stacking/bot.js";

self.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const out = job.kind === "think" ? drain(deciding(job.p, job.o)) : job.kind === "hint" ? drain(hinting(job.p, job.seed)) : drain(reviewing(job.game, job.people));
    self.postMessage({ id, out });
  } catch (err) { self.postMessage({ id, fail: String(err?.message || err) }); }
};
