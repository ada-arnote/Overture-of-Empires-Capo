// SPDX-License-Identifier: AGPL-3.0-or-later
// The painter: WebGL2 by hand. One full-screen triangle; the shader undoes the camera and walks down to the first cell top.
const VS = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`;
const FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uId,uHt,uTab,uWood; uniform vec2 uSize,uView,uMid,uC,uYaw,uTilt,uLight; uniform float uS,uQ,uDpr,uMost,uUnit,uRelief,uTime,uPat,uCell,uBev,uSlab,uTable;
uniform vec3 uInk,uPale,uWall,uGlow,uLand; out vec4 o;
int raw(ivec2 t){ if(t.x<0||t.y<0||t.x>=int(uSize.x)||t.y>=int(uSize.y)) return 0; vec4 v=texelFetch(uId,t,0); return int(v.r*255.+.5)+256*int(v.g*255.+.5); }
int idAt(vec2 p){ return raw(ivec2(floor(p))); }
int idSoft(vec2 p){ vec2 q=p-.5,f=fract(q); ivec2 b=ivec2(floor(q)); int a=raw(b),c=raw(b+ivec2(1,0)),d=raw(b+ivec2(0,1)),e=raw(b+ivec2(1,1));
  if(a==c&&a==d&&a==e) return a; vec4 w=vec4((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y); vec4 s;
  s.x=w.x+(c==a?w.y:0.)+(d==a?w.z:0.)+(e==a?w.w:0.); s.y=w.y+(a==c?w.x:0.)+(d==c?w.z:0.)+(e==c?w.w:0.); s.z=w.z+(a==d?w.x:0.)+(c==d?w.y:0.)+(e==d?w.w:0.); s.w=w.w+(a==e?w.x:0.)+(c==e?w.y:0.)+(d==e?w.z:0.);
  float m=max(max(s.x,s.y),max(s.z,s.w)); return m==s.x?a:m==s.y?c:m==s.z?d:e; }
vec4 tab(int id,int k){ return texelFetch(uTab,ivec2((id&63)*4+k,id>>6),0); } // 0: colour, owner. 1: top, glow, wetness, the land a province is in (1 for none). 2: kind of ground, a seed. 3: the cell's middle
float top(int id){ return id<=0?0.:tab(id,1).r*255./32.*uUnit; }
vec2 plane(vec2 uv,float Z){ float Y=(uv.y*(1.-uQ*Z*uTilt.x)+Z*uTilt.y)/max(.02,uTilt.x+uQ*uv.y*uTilt.y), X=uv.x*(1.-uQ*(Y*uTilt.y+Z*uTilt.x));
  return uC+vec2(X*uYaw.x+Y*uYaw.y,-X*uYaw.y+Y*uYaw.x)/uS; }
float ht(vec2 p){ return texture(uHt,p/uSize).r*255.; }
float grain(vec2 p){ p=floor(p); return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
float nz(vec2 p){ vec2 f=fract(p); f=f*f*(3.-2.*f); return mix(mix(grain(p),grain(p+vec2(1.,0.)),f.x),mix(grain(p+vec2(0.,1.)),grain(p+1.),f.x),f.y); }
// a shine: g is the slope of the ground, n how tight the glint is. The eye sits where the camera does.
float shine(vec2 g,float n){ vec3 v=vec3(uTilt.y*uYaw.y,uTilt.y*uYaw.x,uTilt.x); return pow(max(dot(normalize(vec3(-g,1.)),normalize(normalize(vec3(uLight,1.3))+v)),0.),n); }
// What the land is, as a shape on the tile's top (looks only). 2 grain in rows, 3 a clay pit in steps, 4 sand in dunes, 5 salt pans, 6 bare rock, 7 low hills. q: the place on the tile, 1 at its rim.
float form(int k,vec2 p,vec2 q,float sd){
  if(k==2){ float a=sd*3.1416; return .5+.5*sin((q.x*cos(a)+q.y*sin(a))*31.); }
  if(k==3){ float t=min(length(q)*(1.+.3*nz(p*.07)),.92)*4.6; return (floor(t)+smoothstep(0.,.3,fract(t)))/4.2; }
  if(k==4){ float t=q.y*8.+sin(q.x*4.+sd*6.)*1.3+nz(p*.06)*2.5; return pow(.5+.5*sin(t),1.6); }
  if(k==5){ vec2 f=abs(fract(q*3.6+sd)-.5); return smoothstep(.37,.47,max(f.x,f.y)); }
  if(k==6) return 1.-abs(2.*nz(p*.13)-1.)+.5*nz(p*.31);
  if(k==7) return 1.3*nz(p*.12+sd)+.5*nz(p*.3);
  return 0.; }
// seat patterns, a second sign beside colour, the same as on the score bar: q is the ground in screen pixels, so lines keep their width at any zoom
float hatch(float u,float P){ return 1.-smoothstep(.6,1.1+.6/uDpr,abs(fract(u/P)-.5)*P); }
float pattern(vec2 q,int k){
  if(k==0) return hatch((q.x+q.y)*.7071,6.5);
  if(k==1){ vec2 g=mod(q+vec2(floor(q.y/6.)*3.,0.),6.)-3.; return 1.-smoothstep(1.2,1.9+.6/uDpr,length(g)); }
  if(k==2) return hatch(q.x,6.);
  if(k==3) return max(hatch((q.x+q.y)*.7071,8.),hatch((q.x-q.y)*.7071,8.));
  if(k==4) return hatch((q.x-q.y)*.7071,6.5);
  return hatch(q.y,5.5); }
vec3 face(vec2 p,int id,float foot){
  vec4 a=tab(id,0),b=tab(id,1); vec3 c=a.rgb; float e=2.;
  vec2 g=vec2(ht(p+vec2(e,0.))-ht(p-vec2(e,0.)),ht(p+vec2(0.,e))-ht(p-vec2(0.,e)))/100.;
  vec4 t2=tab(id,2),t3=tab(id,3); int kd=int(t2.r*255.+.5); vec2 q=(p-vec2(t3.r+t3.g*256.,t3.b+t3.a*256.)*15.9375)/uCell; float fm=0.;
  if(kd>1){ float sd=t2.g,rim=kd>5?1.:smoothstep(.93,.78,max(abs(q.x),abs(q.x)*.5+abs(q.y)*.866)/.866); fm=form(kd,p,q,sd);
    g+=vec2(form(kd,p+vec2(1.,0.),q+vec2(1.,0.)/uCell,sd)-fm,form(kd,p+vec2(0.,1.),q+vec2(0.,1.)/uCell,sd)-fm)*rim*(kd==3?.5:kd>5?.2:.16);
    c*=mix(1.,kd==2?.84+.24*fm:kd==3?.66+.42*fm:kd==5?1.04-.16*fm:.86+.22*fm,rim); if(kd==5) c=mix(c,vec3(.96,.97,.95),.35*rim*(1.-fm)*grain(floor(q*3.6+sd)*7.)); }
  float k=clamp(1.-dot(g,uLight)*2.3*uRelief,.56,1.36); c*=k; c=mix(c,vec3(1.,.97,.9),.30*smoothstep(78.,118.,ht(p))*uRelief);
  c*=.965+.07*grain(p*1.5); // paper
  float wet=b.b; c=mix(c,c*c*1.15,wet*.55); // fresh ink is deeper
  if(wet>0.) c+=vec3(.10)*wet*smoothstep(.0,1.,k-1.)*2.+min(uBev,1.)*wet*.5*shine(g*2.5+vec2(nz(p*.35)-.5,nz(p*.35+7.)-.5)*.7,18.); // and it shines while it is wet
  if(uBev>0.){ // a tile is a moulded thing: its rim falls away and catches the light, and a taller neighbour shades its foot
    vec2 bv=vec2(0.); float ao=0.,sh=0.;
    for(int i=0;i<12;i++){ float t=float(i)*1.0471976+.3; vec2 d=vec2(cos(t),sin(t)); int n=idAt(p+d*(i<6?uBev:uBev*.5)); if(n==id) continue;
      float dh=(n<=0?0.:tab(n,1).r)-b.r; if(dh>.004) ao+=1.; else if(dh<-.004||(kd!=1&&(uSlab>0.||n<=0||abs(tab(n,0).a-a.a)>.002))) bv+=d; }
    if(kd==1){ for(int i=0;i<6;i++){ float t=float(i)*1.0471976; int n=idAt(p+vec2(cos(t),sin(t))*uCell*.42); if(n>0&&tab(n,1).r>b.r+.004) sh+=1.; }
      c=mix(c*.88,c*1.16+vec3(0.,.035,.03),min(1.,sh/3.+ao/6.)); if(ao>3.) c=mix(c,vec3(.9,.95,.94),.4); c+=.3*shine(g*4.,50.); } // water: deep away from land, pale and foaming at the shore, and the only gloss on the board
    else c*=1.-.045*ao;
    if(bv!=vec2(0.)){ float f=dot(normalize(bv),uLight)*min(1.,length(bv)/2.5)*(1.+wet); c*=1.+.3*f; c+=max(f,0.)*.05; } }
  bool owned=a.a<.99;
  if(owned&&uPat>0.){ vec2 d=(p-uC)*uS; int s=((int(a.a*255.+.5)-20)*154)%211; // 154 undoes the 37 the owner was stored with
    float l=dot(a.rgb,vec3(.2126,.7152,.0722)); c=mix(c,l>.45?uInk:uPale,pattern(vec2(d.x*uYaw.x-d.y*uYaw.y,(d.x*uYaw.y+d.y*uYaw.x)*uTilt.x),s%6)*(l>.45?.32:.27)); }
  // borders: a firm line where the owner changes, a faint one between cells of one owner.
  // Owned land is ringed by an ink line and a paper line, whatever its colour: paper outside where it meets dark sea, else ink.
  float w=max(1.6,foot*1.1),px=foot*uDpr,r2=owned?max(w*2.6,min(px*3.2,uCell*.2)):w*2.6; bool edge=false,own=false,land=false,them=false,dark=false;
  for(int i=0;i<6;i++){ float t=float(i)*1.0471976; int n=idSoft(p+vec2(cos(t),sin(t))*r2); if(n!=id){ edge=true; float o2=tab(max(n,0),0).a; if(n<=0||abs(o2-a.a)>.002){ own=true; if(n>0&&o2<.99) them=true; if(n>0&&o2>.99&&dot(tab(n,0).rgb,vec3(.3,.6,.1))<.42) dark=true; } if(n>0){ float m=tab(n,1).a; if((m>.99)!=(b.a>.99)) own=true; else if(abs(m-b.a)>.002) land=true; } } }
  if(own){ bool near=false; float r1=owned?max(w*1.5,min(px*1.8,uCell*.11)):w*1.5; for(int i=0;i<6;i++){ float t=float(i)*1.0471976; int n=idSoft(p+vec2(cos(t),sin(t))*r1); if(n!=id) near=true; }
    if(owned) c=near!=dark?uInk*.5:mix(c,uPale,dark?.9:.6);
    // beside owned land only the owned side draws the edge, so the ink meets the ground as it is
    else if(!them){ float l=dot(a.rgb,vec3(.3,.6,.1)); vec3 line=l>.36?uInk:uPale; c=mix(c,near?line:mix(line,a.rgb,.55),near?.42:.15); } }
  else if(edge) c=mix(c,uInk,b.a<.99?.46:.16);
  if(land) c=mix(c,uLand,own?.6:.92);
  float gl=b.g; if(gl>0.){ float pulse=uTime<=0.?1.:.72+.28*cos(uTime*6.2832); c=mix(c,uGlow,gl*(edge?.95:.34*pulse)); }
  return c; }
void main(){
  vec2 uv=vec2(gl_FragCoord.x/uDpr,uView.y-gl_FragCoord.y/uDpr)-uMid;
  if(uTilt.x+uQ*uv.y*uTilt.y<.03){ o=vec4(0.); return; }
  vec2 p0=plane(uv,0.),p=p0; int id=0; float z=0.; bool wall=false;
  if(uMost>0.){ vec2 p1=plane(uv,uMost); int n=int(clamp(ceil(distance(p0,p1)*uS*1.6),2.,64.)); float tp=1.;
    for(int i=0;i<=n;i++){ float t=1.-float(i)/float(n); vec2 a=mix(p0,p1,t); int k=idAt(a); float h=top(k);
      if(h>0.&&h>=uMost*t-1e-3){ id=k; p=a; z=uMost*t; vec2 q=mix(p0,p1,h/uMost);
        if(i==0||idAt(q)==k){ p=q; z=h; } else { float lo=tp,hi=t; for(int j=0;j<5;j++){ float md=(lo+hi)*.5; vec2 b=mix(p0,p1,md); int kk=idAt(b); if(kk>0&&top(kk)>=uMost*md){ hi=md; id=kk; p=b; } else lo=md; } z=uMost*hi; wall=true; }
        break; }
      tp=t; } }
  else id=idSoft(p);
  float den=uTilt.x+uQ*uv.y*uTilt.y, foot=1./(uS*uDpr)/max(.35,den);
  if(id<=0){ // the table: a soft shadow under the board
    float s=0.; for(int i=0;i<10;i++){ float a=float(i)*.6283; s+=idAt(p0+vec2(cos(a),sin(a)*.8)*26.-vec2(7.,16.))>0?1.:0.; s+=idAt(p0+vec2(cos(a),sin(a)*.8)*12.-vec2(5.,10.))>0?1.:0.; }
    if(uTable<=0.){ o=vec4(0.,0.,0.,s/20.*.55); return; }
    // walnut, with a blue baize inlay for the board to lie on and a silver rule round it
    vec2 hs=uSize*.5; float mg=max(hs.x,hs.y)*.16,r=mg*.6; vec2 d=abs(p0-hs)-hs-mg+r; float sd=length(max(d,0.))+min(max(d.x,d.y),0.)-r,fw=foot*uDpr*1.2;
    vec3 c=texture(uWood,p0/(max(hs.x,hs.y)*vec2(1.3,.65))).rgb; c=mix(c,vec3(.3,.19,.12),.35)*.8; c*=1.-.3*smoothstep(mg*.5,0.,sd)*step(0.,sd);
    c=mix(vec3(.055,.105,.2)*(.86+.28*grain(p0*2.)),c,smoothstep(-fw,fw,sd)); c=mix(c,vec3(.72,.77,.83),(1.-smoothstep(mg*.035,mg*.035+fw,abs(sd+mg*.32)))*.8);
    o=vec4(c*(1.-s/20.*.62)*(1.-2.*dot(uv/uView,uv/uView)),1.); return; }
  vec3 c;
  if(wall){ vec3 b=tab(id,0).rgb; float l=.36+.30*clamp(z/max(top(id),.01),0.,1.); vec2 n=vec2(0.);
    if(uBev>0.){ for(int i=0;i<6;i++){ float t=float(i)*1.0471976+.5; vec2 d=vec2(cos(t),sin(t)); if(idAt(p+d*1.7)!=id) n+=d; } if(n!=vec2(0.)) l*=1.25+.55*dot(normalize(n),uLight); } // a side that faces the lamp is lighter
    c=mix(b*l,uWall,.45)*(.9+.12*grain(p)); if(tab(id,1).g>0.) c=mix(c,uGlow,.35); }
  else { c=face(uMost>0.?p:p,id,foot); if(uMost>0.){ float h=top(id); for(int k=1;k<=5;k++){ float d=float(k)*3.; if(top(idAt(p+uLight*d))>h+.6*float(k)){ c*=.80; break; } } } }
  if(uTable>0.) c*=1.-dot(uv/uView,uv/uView);
  o=vec4(c,1.); }`;

