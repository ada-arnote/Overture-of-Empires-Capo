// SPDX-License-Identifier: AGPL-3.0-or-later
// Where this copy's source code can be read. Anyone who runs a changed copy puts their own address here.
export const SOURCE_URL = "https://github.com/ada-arnote/Overture-of-Empires-Capo";
// Where the games can be opened. Links made from a page opened as a file use it.
export const SITE_URL = "https://ada-arnote.github.io/Overture-of-Empires-Capo/play/";
export const VERSION = "0.10.0";
// "dev" in the pages as written; tools/bundle.mjs stamps each built page with a short fingerprint of its own code
export const BUILD = "dev";
// The AI services Capo's story game can call straight from the page, by preset (site/ai.js has their shapes and limits).
// The story page's rule (connect-src in site/game.html) lists exactly these origins and this computer; the gate holds them equal.
export const AI_BASES = {
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  together: "https://api.together.xyz/v1",
  cerebras: "https://api.cerebras.ai/v1",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
  llamacpp: "http://localhost:8080/v1",
};
