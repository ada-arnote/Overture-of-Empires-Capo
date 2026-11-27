// SPDX-License-Identifier: AGPL-3.0-or-later
// Choose an AI (ruling 153.8): a guide to the services Capo can reach, free routes first, then paid ones. Each says
// where to get a key, what to paste where, what it costs, what to expect, and what its pages did not confirm, with
// links that open the service's own pages in a new tab (the page never fetches them). "Use this" fills in How Capo
// reaches an AI; nothing is sent until the player presses Check connection there. Built from elements and text, never markup.
import { AI_LINKS, SOURCE_URL } from "./config.js";

/** The day each service's free tier, limits and steps were read on its own pages. */
export const CHECKED = "27 November 2026";
const KEEP = (n) => `Your key stays in this browser and goes only to ${n}. Capo has no server, and never puts a key in a save, a file or a web address.`;
const CHECK = "Press Check connection. When it answers, the AI is connected.";
const origin = () => (/^https?:/.test(globalThis.location?.origin || "") ? location.origin : "the address this page is opened from");

// group: free (a free tier, nothing to install), home (on this computer), paid. preset: the service in site/ai.js; model: what Use this fills in.
// unsure: what the service's own pages did not confirm on the day above.
const R = (group, preset, model, name, tag, more) => ({ group, preset, model, name, tag, unsure: [], links: [], ...more });
export const ROUTES = [
  R("free", "openrouter", "openrouter/free", "OpenRouter, free models", "Free, nothing to install, many models", {
    cost: "Free models (their names end in :free): 20 calls a minute and 50 a day. Once you have bought 10 credits (10 US dollars) in all, 1,000 a day. Its other models cost per use.",
    steps: ["Make an account at OpenRouter.", "Open Keys and create a key. Give it a small credit limit, so it can never spend much.", "Copy the key: it starts with sk-or-v1-.",
      "Here: press Use OpenRouter below, then paste the key into Key. The model is set to openrouter/free, which picks a free model for each call; or write any model whose name ends in :free.", CHECK],
    expect: "Quality and speed change with the free model it picks. At busy hours a free model may be slow or say too many requests; Capo waits and tries again. Each turn, chat message and council question is one call.",
    privacy: "Some free models are run by providers who keep or learn from what you send. OpenRouter's privacy settings choose which providers it may use.",
    links: [["Get a key", "openrouterKeys"], ["Free limits", "openrouterLimits"], ["Privacy and logging", "openrouterPrivacy"]] }),
  R("free", "gemini", "gemini-3.8-flash", "Google Gemini, free tier", "Free, nothing to install, good stories", {
    cost: "Free of charge for Gemini 3.8 Flash, 3.6 Flash and the Flash-Lite models, up to daily limits Google shows in AI Studio. Paid use of 3.8 Flash costs 0.75 US dollars per million tokens sent and 3.75 per million received (until 31 December 2026).",
    steps: ["Sign in to Google AI Studio with a Google account. Google's terms ask that you are 18 or over.", "Open Get API key and create a key. Copy it.",
      "Here: press Use Google Gemini below, then paste the key into Key. The model is set to gemini-3.8-flash; gemini-3.5-flash-lite is lighter and quicker.", CHECK],
    expect: "Good stories and quick replies. When the day's free limit is used up, Capo says too many requests or today's free limit is used up: wait for the next day, or choose another route. Older names such as gemini-2.5-flash move to newer models on 1 December 2026.",
    privacy: "On the free tier Google may use what you send to improve its products. On a paid account it does not.",
    unsure: ["The free tier's numbers for each model: Google's public page sends you to AI Studio for them."],
    links: [["Get a key", "geminiKey"], ["Your limits", "geminiLimits"], ["Prices", "geminiPricing"]] }),
  R("free", "groq", "openai/gpt-oss-120b", "Groq", "Free plan, very fast", {
    cost: "A free plan with limits for each model: calls a minute and a day, and tokens a day. Past them Groq answers too many requests; it does not charge you.",
    steps: ["Make an account at GroqCloud.", "Open API Keys and create a key. Copy it.",
      "Here: press Use Groq below, then paste the key into Key. The model is set to openai/gpt-oss-120b; openai/gpt-oss-20b is quicker.", CHECK],
    expect: "Replies come very fast. The gpt-oss models think before they write, so Capo allows them a longer reply.",
    privacy: "Groq's pages did not say how free-plan requests are used.",
    unsure: ["The free plan's numbers: Groq's page shows its paid Developer plan (30 calls a minute, 1,000 a day for gpt-oss-120b) and sends you to your own Limits page. Others report the same 1,000 a day on the free plan."],
    links: [["Get a key", "groqKeys"], ["Your limits", "groqLimits"]] }),
  R("home", "ollama", "", "Ollama, on this computer", "Free and private, needs a capable computer", {
    cost: "Free: your own computer does the work.",
    steps: ["Install Ollama from its site.", "In a terminal, fetch a model, for example: ollama pull llama3.1 (its library lists others; bigger models need more memory).",
      [`Let this page in: set OLLAMA_ORIGINS to ${origin()}, then restart Ollama.`, [
        "Windows: quit Ollama from the taskbar, search Settings for environment variables, choose Edit environment variables for your account, add OLLAMA_ORIGINS, then start Ollama again.",
        `macOS: run launchctl setenv OLLAMA_ORIGINS "${origin()}" and restart Ollama.`,
        `Linux: run systemctl edit ollama.service, add Environment="OLLAMA_ORIGINS=${origin()}" under [Service], then run systemctl daemon-reload and systemctl restart ollama.`]],
      "Here: press Use Ollama below and write the model's name as you fetched it. No key.", `${CHECK} If your browser asks whether this page may reach devices on your network, allow it.`],
    expect: "Speed and quality depend on your computer and the model. A small model answers quickly but tells plainer stories and slips more often; the rules check every reply anyway.",
    privacy: "Nothing leaves your computer.",
    links: [["Download Ollama", "ollama"], ["Ollama's help on settings", "ollamaHelp"]] }),
  R("home", "lmstudio", "", "LM Studio, on this computer", "Free and private, an app with buttons", {
    cost: "Free: your own computer does the work.",
    steps: ["Install LM Studio and download a model in it.", "Open its server settings, turn on Enable CORS, and start the server (it listens on port 1234). In a terminal, lms server start --cors does the same.",
      "Here: press Use LM Studio below. Check connection lists the models it has loaded: copy one into Model. No key.", `${CHECK} If your browser asks whether this page may reach devices on your network, allow it.`],
    expect: "As with Ollama, speed and quality depend on your computer and the model you load.",
    privacy: "Nothing leaves your computer.",
    links: [["Download LM Studio", "lmstudio"], ["Its server settings", "lmstudioServer"]] }),
  R("home", "bridge", "", "Your own AI app, through the bridge", "No key: the AI app you already use", {
    cost: "Nothing more to pay: your AI app's own plan does the writing, within that plan's limits.",
    steps: ["Get Capo's source and Node 22 or newer.", "In a terminal there, run: node tools/capo-mcp.mjs. It prints a page token and how to add the bridge to your AI app (any app that takes MCP tools).",
      "Here: press Use the bridge below and paste the page token.", "Press Check the bridge. Then start a turn, and tell your AI app: play my Capo turn."],
    expect: "You switch to your AI app for each turn. The story is as good as the model your app uses.",
    privacy: "Your AI app sees each prompt and a short summary of the game, under its own terms. The bridge stays on this computer and calls nowhere.",
    links: [["Capo's source", "source"], ["Node", "node"]] }),
  R("paid", "openai", "gpt-5-mini", "OpenAI", "Paid by use", {
    cost: "gpt-5-mini: 0.25 US dollars per million tokens sent, 2 per million received. gpt-5-nano, the cheapest: 0.05 and 0.40. No free tier for these.",
    steps: ["Make an account on OpenAI's platform and add billing.", "Open API keys and create a key. Copy it.", "Here: press Use OpenAI below and paste the key. The model is set to gpt-5-mini.", CHECK],
    expect: "Strong, steady stories. gpt-5 models think first, so a reply can take a little while.",
    links: [["Get a key", "openaiKeys"], ["Prices", "openaiPricing"]] }),
  R("paid", "anthropic", "claude-haiku-5-5", "Anthropic", "Paid by use", {
    cost: "claude-haiku-5-5: from 0.10 US dollars per million tokens sent and 0.50 per million received. claude-sonnet-5-5: 2 and 10. New accounts get some free credit to try it.",
    steps: ["Make an account on Anthropic's platform and buy credit.", "Open API keys and create a key. Copy it.", "Here: press Use Anthropic below and paste the key. The model is set to claude-haiku-5-5.", CHECK],
    expect: "Strong stories; haiku is quick and cheap, sonnet writes more richly. An organization set to keep no data cannot be called from a web page.",
    unsure: ["How much free credit a new account gets: the page does not say."],
    links: [["Get a key", "anthropicKeys"], ["Prices", "anthropicPricing"]] }),
  R("paid", "deepseek", "deepseek-flash", "DeepSeek", "Paid by use, cheap", {
    cost: "deepseek-flash: 0.30 US dollars per million tokens sent and 1.20 per million received, half that outside its busy hours.",
    steps: ["Make an account on DeepSeek's platform and top up.", "Open API keys and create a key. Copy it.", "Here: press Use DeepSeek below and paste the key. The model is set to deepseek-flash.", CHECK],
    expect: "Good stories for little money.",
    unsure: ["Whether it answers calls from a web page: Capo has not seen it do so yet. Check connection tells."],
    links: [["Get a key", "deepseekKeys"], ["Prices", "deepseekPricing"]] }),
  R("paid", "cerebras", "gpt-oss-120b", "Cerebras", "A trial credit, then paid; very fast", {
    cost: "Add a payment method for a one-time trial credit of 5 US dollars, kept 30 days. On the trial, gpt-oss-120b allows 5 calls a minute. Then paid by use.",
    steps: ["Make an account on Cerebras Cloud and add a payment method.", "Open API Keys and create a key. Copy it.", "Here: press Use Cerebras below and paste the key. The model is set to gpt-oss-120b.", CHECK],
    expect: "Among the fastest replies there are.",
    links: [["Get a key", "cerebras"], ["Limits", "cerebrasLimits"]] }),
  R("paid", "mistral", "mistral-small-latest", "Mistral", "Paid by use", {
    cost: "Paid by use: its free plan has no API access, so billing must be on before a key works.",
    steps: ["Make an account on Mistral's console and turn on billing.", "Open API keys and create a key. Copy it.", "Here: press Use Mistral below and paste the key. The model is set to mistral-small-latest.", CHECK],
    expect: "Good, quick stories.",
    unsure: ["Its prices today: not read for this guide."],
    links: [["Get a key", "mistralKeys"]] }),
  R("paid", "together", "", "Together AI", "Paid by use", {
    cost: "Paid by use.",
    steps: ["Make an account at Together AI and add billing.", "Create a key in its settings. Copy it.", "Here: press Use Together AI below and paste the key.", CHECK],
    expect: "Many open models.",
    unsure: ["Its free offer, prices and steps were not checked for this guide.", "Whether it answers calls from a web page: Capo has not seen it do so yet. Check connection tells."],
    links: [["Its site", "together"]] }),
];

