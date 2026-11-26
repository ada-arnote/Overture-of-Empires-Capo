// SPDX-License-Identifier: AGPL-3.0-or-later
// The three shapes AI services speak (the common chat-completions form, Anthropic's and Gemini's): where a request
// goes, what it carries, and how a reply, or one streamed piece of it, is read into progress { text, args, thinking,
// end, sent, got }. Pure: no page and no fetch; site/ai.js sends the requests.
/** Each shape: url(call), head(key), body(call), take(reply or streamed piece, progress) and list(models reply). */
export const SHAPES = {
  openai: {
    url: (c) => `${c.base}/chat/completions`, head: (key) => (key ? { Authorization: `Bearer ${key}` } : {}),
    body: (c) => ({ model: c.model || undefined, messages: [...(c.system ? [{ role: "system", content: c.system }] : []), { role: "user", content: c.prompt }],
      ...(c.max && { [c.p.limit || "max_tokens"]: c.max }), ...(c.stream && { stream: true }), ...(c.tool && { tools: [{ type: "function", function: c.tool }], tool_choice: c.p.choice || "required" }) }),
    take(d, a) {
      if (d.error) throw d.error;
      const c = d.choices?.[0] || {}, m = c.message || c.delta || {};
      if (typeof m.content === "string") a.text += m.content;
      a.thinking += String(m.reasoning_content || m.reasoning || "").length;
      for (const t of m.tool_calls || []) a.args += t.function?.arguments || "";
      if (c.finish_reason) a.end = { length: "length", content_filter: "filter" }[c.finish_reason] || "stop";
      if (d.usage) [a.sent, a.got] = [d.usage.prompt_tokens, d.usage.completion_tokens];
    },
    list: (d) => (d.data || d.models || []).map((m) => m.id || m.name),
  },
  anthropic: {
    url: (c) => `${c.base}/messages`, head: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }),
    body: (c) => ({ model: c.model, max_tokens: c.max || 4096, messages: [{ role: "user", content: c.prompt }], ...(c.system && { system: c.system }), ...(c.stream && { stream: true }),
      ...(c.tool && { tools: [{ name: c.tool.name, description: c.tool.description, input_schema: c.tool.parameters }], tool_choice: { type: "tool", name: c.tool.name } }) }),
    take(d, a) {
      if (d.type === "error") throw d.error || d;
      const m = Array.isArray(d.content) ? d : d.message, x = d.delta || {}; // a whole reply, or the start of a streamed one
      for (const c of m?.content || []) { if (c.type === "text") a.text += c.text; if (c.type === "tool_use") a.args += JSON.stringify(c.input || {}); }
      if (d.type === "content_block_delta") { a.text += x.text || ""; a.args += x.partial_json || ""; a.thinking += String(x.thinking || "").length; }
      if (m?.usage) [a.sent, a.got] = [m.usage.input_tokens, m.usage.output_tokens];
      if (d.usage?.output_tokens) a.got = d.usage.output_tokens;
      const stop = m?.stop_reason || (d.type === "message_delta" && x.stop_reason);
      if (stop) a.end = { max_tokens: "length", refusal: "filter" }[stop] || "stop";
    },
    list: (d) => (d.data || []).map((m) => m.id),
  },
  gemini: {
    url: (c) => `${c.base}/models/${encodeURIComponent(c.model)}:${c.stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
    head: (key) => ({ "x-goog-api-key": key }), // in a header, never in the address
    body: (c) => ({ contents: [{ role: "user", parts: [{ text: c.prompt }] }], ...(c.system && { systemInstruction: { parts: [{ text: c.system }] } }), generationConfig: c.max ? { maxOutputTokens: c.max } : {},
      ...(c.tool && { tools: [{ functionDeclarations: [c.tool] }], toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [c.tool.name] } } }) }),
    take(d, a) {
      if (d.error) throw d.error;
      const c = d.candidates?.[0], u = d.usageMetadata;
      for (const x of c?.content?.parts || []) { if (x.thought) a.thinking += String(x.text).length; else a.text += x.text || ""; if (x.functionCall) a.args += JSON.stringify(x.functionCall.args || {}); }
      if (c?.finishReason) a.end = c.finishReason === "MAX_TOKENS" ? "length" : /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(c.finishReason) ? "filter" : "stop";
      if (d.promptFeedback?.blockReason) a.end = "filter";
      if (u) [a.sent, a.got] = [u.promptTokenCount, u.candidatesTokenCount];
    },
    list: (d) => (d.models || []).filter((m) => m.supportedGenerationMethods?.includes("generateContent") ?? true).map((m) => String(m.name).replace(/^models[/]/, "")),
  },
};

/** Whole server-sent events in a text: the JSON of each data line, and what is left for the next piece. */
export function splitEvents(buf, final = false) {
  const blocks = buf.split(/\r?\n\r?\n/), rest = final ? "" : blocks.pop(), out = [];
  for (const b of blocks) {
    const data = b.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
    if (data && data !== "[DONE]") try { out.push(JSON.parse(data)); } catch { /* a keep-alive */ }
  }
  return { out, rest };
}
