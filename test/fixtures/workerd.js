// SPDX-License-Identifier: AGPL-3.0-or-later
// A stand-in for the parts of Cloudflare's worker runtime that server/worker uses, made from Node's own modules only:
// Durable Object namespaces and stubs, their storage (with alarms), hibernating WebSockets with attachments and the
// automatic ping answer, WebSocketPair, and a Response that may carry status 101. Close enough to test behaviour, not
// the platform: the real limits (CPU time, row counts, daily caps) are Cloudflare's own.

/** One end of a socket pair. The end a Durable Object accepted calls the object; the other end calls the page's handlers. */
export class Socket {
  constructor() {
    this.peer = null;
    this.readyState = 1;
    this.holder = null;
    this.attachment = null;
    this.onmessage = this.onclose = this.onopen = null;
  }
  accept() {}
  send(data) {
    if (this.readyState !== 1) throw new Error("the socket is closed");
    const peer = this.peer, text = String(data);
    queueMicrotask(() => peer.receive(text));
  }
  receive(data) {
    if (this.readyState !== 1) return;
    const h = this.holder;
    if (h) {
      if (h.auto && data === h.auto.request) { this.send(h.auto.response); return; }
      h.track(h.instance().webSocketMessage(this, data));
    } else this.onmessage?.({ data });
  }
  close(code = 1000, reason = "") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    const peer = this.peer;
    queueMicrotask(() => peer.ended(code, reason));
  }
  ended(code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    if (this.holder) this.holder.track(this.holder.instance().webSocketClose(this, code, reason, true));
    else this.onclose?.({ code, reason });
  }
  serializeAttachment(v) { this.attachment = structuredClone(v); }
  deserializeAttachment() { return this.attachment === null ? null : structuredClone(this.attachment); }
}

/** Durable Object storage: a sorted map of plain values, one alarm, and a count of rows written. */
export class Storage {
  constructor() { this.map = new Map(); this.alarm = null; this.writes = 0; }
  async get(k) {
    if (Array.isArray(k)) return new Map(k.filter((x) => this.map.has(x)).map((x) => [x, structuredClone(this.map.get(x))]));
    return this.map.has(k) ? structuredClone(this.map.get(k)) : undefined;
  }
  async put(k, v) {
    const rows = typeof k === "string" ? { [k]: v } : k;
    for (const [key, value] of Object.entries(rows)) { this.map.set(key, structuredClone(value)); this.writes++; }
  }
  async delete(k) {
    if (Array.isArray(k)) return k.filter((x) => this.map.delete(x)).length;
    return this.map.delete(k);
  }
  async deleteAll() { this.map.clear(); }
  async list({ prefix = "" } = {}) {
    return new Map([...this.map.keys()].filter((k) => k.startsWith(prefix)).sort().map((k) => [k, structuredClone(this.map.get(k))]));
  }
  async getAlarm() { return this.alarm; }
  async setAlarm(t) { this.alarm = Number(t); this.writes++; }
  async deleteAlarm() { this.alarm = null; }
}

/** One Durable Object: its storage and sockets outlive the object in memory, as they do when Cloudflare lets a room sleep. */
class Holder {
  constructor(Cls, env, name) {
    this.Cls = Cls;
    this.env = env;
    this.obj = null;
    this.storage = new Storage();
    this.sockets = new Set();
    this.auto = null;
    this.pending = new Set();
    this.errors = [];
    this.ctx = {
      id: { name, toString: () => name },
      storage: this.storage,
      acceptWebSocket: (ws) => { ws.holder = this; this.sockets.add(ws); },
      getWebSockets: () => [...this.sockets].filter((ws) => ws.readyState === 1),
      setWebSocketAutoResponse: (pair) => { this.auto = pair; },
      waitUntil: (p) => this.track(p),
      blockConcurrencyWhile: async (fn) => fn(),
    };
  }
  instance() { return (this.obj ||= new this.Cls(this.ctx, this.env)); }
  sleep() { this.obj = null; } // memory is lost; storage and sockets stay
  track(p) {
    const q = Promise.resolve(p).catch((e) => { this.errors.push(e); }).finally(() => this.pending.delete(q));
    this.pending.add(q);
  }
}

export class Namespace {
  constructor(Cls, env) { this.Cls = Cls; this.env = env; this.holders = new Map(); }
  idFromName(name) { return { name: String(name), toString: () => String(name) }; }
  holder(name) {
    if (!this.holders.has(name)) this.holders.set(name, new Holder(this.Cls, this.env, name));
    return this.holders.get(name);
  }
  get(id) {
    const h = this.holder(id.name);
    return { fetch: (req, init) => h.instance().fetch(req instanceof Request ? req : new Request(req, init)) };
  }
  /** Run every alarm that is due by now. */
  async alarms(now) {
    for (const h of this.holders.values()) if (h.storage.alarm !== null && h.storage.alarm <= now) { h.storage.alarm = null; await h.instance().alarm(); }
  }
  /** Wait for socket messages and waitUntil work to finish, everywhere. Throws the first error a handler threw. */
  async settle() {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setImmediate(r));
      const all = [...this.holders.values()].flatMap((h) => [...h.pending]);
      if (all.length) await Promise.all(all);
      else if (i > 2) break;
    }
    const errors = [...this.holders.values()].flatMap((h) => h.errors);
    if (errors.length) throw errors[0];
  }
}

/** Put the runtime's globals in place: WebSocketPair, WebSocketRequestResponsePair, and a Response that allows 101. */
export function install() {
  if (globalThis.WebSocketPair) return;
  globalThis.WebSocketPair = class {
    constructor() { const a = new Socket(), b = new Socket(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; }
  };
  globalThis.WebSocketRequestResponsePair = class { constructor(request, response) { this.request = request; this.response = response; } };
  const Base = globalThis.Response;
  globalThis.Response = class extends Base {
    constructor(body, init) {
      if (init?.status !== 101) { super(body, init); return; }
      super(null, { status: 200 });
      Object.defineProperty(this, "status", { value: 101 });
      this.webSocket = init.webSocket;
    }
  };
}

/** A browser's WebSocket over the stand-in: opens by asking the worker to upgrade, as a page would. */
export function browserSocket(worker, env, origin) {
  return class {
    constructor(url) {
      this.readyState = 0;
      this.onopen = this.onmessage = this.onclose = null;
      worker.fetch(new Request(url.replace(/^ws/, "http"), { headers: { upgrade: "websocket", origin } }), env).then((r) => {
        if (r.status !== 101) { this.readyState = 3; this.onclose?.({ code: 1006, reason: String(r.status) }); return; }
        this.end = r.webSocket;
        this.end.onmessage = (e) => this.onmessage?.(e);
        this.end.onclose = (e) => { this.readyState = 3; this.onclose?.(e); };
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(d) { this.end.send(d); }
    close(code, reason) { this.readyState = 3; this.end?.close(code, reason); }
  };
}
