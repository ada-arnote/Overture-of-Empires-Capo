// SPDX-License-Identifier: AGPL-3.0-or-later
// The second ground: a world of provinces as a lit relief map on the table. Capo's map, real or invented.
// The table games' ground is a picture of cell numbers; that cannot hold thousands of provinces sharply, so here the
// provinces are triangles made once from their own outlines, coloured from a small lookup picture (one texel a province,
// so a conquest changes a texel, never the shapes) and lit from a picture of heights. The land stands a little above a
// sunk sea. Camera, lamp, shadows, styles and the mesh layer are the ones the table boards use.
import { ears } from "./kit.js";
import { DEPTH, HEAD, SHADE, aim, program } from "./mesh.js";

// heights: one byte, 96 is the sea's surface; made from noise when a world brings no picture of its own
const COMMON = `
uniform sampler2D uRelief; uniform vec2 uSize; uniform vec4 uWash; uniform float uReal,uSeed,uShade,uRel,uGloss;
float grain(vec2 p){ p=floor(p); return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
float nz(vec2 p){ vec2 f=fract(p); f=f*f*(3.-2.*f); return mix(mix(grain(p),grain(p+vec2(1.,0.)),f.x),mix(grain(p+vec2(0.,1.)),grain(p+1.),f.x),f.y); }
float hgt(vec2 p){ if(uReal>0.) return texture(uRelief,p/uSize).r; vec2 q=p/uSize.x*9.+uSeed; float r=1.-abs(2.*nz(q*1.7)-1.);
  return .39+.2*nz(q)*nz(q*.6+3.)+.4*r*r*r*nz(q*.8+9.)*nz(q*.45+4.)+.012*nz(q*9.); }
vec2 slope(vec2 p){ float e=uSize.x/1400.; return vec2(hgt(p+vec2(e,0.))-hgt(p-vec2(e,0.)),hgt(p+vec2(0.,e))-hgt(p-vec2(0.,e))); }
// capomap: close in, the picture's heights are read smoothly (a cubic over four reads) and fine relief is added by noise,
// strongest in rough country and faded out wherever its waves would be finer than a few screen points
uniform float uDet,uOct;
vec4 cub(float v){ vec4 n=vec4(1.,2.,3.,4.)-v,s=n*n*n; float x=s.x,y=s.y-4.*s.x,z=s.z-4.*s.y+6.*s.x; return vec4(x,y,z,6.-x-y-z)/6.; }
float hgtC(vec2 p){ if(uReal<=0.) return hgt(p); vec2 ts=vec2(textureSize(uRelief,0)),uv=p/uSize*ts-.5,f=fract(uv); uv-=f; vec4 xc=cub(f.x),yc=cub(f.y),c=uv.xxyy+vec2(-.5,1.5).xyxy,s=vec4(xc.xz+xc.yw,yc.xz+yc.yw),o=(c+vec4(xc.yw,yc.yw)/s)/ts.xxyy;
  float sx=s.x/(s.x+s.y),sy=s.z/(s.z+s.w); return mix(mix(texture(uRelief,o.yw).r,texture(uRelief,o.xw).r,sx),mix(texture(uRelief,o.yz).r,texture(uRelief,o.xz).r,sx),sy); }
vec2 slopeC(vec2 p){ float e=uSize.x/1400.; return vec2(hgtC(p+vec2(e,0.))-hgtC(p-vec2(e,0.)),hgtC(p+vec2(0.,e))-hgtC(p-vec2(0.,e))); }
vec3 nd(vec2 p){ vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f); float a=grain(mod(i,512.)),b=grain(mod(i+vec2(1.,0.),512.)),c=grain(mod(i+vec2(0.,1.),512.)),d=grain(mod(i+1.,512.));
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y,du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx)); }
vec3 fine(vec2 p){ vec3 r=vec3(0.); float a=1.,f=.33; mat2 m=mat2(f,0.,0.,f); // each wave turned and twice as fine, so no grid shows
  for(int i=0;i<4;i++){ if(float(i)>=uOct) break; vec3 n=nd(m*p+float(i)*17.3); r+=a*smoothstep(3.,10.,uS/f)*vec3(n.x-.5,n.yz*m); a*=.5; f*=2.; m=mat2(1.6,1.2,-1.2,1.6)*m; } return r; }`;
