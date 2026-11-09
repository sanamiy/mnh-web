// Sunken-city landmarks + the "core power" lore.
//
// Lore: the seabed core is the city's geothermal plant + server. It never stopped. Power still runs
// up seabed cables into the ruins, so only rooms the power reaches are lit (more lit deeper and near
// the core). Every few seconds a pulse leaves the core and travels outward, lighting windows and
// cables as it passes. On Monday night (JST, event hours) the core runs hotter: more windows, faster pulse.
//
// One landmark per dive stop: neon rooftop (surface), broken street screen (next session),
// sunken elevated train (Monday list), flooded server room (LABS), Japanese street corner (seabed).
// Props are CC0 models from Poly Haven (see ../assets/models/CREDITS.md).
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function init(ctx){
  const { THREE, scene, SEABED, ruinMat, rustMat, cableMat, core, tops, DS, events = [], reduce, keep = [], fish } = ctx;
  const V3 = THREE.Vector3, C = c => new THREE.Color(c);
  let seed = 7331; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ground = (x, z) => SEABED + Math.sin(x*.05)*2 + Math.cos(z*.07)*2; // matches the seabed plane
  // the core is buried: it broke through the crossing and sits in a crater, only its cracked top showing
  core.position.set(0, ground(0, -38) + .3, -38); // more than half of it out of the ground
  // the exposed core: bare and glowing (no shell), brighter toward the centre of the disc, breathing slowly
  const coreShell = { uTime:{value:0}, uFlare:{value:0}, uPower:{value:1} };
  for (const c of core.children) if (c.isMesh && c.geometry?.type === "SphereGeometry"){
    c.material = new THREE.ShaderMaterial({ uniforms: coreShell, toneMapped:false,
      vertexShader:`varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float uTime,uFlare,uPower;varying vec3 vN;varying vec3 vV;varying vec3 vP;
        void main(){ float ndv=max(dot(vN,vV),0.); float breath=.55+.45*sin(uTime*.6)*sin(uTime*.23+1.3);
          float swirl=.5+.5*sin(vP.y*3.+uTime*.4+sin(vP.x*2.5-uTime*.3)*1.5);
          vec3 c=mix(vec3(.28,.62,.55),vec3(.8,1.,.93),pow(ndv,1.6))*(.75+.3*breath+.08*swirl)*(1.+uFlare*.5)*(.85+.15*uPower);
          gl_FragColor=vec4(c,1.); }` });
  }
  for (const c of core.children){ if (c.geometry?.type === "TorusGeometry") c.visible = false; if (c.isSprite){ c.position.y = 1.6; } if (c.isPointLight){ c.position.y = 3.5; c.distance = 55; } }
  const CORE = core.position.clone();
  const RIM = [[0, -.6], [2.6, -.6], [3.2, .2], [4.2, .75], [5.5, .55], [7.5, 0], [9, -.15]]; // crater profile (radius, height above seabed)
  const crater = (x, z) => { const r = Math.hypot(x - CORE.x, z - CORE.z); for (let i = 1; i < RIM.length; i++) if (r <= RIM[i][0]){ const [r0, h0] = RIM[i-1], [r1, h1] = RIM[i]; return h0 + (h1 - h0)*(r - r0)/(r1 - r0); } return 0; };
  const floor = (x, z) => ground(x, z) + Math.max(crater(x, z), 0);
  const updaters = [], groups = []; let flareNow = 0;

  // ---------------- power state ----------------
  const P = { uPower:{value:1}, uPulseR:{value:1e4}, uCore:{value:CORE} };
  const forced = new URLSearchParams(location.search).get("monday");
  function mondayNight(){
    if (forced) return forced === "1";
    const now = Date.now();
    if (events.some(e => { const s = +new Date(e.starts_at), en = e.ends_at ? +new Date(e.ends_at) : s + 3*36e5; return now >= s - 18e5 && now <= en; })) return true;
    const j = new Date(now + 9*36e5), h = j.getUTCHours() + j.getUTCMinutes()/60;
    return j.getUTCDay() === 1 && h >= 19.5 && h < 23.5;
  }
  let monday = mondayNight(); setInterval(() => monday = mondayNight(), 60e3);

  // windows: lit by power, not at random
  const prev = ruinMat.onBeforeCompile;
  ruinMat.onBeforeCompile = sh => {
    prev(sh); Object.assign(sh.uniforms, P);
    sh.fragmentShader = sh.fragmentShader
      .replace("uniform float uTime,uCaust;", "uniform float uTime,uCaust,uPower,uPulseR;uniform vec3 uCore;")
      .replace("float lit=step(.94,rh(cid*1.7+vSeed))*(1.-broken);", `
float depthF=clamp(-vWP.y/150.,0.,1.);
float nearF=exp(-length(vWP.xz-uCore.xz)/55.);
float lit=step(1.-(.015+.06*depthF+.07*nearF)*uPower,rh(cid*1.7+vSeed))*(1.-broken);
float pd=length(vWP-uCore)-uPulseR;
lit=max(lit,exp(-pd*pd/14.)*step(.45,rh(cid*3.1+vSeed*2.))*(1.-broken));
lit*=step(vWP.y,-1.5);`); // nothing lit above the water
  };
  ruinMat.needsUpdate = true;

  // ---------------- helpers ----------------
  const fogWrap = (vert, frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ fog:true, toneMapped:false, ...extra,
    uniforms: {...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms}, // keep shared uniform objects (power state) by reference
    vertexShader: `#include <fog_pars_vertex>\n${vert}`, fragmentShader: `#include <fog_pars_fragment>\n${frag}` });
  const canvas = (w, h, draw) => { const c = Object.assign(document.createElement("canvas"), {width:w, height:h}); draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const glowTex = canvas(128, 128, (x, w) => { const g = x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,"rgba(255,255,255,1)"); g.addColorStop(.25,"rgba(255,255,255,.35)"); g.addColorStop(1,"rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0,0,w,w); });
  const glow = (color, size, op = .6) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true, opacity:op}));
    s.scale.set(size, size, 1); return s; };
  const block = (w, h, d, s = rnd()) => { const g = new THREE.BoxGeometry(w, h, d, 4, Math.max(1, Math.round(h/10)), 4); g.translate(0, h/2, 0);
    g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1)); return new THREE.Mesh(g, ruinMat); };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const cyl = (r1, r2, h, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };
  const group = (name, yMin, yMax) => { const g = new THREE.Group(); g.name = name; g.userData.range = [yMin, yMax]; scene.add(g); groups.push(g); return g; };
  const lamp = c => new THREE.MeshBasicMaterial({color:c, toneMapped:false});

  // ---------------- realism: CC0 PBR textures + underwater weathering ----------------
  const texL = new THREE.TextureLoader(), texCache = {};
  const pendingTex = {};
  const tex = (file, srgb) => { let t = texCache[file];
    if (!t){ t = texCache[file] = texL.load(`./assets/textures/${file}.webp`, () => (pendingTex[file] || []).forEach(c => c.needsUpdate = true)); t.userData.file = file; }
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // clones share the image; flag them for upload only once it has arrived (flagging earlier uploads nothing and warns)
  const cloneTex = t => { const c = t.clone(); if (t.image) c.needsUpdate = true; else (pendingTex[t.userData.file] ??= []).push(c); return c; };
  // Poly Haven "arm" = AO / roughness / metalness in R / G / B — exactly three's aoMap / roughnessMap / metalnessMap channels
  function pbr(id, rx = 1, ry = 1, o = {}){
    const rp = t => { const c = cloneTex(t); c.repeat.set(rx, ry); return c; };
    const arm = rp(tex(`${id}_arm`));
    return weather(new THREE.MeshStandardMaterial({ map: o.noMap ? null : rp(tex(`${id}_Diffuse`, true)), normalMap: rp(tex(`${id}_nor_gl`)), normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: arm, metalnessMap: o.metal ? arm : null, aoMap: arm, aoMapIntensity: .8, color: o.color ?? 0xffffff, roughness: 1, metalness: o.metal ? 1 : 0, envMapIntensity: .25 }), o.w);
  }
  // grime + algae + silt on upward faces + caustics, shared by everything this module adds
  const W = { uTime:{value:0} };
  const NOISE = `float wh(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float wn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wh(i),wh(i+vec2(1,0)),f.x),mix(wh(i+vec2(0,1)),wh(i+1.),f.x),f.y);}
float wf(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*wn(p);p=p*2.03+17.1;a*=.5;}return v;}
float wc(vec2 uv,float t){vec2 p=mod(uv*6.28318,6.28318)-250.;vec2 i=p;float c=1.;
  for(int n=0;n<3;n++){float tt=t*(1.-(3.5/float(n+1)));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));c+=1./length(vec2(p.x/(sin(i.x+tt)/.005),p.y/(cos(i.y+tt)/.005)));}
  c/=3.;c=1.17-pow(c,1.4);return pow(abs(c),8.);}`;
  function weather(mat, k = 1){
    if (mat.userData.weathered) return mat; mat.userData.weathered = true;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = W.uTime; sh.uniforms.uWk = {value:k};
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 wP;varying vec3 wN;")
        .replace("#include <fog_vertex>", `#include <fog_vertex>
#ifdef USE_INSTANCING
wP=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;wN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal);
#else
wP=(modelMatrix*vec4(transformed,1.)).xyz;wN=normalize(mat3(modelMatrix)*objectNormal);
#endif`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform float uTime,uWk;varying vec3 wP;varying vec3 wN;\n${NOISE}`)
        .replace("#include <map_fragment>", `#include <map_fragment>
float wU=(1.-smoothstep(-1.5,.5,wP.y))*uWk, wA=wf(wP.xz*.3+wP.y*.15), wB=wf(vec2(wP.x+wP.z,wP.y)*1.6);
float wUp=smoothstep(.25,.9,wN.y);
diffuseColor.rgb*=mix(1.,.5+.4*wA,wU);
diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.025,.06,.04),vec3(.08,.12,.06),wB),wU*smoothstep(.5,.75,wA+.2*wUp)*.85);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.125,.11)*(.7+.5*wB),wU*wUp*smoothstep(.25,.55,wB));`)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,1.,wU*.55);")
        .replace("#include <opaque_fragment>", `{float cz=wU*exp(wP.y/30.);float cs=wc(fract(wP.xz*.04+vec2(wP.y*.01)),uTime*.55)*(max(wN.y,0.)*.9+.4);
 outgoingLight+=diffuseColor.rgb*cs*cz*vec3(.7,.85,1.)*3.;}
