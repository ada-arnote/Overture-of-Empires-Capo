# Releasing

How a version of Overture of Empires: Capo goes out. A version is a commit on `main` with a tag (`v0.5.0`), an entry in `CHANGELOG.md`, and the same number in `package.json` and `site/config.js`. The web address serves `site/` and `play/` from `main`, so a push to `main` is a release: nothing goes there that has not passed this list.

**Which number.** The last number for fixes and balance changes (`v0.4.4`); the middle one for a finished phase or new things to play (`v0.5.0`). A tag, once pushed, never moves: if a release is broken, fix it in a new version, as v0.4.4 fixed Grain and Glass.

## The checklist

Copy this into the pull request or your notes and tick it as you go.

**Before**
- [ ] The work to release is merged, and your copy of `main` is up to date with nothing uncommitted (`git status` is clean).
- [ ] Version bumped in both places, to the same number: `"version"` in `package.json` and `VERSION` in `site/config.js`.
- [ ] `CHANGELOG.md`: the Unreleased notes become `## vX.Y.Z (date): a short title`, in plain words, under **Players** and **Contributors**, with any **Known problem**. Players first: what they will notice, not which files changed.

**Build and gate**
- [ ] `node tools/bundle.mjs`, so every page in `play/` is rebuilt and stamped with the fingerprint of its code. Commit `play/` with the change; the GitHub check fails if the built pages differ from the source.
- [ ] `node --test test/*.test.mjs` passes.
- [ ] `node tools/check.mjs --release` ends in "All clear" (the everyday gate, plus the licence file and the source address).
- [ ] If rules or bots changed: `node tools/fair.mjs` (every game, rule set and seat count over 1,000 bot games) passes, each within ten points; and `node tools/browsers.mjs` if anything in `src/core` changed.

**In a browser**
- [ ] `node tools/smoke.mjs` passes: every built page and the front page open in a headless Chrome or Edge, Play is pressed where there is one, and there are no console errors, uncaught exceptions, page-rule refusals or failed requests. It needs Chrome or Edge installed; give another with `--browser path`.
- [ ] By hand, with `node tools/serve.mjs` (`--lan` to reach it from a phone), start every game and play a few turns, at desktop width and at phone width (about 375 px, or a real phone):
  - [ ] Brass and Banners
  - [ ] The Island Fable
  - [ ] Grain and Glass
  - [ ] An Inch of Ink
  - [ ] Capo, through the setup wizard to Begin and the first turn
  - [ ] the world map (`play/world.html`)
  - [ ] the front page: every link opens its game, and the footer shows the new version
- [ ] One double-click page from `dist/` (made by the bundle) opens with no server and starts.

**Out**
- [ ] Commit, with the version in the title: `Short summary of the release (vX.Y.Z)`.
- [ ] Tag that commit: `git tag -a vX.Y.Z -m "Short summary"`.
- [ ] Push `main` and the tag to the public repository (for example `git push origin main` and `git push origin vX.Y.Z`).

**After**
- [ ] The GitHub checks for that push are green: the tests, the gate, built pages matching the source, and every page starting in a browser.
- [ ] The live site (the address in `site/config.js`, `SITE_URL`) shows the new version and build in the footer once the host has updated, which can take a few minutes. Reload without the cache if it still shows the old one.
- [ ] On the live site, open every game and press Play, on a computer and on a phone.
- [ ] If anything is wrong, fix it in a new patch version through this same list; do not move the tag.
