# Capo

Table games on one shared map, in the browser. Free software, AGPL-3.0-or-later. Working name.

Stage 0: there is a rules core and a check page. There is no game yet.

| Command | What it does |
|---|---|
| `node --test test/*.test.mjs` | The tests. Nothing to install; Node 22 or newer |
| `node tools/check.mjs` | The gate: sizes, file types, records, rules-code limits |
| `node tools/browsers.mjs` | The same probe in Node and each browser found here |
| `node tools/serve.mjs` | Look at it on this computer. `--lan` also lets your phone in |
| `node tools/pack.mjs` | Makes `dist/` for a static host. Uploads nothing |

| Folder | What |
|---|---|
| `src/core` | Seeded chance, fingerprints, the list of moves, saves |
| `site` | The page |
| `test`, `tools` | Tests and tools |
| `lab/map` | Map proofs. Not shipped |

**Rules for rules code** (`src/core`, `src/games`): whole numbers only, no clock, no page, no chance except the one passed in. The gate enforces this, so a game replays the same on every machine.

Before anything goes online: the AGPL text must be in `LICENSE`, then `node tools/pack.mjs --release`.
