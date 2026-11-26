// SPDX-License-Identifier: AGPL-3.0-or-later
// The game pages in site/ are the source the built pages in play/ are made from (tools/bundle.mjs leaves this
// script out of them). Served from this computer they run as they are, for work on them; served from the public
// site they send the player to the built page, which is the one that is kept whole.
if (location.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  const built = location.pathname.replace(/\/site\/(banners|fable|glass|inch|game|world)\.html$/, "/play/$1.html");
  if (built !== location.pathname) location.replace(built + location.search + location.hash);
}