/** What to do when How Capo reaches an AI shows an error: by its kind (the kinds site/ai.js gives), the start of its words and the fix. */
export const HELP = [
  ["key", "refused the key", "Copy the whole key again from the service's key page, with no space before or after it. Check it is for the service chosen, and was not deleted."],
  ["credit", "has no credit, or no billing", "Add credit or billing at the service, or choose a free route above."],
  ["rate", "says too many requests", "Capo waits and tries again three times. Free limits come back after a minute or the next day; or choose another route."],
  ["model", "does not know the model", "Press Check connection: the Model field then offers the service's own names. Copy one exactly."],
  ["blocked", "was blocked or did not get through", "Check your connection, and that no extension blocks this page. A service Capo has not seen answer web pages may turn them away."],
  ["local", "Nothing answered at", "On this computer: is the server running? Ollama needs OLLAMA_ORIGINS set and a restart; LM Studio needs Enable CORS. Allow the browser's question about devices on your network."],
  ["denied", "refused this request", "The key may not be allowed this model, or the service is not offered where you are. Try another model."],
  ["busy", "is busy or having trouble", "Capo tries again. If it goes on, try later or another model."],
  ["time", "sent nothing for two minutes", "A model on this computer may be too big for it: try a smaller one."],
  ["cut", "spent its whole allowance", "Tick Thinking model, then ask again."],
  ["tools", "refused a structured reply", "Capo asks again for plain lines and remembers. You can also untick Structured replies."],
  ["filter", "safety filter stopped the reply", "Ask again, or choose another model or service."],
];

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, on, cls = "plain") => { const b = el("button", text, cls); b.type = "button"; b.onclick = on; return b; };
const link = (text, key) => {
  const a = el("a", `${text} (opens its site)`), href = key === "source" ? SOURCE_URL : AI_LINKS[key];
  Object.assign(a, { href, target: "_blank", rel: "noopener noreferrer" });
  return a;
};
const short = (name) => name.split(",")[0].replace(/^Your own AI app.*/, "the bridge");

