# Changelog

What changed in each tagged version of Overture of Empires: Capo, newest first. Each version is a git tag (`v0.5.0`); `git show v0.5.0` has the full detail. How a version is made: `RELEASING.md`.

## Unreleased

**Players**
- **Capo, the story game, has worlds of its own.** Step 1 of the wizard lists five fictional worlds under "Fictional worlds", each with its own map, countries, names, premise and tone: **The Vacant Throne** (a low-fantasy continent of rival kingdoms), **The Salt Ledger** (an archipelago of trading city-states in an age of sail), **Grass and Granary** (an old farming empire and the rider peoples of the steppe), **The Long Silence** (a far-future colony world cut off from old Earth) and **The Paper Republics** (new nations in an age of steam). All five are our own: no real country, person or event, and nothing from anyone else's fiction.
- **Roll a new world.** Each of these worlds is made from a seed. "Roll a new world" makes another map, with other countries and names, for the same setting; typing a seed someone gave you makes exactly the world they have. The same seed always makes the same world, on every device.
- **The rules are the same everywhere.** Might, relations, wars, treaties, attacks on the check, the council, chats, take-back, saves and scenario files all work on an invented world as they do on the real one. The AI is told where the story is set, its tone, what exists there (the level of craft or magic), its peoples and its powers, as story facts you can read and remove in Game Master.
- **Settings are files too.** A setting saved as a file (kind `capo-setting`: a shape for the land, cultures as sounds for names, factions, a premise, a tone) opens with "Open a scenario file". A file that cannot be read is refused, with the reason.

**Under the hood**
- `src/map/worldgen.js` makes a world from a recipe and a seed in the same shape as `maps/world.json` (arcs, provinces of arcs, neighbours, narrow seas, countries), in whole numbers only, so the story map draws it unchanged: about 220 to 300 provinces, made in a fraction of a second, nothing added to `maps/`. `src/map/worlds.js` holds the five recipes; `src/story/settings.js` checks setting files and turns a setting into a scenario; `src/story/presets.js` is the one registry every lane's ready-made starts are listed in.
- A game on an invented world carries `world: {setting, seed, gen}`; saves and scenario files with a world that cannot be made are refused. The generator has a version (`GEN`), and the tests hold the five starter worlds to fingerprints, so a saved game is never read onto a changed map.
- Tests: `test/worlds.test.mjs` (the same seed gives the same world, outlines close, every province reachable, fair homes, names clear of real ones, saves and scenarios replay, bad setting files refused); a browser check, `node test/browser/worlds.mjs`, picks each world, sees the map and reads the first prompt.

## v0.6.3 (2026-11-26): the game screens in blue and silver

**Players**
- Every game screen (the four table games and Capo) now shares one design: dark lacquer panels with a silver keyline for what floats over the board, pale chart paper for what you read, silver for the one main action, the site's own fonts, and daylight or lamplight following the front page's lantern (or Settings).
- Fable's buttons no longer overflow the panel; the turn summary is one line until opened; the phone tray stops at about half the screen.
- Capo on a phone: the top bar is two lines and the menu dock sits at the bottom, no longer covering Advance.
- Keyboard and screen readers: focus returns to the move panel after every move; zoom and pan by buttons and keys; rows say whose land and what is on it, and "The board as a list" opens for Banners, Fable and Glass; single-letter shortcuts can be turned off in Settings, and E asks before ending a turn; controls have clearer edges and work in high-contrast mode.

## v0.6.2 (2026-11-26): Capo remembers, and countries answer

**Players**
- **Capo, the story game, remembers.** The game keeps a chronicle, built by its own code and never by an AI call: what the rules decided each turn, then the one sentence the turn was told in. The newest nine turns stay as lines, older ones fold into eras, and the AI is sent the same chronicle every turn at the same length however long the game runs. The Ledger's Log tab is now the Chronicle. Chats and the council read it too.
- **Countries answer.** Every pair of countries stands somewhere from hostile (-3) to close (+3), moved only by what they do: war, peace, a treaty signed or ended, land handed over, and time. A country asked for a treaty adds up a score and says it in the receipt ("which refuses (relations cool -2, a treaty ended in 2027 -2: -4, needing 2)"). Trade needs 0, defence 2, an alliance 4, so trust is built a step a turn. A province card shows what its holder would answer before you ask.
- **Offers are cards.** An offer of peace or a treaty waits at the top of Actions with Accept and Decline. Orders given by card (an attack, an offer accepted, a treaty proposed) are carried out by the rules whether or not the AI writes them down. An offer is kept once and lapses after a year.
- **One skill for each adviser, dealt by the rules.** The council card no longer shows a skill the AI proposed beside the rules' command: there is one skill, it leads attacks and weighs counsel, and the AI is no longer asked for a number.
- **Take-back is honest about attacks.** A turn with a settled attack, played again, moves the game to a new numbered line: its checks draw fresh numbers, so a roll that was seen cannot be planned around, and the receipt and the chronicle say the turn was played again.
- The turn prompt names the player's own wars, treaties and nearby land changes and counts the rest, so it stays close to the same size through a long game.
- Games saved under the previous rules are converted with a note: past turns keep their results, and a chronicle is built from the turns the save still holds.

