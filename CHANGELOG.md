# Changelog

What changed in each tagged version of Overture of Empires: Capo, newest first. Each version is a git tag (`v0.5.0`); `git show v0.5.0` has the full detail. How a version is made: `RELEASING.md`.

## Unreleased

### Capo without a key, and the front door: from the second cold review

**Players**
- **Play by the rules, no AI, comes first.** With no AI connected, Advance opens with "Play by the rules, no AI" (and, on the first turn, a sample turn) above the connect form, instead of 1,400 px below it. The first time, the page says in a few lines what a rules-only turn does; after that the button moves the world at once. The browser's own question box is gone from every Capo screen: leaving a game, dismissing an adviser and changing the scale of play now ask in the page.
- **Your own words are kept.** A rules-only turn carries out your orders by card and keeps the actions you wrote yourself for a turn told by an AI, instead of dropping them.
- **The guide teaches the keyless game and the goal.** Two new steps: your goal (an ambition, chosen under your country's name) and the province card (treaties, demands, attacks and missions, with the rules' answer or the odds, all without an AI). The Begin step of setup names the goal too.
- **The province card** has a close button, closes on Escape, and is redrawn when a turn ends, so it never offers an order the world has overtaken.
- **The ledger's marks mean what they say:** a tick for what went your way, a cross for a move refused or an attack thrown back, a dot for news of the world.
- **Fog of war is a setting**, on by default, in the Game menu. Off, every country's state and answers are in view.
- **Opening a saved game asks first**, since it takes the place of the one you are in.
- **Connecting an AI on this computer:** `localhost:8000/v1` without `http://` is understood; a mistyped address and an address on another machine get different messages; Ollama's message names the exact value for OLLAMA_ORIGINS.
- **"Late 2026" names real leaders**, as they stand on 1 December 2026, and says so first: fiction with real names. Its facts are brought up to date. It is not yet the first choice; that waits for the owner's review of its text.
- **Front page:** a tab icon and a share card; the lantern says what it does (a brighter or a darker blue); the live board's caption says Paused when paused; the phone menu folds on a tap outside it; the Capo pitch says it can be played by the rules alone.
- **A page for addresses that do not exist**, pointing to every game and home, in place of GitHub's own.
- The source copies of the game pages under `/site/` now send a visitor to the built page in `/play/`, instead of showing a message about files.

**Contributors**
- `src/story/fog.js`: `g.fog === false` turns fog off (`setFog(g, on)`); saves keep it only when false.
- `formatOf` takes a turn code whose seed holds a hyphen (`t\d+-[\w-]+`, ruling 150). The tools line guide is 1,300 (ruling 150; a guide, ruling 141).
- `connectBox` takes `lead`: elements shown above the connect form. The page's in-page question is `sure(text, yes, then)`, lent to the features pages as `x.sure`.
- `site/source.js` is loaded by each source page and left out of built pages by `tools/bundle.mjs`. `404.html` sits at the repository root with whole paths.
- The gate lets a share card (`og:` and `twitter:` meta) name the site's own public address from `SITE_URL`.
- `site/icons/tent/mark.svg`: the compass mark, own work, the tab icon of every page.

## v0.9.0 (2026-11-26): the boards go 3D

### Every board on a war table, and Capo's world in relief

**Players**
- **The table games open tilted, in 3D.** Tiles have moulded rims, lamp-lit sides and tops shaped by the land: grain rows, clay pits, dunes, salt pans, rock and hills. Water has depth, a pale shore and gloss; wet ink shines. The board sits on a walnut table with a blue baize inlay. Flat, the old look, is one tap away.
- **Pieces and scenery stand on the board.** Armies, towns, villages, trees and ships are 3D models made in code, with soft shadows from one lamp. Numbers stay sharp on plates. In Brass and Banners the last dice lie on the table.
- **Capo's world as a lit relief map.** Real heights light the land; the sea has shelves and deeps; ice, rivers and lakes are drawn. Tilt rises as you zoom in. Capitals, armies, armour, guns, fleets, air wings and commanders stand on the map, and fronts are red lines. It works on the real world, alternate histories and invented worlds. A switch beside the zoom buttons returns to the flat map.
- **Board style**, a new row in Settings: War table (the default), Campaign map (ink on chart paper, pen-stroke slopes, wooden blocks) and Clear (flat light, heavier edges, larger outlined pieces). Capo follows the same choice.
- **Phones.** A device that reports itself as weak opens Flat; any other device that runs slowly in its first frames drops to Flat and remembers it.

**Contributors**
- `src/map`: a geometry kit, 48 code-made models (about 8,300 triangles in all), instanced drawing with shared depth, a lamp-view shadow map redrawn only when a piece moves; `src/map/style.js` holds the styles as data (ruling 147). `lab/models.html` shows every model.
- Capo's relief is baked offline from ETOPO 2022 (CC0) and Natural Earth (public domain) by `tools/relief.py` into `maps/relief.webp` and `maps/waters.json`; `tools/models.mjs` converts glTF models into a pack for the new, empty `site/models/` shelf. The gate allows `.webp` and `.bin` in `maps/`.
- Build notes: `docs/design/3d/build.md` (private).

## v0.8.2 (2026-11-26): Grain and Glass trades like the best

### Grain and Glass: a trade desk, counter-offers, rolls in view, sharper bots

