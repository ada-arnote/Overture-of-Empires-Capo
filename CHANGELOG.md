# Changelog

What changed in each tagged version of Overture of Empires: Capo, newest first. Each version is a git tag (`v0.5.0`); `git show v0.5.0` has the full detail. How a version is made: `RELEASING.md`.

## Unreleased

### Motion that reads: dice you can see, a raid you feel, goods that fly, battles that are battles (cold review 3, fix 4)

**Players**
- **Dice you can see.** Thrown dice are three to four times larger (about 50 px on a phone, up to 84 px on a desktop in Grain and Glass) and are held for a beat with the number thrown under them, where the eye already is: the middle of the part of the board you can see.
- **Grain and Glass: the 7 is staged.** A raid roll shows "7 raid" in red, the edges of the screen darken once, and a drum sounds. The toll gate is then carried to its new hex, and the good it takes visibly passes from one player's card to the other's, with "−1 Salt" and "+1 Salt" beside them. Goods lost to spoilage show as "−1" by the card.
- **Grain and Glass: goods fly.** After a roll, each yielding hex sends a crate of its good to the card of every player who gathers from it, the card glows as it arrives, and "+2 Grain"-style chips say what came in.
- **Brass and Banners: battles feel like battles.** Every throw of a fight is thrown on the table (for a long "Roll it out", the last eight), the losing dice dim, each side's strength counts down beside its province as losses fall, and the last throw is held. Then the army marches in and the province takes its new colour; it no longer changes colour before the dice land.
- **Bots take their time.** At the Normal speed a bot waits about 1.6 times as long between actions, and waits for the dice, the raid or the capture to be seen before it moves on (never more than 3.5 seconds). Fast and Instant in Settings are as they were.
- **Nothing waits for the motion when it is your move.** You can act about a fifth of a second after a bot's move, while its dice are still rolling. With motion reduced (Settings, or the system's wish) none of this moves: the result is shown at once, as before. The new sounds (another throw, the raid, a theft, goods arriving) are made in code and follow the sound switch and volume.

**Contributors**
- `src/map/motion.js`: `dice()` takes `total` (the number held under the dice) and `fadeMs`; new effects `fly` (a crate or the gate carried between two points), `chip` (a rising "+2 Grain"), `tally` (a strength that counts down and shakes), `raid` (a darkened edge); `createMotion(parent, { z })` and `drop(tag)`.
- `site/motion.js`: `bannersDice` throws the whole fight as a run (`losses()` splits the fight's cost by throw, made to add up to the rules' totals); the Glass plan stages the raid, the toll and the harvest; `stageLeft()` says how long the moment still needs; `stir()` returns how long the board may wait before recolouring what a fight took, and times the cues to the motion. `room()` keeps the dice inside the part of the board that is not under a phone's move sheet.
- `site/sound.js`: cues `rethrow`, `raid`, `steal`, `gather`; `cuesOf(key, events, move, p, at)` takes the motion's timings. `site/shell.js`: `PACE.normal` 1.6.
- Small, marked hooks ("motion hook p12"): `src/map/board.js` `show({ after })` lets the cells in `order` wait for the dice; a held piece stays held through the next position and takes its new count; `release()`; held pieces come back on a timer instead of a redraw every frame. `site/hexboard.js` passes `after`; `site/table.js` uses `stir`'s answer, keeps a person's wait to the board's own, and lets a bot at Normal wait for `stageLeft()`; `site/glass.js` gives the motion each hex's neighbours and the goods' names and colours (`T.motionHints`); `site/banners.js` leaves the loss badges to the run when it plays.
- `test/motion.test.mjs`: the new cues, and sounds timed to a run of throws, a raid, a harvest and a theft.
- Measured in headless Edge with the GPU, 1440x900 and 375x812: the motion layer's work per frame is 0.4 to 0.7 ms (median), under 2.5 ms at worst; the page's frames stay at 8.3 ms (median). The rare long frames (up to about 600 ms) carry under 20 ms of script and no blocking: they are the graphics process (new 3D models, screen captures), not this code.

## v0.10.10 (2026-11-27): the whole map on open, and phones get the board

### The camera and the phone held upright, in every table game (third cold review, fixes 3 and 5)

**Players**
- **The whole world on one screen.** On a wide screen, Brass and Banners' world map and An Inch of Ink's world open on the whole map, right of the move panel and clear of every panel, and Home goes back to it. A small window comes in only as far as a province needs to be 24 px across (about 1.2 times at 1024 by 700). The record of what happened keeps to the table above the map (it takes a column of its own only where there is too little room there).
- **The camera comes home.** When your turn starts, a view you have zoomed glides back to your own land if it has wandered (after following a rival, say). It never moves within six seconds of your own pan, drag, wheel, pinch or zoom button, never at the whole-board view, and with reduced motion it goes there at once. A change of board look keeps the view you had.
- **A phone held upright.** The board keeps at least 56% of the height. The move sheet has a set height, floats over the foot of the screen and scrolls inside; choosing, folding and unfolding it never move or resize the board. The board opens close enough that a hex or a province is at least 36 px across, centred on your land (at 375 by 812: Fable's hexes 19 to 37 px, Grain and Glass's 31 to 36 px, the board 41% and 35% of the height before, 56% now). Brass and Banners' provinces open 41 px apart (31 before). An Inch of Ink's world opens as tall as the free space. On a phone on its side, Fable's hexes are 35 px (21 before).
- The zoom row and the toasts share a band just above the sheet, side by side, so a toast is never under the buttons; they follow a folded sheet down. Grain and Glass's key sits under the seats, off the board, on a phone held upright, and beside the zoom row on a phone on its side or a small window.