#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => "weather" + k;
    return mat;
  }

  const concrete = pbr("concrete_moss", 1.5, 1.5);
  const rust = pbr("rusty_metal_02", 1, 1, {metal:true});
  const darkMetal = weather(new THREE.MeshStandardMaterial({color:0x15181d, roughness:.5, metalness:.6}));
  const rackMetal = new THREE.MeshStandardMaterial({color:0x15181d, roughness:.5, metalness:.6}); // server racks stay as they are
  const paint = c => pbr("rusty_painted_metal", 1, 1, {noMap:true, color:c, metal:true});

  // GLB props (load in the background; each placement appears when its model arrives)
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), cache = {};
  const model = name => cache[name] ??= loader.loadAsync(`./assets/models/${name}.glb`).then(g => {
    g.scene.traverse(o => { if (o.isMesh){ o.material.envMapIntensity = .3; weather(o.material); } }); return g.scene; }).catch(() => null);
  function prop(parent, name, x, y, z, o = {}){
    model(name).then(src => { if (!src) return;
      let m = o.node ? src.getObjectByName(o.node) : src; if (!m) return; m = m.clone();
      if (o.node) m.position.set(0, 0, 0);
      const holder = new THREE.Group(); holder.add(m); m.position.x -= o.cx ?? 0;
      holder.position.set(x, y, z); holder.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0); holder.scale.setScalar(o.s ?? 1); parent.add(holder); });
  }

  // ======================================================================
  // CITY PLAN (top-down; x = east, -z = north). The dive happens over the centre of the avenue at (0, 0), looking north.
  //   avenue x∈[-8, 8] · cross street z∈[-44, -32] · station-front crossing at (0, -38) with the buried core
  //   elevated railway along z≈-52, deck 12 m above the street; only the span over the avenue collapsed
  //   SW corner: data center (server floor on 15F, open to the avenue) · SE corner: low shopping street
  //   NW: office towers, one still under construction — its crane fell across the avenue · NE: station + station tower
  // ======================================================================
  // replace the random procedural ruins with buildings laid out on the plan
  for (const o of [...scene.children]){
    if (!o.isMesh || keep.includes(o) || o === core || groups.includes(o)) continue;
    const rubble = o.isInstancedMesh && o.material?.isMeshStandardMaterial && o.material.color?.getHex() === 0x4a4a48;
    if (o.material === ruinMat || o.material === rustMat || o.material === cableMat || rubble || (o.material?.isMeshBasicMaterial && o.geometry?.type === "SphereGeometry")) scene.remove(o);
  }
  tops.length = 0;
  const beamM = [], rubM = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _e = new THREE.Euler();
  // a ruined building: concrete facade (ruinMat), jagged broken crown with exposed steel, rubble at its foot
  function tower(cx, cz, w, d, top, o = {}){
    const base = ground(cx, cz) - 1, h = top - base, broken = o.broken ?? rnd() > .35, loss = broken ? 1.5 + rnd()*5 : .2, sd = rnd();
    const g = new THREE.BoxGeometry(w, h, d, 6, Math.max(2, Math.round(h/12)), 6); g.translate(0, h/2, 0);
    const jag = (a, b) => (Math.sin(a*1.9 + sd*40)*Math.cos(b*1.4 + sd*20)*.6 + Math.sin((a-b)*3.1 + sd*9)*.4)*.5 + .5;
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++){ const y = pa.getY(i); if (y > h - .01) pa.setY(i, y - jag(pa.getX(i), pa.getZ(i))*loss); }
    g.computeVertexNormals(); g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(pa.count).fill(sd), 1));
    const m = new THREE.Mesh(g, ruinMat); m.position.set(cx, base, cz); m.rotation.y = o.ry ?? 0; scene.add(m); m.updateMatrixWorld();
    if (broken) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++){ if (rnd() < .5) continue;
      const lx = -w/2 + .3 + (w - .6)*i/3, lz = -d/2 + .3 + (d - .6)*j/3, len = 1.5 + rnd()*4, by = h - jag(lx, lz)*loss - .3;
      _q.setFromEuler(_e.set((rnd()-.5)*.25, 0, (rnd()-.5)*.25)); _m.compose(_p.set(lx, by + len/2, lz), _q, _s.set(.22, len, .22));
      beamM.push(m.matrixWorld.clone().multiply(_m)); }
    for (let k = 0; k < 4 + rnd()*5; k++){ const a = rnd()*Math.PI*2, r = Math.max(w, d)*.5 + rnd()*2.5, x = cx + Math.cos(a)*r, z = cz + Math.sin(a)*r;
      if (Math.abs(x) < 8.5) continue; // keep the avenue clear
      rubM.push(new THREE.Matrix4().compose(new V3(x, ground(x, z) + .2, z), _q.setFromEuler(_e.set(rnd()*3, rnd()*3, rnd()*3)), _s.setScalar(.4 + rnd()*1.3))); }
    tops.push(new V3(cx, top - loss*.5, cz)); return m;
  }
  // exposed steel frame (unfinished floors)
  function frame(cx, cz, w, d, y0, y1){
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++){ const x = cx - w/2 + w*i/3, z = cz - d/2 + d*j/3;
      beamM.push(new THREE.Matrix4().compose(new V3(x, (y0 + y1)/2, z), new THREE.Quaternion(), new V3(.5, y1 - y0, .5))); }
    for (let y = y0 + 4; y <= y1; y += 4) for (const [ax, len] of [[0, w], [1, d]]) for (let k = 0; k <= 3; k++){
      if (rnd() < .15) continue; const off = (k/3 - .5)*(ax ? w : d);
      beamM.push(new THREE.Matrix4().compose(ax ? new V3(cx + off, y, cz) : new V3(cx, y, cz + off), new THREE.Quaternion(), ax ? new V3(.35, .45, len) : new V3(len, .45, .35))); }
  }
  // lattice truss between two points (crane mast / jib)
  function truss(a, b, wd){
    const dir = b.clone().sub(a), len = dir.length(), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
    const side = new V3(1, 0, 0).applyQuaternion(q), up = new V3(0, 0, 1).applyQuaternion(q);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => side.clone().multiplyScalar(u*wd/2).add(up.clone().multiplyScalar(v*wd/2)));
    for (const c of corners) beamM.push(new THREE.Matrix4().compose(a.clone().add(c).add(dir.clone().multiplyScalar(.5)), q, new V3(.18, len, .18)));
    const n = Math.round(len/wd);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++){ const c0 = corners[k], c1 = corners[(k + 1) % 4];
      const p0 = a.clone().add(dir.clone().multiplyScalar(i/n)).add(c0), p1 = a.clone().add(dir.clone().multiplyScalar((i + 1)/n)).add(c1), dd = p1.clone().sub(p0);
      beamM.push(new THREE.Matrix4().compose(p0.clone().lerp(p1, .5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dd.clone().normalize()), new V3(.1, dd.length(), .1))); }
  }

  // --- seabed: fine silt/mud instead of a flat colour
  for (const o of scene.children) if (o.isMesh && o.geometry?.type === "PlaneGeometry" && o.geometry.parameters.width === 600){
    o.material = pbr("brown_mud_02", 90, 90, {color:0x8f978a}); o.material.normalScale.set(1.6, 1.6); }
  // --- SW: data center (see LABS below) + neighbours
  tower(-40, -15, 16, 13, -131); tower(-40, -27, 16, 9, -150);
  // --- SE: low shopping street facing the crossing, one mid-rise behind
  const SHOPS = [];
  { const plaster = pbr("grey_plaster_02", 2, 2), glass = weather(new THREE.MeshStandardMaterial({color:0x0b1014, roughness:.12, metalness:.7}));
    const tints = ["#2f4a3a", "#5a3a2a", "#2a3550", "#4a4a4a", "#24506a", "#6a2a2a"];
    const shop = (cx, cz, w, d, h, ry, k) => {
      const g = new THREE.Group(); g.position.set(cx, ground(cx, cz) - .2, cz); g.rotation.y = ry; scene.add(g);
      g.add(at(box(w, h + .4, d, plaster), 0, (h + .4)/2, 0));
      const sign = canvas(512, 96, (x, W, H) => { x.fillStyle = tints[k]; x.fillRect(0, 0, W, H); 
        for (let i = 0; i < 90; i++){ x.fillStyle = `rgba(20,40,30,${rnd()*.35})`; x.fillRect(rnd()*W, rnd()*H, 4 + rnd()*30, 2 + rnd()*14); } });
      g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w - 1, .7, .12), [plaster, plaster, plaster, plaster, weather(new THREE.MeshStandardMaterial({map:sign, roughness:.7})), plaster]), 0, 3.9, d/2 + .06)); /* blank, faded signboard */
      const awn = box(w - 1, .05, .6, weather(new THREE.MeshStandardMaterial({color:new THREE.Color(tints[k]).multiplyScalar(.9), roughness:.85}))); awn.position.set(0, 3.25, d/2 + .3); awn.rotation.x = .12; g.add(awn);
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(w - 1.6, 1.5), glass), 0, h - 2, d/2 + .01));
      for (const sx of w > 6 ? [-1.55, 1.55] : [0]) prop(g, "rollershutter_door", sx - .55, 0, d/2 + .03, {node:"rollershutter_door", s:1.4});
      prop(g, "exterior_aircon_unit", w/2 - 1.2, h + .3, -d/2 + .6, {s:1.1});
      SHOPS.push([cx, cz]);
    };
    for (let i = 0; i < 4; i++) shop(14 + i*7.6, -26, 7.4, 8, i % 2 ? 7.6 : 6.8, Math.PI, i);   // along the cross street, fronts facing the crossing
    for (let i = 0; i < 2; i++) shop(14, -10.3 - i*7.75, 7.6, 7, 7, -Math.PI/2, 4 + i);   /* z -6.5..-22: stops where the corner shop begins */              // along the avenue, fronts facing west
  }
  tower(38, -14, 16, 12, -128);
  // --- NW: office tower (breaks the surface) + tower under construction
  tower(-38, -66, 20, 16, 7, {broken:false});
  tower(-19, -66, 16, 16, -100, {broken:false}); frame(-19, -66, 16, 16, -100, -52);
  // its climbing crane: mast on the frame, jib snapped and hanging east across the avenue
  { const top = new V3(-15, -30, -62); truss(new V3(-15, -52, -62), top, 2.2); truss(top.clone().add(new V3(-1, 0, 0)), new V3(-27, -31, -62), 1.6);
    const kink = new V3(2, -38, -63); truss(top.clone().add(new V3(1, -.5, 0)), kink, 1.8); truss(kink, new V3(13, -61, -65), 1.8);
    const hook = new V3(13, -61, -65); scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(hook, hook.clone().add(new V3(0, -14, 0))), 1, .05, 4), cableMat)); }
  // --- NE: station under the tracks + station tower (breaks the surface)
  tower(28, -52, 32, 7, ground(28, -52) + 8.5, {broken:false});
  tower(28, -70, 26, 18, 10, {broken:false});
  // --- a few further blocks to the north + shallow roofs (kelp lives only up there)
  tower(-30, -92, 16, 14, -62); tower(30, -96, 18, 14, -14); tower(-60, -40, 14, 14, -8); tower(62, -30, 14, 12, -16); tower(56, -72, 14, 14, -20);
  // --- background grid beyond the plan (blocks every ~32 m, 1-2 buildings each)
  for (let bx = -110; bx <= 110; bx += 32) for (let bz = -24; bz >= -190; bz -= 30){
    if (Math.abs(bx) < 70 && bz > -110) continue; if (Math.abs(bx) < 12) continue;
    for (let k = 0; k < 1 + (rnd() < .5); k++){ const cx = bx + (rnd()-.5)*10, cz = bz + (rnd()-.5)*8, r = rnd();
      tower(cx, cz, 9 + rnd()*9, 9 + rnd()*9, r < .08 ? 2 + rnd()*10 : -150 + rnd()*120); } }

  // --- elevated railway: deck 12 m above the street, two-column piers every 16 m; the span over the avenue fell in
  const RY = ground(0, -52) + 12, RZ = -52, deckMat = pbr("concrete_moss", 20, 1.2);
  for (const [x0, x1] of [[-120, -9], [9, 120]]){
    const len = x1 - x0, deck = box(len, 1.4, 7, deckMat); deck.position.set((x0 + x1)/2, RY, RZ); scene.add(deck);
    for (const sz of [-3.4, 3.4]) scene.add(at(box(len, .9, .25, deckMat), (x0 + x1)/2, RY + 1.1, RZ + sz));
    for (const sz of [-.8, .8]) scene.add(at(box(len, .15, .12, rust), (x0 + x1)/2, RY + .78, RZ + sz));
    for (let x = x0 + 6; x < x1; x += 16){ const h = RY - .7 - ground(x, RZ);
      for (const sz of [-2.6, 2.6]) scene.add(at(box(1.2, h, 1.2, concrete), x, ground(x, RZ) + h/2, RZ + sz)); scene.add(at(box(1.6, 1.2, 7, concrete), x, RY - 1.2, RZ));
      const m = new THREE.Group(); m.position.set(x + 8, RY + .7, RZ - 3.2); scene.add(m); m.add(at(box(.2, 6, .2, rust), 0, 3, 0), at(box(.12, .12, 5, rust), 0, 5.6, 2.4)); }
  }
  // the fallen span, resting on the avenue
  const FA = new V3(-9, RY, RZ), FB = new V3(7, ground(7, RZ) + .6, RZ + .8);
  { const dir = FB.clone().sub(FA), d = box(dir.length(), 1.4, 7, deckMat); d.position.copy(FA).lerp(FB, .5); d.quaternion.setFromUnitVectors(new V3(1, 0, 0), dir.normalize()); d.rotateX(.06); scene.add(d); }
  // station platform canopy on the east span
  for (let x = 16; x <= 44; x += 7) scene.add(at(box(.25, 4, .25, rust), x, RY + 2.7, RZ - 2.4));
  scene.add(at(box(30, .25, 4.2, rust), 30, RY + 4.8, RZ - 1.6));

  // commuter cars: two on the standing span, one slid down the fallen span nose-first into the avenue
  {
    const carLen = 13.5, carH = 3.5, carW = 2.9;
    // stainless commuter-car side: brushed panels, a continuous window band with pillars, four doors, one thin line, grime at the skirt
    const DOORS = [.12, .37, .63, .88], WIN = [];
    for (let k = 0; k < 5; k++){ const a = k ? DOORS[k-1] + .045 : .02, b = k < 4 ? DOORS[k] - .045 : .98, n = k === 0 || k === 4 ? 1 : 3;
      for (let i = 0; i < n; i++) WIN.push([a + (b - a)*i/n + .006, (b - a)/n - .012]); }
    const side = (lit) => canvas(2048, 512, (x, w, h) => {
      const g0 = x.createLinearGradient(0, 0, 0, h); g0.addColorStop(0, "#a7adb2"); g0.addColorStop(.6, "#959ca2"); g0.addColorStop(1, "#7f868c"); x.fillStyle = g0; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++){ x.fillStyle = `rgba(${rnd() < .5 ? "255,255,255" : "0,0,0"},${.02 + rnd()*.03})`; x.fillRect(rnd()*w, 0, 1, h); }     // brushed steel
      for (const sx of [.245, .5, .755]){ x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(sx*w, 0, 2, h); }                                         // panel joints
      WIN.forEach(([a, ww], i) => { const g = x.createLinearGradient(0, h*.2, 0, h*.56); g.addColorStop(0, lit.includes(i) ? "#5a4228" : "#1a2229"); g.addColorStop(1, lit.includes(i) ? "#3a2a18" : "#070a0d");
        x.fillStyle = "#6f767c"; x.fillRect(a*w - 4, h*.2 - 4, ww*w + 8, h*.36 + 8); x.fillStyle = g; x.fillRect(a*w, h*.2, ww*w, h*.36); });
      for (const d of DOORS){ const dx = d*w - .03*w, dw = .06*w; x.fillStyle = "#8a9197"; x.fillRect(dx, h*.1, dw, h*.84);
        x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(dx, h*.1, 3, h*.84); x.fillRect(dx + dw - 3, h*.1, 3, h*.84); x.fillRect(d*w - 1, h*.1, 2, h*.84);
        x.fillStyle = "#0b0f13"; x.fillRect(dx + 10, h*.17, dw/2 - 16, h*.36); x.fillRect(d*w + 6, h*.17, dw/2 - 16, h*.36); }
      x.fillStyle = "#a8743f"; x.fillRect(0, h*.62, w, h*.035);                                                                                // one thin line
      const g1 = x.createLinearGradient(0, h*.55, 0, h); g1.addColorStop(0, "rgba(40,55,40,0)"); g1.addColorStop(1, "rgba(40,55,40,.6)"); x.fillStyle = g1; x.fillRect(0, h*.55, w, h*.45);
      for (let i = 0; i < 40; i++){ const sx = rnd()*w, sy = h*(.56 + rnd()*.05), g2 = x.createLinearGradient(0, sy, 0, sy + h*.3); g2.addColorStop(0, "rgba(60,50,35,.25)"); g2.addColorStop(1, "rgba(60,50,35,0)");
        x.fillStyle = g2; x.fillRect(sx, sy, 3 + rnd()*6, h*.3); }                                                                           // rust streaks under the windows
    });
    const emis = (lit) => canvas(2048, 512, (x, w, h) => { x.fillStyle = "#000"; x.fillRect(0, 0, w, h);
      WIN.forEach(([a, ww], i) => { if (lit.includes(i)){ x.fillStyle = "#5e4428"; x.fillRect(a*w, h*.2, ww*w, h*.36); } }); });
    const endTex = canvas(256, 256, (x, w, h) => { x.fillStyle = "#8d949c"; x.fillRect(0, 0, w, h); x.fillStyle = "#0b0e14"; x.fillRect(20, 40, 216, 90);
      x.fillStyle = "#b8743a"; x.fillRect(0, h*.68, w, h*.07); x.fillStyle = "#2a2e34"; x.fillRect(100, 140, 56, 110); });
    const detail = (rx, ry) => { const n = cloneTex(tex("rusty_painted_metal_nor_gl")), a = cloneTex(tex("rusty_painted_metal_arm")); for (const t of [n, a]) t.repeat.set(rx, ry); return {normalMap:n, normalScale:new THREE.Vector2(.35, .35), roughnessMap:a, roughness:.85, metalness:.55}; };
    const topMat = pbr("rusty_metal_02", 4, 1, {metal:true}), endMat = weather(new THREE.MeshStandardMaterial({map:endTex, ...detail(1, 1)}));
    // car body: a box re-shaped into a rounded shell — big radius along the roof, small at the floor and the car ends,
    // slight tumblehome below the windows. Face groups/UVs stay the box's, so the livery still maps onto the sides.
    const bodyGeo = (() => {
      const g = new THREE.BoxGeometry(carLen, carH, carW, 28, 14, 12), pa = g.attributes.position, hx = carLen/2, hy = carH/2, hz = carW/2, p = new V3(), c = new V3();
      for (let i = 0; i < pa.count; i++){ p.fromBufferAttribute(pa, i);
        const r = p.y > 0 ? .85 : .22, rx = .45;                                  // roof / floor / ends
        c.set(THREE.MathUtils.clamp(p.x, -hx + rx, hx - rx), THREE.MathUtils.clamp(p.y, -hy + r, hy - r), THREE.MathUtils.clamp(p.z, -hz + r, hz - r));
        const d = p.clone().sub(c), k = new V3(d.x/rx, d.y/r, d.z/r); if (k.lengthSq() > 0) k.normalize();
        p.copy(c).add(new V3(k.x*rx, k.y*r, k.z*r));
        if (p.y < -.3) p.z *= 1 - .07*Math.min(1, (-.3 - p.y)/(hy - .3));       // tumblehome
        pa.setXYZ(i, p.x, p.y, p.z); }
      g.computeVertexNormals(); return g; })();
    const bogieMat = rust;
    const car = (lit) => { const sm = weather(new THREE.MeshStandardMaterial({map:side(lit), emissiveMap:emis(lit), emissive:0xffffff, emissiveIntensity:.5, ...detail(5.4, 1.4)}));
      const m = new THREE.Mesh(bodyGeo, [endMat, endMat, topMat, topMat, sm, sm]);
      for (const bx of [-carLen*.34, carLen*.34]){ m.add(at(box(2.6, .55, carW - .5, bogieMat), bx, -carH/2 - .35, 0));
        for (const wx of [-.75, .75]) for (const wz of [-1, 1]){ const w = cyl(.42, .42, .14, bogieMat, 14); w.rotation.x = Math.PI/2; w.position.set(bx + wx, -carH/2 - .55, wz*(carW/2 - .35)); m.add(w); } }
      for (const sx of [-1, 1]) m.add(at(box(.5, .25, .3, bogieMat), sx*(carLen/2 + .2), -carH/2 + .15, 0));   // couplers
      m.add(at(box(1.6, .08, 1.4, rust), 2, carH/2 + .6, 0), at(box(.08, .55, .08, rust), 2, carH/2 + .32, 0)); return m; };
    const onDeck = (m, x) => { m.position.set(x, RY + .7 + carH/2 + .95, RZ); scene.add(m); }; /* rides on its bogies, on the rails */
    onDeck(car([2, 7]), -44); { const c2 = car([6]); onDeck(c2, -14.5); c2.rotation.z = -.05; c2.position.y -= .25; } /* lead car overhangs the broken edge, dipping */
    // the car that fell with the span: came off it and lies askew in the avenue just south of it, nose dug into the silt
    // (placed clear of the fallen slab and the station block: along the north edge of the cross street, east of the avenue)
    const c3 = car([3]); c3.rotation.order = "YZX"; c3.rotation.set(.12, .1, -.05);
    c3.position.set(13.5, ground(13.5, RZ + 6.6) + carH/2 + 1.1, RZ + 6.6); scene.add(c3);
  }


  // ======================================================================
  // 3. LABS — flooded server floor, racks still blinking
  // ======================================================================
  const labG = group("lab", -150, -55);
  const LAB = new V3(-15, -107, -19), LAB_TOP = -86; // SW corner building, ~17F, its east side faces the avenue
  {
    labG.position.copy(LAB); labG.rotation.y = Math.PI/2;
    const W = 18, D = 10, H = 4.2;
    const below = block(W, LAB.y - SEABED - .4, D, .83); below.position.set(0, SEABED - LAB.y, 0); labG.add(below);
    const above = block(W, LAB_TOP - (LAB.y + H + .4), D, .21); above.position.set(0, H + .4, 0); labG.add(above); /* a few floors above the lab; the fallen viaduct rests on its roof */
    labG.add(at(box(W, .4, D, concrete), 0, -.2, 0), at(box(W, .4, D, concrete), 0, H + .2, 0), at(box(W, H, .4, concrete), 0, H/2, -D/2 + .2));
    for (const x of [-W/2 + .4, -W/6, W/6, W/2 - .4]) labG.add(at(box(.7, H, .7, concrete), x, H/2, D/2 - .5));
    // racks
    const rows = [-2.6, .2, 3], per = 8, rackM = [], ledM = [], ledS = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(1,1,1);
    rows.forEach((z, ri) => { for (let i = 0; i < per; i++){
      const x = -W/2 + 1.6 + i*1.85, tilt = (ri === 2 && i === 5) ? .5 : 0;
      q.setFromEuler(new THREE.Euler(0, 0, tilt)); rackM.push(new THREE.Matrix4().compose(new V3(x + tilt*.6, 1.1 - tilt*.2, z), q, s));
      if (tilt) continue;
      for (let k = 0; k < 18; k++){ ledM.push(new THREE.Matrix4().compose(new V3(x - .22 + (k%3)*.22, .35 + Math.floor(k/3)*.3, z + .56), new THREE.Quaternion(), s)); ledS.push(rnd()); }
    } });
    const racks = new THREE.InstancedMesh(new THREE.BoxGeometry(.75, 2.2, 1.1), rackMetal, rackM.length);
    rackM.forEach((m, i) => racks.setMatrixAt(i, m)); labG.add(racks);
    const ledG = new THREE.PlaneGeometry(.1, .05); ledG.setAttribute("aS", new THREE.InstancedBufferAttribute(new Float32Array(ledS), 1));
    const ledMat = fogWrap(`attribute float aS;varying float vS;void main(){vS=aS;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`, `uniform float uTime,uPower;uniform vec3 uA,uB;varying float vS;
      void main(){ float r=2.+vS*9.; float on=step(.35,fract(sin(floor(uTime*r*uPower)+vS*91.)*43758.5));
        vec3 c=vS<.06?vec3(1.,.45,.3):mix(uA,uB,step(.5,fract(vS*7.)));
        gl_FragColor=vec4(c*(.15+on*1.6),1.);
        #include <fog_fragment>
      }`, {uTime:{value:0}, uPower:P.uPower, uA:{value:C(DS.cyan)}, uB:{value:C(DS.mint)}});
    const leds = new THREE.InstancedMesh(ledG, ledMat, ledM.length); ledM.forEach((m, i) => leds.setMatrixAt(i, m)); labG.add(leds);
    updaters.push(t => ledMat.uniforms.uTime.value = t);
    // drooping cable bundles from the ceiling tray
    for (let i = 0; i < 7; i++){ const x = -W/2 + 1.5 + i*2.4, z = -3.8 + rnd()*7;
      const c = new THREE.CatmullRomCurve3([new V3(x, H, z), new V3(x + .6, H - 1.2 - rnd(), z + .4), new V3(x + 1.6, H - .2, z - .3)]);
      labG.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, .05, 5), cableMat)); }
    labG.add(at(box(W - 1, .12, .5, rust), 0, H - .3, -.2));
    prop(labG, "modular_airduct_circular_01", -4, H - 1.3, -3.6, {s:1.2});
    prop(labG, "plastic_crate_01", 6.5, 0, 4, {s:1.6, ry:.4});
    prop(labG, "plastic_crate_01", 6.9, .42, 4.1, {s:1.6, ry:.1});
    const pl = new THREE.PointLight(C(DS.cyan), 70, 26, 2); pl.position.set(0, 2.5, 2); labG.add(pl);
    const g1 = glow(C(DS.cyan), 16, .16); g1.position.set(0, 2, 3); labG.add(g1);
  }

  // ======================================================================
  // 4. SEABED — the crossing collapsed into a crater over the buried core; street things lean toward it
  // ======================================================================
  const streetG = group("street", -260, -110);
  {
    const gy = floor;
    // crater rim (lathe) + the cracked floor the core glows through
    const rim = new THREE.Mesh(new THREE.LatheGeometry(RIM.slice(1).map(([r, h]) => new THREE.Vector2(r, h)), 48), pbr("concrete_moss", 6, 1));
    rim.material.side = THREE.DoubleSide; rim.position.set(CORE.x, ground(CORE.x, CORE.z), CORE.z); streetG.add(rim);
    const fis = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48), fogWrap(`varying vec2 vUv;void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`, `uniform float uTime,uFlare,uPower;uniform vec3 uCol;varying vec2 vUv;
      vec2 hh(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
      void main(){ vec2 p=(vUv-.5)*7.; vec2 i=floor(p),f=fract(p); float d1=8.,d2=8.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y);vec2 o=hh(i+g);float d=length(g+o-f);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
        float crack=1.-smoothstep(0.,.09,d2-d1); float r=length(vUv-.5)*2.;
        float heat=(1.-smoothstep(.2,1.,r))*(.75+.25*sin(uTime*1.3))*(1.+uFlare*.8)*uPower;
        vec3 rock=vec3(.02,.025,.025)*(.6+.4*hh(i).x);
        gl_FragColor=vec4(rock+uCol*crack*heat*1.6+uCol*heat*.08,1.);
        #include <fog_fragment>
      }`, {uTime:W.uTime, uFlare:{value:0}, uPower:P.uPower, uCol:{value:C(DS.mint)}}));
    fis.rotation.x = -Math.PI/2; fis.position.set(CORE.x, ground(CORE.x, CORE.z) + .02, CORE.z); streetG.add(fis);
    updaters.push(() => fis.material.uniforms.uFlare.value = flareNow);
    const asph = pbr("asphalt_02", 1, 1);
    // avenue (N-S) and cross street (E-W); the crater breaks both at the crossing
    const roadMat = (rx, ry) => { const m = asph.clone(); for (const k of ["map", "normalMap", "roughnessMap", "aoMap"]){ m[k] = cloneTex(asph[k]); m[k].repeat.set(rx, ry); } return m; };
    const avenue = new THREE.Mesh(new THREE.PlaneGeometry(16, 230, 1, 60), roadMat(4, 55)); avenue.rotation.x = -Math.PI/2;
    { const pa = avenue.geometry.attributes.position; for (let k = 0; k < pa.count; k++){ const z = -95 - pa.getY(k); pa.setZ(k, ground(pa.getX(k), z) - ground(0, CORE.z)); } avenue.geometry.computeVertexNormals(); }
    avenue.position.set(0, ground(0, CORE.z) + .05, -95); streetG.add(avenue);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(200, 12, 50, 1), roadMat(50, 3)); cross.rotation.x = -Math.PI/2;
    { const pa = cross.geometry.attributes.position; for (let k = 0; k < pa.count; k++) pa.setZ(k, ground(pa.getX(k), CORE.z) - ground(0, CORE.z)); cross.geometry.computeVertexNormals(); }
    cross.position.set(0, ground(0, CORE.z) + .06, CORE.z); streetG.add(cross);
    const stripe = pbr("asphalt_02", .3, 2, {noMap:true, color:0x9aa39e});
    for (const zc of [CORE.z + 7.5, CORE.z - 7.5]) for (let k = 0; k < 7; k++){ const x = -6.6 + k*2.2; if (Math.hypot(x - CORE.x, zc - CORE.z) < 7.6) continue; streetG.add(at(box(.5, .04, 3.2, stripe), x, ground(x, zc) + .1, zc)); }
    for (const xc of [-10.5, 10.5]) for (let k = 0; k < 5; k++){ const z = CORE.z - 4.4 + k*2.2; streetG.add(at(box(3.2, .04, .5, stripe), xc, ground(xc, z) + .1, z)); }
    for (let z = 12; z > -200; z -= 6){ if (Math.abs(z - CORE.z) < 10) continue; streetG.add(at(box(.15, .04, 3, stripe), 0, ground(0, z) + .1, z)); }
    // sidewalks (interlocking pavers) and kerbs along both streets, broken where the crater is
    { const pave = (w, l, rx, ry) => { const m = pbr("interlocking_concrete_pavers", rx, ry); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, l), m); p.rotation.x = -Math.PI/2; return p; };
      const kerb = pbr("concrete_moss", 8, .2);
      for (const sx of [-1, 1]){
        for (const [z0, z1] of [[14, CORE.z + 8.5], [CORE.z - 8.5, -200]]){ const len = z0 - z1, zc = (z0 + z1)/2, x = sx*9.25;
          const p = pave(2.5, len, 1.2, len/2); p.position.set(x, ground(x, zc) + .17, zc); streetG.add(p);
          streetG.add(at(box(.2, .22, len, kerb), sx*8.1, ground(sx*8.1, zc) + .08, zc)); }
        for (const [x0, x1] of [[10.5, 110], [-10.5, -110]]){ const len = Math.abs(x1 - x0), xc = (x0 + x1)/2, z = CORE.z + sx*7.25;
          if (sx > 0 && xc > 0) continue; /* the shop fronts already line the south-east side */
          const p = pave(len, 2.5, len/2, 1.2); p.position.set(xc, ground(xc, z) + .17, z); streetG.add(p);
          streetG.add(at(box(len, .22, .2, kerb), xc, ground(xc, z) + .08, CORE.z + sx*6.1)); } } }
    // vending machines (fictional) on the rim, leaning toward the crater
    const vendTex = canvas(256, 512, (x, w, h) => {
      x.fillStyle = "#f2f4f6"; x.fillRect(0, 0, w, h); x.fillStyle = "#0e2a4a"; x.fillRect(14, 14, w - 28, 300);
      const cols = ["#e64646","#f2c97a","#9fe6f5","#a8f0d0","#f2a8ec","#ffffff"];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++){ const cx = 30 + c*37, cy = 40 + r*95;
        x.fillStyle = cols[(r*2 + c) % 6]; x.fillRect(cx, cy, 22, 58); x.fillStyle = "#ddd"; x.fillRect(cx + 4, cy - 10, 14, 10);
        x.fillStyle = r === 1 && c === 2 ? "#ff4040" : "#45d38a"; x.fillRect(cx + 4, cy + 66, 14, 8); }
      x.fillStyle = "#1a1d22"; x.fillRect(30, 340, 196, 40); x.font = `700 26px "Hiragino Sans",sans-serif`;
      x.textAlign = "center"; x.fillStyle = "#cfe8ff"; x.fillText("つめた〜い", w/2, 368);
      x.fillStyle = "#2b2f36"; x.fillRect(40, 420, 176, 60);
      for (let i = 0; i < 160; i++){ x.fillStyle = `rgba(30,70,40,${rnd()*.3})`; x.fillRect(rnd()*w, rnd()*h, 6 + rnd()*30, 4 + rnd()*20); }
    });
    const vendFront = weather(new THREE.MeshStandardMaterial({map:vendTex, emissiveMap:vendTex, emissive:0xffffff, emissiveIntensity:.45, roughness:.35}), .6);
    const vendBody = paint(0xc9ced2);
    [[9.85, -27.4, -Math.PI/2, 0], [9.85, -26.2, -Math.PI/2, 0]].forEach(([x, z, ry, tilt]) => { /* SE corner: two machines side by side against the shop wall, facing the avenue */
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.9, .8), [vendBody, vendBody, vendBody, vendBody, vendFront, vendBody]);
      v.rotation.order = "YXZ"; v.position.set(x, gy(x, z) + 1.12, z); v.rotation.set(0, ry, tilt); streetG.add(v); });
    updaters.push(t => vendFront.emissiveIntensity = (.42 + .05*Math.sin(t*3)) * (Math.sin(t*.7)*Math.sin(t*5.1) > .9 ? .3 : 1));
    // traffic signal on the rim, leaning over the crater; the green ('ao') lamp still lit
    { const x = -9.6, z = CORE.z - 7, sig = new THREE.Group(); sig.position.set(x, gy(x, z), z); sig.rotation.set(0, -.6, -.2); /* NW corner, leaning over the crater */ streetG.add(sig);
      sig.add(at(cyl(.12, .14, 5.4, paint(0x8a8f86)), 0, 2.7, 0), at(box(2.6, .1, .1, paint(0x8a8f86)), 1.3, 5.1, 0));
      sig.add(at(box(1.7, .55, .35, paint(0x3a3f45)), 2.1, 4.75, 0));
      [[-.55, 0x19d6b0], [0, 0x3a3216], [.55, 0x3a1614]].forEach(([dx, c], i) => sig.add(at(new THREE.Mesh(new THREE.CircleGeometry(.2, 16), i === 0 ? lamp(c) : paint(c)), 2.1 + dx, 4.75, .18))); /* Japanese 'ao' (blue-green) is lit */
      const rg = glow(0x19d6b0, 2.4, .45); rg.position.set(1.55, 4.75, .5); sig.add(rg); }
    // round red post box, one street lamp, a fallen bicycle — a few things, placed around the rim
    { const x = -10.6, z = CORE.z + 7.8, y = gy(x, z); const red = paint(0xb8261e); /* SW corner */
      const pb = new THREE.Group(); pb.position.set(x, y, z); pb.rotation.z = -.12; streetG.add(pb);
      pb.add(at(cyl(.32, .32, 1.15, red, 20), 0, .58, 0), at(new THREE.Mesh(new THREE.SphereGeometry(.34, 20, 10, 0, Math.PI*2, 0, Math.PI/2), red), 0, 1.15, 0), at(box(.36, .05, .06, darkMetal), 0, .95, .3)); }
    prop(streetG, "street_lamp_01", 10.4, gy(10.4, CORE.z - 7.4), CORE.z - 7.4, {ry:-Math.PI/2, s:1.3}); /* NE corner */
    const lampHead = glow(0xbff5e4, 5, .35); lampHead.position.set(10.4, gy(10.4, CORE.z - 7.4) + 5, CORE.z - 7.4); streetG.add(lampHead);
    updaters.push(t => lampHead.material.opacity = .32 + .06*Math.sin(t*2));
    { const x = 9.3, z = -22.5, bike = new THREE.Group(); bike.position.set(x, gy(x, z) + .22, z); bike.rotation.set(-Math.PI/2 + .1, 0, 1.4); streetG.add(bike);
      const fr = paint(0x2f6f8f);
      for (const dx of [-.55, .55]) bike.add(at(new THREE.Mesh(new THREE.TorusGeometry(.33, .03, 6, 24), darkMetal), dx, 0, 0));
      const tube = (a, b) => { const d = b.clone().sub(a), m = cyl(.025, .025, d.length(), fr, 6); m.position.copy(a).lerp(b, .5); m.quaternion.setFromUnitVectors(new V3(0,1,0), d.normalize()); bike.add(m); };
      tube(new V3(-.55, 0, 0), new V3(-.05, 0, 0)); tube(new V3(-.05, 0, 0), new V3(.4, .45, 0)); tube(new V3(-.55, 0, 0), new V3(-.15, .45, 0));
      tube(new V3(-.15, .45, 0), new V3(.4, .45, 0)); tube(new V3(.55, 0, 0), new V3(.4, .45, 0)); tube(new V3(-.05, 0, 0), new V3(-.15, .45, 0)); }
    prop(streetG, "water_manhole_cover", -3.5, ground(-3.5, CORE.z + 15) + .08, CORE.z + 15, {s:1.2});
    prop(streetG, "plastic_crate_01", 9.8, gy(9.8, -28.6) + .17, -28.6, {s:1.5}); prop(streetG, "metal_trash_can", 9.9, gy(9.9, -25) + .17, -25, {node:"metal_trash_can_rust", s:1, ry:-Math.PI/2});
    prop(streetG, "concrete_road_barrier", -7.5, ground(-7.5, CORE.z + 11), CORE.z + 11, {ry:.2, rz:.1});
  }

  // instanced steel (crowns, frames, crane) + rubble from the city builder
  { const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), rust, beamM.length); beamM.forEach((m, i) => beams.setMatrixAt(i, m)); scene.add(beams);
    const rg = new THREE.IcosahedronGeometry(1, 1), rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++){ const k = .7 + .5*Math.abs(Math.sin(i*12.9898)*.8); rp.setXYZ(i, rp.getX(i)*k, rp.getY(i)*k*.6, rp.getZ(i)*k); }
    rg.computeVertexNormals(); const rubble = new THREE.InstancedMesh(rg, concrete, rubM.length); rubM.forEach((m, i) => rubble.setMatrixAt(i, m)); scene.add(rubble); }

  // kelp: real seaweed (dark, opaque, fogged), no glow
  for (const o of scene.children){
    if (!o.isInstancedMesh || !o.material.isShaderMaterial || !o.material.fragmentShader.includes("vec3(.95,.66,.93)")) continue;
    const m = o.material, uTime = m.uniforms.uTime;
    // kelp needs sunlight: keep it to the photic zone (roofs shallower than ~40 m); deep instances move up or vanish
    const shallow = tops.filter(t => t.y > -22 && t.y < -2), m4 = new THREE.Matrix4(), pp = new V3(), qq = new THREE.Quaternion(), ss = new V3();
    for (let i = 0; i < o.count; i++){ o.getMatrixAt(i, m4); m4.decompose(pp, qq, ss); if (ss.y === 0) continue; /* every kelp moves onto a sunlit roof of the planned city, or goes */
      const t = shallow[Math.floor(rnd()*shallow.length)];
      if (t && rnd() < .4){ pp.set(t.x + (rnd()-.5)*5, t.y, t.z + (rnd()-.5)*5); ss.set(1, .5 + rnd()*1.1, 1); } else ss.set(0, 0, 0);
      o.setMatrixAt(i, m4.compose(pp, qq, ss)); }
    o.instanceMatrix.needsUpdate = true;
    o.material = fogWrap(`uniform float uTime;varying float vY;varying float vX;varying float vS;attribute float aSeed;
      void main(){vec3 p=position;vY=uv.y;vX=uv.x;vS=aSeed;vec4 w=instanceMatrix*vec4(p,1.);w.x+=sin(uTime*1.2+aSeed*6.+uv.y*3.)*uv.y*uv.y*.9;
        vec4 mvPosition=viewMatrix*modelMatrix*w;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`, `varying float vY;varying float vX;varying float vS;
      void main(){ float wdt=.5*(1.-vY*.55)*(.75+.25*sin(vY*23.+vS*9.)); if(abs(vX-.5)>wdt) discard;
        vec3 base=mix(vec3(.05,.04,.015),vec3(.13,.1,.035),vS)*(.45+.75*vY); // Ecklonia / Eisenia: olive-brown kelp
        base*=.8+.25*smoothstep(0.,wdt,wdt-abs(vX-.5));
        gl_FragColor=vec4(base,1.);
        #include <fog_fragment>
      }`, {uTime}, {side:THREE.DoubleSide});
    m.dispose();
  }

  // fish: silver, countershaded (dark back, pale belly), lit by the scene instead of glowing; swim in schools, mostly shallow
  if (fish){
    const body = new THREE.SphereGeometry(1, 18, 10); body.scale(.34, .1, .045); body.translate(.04, 0, 0);
    const tailS = new THREE.Shape(); tailS.moveTo(-.26, 0); tailS.lineTo(-.46, .11); tailS.lineTo(-.41, 0); tailS.lineTo(-.46, -.11); tailS.lineTo(-.26, 0);
    const tail = new THREE.ShapeGeometry(tailS); const dorsal = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-.05, .08), new THREE.Vector2(.08, .08), new THREE.Vector2(-.1, .16)]));
    for (const g of [tail, dorsal]){ g.deleteAttribute("uv"); g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2), 2)); }
    const geo = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), dorsal.toNonIndexed()]);
    // sardine-like look: blue-green back, silver flanks/belly with a row of dark spots; the silver picks up the ambient water colour
    // (downwelling light tinted by the depth model) as a soft sheen, plus surface caustics flickering on the back near the top
    const FISH = { uTime: W.uTime, uWater: { value: new THREE.Color() } };
    const mat = new THREE.MeshStandardMaterial({color:0xffffff, metalness:.35, roughness:.38, side:THREE.DoubleSide});
    mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, FISH);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;varying vec3 vFp;varying vec3 vFw;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vFp=position;float tw=pow(clamp((.1-position.x)/.5,0.,1.),2.);transformed.z+=sin(uTime*9.+float(gl_InstanceID)*1.7)*tw*.07;`)
        .replace("#include <fog_vertex>", "#include <fog_vertex>\nvFw=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime;uniform vec3 uWater;varying vec3 vFp;varying vec3 vFw;")
        .replace("#include <map_fragment>", `#include <map_fragment>
