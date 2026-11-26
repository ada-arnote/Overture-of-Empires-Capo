// SPDX-License-Identifier: AGPL-3.0-or-later
import { BUILD, SOURCE_URL, VERSION } from "./config.js";
import { guard } from "./guard.js";

/** Every page shows its version and where its source can be read. */
export function footer() {
  guard();
  document.getElementById("version").textContent = `Version ${VERSION}, build ${BUILD}`;
  const at = document.getElementById("source");
  if (!/^https:\/\//.test(SOURCE_URL)) { at.textContent = "Source code: the address is not set yet"; return; }
  const a = document.createElement("a");
  a.href = SOURCE_URL;
  a.textContent = "Source code";
  at.replaceChildren(a);
}
