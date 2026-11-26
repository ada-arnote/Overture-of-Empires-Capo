# Overture of Empires: Capo

Table games on one shared map, in the browser, and Capo, a story game played with an AI you bring. Free software, AGPL-3.0-or-later.

An early build, at an unlisted address: https://ada-arnote.github.io/Overture-of-Empires-Capo/site/ . Four table games, with bots, saves, take-back and play by pasted link: **Brass and Banners**, **The Island Fable**, **Grain and Glass** and **An Inch of Ink**. And **Capo**, the story game, as an early test: the whole world, any country, an AI that writes the story and rules that decide what is true. Expect all of it to change.

| Command | What it does |
|---|---|
| `node --test test/*.test.mjs` | The tests. Nothing to install; Node 22 or newer |
| `node tools/check.mjs` | The gate: sizes, file types, records, rules-code limits |
| `node tools/browsers.mjs` | The same probe in Node and each browser found here |
| `node tools/serve.mjs` | Look at it on this computer. `--lan` also lets your phone in |
| `node tools/bundle.mjs` | Makes `dist/play-*.html`, one file for each game, that opens by double-click |
| `node tools/play.mjs banners 200 3` | Plays bots against each other and prints the balance |
| `node tools/pack.mjs` | Makes `dist/` for a static host. Uploads nothing |

| Folder | What |
|---|---|
| `src/core` | Seeded chance, fingerprints, the list of moves, saves |
| `site` | The pages, as written |
| `play` | The same pages as single files, made by `node tools/bundle.mjs`. This is what is served |
| `test`, `tools` | Tests and tools |
| `src/games` | Rules and bots. Whole numbers, no page, no clock |
| `src/map` | The hex board: painter, camera, looks, pieces |
| `src/story` | Capo's turn, rules, talk and scenarios |
| `maps` | Map data the pages fetch: Capo's world provinces and disputed areas |

**Rules for rules code** (`src/core`, `src/games`): whole numbers only, no clock, no page, no chance except the one passed in. The gate enforces this, so a game replays the same on every machine.

Before anything goes online: the AGPL text must be in `LICENSE`, then `node tools/pack.mjs --release`.