float back=smoothstep(.0,.06,vFp.y);
vec3 silver=vec3(.78,.82,.84), dorsal=vec3(.05,.13,.15);
float spots=(1.-smoothstep(.009,.014,length(vec2(fract(vFp.x*22.)-.5,(vFp.y-.028)*22.)/22.)))*step(-.2,vFp.x)*step(vFp.x,.22);
diffuseColor.rgb=mix(silver,dorsal,back)*(1.-.6*spots);`)
        .replace("#include <opaque_fragment>", `{vec3 Vv=normalize(vViewPosition);float fres=pow(1.-abs(dot(normalize(normal),Vv)),2.5);
 float belly=1.-smoothstep(.0,.06,vFp.y);
 outgoingLight+=uWater*(.5+1.2*fres)*belly*1.4;
 float cz=exp(vFw.y/12.);float cs=pow(abs(sin(vFw.x*1.7+uTime*1.3)*sin(vFw.z*1.9-uTime*1.1)),6.);
 outgoingLight+=vec3(.6,.8,.85)*cs*cz*(1.-belly)*.35;}
#include <opaque_fragment>`); };
    updaters.push(() => FISH.uWater.value.copy(scene.background).multiplyScalar(1.6));
    fish.im.geometry.dispose(); fish.im.material.dispose(); fish.im.geometry = geo; fish.im.material = mat;
    const col = new THREE.Color();
    const fishScale = .8; const schools = Array.from({length:6}, () => ({ c: new V3((rnd()-.5)*30, -4 - rnd()*30, -12 - rnd()*22), r: 6 + rnd()*7, s: (.18 + rnd()*.12) * (rnd() < .5 ? -1 : 1), ph: rnd()*7 })); // sardine-like schools stay in the sunlit layer
    fish.p.forEach((f, i) => { const S = schools[i % schools.length];
      f.c.copy(S.c).add(new V3((rnd()-.5)*1.2, (rnd()-.5)*1, (rnd()-.5)*1.2)); f.r = S.r + (rnd()-.5)*1; f.s = S.s * (.98 + rnd()*.04); f.ph = S.ph + (rnd()-.5)*.22;
      fish.im.setColorAt(i, col.setRGB(.75 + rnd()*.2, .8 + rnd()*.15, .85 + rnd()*.15)); });
    fish.im.instanceColor.needsUpdate = true; fish.im.count = 60; // restrained: a few schools, not a cloud
  }

  // seabed: the core is a geothermal vent, so the life around it is vent life — tube worms with red plumes, not kelp
  {
    const n = 260, tubeG = new THREE.CylinderGeometry(.03, .05, 1, 6, 1, true); tubeG.translate(0, .5, 0);
    const plumeG = new THREE.SphereGeometry(.11, 8, 6); plumeG.scale(1, 1.5, 1);
    const tubes = new THREE.InstancedMesh(tubeG, weather(new THREE.MeshStandardMaterial({color:0x9c968a, roughness:.7, side:THREE.DoubleSide}), .4), n);
    const plumes = new THREE.InstancedMesh(plumeG, new THREE.MeshStandardMaterial({color:0x6e1a17, roughness:.85}), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++){
      const cl = Math.floor(rnd()*9), ca = cl/9*Math.PI*2 + .3, cr = 3.6 + (cl % 3)*1.3;
      const x = CORE.x + Math.cos(ca)*cr + (rnd()-.5)*1.6, z = CORE.z + Math.sin(ca)*cr*.8 + (rnd()-.5)*1.6, h = .35 + rnd()*1.2;
      e.set((rnd()-.5)*.35, 0, (rnd()-.5)*.35); q.setFromEuler(e);
      tubes.setMatrixAt(i, m4.compose(new V3(x, floor(x, z) - .1, z), q, new V3(1, h, 1)));
      plumes.setMatrixAt(i, m4.compose(new V3(x, floor(x, z) - .1, z).add(new V3(0, h, 0).applyQuaternion(q)), q, new V3(1, 1, 1).multiplyScalar(.55 + rnd()*.35)));
    }
    scene.add(tubes, plumes);
  }

  // ---------------- ecology by depth (night, Japanese coast; seabed modelled on Kagoshima Bay's shallow vent field) ----------------
  // Sources checked 2026-11-10:
  //  - Ecklonia cava (カジメ) beds: low-tide line to ~15-20 m, up to ~30 m (Tosa Bay, Shimoda, Miura studies) → kelp only on roofs above ~22 m
  //  - Lamellibrachia satsuma (サツマハオリムシ): 80-500 m, found at ~100 m in Kagoshima Bay; Wakamiko crater (~200 m) has "tagiri" gas venting
  //    → tube worms + white bacterial mats + rising gas bubbles at the seabed vent
  //  - Lanternfish migrate up at night (some into the upper 100 m); ventral photophores give downward blue-green counter-illumination
  //  - Copepod flashes peak ~490 nm, last ~1-2 s, triggered mechanically → rare, brief cyan flashes in the dark layer
  //  - Marine snow is most abundant near the surface and thins with depth; sinks only ~17-100 m/day → nearly still, slow drift down
  //  - Wreck fouling: diversity drops toward the deepest sections; sponges/anemones on mid-depth ledges
  {
    // plumose anemones on roofs/ledges in the dim layer
    const spots = tops.filter(t => t.y < -25 && t.y > -120); const n = Math.min(70, spots.length*4);
    if (n){
      const stalk = new THREE.CylinderGeometry(.09, .13, 1, 7); stalk.translate(0, .5, 0);
      const crown = new THREE.SphereGeometry(.2, 8, 6); crown.scale(1, .7, 1);
      const sm = weather(new THREE.MeshStandardMaterial({color:0xe9ddd0, roughness:.8}), .3), cm = new THREE.MeshStandardMaterial({color:0xf3e6d8, roughness:.9});
      const st = new THREE.InstancedMesh(stalk, sm, n), cr = new THREE.InstancedMesh(crown, cm, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
      for (let i = 0; i < n; i++){ const t = spots[i % spots.length], x = t.x + (rnd()-.5)*6, z = t.z + (rnd()-.5)*6, h = .3 + rnd()*.6, sc = .6 + rnd()*.8;
        q.setFromEuler(new THREE.Euler((rnd()-.5)*.3, 0, (rnd()-.5)*.3));
        st.setMatrixAt(i, m4.compose(new V3(x, t.y - .2, z), q, new V3(sc, h, sc)));
        cr.setMatrixAt(i, m4.compose(new V3(x, t.y - .2 + h, z), q, new V3(sc, sc, sc)));
        const c = rnd() < .7 ? col.setRGB(.95, .9, .85) : col.setRGB(.95, .55, .3); st.setColorAt(i, c); cr.setColorAt(i, c); }
      scene.add(st, cr);
    }

    // lanternfish: dark bodies with photophore rows (the only light they make), loose aggregations, slow
    const LN = 36, lg = new THREE.SphereGeometry(1, 10, 6); lg.scale(.11, .03, .02);
    const lm = fogWrap(`attribute float aS;varying vec3 vP;varying float vS;uniform float uTime;
      void main(){vP=position;vS=aS;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`, `varying vec3 vP;varying float vS;uniform float uTime;
      void main(){ float dots=step(.55,fract(vP.x*90.))*step(vP.y,-.008)*step(abs(vP.z),.014);
        float on=.55+.45*sin(uTime*.7+vS*30.);
        gl_FragColor=vec4(vec3(.012,.014,.02)+vec3(.25,.65,1.)*dots*on*2.2,1.);
        #include <fog_fragment>
      }`, {uTime:W.uTime});
    lg.setAttribute("aS", new THREE.InstancedBufferAttribute(new Float32Array(LN).map(() => rnd()), 1));
    const lf = new THREE.InstancedMesh(lg, lm, LN); lf.frustumCulled = false; scene.add(lf);
    const lp = Array.from({length:LN}, (_, i) => { const g = Math.floor(i/12); return {c:new V3((rnd()-.5)*30 + (g-1)*9, -45 - g*25 - rnd()*15, -14 - rnd()*24), r:2 + rnd()*5, s:(.05 + rnd()*.08)*(rnd()<.5?-1:1), ph:rnd()*7}; });
    const d = new THREE.Object3D();
    updaters.push(t => { lp.forEach((f, i) => { const a = t*f.s + f.ph; d.position.set(f.c.x + Math.cos(a)*f.r, f.c.y + Math.sin(t*.3 + f.ph)*.8, f.c.z + Math.sin(a)*f.r*.6);
      d.rotation.set(0, -a + (f.s > 0 ? -Math.PI/2 : Math.PI/2), 0); d.updateMatrix(); lf.setMatrixAt(i, d.matrix); }); lf.instanceMatrix.needsUpdate = true; });

    // planktonic bioluminescence: brief blue-green flashes, only below ~80 m
    const PN = 160, pp = new Float32Array(PN*3), ps = new Float32Array(PN);
    for (let i = 0; i < PN; i++){ pp[i*3] = (rnd()-.5)*50; pp[i*3+1] = -80 - rnd()*92; pp[i*3+2] = 2 - rnd()*40; ps[i] = rnd(); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pp, 3)); pg.setAttribute("aS", new THREE.BufferAttribute(ps, 1));
    const pm = new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms:{uTime:W.uTime},
      vertexShader:`uniform float uTime;attribute float aS;varying float vF;
        void main(){float ph=fract(uTime*(.03+aS*.03)+aS*17.);float tt=ph*25.;vF=tt<.08?tt/.08:exp(-(tt-.08)*2.2)*step(tt,3.); /* ~0.1 s rise, ~1-2 s decay, rare */vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_PointSize=(2.+aS*3.)*40./-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float vF;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(0.,.5,d))*vF;gl_FragColor=vec4(vec3(.25,.78,1.)*a,a);}`});
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; scene.add(pts);

    // bacterial mats around the vent
    const mt = canvas(256, 256, (x, w) => { for (let i = 0; i < 900; i++){ const a = rnd()*Math.PI*2, r = Math.pow(rnd(), .6)*118;
      x.fillStyle = `rgba(235,235,225,${.05 + rnd()*.18})`; x.beginPath(); x.arc(128 + Math.cos(a)*r, 128 + Math.sin(a)*r, 2 + rnd()*9, 0, 7); x.fill(); } });
    for (let k = 0; k < 4; k++){ const a = k*1.7 + .4, r = 6.5 + k*.8, x = CORE.x + Math.cos(a)*r, z = CORE.z + Math.sin(a)*r*.8;
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(4 + rnd()*3, 4 + rnd()*3), new THREE.MeshStandardMaterial({map:mt, transparent:true, depthWrite:false, roughness:1, color:0xffffff}));
      mat.rotation.x = -Math.PI/2; mat.position.set(x, floor(x, z) + .05, z); scene.add(mat); }

    // "tagiri": gas bubbles rising from a few vent openings beside the core
    { const BN = 90, bp = new Float32Array(BN*3), bs = new Float32Array(BN), vents = [[-3.5, -1.5], [4, 1], [1.5, -4.5]];
      for (let i = 0; i < BN; i++){ const v = vents[i % 3]; bp[i*3] = CORE.x + v[0]; bp[i*3+1] = rnd()*40; bp[i*3+2] = CORE.z + v[1]; bs[i] = rnd(); }
      const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(bp, 3)); bg.setAttribute("aS", new THREE.BufferAttribute(bs, 1));
      const bm = new THREE.ShaderMaterial({transparent:true, depthWrite:false, uniforms:{uTime:W.uTime, uBase:{value:ground(CORE.x, CORE.z)}},
        vertexShader:`uniform float uTime,uBase;attribute float aS;varying float vA;
          void main(){vec3 p=position;float h=mod(p.y+uTime*(1.2+aS*.8),40.);p.y=uBase+h;p.x+=sin(h*1.3+aS*9.)*.15*h/10.;p.z+=cos(h*1.1+aS*5.)*.15*h/10.;
            vA=(1.-smoothstep(25.,40.,h))*.55;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(1.5+aS*2.5)*30./-mv.z;gl_Position=projectionMatrix*mv;}`,
        fragmentShader:`varying float vA;void main(){float d=length(gl_PointCoord-.5);float ring=smoothstep(.5,.38,d)*(.35+.65*smoothstep(.2,.42,d));
          if(ring<.01) discard;gl_FragColor=vec4(vec3(.75,.9,.92),ring*vA);}`});
      const bub = new THREE.Points(bg, bm); bub.frustumCulled = false; scene.add(bub); }

    // marine snow: sinks very slowly (it was rising), densest near the surface; it is lit debris, not light
    const snow = keep.find(o => o.isPoints);
    if (snow){ const sm = snow.material;
      sm.vertexShader = sm.vertexShader.replace("p.y=-176.+mod(p.y+176.+uTime*(.4+aS*1.2),175.);", "p.y=-176.+mod(p.y+176.-uTime*(.015+aS*.03),175.);vD=clamp(-p.y/150.,0.,1.);")
        .replace("varying float vA;", "varying float vA;varying float vD;");
      sm.fragmentShader = sm.fragmentShader.replace("varying float vA;", "varying float vA;varying float vD;").replace("*vA*uVis;", "*vA*uVis*(.6-.42*vD);")
        .replace("vec3(.85,.95,1.)", "vec3(.7,.78,.8)");
      sm.needsUpdate = true; }
  }

  // nothing lit at the surface: drop the antenna beacons above the water
  for (const o of [...scene.children]) if (o.isMesh && o.material?.isMeshBasicMaterial && o.geometry?.type === "SphereGeometry" && o.position.y > -2 && o.parent === scene && !keep.includes(o)) scene.remove(o);

  // ---------------- per-frame ----------------
  let pulseStart = 0; flareNow = 0;
  return {
    update(t, camY){
      const period = monday ? 6.5 : 12;
      P.uPower.value += ((monday ? 1.8 : 1) - P.uPower.value) * .02;
      const ph = reduce ? 1 : ((t - pulseStart) % period) / period;
      P.uPulseR.value = ph < .7 ? (ph / .7) * 230 : 1e4;
      W.uTime.value = t;
      // core flares as the pulse leaves
      const flare = ph < .08 ? 1 - ph/.08 : 0, halo = core.children.find(c => c.isSprite); flareNow = flare; coreShell.uTime.value = t; coreShell.uFlare.value = flare; coreShell.uPower.value = P.uPower.value;
      if (halo){ halo.scale.setScalar(8 * (1 + .35*flare) * (monday ? 1.15 : 1)); halo.material.opacity = .55; }
      for (const u of updaters) u(t);
    },
    setMonday(v){ monday = v; },
  };
}
