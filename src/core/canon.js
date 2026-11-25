// SPDX-License-Identifier: AGPL-3.0-or-later
// One exact way to write a value as text, the same on every machine.
// Only whole numbers, text, true, false, null, lists and plain objects are allowed:
// fractions can round differently between browsers.

const MAX_DEPTH = 40;

export function canon(value) {
  return write(value, "value", 0);
}

function write(v, where, depth) {
  if (depth > MAX_DEPTH) throw new TypeError(`${where}: nested too deeply`);
  if (v === null || v === true || v === false) return String(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new TypeError(`${where}: ${v} is not a whole number`);
    return String(v === 0 ? 0 : v); // no negative zero
  }
  if (typeof v === "string") {
    if (!wellFormed(v)) throw new TypeError(`${where}: broken text`);
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!Object.hasOwn(v, i)) throw new TypeError(`${where}[${i}]: missing item`);
      out.push(write(v[i], `${where}[${i}]`, depth + 1));
    }
    return "[" + out.join(",") + "]";
  }
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new TypeError(`${where}: not a plain object`);
    const keys = Object.keys(v).sort(); // sorts by code unit, not by language
    return "{" + keys.map((k) => write(k, where, depth + 1) + ":" + write(v[k], `${where}.${k}`, depth + 1)).join(",") + "}";
  }
  throw new TypeError(`${where}: ${typeof v} is not allowed`);
}

function wellFormed(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/** Freeze a value all the way down, so nobody can change a position by accident. */
export function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}