/** One route, folded: its tag shows, and opening it shows cost, steps, what to expect, privacy, links and Use this. */
function routePart(x, use) {
  const d = el("details", undefined, "route"), s = el("summary"), steps = el("ol");
  s.append(el("b", x.name), el("span", ` ${x.tag}`, "note"));
  for (const t of x.steps) {
    if (typeof t === "string") { steps.append(el("li", t)); continue; }
    const li = el("li", t[0]), sub = el("ul"); // a step with a line for each kind of computer
    for (const s of t[1]) sub.append(el("li", s));
    li.append(sub); steps.append(li);
  }
  const links = el("div", undefined, "row"), row = el("div", undefined, "row");
  links.append(...x.links.map(([t, k]) => link(t, k)));
  row.append(button(`Use ${short(x.name)}`, () => use(x)));
  const say = (label, text) => { const p = el("p"); p.append(el("b", `${label}: `), text); return p; };
  d.append(s, say("Cost", x.cost), el("h4", "Set it up"), steps, say("What to expect", x.expect),
    say("Privacy", `${x.privacy ? `${x.privacy} ` : ""}${x.group === "home" ? "" : KEEP(short(x.name))}`.trim()),
    ...x.unsure.map((u) => el("p", `Not confirmed on its pages: ${u}`, "note")), links, row);
  return d;
}

