// SPDX-License-Identifier: AGPL-3.0-or-later
// The mesh layer: real shapes standing on the ground, shared by every game. Each model is sent to the graphics card once and
// drawn many times (instanced), lit by the same lamp as the ground, hidden by raised cells through the depth the ground writes,
// and casting soft shadows by way of one height picture seen from the lamp, redrawn only when a piece moves.
// A style is data (style.js): its palette, finishes and lamp go in as numbers; no code here knows one style from another.
export const HEAD = `#version 300 es
precision highp float;
uniform vec2 uView,uMid,uC,uYaw,uTilt; uniform vec3 uSun; uniform vec4 uWin; uniform float uS,uQ,uK,uLift,uTall,uOut;
vec4 clip(vec3 p){ vec2 d=(p.xy-uC)*uS; float X=d.x*uYaw.x-d.y*uYaw.y,Y=d.x*uYaw.y+d.y*uYaw.x,Z=p.z*uS,D=Y*uTilt.y+Z*uTilt.x,w=1.-uQ*D;
  return vec4(2.*(uMid.x*w+X)/uView.x-w,w-2.*(uMid.y*w+Y*uTilt.x-Z*uTilt.y)/uView.y,-uK*D,w); }`;
// corner: place, facing and finish, colour slot and shade. instance: place and size, turn, colour and dimness
const INS = `
layout(location=0) in vec3 aP; layout(location=1) in vec4 aN; layout(location=2) in vec4 aC;
layout(location=3) in vec4 iP; layout(location=4) in vec2 iR; layout(location=5) in vec4 iC;
vec3 world(out vec3 n){ vec3 l=aP*iP.w; n=vec3(aN.x*iR.x-aN.y*iR.y,aN.x*iR.y+aN.y*iR.x,aN.z); return vec3(iP.xy+vec2(l.x*iR.x-l.y*iR.y,l.x*iR.y+l.y*iR.x),iP.z*uLift+l.z); }`;
const VS = `${HEAD}${INS}
uniform vec3 uPal[16]; uniform vec2 uTone;
out vec3 vN,vP,vC,vO,vF;
void main(){ vec3 n,p=world(n); vN=n; vP=p; p+=n*uOut; int f=int(aN.w*127.+.5); float a=iC.a*255.,dim=mod(a,128.)/127.; // an instance's last byte: its dimness, and 128 if someone owns it
  vec3 c=uPal[int(aC.r*255.+.5)&15]*(aC.g*2.); if(f==3) c=iC.rgb; if(f==1) c=mix(iC.rgb,vec3(dot(iC.rgb,vec3(.3,.6,.1))),uTone.y)*uTone.x*aC.g*2.; vC=c*aC.a*dim; vO=iC.rgb*dim; vF=vec3(float(f),dim,f==1&&a>127.5?1.:0.);
  gl_Position=clip(p); }`;
/** The shadow test, shared with the grounds: how much of the lamp a point at height z misses. Needs uSun, uWin (the picture's window on the ground) and uTall. */
export const SHADE = `
uniform sampler2D uSh; uniform float uShOn;
float shd(vec2 p,float z){ if(uShOn<=0.) return 0.; vec2 q=(p-uSun.xy/uSun.z*z-uWin.xy)/uWin.zw; float s=0.;
  for(int i=0;i<4;i++){ vec2 o=vec2(i<2?-1.:1.,(i&1)==0?-1.:1.)*.0011; s+=smoothstep(z+.016*uTall,z+.047*uTall,texture(uSh,q+o).r*uTall); } return s*.25; }`;
const FS = `${HEAD}${SHADE}
uniform vec4 uFin[4],uGrade; uniform vec3 uAmb; uniform vec2 uGlow; uniform float uStep;
in vec3 vN,vP,vC,vO,vF; out vec4 o;
void main(){ if(uOut>0.){ o=vec4(.06,.055,.06,1.); return; }
  vec3 n=normalize(vN),L=normalize(uSun),V=vec3(uTilt.y*uYaw.y,uTilt.y*uYaw.x,uTilt.x); vec4 f=uFin[int(vF.x+.5)];
  float df=max(dot(n,L),0.),sh=shd(vP.xy,vP.z),lit=df*(1.-uAmb.z*sh);
  if(uStep>0.) lit=.85*smoothstep(.3-uStep,.3+uStep,lit)+.15*lit; // the lamp in two soft bands, as on a painted toy
  vec3 c=vC*(uAmb.x+uAmb.y*n.z+f.x*lit+.24*max(dot(n,V),0.)); // the lamp, the room, and a little light from where the player sits
  c+=f.y*pow(max(dot(n,normalize(L+V)),0.),f.z)*(1.-sh)*vF.y+f.w*pow(1.-max(dot(n,V),0.),3.);
  if(vF.z>0.&&uGlow.x>0.){ float r=1.-max(dot(n,V),0.); c=c*(1.-uGlow.y)+uGlow.x*vO*(.18+1.4*r*r); } // the owner's colour as light, strongest where a face turns away: an acrylic block lit at its edges, with no glow pass
  o=vec4(c*uGrade.rgb,1.); }`;