const LAND_VS = `${HEAD}
layout(location=0) in vec2 aP; layout(location=1) in vec2 aI;
uniform sampler2D uTab; uniform float uRise;
out vec2 vP; out vec4 vC; out float vZ;
void main(){ int id=int(aI.x+.5); vC=texelFetch(uTab,ivec2(id&63,id>>6),0); vP=aP; vZ=aI.y; gl_Position=clip(vec3(aP,aI.y*uRise)); }`;
const LAND_FS = `${HEAD}${COMMON}${SHADE}
uniform float uRise,uTint;
in vec2 vP; in vec4 vC; in float vZ; out vec4 o;
void main(){ float h=hgt(vP),t=clamp((h-.376)/.624,0.,1.); vec2 g=uDet>0.?slopeC(vP):slope(vP),gd=vec2(0.);
  if(uDet>0.){ vec3 d=fine(vP); float rough=clamp(length(g)*9.+smoothstep(.3,.7,t)*.4,0.,1.); gd=d.yz*(.0004+.01*rough*rough)*uDet*uSize.x/700.; t=clamp(t+d.x*.05*rough*uDet,0.,1.); } // capomap: fine relief
  // the land's own colour by its height: green plain, dry upland, brown mountain, snow
  vec3 c=mix(vec3(.47,.54,.37),vec3(.68,.62,.44),smoothstep(.02,.2,t)); c=mix(c,vec3(.5,.41,.33),smoothstep(.2,.48,t)); c=mix(c,vec3(.95,.96,.97),smoothstep(.56,.74,t));
  c=mix(c,uWash.rgb,uWash.a);
  float glow=vC.a<.6?1.:0.,ice=uReal>0.?1.-smoothstep(.55,.95,texture(uRelief,vP/uSize).a):0.; // a province that is lit: chosen, or offered. Ice, where the world's picture marks it
  c=mix(c,vec3(.9,.94,.97),ice);
  c=mix(c,vC.rgb,uTint*(1.-.45*ice))*clamp(1.-(dot(g,uSun.xy)*uRel+dot(gd,uSun.xy))*26.,.6,1.36)*(.96+.07*grain(vP*uS*1.5));
  if(vZ<.99) c=mix(vec3(.2,.17,.14),c,.25+.3*vZ); // the cut side of the coast
  else c*=1.-uShade*shd(vP,uRise);
  c=mix(c,vec3(.93,.96,1.),glow*.3);
  o=vec4(c,1.); }`;