**Players**
- **A trade desk.** Trade now opens a desk in place of a long list: choose whom to trade with (the bank, a player, anyone), what you give, what you get, and the terms. The bank row shows your own rate for each good, ports counted. Press T to open it.
- **Offers beyond one for one.** Offer two or three of a good for one, or one for two or three. An offer turned down cannot be made again that turn.
- **Counter-offers.** The player you ask can take it, turn it down, leave it open, or name other terms once: another good of theirs, or other amounts. You then agree or turn it down.
- **Bots that trade for a reason.** A bot takes a swap when it brings its next build closer and costs less than the bank would, or when it is plain profit that will not spoil. It never trades with a player two points from winning, asks the leader for two for one, and counters when it wants your good but not your terms. The easy bot still simply gives what it has more of. How to play says all of this.
- **Bots use plans.** Bots draw a plan when the price is goods their next build can spare, when a toll would win the Toll Warden, or when one more point would win, and they keep a harvest plan until its two goods finish a build.
- **Rolls and goods.** A small chart of every roll so far sits on the table on a wide screen, with a line on each bar where the long run would put it. The Rolls button (or L) opens the full sheet: the chart, how often the raid roll came, and what each player has gathered from the harvest. The end screen adds goods gathered. The dice come from the seed and are never adjusted.
- **Awards in view.** Your goods row shows where each award stands: your count, the holder and theirs, and a ring when a rival is one short of taking yours.
- **Placing with the numbers.** Each place for a depot says how many goods it would gather in 36 rolls; the board list gives the same for every hex. A message says what you gathered on each roll and what the toll gate took.
- **The gentle gate**, a Custom switch: the toll gate takes nothing from a player on 2 (or 3) points or fewer.

**Contributors**
- Glass rules are version 5: offers carry `n` and `k` (so many for so many, from `TERMS`), the `counter` move and `ask.countered`, `tried` (offers turned down this turn), the tallies `rolls` and `gained`, and the `spare` switch. Saves from version 4 do not open as version 5.
- Fairness, 1,000 Traditional bot games a seat count: wins by seat 49.9/50.1 at two seats, 31.5/32.8/35.7 at three, 25.7/24.4/25.8/24.1 at four, 19.6/18.4/21.4/19.5/21.1 at five, 16/16.9/16.8/18.2/16/16.1 at six. The widest gap is 4.2 points (three seats); every game ended on points.
- Token pieces now carry `pips` for the board painter to draw when it is ready; nothing draws them yet.

## v0.8.1 (2026-11-26): home politics, fog of war, scenes and map views

### Capo's missing features, round two: home politics, fog, scenes, scale, debate, map views, pacts

**Players**
- **Your council cares.** Every seat cares for two things: one that comes with the office (the Treasurer, a full treasury; the Interior, order at home) and one of the person's own. Every six months each member's favour moves a step toward the mood those make, and the receipt says which care moved it. Mood alone never makes anyone resign. Advisors shows what each cares for and which way their favour is heading.
- **Unrest has a face.** When your stability falls to shaken the rules name a figure and a province where trouble gathers; in revolt it is a rising. A rising left a year hands a province you took back to its old holder, or else costs a step of mandate. You can answer it from the sheet under your country's name: meet their terms (a step of treasury buys a step of stability), or move against them, a check with its odds shown before you order it.
- **You see others only as well as you know them.** Four tiers: clear (your own country, defence and alliance partners), reported (neighbours, trade partners, enemies, anyone you talked with this year), rumoured (old dealings; a rumour may be a step off) and dark. An Envoy on your council lifts each a step. Cards of countries you know too little of no longer show their answers before you ask; chats and the council are told only what your side knows. The AI that writes the turn is still told the truth.
- **Scenes.** Once a turn, live a moment in person: with a member of your council, another country's envoy, or (as a leader or a citizen) on your own. The AI writes the room, two or three choices and how each could end; the rules set the odds, show them, roll once and pick the ending. A scene moves one step of one thing (a member's favour, relations with a country, your own means) and never land, wars, treaties or offices.
- **Change the scale of play in a running game.** In the Game menu, step between nation, leader and citizen, once a turn. Your country and its past stay; standing goes to the new scale's own and your circle follows, each member to the matching seat.
- **Your own means.** A leader or a citizen has a gauge of their own, from destitute to wealthy. Once a year it moves a step toward where their standing and the country's treasury put it, and a scene can move it. Two new ambitions: a house in order, and a sphere of your own.
- **Convene the council.** The rules seat the two advisers who see the state of the country most differently (and your trusted adviser), and they argue your question to each other's faces. Words only.
- **Scenario authors can script beats.** In the Game menu, write moments of your own with a condition from a fixed list (war, peace, shaken, rich, unrest and more). Each comes once, ahead of the rules' own beats, and is saved with the scenario file.
- **Five more map views, with a legend:** war fronts, land changed, claims, spheres of influence, and what you know. The stability view now greys out countries you know nothing of and marks provinces in unrest.
- **Pacts and spheres.** From a foreign province's card you can propose a pact of non-aggression (five years; war between you is then a breach that costs the breaker at home and abroad) or demand a yearly tribute of a weaker neighbour. A country stands in the sphere of a much stronger defence or alliance partner, or of anyone it pays.
- **Invented worlds have terrain.** Each province of a fictional world is coast, plain, hills, forest, marsh, steppe, desert or mountain. It is flavour for the story and shown on the card; no rule reads it.
- Fixed: other countries now really do move by the rules when the AI proposes nothing for them, and suggested treaties appear. The page never gave the rules its list of provinces, so those two parts of v0.6.5 saw an empty map.
- Games saved before this are brought up to date with a note at the top of Actions: nothing in their past changes.

**Contributors**
- New rules, each under 150 lines with one receipt sentence: `src/story/home.js`, `fog.js`, `scenes.js`, `scale.js`, `debate.js`, `pacts.js`, `views.js`; scripted beats in `beats.js`; `more.js` stays the one door (its mark is now 2). The page part is `site/court.js`, lent through `site/realm.js`. Tests: `test/features2.test.mjs`.
- A receipt line may carry `gauge` pushes (`[[country, gauge, step, why]]`), read by `state.js`, and a `roll` (a check that is not an attack). A turn with a `roll`, taken back, moves to a new numbered line.
- `fog.js` exports `learn(g, country, tier, date)` for any rule that should teach the player something (a mission, say).
- `makeWorld(...).terrain` gives a word from `TERRAIN` for each province id, beside the map data so a world's fingerprint is unchanged (`src/map/worldgen.js`). The 3D map may read it.
- `site/worldmap.js` takes an optional `tint(id)` for views that colour single provinces.

