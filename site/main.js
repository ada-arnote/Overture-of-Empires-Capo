// SPDX-License-Identifier: AGPL-3.0-or-later
import { chance, fingerprint, seedState } from "../src/core/index.js";
import { footer } from "./footer.js";

const $ = (id) => document.getElementById(id);
footer();

// The same short check everywhere. Node's tests hold this code to the same answer.
$("check").addEventListener("click", () => {
  const dice = chance(seedState("page check"));
  const code = fingerprint(Array.from({ length: 1000 }, () => dice.die()));
  $("answer").textContent = code === "4386081a00681e1f" ? "This browser gives the same answers as ours." : `This browser differs: ${code}. Please tell us.`;
});
