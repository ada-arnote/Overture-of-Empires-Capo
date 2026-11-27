# Contributing

## Shelf entries: scenarios, stories and replays

The community shelf is the `shelf/` folder of this repository. Capo's first screen and every table game's menu read it from the site itself, so anything taken onto the shelf can be opened by every player. Nothing is posted from the pages: you offer an entry yourself, on GitHub, with your own account.

### Make the file in the game

- **A Capo scenario:** play a game, then in the Game menu fill in the scenario's title, line and opening and press **Share to the shelf**.
- **A Capo story:** in the Game menu, press **Share this story**. Your chats with the AI and the counsel you asked for are left out; everything else in the game is in the file, including the actions you wrote.
- **A table-game replay:** in the game's menu, press **Share to the shelf**. A finished game can be stepped through; an unfinished one can be played on by whoever opens it.

Each asks for a title, a line about it, the name it goes by (any name you choose) and a licence, then saves a file named after its id, such as `a-hard-winter-in-the-north.json`.

### Offer it

1. Read the file. Everything in it will be public. Leave out your own name, where you live, and anything else about you.
2. Open the repository's `shelf/` folder on GitHub, choose **Add file**, then **Upload files**, drop the file in, and choose **Propose changes**. That makes a pull request. Or open an issue with the **Offer to the shelf** form and attach the file there.
3. The checks run on every pull request. A person reads every entry before it is taken.

### What every entry must be

- **One JSON file**, named `<id>.json`, with `kind: "capo-shelf"`, `v: 1`, an `id` of 3 to 64 lower-case letters, digits and hyphens, a `type` (`scenario`, `story` or `replay`) and a `game` (`capo` for scenarios and stories; `inch`, `fable`, `banners` or `glass` for replays). The format and its checks are in `src/story/shelf.js`.
- **Small:** a scenario up to 120,000 characters, a story up to 300,000, a replay up to 200,000.
- **Yours, with a licence you choose:** `CC-BY-4.0` (others name you, by the name in `by`) or `CC0-1.0` (no name needed). Only what you made, or what you may offer under that licence. An entry made from another shelf entry names it in `from`.
- **Data only.** Nothing in an entry is ever run.
- **No web addresses and no email addresses** anywhere in its text.
- **The hard line:** nothing sexual involving minors. It is refused wherever it appears.
- **No em dashes** (the game turns them into commas when it makes the file).
- **It opens in the game:** a scenario passes the game's scenario check on the map it is set on with every part kept, a story passes the saved-game check, and a replay is played again from its seed and moves and must reach the end and the winners it claims. A replay made under older rules of its game stays on the shelf but cannot be opened, and the shelf says so.

### For whoever takes an entry

`node tools/shelf.mjs --check` runs the shelf's checks; `node tools/check.mjs` runs them with the rest of the gate. When an entry is taken, `node tools/shelf.mjs` writes `shelf/index.json` again, which is what the pages read. A file that passes but is not in the index yet is a note, not a stop, so an offer's own pull request can pass its checks.
