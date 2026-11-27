// SPDX-License-Identifier: AGPL-3.0-or-later
// The "your turn" notice (ruling 155). Registered by site/rooms.js only when a player turns notices on for a game by turn.
// It shows the notice the worker sends and opens that game's page on a tap. It keeps nothing and fetches nothing.
const NAMES = { banners: "Brass and Banners", fable: "The Island Fable", glass: "Grain and Glass", inch: "An Inch of Ink" };
const ROOM = /^[2-9BCDFGHJKLMNPQRSTVWXZ]{6}$/;

self.addEventListener("push", (e) => {
  let note = {};
  try { note = e.data ? e.data.json() : {}; } catch { note = {}; }
  const game = Object.hasOwn(NAMES, note.game) ? note.game : "", room = typeof note.room === "string" && ROOM.test(note.room) ? note.room : "";
  const page = new URL(game ? `../play/${game}.html${room ? `#room=${room}` : ""}` : "../", self.location).href;
  e.waitUntil(self.registration.showNotification("Your turn", { body: game ? `${NAMES[game]}${room ? `, room ${room}` : ""}` : "A game by turn waits for you", tag: `capo-${room || "turn"}`, data: { page } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.page || new URL("../", self.location).href));
});