## v0.8.0 (2026-11-26): missions, your own AI app, and deeper table games

### Brass and Banners: scored rounds, a hard bot, and battles you can read

**Players**
- **Capo is now ten scored rounds.** From round 2 you score at the start of your turn for what you still hold (1 for every three provinces, and each whole land's bonus; 2 for a capital when capitals are played), so every player is scored after the others have had their answer. After round 10 everyone left scores once more and the most points wins; level on points, the most land. Holding 65% of the land, or being the last one left, still wins at once. Custom has the same rule as a switch (Scoring), and a 10-round length.
- **A fairer first round.** Where the first round grows down the order (Capo, and Custom's "Round 1 grows down the order"), nobody now starts with less than half: the first to move places a little over half of its strength and the last places all of it. Before, the first of four placed nothing.
- **Battles on the map.** Every fight shows its last throw's dice between the two provinces and what each side lost, rising off the board, for bots' fights as well as yours. The panel says how many throws were made, what each side lost and whether the province fell, so a rolled-out fight no longer hides its cost.
- **The likely cost, before you roll.** Beside the chance of taking a province, the panel gives what rolling it out is likely to cost you.
- **Every die counted.** "Lands and dice" in the menu lists every die thrown by each player: how often each face came up, the average, and how far the dice ran ahead of or behind the odds.
- **A battle record at the end.** The end screen adds provinces taken and lost, fights won, strength struck down and fallen, each player's dice luck, and the boldest win of the game.
- **A hard bot.** It plans a whole march instead of one fight at a time, and counts what each fight is likely to cost. Against the ordinary bot it won 54 in 100 two-player Capo games, 60 in 100 two-player Traditional games, and 33 in 100 four-player Capo games where an even share is 25.
- **Bots move faster.** Placing and moving in take a fraction of the time they did; fights keep enough time to be read.
- The dice of the last fight no longer sit under the next one you choose, and the hidden dice box no longer keeps a label from another game.

**Contributors**
- Rules version 6 (one bump): `score` switch and `points` in the position, `gain()`, the new grade, `rounds: 10`. Fairness, 1,000 normal-bot games a seat count, widest gap between seats in points: Capo 7.2 / 2.9 / 4.0 / 6.4 / 3.3 at 2 to 6 seats; Traditional 0.8 / 4.1 / 2.3 / 4.0 / 6.6.
- `dice.js` gains `toll()` (the likely cost of rolling out, in thousandths) and `fair()` (one throw's expected losses). The battle record is counted by replaying the seed and moves, so it needs no saved state.
- Three small hooks in `site/table.js`: `G.hard` (offer a hard bot), `G.placeOf` (what places are ranked by) and `G.report` (a game's own figures on the end screen).

### The Island Fable: the voyage, guard numbers, a ledger, a hard bot

**Players**
- **The voyage.** A ladder of 24 named islands in four seas, for one player, from the title card. Each island is harder than the last: more rivals and better ones, larger and stranger islands, expansions, and a start less kind to you (six islands are grown for each step and one is kept, never one of the two worst for you). Winning opens the next two. Each has a par in rounds, your best result is kept in this browser, and the end screen offers Next island or Sail again.
- **Guard numbers.** With a village or unit chosen, each guarded rival hex beside its land shows its guard, red where that village or unit cannot take it. Tapping a hex you cannot take says what guards it, from where, and what rank it takes.
- **The purse before you spend it.** The move panel shows the chosen village's purse, what it earns and pays, and what the move you are aiming would leave, in red when the village could not pay next turn. It also says when a move cuts a rival's land in two or fells a village. End turn names a village that cannot pay, once, before it goes on.
- **A hard bot**, in the setup and by link. It reads its rivals as well as itself and looks for the cut that starves them. Against the normal bot it wins 62 to 68 percent of two-player games (420 and 224 games) and 43 to 47 percent of three-player games where a fair share is 33.
- **Villages have names**, our own, the same for a seed every time. The log and the lists use them.
- **The count.** The end screen shows, for each player, the most land held, rival hexes taken and lost, scouts raised, units starved and cuts made; the menu shows the same during a game.
- The status line says how many units can still act and how many villages can buy.
- The line about where the Traditional rules come from has moved from the setup card to the end of How to play.
- No rule changed: the Fable's rules version is still 8, so saves and links open as before and seat fairness is as last measured.

**Contributors**
- New: `src/games/fable/ladder.js` (the voyage's steps and how a step's island is chosen) and `names.js` (village names). `bot.js` has the `hard` tier and its reading, `keen`.
- Hooks in `site/table.js`, each one line: a game with `hard: true` is offered the hard bot; `figures(T, seat)` gives the end table its own columns; `next(T)` may replace the end screen's main button; `T.begin(match, kinds)` starts a game from the game's own page. `src/core/link.js` accepts the role `hard`.

### An Inch of Ink: call an attack back, find yourself, a guided first minute, your game in figures

**Players**
- **Call an attack back.** Under the Send button the attacks under way are listed, yours and any against you. Call back one of yours and it ends where it stands: a quarter of what is left is lost, the rest comes home at once. A Flood cannot be called back. Answer puts an attacker in the Send button's sights.
- **An attack on you is announced once**, by name, and stays in the list while it lasts.
- **Find me** (button, or F). A zoomed map slides to your land, your border glows, and a line says where you are, how much you hold and who is beside you. Your land also glows when you first start.
- **Tips for your first minute.** Five short tips that follow what you have done: where to start, sending into empty land, strength coming back, the first neighbour, the list and the goal. Each is said once to a screen reader. They turn themselves off after the last; the Tips button brings them back.
- **Your game, at the end.** Where you finished, your best share and when, orders sent and called back, strength sent, most strength held, land gained and lost, the nations you finished; and a chart of the leading nations' share of the land over the game, each line named, with the goal marked. The end table now shows each nation's ink and mark where it showed "Nations left" on every row.
- In real time the menu no longer offers to take back a move, U does nothing and E no longer asks to end a turn. In the turn duel a screen reader hears "is thinking" once a turn, not three times.
- Rules version 10: real-time games saved before this version are refused with a plain message. Bots do not call attacks back, so their games are unchanged.

**Contributors**
- `src/games/inch/live.js`: the move `{do: "recall", to}`, `recallLoss`, `recallable`, and `fl` on an attack that carried a Flood. `site/inchlive.js`: `under`, `find`, `bring`, `guide`, `figures`, `shares`, `stats`. The end figures are counted by replaying the saved moves in 10 ms slices.
- Shell hooks in `site/table.js`, three lines: `canUndo` and the E key ask `!T.match.position.live`; the "is thinking" status is written only when its words change.

### The table games' shared screen

**Players**
- **A real-time An Inch of Ink survives a reload.** The game was kept but Continue stayed hidden; it now shows, with the game time ("Continue: Age I, 2:30 of game time"), and leaving the page keeps the game to the tick.
- **Real time has no turn keys.** E no longer asks "End your turn?" and U no longer takes back ticks of a game on a clock; the menu leaves out "Take back your last move" there. Turn games are unchanged.
- **The keyboard stays in the move panel.** Closing "Since your last turn" with its × gives focus back to the move panel; closing a sheet gives it back to what opened it (Menu after How to play); Grain and Glass now starts with focus on its first list, not on the page.
- **Fewer repeats for screen readers.** "Saffron is thinking" is said once a turn, your own moves no longer blank and repeat the status line, bots' moves are shown but not read (the summary at your turn reads them), and the summary's buttons are no longer read with it.
- **Lists and menus.** Home and End jump to the ends of any list of choices, a long strip of choices scrolls to the one chosen, the menu's tabs are real tabs, and "Coda, coming soon" is passed over by the arrows.
- **Smaller things.** With reduced motion the board behind the title holds still. A key that asks for a move the rules do not allow just now says "That cannot be done now." instead of failing. "in 1 rounds" reads "in 1 round". The Link games box has a label you can see. The arrows on "What happened" are not read aloud. Summary, log and footer links are 44 px targets; a dialog's sticky buttons no longer cover the row Tab reaches; seat colours keep their colours when the system forces colours.
- **About and How to play** say which family of games each table game is inspired by, in genre words only, and the Game menu says that games are kept only in this browser, never sent anywhere, and can be saved to a file.

**Contributors**
- A game says it is played on a clock with `G.realtime` (true, or a test of the position); without it, a position marked `live` counts as real time. `T.realtime()` asks the same. `radio()` takes a fifth argument for tabs and a `soon` flag on a row.

### Capo: the end of Phase 4 (missions, three authored starts, a save that cannot silently fill, the accept step)

**Players**
- **Send someone.** Your council and two field agents (dealt by the rules, with code names) can go alone into another country: to scout it (missions there are 10 easier for a year), to sabotage it (its might is one lower for a year), or to bring home someone it holds. Tap a province of that country. You choose who goes, one of three approaches (quiet, bold, patient) and two standing orders (try a failed step once more or withdraw; press on or withdraw once hunted). You plan; you do not steer.
- **Odds before the order.** The card shows the first step's chance out of 100 with its parts, and the whole mission's odds counted exactly: clean, costly, failed, held. The same check as attacks, never above 75.
- **Alarm and alert.** Inside a mission an alarm rises with each costly or failed step; at 2 the mission is hunted, at 3 it is blown. A mission that ends noticed puts the country on alert (missions there are harder), and it knows whose hand it was: relations fall a step. Alert eases a point each quiet turn.
- **Capture, and rescue.** Someone caught is held: they lead no attack, give no counsel and go on no mission. Send a rescue, or they are let go after six turns. Anyone sent, hurt or away is likewise out for that time; that is the price of sending them.
- **A report, step by step.** The Ledger tells each mission in three or four short lines chosen from templates (no AI call), with the rules' numbers beside each. The receipt keeps one sentence and the whole record. A turn with a settled mission, taken back and played again, draws fresh numbers on a new numbered line, as attacks do.
- **Three authored starts**, listed first under "Authored starts": *Late 2026: the world as it stands* (the present day with its quarrels, one great war under way), *The Nile and the Horn, 2027* (a regional brink, no war yet) and *A Cold Peace, 2029* (an armed peace, treaties everywhere). Each is fiction and says so; each names offices, never people. A start may now say where pairs of countries stand (hostile to close), so the world does not begin as a blank slate. **Their text is a first draft, waiting for the owner's review.**
- **A save that cannot silently fill.** The Game sheet shows how big your game is and how much of this browser's room the site uses. At half you are warned and offered a file. At three quarters older turns are kept in short (what the rules decided and one sentence), take-backs fall from 20 to 5, old chat messages go, and you are told what went. If the browser still refuses, a bar across the top says "Not saved" until a save works, and the page asks before it closes.
- **The save promise**, stated where saves are handled: until launch one a save may end when the rules version changes; from launch one the previous rules version stays loadable (ruling 143).
- **An accept step before a first story game**: what the story game is, the one line it never crosses, where your words go, and a tick that you are 18 or older. Asked once in each browser.
- **"Fiction" on newspapers**, and on anything copied out of the story's panels (the copy carries a line saying it is fiction from a game of Capo). A scenario file you save says so too.
- **One sentence on AI services**, at the accept step and beside the AI settings: each service's own rules bind your key.
- **Every prompt names its own stage** (ruling 143): the real world, an alternate history by its year and turning point, or a fictional world, in the turn prompt and in chats, the council and counsel. The correcting line beneath is gone.

**Contributors**
- New rules in `src/story`: `missions.js` (the plan, the steps, the odds, the turn's settlement; about 150 lines), `roster.js` (who can be sent and how they are), `missiontext.js` (the template report), `keep.js` (what a save lets go, and when), `authored.js` (the three starts). New page parts: `site/missions.js`, `site/keep.js`, `site/accept.js`. Tests: `test/capo4.test.mjs` (15), including 100,000 missions a kind held to the shown odds within 1 point, and a 200-turn game with fifty chats that saves every turn.
- Hooks in existing files are single lines marked "missions hook" or "phase 4 hook": `src/story/turn.js`, `worldrules.js` (a held or absent commander), `war.js` (sabotaged might), `saves.js` (a settled mission counts for take-back), `scenarios.js` (`rel` and `fiction` in a scenario file), `presets.js`, `overlay.js` and `talk.js` (`stageOf`), `site/game.js`.
- Take-back records no longer hold chats or counsel: what was said stays said when a turn is taken back.
- Sizes: `src/story` 79.5 to 96.9 kB compressed (above its 90 kB guide; the three starts' text is about a third of the growth), site code 168.2 to 176.4 kB, everything shipped 596 to 622 kB.

### Your own AI app as the storyteller, and plugins that are only data

**Players**
- **The Capo bridge (optional).** If you use an AI app that speaks MCP (Claude Code, Claude Desktop, Codex and others), it can tell Capo's story on its own sign-in, with no key. You run `node tools/capo-mcp.mjs` from Capo's source yourself; it prints a page token. In Capo, under Game, How Capo reaches an AI, choose the service "Your AI app (MCP bridge)", paste the token and press Check the bridge. Add the bridge to your AI app as the script says, start a turn, and tell the app "play my Capo turn". Capo never starts the bridge and reaches it only after you choose it and paste the token.
- **What the AI app can do.** Four tools: read the prompt Capo is waiting on, hand a reply back, read a short summary of the game (date, turn, your country, wars, treaties, offers, your waiting actions and the last receipt), and, only if you tick "Let my AI app propose orders", propose a treaty, peace or an attack. A proposal is answered by the rules at once (who would agree, the odds, or why not) and shown to you with Accept and Dismiss. Nothing is ordered unless you accept it, and the rules carry it out only when you advance.
- **Prose styles and tones.** A new Plugins section in the AI settings chooses how the story is told: a prose style (two come with Capo: a court chronicle, a wire report) and a tone (grim and spare, wry and worldly). They shape the wording only; the reply format, the facts and the rules stay as they are.
- **Plugin files.** A plugin is a small JSON file you open: a prose style, a tone, a service preset (another server on this computer, or more models at a service Capo already lists) or a scenario pack (up to twelve scenarios in one file, opened from the first screen with Open a scenario file). Capo checks each like a save, keeps only the parts it knows, refuses any text with a web address in it, and runs nothing. Examples are in `test/fixtures/plugins/`.

**Contributors**
- New: `tools/capo-mcp.mjs` (MCP's JSON-RPC by hand over stdio and Streamable HTTP, and the page's endpoint; Node's own modules only), `site/aimore.js` (the bridge's and the plugins' page parts), `src/story/bridge.js` (the game digest, a reply's shape, the rules' answer to a proposed order) and `src/story/plugins.js` (the checks). Tests: `test/mcp.test.mjs`, `test/plugins.test.mjs`.
- The bridge binds 127.0.0.1 only, checks the Host and Origin of every request, and has two tokens (one for the page, one for an AI app over HTTP) kept in `.capo-bridge.json` in the home folder. The page rule is unchanged: connect-src already allowed this computer.
- Hooks in existing files are single lines marked "mcp hook" or "plugins hook": six in `site/ai.js`, and in `site/game.js` two imports, one call and the pack opener beside the scenario shelf.
- Growth: about 7.5 kB compressed in `site` and 6.5 kB in `src/story`, and 272 lines in `tools` (now 1,275 against a 1,000-line guide).

## v0.7.1 (2026-11-26): connect an AI; no more copy and paste

### Capo connects to an AI; no more copy and paste

**Players**
- **Capo asks your AI for you.** Copying a prompt into a chat and pasting the reply back is gone. Connect a service with your own key (OpenRouter's free models, Groq and Google Gemini have free tiers, Cerebras a trial credit; OpenAI, Anthropic, Mistral, DeepSeek and Together AI are paid by use) or an AI on your own computer (Ollama, LM Studio, a llama.cpp server or another local server). Check connection is how you connect: once it answers, Capo uses that AI for every turn, chat and council question, and Disconnect stops it.
- **With no AI connected, Advance shows how to connect one** right there, and carries on with the turn as soon as the check succeeds. The same step appears when you message a country, ask your council or fill in your character.
- **You can still play with no AI.** "Advance by the rules alone" moves the world with no story, on any turn. On the first turn, "Play a sample turn" plays a short turn Capo writes itself, as a demo; Take back undoes it.
- Questions held for your next turn, and their folded answers, are gone with the paste route. If you had chosen to paste by hand, Capo now reads that as not connected and says so in the AI settings.

**Contributors**
- `site/ai.js`: the paste box and the route choice are removed; `connected(route)` is the one test, a saved route of "paste" loads as "none" with a note, and `connectBox()` stands in for a reply that has not come. `src/story/replyform.js` loses `fold` and `unfold`. Ruling 142.

## v0.7.0 (2026-11-26): new worlds, and a deeper Capo

### A deeper Capo: gauges, ambitions, crises, causes for war, the press

**Players**
- **Your country has a state, kept by the rules.** Three gauges in words: stability (in revolt, shaken, steady, calm, united), treasury (empty to overflowing) and mandate (rejected to acclaimed). Each moves one step a turn at most and always for a reason the receipt gives: land lost, a year at war, peace, a year of trade, land taken, an attack thrown back. A country in revolt declares no war and makes no attack; an empty treasury declares no new war. Tap your country's name in the top bar to see them, and "Map: stability" to see the world's.
- **A war wants a cause.** Land taken from you, a treaty ended on you, land you claim, a treaty partner under attack: each is a cause, and the sheet lists yours and your neighbours'. A war begun without one shakes your stability.
- **Crises.** From a foreign province's card you can demand it. Its holder answers by rule on a set day, and the card shows the answer and its reasons before you ask (strength, a cause, another war to fight, trouble at home, a protector, its heartland). It yields the province or refuses; a refusal costs you a step of mandate and of relations. After six quiet months the rules may open a crisis on their own over land that changed hands or is in dispute. When the demand is on you, the answer is yours: Refuse or Yield, at the top of Actions.
- **Ambitions.** Choose a goal from a fixed list (a greater country, what was ours, a ring of friends, a trading power, a golden age, the long peace, unbroken; for a citizen, a name in the land). The rules count it, the AI is told how far along you are, and only the rules can call it met. The game goes on and you may choose another.
- **The reckoning.** Your game so far in five lines, counted by the game: turns, land gained and lost, wars, treaties, the state of the country, ambitions met. Copy it to share.
- **The turn's beat.** On about four turns in ten the rules pick one authored moment that fits the state of your country (a strike when the treasury is strained, the wounded coming home in wartime, a festival when the country is calm) and the AI writes it. A beat changes no fact.
- **The press has stances.** Four papers are fixed for each game: one close to the government, one against it, one for trade, one foreign. The AI is told to keep each in character.
- **Every past turn in full.** The Ledger has a Turns tab: each turn the game still holds opens to its actions, events, press and what the rules decided.
- Games saved before this are brought up to date with a note at the top of Actions: nothing in their past changes.

**Contributors**
- New rules, each under 150 lines: `src/story/state.js` (gauges and causes), `crisis.js`, `ambitions.js`, `beats.js`, with `more.js` as the one door the turn calls. The page part is `site/realm.js`. Hooks in existing files are single lines marked "features hook".

### Alternate histories

**Players**
- **Capo: alternate histories.** Step 1 of a new story now offers six worlds where one turn of history went another way, each on the real map with its own borders, countries, treaties and disputed land: The Kaiser's Peace (1936, the Great War ended on Berlin's terms), The Imperial Federation (Britain, Ireland, Canada, Australia and New Zealand as one state), Two Chinas (the civil war stopped at the Yangtze), The Union Treaty (1996, nine republics still one Union), The Four Quarters (the Andes were never conquered) and The European Federation (ten countries of western Europe as one). Choosing one shows its premise, the point where history turned and how it is balanced, and the map behind the panel changes to match.
- Every alternate history is labelled fiction. Leaders appear as offices, never as real people, and the AI is told each turn that the world is invented, where it turned, which countries differ and which do not exist, and to keep to the year it is set in.
- A game in an alternate world saves, reloads, takes back and can be saved as a scenario file like any other. A province there is "taken from" someone only when it changes hands in your story.
- The turn prompt now always names your own treaties before your neighbours' when there are more than twelve to list.

**Contributors**
- `src/story/presets.js` is the one list of presets (`PRESETS`, `KINDS`): one import and one spread for each lane. `src/story/althist.js` holds the six alternate histories as scenario-shaped entries with an `overlay`; `src/story/overlay.js` lays an overlay over `maps/world.json` (whole countries merged, single provinces given, countries renamed or made, disputes dropped and added), checks the `alt` part of a scenario or a save, and puts a world's borders and names under the loaded map (`rebase`). A game in an alternate world carries `alt` and `base`; take-back records leave `base` out. No new map file and no download. `src/story` is about 46 of its 60 kB.

### Fictional worlds

**Players**
- **Capo, the story game, has worlds of its own.** Step 1 of the wizard lists five fictional worlds under "Fictional worlds", each with its own map, countries, names, premise and tone: **The Vacant Throne** (a low-fantasy continent of rival kingdoms), **The Salt Ledger** (an archipelago of trading city-states in an age of sail), **Grass and Granary** (an old farming empire and the rider peoples of the steppe), **The Long Silence** (a far-future colony world cut off from old Earth) and **The Paper Republics** (new nations in an age of steam). All five are our own: no real country, person or event, and nothing from anyone else's fiction.
- **Roll a new world.** Each of these worlds is made from a seed. "Roll a new world" makes another map, with other countries and names, for the same setting; typing a seed someone gave you makes exactly the world they have. The same seed always makes the same world, on every device.
- **The rules are the same everywhere.** Might, relations, wars, treaties, attacks on the check, the council, chats, take-back, saves and scenario files all work on an invented world as they do on the real one. The AI is told where the story is set, its tone, what exists there (the level of craft or magic), its peoples and its powers, as story facts you can read and remove in Game Master.
- **Settings are files too.** A setting saved as a file (kind `capo-setting`: a shape for the land, cultures as sounds for names, factions, a premise, a tone) opens with "Open a scenario file". A file that cannot be read is refused, with the reason.

**Under the hood**
- `src/map/worldgen.js` makes a world from a recipe and a seed in the same shape as `maps/world.json` (arcs, provinces of arcs, neighbours, narrow seas, countries), in whole numbers only, so the story map draws it unchanged: about 220 to 300 provinces, made in a fraction of a second, nothing added to `maps/`. `src/map/worlds.js` holds the five recipes; `src/story/settings.js` checks setting files and turns a setting into a scenario; `src/story/presets.js` is the one registry every lane's ready-made starts are listed in.
- A game on an invented world carries `world: {setting, seed, gen}`; saves and scenario files with a world that cannot be made are refused. The generator has a version (`GEN`), and the tests hold the five starter worlds to fingerprints, so a saved game is never read onto a changed map.
- Tests: `test/worlds.test.mjs` (the same seed gives the same world, outlines close, every province reachable, fair homes, names clear of real ones, saves and scenarios replay, bad setting files refused); a browser check, `node test/browser/worlds.mjs`, picks each world, sees the map and reads the first prompt.

## v0.6.8 (2026-11-26): connect your own AI

**Players**
- **Connect a service in a few steps.** Game, How Capo reaches an AI: choose Paste by hand, or Connect a service, then pick one: OpenRouter, Groq, OpenAI, Anthropic (Claude), Google Gemini, Mistral, DeepSeek, Together AI or Cerebras with your own key, or Ollama, LM Studio, a llama.cpp server or any chat-completions server on your own computer, with no key. Each says what it costs and whether it works from a web page. Services that turn web pages away (Azure OpenAI, Amazon Bedrock, Google Vertex AI, SambaNova) are named as needing a server in between, which Capo does not ship.
- **Check connection** lists the service's models (spending nothing) and asks for one word, then says plainly what is wrong: a refused key, no credit, a model the service does not know, a call blocked from the page, too many requests, or no answer.
- **Your key stays yours.** Kept apart from the settings, only while the tab is open unless you choose Remember on this device; Forget my key clears every copy. It never goes into a save, a file, a web address or a message shown, and only to the service it is for. Remembering it shows a plain warning: any page at the same site address can read it until Capo has an address of its own.
- **Waiting is visible.** While the AI writes you see who you are waiting for, the seconds passing and the text as it arrives, with Stop. Too many requests or a busy service is tried again three times with growing waits; the prompt is never lost.
- **Structured replies.** Where the service allows tool calls, the AI fills in a form instead of writing lines; Capo turns it back into the same lines and the rules judge them exactly as before. A model that refuses is asked again for plain lines, and that is remembered.
- **Each call has its own reply allowance** (a turn 1,800 tokens, a chat 400, counsel 500, a character 300), four times as much for thinking models (Thinking model, or known by the model's name).
- **Pasting is easier.** The paste box puts Copy first and says Copied, can paste the reply from the clipboard, names the kinds of AI that work (free ones too), shows the whole prompt at full height, and scrolls to it with focus on Copy. Try a sample reply plays a first turn with no AI at all. A chat message or council question can wait and go in the same prompt as your next turn, so one paste answers all three.

**Contributors**
- `site/ai.js` (services, key storage, calls, streaming, errors, retries, and the page parts), `src/story/wire.js` (the three request and reply shapes), `src/story/replyform.js` (tool forms, folding, the sample reply); small hooks marked p5-ai in `site/game.js`.
- The Capo page's connect-src lists exactly the services in `site/config.js` (`AI_BASES`) and this computer, and the gate holds them equal. `test/ai.test.mjs` covers each shape with a stand-in fetch.

## v0.6.7 (2026-11-26): learning every table, and a Glass lesson

**Players**
- **The lessons are fair now.** The Island Fable's lesson keeps the same turn order every round, so the bot no longer moves twice in a row straight after the truce, and its bot is gentle: it takes nothing in the first two rounds, then at most one hex a turn. Brass and Banners' lesson bot strikes nobody in round 1 and then takes at most one province a turn, on good odds only.
- Banners' lesson says how to win in its first step, says the real number you place on your first turn (a third, when you move first), and has a new step: guard your border.
- **Nothing floats on the board.** The lesson card and "Since your last turn" sit at the top of the move panel, and the board is fitted beside the panel at every size, phones included. The lesson card can no longer catch a tap meant for the map.
- **Take back is a button.** Every turn game shows Take back beside End turn whenever a move can be taken back, and says so when it is done.
- **Fable never chooses a purchase for you.** After you buy something, the button waits for you to choose where again; a first tap on the map aims a purchase and a second buys it, and tapping a ready unit of yours chooses it rather than buying a scout onto it. How to play says when the turn order moves on.

**Contributors**
- A lesson-only bot tier, `gentle`, in `src/games/fable/bot.js` and `src/games/banners/bot.js` (not in `TIERS`, not offered in the setup); `test/lessons.test.mjs`. The Fable lesson is Custom with Traditional's switches and a fixed order. No rules changed and no rules version moved.


**Players**
- **Grain and Glass has a lesson.** The first Play offers "New here? Learn by playing": a short game on a small island against a gentle bot, 8 points to win, in nine steps. It shows where to put your first depots and routes, what the roll does, how to trade, what building costs and scores, when to end your turn, the raid roll and the toll gate, the awards and plans, and how to win. Teach me again is in the menu.
- Grain and Glass keeps the goal in view: the top bar says "Round 3, 10 points to win", and How to play now starts with how many points win.
- Builds you cannot pay for yet stay in the move panel, greyed, with what is missing ("missing 1 Clay") or why there is nowhere to build. On a wide screen a small cost card sits at the top left and says the same for every build.
- Hex numbers stay in view while you choose: a hex you can pick gets a silver edge and a ring round its number instead of a mark over it. On a phone the numbers are smaller than the hexes, so the colour of the land shows and they no longer run together, and the island fills the screen with less sea around it.
- The roll now says its total ("Rolled 6 and 3, so 9"), and the numbers that yielded get a bright band.
- The last gold on the boards is gone: what you can choose, what yielded and the chosen piece are marked in silver in every table game, and in Capo your own land and "you" on the friends and foes map are silver.

**Contributors**
- `src/map/board.js`: a `fit` option frames only the cells given; a legal hex with a number token is ringed round the token, not dotted over it; highlights are silver, and the land lines between lands keep their own colour through a new `uLand` in `src/map/paint.js`.
- The lesson uses the coach's existing API through the game's own `lesson` hook in `site/glass.js`; no shared file changed for it.

## v0.6.6 (2026-11-26): An Inch of Ink for every player

**Players**
- **An Inch of Ink in real time can be played without a mouse.** You choose your ink on a card before the map, then a place to start from a list of good ones named by where they are ("Europe: room for 115, nearest nation 7 away"), then where to send from a list of the empty land, neighbours and coasts in reach, each with its share of the land and its strength, and a Send button. Arrow keys, Home and End move in the lists; S tells your strength, land and goal; Space pauses (unless a button has the keyboard). Tapping the map works as before.
- The panel no longer talks every half second. A screen reader hears the start, a nation gone, the ages, your land passing a quarter, half, three quarters and nine tenths of the goal, pausing, and the end; strength sits in a plain line that is read only when you go to it.
- Your land on the chip reads "1525, goal 1844", not "1525/1844", so the second number is plainly what wins and not the whole map; the phone keeps the word "goal". The same in the turn duel.
- The map shows what an order did: an arrow and a ring point at the front of your biggest attack under way, a ring marks where the chosen row would send, and the coasts your boats reach glow when you choose a boat row or a coast is too far. The panel lists what is under way ("Under way: 62 against Pell").
- Every nation's name is written on its land (the larger ones on a phone), no nation is a near twin of your colour, and nations sharing a seat pattern differ in lightness. The leaderboard rows are buttons with the nation's name, its ink written out, and its share; the list holds still while your pointer or keyboard is on it, and a new game no longer shows the last game's standings.
- The clock has 0.5x, 1x, 2x and 4x as a labelled choice; Pause stays Pause and shows whether it is on.
- "Strength 5514 of 5316" now says it is over the limit and falls back slowly.
- Messages stay up long enough to read (four seconds or more, longer for long ones), in every game.

## v0.6.5 (2026-11-26): wars that end, people who matter

**Players**
- **Capo remembers people and open matters.** The AI may name up to two people a turn and open or move up to two threads; neither is required, and no reply is refused for lacking them. The game then follows each mention by its own code. Twelve people are sent to the AI each turn: your council, the people you chat with and the people you pin, always; the rest by who was mentioned most recently. Six threads stay open; one that nothing touches for twelve turns closes by rule and is noted in the chronicle. The Ledger has a People tab with Pin, Forget and Close.
- **Wars end.** Each side of a war grows weary: one point for every six months, one for every two provinces lost. Peace is now answered by rule, with its reasons, as treaties are (weariness, +1 for every province between the two sides in the war's score, at most +3, and +1 for another war to fight; it needs 4, and each side keeps the land it holds). At the end of every turn, whatever the AI wrote, two countries that would both say yes make peace, an enemy of yours that would say yes offers you peace, and at weariness 6 the rules make a white peace for anyone. A truce of two years follows every peace. An enemy's province card shows what it would answer before you ask.
- **Strength changes.** A country's might in a check is its might from the table, less one while it is weary (3 or more), less one once it has lost a third of the land it began with, plus one once it has gained a third. Cards show it with its parts.
- **The world moves without an AI.** When the AI is down, or its reply proposed nothing for other countries, they move by published rules: a country at war attacks where its chance is 45 or more, a country with a grudge (-2 or lower) and an edge of 2 in might may declare war one time in four, and one country a turn asks a neighbour for the next treaty up when the answer would be yes. "Advance by the rules alone" plays a turn with no AI at all: orders given by card are carried out, and no story is told.
- **Your moves are shown before the rules run.** When the AI reads a move for your country out of your actions (a war, a treaty, an attack you did not order by card), it is listed with a tick. Untick it and the rules never see it.
- **Suggested actions, with the rules' answer.** Actions lists orders built from the state of the game: peace with each enemy and what it would answer, the best attack and its odds, the next treaty up with neighbours who would agree. One tap orders it.
- **The story is told with the result known.** For an attack you ordered, the AI writes one sentence for each ending; the rules settle the attack and the page shows the ending they chose, in the same turn.
- **Nothing typed is dropped, and the first turn can be tried with no AI.** Advance now takes an action you typed but had not added; a reply that was refused stays in its box; a chat message whose call failed is kept. The paste step says what kinds of AI work, shows the prompt taller, confirms the copy on the button, and offers "Try a sample reply", a reply Capo writes itself.
- Focus follows the screen: a panel's heading takes focus when it opens and the dock button gets it back on Close, each setup step focuses its heading, and Advance moves focus to "Copy the prompt" and says the prompt is ready.
- Games saved under the previous rules are converted with a note; past turns keep their results.

**Contributors**
- `src/story/people.js`, `war.js`, `rivals.js`, `suggest.js`; `reviewMoves` and `untick` in `worldrules.js`; the might table moved to `war.js` (still exported from `worldrules.js`). Story rules are version 4. `src/story` is about 43 of its 60 kB. `site/game.html` is unchanged: every page addition is in `site/game.js`.

## v0.6.4 (2026-11-26): the games come first

**Players**
- The front page shows the four table games straight after the opening, before Capo, which needs an AI you bring. The opening sentence now says what the five games are: world conquest with dice, a hex island war, a settle-and-trade race, a real-time land grab, and a story game told by an AI.
- Every part of a game card opens its game, and so does the live board at the top, marked "Play this game" (Pause still stops it, and it still waits to be asked when you prefer less motion).
- Smaller fixes: the version pill and "build dev" are gone from the page, "What is new" shows the latest versions, Capo's button says "Try Capo", its labels no longer look like buttons, the lantern has a tooltip, links to GitHub say they open in a new tab, and the figures and fairness lines read more plainly.

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