**Contributors**
- One camera policy, written at the head of the layout in `src/map/board.js` (layout hook): `layout({ least, tall, at })` (`fill` is gone: `least` is the pixels a place must be across at the opening view, measured on the screen at the far edge of the view; `tall` opens a map of fine cells as tall as the free part); `come(i)` (the turn-start glide, held off for 6 s by the player's own hand); `bounds` (where the whole board lies on the screen). `site/hexboard.js` asks for 36 px on a phone and 24 px elsewhere, keeps the key off the board, and finds your land on a board of hexes too. `site/table.js`: `place()` gives the phone's sheet its set height (`--act`) and no longer refits the board as the sheet changes; `herald()` calls `come`. `site/table.css`: the sheet's height, the toast and zoom band.


## v0.10.9 (2026-11-27): Capo without a key gets a gazette, pressure and an ending

### Capo with no AI as a game on its own terms: a gazette, pressure, war from the card, an ending (cold review 3, fixes 6 to 8; story rules version 6)

**Players**
- **The turn is told.** With no AI, the Ledger now opens on a short gazette written by the rules from what happened: first your own country, then the world, in plain sentences with countries and provinces named and dates in words. The sums are still there, one tap away under "Why". The lines "no story was told" and "no AI proposed anything" are gone.
- **The world presses you.** By the end of turn 2, 3 or 4 something is done to your country, and again from time to time: a neighbour demands a border province, patrols cross your border (protest or let it pass, each with its price), two neighbours sign a defence treaty against you, or a hard season brings unrest. A partner at war now calls you to arms: join, or the treaty is cut back a rung.
- **Treaties cost and show.** A defence or alliance treaty wants the last treaty with that country to be a year old, and each pledge you have already given makes the next harder to win. A country's card says what your treaties come to in numbers, and your pledged partners are edged in green on the map.
- **War from the card.** A foreign province's card has a War section: your cause (or the price of having none), both sides' might, who would join against you, the odds of an attack on that province, and Declare war, Join the war, or End the treaty.
- **An ending.** Your ambition and its count sit beside your country's name. When it is met a screen says so, with the reckoning and the next ambitions to choose from. A country that loses its last land gets its own last screen: take the turn back, begin again, or watch the world go on.
- On a phone, the short notice after a turn no longer stretches over the Ledger.
- A game saved under rules version 5 is brought up to date and told what changed; its past turns keep their results.

**Contributors**
- `src/story/gazette.js` (new): `gazette(g, entry, geo)` builds the prose from the receipt's own records (`fact`, `check`, and new small tags), two or three templates a case, drawn from the seed and the turn; `wordDate`, `spanWord`. It changes no fact. `closeTurn` takes `{rules: true}` for a turn with no AI, marks the log entry and uses the gazette's first sentence as the summary.
- `src/story/pressure.js` (new): `settlePressure` (called from `settleMore`, before the gauges move), `protestAnswer`, `standBy`, `beside`, `pressureLines` (two short prompt lines, only while something waits), `keepPressure`. Game fields: `press`, `incident`, `call`, `called`. Every draw is named from the seed and the turn, so a seed and its orders replay.
- `src/story/relations.js`: two new parts in `treatyAnswer` ("the ink still wet", "N pledges already given"), `pledges`, `WAIT`; a start's treaties carry `old: 1`. `ambitions.js`: the met line carries `met`, and `g.over` is set when the player's country holds no land. Receipt lines carry `offer`, `asks`, `land`, `press`, `call`, `incident` where they apply. `saves.js`: WAR and BREAK orders by card are kept; a note for games from version 5. `suggest.js`: a call to arms heads the list.
- `site/keyless.js` (new): the gazette view, the pressure cards in Actions, the War section and the treaty note on the card, the ambition chip, the win and loss screens. `site/game.js` and `site/worldmap.js` carry one marked line each place ("keyless hook").
- `test/keyless.test.mjs` (10 tests): on 40 seeds the player is pressed by the end of turn 4 and the turns replay; the gazette holds no codes, sums or numeric dates. Three earlier tests follow the rule change.

## v0.10.8 (2026-11-27): the third cold review's bugs, fixed

### Fixes from the third cold review (30 November)

**Players**
- **Capo: crises and missions before the year 1000.** In a world that starts before the year 1000 (The Vacant Throne, 912), a crisis said "to be answered by Invalid Date" and never came due, so "A crisis is already open" blocked every later demand. Its day now keeps a four-digit year ("0912-06-01"), prints, and comes: the demand is answered on its day. Mission dates (a watch known, a sabotage) and the end of a truce in those worlds were wrong the same way and are mended with it.
- **Grain and Glass: take back stops at a drawn plan.** A plan, once drawn and seen, is no longer taken back (it could be read and then drawn again: a peek at the deck). Take back says the move stands, as it does for a roll.
- **The Island Fable: the voyage asks first.** Starting a voyage island with a game in progress asks "Replace your game?" (Continue that game, or Start the new game), as Play does. Once a game is over, Next island and Sail again just sail.
- **Every sheet opens at its top.** How to play, the end of a game and every other sheet opened scrolled part-way down (about 318 px on How to play), to the button at its foot.
- **End of a game: the button row is solid.** The row of All games, Change setup and Rematch at the foot of the end sheet no longer lets the chart, the figures or Inch's "Try Normal rivals" show through it.
- **An Inch of Ink: no empty button under Start in.** The truce button, empty before anyone has land, no longer shows on the start panel.
- **An Inch of Ink: your ink and your share are kept.** The ink you chose before your start and the share on the slider are kept in this browser, so a reload and Continue keep them; before, the ink was drawn afresh and the slider went back to 40%.
- **Seat names in the log follow the seats.** Changing the board style or the seat colours (Modern command names the seats Sky and Orange) now writes the log again in the new names, so the cards and the log agree.
- **Grain and Glass on a phone: every answer to an offer.** With the move panel folded, a bot's offer showed only Take it; now Turn it down, Leave it open and Counter-offer show too.
- **Grain and Glass: the Rolls card and the goods key.** At 1440 by 900 the Rolls card covered the left end of the goods key; the key now starts clear of it.
- **Grain and Glass: the lesson says how it differs.** It says that its second depot gives a richer start than a Traditional game (one good for every hex around it, not one of each good beside it) and that it plays to 8 points where a Traditional game plays to 10.
- **The Island Fable: Concede disarms.** Pressed once, Concede waits four seconds for the second press; any other press, key or wheel puts it back.
- **Capo: an offer made to you is news, not a failure.** "Offers you a trade treaty" and the like are marked with a dot, not the red cross of a refused move. The wall on a scene with no AI connected now reads "Connect an AI to play this scene". The map view and the turn length are kept in this browser across a reload.
- **The front page.** News runs to v0.10.6 (three cards: real land and cities, Ink with a friend, play live and the shelf). A `favicon.ico`, the compass mark drawn again at 16, 32 and 48 px (our own work), for browsers and tools that ask for one.

**Contributors**
- `src/story/crisis.js` `addMonths` pads the year to four digits (whole-number arithmetic, never a Date); `src/story/war.js` `truceUntil` the same. Dates in a game are always four-digit years (no years BC: the save checks ask for `\d{4}`). `test/story.test.mjs`: a crisis in 912 opened, kept by a save, answered on its day, and a truce in 912.
- `src/core/match.js`: a game may say `draws(move)`, a move that shows something hidden without dice; `rolled` is then true, so take back (and a link's floor) stops there. `src/games/glass/rules.js`: `draws` is true for `{ do: "plan" }`. `test/shell.test.mjs`: a drawn plan is "chance".
- `site/table.js`: `T.replacing(go, what)` for a game's own ladder (used by `site/fable.js` `sail`); `sheet()` scrolls a new sheet to its top, now and after a frame (callers focus a button below); `relog()` writes the log again on a change of seat names. `site/table.css`: `.end .ends` has a solid background.
- `site/inchlive.js`: `capo-inch-choice` keeps `{ ink, pct }`; the truce button is hidden in the start phase. `site/glass.js` and `site/glass.html`: `#wheres.answers` stays shown in a folded phone panel; the goods key gets a left margin past the Rolls card when they meet. `site/fable.js`: `disarm`.
- `src/story/worldrules.js` and `src/story/pacts.js`: a result that is an offer to the player says `offer: true`, kept on its receipt line; `site/game.js` marks such a line as news. `site/game.js`: `capo-story-prefs` keeps `{ view, jump }`.
- `site/icons/tent/favicon.ico` (new, own work, in CREDITS.csv), linked from `site/index.html` and the root `index.html`; `tools/check.mjs` and `tools/serve.mjs` know `.ico`.
- No rules version changes: Glass's moves and their outcomes are as they were (take back is the page's, not the rules'); Capo's crisis and mission rules are unchanged, only the date they were given, so the games that hit this were the broken ones. Saves holding a broken date (a crisis due "912-06-01") drop it on load, as before.

## v0.10.7 (2026-11-27): the stacking game grows a quick set, stronger bots and a lesson (early, unlisted)

### The stacking game: the quick Capo set, bots that attack, a lesson, puzzles and a lit table (still early and unlisted)

**Players**
- **Three rule sets.** Traditional is the settled game (61 cells, twelve stones a side, a set opening drawn from three), now with free placement as a choice of opening, and **a count after 40 turns each**: trap the rival Lodestone to win as before, or at the count the higher total of tiers topped wins (each stack you top counts its height; the first player adds 1, as the second has the last move; a tie goes to the side holding more stones). Between strong players the trap alone almost never came. **Capo is the new quick set**: 37 cells, nine stones a side (four Pebbles, one Slinger), a set opening drawn from three small layouts, and the count after 30 turns each, the first player adding 2. Play on the title card now starts Capo. **Custom**: board size, opening, the swap, a count at 20, 30 or 40 turns or none, drops, and a Pebble in the second player's pouch.
- **Free placement** (Traditional and Custom): in turn, each places a stone in their home rows, the Lodestone first; after eight a player may stop and the rest wait in the pouch. No stone may be put down where it would strike a Lodestone.
- **Bots that attack the Lodestone.** Easy, Bot, Hard bot and a new Strongest bot, which beats the Hard bot in three games of four. From Bot up they think in a worker beside the page, so the page never stalls, and their thinking is held to a count of positions, not time: the same move on any device.
- **Hint** (or the H key) in a game against bots shows the bot's choice on the board and says why ("It traps the rival Lodestone", "it takes their Courier", "it climbs to tier 2, so its reach grows").
- **Review the game** at the end marks your three costliest moves and any trap you missed, with the move that was better.
- **A guided first game** on the Capo set against a gentle bot, in eight steps (choose, move, climb, the tower strip, strike, drop, the trap, help), offered at the first Play and in the menu.
- **Six puzzles** in the menu: three traps in one and three in two, each with exactly one solving move; the hard bot defends. Solved ones are marked in this browser, and the end offers the next.
- **A lit table.** The board is now a 3D table of turned stones on the shared board: each stone sits on a pewter ring with one, two or three notches for its tier, only the top stone shows its kind, and its move mark is inlaid on top (as on the flat board). Two angles, and Flat one tap away; a device that cannot draw it, or draws it slowly, gets the flat board. The **tower chip** in the board's corner shows the stack you last touched, side on, top first, with notches for each tier, on a phone too (not on the game behind the title).

**Contributors**
- `src/games/stacking/rules.js` is version 3 (saves and links of versions 1 and 2 do not open): options `style` (`classic`, `ours`, `custom`), `size`, `opening`, `swap`, `limit`, `drops`, `extra` and the open option `puzzle`; `ruleOf` (Traditional's `limit` is 40), `LAYOUTS_SMALL`, `SMALL`, `FIRST` and `firstOf` (1 on 61 cells, 2 on 37), `PLACE_LEAST`, `countOf`, `setOf`, `homeOf`, `sizeOf`; cell helpers take the board size. Traditional's openings are unchanged stone for stone.
- `src/games/stacking/search.js` (new): a flat position (three tiers a cell in a typed array, hashed) with make and unmake, the same moves as the rules (tested on several hundred positions from bot games, and make then unmake leaves it as it was), and an iterative alpha-beta search with quiescence on strikes, a table of positions seen, killer moves and one step deeper after a move that opens the rival Lodestone. Held to node budgets: easy 1 ply with noise, Bot 8,000 positions, Hard 20,000, Strongest 80,000 with narrow windows for all but the first move and one or two steps less for late quiet moves, searched again in full when they surprise (`reduce`). A generator, so it pauses between root moves when it runs on the page.
- `src/games/stacking/bot.js`: steps (`STEPS`), free placement by a plain plan, `deciding`, `hinting` and `why`, `reviewing`. `src/games/stacking/puzzles.js` (new): the six puzzles, found in bot games and checked by the tests to have one answer.
- `site/stackboard.js` (new): the lit table on `src/map/board.js`, the flat board (moved here from the page) and the tower chip. `src/map/stones.js` (new): the stones as kit models, `stone<kind><tier>` and `disc<tier>`. `site/stackhelp.js` and `site/stackbot.js` (new): the worker and the page's side of it, with a fall-back to the same work in slices on the page.
- Marked "stacking hook" lines: `src/map/board.js` (`add`, a game's own models), `site/table.js` (a bot may hand the table a promise to wait on; the Strongest bot where a game offers it), `tools/bundle.mjs` (the helper's code goes inside the built page and its rule gains `worker-src blob:`; the source page uses `worker-src 'self'`), `tools/fair.mjs` (the stacking game, played only when named).
- Fairness, `node tools/fair.mjs stacking`, 1,000 games of normal bot against normal bot a rule set (the swap on), wins by seat: **Traditional** 44.3% / 49.4%, ties 6.3%, spread 5.1 (pass), median 41 turns each. Without the count, 140 games drew 96.4% at 200 turns each (95.7% with free placement); with 2 added at the count, 1,000 games went 56.1% / 39.5%. **Capo** 38.1% / 57.0%, ties 4.9%, spread 18.9: over the 10-point line. With nothing added the second player won 85.7% of 420 games (the last mover at the count); with 2 added and a tie going to the first player, 62.4% / 37.6%. Capo's balance needs a finer count than whole tiers: the next step.
- Ladder, Capo, final rules: Bot beats Easy in all of 56 games, Hard beats Bot in 72.9% of 140, Strongest beats Hard in 73.8% of 84 (it won 45% before the narrow windows). Speed on a desktop: Bot 25 ms a move, Hard 160 ms, Strongest 400 to 450 ms; a review of a 30-turn game 2.3 s in the worker.
- `test/stacking.test.mjs`: 28 tests, adding the Capo set, Traditional's openings unchanged and its count at 40, the count and its tie-break, free placement, Custom, the search against the rules and make and unmake, node budgets and the same move twice, the puzzles (one answer each, by trying every line; the hard bot finds and finishes each), the ladder, hints and the review.

## v0.10.6 (2026-11-27): real land and real cities on Capo's map

### The real world's land cover and cities on Capo's map (ruling 157)

**Players**
- **What grows on the land.** Close in on the real world, the ground is coloured by what grows there, and the dressing stands it: forests (broadleaf and conifer, tropical, temperate and boreal), grassland and savanna, desert dunes, tundra (moss and stones, a new small model), and reeds in flooded grassland and mangrove. Mountains, hills and ice keep their own look; hills keep some of their wood or grass. Culled and capped as before; a style's own model rules still apply (Campaign map and Modern command stand no hills or peaks).
- **Real cities.** On the real map, the guessed great cities give way to real ones, named in italic under their pieces: each country's keep stands in its real capital while it holds it (and goes home if it falls), other capitals show always, cities of a million and a half or more from the region zoom, and others of 300,000 or more from the country zoom. A town still stands in every province with no city. A name already printed close by is not printed again. Invented worlds and alternate histories keep their own cities and towns.
- The map's credit line and the front page's credits name the land cover: Ecoregions 2017 © RESOLVE, CC BY 4.0.

**Contributors**
- `tools/mapdata.py` (new, offline, beside `tools/relief.py`; NumPy and Pillow, as relief.py, never shipped): reads RESOLVE Ecoregions 2017 and Natural Earth 1:10m populated places (simple, 5.1.2) and writes `maps/cover.webp` (2048 by 1500 on the relief's grid and projection, one class a point as grey 16 a class, lossless, 43.1 kB) and `maps/cities.json` (1,425 cities: 200 capitals, 490 major, 735 other; name, position in tenths of a map unit, rank and province; 53.3 kB, 23.3 kB compressed). Cities in the sea are snapped onto their province's land; a capital stands in its own country however small.
- `src/map/world.js`: the ground reads the cover (texture unit 5, `cover(img)`), blends a colour a biome between points along a wavering line, and fades it out above about 1,000 to 2,800 m. `src/map/dress.js`: `cover(k)`, a table of what each biome stands, and the `tundra` model. `site/worldmap.js`: loads both files beside the relief, and names the cities. `site/mappieces.js`: `mapPieces({ cities })`. `site/game.js`: passes the cities on the real map only. All marked "mapdata hook".
- `tools/check.mjs`: a CC BY file in `maps/` must be named in NOTICES.md with its credit line, and a baked picture in `maps/` needs its row in CREDITS.csv. CREDITS.csv and NOTICES.md: rows and lines for both files.
- `test/mapdata.test.mjs` (3 tests). Code 2.6 kB larger compressed; the two map files add 96.4 kB (66.4 kB compressed), fetched only by the map pages. Frame times in headless Edge on the GPU, median ms over 50 frames, two runs each, before then after: desktop 1440 by 900 world 5.6 to 5.9 then 4.7 to 6.8, region 5.3 to 6.9 then 5.4 to 5.5, country 4.6 to 5.0 then 4.9 to 5.3, close 5.4 to 6.5 then 4.8 to 5.8; phone 375 by 812 world 4.2 to 5.9 then 4.7 to 6.6, region 4.1 to 4.5 then 3.5 to 5.2, country 3.7 to 6.9 then 3.4 to 5.5, close 5.3 to 7.0 then 4.8 to 5.2. No change beyond the noise of a busy machine. The flat layer's paint once the view is still stays 20 to 30 ms at the region zoom; the first such paint after entering a zoom band can take 50 to 230 ms once.

## v0.10.5 (2026-11-27): a guide to choosing an AI, real-time Inch with a friend, and Margins of Trust keeps its word

### An Inch of Ink in real time, live between two browsers

**Players**
- **Play live with a friend.** In a real-time game of An Inch of Ink (Traditional, Capo's The Ink Dries, or Custom on the clock), before you choose where to start, press Play live with a friend in the move panel. Send the invitation; your friend's page makes a reply link; when it comes back (opened in a tab of yours, or pasted), the two browsers join straight to each other, as live play does for the turn games. The map is dealt by both browsers together. You each play a nation and the bots play all the rest, the same in both browsers.
- **One clock for you both.** It starts when you have both chosen where to start and runs at one speed. Your orders reach both maps in under a second (about 0.75 seconds, measured between two tabs). Pause stops it for both of you, at the same moment on both maps, and either of you can start it again; orders still go while it is paused.
- **Drops and reloads.** If the connection drops, the clock waits for you both; Invite your friend back in the move panel (either of you can) joins you again where you stood, and whatever was in flight is sent again. A browser that reloaded brings the game back with Continue, then takes the other's game as it stands when you join again. If no direct path is found, the page says so; the game waits as it stands, and Play on alone carries on with your friend's nation standing still.
- **Fair dice, checked games.** The bots' chances each tick are drawn from secrets of both browsers, shown only once both have sent their orders, so neither side can know them early. Both browsers compare the game every second; if they ever differ, live play stops and says so. Both hold the whole game, so live play is for friends.
- **Privacy.** As for the turn games: nothing is contacted until you choose live play, and then only the public address service `stun.cloudflare.com`.

**Contributors**
- `src/core/lockstep.js` (new, transport-neutral): frames four a second (`FRAME_MS` 250), each side's orders sent `DELAY` (2) frames ahead, frame f played when both sides' frames are in: pause or resume, the host's orders, the guest's, then a game tick every `TICK` (2) frames while the clock runs, its dice salted from both frames' secrets (a side shows its secret only after it holds the other's orders and commitment for that frame). An order the rules no longer allow when its frame comes is skipped by both. `quickSum` every `SUM` (4) frames; a mismatch stops (a desync). Hello on every join: frames and secrets the other has not had are sent again; a side with no game, or a new live table holding less, asks (`need`) and takes the other's save (`take`) after the other takes back its unplayed frames. Plain stops for a changed secret, an order for the other's seat, a changed frame, a frame it cannot read, and another game. Wall time only paces the page's driver and the figures, never the rules.
- Inch rules, version 12 unchanged: a game for two is the open option `people` (2), so every game for one keeps its options, positions and fingerprints (checked against fingerprints taken before the change). Two people are seats 0 and 1 (`p.people`, `p.pacts`, nations named for both); each order names its person (`by`), applied from that seat; both start where they choose (the game waits in the start phase for both); people grow at full rate, the bots' truce, pile and spare rules and soaking protect each person; one truce each with a bot, none between people. `liveMovesOf(p, b, seat)`, `person`, `peopleOf`, `pactIn`, `pactOn(p, seat)`.
- `site/inchplay.js` (new): invitations (`#i=` terms and offer) and replies made as the live link's, a rejoin invitation carrying the seed and handed to the tab holding that game (`BroadcastChannel`), the driver (four frames a second, a short backlog caught up), the move panel's live line and buttons, Play on alone, and the side kept per seed so a reloaded page plays from its own seat. Marked "inchlive hook" lines: `site/table.js` (`flow(move, salt)`), `site/livelink.js` (`PARTS`, its invitation helpers shared), `src/games/inch/rules.js` (the `people` option); in `site/inchlive.js` every position is read from this browser's seat (`view`), orders go through `act`, the clock and the pause are shared in a game for two.
- `test/inchlive.test.mjs` (11 tests) and `test/fixtures/inchscript.js`: the one-person fingerprints, the rules for two, and two fake browsers joined by a channel the test slows, cuts and tampers with: dealing, the same game on both sides and a replay from seed and moves, salts, the shared pause, a drop and rejoin, a reload that takes the other's game, a deliberate tamper caught by the next sum (within a second), and the plain stops.
- Checked in the built-in browser between `localhost` and `127.0.0.1` tabs (two origins): a live Traditional game dealt, started and played from both sides, a dropped channel joined again from the guest's side, the guest's page reloaded and caught up from the host's, a shared pause and resume, and a failed join answered with the fallback; the two move lists and salts matched each time, and no console errors from these builds.

### Margins of Trust, early: promises in play, a ledger, bots with characters, a reveal you step through

Still unlisted: reached only by `play/margins.html`.

**Players**
- **Talk.** Each season now opens with talk: in turn, each seat may say up to six things in the six fixed forms (keep out of a province, back a move, back a hold, hold a province, no strikes, carry a crossing), to one seat or to everyone as a public pledge, and may ask a seat for a promise in return. The page builds each one from whom, which form and where, and reads it back as a sentence before it is said.
- **Bargains.** A seat that was asked for something accepts or declines all that was said to it. Accepted, both sides' promises stand for the season; declined, none of them does. A promise with nothing asked always stands.
- **The ledger.** After every reveal each promise in force is marked kept, broken or void (it could not apply), from the orders alone. A private promise's mark is shown only to its two seats; a public pledge's to everyone; at the end, all of it, with each seat's kept, broken and void, and the first promise broken. The game never enforces a promise.
- **Bots with characters.** Each bot seat has one of six characters, shown at the table and on its seat: the Steward keeps every promise; the Merchant breaks its word only to a seat that broke a promise to it; the Elder forgives one; the Climber turns on whoever leads it in ports; the Gambler breaks a promise that stands in its way one time in two; the Herald never breaks a public pledge. Normal and hard bots offer pacts of no strikes to the seats they are not pressing, ask for support for their attack, and count promises made to them as far as they trust the seat. Easy bots say nothing.
- **The reveal, step by step.** The reveal now plays in the move panel: the sheets, then supports and transports (cuts), then the moves meeting, then the board after, then the ledger, then winter, each with its sentences and the board drawn as it stood. Back, Next, a scrubber, Skip to the end, and the whole reveal to read. Tap an arrow for its sentence.
- **A lesson** (the shared coach): a short guided first game, offered at the first Play and in the menu: a promise and an ask, a bargain answered, a move and a seal, the reveal stepped through, the ledger.
- **Traditional ends sooner.** From the third winter, holding more ports than every other seat wins (more than half the ports still wins at any winter). Capo ties now go to more ports, then the better word (promises kept less broken), then more provinces.
- No "A friend, by link" for this game, and no link play in its menu, until sealed sheets by link exist.

**Contributors**
- Margins rules are version 2 (saves and links from version 1 do not open as version 2). `rules.js`: stages `talk`, `answer`, `write`; moves `{ do: "promise" | "ask", form, to, at | a, b }` (at most `WORDS`, 6, a season), `{ do: "answer", from, yes }`; `formsOf`, `pending`, `offerOf`, `ledgerFor`, `wordOf`; `p.cast`, `p.talk`, `p.replies`, `p.pledges`, `p.ledger`; events `talked` and `promise`; `LEADS` (3). `forms.js`: `CAST`, `formText`. `bot.js`: `victimOf`, `talkOf`, `accepts`, `sheetOf`, `record`, `characterOf`; plans massed on one rival, with promises kept as constraints; plans memoised by position. Winter growth (1 a port) and supply stay as they were: the series did not need them changed.
- `site/table.js`: a game may say `links: false` (marked "links hook"): no "A friend, by link", no Link games on the title, no Link play tab.
- `tools/fair.mjs` measures margins (marked "margins hook").
- Fairness, `node tools/fair.mjs margins`, 1,000 normal-bot games a row, wins by seat in %: Traditional 25.3 / 32.4 / 29.9 (3), 20.6 / 23.7 / 24.8 / 20.4 (4), 16.6 / 21.2 / 19.4 / 19.0 / 16.2 (5), widest gaps 7.1, 4.4, 5.0; Capo 29.6 / 34.9 / 31.0, 23.1 / 24.1 / 27.0 / 21.3, 18.3 / 20.3 / 20.3 / 19.6 / 14.5, gaps 5.3, 5.7, 5.8. All within 10 points.
- How games end: Traditional before the year limit 87.6% (3 seats), 89.5% (4), 92.4% (5), median 10, 10 and 8 seasons; before, 6%, 1% and 0% (bots held their own marches to the limit). Capo shared wins 4.5%, 4.5%, 7.0%; before, 95%, 92% and 93% (200 games a row then). The word decides 57%, 52% and 40% of Capo games, a sign that Capo's points still sit level too often.
- Characters over 180 games of normal bots: kept shares Steward, Merchant, Elder and Climber 100%, Gambler 97.7%, Herald 96.5%: bots rarely find a promise in their way, so breaks are mostly answers to broken promises.
- `test/margins.test.mjs` (26 tests): talk and its quick check against the full list, bargains accepted and declined, the ledger against an independent judge and each seat's view, forms by the board, the lead and word endings, characters held to their lines over bot games at 3, 4 and 5 seats, easy bots silent.

### Choose an AI: a guide to the services Capo can reach (ruling 153.8)

**Players**
- **Choose an AI: a guide**, a button in How Capo reaches an AI, so it is in the Game menu and on the connect step of a turn. It opens over the page and says first that no AI is needed: Advance moves the world by the rules. Then the routes, free ones first: OpenRouter's free models, Google Gemini's free tier and Groq; Ollama and LM Studio on your own computer; your own AI app through the bridge; then paid by use: OpenAI, Anthropic, DeepSeek, Cerebras (a trial credit), Mistral and Together AI.
- Each route, folded until you open it: what it costs, the steps (where to get a key, what to paste where), what to expect, privacy (your key stays in this browser and goes only to that service), and what its own pages did not confirm. Links open the service's own pages in a new tab. **Use this** fills in the service and a model in the settings and puts you in the Key field; nothing is sent until you press Check connection.
- **If something goes wrong**: what to do for each error the page shows (a refused key, no credit, too many requests, an unknown model, a blocked call, a server on this computer that does not answer, a reply cut short, and more).
- Facts checked on each service's own pages on 27 November 2026; services change their free tiers often, so their page has the last word.

**Contributors**
- `site/aiguide.js` (new): `ROUTES` (group, preset, model, cost, steps, expect, privacy, unsure, links), `HELP` (by the error kinds of `site/ai.js`), `guideParts`, `openGuide`, `guidePart`. Built from elements and text.
- `site/config.js`: `AI_LINKS`, the services' own pages the guide links to, kept above the services the page calls, so the gate and the page rule are unchanged.
- Marked "guide hook" lines: `site/ai.js` (the import, and the guide line in the settings), `site/game.html` (the guide's styles). `site/game.js` is unchanged.
- `test/aiguide.test.mjs` (4 tests).

## v0.10.4 (2026-11-27): Brass and Banners in five eras

### An era for Brass and Banners (ruling 154)

**Players**
- **Era** in Brass and Banners: Ancient, Medieval, Gunpowder (the look so far, and still the start), Industrial or Modern. It chooses which sculpted pieces stand on the board in 3D: Roman legionaries with a general and ballistae, knights, redcoats with cannon, French infantry of 1870, or Vietnam-era marines. Where an era has no sculpted piece for a role, the piece made in code stands. Choose it under Choose your own or in Settings; it takes effect at once and this browser remembers it. Looks only: the rules, links and saved games are the same in every era, and each player sees the era they chose.
- Three more sculpted pieces on the shelf, each fetched only when a board shows it: "French Infantry - Franco-Prussian War", "US Marine T pose - Vietnam" and "Roman Ballista - free game asset", all by Andy Woodhead, CC BY 4.0, credited in About.

**Contributors**
- `site/models/`: `fusilier.bin`, `marine.bin`, `ballista.bin` (31 to 32 kB each, 93 kB in all), no longer held in `tools/figures.json`; `src/map/shelf.js`, `CREDITS.csv` and `NOTICES.md` written again by `tools/models.mjs --records`. The four Jaca scans stay held (ruling 150).
- Marked "era hook" lines: `site/banners.js` (the setting, kept as `capo-banners-era`), `src/map/board.js` (`setEra`), `site/hexboard.js` (`setEra`), `site/table.js` (a choice the game keeps itself, with `get` and `set`, changes the looks without restarting the game behind the title; `G.settings`, a game's own rows in Settings). No rules version change.
- `test/models.test.mjs`: each era's soldier is on the shelf, the ancient gun is the ballista, and no era stands a Jaca scan.

## v0.10.3 (2026-11-27): made by Arnote Studios

- The maker is named as Arnote Studios (ruling 156), with copyright to Ada Arnote, on the front page, in every game's About, in Capo's Game menu, in README, NOTICES, CONTRIBUTING and package.json. The three starting shelf entries now credit Arnote Studios. The room-server guide names the Cloudflare account and suggests the workers.dev name.

## v0.10.2 (2026-11-27): play live by two links, a community shelf, and a room server ready to deploy

### The community shelf: scenarios, stories and replays players share (ruling 155, option D)

**Players**
- **Community shelf** on Capo's first screen (beside Open a scenario file) and in every table game's menu and title links. It lists what players have shared, with who made it, its licence and its date, and opens it in one press: a Capo scenario joins the list of starts, a Capo story opens as your game to play on from where it stands, a table-game replay opens at its end so you can step through it move by move (or play on, if it is unfinished). An entry made from another names it.
- **Share to the shelf.** In Capo's Game menu, under Save the world as a scenario, and as Share this story; in each table game's menu once a move is made. Give it a title, a line, the name it goes by (any name you choose) and a licence (CC BY 4.0 or CC0), and the game saves a shelf file and says how to offer it on GitHub with your own account. A story leaves out your chats with the AI and the counsel you asked for. The page never sends anything.
- Three entries of our own to start: a Nordic winter scenario, a fork of it three months on, and a Fable replay between three bots.
- Capo's "Finding others' scenarios: coming soon" line is gone: it is here.

**Contributors**
- `shelf/`: one JSON file an entry and `index.json`, served by Pages and read by the pages from their own site. `src/story/shelf.js` (new): the format and its checks (shape, fields, sizes, CC BY or CC0, the hard line, no web or email addresses, keys included), `makeEntry`, `storyOf`, `cardOf`, `readIndex`. `site/shelf.js` (new): `shelfView` and `shareView`.
- `tools/shelf.mjs` (new): the shelf's gate. Every file passes the format check, then the game's own readers: a scenario's check on the map it is set on with every part kept, a saved Capo game's check, and a replay played again from seed and moves to the end and winners it claims. A replay made under older rules of its game is a note and is shown but not opened. `node tools/shelf.mjs` writes the index; a passing file not in the index yet is a note, so an offer's own pull request passes. `tools/check.mjs` runs it.
- Marked "shelf hook" lines: `site/game.js` (`takeScenario`, now shared by files and the shelf, `takeStory`, `shelfStart`, `shelfSheet`), `site/table.js` (`openSaved`, now shared by files and the shelf, `shelf`, `share`), `src/story/scenarios.js` (`SOON` empty), `site/table.css`, `tools/serve.mjs` (serves `shelf/`), `tools/bundle.mjs` (served table pages keep `connect-src 'self'` to read the shelf; double-click pages still reach nothing).
- `CONTRIBUTING.md` (new): how to make, offer and take a shelf entry. `.github/ISSUE_TEMPLATE/shelf.yml` (new): an offer form that takes the file.
- `test/shelf.test.mjs` (8 tests). Site code 249.8 to 252 kB compressed.

### The small worker: rooms, relay, play by turn, saves by code (built and tested, not deployed)

**Contributors**
- `server/worker/` (new, ruling 155; options.md option C, parts 1 and 2, and saves by code from part 3): one Cloudflare Worker with two Durable Objects, plain ES modules with no dependencies. `Room`: six-letter codes (no vowels), an optional password sent only as a digest, seats by role as in link play, signals passed seat to seat over one WebSocket, who is here, the room as relay when no direct path opens (or Cloudflare's relay keys when the owner adds them), and a mailbox for play by turn with a "your turn" Web Push notice (VAPID and aes128gcm by the platform's own crypto). Every move is checked by the games' own rules (`src/games`, bundled in); the room keeps the position and dice state beside the moves, so a woken room goes on without replaying. `Keep`: saves by a secret code, kept only if they replay whole. Rate limits per address in memory, per room for passwords, per socket for messages. Nothing personal is written: no address, no seat key or password (digests only), a push subscription only while notices are on. Rooms and saves delete themselves when their keeping time ends (live a day, by turn 90 days, finished a week, saves a year unused).
- `server/worker/wrangler.toml` (a template with no account id or secret), `server/worker/DEPLOY.md` (the owner's steps, and the keeping-time table for the privacy note), `server/worker/tools/keys.mjs` (makes the notice keys).
- `site/rooms.js` (new): the pages' side, `roomsAt()`, null when no worker address is configured, so nothing changes and the site stays static; `site/notice-sw.js` (new): the notice's service worker. Not yet wired into a table page.
- One marked "worker hook" in `site/config.js`: `PLAY_ADDRESSES`, a placeholder with the worker named and no address, to merge into the live-link lane's named-address list.
- `test/worker.test.mjs` (18 tests) against `test/fixtures/workerd.js`, a stand-in for the worker runtime made from Node's own modules. Measured here: checking one move takes a median of 0.3 to 0.9 ms in Banners, Fable and Glass and 6 ms in Inch (slowest 27 ms); a room with 300 Banners moves wakes in under 10 ms from its kept table, against about 300 ms replaying.

### Live link: two pasted links, then a direct table between two browsers (ruling 155)

**Players**
- **Play live.** In a game by link between you and one friend (Brass and Banners, Grain and Glass, The Island Fable, and An Inch of Ink played by turns), choose Play live in Link play, or Play live instead in the move panel. You send an invitation link; opening it on your friend's side makes a reply link; when you open or paste the reply, the two browsers join straight to each other and every move goes across at once. Bots are played by whoever made the game.
- **Nothing is lost when it does not join.** If no direct path is found (about one pair of networks in five needs a relay, which this site does not have yet), the page says so and the game goes on by links exactly as before. If the connection drops in play, the game goes on by links and Play live joins again; the browser that fell behind catches up.
- **No peeking at the dice.** In live play each roll is drawn from secrets of both browsers: each sends only a hash of its secret first, the mover sends the move with its secret, and the other answers with its own. A game not yet begun is dealt the same way, so neither side chooses the deal. Every move is checked by the rules in both browsers, and the game is compared after every move. Said plainly in the game: both browsers hold the whole game, so a changed browser could still see hidden cards; live play is for friends.
- **Fixed: links for games of two to five players open again.** The table packed a colour for all six seats into every link, and the page that opened it refused the link as broken. A link now carries the seats in play only.
- **Privacy.** Nothing is contacted until you choose Play live. Then each browser asks one public address service, `stun.cloudflare.com`, for its own internet address (nothing about the game goes there); your friend's browser sees your internet address, and the invitation and reply carry it. A reply opened in another tab is handed to the waiting game in this browser.

**Contributors**
- `src/core/session.js` (new): a transport-neutral live table: hello and catch-up, the live deal, commit-then-reveal salts for every move, a fingerprint check each move, and plain stops for a changed secret, a move out of turn or out of the list, and another game. `createMatch` takes `salts`, `play(move, salt)` mixes a salt into that move's dice (kept only where dice were thrown), saves keep `salts` when there are any, and links carry them as layout 3 (layout 2 is still read and still made for games without salts). `compareGames` compares salts too.
- `site/livelink.js` (new): WebRTC with one STUN address, offers and replies deflated and, with a password, locked like the game link; the reply handed between tabs by `BroadcastChannel`. Marked hooks ("livelink hook") in `site/table.js` (moves wait for their salt, the other browser's seats wait, no take back while live, replays keep salts), in `site/banners.js` and `site/fable.js` (their battle records replay with salts) and in `tools/bundle.mjs` (built table pages keep the named address in their rule).
- **The gate (ruling 155).** `site/config.js` has `LIVE_ADDRESSES`, each with its reason. `tools/check.mjs` lets a page's `connect-src` hold only `'self'` and those addresses (written `stun://host:port`, the form browsers read), refuses a named address without a reason or that is not `stun:` or `turn:`, and now also finds `stun:` and `turn:` addresses in shipped files: any not named is a stop, as before. The AI list on Capo's page is unchanged. Tests: `test/livelink.test.mjs`.
- Checked in Chromium: the page rule does not govern WebRTC (STUN answers under `connect-src 'self'`), so the listed address documents the reach rather than enforcing it; `stun:host:port` in a page rule is refused by the browser with a console error, which is why the rule writes `stun://`.

## v0.10.1 (2026-11-27): sculpted pieces, six style packs, and seat colours for everyone

### Sculpted pieces in 3D

**Players**
- **In 3D, the weakest pieces are now sculpted miniatures** (rulings 146 and 147), painted in the board's own colours so every style can repaint them, with the owner's colour as enamel and on the base. Brass and Banners: the foot soldier is a Waterloo redcoat, the gun an 1815 field cannon, the cavalry a galloping horse. The Island Fable: the guard is a Roman legionary, the knight a Knight Hospitaller, the marshal a pewter Roman general. Grain and Glass and An Inch of Ink: towns and depots are timbered town houses and stone cottages, and on sand, flat-roofed desert houses. Capo's map: fleets are ships of their time, by the game's year (a Viking-age boat, a ship of the line, a 1908 torpedo boat, a modern destroyer).
- The pieces made in code stay: in Flat, in a page opened by double-click, in the Clear style's figures (they read better at a glance there), and while a sculpted piece is still on its way. A piece is fetched only when a board in 3D first shows it; Banners fetches about 100 kB, Capo 52 kB.
- **Credits:** every game's About (Capo: the Game menu) lists the sculpted pieces with their makers and licences.

**Contributors**
- `tools/blend.py` (offline, Blender 5.2 in background mode, never shipped): imports GLB, glTF or FBX as data, optionally builds a model from kit pieces (`--parts`), drops plinths and loose parts, brings arms made for animation down to the sides (`--pose`), remakes a many-shelled print as one skin (`--remesh`), decimates to the budget, and colours each kept triangle from the full model's painted texture under it.
- `tools/models.mjs`: CC BY allowed with a required credit line, title, maker and source (`cleared`); reads a glTF inside a zip; slots matched by hue more than lightness, paint rules by material, colour, hue, strength, lightness, facing and height; the painted light and dark kept as a shade (pack version 2, read by `src/map/models.js`); a metal or enamel base; one file a model in `site/models/`; writes `src/map/shelf.js` (the index and credit lines) and the shelf's rows in `CREDITS.csv` and `NOTICES.md` (`--records`); held models go only to `--held`. The list is `tools/figures.json`.
- `src/map/figures.js`: which shelf model stands for a recipe by era (`ancient`, `medieval`, `fable`, `early`, `industrial`, `modern`) and on sand, fetched once and lazily; `createBoard` takes `era` and `shelf` (a fetcher); a style's `sculpt` lists the sorts it wears (War table and Campaign map all; Clear ships and buildings). `site/shelf.js` holds the fetcher and the credits panel; the bundle points it at `../site/models/` for served pages (with `connect-src 'self'`) and at nothing for double-click pages.
- `tools/check.mjs`: a model on the shelf needs its `CREDITS.csv` row, and a CC BY one its line in `NOTICES.md`.
- Converted but not shipped: the four Jaca museum scans (ruling 150 asks for a written check with the museum first), the Franco-Prussian and Vietnam-era foot soldiers and the Roman ballista (no game shows those eras yet), and a Downtown City block (it does not cut down cleanly).

### Six board styles, and seat colours of your own choosing

**Players**
- **Three more board styles** in Settings, Board style, beside War table, Campaign map and Clear:
  - **Wooden toys**: turned, varnished pieces in soft two-step light, on wooden hex tiles with a grain and painted blue sea tiles, in a light oak tray lined with green felt.
  - **Pewter and brass**: every figure cast in pewter, with the owner's colour as enamel on a wider base, shield, flag and roofs; brass only as trim. The board is a cloisonné plate: silver wire between the cells, deep blue glass for the sea, a velvet surround.
  - **Modern command**: a dark board on smoked glass with a faint grid, lit contour lines over high ground, thin lit lines between cells, and acrylic blocks lit at their edges in the owner's colour. The glow is drawn by the board itself (no extra pass), and nothing moves while the board is idle.
- **Seat colours** is a setting of its own, in every style and game: **Standard** (what each seat chose), **Colour-blind safe** (Okabe and Ito's set) and **High contrast**. High contrast has a dark set for light boards and a light set for dark ones, so no seat fades into Modern command's board. Modern command starts on Colour-blind safe until you choose. A dark seat colour keeps a pale edge and light pattern lines on the score bar.
- **Daylight and lamplight**: every style has a lamplight lighting (a lower, warmer lamp and darker corners; darker glass for Modern command) that the board takes when Settings, Light is Lamplight, or when it follows a dark system. Clear stays as it is.
- Capo's world map wears the chosen style and its light, as before, now with Pewter's enamel bases and Modern command's contours.

**Contributors**
- `src/map/style.js`: packs are listed by what differs from War table (`from`, merging tables one level deep), with new keys `kit` (`base` width, `cast` figures in metal), `glow`, `steps`, `grade`, `seats`, `lamp`, `surface.own`/`rim`/`wood`/`contour`/`spacing`/`sea` and `table.tone`/`grid`. `wear(name, light)`, `SEATS`, `SEATS_KEY` (`capo-seats`), `seatSet`, `seatsOf`, `darkBoard`, `washed`, `LANDS`.
- `models(kit)` bakes the recipes once a kit. The mesh layer stores whether a thing is owned in its instance's last byte (128) and takes `glow`, `steps` and `grade`; the painter takes the rim, contour, wood, sea, grid, table tone and grade; the world ground takes the grade, contours, table tone and grid. Board: `setLight("day" | "lamp")`, `recolour()`; the hex board follows the page's `data-theme` and the system's dark mode.
- `tools/check.mjs` `styleGate`: every pack has War table's keys and shapes, swaps only to real models, lamplight changes only light, colour and surfaces; seat sets have six named colours. Hard stops: High contrast (and a pack's own default set) under 3:1 against that pack's land as its wash shows it, Colour-blind safe under 0.06 apart (Oklab) for any two seats in normal, protan, deutan or tritan vision (Machado 2009), High contrast under 0.03, High contrast under 1.1:1 in greyscale, and pieces that would show no owner's colour. The rest are notes.
- Frame times, one board frame drawn and finished on the graphics card, median over 40 frames in Fable, Banners, Glass and Inch (a desktop RTX 3080; the 375 px column is a phone-sized page, not a phone): War table 1.2 ms at 1440 x 900 and 1.1 at 375 px, Campaign map 1.0 and 0.8, Clear 0.7 and 0.7, Wooden toys 1.0 and 0.8, Pewter and brass 1.0 and 0.8, Modern command 1.0 and 1.0; no frame above 2.1 ms at the 90th percentile. 120 runs (every pack in every game, both sizes, each seat set at full size) with no console errors.

## v0.10.0 (2026-11-27): four new games take root, and nobody is knocked out

### Margins of Trust, early: the basic structure

**Contributors**
- `src/games/margins/`: a new original game for three to five seats, reached only by `play/margins.html` (not on the front page or the game list) and marked early. `map.js`: one fixed land for each number of seats, three rings of provinces round an inner sea, the same eight-province march for every seat (three ports, three midlands, two uplands), so each seat has two neighbours and no corner. `resolve.js`: the one-pass reveal (movers leave 1, support adds 1, cut by a land attack except from the target, transports for crossings, head on, strictly strongest arrival, bounce home one weaker) with one reason code for every order. `rules.js`: the `margins` game (version 1): one order a move (`{ do: "order", at, kind, ... }`), `{ do: "done" }` seals a sheet, the last seal reveals; winter growth at ports and supply; Traditional (more than half the ports at a winter, else the most ports after 8 years) and Capo (points at each winter over 4 years); `reason()` turns a result into a sentence. `forms.js`: the six promise forms and `judge()` (kept, broken, void), not yet in play. `bot.js`: sheet bots (easy, normal, hard) that plan from the open board only, walk every list in a random order of their own so no seat number is favoured, and write one order a move.
- `site/margins.html`, `site/margins.js`: the page on the shared shell, with a flat SVG board drawn in the page: order entry by province, kind and target, a cover card between people sharing one device, the reveal sheet with every order's reason, How to play and the shell's end screen.
- Marked "margins hook" lines: `tools/bundle.mjs` builds `play/margins.html`; `site/source.js` sends the source page to the built one.
- `test/margins.test.mjs`: named reveal cases (standoffs, three-way bounces, support given, cut and void, head on, crossings with and without a standing transport, reinforcements that fall), a reason for every order on random seasons, order-independence, strength never grows, turning the board turns the result, winter, both ends, the forms, bots' legal complete games at 3, 4 and 5 seats that replay and travel by link, bot blindness, and a whole game kept symmetric when every seat plays the same sheet.

### Brass and Banners: nobody is knocked out in Capo

**Players**
- **The last stand.** In Capo a player's last province cannot be attacked, so nobody is put out. Whoever is driven back to one province keeps it, keeps their points, places there every turn (3 at least) and can break out again. Every Capo game now runs its ten rounds and is decided on points, unless someone holds 65% of the land, which still wins at once. Before, 92 in 100 two-player Capo games between bots ended by a knockout before round 10; now 92 in 100 are decided on points and none by a knockout.
- The log says when a player is down to their last province, the province's description says so, and tapping it to attack explains why you cannot. How to play has a paragraph on the last stand; the card rules for putting a player out are left out where nobody can be.
- Custom has the rule as a switch, Last province: "Lose it and you are out" (as before) or "It cannot be attacked: nobody is out". Traditional is unchanged.
- With secret goals and the last stand, nobody is dealt "put a rival out".

**Contributors**
- Banners rules are version 8: the `last` switch (`out` or `stands`, normal `out`; Capo `stands`, Traditional `out`), `stands(p, at)`, and the `stand` event (`seat`, `at`, `by`) when a take leaves a seat one province. Attacks on a standing province are not offered; bots skip them and no longer value pushing a seat towards a knockout that cannot happen. Saves and links from version 7 do not open as version 8 (the game says which version they need). Games stay whole-number and replay from seed and moves.
- Fairness, `node tools/fair.mjs banners`, 1,000 normal-bot games a seat count, wins by seat in %: Capo 51.9 / 48.1 (2), 34.9 / 32.4 / 32.7 (3), 25.6 / 24.0 / 28.4 / 21.8 (4), 18.2 / 21.3 / 19.1 / 20.1 / 21.3 (5), 14.0 / 12.3 / 18.2 / 16.9 / 17.6 / 20.6 (6); widest gaps 3.8, 2.5, 6.6, 3.1, 8.3. At 4,000 games: 0.7 (2), 0.9 (4), 6.2 (6), the later seats ahead at six. Traditional is the same table as version 7, game for game.
- How Capo games end, version 7 then 8: on points 7% then 92% (2 seats), 18% then 80% (3), 26% then 58% (4), 41% then 93% (5), 47% then 98% (6); by knockout 92, 66, 20, 11 and 3% then none; the rest on 65% of the land. Median length 6, 8, 9, 10, 10 rounds, now all ten at every seat count (the tenth-percentile game ends in round 9 at three and four seats, on land).
- Comebacks, 400 games a row: a seat makes a last stand in 95% of two-seat games and breaks back out to four provinces or more in 90%; a seat that made a stand went on to win 19% of duels. The hard bot's edge over the normal bot in a Capo duel is 51% of 600 games (55% under version 7).
- `test/banners.test.mjs`: the last stand as a rule (offered moves, every bot tier, the event, secret goals) and bot games that run their rounds; knockout tests now set the rule they test.

### The tile game, early: its basic structure

**Contributors**
- `src/games/tile/`: Hedge and Highway (working name), a new tile-laying game of our own (ruling 94, owner ruling 153.14). `tiles.js` holds 24 tile kinds as data (edges, ports, features, the mix of 76, the turns that differ, an even order for shorter bags); `rules.js` the game (`tile`, version 1): the bag shuffled once from the seed, one to three tiles to choose from, legal placements, stewards, lanes, towns with markets, wells and meadows found across tiles (`shape`, `regions`), scoring at once, at season ends and at the end, set-aside tiles, the end and the winners. Whole numbers, no clock; a seed and the move list replay. Traditional, Capo and Custom (six switches). `bot.js`: a first bot that lays for points now and weighs what its stewards and rivals stand to gain (random, easy, normal).
- `site/tile.html`, `site/tile.js`, `site/squareboard.js`: the page on the shared shell, marked Early, reached only at `play/tile.html` (not on the front page or the list of games). A flat square board painted in code with pan, zoom and tap; places that fit lit; the tile in hand as a ghost; turn it, choose a steward, and the score the placement would give is shown before it is laid. How to play, tiles left by kind, the board as a list, the end screen.
- Marked "tile hook" line: `tools/bundle.mjs` builds `play/tile.html`.
- `test/tile.test.mjs`: the tile data, gaps every pair of edges can fill, scoring cases built by hand (lanes, shared and led towns, markets, gates, wells, meadows, set-aside tiles, the end and ties), the feature finder against a plain flood fill, the quick check against the list of moves, the preview against the score, bots' complete legal games in each rule set, seasons and replay.

### The stacking game, early: its basic structure

**Contributors**
- `src/games/stacking/rules.js` (version 1): the plan's one settled rule set on a radius-4 hex board. Twelve stones a side (Lodestone, Warden, two Couriers, two Slingers, six Pebbles), a set opening drawn from the seed out of three mirrored layouts (or chosen by the `layout` option), stacks up to three high where only the top stone acts and climbs one tier at a time, a Courier's slide and a Slinger's range of 2 plus 1 for each tier above the first, strikes into the pouch (no more than one tier up), topple, drops beside your own stacks (never beside the rival Lodestone), and the swap after the first move (`swap` option). You may not leave your Lodestone open to a strike; no legal move loses; 30 quiet turns each or 200 turns each draws. Whole numbers, no clock, no page: a seed and the moves replay.
- `src/games/stacking/bot.js`: `easy` (one move ahead, seeded noise) and `normal` (every reply, a plain count of stones, height, Pebbles forward and the Lodestone's room and safety), as a generator that yields between moves.
- `site/stacking.html`, `site/stacking.js`: a page on the shared shell with a flat SVG board (stones drawn stacked with a lip, the top stone's mark, height pips, the last move ringed; a solo player's side at the foot), a tower strip in the move panel (the stack last touched, top first, every tower on the board, both pouches), How to play, and the shell's end screen and review. Marked early. Reached only by `play/stacking.html`: not on the front page or the game list.
- Marked "stacking hook" lines: `site/table.js` takes `G.style` as the title card's starting rule set; `tools/bundle.mjs` builds `stacking`; `site/source.js` sends the served source page to the built one.
- `test/stacking.test.mjs`: openings, each stone's moves, the height rule, strikes, slings, topples, drops, the swap, the Lodestone rule and both kinds of loss, the draws, replay and saves, and bots playing whole legal games.

### The garden game: the basic structure (early, not public)

**Contributors**
- A new original game for two, built to its first playable stage (owner ruling 153.14). Not on the front page or in the list of games: reached only by its own address, `play/garden.html`, and marked "Early" on its title card, in How to play and in About. "The Garden" is a working title until the name is checked.
- `src/games/garden/rules.js`: a hex bed round a pond, five kinds of plant on one wheel (link, overgrow, overgrown), sow or shift, overgrowth back to the pouch, links along lines, the free sow after a new link, the swap after the first sow, the called ring in one move, and the ring round the pond found by a parity test in whole numbers. Traditional (91 cells, home beds, reach 3, most links after 40 turns each), Capo (61 cells, rim sowing, reach 2, points at the limit) and Custom (nine switches). Version "1"; no clock, no page, no chance: a seed and the move list replay.
- `src/games/garden/bot.js`: easy (one move, noisy), normal (also checks its best moves for a ring the rival could close next) and hard (reads the rival's best reply). Legal and sensible, not strong yet.
- `site/garden.html`, `site/garden.js`, `site/gardenboard.js`: the page on the shared table shell, with its own flat board drawn in code (round bases for the first gardener, square for the second, an outline for each kind, links as lines, six stones in the pond for the pond meter) and the wheel as a small dial in the move panel. Against a bot or a friend on one device, or by link as the shell allows.
- `tools/bundle.mjs`: one marked "garden hook" line builds `play/garden.html` with the others.
- `test/garden.test.mjs`: the wheel, the bed, sowing, shifting, overgrowth, links, the ring, the free sow, the swap, the called ring, the count at the limit, replay, and bots of every tier finishing legal games. No win rates written down yet: rings come quickly in Capo (often by round 10) and seldom in Traditional, to be measured and tuned before release.

## v0.9.9 (2026-11-27): campaigns for Brass and Banners, early

### Brass and Banners: legacy campaigns, early

**Players**
- **Campaign (early)**, under Choose your own on the Brass and Banners title card: a campaign of 5 or 10 games, "The Long Muster", for 2 to 4 seats, each a person or a bot. Every game is played on the world map with the campaign's rules (land dealt out, 65% of the land or the most after 20 rounds).
- **Each game leaves marks on the next.** A win is worth 3 points and holding on to the end 1. The winner names the province they held strongest from the story's list of names, and it keeps that name on the map; the seat that placed last starts the next game with 3 more to set out, unless it leads the campaign.
- **Seals.** Sealed changes open when their moment comes: capitals after the first game, forts (and a wall around the first capital to fall) when a capital first falls, leaders after the third game. After the game a sealed change shows what opened it; Break the seal shows the new rule, which plays from the next game on.
- **The campaign is a file you hold.** Save it after any game and open it again on this page: every game in it is replayed, and a file changed by hand is refused. The whole last game can be taken back when everyone agrees; it is counted, the count is shown, and the game is dealt anew.
- A campaign keeps the rules version it began on, and says so. Marked early: nowhere on the front page.

**Contributors**
- `src/core/campaign.js`: the campaign record (`beginCampaign`, `addGame`, `nameLast`, `takeBack`, `writeCampaign`, `readCampaign`) and its fold (`foldCampaign`, `advance`, `nextGame`, `standings`). Points, marks and opened seals are never stored; they are folded again from each game's seed and moves. Seals open on a fixed list of tests (`after_game`, `first`, `wins`).
- `src/games/banners/legacy.js`: "The Long Muster" as data (`LONG_MUSTER`), the rules versions a campaign may be pinned to (`RULES`), and the layer the fold reads (`LEGACY`: `optionsFor`, `factsOf`). `src/games/banners/marks.js`: the marks' shape (`checkMarks`) and how setup reads them (`applyMarks`: names, forts, extra strength at the start).
- `src/core/match.js`: a game may declare an open option, `{ check, normal }`, accepted when its check says yes and present in a match's options only when given, so ordinary games keep their options, saves and fingerprints. Banners' `marks` is the first.
- Marked "legacy hook" lines: `src/games/banners/rules.js` (the `marks` option, two `applyMarks` calls in `setup`, `nameOf` reads a campaign's names); `site/banners.js` (`seen`, `next`, `summary`, `campaign.mount`); `site/banners.html` (the button). The screens are `site/legacy.js`.
- `test/legacy.test.mjs`: the record round-trips, a campaign replays from its record, marks change the next game's setup, the rules version is pinned, take-backs are counted, ordinary games are untouched.

## v0.9.8 (2026-11-27): rivals make pacts, risings found countries

### Capo: countries bind each other, a rising can found a country, and the world's pace is yours to set

- **Pacts and tribute for every country (ruling 149).** Other countries now sign pacts of non-aggression and demand tribute of each other by the same rules you use. The AI can propose them too: PACT and TRIBUTE are moves in the reply format, so "offer Chile a pact of non-aggression" in your own words becomes a move the rules answer. With no AI, a country asks a neighbour it has no treaty with for a pact when the answer would be yes, and a steady country demands tribute of a weaker neighbour in trouble that would pay. Your country is asked like any other, and you answer for it (ruling 154). A pact meant for you arrives as an offer card beside treaty offers, when the country offering would itself agree; accepted, it stands as offered. Tribute is demanded of you only when the sum says a country in your place would pay: the demand waits a turn as a card at the top of Actions, with Pay and Refuse. Paying binds you as any tribute does, and you may stop later; refusing, which is also the answer when you give none, gives the asker a cause and cools relations a step, and it does not ask again for two years. A country that has a pact with another declares no war on it by rule.
- **A neighbour both fear.** A pact of non-aggression is answered by the trade sum as before, with one new part: +1 when a country at least two stronger than both stands beside both by land. Small neighbours of a great power agree more readily. A country pays tribute to one other at a time.
- **Shown where you look.** Every pact and tribute is a line in the receipt and a fact in the chronicle. A new map view, "pacts and tribute", colours the countries bound to you, paying you or paid by you, and those bound to each other. A country's card lists its clauses, and the sheet under your country's name lists the pacts among your neighbours.
- **A rising can found a country.** A rising left a year unanswered used to cost a step of mandate. Now, where its province cannot go back to an old holder, the rebel provinces leave: the province where it gathered and your land that touches it, never the heartland, four at most and never more than half. They become a country with a code, a name and a colour of its own, dealt from the game's seed. On the real map, with or without an alternate history, it is named for the rebel's title and never for the place ("The Colonel's Republic"), so no name reads as a real separatist cause; on an invented world it takes its province's name (ruling 154). A truce of two years follows, and the country it left holds a cause. The new country moves, signs, fights and can fall like any other; it is kept in the save, travels in a scenario saved from the game, and is taken back with the turn. It works on the real map, in an alternate history and on an invented world. The sheet under your country's name says what a rising would take before the year is up.
- **Other countries answer their own unrest.** Six months after unrest gathers, and once a year while it stands, a country meets the terms when its treasury is full or better and otherwise moves against it on the check, as you can. A rising answered in the turn its year is up takes no toll.
- **How restless the world is.** A new setting in the Game menu: calm, lively (as the rules were tuned) or stormy. It changes how often the rules bring a war, a pact, a demand for tribute and a crisis, and never an answer or a chance.
- **Rules version 5.** Pact answers, a rising's toll and what other countries do by rule are settled differently, so the story rules version goes from 4 to 5. A game saved under 4 opens as before, keeps its past turns as they were, and is told once what changed.
- **The prompt.** Two short lines under MOVES and one line naming the countries founded in the story: about 190 characters more on a turn with none founded.
- **Measured.** 200 one-month turns by the rules alone, three seeds each, every game played twice and identical and read back whole from its save. On "Late 2026": 4 to 9 wars begun (4 to 14 before this change), 7 to 10 pacts, 2 to 6 tributes, 0 to 2 countries founded, at most one country fallen. On the clean slate: 0 to 4 wars, 5 to 10 pacts, 0 to 2 tributes. Stormy on the clean slate: 6 to 9 wars, never more than two at once.

## v0.9.7 (2026-11-27): boards you can read at a glance

### Boards that read at a glance: goods, pips, ports, routes, names, rims and flags

**Players**
- **Grain and Glass:** each good has its own symbol at the top of its hexes (an ear of wheat, a goblet, three bricks, a salt crystal), with a key at the foot of the board (under the seats on a phone). Pips under every number show how often it comes up, red with the busiest numbers. A port's rate sits on a plate over the water beside its flag: "3:1", or "2:1" and the symbol of its good on that good's colour; the jetty now runs out to the sea it serves. Routes are links in the owner's colour from hex to hex, to each neighbouring route or depot of the same seat; seats sharing an edge lie side by side.
- **Brass and Banners:** province names on the map wherever a name fits inside its province and clear of every plate and land name, so more appear as you zoom in; the province under the pointer is always named. Crowded number plates (Europe at the widest zoom) move aside to the nearest free place and are tied back to their piece by a thin line.
- **The Island Fable:** a seat's colour is now each tile's rim and sides, with a light tint, so grass, fields and woods still read under it. A white pennant marks a unit that can still move, a gold banner with a coin a village that can still buy.
- Every board style (War table, Campaign map, Clear) and the Flat look show all of this; the still picture for devices without 3D shows numbers with pips, port rates, rims and the flags as marks.

**Contributors**
- New `src/map/glyphs.js` (the goods' symbols, drawn once per size and stamped; pips; port plates; flags; the half-link model and its flat drawing; the key) and `src/map/labels.js` (`spread`, a greedy placer that keeps boxes apart; tie lines; place names by fit). Hooks marked "reading hook (p10-reading)" in `board.js`, `paint.js`, `site/hexboard.js`, `glass.js`, `fable.js`, `banners.js` and one line of `table.css`.
- `createBoard` takes `reading: { goods(i), colours, key, places, rim }`. Route pieces may carry `joins: [{ to, rgb, lane, of }]`, ports `toward` and `rate`, towers `buy`, units `ready`. The painter takes `rim` (the seats' colours) and colours a tile's rim and walls from its owner.
- Frame times, headless Edge with the GPU at 1440 x 900, zooming (median / 90th percentile ms): Glass 5.6 / 10.3 against 4.6 / 9.8 before (the overlay 1.4 against 0.7); Fable 3.6 to 4.9 / 5.0 to 9.6; Banners 7.3 / 12.9 against 7.9 / 13.7.
- `src/map` 56.4 to 64.5 kB compressed (guide 45); everything shipped 743.0 to 752.7 kB. `test/reading.test.mjs`: the placer, the links, the symbols.

## v0.9.6 (2026-11-27): Capo's world map, closer in

### Capo's lit map: pips, mission pins, cities and towns, dressing, sharper relief, lit lakes

**Players**
- **Strength pips** stand on a dark tray in front of every army, armour and gun block, and beside every fleet, from the region zoom in: one pip a point of might as the rules count it now (war weariness, lost land and sabotage included), five to a row, ten at most.
- **Mission pins.** A mission ordered this turn puts a pin on the target country's capital (blue to scout, orange to sabotage, gold to rescue) with the agent standing beside it, and a dotted thread from your capital. Someone held stands under a dark red pin where they are held, with a thread home. A country you scouted (its watch known) and one you sabotaged keep a small pin while it lasts. Threads show on the flat map too.
- **Cities and towns by zoom.** Every capital is shown at every zoom (the smaller countries' as a small keep on the whole world). From the region zoom, each country's two great cities (the provinces far smaller than its usual one, as Berlin, Moscow or Delhi are); from the country zoom, its other cities and a town in every province once the province is large enough on screen to hold one, with the province's name just above it.
- **The land dressed close in.** At the country zoom forests, hills, peaks, dunes, marsh, grass and ice stand on the land: on an invented world from each province's terrain, on the real one from its heights (peaks where the ground is rough and high, a few long hills, ice where the map marks it). They keep their places as you zoom, and more come in between. The Campaign map style, which stands no hills or peaks, stands no hills or peaks here either.
- **Sharper relief at the country zoom.** The heights are read smoothly instead of in facets, and fine relief is added where the 2048 picture runs out, strongest in rough country, so mountains stay crisp and plains stay calm.
- **Lakes are part of the lit ground**: water on the land's top, with the lamp's gloss and the pieces' shadows on them, and a fine shore line. The flat map keeps its lake fills.

**Contributors**
- `src/map/dress.js` (new): Capo's own models (`pips1` to `pips10`, `fpips1` to `fpips10`, `agent`, `dune`, `reeds`, `grass`, `floe`, `ridge`, `hamlet`) and `Dressing`, which fills a province raster once a world, works out each spot once (a grid of cells that halve with the zoom, each level keeping the levels above) and stands only the spots in view, up to a cap (520 on desktop, 260 on a phone).
- `src/map/world.js`: `WorldGround.lakes(rings)` and a lake program drawn on the land's top with a polygon offset; `draw()` takes `detail` (0 to 1) and `octaves` (3 on a phone, 4 elsewhere) for the fine relief (a cubic read of the heights and value noise with its slope, turned each wave).
- `site/mappieces.js`: `townsOf(world)`; pieces carry `pips`; `mapPieces` takes `strength` and `g` (read only) and returns `threads`. `site/worldmap.js`: pieces culled to the view, pips and dressing staged, threads painted, province names lifted above their towns, lakes kept as outlines (`world.lakeRings`). One marked hook in `site/game.js` ("capomap hook") passes the strength and the game.
- Sizes, compressed: `src/map` 56.4 to 61.7 kB, site code 233.2 to 236.1 kB, everything shipped 743.0 to 751.3 kB. `test/capomap.test.mjs` (4 tests).
- No new data and no download: towns come from the province shapes, dressing from the terrain words and the relief already shipped.
- Frame times, headless Edge on the GPU (RTX 3080, ANGLE D3D11), whole frame callback plus a one-pixel read, median / 90th percentile in ms, before and after, second of two interleaved runs (the machine was shared, so runs vary by 1 to 2 ms): 1440 x 900 panning the world 2.2 / 2.9 then 2.6 / 3.1, a region 3.2 / 4.1 then 2.8 / 3.5, a country 2.5 / 3.0 then 3.3 / 3.9, close in 2.5 / 3.1 then 4.0 / 4.7. The page's own code alone (no read back) 0.5 to 1.4 before, 0.9 to 1.3 after. Phone size (390 x 844 at 3x) with the CPU slowed 4x: medians 2.4 to 7.5 before, 2.3 to 6.1 after; 90th percentiles 6.8 to 12.6 before, 8.0 to 17.6 after. An invented world close in, 1440 x 900: 1.7 to 3.6 before, 1.9 to 2.2 after. One-off costs, the first time the country zoom is reached: the province raster for the dressing, about 30 ms on the real world, and reading back the relief, a few ms.

## v0.9.5 (2026-11-27): dice that roll, armies that march, and sound

### The table games move and sound

**Players**
- **Brass and Banners: dice are thrown on the table.** An attack's dice tumble from your province, bounce and settle beside the one you attack, on the real throw; the losing dice dim, and in the tilted looks they become the dice that lie on the table. A won fight marches the army in and the province is taken with a ring and your emblem. Moves and moving in march across the map; placing strength marks the place; a fort is built with a small flourish.
- **The Island Fable:** units walk from hex to hex (boats sail a little slower), taking a rival's hex rings it in your colour, raising a scout, a fort or a farm is built with sparks, and units that cannot be paid fade away.
- **Grain and Glass:** the two dice roll onto the island and settle, then the hexes that yield glint in their good's colour; depots, towns, harbours and routes are built with a flourish.
- **An Inch of Ink:** a band of light crosses the map when a new age begins.
- **A win has its moment:** pennants in your colours fall across the result card.
- **The camera follows a rival's move,** gently, when it happens out of view and the map is zoomed in. It never moves while you are dragging or zooming, or for a few seconds after you last moved the map.
- **New sounds, made as the game runs:** dice, a march, a capture, building, and in An Inch of Ink five of its own: you are attacked, you finish a nation, a truce begins or ends, a new age, and you are out. All short and quiet, under the Sound switch and the volume.
- Motion never holds up a move: the board already shows where things stand, and you can play on while it plays. With Motion set to Reduced (or the system asking for less motion) nothing moves and the dice stay in the panel and on the map as before. Bots set to Instant play without motion.

**Contributors**
- `src/map/motion.js`: one canvas over the window, drawn only while an effect runs (`travel`, `dice`, `capture`, `build`, `pulse`, `sweep`, `pennants`); `frames()` gives the frame gaps and the layer's own work per frame. `site/motion.js`: each game's events as motion, the camera follow, `moving(T)`. `site/sound.js`: the cues (`CUES`, `cuesOf`, `play`), on `audio()` from `site/shell.js`.
- Marked "motion hook" lines: `src/map/board.js` gains `hold(cells, ms, kinds)`, `place(i, dx, dy)`, `nudge(dx, dy)`, `zoomed` and `middle`; `site/hexboard.js` exposes the board as `moving`; `site/table.js` calls `stir` after each move and `hail` at the end (in place of `cue`); `site/banners.js` throws the dice through `bannersDice` instead of its floating box.
- The layer's own work: median under 1 ms a frame, slowest 2.5 ms with nine effects, dice and pennants at once at 1440 x 900, 3.8 ms at phone size. The three new files add 11 kB compressed. Rules untouched: games stay whole-number and replay from seed and moves.
- `test/motion.test.mjs`: which cue each event makes, in every game.

## v0.9.4 (2026-11-27): lists that wrap, names on the board, a lesson that waits

### The table games' shell and pages: lists that wrap, places named on the board, a lesson that waits for you

**Players**
- **Long lists wrap.** The lists of provinces, hexes and places in the move panel are rows that wrap and scroll down inside a box of about three rows, instead of one sideways strip with most of it out of view. Brass and Banners lists your provinces at the front first, the strongest first; Grain and Glass lists depot sites best first.
- **The chosen place is named on the board.** Choose "Depot at F8", a village or a province, in the list or on the map, and its name stands over it on the board. A place chosen in the list while it is off screen or under a panel is brought into view.
- **Grain and Glass no longer chooses a place for you.** The main button reads "Choose a hex, on the board or in the list" until you do; Enter on a place in the list chooses it and builds there.
- **The Island Fable's lesson waits for you** to join units, take a rival hex and cut a rival's land, rather than offering Next; Next shows only while the move cannot be made this turn, and the step says so.
- **Brass and Banners logs both sides' losses** in a fight that is won, not only in one that is lost.
- **Larger text no longer cuts the bar.** The round line takes two lines where it must, the seats strip under it moves down with it, a narrow phone puts each seat's number under its name, and the zoom buttons on a phone are a row just above the move panel, so they never climb onto the seats.
- **Expansions say what they add** under each switch on the title card, on a phone too (it was a tooltip).
- With the letter keys off (Settings), typing letters in a list jumps to the place whose name starts with them.
- Fable's Concede says its second step aloud; Banners says "choose it on the map or in the list" where it said "tap".
- **Page titles and landmarks.** Every game page's title names the site ("Brass and Banners · Overture of Empires: Capo"), the board and panels are the page's main part with a heading of their own in play, and the seat list is named Players. The world map has a heading, a main part and a link to all games.

**Contributors**
- `radio()` keeps a list's vertical scroll as well as its sideways one, and does type-ahead when `settings.keys` is off. `.strip` is a wrapping, vertically scrolling list (table.css).
- Shell hooks p10 in `site/table.js`: `G.nameOf(p, cell)` names the cell a game lights as `aim` (else `ring`); the shell wraps `board.light` and `board.clear` to place `.cell-tag`, and calls `board.centre(cell)` when that cell is off screen or covered. `--bar-b` (the bar's foot, from a ResizeObserver) places the seats strip under the bar.
- Coach steps take `next` as a function, `(T) -> true` while a move-asking step cannot be done now.
- Game pages: `<header id="bar">` comes first, then `<main>` with a visually hidden `h1.play-h` (hidden on the title by `.menu .play-h`); the title is `<section id="title">`. `site/game.html` and `site/world.html` gain `<main>`.

## v0.9.3 (2026-11-26): Late 2026 first, no-AI turns in one press, and Inch's third age sooner

### An Inch of Ink: the third age sooner, Continue paused, a nudge to Normal

**Players**
- **Age III comes at 4:00 on the world map** (it was 5:00), so a first game against gentle rivals, won in about four minutes, now reaches the last age: the card, and the goal that begins to ease. Continents and islands are unchanged.
- **Continue brings a game back paused.** A real-time game opened with Continue (or from a saved file) waits for you, and the button says so: "Continue, paused at Age II, 3:12 of game time". The panel reads "Paused where you left it"; Resume or Space goes on.
- **A quick win against gentle rivals suggests Normal.** Under three minutes of game time, the end screen says what normal rivals do and offers "Try Normal rivals", the same game against them.
- The middle tier is called Normal everywhere it is shown (the menu, How to play, your record); games saved with it keep the name `even`.

**Contributors**
- Inch rules are version 12 (saves from 11 do not open): `AGE_AT.world` is `[0, 240, 480]`. Games stay whole-number and replay from seed and moves.
- Measured with `tools/inchtiers.mjs`, 200 games a row, version 11 then 12. Newcomer: Gentle 87% won in a median 4:11, now 84% in 4:04; Normal 15% in 4:02, now 14% in 3:55; Hard 3% in 3:29, unchanged. Steady: Gentle 100% in 2:56, unchanged; Normal 42% in 3:30, now 41% in 3:30; Hard 7% in 3:48, unchanged. Regular: unchanged (100% in 2:20, 14% in 2:48, 1% in 3:39). No tier needed retuning.
- Ink fairness, 1,000 bots-only games a map at Normal: world 0.68 to 1.30 (was 0.71 to 1.26), continents 0.60 to 1.46 and islands 0.82 to 1.28 (unchanged). All inside 0.5 to 1.5.
- The table shell takes `G.continueText(position)`, a game's own words for the Continue button. Inch's page adds `hold` (a game brought back opens paused), `continueText` and `nudge` (the end screen's suggestion, through `G.report`).

### Capo starts in late 2026, and the front page keeps one blue

**Players**
- **"Late 2026: the world as it stands" is the first start, and the one chosen** when Capo opens: the present day with its wars, alliances and leaders in place. The blank present day follows it, renamed **"A clean slate"** (no wars or treaties yet); games and scenario files made from it still open.
- **With no AI, Advance asks only once.** The first Advance in a browser still offers the choice: move the world by the rules, or connect an AI. After that Advance moves the world by the rules at once, and a small **Connect an AI** beside it opens the AI settings (still in the Game menu too). Actions in your own words are kept for a turn told by an AI, as before.
- **The front page has one dark blue**, with no lantern switch; a choice kept from the old switch no longer changes it.

**Contributors**
- `src/story/presets.js`: `FIRST` (the start the first screen opens on) and `startOrder(blank, presets)`, the first screen's order. The clean slate keeps the id `today`.
- `site/main.js` no longer reads or writes `capo-tent-theme`; the table games' Light setting still does (`site/guard.js`, `site/table.js`). `site/icons/game-icons/old-lantern.svg` is gone with its credit.

## v0.9.2 (2026-11-26): An Inch of Ink waits for you, and fights fairer

### An Inch of Ink: a clock that waits, rivals that teach, attacks you can see, and a truce

**Players**
- **The clock waits for your first order.** After you choose where to start, nothing moves until you send something (or press Start the clock), so reading the panel costs nothing. The panel says so.
- **Space pauses whatever has the keyboard**, the Send button included; it no longer sends again. The button reads Pause, Resume, or Start the clock.
- **Find me moves the map.** It brings the map in close on your land and slides it to the middle, then glows your border as before.
- **On a phone the map starts close on your land** once you have it (and when a saved game is brought back), instead of the whole world in a strip. A zoomed map now keeps its place when the panel grows or shrinks.
- **Attacks on you are plain.** As a rival starts one, the log says "Holm attacks you." (once in half a minute for each attacker), the edge of the board flashes red, your border with it glows and an arrow comes in from its land. Land of yours that is surrounded and soaking away is told and shown the same way. When you are out, the log and the sheet say who took your last land and when; the log also says when you finish a nation.
- **Rivals retuned.** Gentle: rivals grow at eight tenths of your pace, leave you alone for two minutes, then only one attacks you at a time. Normal (the old Even, renamed): eight tenths, 30 seconds, two at once. Hard: nine tenths, a 20-second opening truce, three at once. Measured with a scripted newcomer: Gentle won 87 games in 100 in a median 4:11 (it was always won, in 2:55, without losing a cell); Normal 15 in 100 (was 1); Hard 3 in 100 and alive at one minute 98 times in 100 (was out in a median 0:52). How to play gives each tier's numbers from the rules' own table.
- **A truce with one neighbour.** Choose a neighbour in the list and offer it a truce: for a minute neither of you can attack the other, kept by the rules, and attacks between you come home whole. One at a time, a minute's wait after one ends, and a neighbour holding more than twice your strength will not take one. No alliances.

**Contributors**
- Inch rules are version 11 (saves from 10 do not open): `RIVALS` gains `pile` (most rivals attacking you at once) and new numbers, Hard and Normal gain a truce; the `pact` move, `p.pact`, `PACT`, `pactOn` and `pactWhy`; events `attacked` (a rival starts an attack on you, by land or boat), `soaked` (your land soaks into a rival this tick), `pact`, `pactend`, and `out` now carries `by`. Games stay whole-number and replay from seed and moves.
- `tools/inchtiers.mjs`: three scripted players (newcomer, steady, regular) against each tier, and the ink fairness table with bots on every seat. `node tools/inchtiers.mjs players` and `node tools/inchtiers.mjs inks`.
- Ink fairness, 1,000 bots-only games a map at Normal, ink win share against share of nations: world 0.71 to 1.26, continents 0.60 to 1.46, islands 0.82 to 1.28 (version 10's Even, same harness: 0.76 to 1.41, 0.66 to 1.47, 0.70 to 1.32). All inside 0.5 to 1.5.
- `src/map/board.js`: a marked one-line hook so that `layout` keeps a zoomed view's middle (for the board's owner to keep or replace).

## v0.9.1 (2026-11-26): the cold review fixes, a bag of dice, plans worth buying

### The table games' shell: a board that fills the screen, a game kept safe, take back that hides nothing

**Players**
- **The world map fills the screen.** In Brass and Banners and An Inch of Ink the map now opens as tall as the window allows and centred on your own land, with the panels over its far edges; the home button (and the 0 key) returns there, as do a resize and a change of the board's look. Minus still zooms out to the whole map. In real time the map goes to your land as soon as you have some.
- **Play asks before it replaces your game.** With a game in progress, Play, Begin and opening a saved game ask first, in the page: continue that game, or start the new one. This browser keeps one game at a time.
- **Phone on its side and small windows.** A landscape phone or a window under about 1100 wide (or under 600 tall) now has its own layout: the players in a strip under the top bar, the move panel a full-height column at the right, the board the rest, the zoom buttons a row in its corner. The row with End turn and the main button stays at the foot of the move panel however far its lists scroll, on every screen, and so does Send in An Inch of Ink. On a wide screen the zoom buttons are a row below the players' cards and no longer cover them.
- **Take back hides nothing.** Take back now undoes only your own moves of this turn, and stops at anything chance has shown (a roll, a card drawn, a steal) and at any other player's or bot's move. It says why when it cannot, and no longer speaks of dice in games without them.
- **Step through a finished game.** The end screen's "Step through the game", and a slider under the result in the move panel, show the board after any move of the game, one move at a time with the arrow keys or the buttons beside it.
- **Seat patterns are on by default**, so colour is never the only sign of whose land it is. Turn them off in Settings; if you changed a setting before, they are now on until you do.
- **Menus.** The menu always opens on Game, keeps one size from tab to tab so its tabs never move under the pointer, and a game on a clock no longer offers Bot speed or speaks of ending turns. Words from the last game no longer linger in a new one.

**Contributors**
- `takeBack(match, kinds, floor)` in `site/shell.js` decides what can be taken back ("yes", "none" or "chance"); it reads the match's own record (`turn`, `at`, `rolled`), so the rules are untouched and a seed plus the moves still replays every game. Tested in `test/shell.test.mjs`.
- A game may give `stands`, the line said when the last move showed chance. Brass and Banners and Grain and Glass do.
- Settings are saved with `v: 2`; a `patterns` value saved without it is ignored.
- The end-of-game slider shows a past position by putting a view of the finished match (`Object.create`, its `position` read from `match.at(n)`) in `T.match`; any new game, or the title, puts the real one back.
- Layout: `body.side` is set by `table.js` for the side layout; `#sheet.tabbed` is the menu; `.board-zoom` is the table games' zoom group; `--plate` is the move panel's solid ground under its sticky rows.
- **Shell hook in `src/map/board.js`** (for the 3D lead to keep or fold in): `layout(free)` takes `free.fill` (open a wide map as tall as the free space, at most a quarter wider than the stage) and `free.at` (a cell to centre at that zoom); `zoom(0)` goes to that opening zoom, not the whole board; a look change settles there too; and a new `centre(cell)`. Without `fill` the phone opening is as before. `site/hexboard.js` adds `focus(seat)`, the cell nearest the middle of a seat's land.

### Brass and Banners: exact numbers, and an open bag of dice

**Players**
- **Move exactly as many as you mean.** After a conquest, when placing and on the last move, every number can be chosen: a minus and a plus button beside the slider, and a box to type the number in (Enter moves). The keys - and + step too. Before, a big stack could only be split at a few stops.
- **Dice luck, an open bag**, a Custom switch. Every die is drawn from a bag of throws that starts with six of each face, so over a game each face comes up about as often as the others. What is left in the bag is shown under the dice and in Lands and dice; when fewer than 12 are left, a fresh set of 36 goes in. Fair dice stay the default in every rule set, and Play is still Traditional.

**Contributors**
- Banners rules are version 7: `occupy`, `place` and `move` list every amount (`amounts(n)` is now 1 to n), the `luck` switch (`fair` or `bag`, normal `fair`, Custom only) and `bag` (six face counts, or null) in the position. Dice from the bag are drawn by the seed, so a seed and the moves still replay. Saves from version 6 do not open as version 7.

### Grain and Glass: plans worth buying, port rates on the board, a gentler lesson

**Players**
- **Plans are worth their price.** A plan now costs 1 Grain, 2 Glass and 2 Salt (five goods, was six). A harvest brings two each of the two goods you hold least (was one each). The deck has one more seal and one fewer harvest: 5 harvests, 5 works, 5 tolls, 6 seals. A plan can still be played the turn it is drawn.
- **Port rates on the board.** Each port's rate is printed on the sea beside its flag: 3:1, or 2:1 and the good. The board as a list has a Port column.
- **The lesson's toll gate is gentle**: it takes nothing from a player on 2 points or fewer, and the lesson says so.

**Contributors**
- Glass rules are version 6: `COST.plan` is `[1, 2, 0, 2]`, `harvestOf` adds two of each, and the deck is built from `DECK`. Saves from version 5 do not open as version 6.
- `node tools/plans.mjs` measures plans: bots that aim for a plan whenever their next build is two goods or more away play bots that do not, each seed both ways round. Over 2,000 games a seat count, the plan seekers won 44.8, 41.5, 38.5, 40.0 and 39.0% at two to six seats under the old plans; now they win 50.3, 50.1, 48.6, 48.8 and 49.0% at two to six seats. The bot hook it uses is `trial` in `src/games/glass/bot.js`, empty in play.
- Fairness, 1,000 Traditional bot games a seat count: wins by seat 47.2/52.7 at two seats, 35.7/34.0/30.3 at three, 24.0/24.5/24.8/26.7 at four, 18.9/19.8/19.7/22.4/19.2 at five, 15.9/18.2/16.5/15.0/18.2/16.2 at six. The widest gap is 5.5 points (two seats).

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
