// SPDX-License-Identifier: AGPL-3.0-or-later
import { SOURCE_URL, VERSION } from "./config.js";

/** Every page shows its version and where its source can be read. */
export function footer() {
  document.getElementById("version").textContent = `Version ${VERSION}`;
  const at = document.getElementById("source");
  if (!/^https:\/\//.test(SOURCE_URL)) { at.textContent = "Source code: the address is not set yet"; return; }
  const a = document.createElement("a");
  a.href = SOURCE_URL;
  a.textContent = "Source code";
  at.replaceChildren(a);
}
