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
  const CORE = core.position.clone();
  const updaters = [], groups = [];

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
  const tex = (file, srgb) => { const t = texCache[file] ??= texL.load(`./assets/textures/${file}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // Poly Haven "arm" = AO / roughness / metalness in R / G / B — exactly three's aoMap / roughnessMap / metalnessMap channels
  function pbr(id, rx = 1, ry = 1, o = {}){
    const rp = t => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
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
  // 1. NEXT SESSION — ruined tower beside the Next-session text (screen removed)
  // ======================================================================
  const scrG = group("screen", -65, 40);
  const SCR = new V3(20, -15, -30);
  let scrMat;
  {
    const top = -3, b = block(12, top - SEABED, 8, .61); b.position.set(0, SEABED - SCR.y, 0); scrG.add(b);
    scrG.position.copy(SCR); scrG.rotation.y = -.56; scrG.userData.clearToCam = true;
    // (the street screen / LED board was removed 2026-11-10: the Next-session text already carries that information)
    prop(scrG, "modular_airduct_circular_01", 5.5, -5.5, 4.2, {s:1.4, ry:Math.PI/2, rz:.1});
  }

  // ======================================================================
  // 2. MONDAY LIST — elevated railway that broke and slid down
  // ======================================================================
  const trainG = group("train", -115, -5);
  {
    const spans = [ [new V3(-46, -40, -44), new V3(-2, -45, -40)], [new V3(5, -55, -41), new V3(42, -84, -50)] ];
    const deckW = 6.5;
    for (const [a, b] of spans){
      const dir = b.clone().sub(a), len = dir.length(), mid = a.clone().add(b).multiplyScalar(.5);
      const deckMat = pbr("concrete_moss", len/5, 1.2), deck = box(len, 1.3, deckW, deckMat); deck.position.copy(mid);
      deck.quaternion.setFromUnitVectors(new V3(1,0,0), dir.clone().normalize()); trainG.add(deck);
      for (const s of [-1, 1]){ const lip = box(len, .6, .25, deckMat); lip.position.set(0, .9, s*(deckW/2 - .12)); deck.add(lip); }
      for (const s of [-.8, .8]){ const rail = box(len, .15, .12, rust); rail.position.set(0, .72, s); deck.add(rail); }
      // catenary masts along the deck
      for (let f = .08; f < 1; f += .22){ const m = new THREE.Group(); m.position.set(-len/2 + f*len, .6, -deckW/2 + .3); deck.add(m);
        m.add(at(box(.18, 6, .18, rust), 0, 3, 0)); m.add(at(box(.12, .12, deckW*.75, rust), 0, 5.6, deckW*.35)); }
      // piers down to the seabed
      for (let f = .15; f < 1; f += .35){ const p = a.clone().lerp(b, f), h = p.y - .65 - ground(p.x, p.z);
        trainG.add(at(box(2.4, h, 2.4, concrete), p.x, ground(p.x, p.z) + h/2, p.z)); }
    }
    // commuter train cars: canvas livery with a stripe and a few emergency-lit windows
    const carLen = 13.5, carH = 3.5, carW = 2.9;
    const side = (lit) => canvas(1024, 256, (x, w, h) => {
      x.fillStyle = "#8d949c"; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++){ x.fillStyle = `rgba(${20+rnd()*30},${40+rnd()*40},${30+rnd()*20},${rnd()*.25})`; x.fillRect(rnd()*w, rnd()*h, 4+rnd()*40, 2+rnd()*30); }
      x.fillStyle = "#b8743a"; x.fillRect(0, h*.68, w, h*.07);
      const doors = [.12, .37, .63, .88];
      for (let i = 0; i < 10; i++){ const cx = (i + .5)/10*w; if (doors.some(d => Math.abs(d*w - cx) < 40)) continue;
        x.fillStyle = lit.includes(i) ? "#4a3520" : "#0b0e14"; x.fillRect(cx - 34, h*.2, 68, h*.36); }
      for (const d of doors){ x.fillStyle = "#6c737b"; x.fillRect(d*w - 30, h*.12, 60, h*.8); x.fillStyle = "#0b0e14"; x.fillRect(d*w - 22, h*.2, 18, h*.3); x.fillRect(d*w + 4, h*.2, 18, h*.3); }
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(10,30,20,.0)"); g.addColorStop(1, "rgba(10,30,20,.55)"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    const emis = (lit) => canvas(1024, 256, (x, w, h) => { x.fillStyle = "#000"; x.fillRect(0, 0, w, h);
      for (const i of lit){ if (i < 0) continue; const cx = (i + .5)/10*w; x.fillStyle = "#6e5233"; x.fillRect(cx - 34, h*.2, 68, h*.36); } });
    const endTex = canvas(256, 256, (x, w, h) => { x.fillStyle = "#8d949c"; x.fillRect(0, 0, w, h); x.fillStyle = "#0b0e14"; x.fillRect(20, 40, 216, 90);
      x.fillStyle = "#b8743a"; x.fillRect(0, h*.68, w, h*.07); x.fillStyle = "#2a2e34"; x.fillRect(100, 140, 56, 110); });
    const detail = (rx, ry) => { const n = tex("rusty_painted_metal_nor_gl").clone(), a = tex("rusty_painted_metal_arm").clone(); for (const t of [n, a]){ t.repeat.set(rx, ry); t.needsUpdate = true; } return {normalMap:n, roughnessMap:a, metalnessMap:a, roughness:1, metalness:.8}; };
    const topMat = pbr("rusty_metal_02", 4, 1, {metal:true});
    const endMat = weather(new THREE.MeshStandardMaterial({map:endTex, ...detail(1, 1)}));
    const car = (lit) => { const sm = weather(new THREE.MeshStandardMaterial({map:side(lit), emissiveMap:emis(lit), emissive:0xffffff, emissiveIntensity:.5, ...detail(4, 1)}));
      const m = new THREE.Mesh(new THREE.BoxGeometry(carLen, carH, carW), [endMat, endMat, topMat, topMat, sm, sm]);
      const pan = at(box(1.6, .08, 1.4, rust), 2, carH/2 + .6, 0); m.add(pan, at(box(.08, .6, .08, rust), 2, carH/2 + .3, 0));
      return m; };
    const place = (m, a, b, f, roll = 0) => { const dir = b.clone().sub(a).normalize(), p = a.clone().lerp(b, f);
      m.quaternion.setFromUnitVectors(new V3(1,0,0), dir); m.rotateX(roll);
      m.position.copy(p).add(new V3(0, .65 + carH/2 + .25, 0).applyQuaternion(m.quaternion)); trainG.add(m); };
    const [s1, s2] = spans;
    place(car([2, 7]), s1[0], s1[1], .2);
    place(car([1, 4, 8, -1]), s1[0], s1[1], .52);
    place(car([6]), s1[0], s1[1], .84, -.05);
    // the car that went over the edge, hanging between the two spans
    const hang = car([3, 5, -1]); hang.position.set(4, -51, -40.5); hang.rotation.set(.12, .08, -1.0); trainG.add(hang);
    place(car([0, 9]), s2[0], s2[1], .45, .22);
    // emergency light inside the hanging car (power from the core reaches here)
    const el = glow(C(DS.lantern), 6, .12); el.position.set(4, -51, -38.5); trainG.add(el);
    updaters.push(t => el.material.opacity = .1 + .04*Math.sin(t*1.7));
  }

  // ======================================================================
  // 3. LABS — flooded server floor, racks still blinking
  // ======================================================================
  const labG = group("lab", -150, -55);
  const LAB = new V3(-19, -105, -31);
  {
    labG.position.copy(LAB); labG.rotation.y = .55; labG.userData.clearToCam = true;
    const W = 18, D = 10, H = 4.2;
    const below = block(W, LAB.y - SEABED - .4, D, .83); below.position.set(0, SEABED - LAB.y, 0); labG.add(below);
    const above = block(W, 2.5 - (LAB.y + H + .4), D, .21); // reaches just above the water: an unlit ruin in the surface skyline above.position.set(0, H + .4, 0); labG.add(above);
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
  // 4. SEABED — a Japanese street corner around the core
  // ======================================================================
  const streetG = group("street", -260, -110);
  {
    const gy = (x, z) => ground(x, z);
    // road + crosswalk
    const road = new THREE.Mesh(new THREE.PlaneGeometry(120, 9), pbr("asphalt_02", 30, 2.25));
    road.rotation.x = -Math.PI/2; road.position.set(0, gy(0, -36) + .05, -36); streetG.add(road);
    const stripe = pbr("asphalt_02", .3, 2, {noMap:true, color:0x9aa39e});
    for (let i = 0; i < 6; i++) streetG.add(at(box(.5, .04, 7, stripe), -10 + i*1.1, gy(-8, -36) + .1, -36));
    for (const z of [-31.3, -40.7]) for (let x = -50; x < 50; x += 4) streetG.add(at(box(2.2, .04, .15, stripe), x, gy(x, z) + .1, z));
    // shop row with roller shutters
    const shopZ = -48;
    for (let i = 0; i < 4; i++){ const x = -21 + i*12, h = 6 + (i%2)*3.5; const b = block(11, h, 6, .1 + i*.2); b.position.set(x, gy(x, shopZ) - .5, shopZ - 3); streetG.add(b);
      prop(streetG, "rollershutter_door", x - 2.5, gy(x, shopZ) - .2, shopZ + .05, {node:"rollershutter_door", s:1.4});
      prop(streetG, "rollershutter_door", x + 1.2, gy(x, shopZ) - .2, shopZ + .05, {node:"rollershutter_door", s:1.4}); }
    // vending machines (fictional), lit by core power
    const vendTex = canvas(256, 512, (x, w, h) => {
      x.fillStyle = "#f2f4f6"; x.fillRect(0, 0, w, h); x.fillStyle = "#0e2a4a"; x.fillRect(14, 14, w - 28, 300);
      const cols = ["#e64646","#f2c97a","#9fe6f5","#a8f0d0","#f2a8ec","#ffffff"];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++){ const cx = 30 + c*37, cy = 40 + r*95;
        x.fillStyle = cols[(r*2 + c) % 6]; x.fillRect(cx, cy, 22, 58); x.fillStyle = "#ddd"; x.fillRect(cx + 4, cy - 10, 14, 10);
        x.fillStyle = r === 1 && c === 2 ? "#ff4040" : "#45d38a"; x.fillRect(cx + 4, cy + 66, 14, 8); }
      x.fillStyle = "#1a1d22"; x.fillRect(30, 340, 196, 40); x.fillStyle = "#1c6dd0"; x.font = `700 26px "Hiragino Sans",sans-serif`;
      x.textAlign = "center"; x.fillStyle = "#cfe8ff"; x.fillText("つめた〜い", w/2, 368);
      x.fillStyle = "#2b2f36"; x.fillRect(40, 420, 176, 60);
      for (let i = 0; i < 160; i++){ x.fillStyle = `rgba(30,70,40,${rnd()*.3})`; x.fillRect(rnd()*w, rnd()*h, 6 + rnd()*30, 4 + rnd()*20); }
    });
    const vendFront = weather(new THREE.MeshStandardMaterial({map:vendTex, emissiveMap:vendTex, emissive:0xffffff, emissiveIntensity:.45, roughness:.35}), .6);
    const vendBody = paint(0xc9ced2);
    const vendors = [];
    [[9.2, -42.6, -.15, 0], [10.4, -42.8, -.15, 1]].forEach(([x, z, ry, i]) => {
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.9, .8), [vendBody, vendBody, vendBody, vendBody, vendFront, vendBody]);
      v.position.set(x, gy(x, z) + .95, z); v.rotation.y = ry; if (i) v.rotation.z = -.08; streetG.add(v); vendors.push(v);
      const g = glow(0xcfe8ff, 4, .12); g.position.set(x, gy(x, z) + 1.2, z + .9); streetG.add(g);
    });
    updaters.push(t => vendFront.emissiveIntensity = (.42 + .05*Math.sin(t*3)) * (Math.sin(t*.7)*Math.sin(t*5.1) > .9 ? .3 : 1));
    // round red post box
    { const x = -12, z = -41.5, y = gy(x, z); const red = paint(0xb8261e);
      streetG.add(at(cyl(.32, .32, 1.15, red, 20), x, y + .58, z), at(new THREE.Mesh(new THREE.SphereGeometry(.34, 20, 10, 0, Math.PI*2, 0, Math.PI/2), red), x, y + 1.15, z),
        at(box(.36, .05, .06, darkMetal), x, y + .95, z + .3)); }
    // traffic signal (horizontal, Japanese style), red still lit
    { const x = -6.5, z = -31, y = gy(x, z), sig = new THREE.Group(); sig.position.set(x, y, z); sig.rotation.z = .12; streetG.add(sig);
      sig.add(at(cyl(.12, .14, 5.4, paint(0x8a8f86)), 0, 2.7, 0), at(box(2.6, .1, .1, paint(0x8a8f86)), 1.3, 5.1, 0));
      const hous = at(box(1.7, .55, .35, paint(0x3a3f45)), 2.1, 4.75, 0); sig.add(hous);
      [[-.55, 0x1e3a33], [0, 0x3a3216], [.55, 0xff3b30]].forEach(([dx, c], i) => { const l = at(new THREE.Mesh(new THREE.CircleGeometry(.2, 16), i === 2 ? lamp(c) : paint(c)), 2.1 + dx, 4.75, .18); sig.add(l); });
      const rg = glow(0xff3b30, 3, .6); rg.position.set(2.65, 4.75, .5); sig.add(rg); }
    // street lamps (powered)
    const lampHeads = [];
    for (const [x, z, ry] of [[-16, -31.2, Math.PI/2], [15, -31.2, -Math.PI/2]]){ prop(streetG, "street_lamp_01", x, gy(x, z), z, {ry, s:1.3});
      const g = glow(0xbff5e4, 6, .45); g.position.set(x, gy(x, z) + 5, z); streetG.add(g); lampHeads.push(g); }
    // fallen bicycle
    { const x = 5.5, z = -32.5, bike = new THREE.Group(); bike.position.set(x, gy(x, z) + .05, z); bike.rotation.set(-Math.PI/2 + .1, 0, .6); streetG.add(bike);
      const fr = paint(0x2f6f8f);
      for (const dx of [-.55, .55]) bike.add(at(new THREE.Mesh(new THREE.TorusGeometry(.33, .03, 6, 24), darkMetal), dx, 0, 0));
      const tube = (a, b) => { const d = b.clone().sub(a), m = cyl(.025, .025, d.length(), fr, 6); m.position.copy(a).lerp(b, .5); m.quaternion.setFromUnitVectors(new V3(0,1,0), d.normalize()); bike.add(m); };
      tube(new V3(-.55, 0, 0), new V3(-.05, 0, 0)); tube(new V3(-.05, 0, 0), new V3(.4, .45, 0)); tube(new V3(-.55, 0, 0), new V3(-.15, .45, 0));
      tube(new V3(-.15, .45, 0), new V3(.4, .45, 0)); tube(new V3(.55, 0, 0), new V3(.4, .45, 0)); tube(new V3(-.05, 0, 0), new V3(-.15, .45, 0)); }
    // CC0 street clutter
    prop(streetG, "water_manhole_cover", -2, gy(-2, -35) + .03, -35, {s:1.2});
    prop(streetG, "water_manhole_cover", 13, gy(13, -37) + .03, -37, {s:1.2, ry:.7});
    prop(streetG, "utility_box_02", 12.4, gy(12.4, -43), -43.6, {s:1.2});
    prop(streetG, "metal_trash_can", 7.6, gy(7.6, -43), -43, {node:"metal_trash_can_rust", s:1.1, ry:.3});
    prop(streetG, "plastic_crate_01", 8, gy(8, -41.6), -41.6, {s:1.5, ry:.6});
    prop(streetG, "plastic_crate_01", 8.2, gy(8, -41.6) + .38, -41.6, {s:1.5, ry:.2});
    prop(streetG, "plastic_crate_01", -14, gy(-14, -43), -43, {s:1.5, ry:.9, rz:1.4});
    prop(streetG, "old_tyre", -9, gy(-9, -33) + .1, -33, {rx:-Math.PI/2 + .2, s:1.2});
    prop(streetG, "concrete_road_barrier", 18, gy(18, -36), -36, {ry:.3, rz:.25});
    prop(streetG, "concrete_road_barrier", -19, gy(-19, -35), -35, {ry:-.2});
    updaters.push(t => lampHeads.forEach((g, i) => g.material.opacity = .4 + .08*Math.sin(t*2 + i*2)));
  }

  const __removed = [], __zones = [];
  // ---------------- make room: drop procedural ruins (and their beams/kelp/cables) inside each landmark's footprint ----------------
  {
    const mine = new Set(groups), skip = new Set([core, ...keep]);
    const zones = groups.map(g => { g.updateMatrixWorld(true); const z = new THREE.Box3().setFromObject(g).expandByScalar(1.5); if (g.userData.clearToCam) z.max.z = -8; return z; });
    const hit = b => zones.some(z => z.intersectsBox(b)), removed = __removed; __zones.push(...zones);
    const bb = new THREE.Box3(), m4 = new THREE.Matrix4(), p = new V3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const o of [...scene.children]){
      if (mine.has(o) || skip.has(o) || !o.isMesh) continue;
      const own = o.material === ruinMat || o.material === rustMat || o.material === cableMat || (o.material.isMeshBasicMaterial && o.geometry?.type === "SphereGeometry");
      if (o.isInstancedMesh){
        let n = 0; for (let i = 0; i < o.count; i++){ o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); if (zones.some(z => z.containsPoint(p))){ o.setMatrixAt(i, zero); n++; } }
        if (n) o.instanceMatrix.needsUpdate = true; continue;
      }
      if (!o.geometry) continue;
      if (!own) continue; o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (o.material !== ruinMat) continue; // buildings first; their antennas/cables are handled below
      if (hit(bb)){ removed.push(bb.clone().expandByScalar(2)); scene.remove(o); const i = tops.findIndex(t => Math.abs(t.x - o.position.x) < .01 && Math.abs(t.z - o.position.z) < .01); if (i >= 0) tops.splice(i, 1); }
    }
  }

  // second pass: antennas, beacons and tower-to-tower cables that hung off a removed building
  {
    const bb = new THREE.Box3();
    for (const o of [...scene.children]){
      if (!o.isMesh || o.isInstancedMesh || keep.includes(o) || o === core) continue;
      const own = o.material === rustMat || o.material === cableMat || (o.material.isMeshBasicMaterial && o.geometry?.type === "SphereGeometry");
      if (!own) continue; o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (__removed.some(r => r.intersectsBox(bb)) || __zones.some(z => z.intersectsBox(bb))) scene.remove(o);
    }
  }

  // kelp: real seaweed (dark, opaque, fogged), no glow
  for (const o of scene.children){
    if (!o.isInstancedMesh || !o.material.isShaderMaterial || !o.material.fragmentShader.includes("vec3(.95,.66,.93)")) continue;
    const m = o.material, uTime = m.uniforms.uTime;
    // kelp needs sunlight: keep it to the photic zone (roofs shallower than ~40 m); deep instances move up or vanish
    const shallow = tops.filter(t => t.y > -22 && t.y < -2), m4 = new THREE.Matrix4(), pp = new V3(), qq = new THREE.Quaternion(), ss = new V3();
    for (let i = 0; i < o.count; i++){ o.getMatrixAt(i, m4); m4.decompose(pp, qq, ss); if (pp.y > -22 || ss.y === 0) continue;
      const t = shallow[Math.floor(rnd()*shallow.length)];
      if (t && rnd() < .45){ pp.set(t.x + (rnd()-.5)*5, t.y, t.z + (rnd()-.5)*5); ss.set(1, .5 + rnd()*1.1, 1); } else ss.set(0, 0, 0);
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
    const mat = new THREE.MeshStandardMaterial({color:0xffffff, metalness:.75, roughness:.32, side:THREE.DoubleSide, envMapIntensity:.6});
    mat.onBeforeCompile = sh => { sh.uniforms.uTime = W.uTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;varying float vFy;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
vFy=position.y;float tw=pow(clamp((.1-position.x)/.5,0.,1.),2.);transformed.z+=sin(uTime*9.+float(gl_InstanceID)*1.7)*tw*.07;`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFy;")
        .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb*=mix(vec3(.9,.95,1.),vec3(.12,.16,.2),smoothstep(-.01,.06,vFy));"); };
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
      const cl = Math.floor(rnd()*9), ca = cl/9*Math.PI*2 + .3, cr = 3.4 + (cl % 3)*1.6;
      const x = CORE.x + Math.cos(ca)*cr + (rnd()-.5)*1.6, z = CORE.z + Math.sin(ca)*cr*.8 + (rnd()-.5)*1.6, h = .35 + rnd()*1.2;
      e.set((rnd()-.5)*.35, 0, (rnd()-.5)*.35); q.setFromEuler(e);
      tubes.setMatrixAt(i, m4.compose(new V3(x, ground(x, z) - .1, z), q, new V3(1, h, 1)));
      plumes.setMatrixAt(i, m4.compose(new V3(x, ground(x, z) - .1, z).add(new V3(0, h, 0).applyQuaternion(q)), q, new V3(1, 1, 1).multiplyScalar(.55 + rnd()*.35)));
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
    for (let k = 0; k < 4; k++){ const a = k*1.7 + .4, r = 3 + k*1.3, x = CORE.x + Math.cos(a)*r, z = CORE.z + Math.sin(a)*r*.8;
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(4 + rnd()*3, 4 + rnd()*3), new THREE.MeshStandardMaterial({map:mt, transparent:true, depthWrite:false, roughness:1, color:0xffffff}));
      mat.rotation.x = -Math.PI/2; mat.position.set(x, ground(x, z) + .03, z); scene.add(mat); }

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
  let pulseStart = 0;
  return {
    update(t, camY){
      const period = monday ? 6.5 : 12;
      P.uPower.value += ((monday ? 1.8 : 1) - P.uPower.value) * .02;
      const ph = reduce ? 1 : ((t - pulseStart) % period) / period;
      P.uPulseR.value = ph < .7 ? (ph / .7) * 230 : 1e4;
      W.uTime.value = t;
      // core flares as the pulse leaves
      const flare = ph < .08 ? 1 - ph/.08 : 0, halo = core.children.find(c => c.isSprite);
      if (halo) halo.scale.setScalar(18 * (1 + .35*flare) * (monday ? 1.15 : 1));
      for (const u of updaters) u(t);
    },
    setMonday(v){ monday = v; },
  };
}
