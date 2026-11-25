// SPDX-License-Identifier: AGPL-3.0-or-later
// Games played by pasting a link. The whole game is in the part after #, which browsers do not send to the host.
// With a password the game is locked (AES-GCM, the key made from the password by PBKDF2) before it goes in the link.
import { Refusal } from "../src/core/index.js";
import { SITE_URL } from "./config.js";

const ID = 6, SALT = 16, IV = 12, ROUNDS = 250000, PLACE = "capo-link-";
const broken = () => new Refusal("link", "that link is broken or not complete");
export const canLock = () => !!globalThis.crypto?.subtle;

const to64 = (b) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join("")).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
function from64(t) {
  try { return Uint8Array.from(atob(t.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)); } catch { throw broken(); }
}
const join = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
async function keyOf(password, salt) {
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ROUNDS }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export const newId = () => to64(crypto.getRandomValues(new Uint8Array(ID)));

/** The address to paste. A page opened as a file would show a folder of this computer, so it uses the public address instead. */
export async function makeLink(page, id, bytes, password = "") {
  const at = location.protocol === "file:" ? `${SITE_URL}${page}.html` : location.origin + location.pathname, name = from64(id);
  if (!password) return `${at}#t=${to64(join([0], name, bytes))}`;
  const salt = crypto.getRandomValues(new Uint8Array(SALT)), iv = crypto.getRandomValues(new Uint8Array(IV));
  const shut = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: name }, await keyOf(password, salt), bytes));
  return `${at}#t=${to64(join([1], name, salt, iv, shut))}`;
}

/** Read a pasted link. Returns { id, locked, open(password) -> bytes }. */
export function readLink(text) {
  const m = String(text).trim().match(/#t=([\w-]{12,60000})/);
  if (!m) throw new Refusal("link", "that is not a game link from Overture of Empires");
  const b = from64(m[1]), name = b.subarray(1, 1 + ID), rest = b.subarray(1 + ID), id = to64(name);
  if (b.length < 2 + ID || b[0] > 1) throw broken();
  if (!b[0]) return { id, locked: false, open: async () => rest };
  if (rest.length < SALT + IV + 17) throw broken();
  return {
    id, locked: true,
    async open(password) {
      if (!canLock()) throw new Refusal("link", "this browser cannot open a game with a password");
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rest.subarray(SALT, SALT + IV), additionalData: name }, await keyOf(password, rest.subarray(0, SALT)), rest.subarray(SALT + IV)));
      } catch { throw new Refusal("password", "that is not the password, or the link was changed"); }
    },
  };
}

/** Link games kept in this browser: { game, save, kinds, roles, pass, floor, when }. */
export const linkGames = {
  get(id) { try { return JSON.parse(localStorage.getItem(PLACE + id) || "null"); } catch { return null; } },
  put(id, r) { try { localStorage.setItem(PLACE + id, JSON.stringify(r)); } catch { /* the links themselves still hold the game */ } },
  drop(id) { try { localStorage.removeItem(PLACE + id); } catch { /* nothing to remove */ } },
  list(game) {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith(PLACE)).map((k) => ({ id: k.slice(PLACE.length), ...this.get(k.slice(PLACE.length)) })).filter((r) => r.game === game).sort((a, b) => (b.when || 0) - (a.when || 0));
    } catch { return []; }
  },
};
