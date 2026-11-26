# Changelog

What changed in each tagged version of Overture of Empires: Capo, newest first. Each version is a git tag (`v0.5.0`); `git show v0.5.0` has the full detail. How a version is made: `RELEASING.md`.

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