export class Painter {
  constructor(canvas) {
    this.canvas = canvas;
    const g = this.g = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!g) throw new Error("no WebGL2");
    const shader = (type, text) => {
      const s = g.createShader(type);
      g.shaderSource(s, text);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) || "shader");
      return s;
    };
    const P = g.createProgram();
    g.attachShader(P, shader(g.VERTEX_SHADER, VS));
    g.attachShader(P, shader(g.FRAGMENT_SHADER, FS));
    g.linkProgram(P);
    if (!g.getProgramParameter(P, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(P) || "program");
    g.useProgram(P);
    const n = g.getProgramParameter(P, g.ACTIVE_UNIFORMS);
    this.u = {};
    for (let i = 0; i < n; i++) { const { name } = g.getActiveUniform(P, i); this.u[name] = g.getUniformLocation(P, name); }
  }
  load(m) {
    const g = this.g;
    this.m = m;
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    (this.textures || []).forEach((t) => g.deleteTexture(t));
    const make = (unit, inner, w, h, format, data, filter) => {
      const t = g.createTexture();
      g.activeTexture(g.TEXTURE0 + unit);
      g.bindTexture(g.TEXTURE_2D, t);
      g.texImage2D(g.TEXTURE_2D, 0, inner, w, h, 0, format, g.UNSIGNED_BYTE, data);
      for (const [k, v] of [[g.TEXTURE_MIN_FILTER, filter], [g.TEXTURE_MAG_FILTER, filter], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]]) g.texParameteri(g.TEXTURE_2D, k, v);
      return t;
    };
    this.rows = Math.ceil((m.n + 1) / 64);
    this.table = new Uint8Array(256 * this.rows * 4);
    this.textures = [make(0, g.RG8, m.w, m.h, g.RG, new Uint8Array(m.ids.buffer), g.NEAREST), make(1, g.R8, m.hw, m.hh, g.RED, m.height, g.LINEAR), make(2, g.RGBA8, 256, this.rows, g.RGBA, this.table, g.NEAREST), make(3, g.RGBA8, 1, 1, g.RGBA, new Uint8Array([92, 60, 40, 255]), g.LINEAR)];
  }
  /** The table's wood, once its picture has come. */
  wood(img) {
    const g = this.g;
    g.activeTexture(g.TEXTURE3);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, img);
    g.generateMipmap(g.TEXTURE_2D);
    for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR], [g.TEXTURE_WRAP_S, g.MIRRORED_REPEAT], [g.TEXTURE_WRAP_T, g.MIRRORED_REPEAT]]) g.texParameteri(g.TEXTURE_2D, k, v);
  }
  /** Send the cells' colours and states. `cells[i]`: rgb 0 to 255, owner (-1 for none), top, glow and wet 0 to 1, kind of ground. */
  send(cells) {
    const T = this.table, g = this.g;
    cells.forEach((c, i) => {
      const id = i + 1, o = ((id >> 6) * 256 + (id & 63) * 4) * 4, [x, y] = this.m.mid[i].map((v) => Math.round(v * 16));
      T[o] = c.rgb[0]; T[o + 1] = c.rgb[1]; T[o + 2] = c.rgb[2]; T[o + 3] = c.owner < 0 ? 255 : 20 + ((c.owner * 37) % 211); // different for every owner, up to 211 of them
      T[o + 4] = Math.min(255, Math.round(c.top * 32)); T[o + 5] = c.glow * 255; T[o + 6] = c.wet * 255; T[o + 7] = c.land === undefined ? 255 : 40 + c.land * 30;
      T[o + 8] = c.kind || 0; T[o + 9] = (i * 89) % 251; T[o + 12] = x & 255; T[o + 13] = x >> 8; T[o + 14] = y & 255; T[o + 15] = y >> 8;
    });
    g.activeTexture(g.TEXTURE2);
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, 256, this.rows, g.RGBA, g.UNSIGNED_BYTE, T);
  }
  draw(cam, dpr, o) {
    const g = this.g, u = this.u, m = this.m, W = Math.round(cam.W * dpr), H = Math.round(cam.H * dpr), cv = this.canvas;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    g.viewport(0, 0, W, H);
    g.uniform1i(u.uId, 0); g.uniform1i(u.uHt, 1); g.uniform1i(u.uTab, 2); g.uniform1i(u.uWood, 3);
    g.uniform2f(u.uSize, m.w, m.h); g.uniform2f(u.uView, cam.W, cam.H); g.uniform2f(u.uMid, cam.mx, cam.my); g.uniform2f(u.uC, cam.cx, cam.cy);
    g.uniform2f(u.uYaw, cam.cw, cam.sw); g.uniform2f(u.uTilt, cam.ct, cam.st); g.uniform2f(u.uLight, -0.6, -0.8);
    g.uniform1f(u.uS, cam.s); g.uniform1f(u.uQ, cam.q); g.uniform1f(u.uDpr, dpr); g.uniform1f(u.uUnit, o.unit); g.uniform1f(u.uMost, o.most); g.uniform1f(u.uRelief, o.relief); g.uniform1f(u.uTime, o.time); g.uniform1f(u.uPat, o.pat ? 1 : 0); g.uniform1f(u.uCell, m.R); g.uniform1f(u.uBev, o.bevel); g.uniform1f(u.uSlab, m.R < 20 ? 0 : 1); g.uniform1f(u.uTable, o.table ? 1 : 0); // cells too small for a rim of their own are bevelled only where the land's owner or height changes
    const f3 = (k, c) => g.uniform3f(u[k], c[0] / 255, c[1] / 255, c[2] / 255);
    f3("uInk", o.ink); f3("uPale", o.pale); f3("uWall", o.wall); f3("uGlow", o.glow); f3("uLand", o.land || o.glow);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }
  destroy() { this.g.getExtension("WEBGL_lose_context")?.loseContext(); }
}
