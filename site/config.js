// SPDX-License-Identifier: AGPL-3.0-or-later
// Where this copy's source code can be read. Anyone who runs a changed copy puts their own address here.
export const SOURCE_URL = "https://github.com/ada-arnote/Overture-of-Empires-Capo";
// Where the games can be opened. Links made from a page opened as a file use it.
export const SITE_URL = "https://ada-arnote.github.io/Overture-of-Empires-Capo/play/";
export const VERSION = "0.10.8";
// "dev" in the pages as written; tools/bundle.mjs stamps each built page with a short fingerprint of its own code
export const BUILD = "dev";
// guide hook (ruling 153.8): each AI service's own pages, for links in the Choose an AI guide (site/aiguide.js). A player
// follows them in a new tab; the page never fetches them, and its rule does not reach them. Kept above the list of services
// the page may call, because the gate reads every address after that list's name as one the page calls.
export const AI_LINKS = {
  openrouterKeys: "https://openrouter.ai/settings/keys",
  openrouterPrivacy: "https://openrouter.ai/docs/features/privacy-and-logging",
  openrouterLimits: "https://openrouter.ai/docs/api-reference/limits",
  geminiKey: "https://aistudio.google.com/apikey",
  geminiLimits: "https://aistudio.google.com/rate-limit",
  geminiPricing: "https://aistudio.google.com/docs/pricing",
  groqKeys: "https://console.groq.com/keys",
  groqLimits: "https://console.groq.com/settings/limits",
  ollama: "https://ollama.com/download",
  ollamaHelp: "https://docs.ollama.com/faq",
  lmstudio: "https://lmstudio.ai",
  lmstudioServer: "https://lmstudio.ai/docs/developer/core/server/settings",
  node: "https://nodejs.org",
  openaiKeys: "https://platform.openai.com/api-keys",
  openaiPricing: "https://developers.openai.com/api/docs/pricing",
  anthropicKeys: "https://platform.claude.com/settings/keys",
  anthropicPricing: "https://platform.claude.com/docs/en/about-claude/pricing",
  deepseekKeys: "https://platform.deepseek.com/api_keys",
  deepseekPricing: "https://api-docs.deepseek.com/quick_start/pricing/",
  mistralKeys: "https://console.mistral.ai/api-keys",
  cerebras: "https://cloud.cerebras.ai",
  cerebrasLimits: "https://inference-docs.cerebras.ai/support/rate-limits",
  together: "https://www.together.ai",
};
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
// Ruling 155: the only outside addresses a table page may reach, for live play, each with its reason. They are reached only after a
// player asks for live play, never when a page opens. The table pages' rule (connect-src) lists exactly these; the gate holds them so.
export const LIVE_ADDRESSES = [
  { url: "stun:stun.cloudflare.com:3478", why: "STUN: tells each browser its own public internet address, so two browsers can connect directly. Free and unlimited by Cloudflare's own page; nothing about the game is sent" },
];
// worker hook (ruling 155): named outside addresses the table pages may reach for play with others, each with its reason.
// The room server's address, empty until the owner deploys it (server/worker/DEPLOY.md); when set, it joins the pages' named
// addresses beside LIVE_ADDRESSES. An empty address means nothing is ever contacted and the site stays fully static.
export const PLAY_ADDRESSES = [
  { name: "worker", address: "", reason: "room codes, a relay for pairs that cannot connect directly, play by turn with a 'your turn' notice, and saves by code (server/worker/)" },
];