const SEA_VS = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`;
const SEA_FS = `${HEAD}${COMMON}${SHADE}
uniform sampler2D uWood; uniform float uDpr; uniform vec3 uBaize,uRule; uniform vec2 uWoodK;
out vec4 o;
void main(){ vec2 uv=vec2(gl_FragCoord.x/uDpr,uView.y-gl_FragCoord.y/uDpr)-uMid,p=uC+vec2(uv.x,uv.y/uTilt.x)/uS,hs=uSize*.5; float foot=1./uS;
  vec2 d=abs(p-hs)-hs; float sd=max(d.x,d.y); vec3 c;
  if(sd<0.){ // the sea: pale over the shelves, dark over the deeps, and the only gloss on the map
    float h=uReal>0.?hgt(p):.2+.1*nz(p/uSize.x*5.+uSeed),dp=clamp((.376-h)/.376,0.,1.); vec2 g=uReal>0.?slope(p):vec2(0.);
    c=mix(vec3(.33,.52,.6),vec3(.09,.17,.28),smoothstep(0.,.75,dp))*clamp(1.-dot(g,uSun.xy)*6.*uRel,.84,1.16);
    vec2 w=g*9.; vec3 v=vec3(0.,uTilt.y,uTilt.x);
    c=mix(c,uWash.rgb,uWash.a*.8); c+=.2*uGloss*pow(max(dot(normalize(vec3(-w,1.)),normalize(normalize(uSun)+v)),0.),30.); c*=(.97+.06*grain(p*uS*1.5))*(1.-uShade*shd(p,0.));
    c*=1.-.35*smoothstep(-14.*foot,0.,sd); }
  else { float mg=max(hs.x,hs.y)*.09,r=mg*.6; d=d-mg+r; float bd=length(max(d,0.))+min(max(d.x,d.y),0.)-r;
    c=texture(uWood,p/(max(hs.x,hs.y)*vec2(1.3,.65))).rgb; c=mix(c,vec3(.3,.19,.12),uWoodK.y)*uWoodK.x; c*=1.-.3*smoothstep(mg*.5,0.,bd)*step(0.,bd);
    c=mix(uBaize*(.86+.28*grain(p*uS*2.)),c,smoothstep(-foot,foot,bd)); c=mix(c,uRule,(1.-smoothstep(mg*.04,mg*.04+foot*1.5,abs(bd+mg*.36)))*.8);
    c*=1.-.5*smoothstep(26.*foot,0.,sd); }
  o=vec4(c*(1.-1.6*dot(uv/uView,uv/uView)),1.); }`;
// capomap: lakes are part of the lit ground: their own triangles on the land's top, water coloured, with the lamp's gloss and the pieces' shadows
const LAKE_VS = `${HEAD}
layout(location=0) in vec2 aP; uniform float uRise; out vec2 vP;
void main(){ vP=aP; gl_Position=clip(vec3(aP,uRise)); }`;
const LAKE_FS = `${HEAD}${COMMON}${SHADE}
uniform float uRise; in vec2 vP; out vec4 o;
void main(){ vec2 w=vec2(nz(vP*1.7)-.5,nz(vP*1.7+7.)-.5)*.35; vec3 v=vec3(0.,uTilt.y,uTilt.x),c=vec3(.22,.38,.47)*(.97+.04*nz(vP*.05));
  c=mix(c,uWash.rgb,uWash.a*.8); c+=.22*uGloss*pow(max(dot(normalize(vec3(-w,1.)),normalize(normalize(uSun)+v)),0.),30.);
  c*=(.97+.06*grain(vP*uS*1.5))*(1.-uShade*shd(vP,uRise)); o=vec4(c,1.); }`;

export class WorldGround {
  constructor(canvas) {
    this.canvas = canvas;
    const g = this.g = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: true, stencil: false });
    if (!g) throw new Error("no WebGL2");
    this.land = program(g, LAND_VS, LAND_FS); this.sea = program(g, SEA_VS, SEA_FS);
    const tex = (unit, filter, wrap) => { const t = g.createTexture(); g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t); for (const [k, v] of [[g.TEXTURE_MIN_FILTER, filter], [g.TEXTURE_MAG_FILTER, filter], [g.TEXTURE_WRAP_S, wrap], [g.TEXTURE_WRAP_T, wrap]]) g.texParameteri(g.TEXTURE_2D, k, v); return t; };
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    this.tab = tex(0, g.NEAREST, g.CLAMP_TO_EDGE); this.heights = tex(1, g.LINEAR, g.CLAMP_TO_EDGE); this.timber = tex(3, g.LINEAR, g.MIRRORED_REPEAT);
    g.activeTexture(g.TEXTURE1); g.texImage2D(g.TEXTURE_2D, 0, g.R8, 1, 1, 0, g.RED, g.UNSIGNED_BYTE, new Uint8Array([110]));
    g.activeTexture(g.TEXTURE3); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array([92, 60, 40, 255]));
    this.vao = g.createVertexArray(); this.corners = g.createBuffer(); this.order = g.createBuffer(); this.real = 0; this.count = 0;
    this.lake = program(g, LAKE_VS, LAKE_FS); this.lvao = g.createVertexArray(); this.lpts = g.createBuffer(); this.lidx = g.createBuffer(); this.lcount = 0; // capomap: lakes
  }
  /**
   * The shapes. size: [wide, high]. provinces: [{ rings: [[[x, y], ...], ...] }] in the order of their numbers.
   * coast: [[province number, [[x, y], ...]], ...], the lines with sea on one side, for the cut edge of the land.
   */
  load(size, provinces, coast, seed = 0) {
    const g = this.g, pts = [], idx = [];
    this.size = size; this.seed = seed; this.n = provinces.length;
    const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    // a province with a hole in it (another's land inside) is drawn first, and whatever fills the hole is drawn over it
    const first = provinces.map((p, i) => i).sort((a, b) => (provinces[b].rings.length > 1) - (provinces[a].rings.length > 1));
    for (const i of first) {
      const rings = provinces[i].rings;
      rings.forEach((ring, k) => {
        if (ring.length < 3 || (rings.length > 1 && rings.some((other, j) => j !== k && other.length > 2 && inside(ring[0], other) && inside(ring[ring.length >> 1], other)))) return; // a hole
        const at = pts.length / 4, t = ears(ring);
        for (const [x, y] of ring) pts.push(x, y, i, 1);
        for (const v of t) idx.push(at + v);
      });
    }
    for (const [i, line] of coast) for (let k = 0; k + 1 < line.length; k++) {
      const at = pts.length / 4, a = line[k], b = line[k + 1];
      pts.push(a[0], a[1], i, 1, b[0], b[1], i, 1, b[0], b[1], i, 0, a[0], a[1], i, 0);
      idx.push(at, at + 1, at + 2, at, at + 2, at + 3);
    }
    g.bindVertexArray(this.vao);
    g.bindBuffer(g.ARRAY_BUFFER, this.corners); g.bufferData(g.ARRAY_BUFFER, new Float32Array(pts), g.STATIC_DRAW);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 16, 0);
    g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 2, g.FLOAT, false, 16, 8);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, this.order); g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), g.STATIC_DRAW);
    g.bindVertexArray(null);
    this.count = idx.length;
    this.rows = Math.ceil(Math.max(1, this.n) / 64);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, this.tab);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, 64, this.rows, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    return this.count / 3;
  }
  /** The lakes, as outlines [[[x, y], ...], ...], or none. Drawn on the land's top, lit as water. */
  lakes(rings = []) {
    const g = this.g, pts = [], idx = [];
    for (const ring of rings) { if (ring.length < 3) continue; const at = pts.length / 2; for (const [x, y] of ring) pts.push(x, y); for (const v of ears(ring)) idx.push(at + v); }
    g.bindVertexArray(this.lvao);
    g.bindBuffer(g.ARRAY_BUFFER, this.lpts); g.bufferData(g.ARRAY_BUFFER, new Float32Array(pts), g.STATIC_DRAW);
    g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 8, 0);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, this.lidx); g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), g.STATIC_DRAW);
    g.bindVertexArray(null);
    this.lcount = idx.length;
  }
  /** Each province's colour: bytes r, g, b and 255 (or 128 to light it), one set a province. */
  paint(bytes) { const g = this.g, all = new Uint8Array(64 * this.rows * 4); all.set(bytes.subarray(0, all.length)); g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, this.tab); g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, 64, this.rows, g.RGBA, g.UNSIGNED_BYTE, all); }
  /** A picture of the world's heights (96 of 255 is the sea's surface; alpha under 255 marks ice), or nothing for heights made from noise. */
  relief(img) { const g = this.g; this.real = img ? 1 : 0; if (!img) return; g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, this.heights); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, img); }
  wood(img) { const g = this.g; g.activeTexture(g.TEXTURE3); g.bindTexture(g.TEXTURE_2D, this.timber); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, img); g.generateMipmap(g.TEXTURE_2D); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR); }
  /** o: style, relief (how strongly the heights are lit, 1 for the whole world, less close in where the picture runs out of detail), detail (0 to 1: fine relief added close in) and octaves (how many waves of it), rise (how far the land stands above the sea), tint (how much of the owner's colour lies over the land's own), lamp (the mesh layer's shadow settings, or nothing). */
  draw(cam, dpr, o) {
    const g = this.g, W = Math.round(cam.W * dpr), H = Math.round(cam.H * dpr), cv = this.canvas, st = o.style.table;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, W, H);
    const both = ({ P, u }) => {
      g.useProgram(P); aim(g, u, cam);
      g.uniform1i(u.uTab, 0); g.uniform1i(u.uRelief, 1); g.uniform1i(u.uWood, 3); g.uniform2f(u.uSize, ...this.size); g.uniform1f(u.uReal, this.real); g.uniform1f(u.uSeed, this.seed);
      g.uniform3f(u.uSun, ...o.style.sun); g.uniform1f(u.uShOn, 0); g.uniform1f(u.uShade, o.lamp ? o.style.ground : 0); g.uniform1f(u.uK, DEPTH); g.uniform1f(u.uRel, (o.relief ?? 1) * o.style.map.relief); g.uniform1f(u.uGloss, o.style.surface.gloss); g.uniform4f(u.uWash, ...o.style.map.wash.map((v, i) => (i < 3 ? v / 255 : v))); g.uniform1f(u.uDet, o.detail || 0); g.uniform1f(u.uOct, o.octaves ?? 4);
      o.lamp?.(u);
      return u;
    };
    g.disable(g.DEPTH_TEST);
    let u = both(this.sea);
    g.uniform1f(u.uDpr, dpr); g.uniform3f(u.uBaize, ...st.baize.map((v) => v / 255)); g.uniform3f(u.uRule, ...st.rule.map((v) => v / 255)); g.uniform2f(u.uWoodK, ...st.wood);
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.enable(g.DEPTH_TEST); g.depthFunc(g.LEQUAL); g.clearDepth(1); g.clear(g.DEPTH_BUFFER_BIT);
    u = both(this.land);
    g.uniform1f(u.uRise, o.rise); g.uniform1f(u.uTint, o.tint);
    g.bindVertexArray(this.vao);
    g.drawElements(g.TRIANGLES, this.count, g.UNSIGNED_INT, 0);
    if (this.lcount) { // capomap: lakes, a hair above the land so they never flicker with it
      u = both(this.lake); g.uniform1f(u.uRise, o.rise);
      g.enable(g.POLYGON_OFFSET_FILL); g.polygonOffset(-1, -2);
      g.bindVertexArray(this.lvao); g.drawElements(g.TRIANGLES, this.lcount, g.UNSIGNED_INT, 0);
      g.disable(g.POLYGON_OFFSET_FILL);
    }
    g.bindVertexArray(null);
    g.disable(g.DEPTH_TEST);
  }
  destroy() { this.g.getExtension("WEBGL_lose_context")?.loseContext(); }
}