// the lamp's own view: where a corner's shadow falls on the ground, and how high the corner is
const VS2 = `${HEAD}${INS}
out float vH;
void main(){ vec3 n,p=world(n); vH=p.z/uTall; vec2 q=(p.xy-uSun.xy/uSun.z*p.z-uWin.xy)/uWin.zw; gl_Position=vec4(q*2.-1.,0.,1.); }`;
const FS2 = `#version 300 es
precision highp float; in float vH; out vec4 o; void main(){ o=vec4(vH,0.,0.,1.); }`;
const MAP = 1024;

export function program(g, vs, fs) {
  const shader = (type, text) => {
    const s = g.createShader(type);
    g.shaderSource(s, text);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) || "shader");
    return s;
  };
  const P = g.createProgram(), u = {};
  g.attachShader(P, shader(g.VERTEX_SHADER, vs));
  g.attachShader(P, shader(g.FRAGMENT_SHADER, fs));
  g.linkProgram(P);
  if (!g.getProgramParameter(P, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(P) || "program");
  for (let i = 0, n = g.getProgramParameter(P, g.ACTIVE_UNIFORMS); i < n; i++) { const name = g.getActiveUniform(P, i).name.replace("[0]", ""); u[name] = g.getUniformLocation(P, name); }
  return { P, u };
}

/** The camera, as the shaders want it. K sets how depth is spread: nearer is smaller, the same sum in the ground's shader. */
export const DEPTH = 1 / 30000;
export function aim(g, u, cam) {
  g.uniform2f(u.uView, cam.W, cam.H); g.uniform2f(u.uMid, cam.mx, cam.my); g.uniform2f(u.uC, cam.cx, cam.cy);
  g.uniform2f(u.uYaw, cam.cw, cam.sw); g.uniform2f(u.uTilt, cam.ct, cam.st); g.uniform1f(u.uS, cam.s); g.uniform1f(u.uQ, cam.q); g.uniform1f(u.uK, DEPTH);
}