**Contributors**
- `src/story/chronicle.js`, `src/story/relations.js`; `closeTurn` in `src/story/turn.js` closes a turn for the page, the tests and any rules-only run. Story rules are version 3. `src/story` is 33 of its 40 kB.

## v0.6.1 (2026-11-26): blue and silver

**Players**
- The front page's accents turn from gold to silver: buttons, labels, the line round the live board and the glow, with cool white text on the blue.

## v0.6.0 (2026-11-26): the front page, rebuilt

**Players**
- A new front page. A real game of Brass and Banners is played by four bots on the desk at the top (it rests when you scroll away or ask for less motion, and you can pause it), every game is shown by a picture of its own board, and Capo has its own section with the world map. New sections: what is at every table (three sets of rules, lessons, play by link, fairness, settings, saves), what is new, the road map, and the open-source ledger. A Play button stays in the top bar; on a phone the page links fold behind Menu.
- The tent is still there as accents: the blue ground, a walnut frame with a brass line, chart lines, and Sandby's etching. The cork board, trunk, wax seal and their textures are retired.

**Contributors**
- `site/shots/` holds screenshots taken from our own game pages (WebP, 120 kB, own work in `CREDITS.csv`); everything shipped may now reach 600 kB (ruling 130).
- `site/front.css` replaces `site/tent.css`; `site/live.js` drives the front page's live board with the game's own rules, bot and board. At release, bring the three "What is new" cards on the front page up to date.

## v0.5.6 (2026-11-26): fairer maps

**Players**
- **Brass and Banners:** the world map is tidied (no province in pieces, no sea crossing between provinces that already touch, no province smaller than 17 cells), starting land is even at every seat count, and grown and island maps that would be unfair are redrawn before you see them.
- **The Island Fable:** the chain island's islands are joined by causeways, small islands always have enough land, and homes start with even land around them and at least three steps apart.
- **Grain and Glass:** ports are never side by side, the busiest numbers no longer touch (two-dice rolls), and no good is produced far more than another.
- **An Inch of Ink:** in the turn duel the hills around every home are the same; in real time every nation starts with enough land nearby, even with 50 nations.
- Games saved under the previous rules of all four table games no longer open.

**Contributors**
- Every fixed fault is now held by the map report card in the gate.

## v0.5.5 (2026-11-26): the tent, furnished

**Players**
- The front page trades its drawn placeholders for real material: a canvas weave over the tent's blue, walnut for the desk, trunk and board frame, cork for the intelligence board, aged paper for the orders and dispatches, an engraving after Paul Sandby's 1780 view from a commander's tent, printers' ornaments from 18th-century military books, woodcut-style marks on the game boxes, and a wax seal, inkstand, compass rose and pins drawn for the project. Every piece is credited on the page and in CREDITS.csv.

**Contributors**
- A textures budget of 32 kB for `site/textures/`; icons and ornaments use 24.8 of their 25 kB.

## v0.5.4 (2026-11-26): The Ink Dries

**Players**
- **An Inch of Ink, Traditional:** the ages now come sooner on smaller maps (world at 2:00 and 5:00, continents at 1:15 and 2:30, islands at 1:30 and 3:30), so the mark and the card come into play in most games.
- **An Inch of Ink, Capo: "The Ink Dries".** A short, plain real-time game for 12 nations on a map drawn fresh each time: your first cell is your capital, land cut off from it fades away, and from the first minute the page dries from its edges inward. Hold most of the land still wet, or be the last nation left. Games take about two minutes.
- The turn-by-turn duel now lives under Custom (choose Turns).
- Games saved under the previous rules no longer open (they are refused with a note).

## v0.5.3 (2026-11-26): learn by playing

**Players**
- **Brass and Banners** and **The Island Fable** can teach themselves: "New here? Learn by playing" on the title card (also offered on your first Play) starts a short lesson game against a gentle bot. A card points at the board or a button, says one sentence, and moves on when you do the thing: nine steps for Banners (placing, odds, attacking, moving in, lands and bonuses, cards, winning), eight for the Fable (villages and purses, scouts, free movement and merging, upkeep, the truce, taking land, cutting a territory, conceding). End it any time; "Teach me again" is in the menu. A lesson never overwrites a saved game.

## v0.5.2 (2026-11-26): patterns and outlines on the board

**Players**
- **All four table games:** with "Patterns" on in Settings, each seat's land carries its own quiet pattern (hatching, dots, lines, cross-hatch) on the board as well as the score bar, so colour is never the only way to tell players apart.
- Owned land has an ink and paper outline, so every colour stands clear of the sea (blue land on the Banners sea was hard to see).
- The Motion setting now reaches the board: "Full" brings back its animations even when the system asks for less, and "Reduced" turns changes into a short fade.

## v0.5.1 (2026-11-26): attacks with odds in Capo

**Players**
- **Capo, the story game:** before you order an attack you now see who leads it, the approach (steady, bold or patient) and its odds out of 100: clean, costly or failed, never better than 75 in 100. After the turn, a one-sentence receipt in the ledger and a "From the front" item in the news say exactly why it went the way it did. The AI tells the story of the result; it never decides it. Council members show their command.
- Games saved before this version are brought up to date when opened: past turns keep their results.

