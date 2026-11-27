// SPDX-License-Identifier: AGPL-3.0-or-later
// Saves by code: one Durable Object for each secret code. The player keeps the code; the worker keeps the save under a
// digest of it and nothing else, and deletes it a year after it was last opened or written, or at once when asked.
// A save is taken only if it replays from seed plus moves to the position it names (openSave in src/core).
import { Refusal, openSave } from "../../src/core/index.js";
import { GAMES } from "./games.js";
import { KEEP, MOST, No, answer, body, clock, refuse } from "./wire.js";

const DAY = 86400000;

export class Keep {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.games = Array.isArray(env.GAMES) ? env.GAMES : GAMES;
    this.line = Promise.resolve();
  }
  run(fn) { const p = this.line.then(fn); this.line = p.catch(() => {}); return p; }

  async fetch(request) {
    const op = new URL(request.url).pathname.split("/")[2];
    try {
      return await this.run(async () => {
        const s = this.ctx.storage, now = clock.now();
        if (request.method !== "POST") throw new No(405, "where", "saves are posted");
        const b = await body(request, MOST.save + 200), kept = await s.get("save");
        if (op === "put") {
          if (b.fresh && kept) throw new No(409, "taken", "that code is in use");
          const save = checked(b.save, this.games);
          await s.put("save", { save: save.text, game: save.game, at: now });
          await s.setAlarm(now + KEEP.save);
          return answer(kept ? 200 : 201, { kept: true, game: save.game });
        }
        if (op === "open") {
          if (!kept) throw new No(404, "save", "there is no save with that code (it may have been deleted, or its year ran out)");
          if (now - kept.at > DAY) { await s.put("save", { ...kept, at: now }); await s.setAlarm(now + KEEP.save); } // opened: kept another year, written at most once a day
          return answer(200, { save: kept.save, game: kept.game });
        }
        if (op === "drop") {
          await s.deleteAlarm();
          await s.deleteAll();
          return answer(200, { dropped: !!kept });
        }
        throw new No(404, "where", "there is nothing here by that name");
      });
    } catch (e) {
      if (e instanceof No) return refuse(e);
      throw e;
    }
  }

  async alarm() {
    const kept = await this.ctx.storage.get("save");
    if (kept && clock.now() < kept.at + KEEP.save) return this.ctx.storage.setAlarm(kept.at + KEEP.save);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

/** A save the worker will keep: text no larger than the guide that replays whole. Returns { text, game }. */
export function checked(text, games) {
  if (typeof text !== "string" || text.length > MOST.save) throw new No(413, "size", "that save is too large or not text");
  try {
    const { match, warning } = openSave(text, games);
    if (warning) throw new No(400, "save", `that save does not replay whole: ${warning}`);
    return { text, game: match.game.id };
  } catch (e) {
    if (e instanceof Refusal) throw new No(400, e.code, e.message);
    throw e;
  }
}