/** The whole guide, as elements. use(route) is pressed by Use this; close() by Close. */
export function guideParts(use, close) {
  const head = el("h2", "Choose an AI");
  head.tabIndex = -1;
  const picks = el("ul");
  for (const t of ["Free, nothing to install: OpenRouter's free models, or Google Gemini.", "Free and very fast: Groq.", "Free and private, nothing leaves your computer: Ollama or LM Studio.",
    "You already use an AI app: the bridge, no key.", "Paid by use, for the steadiest stories: OpenAI, Anthropic, Gemini on a paid account, or DeepSeek for less."]) picks.append(el("li", t));
  const out = [head, el("p", "You do not need an AI: Advance moves the world by the rules. An AI tells each turn as a story and answers your chats and council. Choose one here; Use this fills in the settings, and nothing is sent until you press Check connection."),
    el("h3", "In short"), picks];
  for (const [g, title] of [["free", "Free to start"], ["home", "Free and private, on your computer"], ["paid", "Paid by use"]]) out.push(el("h3", title), ...ROUTES.filter((x) => x.group === g).map((x) => routePart(x, use)));
  const help = el("dl");
  for (const [, said, fix] of HELP) help.append(el("dt", `When it says "${said}"`), el("dd", fix));
  out.push(el("h3", "If something goes wrong"), help,
    el("p", `Checked on each service's own pages on ${CHECKED}. Free tiers change often: the service's page has the last word. Capo itself never asks for money and keeps no key anywhere but this browser.`, "note"), closeRow(close));
  return { head, parts: [closeRow(close), ...out] };
}
const closeRow = (close) => { const r = el("div", undefined, "row guide-close"); r.append(button("Close", close)); return r; };

/**
 * Opens the guide over the page. r is the route object of How Capo reaches an AI; ui lends its keep(), draw(focus)
 * and done(text). Use this sets the service and model there and closes the guide; Escape, Close or a tap outside close it.
 */
export function openGuide(r, ui) {
  const d = el("dialog", undefined, "panel aiguide"), back = document.activeElement;
  const close = () => d.close();
  const use = (x) => {
    r.preset = x.preset; r.model = x.model; ui.keep();
    d.close();
    ui.draw(x.group === "home" && x.preset !== "bridge" ? "model" : "key");
    const who = short(x.name);
    ui.done(`${who[0].toUpperCase()}${who.slice(1)} chosen.${x.group === "home" && x.preset !== "bridge" ? "Write the model's name" : x.preset === "bridge" ? "Paste the page token" : "Paste your key"}, then check the connection.`);
  };
  const { head, parts } = guideParts(use, close);
  head.id = `aiguide-${Date.now()}`; d.setAttribute("aria-labelledby", head.id);
  d.onclose = () => { d.remove(); if (back?.isConnected) back.focus({ preventScroll: true }); };
  d.onclick = (e) => { if (e.target === d) d.close(); };
  d.append(...parts);
  document.body.append(d); d.showModal(); head.focus({ preventScroll: true });
  return d;
}

/** guide hook: the line How Capo reaches an AI shows, with the button that opens the guide. */
export function guidePart(r, ui) {
  const p = el("p", "Not sure which to choose? ", "note");
  const b = button("Choose an AI: a guide", () => openGuide(r, ui));
  b.dataset.k = "guide";
  p.append(b);
  return p;
}