**Contributors**
- `src/story/check.js`: one whole-number check with named, seeded draws, the first step of the mission model.
- `node tools/smoke.mjs` opens every built page and the front page in a headless Chrome or Edge, presses Play where there is one, and fails on any console error, uncaught exception, page-rule refusal or failed request. It runs in the GitHub check after the built pages are compared. This changelog and a release checklist, `RELEASING.md`.

## v0.5.0 (2026-11-26): fair and familiar tables, and the war tent

The end of Phase 1.

**Players**
- Traditional rules move toward what players of each kind of game expect:
  - **Brass and Banners:** three dice against two, reinforcements by provinces held (at least three), land bonuses from size and borders, a forced card trade after a knockout, and no round cap.
  - **The Island Fable:** free movement inside your own land, last one standing (with conceding), harsher wages, no round limit.
  - **Grain and Glass:** a raider and a hand limit, two awards, a lean opening, standing offers, and the rolled hexes shown on the board.
  - **An Inch of Ink:** its own Traditional, with six inks, places, ages with marks and cards, a goal that eases over time, encircled land that soaks through, and a local record with titles.
- Every game and seat count wins within ten points of even, measured over 1,000 bot games each.
- The table screen gains a Play button, a turn summary, a docked log, seat colours safe for colour-blind players, a tabbed menu that remembers your settings, sound cues, a turn banner, a full end screen and a tray that folds away on a phone.
- A new front page, the commander's war tent, in blues, with its own fonts and a drawn coastline.

**Contributors**
- The gate runs a map report card, and fonts, icons and sounds may ship under OFL, MIT and ISC, each kind with its own budget and records.
- A weekly fairness table runs on GitHub (`.github/workflows/fairness.yml`, `tools/fair.mjs`).
- The site code budget is 140 kB compressed.

## v0.4.4 (2026-11-26): Grain and Glass starts again

**Players**
- Grain and Glass opens and plays again. Since v0.4.2 a stray comment hid part of its game description, so the page failed before its title card worked.

**Contributors**
- The site code budget is 120 kB compressed (decision 7).

## v0.4.3 (2026-11-26): a fairer two-seat Fable

**Players**
- **The Island Fable:** with two seats, turn rotation and the first-round truce, the second seat strikes first and won 56% of games. The first seat now starts one coin richer for each village dealt; measured over 1,000 games it is 49.6 to 50.4. Capo's one-village start is unchanged. Fable's rules are now version 6.

**Known problem:** Grain and Glass does not start in this version (fixed in v0.4.4).

## v0.4.2 (2026-11-26): fair tables, and a winnable Inch

The last batch of Phase 0.

**Players**
- **Brass and Banners:** a switch for turn order, a lean half-muster opening with two seats, and a round cap with a safe ending.
- **Grain and Glass:** the player asked answers a trade offer; a fixed turn order; fair trades, port prices, drought, sea-route cost and tolls fixed; the small island fits six seats.
- **The Island Fable:** rotating order and a first-round truce, as switches; landed boats are fed for one turn only; a new village removes your weakest unit and says so; the plain board fits every island.
- **An Inch of Ink:** Traditional can be won on every map (boats where needed, bots that sail, refunds, the smaller force spent first); rival strengths with a gentler normal; "You are out" with Watch and Restart; a time-limit switch; every game can be shared by link.
- Link play: a move that rolled dice cannot be taken back.
- Better contrast and sizes in the table screens.

**Contributors**
- The tests are rewritten as invariants, with a quick fairness run, and a GitHub check runs them on every push (`.github/workflows/check.yml`).
- The bundler skips comments when it reads exports.
- `package.json` carries the version from here on.

**Known problem:** Grain and Glass does not start in this version (fixed in v0.4.4).

## v0.4.1 (2026-11-26): Capo's safety

**Players (Capo, the story game)**
- A hard content line that lets ordinary statecraft through and still refuses what it must, checked on every input and on every reply line that is kept.
- A more forgiving reader for the AI's replies: chat formatting, names in place of codes, dates in words.
- Saves are checked before use, take-back records are small, and a visible warning appears when the browser will not keep the game.
- One AI call at a time, with Stop and a two-minute limit; the service's own error words are shown, and cut-off replies are caught.
- The places list is ordered by fronts, heartland and borders; homes sit on the main landmass; merged provinces are named by region, and six unnamed islands now have names. The old South America map is retired.

**Contributors**
- Fixture tests for the reply reader and for saves.

## v0.4.0 (2026-11-26): front page, privacy line, hygiene

The first batch of Phase 0.

**Players**
- Two coming-soon games have neutral names, as their working names clashed with published games.
- A true privacy line and a feedback link; the front page's broken browser check removed.
- Plainer advice on keeping an AI key.

**Contributors**
- Version 0.4.0 (from 0.0.1) in `site/config.js`; each built page is stamped with a fingerprint of its code, shown beside the version in the footer.
- Pages refuse to be framed and require Trusted Types.
- README brought up to date.
