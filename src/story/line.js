// SPDX-License-Identifier: AGPL-3.0-or-later
// Two small things every part of Capo's story game shares: the hard line, and repeatable chance.

// The one hard line (ruling 49): nothing sexual involving minors. Nothing else is filtered.
// A text crosses it when it names someone young and something sexual, unless it is plainly protective statecraft
// ("prosecute those who abuse children", "fund sex education for teens"). Anything that asks to depict, describe or
// arrange sexual content with someone young is refused whatever else it says. "Explicit" alone is not sexual.
const YOUNG = /\b(child|children|childs?|minor|minors|underage|kid|kids|schoolgirl|schoolboy|preteen|teen|teens|teenager|teenagers|boy|boys|girl|girls|juvenile)\b|\b(1[0-7]|[1-9])[- ]?(years?|yrs?)[- ]?old\b|\baged (1[0-7]|[1-9])\b/i;
const SEXUAL = /\b(sex(?!\s+(education|ed|trafficking|offen[cs]es?|offenders?|crimes?|abuse))|sexual|sexually|nude|naked|nudity|erotic\w*|porn\w*|lewd|intercourse|seduc\w*|aroused?)\b/i;
const DEPICT = /\b(describe|depict|write|story|scene|role-?play|roleplay|show|image|photo\w*|picture|video|seduc\w*|have sex|sleep with|make love|kiss\w*|undress\w*)\b/i;
const PROTECT = /\b(ban|bans|banned|outlaw\w*|punish\w*|prosecut\w*|protect\w*|prevent\w*|stop|end|combat|fight|crack(s|ed|ing)? down|arrest\w*|criminali[sz]\w*|abolish\w*|rescue\w*|shelter\w*|safeguard\w*|investigat\w*|penalt\w*|law|laws|education|against|abuse|exploitation|trafficking|victims?)\b/i;
/** Whether one text crosses the hard line. */
export const crosses = (text) => {
  const t = String(text || "");
  if (!YOUNG.test(t) || !SEXUAL.test(t)) return false;
  return DEPICT.test(t) || !PROTECT.test(t);
};
/** Texts that cross the hard line, by number (counting from 1). They are never sent, and never kept from a reply. */
export const crossesLine = (texts) => texts.map((o, i) => (crosses(o) ? i + 1 : 0)).filter(Boolean);

export function draw(seed, label) { // one repeatable number from 0 to 1
  let h = 2166136261;
  for (const ch of seed + "/" + label) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), h | 1); h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}