export class Meshes {
  /** g: the painter's own WebGL2. models: { name: { buf, n } } from the kit's bake. */
  constructor(g, models) {
    this.g = g;
    this.draws = program(g, VS, FS); this.casts = program(g, VS2, FS2);
    this.at = {}; this.list = []; this.stale = true; this.win = [0, 0, 1, 1]; this.tall = 96; this.models = {};
    this.vao = g.createVertexArray();
    g.bindVertexArray(this.vao);
    this.corners = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, this.corners);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 3, g.FLOAT, false, 20, 0);
    g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 4, g.BYTE, true, 20, 12);
    g.enableVertexAttribArray(2); g.vertexAttribPointer(2, 4, g.UNSIGNED_BYTE, true, 20, 16);
    this.each = g.createBuffer();
    for (const k of [3, 4, 5]) { g.enableVertexAttribArray(k); g.vertexAttribDivisor(k, 1); }
    g.bindVertexArray(null);
    // the lamp's height picture
    this.map = g.createTexture();
    g.activeTexture(g.TEXTURE4);
    g.bindTexture(g.TEXTURE_2D, this.map);
    g.texImage2D(g.TEXTURE_2D, 0, g.R8, MAP, MAP, 0, g.RED, g.UNSIGNED_BYTE, null);
    for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]]) g.texParameteri(g.TEXTURE_2D, k, v);
    this.frame = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, this.frame);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, this.map, 0);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    this.add(models);
  }
  /** More models, or better ones under the same names (a style's sculpted pack, come later): all are sent again. What stands must then be set again. */
  add(models) {
    const g = this.g;
    Object.assign(this.models, models);
    const all = Object.entries(this.models), total = all.reduce((s, [, m]) => s + m.n, 0), data = new Uint8Array(total * 20);
    let first = 0;
    for (const [name, m] of all) { data.set(new Uint8Array(m.buf), first * 20); this.at[name] = { first, n: m.n }; first += m.n; }
    g.bindBuffer(g.ARRAY_BUFFER, this.corners);
    g.bufferData(g.ARRAY_BUFFER, data, g.STATIC_DRAW);
    this.list = [];
  }
  /** What stands where: [{ m: model name, x, y, z (the ground's height there, in cell tops), s: size, t: turn, rgb, dim }]. */
  set(list) {
    const g = this.g, by = new Map();
    for (const i of list) if (this.at[i.m]) (by.get(i.m) || by.set(i.m, []).get(i.m)).push(i);
    const n = list.length, buf = new ArrayBuffer(Math.max(1, n) * 28), f = new Float32Array(buf), b = new Uint8Array(buf);
    let k = 0;
    this.list = [];
    for (const [name, items] of by) {
      this.list.push({ ...this.at[name], from: k, many: items.length });
      for (const i of items) {
        const o = k * 7, c = i.rgb || [255, 255, 255];
        f[o] = i.x; f[o + 1] = i.y; f[o + 2] = i.z || 0; f[o + 3] = i.s || 1; f[o + 4] = Math.cos(i.t || 0); f[o + 5] = Math.sin(i.t || 0);
        b[k * 28 + 24] = c[0]; b[k * 28 + 25] = c[1]; b[k * 28 + 26] = c[2]; b[k * 28 + 27] = Math.round(127 * (i.dim ?? 1)) + (i.rgb ? 128 : 0); // styles hook: owned things can glow
        k++;
      }
    }
    g.bindBuffer(g.ARRAY_BUFFER, this.each);
    g.bufferData(g.ARRAY_BUFFER, buf, g.DYNAMIC_DRAW);
    this.stale = true;
  }
  pass(u) {
    const g = this.g;
    g.bindVertexArray(this.vao);
    g.bindBuffer(g.ARRAY_BUFFER, this.each);
    for (const m of this.list) {
      const o = m.from * 28;
      g.vertexAttribPointer(3, 4, g.FLOAT, false, 28, o); g.vertexAttribPointer(4, 2, g.FLOAT, false, 28, o + 16); g.vertexAttribPointer(5, 4, g.UNSIGNED_BYTE, true, 28, o + 24);
      g.drawArraysInstanced(g.TRIANGLES, m.first, m.n, m.many);
    }
    g.bindVertexArray(null);
  }
  /** The lamp's picture, when something has moved. win: the part of the ground it covers [x, y, wide, high]; lift: ground units to one cell top; tall: the tallest thing; sun: the style's lamp. */
  cast(win, lift, sun, tall = 96) {
    const g = this.g, { P, u } = this.casts, key = `${win},${lift},${tall}`;
    if (!this.stale && this.key === key) return;
    this.stale = false; this.key = key; this.win = win; this.tall = tall;
    g.bindFramebuffer(g.FRAMEBUFFER, this.frame);
    g.viewport(0, 0, MAP, MAP);
    g.disable(g.DEPTH_TEST);
    g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT);
    g.enable(g.BLEND); g.blendEquation(g.MAX); g.blendFunc(g.ONE, g.ONE); // the tallest thing in the lamp's way wins
    g.useProgram(P);
    g.uniform1f(u.uLift, lift);
    this.lamp(u, true, sun);
    this.pass(u);
    g.disable(g.BLEND); g.blendEquation(g.FUNC_ADD);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
  }
  /** The shadow picture's settings for a shader that tests against it (a ground's, and our own). */
  lamp(u, on, sun) { const g = this.g; g.uniform1i(u.uSh, 4); g.uniform1f(u.uShOn, on ? 1 : 0); g.uniform1f(u.uTall, this.tall); g.uniform4f(u.uWin, ...this.win); g.uniform3f(u.uSun, ...sun); }
  draw(cam, lift, style) {
    const g = this.g, { P, u } = this.draws;
    if (!this.list.length) return;
    g.useProgram(P);
    aim(g, u, cam);
    g.uniform1f(u.uLift, lift);
    this.lamp(u, true, style.sun);
    g.uniform3fv(u.uPal, style.pal.flat().map((v) => v / 255)); g.uniform4fv(u.uFin, style.fin.flat()); g.uniform3f(u.uAmb, ...style.amb); g.uniform2f(u.uTone, ...style.tone);
    g.uniform2f(u.uGlow, ...(style.glow || [0, 0])); g.uniform1f(u.uStep, style.steps || 0); g.uniform4f(u.uGrade, ...(style.grade || [1, 1, 1, 0])); // styles hook
    g.enable(g.DEPTH_TEST); g.depthFunc(g.LESS);
    if (style.outline) { g.depthMask(false); g.uniform1f(u.uOut, style.outline / cam.s); this.pass(u); g.depthMask(true); } // a dark shell, a little larger, drawn first: what shows round the model is its outline
    g.uniform1f(u.uOut, 0);
    this.pass(u);
    g.disable(g.DEPTH_TEST);
  }
}
