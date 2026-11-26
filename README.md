# Overture of Empires: Capo

Table games on one shared map, in the browser, and Capo, a story game played with an AI you bring. Free software, AGPL-3.0-or-later.

An early build, at an unlisted address: https://ada-arnote.github.io/Overture-of-Empires-Capo/site/ . Four table games, with bots, saves, take-back and play by pasted link: **Brass and Banners**, **The Island Fable**, **Grain and Glass** and **An Inch of Ink**. And **Capo**, the story game, as an early test: the whole world, any country, an AI that writes the story and rules that decide what is true. Expect all of it to change.

| Command | What it does |
|---|---|
| `node --test test/*.test.mjs` | The tests. Nothing to install; Node 22 or newer |
| `node tools/check.mjs` | The gate: sizes, file types, records, rules-code limits |
| `node tools/browsers.mjs` | The same probe in Node and each browser found here |
| `node tools/smoke.mjs` | Opens every built page in a headless Chrome or Edge, presses Play, and fails on any error. `--browser path` picks one |
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

**Fonts, icons, sounds, textures and screenshots.** Only CC0, CC BY, OFL 1.1, MIT or ISC, never made by an AI, each with a row in `CREDITS.csv`. They ship only from these folders, which the gate counts apart from code (`.woff2`, `.ogg`, `.mp3`, `.png`, `.webp` at full size, since they do not compress), all inside the 600 kB total:

| Folder | Holds | Budget |
|---|---|---|
| `site/fonts/<family>/` | `.woff2`, with the licence text and copyright line in a `.txt` beside it (the font's own `OFL.txt`) | 110 kB |
| `site/icons/` (a folder per set) | `.svg`, `.png`, `.webp`: icons, signs and ornament | 25 kB |
| `site/sounds/` | `.ogg`, `.mp3` | 60 kB |
| `site/textures/` | `.webp`, `.png`: small seamless tiles (the walnut of the front page) | 32 kB |
| `site/shots/` | `.webp`: screenshots taken from our own game pages (own work) | 120 kB |

Each font, and each OFL, MIT or ISC file, is named in `NOTICES.md` by its path or its folder; MIT and ISC sets also keep their copyright line and permission text there. Pages name an asset by its whole path from `site/`, in quotes or `url()` (`"sounds/move.ogg"`, `url("fonts/spectral/spectral-400.woff2")`), never built from pieces: `node tools/bundle.mjs` points `play/` pages back at `../site/` and puts the file itself inside each `dist/play-*.html` as `data:`, so every font a page names makes each double-click page larger by about four thirds of its size. Page rules allow fonts and sounds only from the page's own site (`font-src 'self'; media-src 'self'`), or from inside the page (`data:`) for double-click pages.

Before anything goes online: the AGPL text must be in `LICENSE`, then `node tools/pack.mjs --release`.
