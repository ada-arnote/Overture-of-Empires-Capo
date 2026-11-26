// SPDX-License-Identifier: AGPL-3.0-or-later
// The pure parts the MCP bridge (tools/capo-mcp.mjs) and the page (site/aimore.js) share: the read-only digest of a
// game an AI app may see, whether a reply has the shape its prompt asked for, and the rules' answer to an order an AI
// app proposes. Nothing here decides an outcome: a proposed order is the same order a card would give, the player must
// accept it, and the rules carry it out at the turn as they would any other.
import { oddsLine } from "./check.js";
import { NEED, treatyAnswer, treatyName } from "./relations.js";
import { formatOf } from "./replyform.js";
import { peaceAnswer, strengthOf } from "./war.js";
import { APPROACHES, atWar, attackPlan, commanders, treatiesOf, treatyOf, warsOf } from "./worldrules.js";

/** The port the bridge listens on, on 127.0.0.1 only, unless the player gives another. */
export const BRIDGE_PORT = 8125;
export const ORDER_VERBS = ["TREATY", "PEACE", "ATTACK"];

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** What an AI app may read of a game: the date, the turn, who the player is, wars, treaties, offers, the actions waiting and the last receipt. */
export function digest(g, geo) {
  if (!g) return null;
  const last = g.log?.[g.log.length - 1], n = (c) => `${geo.name(c)} (${c})`;
  return {
    game: "Capo", date: g.date, turn: g.turn, mode: g.mode, player: g.player, country: geo.name(g.player), sandbox: !!g.sandbox,
    wars: warsOf(g, g.player).map(n), treaties: treatiesOf(g, g.player).map((t) => `${t.kind} with ${n(t.with)}`),
    offers: (g.offers || []).slice(0, 12).map((o) => `${n(o.from)} offers ${o.kind}`),
    actions: (g.actions || []).slice(0, 20).map((a) => clip(a, 300)),
    last: last ? { from: last.from, to: last.to, summary: clip(last.summary, 400), receipt: (last.receipt || []).slice(0, 40).map((x) => `${x.ok ? "stood" : "refused"}: ${clip(x.text, 240)}`) } : null,
  };
}

/** Why a reply does not have the shape its prompt asked for, or "". The page's own readers and the rules still judge it afterwards. */
export function shapeOf(prompt, reply) {
  const text = String(reply ?? "");
  if (!text.trim()) return "The reply is empty.";
  if (text.length > 60000) return "The reply is far too long.";
  const fmt = formatOf(prompt);
  if (!fmt) return "";
  const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[*_`>#-]+\s*/, "").replace(/\s+/g, " "));
  for (const f of fmt.fixed) if (!lines.some((l) => l.toUpperCase().startsWith(f.replace(/\s+/g, " ").toUpperCase()))) return `It must have the line "${f}", exactly as the prompt gives it.`;
  const labels = fmt.rows.map((r) => r.label);
  if (!lines.some((l) => labels.some((k) => l.toUpperCase().startsWith(`${k}:`)))) return `No line of the reply format could be read. Each line starts with one of: ${labels.join(", ")}.`;
  return "";
}

/**
 * The rules' answer to an order an AI app proposes for the player's country: {ok: false, why}, or {ok: true, order,
 * note}, where order is exactly what a card would give ({text, verb, target, detail, seat, approach}) and note is
 * what the rules would answer today. most: how many attacks the turn ahead allows, as the attack card counts them.
 */
export function judgeOrder(g, geo, o, most = Infinity) {
  const no = (why) => ({ ok: false, why });
  if (!g) return no("No game is open in Capo.");
  if (g.mode === "citizen") return no("The player is a citizen in this game, and a citizen gives no orders of state.");
  const me = g.player, verb = clip(o?.verb, 12).toUpperCase(), target = clip(o?.target, 80), detail = clip(o?.detail, 20).toLowerCase();
  if (!ORDER_VERBS.includes(verb)) return no(`Only ${ORDER_VERBS.join(", ")} can be ordered this way. Anything else is an action the player writes in their own words.`);
  if (verb === "ATTACK") {
    const id = geo.find(target);
    if (!id) return no(`"${target}" is not a province on the map: give its id, as the prompt's PLACES lines write it.`);
    const a = attackPlan(g, geo, me, id, { seat: clip(o.leader ?? o.seat, 20).toLowerCase(), approach: clip(o.approach, 12).toLowerCase() }, most);
    if (!a.ok) return no(a.why);
    const lead = commanders(g).find((c) => c.seat === a.boss.seat);
    return { ok: true, order: { text: `Attack ${a.place} (${id}), led by ${!lead || lead.seat === "generals" ? "our generals" : lead.name}, ${a.approach}.`, verb, target: id, seat: a.boss.seat, approach: a.approach }, note: `odds: ${oddsLine(a.chance)}${a.note}` };
  }
  const c = target.toUpperCase();
  if (!geo.known(c) || c === me) return no(`"${target}" is not another country on the map: give its code.`);
  const offered = (kind) => (g.offers || []).some((x) => x.from === c && x.kind === kind);
  if (verb === "PEACE") {
    if (!warsOf(g, me).includes(c)) return no(`${geo.name(me)} is not at war with ${geo.name(c)}.`);
    if (offered("peace")) return { ok: true, order: { text: `Accept ${geo.name(c)}'s offer of peace.`, verb, target: c, detail: "" }, note: `${geo.name(c)} has offered peace` };
    const a = peaceAnswer(g, me, c);
    return { ok: true, order: { text: `Propose peace to ${geo.name(c)} (${c}).`, verb, target: c, detail: "" }, note: `${geo.name(c)} would ${a.ok ? "agree" : "refuse"} (${a.why})` };
  }
  if (!Object.hasOwn(NEED, detail)) return no(`A treaty is one of: ${Object.keys(NEED).join(", ")}. Give it as detail.`);
  if (atWar(g, me, c)) return no(`${geo.name(me)} is at war with ${geo.name(c)}: peace comes first.`);
  if (treatyOf(g, me, c)?.kind === detail) return no(`${geo.name(me)} already has ${treatyName(detail)} with ${geo.name(c)}.`);
  if (offered(detail)) return { ok: true, order: { text: `Accept ${geo.name(c)}'s offer of ${treatyName(detail)}.`, verb, target: c, detail }, note: `${geo.name(c)} has offered it` };
  const a = treatyAnswer(g, me, c, detail, (x) => strengthOf(g, geo, x));
  return { ok: true, order: { text: `Propose ${treatyName(detail)} to ${geo.name(c)} (${c}).`, verb, target: c, detail }, note: `${geo.name(c)} would ${a.ok ? "agree" : "refuse"} (${a.why})` };
}
export const APPROACH_NAMES = Object.keys(APPROACHES);
