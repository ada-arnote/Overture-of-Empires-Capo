# Deploying the small worker

The worker behind room codes, the relay, play by turn with a "your turn" notice, and saves by code (ruling 155). Nothing is deployed until the owner does the steps below. Nothing secret is in this repository: keys are given to Cloudflare directly and kept nowhere else.

## What you need

- A Cloudflare account under the studio name (ruling 153: never the owner's own name). Free plan only.
- Node.js 20 or newer on your computer. The deploy tool, `wrangler`, is fetched by `npx` when you run it; it is a tool on your computer, never part of the site.

## Steps

1. **Open the account.** Sign up at dash.cloudflare.com with the studio's email address. Choose the Free plan. **Do not add a card.** If sign-up asks for one, stop and bring it back (options.md decision 3).
2. **Choose the workers.dev name.** In the dashboard, Workers and Pages, set your `workers.dev` subdomain. Use the studio name: it is part of the address players' browsers will reach (`capo-rooms.<subdomain>.workers.dev`).
3. **Log in from your computer.** In a terminal, in this folder (`server/worker`):
   ```
   npx wrangler login
   ```
   A browser page asks you to allow it. No account id goes in any file: wrangler remembers the login on your computer.
4. **Check, then deploy.**
   ```
   npx wrangler deploy --dry-run
   npx wrangler deploy
   ```
   The second prints the worker's address. Open `https://capo-rooms.<subdomain>.workers.dev/health`: it should show `"ok":true` and the four games with their rules versions.
5. **Notices (optional; everything else works without them).**
   ```
   node tools/keys.mjs
   npx wrangler secret put VAPID_PUBLIC
   npx wrangler secret put VAPID_PRIVATE
   ```
   Paste each value when asked. Do not save them anywhere else. A new pair later only means players turn notices on again.
6. **Tell the lane the address.** Send the address from step 4. It goes in the one named-address list in `site/config.js` (name `worker`) and in the page rule of each table page that uses it, through the gate, as ruling 155 asks. Until then the pages never contact it.

## Staying at $0

- The Free plan cannot send a bill. Past its daily limits (100,000 requests a day for the worker and for Durable Objects; Durable Objects storage 5 GB) the worker answers with errors until 00:00 UTC, and the pages fall back to play by link.
- Never press "Upgrade" to Workers Paid, and keep no card on the account. Billing, Subscriptions should list only Free plans.
- Leave Cloudflare's relay (Realtime TURN) off for now. Its first 1,000 GB are free, but whether a Free account can be billed past that is not confirmed. Without it, rooms relay moves themselves, which stays inside the Free plan. If it is wanted later: create a TURN key in the dashboard (Realtime, TURN), then `npx wrangler secret put TURN_KEY_ID` and `TURN_KEY_TOKEN`.
- The optional rate-limit binding at the end of `wrangler.toml` stays commented out unless the dashboard shows it on the Free plan.

## Closing it, or deploying again

- **Close every room at once:** set `OPEN = "no"` in `wrangler.toml` and `npx wrangler deploy`. Pages fall back to play by link.
- **Delete everything:** `npx wrangler delete` removes the worker and all its rooms and saves.
- **After a rules version changes** (a game's `version` in `src/games/*/rules.js`), deploy again. A page with newer rules than the worker is refused by name ("the worker has version 7 of banners"), never played on old rules.

## What the worker keeps, and for how long

For the privacy note (options.md decisions 11 and 15). No internet address, name, email or seat key is ever written: addresses are counted in memory for rate limits and forgotten; seat keys and passwords are kept only as digests.

| What | Kept | Deleted |
|---|---|---|
| A live room: game, options, seed, seats' roles, moves, key digests | while in use | one day after the last move or visit |
| A room by turn: the same | while the game goes on | 90 days after the last move; a week after the game ends |
| A seat's push subscription (only if notices are turned on) | while the game goes on | when notices are turned off, the game ends, the push service withdraws it, or the room goes |
| A save by code: the save text, under a digest of its code | a year after it was last opened or written | then, or at once when the player drops it |
| Logs | none of ours (`observability` is off) | Cloudflare keeps its own as host |

## Trying it without Cloudflare

`node --test test/worker.test.mjs` runs the worker against a stand-in for Cloudflare's runtime made from Node's own modules (`test/fixtures/workerd.js`). `npx wrangler dev` runs it on your computer in Cloudflare's own runtime, if you want that as well.
