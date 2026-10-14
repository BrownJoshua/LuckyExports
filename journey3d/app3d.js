/* Lucky Exports: order journey in 3D (Three.js, low-poly).
   A scroll-scrubbed film: everything on screen is a pure function of the scroll progress p (0..1),
   plus a little ambient motion (water, smoke, clouds). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var sm = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  var seg = function (p, a, b) { return sm((p - a) / (b - a)); };
  var lin = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var rad = Math.PI / 180;
  var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };
  var seed = 7; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  /* ---------- fall back to the 2D version when WebGL is not available ---------- */
  function fallback() {
    var h = $('fb2d').textContent.replace(/<\\\/script>/g, '</scr' + 'ipt>');
    document.open(); document.write(h); document.close();
  }
  if (typeof THREE === 'undefined') return fallback();
  var FORCE = /[?&]force3d/.test(location.search);
  var canvas = $('gl'), renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return fallback(); }
  if (!renderer.getContext()) return fallback();

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1600);
  scene.fog = new THREE.Fog(0xbcd8ee, 120, 700);

  /* ============================== helpers ============================== */
  var WL = -0.5, QY = 0.4;                // water level, quay height
  function M(hex, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: o.r === undefined ? .8 : o.r, metalness: o.m || 0, emissive: o.e || 0x000000, emissiveIntensity: o.ei || 1, transparent: !!o.t, opacity: o.o === undefined ? 1 : o.o });
  }
  function add(parent, mesh, x, y, z, shadow) {
    mesh.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) { mesh.castShadow = true; mesh.receiveShadow = true; }
    if (parent) parent.add(mesh);
    return mesh;
  }
  function box(parent, w, h, d, mat, x, y, z, shadow) { return add(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, shadow); }
  function cyl(parent, rt, rb, h, seg_, mat, x, y, z, shadow) { return add(parent, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg_ || 8), mat), x, y, z, shadow); }
  function texCanvas(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); draw(g, w, h); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  var dummy = new THREE.Object3D();

  /* ============================== sky, sun, moon, stars ============================== */
  var skyU = { uTop: { value: new THREE.Color(0x4fa6e0) }, uBot: { value: new THREE.Color(0xd3ecf7) } };
  var sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uBot; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.6+0.08,0.,1.); vec3 c = mix(uBot,uTop,pow(h,.7)); gl_FragColor = vec4(c,1.);\n #include <tonemapping_fragment>\n #include <encodings_fragment>\n }'
  }));
  sky.renderOrder = -10; scene.add(sky);
  var starGeo = new THREE.BufferGeometry(), sp = [];
  for (var i = 0; i < 700; i++) { var th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * .9 + .08); sp.push(Math.sin(ph) * Math.cos(th) * 1100, Math.cos(ph) * 1100, Math.sin(ph) * Math.sin(th) * 1100); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));
  function glowTex(inner, outer) { return texCanvas(128, 128, function (g, w, h) { var r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(.35, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, w, h); }); }
  var sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,248,214,1)', 'rgba(255,200,120,0)'), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  sunSpr.scale.set(230, 230, 1); scene.add(sunSpr);
  var moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(235,242,255,1)', 'rgba(170,190,255,0)'), fog: false, depthWrite: false, transparent: true, opacity: 0 }));
  moonSpr.scale.set(120, 120, 1); scene.add(moonSpr);

  /* ============================== lights ============================== */
  var hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8f55, .7); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);
  var moon = new THREE.DirectionalLight(0x9db6ff, 0); scene.add(moon);

  /* ============================== ground, sea, roads ============================== */
  var grassM = M(0x72b455), sandM = M(0xe3cf9a), concM = M(0xaab3b9), asphM = M(0x4a4f56, { r: .95 });
  box(scene, 240, 2, 150, grassM, -30, -1, -15, false).receiveShadow = true;           // west land
  box(scene, 460, 2, 83, grassM, 320, -1, -49, false).receiveShadow = true;            // land behind the sea
  box(scene, 160, 2.4, 28, concM, 130, QY - 1.2, -21.5).castShadow = false;            // port quay
  box(scene, 130, 2.4, 28, concM, 405, QY - 1.2, -21.5).castShadow = false;            // destination quay
  box(scene, 150, 1.6, 4, sandM, 250, -.8, -9, false);                                 // beach strip
  [60, 90, 150, 210, 270].forEach(function (x) { /* quay seams */ });
  for (var q = 0; q < 2; q++) { var qx0 = q ? 340 : 70; for (var sx = qx0; sx < qx0 + 128; sx += 8) box(scene, .12, .02, 26, M(0x8b949a), sx, QY + .01, -21.5, false); }
  // rails for the crane
  [[-12.5], [-28.5]].forEach(function (zz) { box(scene, 150, .12, .35, M(0x4a4f56), 130, QY + .06, zz[0], false); box(scene, 120, .12, .35, M(0x4a4f56), 405, QY + .06, zz[0], false); });

  var waterU = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(0xfff1d6) },
    uDeep: { value: new THREE.Color(0x0d5278) }, uShallow: { value: new THREE.Color(0x2c93b8) }, uSky: { value: new THREE.Color(0xbcd8ee) },
    uFogCol: { value: new THREE.Color(0xbcd8ee) }, uFogNear: { value: 120 }, uFogFar: { value: 700 }
  };
  var waveGLSL = 'float wave(vec2 p, float t){ return sin(p.x*0.11+t*0.9)*0.55 + sin(p.y*0.17-t*0.7+p.x*0.05)*0.35 + sin((p.x+p.y)*0.23+t*1.3)*0.22; }';
  function waveJS(x, z, t) { return Math.sin(x * .11 + t * .9) * .55 + Math.sin(z * .17 - t * .7 + x * .05) * .35 + Math.sin((x + z) * .23 + t * 1.3) * .22; }
  var waterGeo = new THREE.PlaneGeometry(470, 280, 150, 72); waterGeo.rotateX(-Math.PI / 2);
  var water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
    uniforms: waterU, extensions: { derivatives: true }, fog: false,
    vertexShader: 'uniform float uTime; varying vec3 vW; ' + waveGLSL + ' void main(){ vec4 w = modelMatrix*vec4(position,1.); w.y += wave(w.xz,uTime); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform vec3 uCam,uSunDir,uSunCol,uDeep,uShallow,uSky,uFogCol; uniform float uFogNear,uFogFar; varying vec3 vW; void main(){ ' +
      'vec3 n = normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n; vec3 V = normalize(uCam-vW); float fres = pow(1.-max(dot(n,V),0.),3.); float diff = max(dot(n,uSunDir),0.); ' +
      'vec3 col = mix(uDeep,uShallow,clamp(.3+.7*diff,0.,1.)); col = mix(col,uSky,fres*.6); vec3 R = reflect(-uSunDir,n); col += uSunCol*pow(max(dot(R,V),0.),70.)*1.4; ' +
      'float d = length(vW-uCam); col = mix(col,uFogCol,smoothstep(uFogNear,uFogFar,d)); gl_FragColor = vec4(col,1.);\n #include <tonemapping_fragment>\n #include <encodings_fragment>\n }'
  }));
  water.position.set(325, WL, 129); scene.add(water);

  // road: one ribbon that leads from the farm to the port quay
  var ROAD_PTS = [V(-50, 0, 0), V(0, 0, 0), V(35, 0, 0), V(55, 0, 0), V(66, 0, -1.5), V(75, .15, -7), V(84, QY, -14), V(90, QY, -16), V(94, QY, -16), V(125, QY, -16), V(165, QY, -16)];
  var roadCurve = new THREE.CatmullRomCurve3(ROAD_PTS, false, 'centripetal');
  (function () {
    var N = 220, pos = [], idx = [], w = 3.4;
    for (var i = 0; i <= N; i++) {
      var t = i / N, p = roadCurve.getPointAt(t), tg = roadCurve.getTangentAt(t), nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      pos.push(p.x + nx * w, p.y + .04, p.z + nz * w, p.x - nx * w, p.y + .04, p.z - nz * w);
      if (i < N) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    var m = new THREE.Mesh(g, asphM); m.receiveShadow = true; scene.add(m);
    var dash = new THREE.InstancedMesh(new THREE.BoxGeometry(2, .05, .18), new THREE.MeshStandardMaterial({ color: 0xf1f1f1 }), 120);
    for (var d = 0; d < 120; d++) { var tt = d / 120 + .002, pp = roadCurve.getPointAt(tt), tg2 = roadCurve.getTangentAt(tt); dummy.position.set(pp.x, pp.y + .09, pp.z); dummy.rotation.set(0, Math.atan2(-tg2.z, tg2.x), 0); dummy.updateMatrix(); dash.setMatrixAt(d, dummy.matrix); }
    scene.add(dash);
  })();
  var lorryCurve = new THREE.CatmullRomCurve3([V(35, 0, 0), V(55, 0, 0), V(66, 0, -1.5), V(75, .15, -7), V(84, QY, -14), V(90, QY, -16), V(94, QY, -16)], false, 'centripetal');

  /* ============================== palms, hills, clouds, skyline ============================== */
  var palmTrunkG = new THREE.CylinderGeometry(.16, .28, 7, 6); palmTrunkG.translate(0, 3.5, 0);
  var palmFrondG = new THREE.BoxGeometry(3.6, .07, 1.0); palmFrondG.translate(1.8, 0, 0);
  var PALMS = [];
  for (i = 0; i < 40; i++) PALMS.push([-60 + rnd() * 150, 0, (rnd() < .5 ? -1 : 1) * (9 + rnd() * 26) + (rnd() < .5 ? 0 : -8), .8 + rnd() * .6]);
  for (i = 0; i < 24; i++) PALMS.push([180 + rnd() * 150, 0, -10 - rnd() * 26, .8 + rnd() * .6]);
  for (i = 0; i < 14; i++) PALMS.push([450 + rnd() * 70, 0, -12 - rnd() * 40, .8 + rnd() * .5]);
  PALMS = PALMS.filter(function (p) { return !(p[0] > -22 && p[0] < 22 && p[2] > -14 && p[2] < 12) && !(p[0] > 12 && p[0] < 24 && p[2] < -3 && p[2] > -14) && !(p[0] > 50 && p[0] < 180 && p[2] < -3 && p[2] > -30) && !(p[0] > 335 && p[0] < 470 && p[2] < -7.5 && p[2] > -35); });
  var palmM = M(0x3f9a3c), trunkM = M(0x8a5a2b);
  var trunks = new THREE.InstancedMesh(palmTrunkG, trunkM, PALMS.length), fronds = new THREE.InstancedMesh(palmFrondG, palmM, PALMS.length * 7);
  trunks.castShadow = true; fronds.castShadow = true;
  PALMS.forEach(function (pm, k) {
    var s = pm[3]; dummy.position.set(pm[0], 0, pm[2]); dummy.rotation.set(0, 0, (rnd() - .5) * .12); dummy.scale.set(s, s, s); dummy.updateMatrix(); trunks.setMatrixAt(k, dummy.matrix);
    for (var f = 0; f < 7; f++) { dummy.position.set(pm[0] + (rnd() - .5) * .3, 7 * s - .1, pm[2]); dummy.rotation.set(0, f / 7 * Math.PI * 2 + rnd() * .4, -.45 - rnd() * .25, 'YXZ'); dummy.scale.set(s, s, s); dummy.updateMatrix(); fronds.setMatrixAt(k * 7 + f, dummy.matrix); }
  });
  scene.add(trunks); scene.add(fronds);
  dummy.scale.set(1, 1, 1);

  var hillMs = [M(0x7fae94), M(0x5f9577)];
  for (i = 0; i < 26; i++) { var hh = 30 + rnd() * 70, hr = 50 + rnd() * 70; var hill = new THREE.Mesh(new THREE.ConeGeometry(hr, hh, 5 + Math.floor(rnd() * 3)), hillMs[i % 2]); hill.position.set(-150 + i * 26 + rnd() * 20, hh / 2 - 1, -170 - rnd() * 80); hill.rotation.y = rnd() * 3; scene.add(hill); }
  var cloudM = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, emissive: 0x6f7f90, emissiveIntensity: .25 });
  var clouds = [];
  for (i = 0; i < 26; i++) {
    var cg = new THREE.Group(); var parts = 3 + Math.floor(rnd() * 3);
    for (var c = 0; c < parts; c++) { var cs = 7 + rnd() * 9; var cm = new THREE.Mesh(new THREE.IcosahedronGeometry(cs, 0), cloudM); cm.position.set(c * 9 - parts * 4.5, rnd() * 3, rnd() * 5); cm.scale.y = .62; cg.add(cm); }
    cg.position.set(-100 + rnd() * 700, 55 + rnd() * 45, -90 - rnd() * 110); cg.userData.sp = .6 + rnd() * .9; scene.add(cg); clouds.push(cg);
  }
  // destination skyline
  (function () {
    var cols = [0xa9b6c4, 0xc5ced8, 0x9fb0c2, 0xd4cbbf, 0xb8a99a], g = new THREE.Group();
    for (var b = 0; b < 26; b++) {
      var bw = 5 + rnd() * 6, bh = 9 + rnd() * 28, bd = 5 + rnd() * 6;
      box(g, bw, bh, bd, M(cols[b % 5]), 345 + b * 8.5 + rnd() * 3, bh / 2, -52 - rnd() * 26);
    }
    box(g, 6, 24, 6, M(0xd9c6a8), 430, 12, -50); cyl(g, 4, 4, 5, 10, M(0xc9b08c), 430, 26, -50); cyl(g, .3, .3, 8, 5, M(0xc9b08c), 430, 31, -50);
    scene.add(g);
  })();
  // far container stacks and cranes at the origin port
  (function () {
    var pal = [0x8e6f76, 0x6f8aa0, 0xb08f5a, 0x6f9a82, 0x9a7fae, 0xc0392b], g = new THREE.Group();
    for (var s = 0; s < 14; s++) { var lv = 1 + Math.floor(rnd() * 3); for (var l = 0; l < lv; l++) box(g, 6.2, 2.55, 2.45, M(pal[(s + l) % 6]), 76 + s * 7, QY + 1.3 + l * 2.6, -30); }
    scene.add(g);
  })();

  /* ============================== people ============================== */
  function person(o) {
    var g = new THREE.Group(), skin = M(o.skin || 0xb5835a), shirt = M(o.shirt || 0x1f8a70), pants = M(o.pants || 0x475569);
    box(g, .22, .85, .26, pants, 0, .43, -.14); box(g, .22, .85, .26, pants, 0, .43, .14);
    box(g, .26, .12, .3, M(0x222222), .06, .06, -.14); box(g, .26, .12, .3, M(0x222222), .06, .06, .14);
    var torso = new THREE.Group(); torso.position.set(0, .85, 0); g.add(torso);
    box(torso, .5, .78, .34, shirt, 0, .39, 0);
    if (o.vest) { box(torso, .52, .5, .36, M(o.vest), 0, .42, 0); }
    box(torso, .12, .12, .12, skin, 0, .84, 0); var head = box(torso, .32, .34, .32, skin, 0, 1.05, 0);
    box(head, .06, .06, .06, M(0x1a0f08), .17, .02, .09, false); box(head, .06, .06, .06, M(0x1a0f08), .17, .02, -.09, false);
    if (o.hat === 'hard') { box(torso, .42, .13, .4, M(0xffd23f), 0, 1.27, 0); box(torso, .5, .04, .46, M(0xe3b617), 0, 1.21, 0); }
    else if (o.hat === 'cap') { box(torso, .4, .12, .38, M(o.hatc || 0x1c2740), 0, 1.26, 0); box(torso, .14, .04, .34, M(o.hatc || 0x1c2740), .24, 1.2, 0); box(torso, .06, .06, .06, M(0xd4a017), .2, 1.27, 0); }
    else if (o.hat === 'scarf') { box(torso, .38, .16, .38, M(0xf1e6d0), 0, 1.24, 0); }
    else box(torso, .34, .1, .34, M(0x2a1d14), 0, 1.24, 0);
    var arm = new THREE.Group(); arm.position.set(0, .7, .31); torso.add(arm);
    box(arm, .13, .34, .13, shirt, 0, -.17, 0); box(arm, .12, .3, .12, skin, 0, -.5, 0); box(arm, .13, .13, .13, skin, 0, -.7, 0);
    var arm2 = new THREE.Group(); arm2.position.set(0, .7, -.31); torso.add(arm2);
    box(arm2, .13, .34, .13, shirt, 0, -.17, 0); box(arm2, .12, .3, .12, skin, 0, -.5, 0); box(arm2, .13, .13, .13, skin, 0, -.7, 0);
    g.userData = { torso: torso, arm: arm, arm2: arm2 };
    return g;
  }

  /* ============================== office (buyer) ============================== */
  var office = new THREE.Group(); scene.add(office);
  box(office, 28, .3, 15, M(0xb78a55), 0, .15, -1, false).receiveShadow = true;
  box(office, 28, 9, .4, M(0xf2e6d0), 0, 4.8, -8.2); box(office, .4, 9, 15, M(0xe9dcc2), -14, 4.8, -1); box(office, .4, 9, 15, M(0xe9dcc2), 14, 4.8, -1);
  box(office, 28, .5, .5, M(0x8a6a43), 0, .55, -7.9, false);
  // window with a street view
  box(office, 7.4, 5.4, .3, M(0xffffff), 8.5, 5.4, -7.9); box(office, 6.6, 4.6, .12, M(0xbfe0f5, { e: 0x7fb4d8, ei: .5 }), 8.5, 5.4, -7.78, false);
  box(office, .25, 4.6, .2, M(0xffffff), 8.5, 5.4, -7.7, false); box(office, 6.6, .25, .2, M(0xffffff), 8.5, 5.4, -7.7, false);
  [[6.2, 3.4], [7.5, 4.3], [9.1, 3.2], [10.4, 3.9]].forEach(function (b, k) { box(office, 1.1, b[1], .1, M([0xc98b6a, 0xd79a72, 0xb9724f, 0xc58963][k]), b[0], 3.1 + b[1] / 2, -7.7, false); });
  // shelf, plant, picture
  box(office, 6, .25, 1, M(0x8a5a2b), -8.5, 5.2, -7.5); [0xc0392b, 0x2e6da4, 0x2f8f5b, 0xd98a1c].forEach(function (c, k) { box(office, .5, 1.3 + k * .1, .7, M(c), -10.6 + k * .62, 5.95, -7.5); });
  box(office, 4, 2.6, .15, M(0xffffff), -8.5, 7.4, -8); box(office, 3.6, 2.2, .1, M(0x7fb9d8), -8.5, 7.4, -7.9, false);
  box(office, .9, 1.1, .9, M(0xa85d3a), -12, .85, -6); add(office, new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), M(0x3f9a3c)), -12, 2.4, -6);
  // desk + chair + laptop
  box(office, 11, .3, 3.6, M(0x8a5a2b), 0, 2.4, -3.4); [-5, 5].forEach(function (x) { [-4.8, -2].forEach(function (z) { box(office, .3, 2.3, .3, M(0x6b4420), x, 1.2, z); }); });
  var lapG = new THREE.Group(); lapG.position.set(0, 2.55, -3.4); office.add(lapG);
  box(lapG, 5.2, .12, 3.4, M(0xaab4bd), 0, 0, 0); box(lapG, 5.4, 3.4, .22, M(0x10202b), 0, 1.85, -1.5).rotation.x = -.12;
  var uiCanvas = document.createElement('canvas'); uiCanvas.width = 1024; uiCanvas.height = 640; var uiTex = new THREE.CanvasTexture(uiCanvas); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 4;
  var screenMesh = add(lapG, new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.1), new THREE.MeshBasicMaterial({ map: uiTex })), 0, 1.85, -1.38, false); screenMesh.rotation.x = -.12;
  var uiKey = '';
  function drawUI(a1) {
    var qty = '200 MT', cty = 'Italy', q = qty.slice(0, Math.round(seg(a1, .05, .3) * qty.length)), c = cty.slice(0, Math.round(seg(a1, .3, .5) * cty.length)), clicked = a1 > .66, ok = seg(a1, .72, .85);
    var cx = a1 < .45 ? lerp(950, 760, sm(a1 / .45)) : lerp(760, 540, seg(a1, .45, .68)), cy = a1 < .45 ? lerp(620, 470, sm(a1 / .45)) : lerp(470, 452, seg(a1, .45, .68));
    var key = [q, c, clicked, Math.round(ok * 10), Math.round(cx / 8), Math.round(cy / 8)].join('|'); if (key === uiKey) return; uiKey = key;
    var g = uiCanvas.getContext('2d'); g.fillStyle = '#f7f9fb'; g.fillRect(0, 0, 1024, 640);
    g.fillStyle = '#12301f'; g.fillRect(0, 0, 1024, 84); g.fillStyle = '#7a4a24'; g.beginPath(); g.arc(54, 42, 22, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '700 34px Manrope,Arial'; g.fillText('Lucky Exports', 96, 54);
    g.fillStyle = '#12301f'; g.font = '700 46px Fraunces,Georgia,serif'; g.fillText('Semi Husked Coconuts', 56, 160); g.fillStyle = '#6b7a82'; g.font = '500 26px Manrope,Arial'; g.fillText('Namakkal, Tamil Nadu · FOB Tuticorin', 56, 200);
    [[56, 'QUANTITY', q], [540, 'TO', c]].forEach(function (f) { g.fillStyle = '#fff'; g.strokeStyle = '#cfd8dc'; g.lineWidth = 3; g.beginPath(); g.roundRect(f[0], 240, 430, 84, 14); g.fill(); g.stroke(); g.fillStyle = '#8a979e'; g.font = '600 22px Manrope,Arial'; g.fillText(f[1], f[0] + 22, 290); g.fillStyle = '#12301f'; g.font = '700 36px Manrope,Arial'; g.fillText(f[2], f[0] + (f[1] === 'TO' ? 80 : 170), 294); });
    g.fillStyle = clicked ? '#1f9d55' : '#2f7d3a'; g.beginPath(); g.roundRect(56, 364, 914, 104, 20); g.fill(); g.fillStyle = '#fff'; g.font = '700 42px Manrope,Arial'; g.textAlign = 'center'; g.fillText(clicked ? 'Order confirmed ✓' : 'Place order →', 513, 430); g.textAlign = 'left';
    g.globalAlpha = ok; g.fillStyle = '#1f9d55'; g.font = '600 30px Manrope,Arial'; g.fillText('Proforma invoice PI-001/2026 sent ✓', 56, 540); g.globalAlpha = 1;
    g.fillStyle = '#12301f'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + 46); g.lineTo(cx + 13, cy + 35); g.lineTo(cx + 24, cy + 58); g.lineTo(cx + 33, cy + 53); g.lineTo(cx + 23, cy + 32); g.lineTo(cx + 40, cy + 32); g.closePath(); g.fill(); g.stroke();
    uiTex.needsUpdate = true;
  }
  var chair = new THREE.Group(); office.add(chair); box(chair, 3, .3, 3, M(0x3a3f4a), -2.4, 1.6, 0); box(chair, 3, 1.3, .35, M(0x3a3f4a), -2.4, 2.4, 1.5); box(chair, .3, 1.3, .3, M(0x2b2f36), -2.4, .8, 0);
  var buyer = person({ shirt: 0x6c4cb0, pants: 0x334155, skin: 0xc68642 }); buyer.rotation.y = Math.PI / 2; buyer.position.set(-2.4, .62, .1); buyer.scale.setScalar(1.2); office.add(buyer);
  // sitting pose: legs hidden behind desk, arm reaches the mouse
  buyer.userData.arm.rotation.z = 1.2; buyer.userData.arm2.rotation.z = 1.0;
  box(office, .5, .5, .6, M(0xffffff), 4.6, 2.85, -2.8); box(office, 2.6, .12, 2.6, M(0xffffff, { r: .4 }), 4.6, 2.6, -3);

  /* ============================== farm: packhouse, pile, worker, lorry ============================== */
  var pack = new THREE.Group(); scene.add(pack);
  box(pack, 8, 4, 8, M(0xe3c79c), 18, 2, -8); var roof = add(pack, new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.6, 4), M(0xb5543a)), 18, 5.3, -8); roof.rotation.y = Math.PI / 4;
  box(pack, 2.4, 3, .2, M(0x4a2f1a), 18, 1.5, -3.95); box(pack, 6, 1, .2, M(0x12301f), 18, 3.6, -3.9);
  var packSign = texCanvas(512, 128, function (g, w, h) { g.fillStyle = '#12301f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 54px Fraunces,Georgia,serif'; g.textAlign = 'center'; g.fillText('LUCKY EXPORTS', 256, 84); });
  add(pack, new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: packSign })), 18, 3.6, -3.78, false);
  var lamp = add(pack, new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd94a3a })), 22.4, 3.2, -3.8, false);
  box(pack, 1.6, 1.2, 1.4, M(0xc9a977), 14.2, .6, -3.6); box(pack, 1.5, .9, 1.3, M(0xd7b98e), 14.2, 1.65, -3.6);

  var nutGeo = new THREE.IcosahedronGeometry(.22, 1);
  var NPILE = 0, pileNuts = [];
  (function () {
    var layers = [[11, 6], [10, 5], [8, 4], [6, 3], [4, 2], [2, 1]], y = .22;
    layers.forEach(function (L, li) {
      for (var a = 0; a < L[0]; a++) for (var b = 0; b < L[1]; b++) pileNuts.push({ x: 26.6 + (a - (L[0] - 1) / 2) * .43 + (rnd() - .5) * .05, y: y, z: (b - (L[1] - 1) / 2) * .43 + (li % 2 ? .21 : 0) + (rnd() - .5) * .05, hidden: false });
      y += .34;
    });
  })();
  NPILE = pileNuts.length;
  var N = 15, T = 1 / (N - 1 + 1.35), nutsMesh = new THREE.InstancedMesh(nutGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: .6 }), NPILE + N);
  nutsMesh.castShadow = true; nutsMesh.frustumCulled = false; scene.add(nutsMesh);
  var greens = [0x86bc4a, 0x9ccf62, 0x7aaa40, 0xa6d96a, 0x6f9f3a, 0x8fbf55];
  for (i = 0; i < NPILE + N; i++) nutsMesh.setColorAt(i, new THREE.Color(greens[i % greens.length]));
  nutsMesh.instanceColor.needsUpdate = true;
  var pileOrder = pileNuts.slice().sort(function (a, b) { return (b.x + b.y * .4) - (a.x + a.y * .4); });
  var HID = new THREE.Matrix4().makeScale(0, 0, 0);

  // lorry
  function wheel(parent, x, z, r) {
    var g = new THREE.Group(); g.position.set(x, r, z); parent.add(g); g.userData.spin = new THREE.Group(); g.add(g.userData.spin);
    var tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .42, 10), M(0x1b1d21)); tire.rotation.x = Math.PI / 2; tire.castShadow = true; g.userData.spin.add(tire);
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(r * .55, r * .55, .46, 6), M(0xaab2ba)); rim.rotation.x = Math.PI / 2; g.userData.spin.add(rim);
    return g;
  }
  function lorry(kind) {
    var g = new THREE.Group(), wheels = [];
    box(g, 9.4, .4, 2.2, M(0x2b2f36), 4.6, 1.0, 0);
    [[1.3, 1.0], [2.7, 1.0], [7.1, 1.0], [1.3, -1.0], [2.7, -1.0], [7.1, -1.0]].forEach(function (w) { wheels.push(wheel(g, w[0], w[1], .58)); });
    box(g, 5.6, .2, 2.4, M(0x8a6a43), 2.9, 1.3, 0);
    if (kind === 'coconut') {
      var bm = M(0x2f7d3a);
      box(g, 5.6, .95, .14, bm, 2.9, 1.9, 1.15); box(g, 5.6, .95, .14, bm, 2.9, 1.9, -1.15); box(g, .14, .95, 2.4, bm, .05, 1.9, 0); box(g, .14, .95, 2.4, bm, 5.7, 1.9, 0);
      box(g, 5.7, .1, .2, M(0x1e5628), 2.9, 2.42, 1.15); box(g, 5.7, .1, .2, M(0x1e5628), 2.9, 2.42, -1.15);
      var lt = texCanvas(512, 96, function (c, w, h) { c.fillStyle = '#2f7d3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '700 58px Fraunces,Georgia,serif'; c.textAlign = 'center'; c.fillText('LUCKY EXPORTS', 256, 68); });
      [1.23, -1.23].forEach(function (z, k) { var p = add(g, new THREE.Mesh(new THREE.PlaneGeometry(4.6, .86), new THREE.MeshBasicMaterial({ map: lt })), 2.9, 1.9, z, false); if (k) p.rotation.y = Math.PI; });
    } else { box(g, 5.6, .35, 2.4, M(0x3a3f46), 2.9, 1.5, 0); [[.4, 1], [.4, -1], [5.4, 1], [5.4, -1]].forEach(function (t) { box(g, .3, .25, .3, M(0xd4a017), t[0], 1.8, t[1]); }); }
    box(g, 3.3, 2.5, 2.3, M(0xf4f6f8), 7.55, 2.45, 0); box(g, 3.3, .5, 2.34, M(kind === 'coconut' ? 0x2f7d3a : 0xe2b13c), 7.55, 1.5, 0);
    var ws = box(g, .15, 1.2, 1.9, M(0x8ab8d6, { r: .2, m: .3 }), 9.2, 3.0, 0); ws.rotation.z = -.12; box(g, 1.6, 1.0, 2.34, M(0x8ab8d6, { r: .2, m: .3 }), 7.5, 3.0, 0).scale.set(1, 1, 1.0);
    box(g, .25, .35, .5, M(0xffe27a, { e: 0xffe27a }), 9.3, 1.7, .8); box(g, .25, .35, .5, M(0xffe27a, { e: 0xffe27a }), 9.3, 1.7, -.8); box(g, .35, .5, 2.3, M(0x2b2f36), 9.2, 1.2, 0);
    cyl(g, .13, .13, 2.4, 6, M(0x4a4f57), 6.1, 3.7, 1.0);
    g.userData.wheels = wheels; g.userData.stack = V(6.1, 4.9, 1.0);
    return g;
  }
  var lorryG = lorry('coconut'); scene.add(lorryG);
  var truck2 = lorry('flat'); scene.add(truck2);
  // landing slots in the bed (lorry-local)
  var slots = [];
  for (var sa = 0; sa < 8; sa++) slots.push(V(.6 + (sa % 4) * 1.25 + (sa < 4 ? 0 : 0), 1.55, (sa < 4 ? -.5 : .5)));
  for (sa = 0; sa < 5; sa++) slots.push(V(1.1 + sa * 1.0, 2.0, (sa % 2 ? .35 : -.35)));
  for (sa = 0; sa < 2; sa++) slots.push(V(1.9 + sa * 1.5, 2.4, 0));

  // worker
  var wk = person({ shirt: 0x1f8a70, pants: 0x475569, skin: 0x8d5524, hat: 'scarf' }); scene.add(wk);
  wk.scale.setScalar(1.18);
  var WK_X = 31.6, WK_Z = 0.15, WSC = 1.18;
  function pose(u) {
    var th = 0, psi = 15, face = -1;
    if (u <= 0) return { th: 0, psi: 15, face: -1 };
    if (u < .26) { th = 40 * sm(u / .20); psi = 15 + 25 * sm(u / .20); }
    else if (u < .34) { var t1 = (u - .26) / .08; th = 40 * (1 - sm(t1)); psi = 40 - 20 * sm(t1); }
    else if (u < .40) { face = lerp(-1, 1, sm((u - .34) / .06)); psi = 20; }
    else if (u < .50) { var t2 = (u - .40) / .10; face = 1; th = -12 * sm(t2); psi = 20 - 80 * sm(t2); }
    else if (u < .58) { var t3 = (u - .50) / .08; face = 1; th = lerp(-12, 14, sm(t3)); psi = lerp(-60, 125, sm(t3)); }
    else if (u < .68) { var t4 = (u - .58) / .10; face = 1; th = 14 * (1 - sm(t4)); psi = 125 - 100 * sm(t4); }
    else if (u < .90) { face = 1; psi = 25 - 10 * sm((u - .68) / .22); }
    else if (u < 1) { face = lerp(1, -1, sm((u - .90) / .10)); psi = 15; }
    return { th: th, psi: psi, face: face };
  }
  function hand(po) {
    var sx = .62 * Math.sin(po.th * rad), sy = .85 + .62 * Math.cos(po.th * rad), hx = sx + .66 * Math.sin(po.psi * rad), hy = sy - .66 * Math.cos(po.psi * rad);
    return V(WK_X + po.face * hx * WSC, hy * WSC, WK_Z + .25);
  }
  // people at the port / destination
  var inspector = person({ shirt: 0x3a7ca5, pants: 0x3b4452, skin: 0xb5835a, vest: 0xff8a1f, hat: 'hard' }); inspector.position.set(27.5, 0, 2.6); inspector.scale.setScalar(1.2); scene.add(inspector);
  var phyto = person({ shirt: 0x86b8e0, pants: 0x3a4a5c, skin: 0xc68642, hat: 'cap', hatc: 0xf4f6f8 }); phyto.position.set(86, QY, -11.6); phyto.rotation.y = -.3; phyto.scale.setScalar(1.2); scene.add(phyto);
  var customs = person({ shirt: 0x243a5e, pants: 0x1c2740, skin: 0x8d5524, hat: 'cap' }); customs.position.set(97, QY, -12); customs.rotation.y = -.2; customs.scale.setScalar(1.2); scene.add(customs);
  var impOff = person({ shirt: 0x243a5e, pants: 0x1c2740, skin: 0xc68642, hat: 'cap' }); impOff.position.set(391, QY, -11.8); impOff.rotation.y = -.3; impOff.scale.setScalar(1.2); scene.add(impOff);
  var buyer2 = person({ shirt: 0x6c4cb0, pants: 0x334155, skin: 0xc68642 }); buyer2.position.set(458, QY, -16.5); buyer2.rotation.y = -Math.PI / 2 + .5; buyer2.scale.setScalar(1.25); scene.add(buyer2);
  // warehouse
  var wh = new THREE.Group(); scene.add(wh);
  box(wh, 34, 11, 20, M(0xcdd5db), 480, QY + 5.5, -32); box(wh, 36, 1.2, 22, M(0x8e99a2), 480, QY + 11.4, -32);
  box(wh, 11, 8, .4, M(0x58636c), 468, QY + 4, -21.9); for (i = 0; i < 8; i++) box(wh, 11, .1, .45, M(0x46505a), 468, QY + .8 + i, -21.85, false);
  var whSign = texCanvas(512, 96, function (g, w, h) { g.fillStyle = '#12301f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 42px Manrope,Arial'; g.textAlign = 'center'; g.fillText('IMPORTER · WAREHOUSE', 256, 62); });
  add(wh, new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2), new THREE.MeshBasicMaterial({ map: whSign })), 468, QY + 9.3, -21.7, false);

  /* ============================== cranes ============================== */
  function crane(boomZ0, boomZ1) {
    var g = new THREE.Group(), red = M(0xe04a35), white = M(0xe9edf0), dark = M(0x2f3840);
    [[-6, -29], [6, -29], [-6, -9], [6, -9]].forEach(function (l) { box(g, .9, 19, .9, red, l[0], 9.5, l[1]); box(g, .5, .5, .5, dark, l[0], .25, l[1]); });
    [-29, -9].forEach(function (z) { box(g, 13, .9, .9, red, 0, 19, z); box(g, 12, .5, .5, red, 0, 9, z); });
    box(g, 1.4, 1.1, boomZ1 - boomZ0, white, 0, 19.8, (boomZ0 + boomZ1) / 2); box(g, 1.5, .3, boomZ1 - boomZ0, red, 0, 19.2, (boomZ0 + boomZ1) / 2);
    box(g, 3, 2.2, 5, M(0xf4f4f4), 0, 21.2, -26); box(g, 3.1, .5, 5.1, red, 0, 21.0, -26);
    var tr = new THREE.Group(); g.add(tr); box(tr, 3, .9, 3.4, dark, 0, 18.9, 0);
    var r1 = box(tr, .12, 1, .12, M(0x444444), -1.2, 0, 0, false), r2 = box(tr, .12, 1, .12, M(0x444444), 1.2, 0, 0, false);
    var spr = box(g, 6.2, .3, 2.5, dark, 0, 10, 0);
    g.userData = { tr: tr, r1: r1, r2: r2, spr: spr };
    return g;
  }
  var crane1 = crane(-33, 9), crane2 = crane(-33, 9); crane1.position.set(120, QY, 0); crane2.position.set(385.8, QY, 0); scene.add(crane1); scene.add(crane2);
  function craneSet(c, x, tz, sy) {   // x of the gantry, z of the trolley, y of the spreader (world)
    c.position.x = x; var u = c.userData; u.tr.position.z = tz; u.spr.position.set(0, sy - QY, tz);
    var len = Math.max(.3, 18.9 - (sy - QY)); [u.r1, u.r2].forEach(function (r) { r.scale.y = len; r.position.set(r === u.r1 ? -1.2 : 1.2, 18.9 - len / 2, 0); r.position.z = 0; });
    // ropes live in the trolley group, so they follow the trolley; the spreader hangs under it
  }

  /* ============================== container ============================== */
  var hero = new THREE.Group(); scene.add(hero);
  var cTex = texCanvas(1024, 440, function (g, w, h) {
    g.fillStyle = '#2f7d3a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.18)'; for (var x = 14; x < w; x += 26) g.fillRect(x, 20, 5, h - 40);
    g.fillStyle = '#1e5628'; g.fillRect(0, 0, w, 24); g.fillRect(0, h - 24, w, 24);
    g.fillStyle = '#fff'; g.font = '700 96px Fraunces,Georgia,serif'; g.textAlign = 'center'; g.fillText('LUCKY EXPORTS', w / 2, 236); g.font = '700 30px Manrope,Arial'; g.fillStyle = '#cfe8c6'; g.fillText('SEMI HUSKED COCONUTS', w / 2, 300);
  });
  var CW = 6, CH = 2.6, CD = 2.4;
  box(hero, CW, .15, CD, M(0x1e3a22), 0, .08, 0); box(hero, .14, CH, CD, M(0x2f7d3a), -CW / 2 + .07, CH / 2, 0); box(hero, .14, CH, CD, M(0x2f7d3a), CW / 2 - .07, CH / 2, 0);
  box(hero, CW, CH, .14, M(0x2f7d3a), 0, CH / 2, CD / 2 - .07); box(hero, CW, CH, .14, M(0x2f7d3a), 0, CH / 2, -CD / 2 + .07);
  [CD / 2 + .01, -CD / 2 - .01].forEach(function (z, k) { var p = add(hero, new THREE.Mesh(new THREE.PlaneGeometry(CW - .2, CH - .1), new THREE.MeshBasicMaterial({ map: cTex })), 0, CH / 2, z, false); if (k) p.rotation.y = Math.PI; });
  var heap = add(hero, new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), M(0x7fb446)), 0, .3, 0); heap.scale.set(2.7, .01, .95);
  var tarp = box(hero, CW + .1, .12, CD + .1, M(0xd9e0e5), -CW / 2, CH + .02, 0); tarp.scale.x = .001;
  var seal = box(hero, .7, .4, .12, M(0xd94a3a), CW / 2 - .5, CH * .55, CD / 2 + .12); seal.visible = false;
  var CONT_X = 88, CONT_Z = -16;

  /* ============================== ship ============================== */
  var shipG = new THREE.Group(), shipTilt = new THREE.Group(); shipG.add(shipTilt); scene.add(shipG);
  (function () {
    var hull = new THREE.Shape(); hull.moveTo(0, -5); hull.lineTo(51, -5); hull.lineTo(60, -1.4); hull.lineTo(60, 1.4); hull.lineTo(51, 5); hull.lineTo(0, 5); hull.closePath();
    function ext(depth, mat, y) { var g = new THREE.ExtrudeGeometry(hull, { depth: depth, bevelEnabled: false }); g.rotateX(Math.PI / 2); var m = new THREE.Mesh(g, mat); m.position.set(0, y + depth, 0); m.castShadow = true; m.receiveShadow = true; shipTilt.add(m); return m; }
    ext(3.5, M(0x7c1d16), 0); ext(2.9, M(0x2c3e50), 3.1);   // red bottom, dark upper hull (extrusion grows downward after rotateX)
    box(shipTilt, 60, .12, 10, M(0x56616c), 30, 6.02, 0);
    box(shipTilt, 14, 6, 9, M(0xf1f4f6), 7, 9, 0); box(shipTilt, 9, 2.6, 8.4, M(0xf3f5f6), 6, 13, 0); box(shipTilt, 9.2, 1.1, 8.6, M(0x18344d, { e: 0x1a4b6e, ei: .4 }), 6.6, 13, 0);
    box(shipTilt, 2.8, 5, 2.8, M(0xc8362b), 2.6, 12.5, 0); box(shipTilt, 3, .7, 3, M(0x14202b), 2.6, 15.2, 0); box(shipTilt, 2.9, .6, 2.9, M(0xf1f1f1), 2.6, 13.4, 0);
    cyl(shipTilt, .1, .1, 5, 5, M(0xcfd6db), 6, 17, 0); box(shipTilt, 2.4, .12, .12, M(0xcfd6db), 6, 16.5, 0);
    cyl(shipTilt, .08, .08, 3, 5, M(0xcfd6db), 58, 7.5, 0); box(shipTilt, 1.2, .8, .06, M(0xff9933), 58.6, 8.5, 0);
    var pal = [0xc0392b, 0x2e6da4, 0xd98a1c, 0x2f8f5b, 0x7a3e8e, 0xe8e4da, 0xb8432f, 0x1f4e79, 0xc9a227, 0x3a8c8c];
    for (var col = 0; col < 6; col++) for (var row = -1; row <= 1; row++) {
      var lv = [3, 4, 0, 4, 3, 2][col] + (row === 0 ? 0 : -1); if (col === 2) lv = row === 0 ? 0 : 3;
      for (var l = 0; l < lv; l++) box(shipTilt, 6.2, 2.5, 2.5, M(pal[Math.floor(rnd() * pal.length)]), 16.4 + col * 6.4, 6.1 + 1.3 + l * 2.6, row * 2.6);
    }
    var smokeG = new THREE.Group(); smokeG.position.set(2.6, 15.8, 0); shipTilt.add(smokeG); shipG.userData.smoke = smokeG;
  })();
  var SHIP_Z = -2.5, SHIP_DECK = 6, SHIP_WL = 2.4, HOLD_X = 29.2, SHIP0 = 112, SHIP1 = 357;
  var puffM = [], puffs = [];
  for (i = 0; i < 12; i++) { var pm = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x7d8288 : 0x9aa0a6, transparent: true, opacity: 0, depthWrite: false }); var pf = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), pm); shipG.userData.smoke.add(pf); puffs.push({ m: pf, mat: pm, o: i / 12 }); }
  var tpuffs = [];
  for (i = 0; i < 8; i++) { var tm = new THREE.MeshBasicMaterial({ color: 0xb9bec3, transparent: true, opacity: 0, depthWrite: false }); var tf = new THREE.Mesh(new THREE.IcosahedronGeometry(.4, 0), tm); lorryG.add(tf); tpuffs.push({ m: tf, mat: tm, o: i / 8 }); }
  var wake = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); wake.rotation.x = -Math.PI / 2; scene.add(wake);

  /* ============================== paper props (invoice, coins, envelopes) ============================== */
  var invTex = texCanvas(128, 160, function (g, w, h) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9aa5ad'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#b9c3ca'; g.fillRect(16, 26, 96, 8); g.fillRect(16, 46, 96, 8); g.fillRect(16, 66, 60, 8); g.fillStyle = '#d94a3a'; g.fillRect(16, 100, 52, 36); g.fillStyle = '#fff'; g.font = '700 24px Arial'; g.fillText('PI', 28, 126); });
  var invoice = add(scene, new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.75), new THREE.MeshBasicMaterial({ map: invTex, side: THREE.DoubleSide })), 0, 0, 0, false); invoice.visible = false;
  var coinM = M(0xf4c542, { m: .4, r: .35 }), coins = [];
  for (i = 0; i < 3; i++) { var cn = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .12, 14), coinM); cn.visible = false; cn.castShadow = true; scene.add(cn); coins.push(cn); }
  var envTex = texCanvas(128, 88, function (g, w, h) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#12301f'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); g.beginPath(); g.moveTo(3, 3); g.lineTo(w / 2, h / 2 + 6); g.lineTo(w - 3, 3); g.stroke(); g.fillStyle = '#d94a3a'; g.beginPath(); g.arc(w - 26, h - 22, 12, 0, 7); g.fill(); });
  var envs = [0, 1].map(function () { var e = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), new THREE.MeshBasicMaterial({ map: envTex, side: THREE.DoubleSide })); e.visible = false; scene.add(e); return e; });

  /* ============================== labels (little callouts) ============================== */
  var labelsEl = $('labels');
  // [id, anchor fn, fade-in, in, fade-out, gone, text]
  var shipHoldPos = V(0, 0, 0), heroPos = V(0, 0, 0), lorryPos = V(0, 0, 0), truck2Pos = V(0, 0, 0), invPos = V(0, 0, 0), shipPos = V(0, 0, 0);
  var EV = [
    ['adv', function () { return V(18, 8, -4); }, .165, .18, .205, .23, '50% advance received'],
    ['qa', function () { return V(27.5, 3.9, 2.6); }, .295, .31, .36, .375, 'Quality check passed'],
    ['bal', function () { return V(lorryPos.x + 4, 6.2, lorryPos.z); }, .36, .372, .4, .42, '20% balance received'],
    ['phy', function () { return V(86, QY + 3.6, -11.6); }, .5, .515, .545, .56, 'Phytosanitary certificate'],
    ['cus', function () { return V(97, QY + 3.6, -12); }, .545, .56, .585, .6, 'Customs cleared for export'],
    ['bl', function () { return V(shipHoldPos.x, 11, shipHoldPos.z); }, .59, .6, .625, .64, 'Bill of lading issued'],
    ['fin', function () { return V(shipHoldPos.x, 11, shipHoldPos.z); }, .64, .65, .672, .685, 'Final 30% paid, documents sent'],
    ['arr', function () { return V(shipHoldPos.x, 11, shipHoldPos.z); }, .84, .852, .87, .882, 'Arrival notice received'],
    ['imp', function () { return V(391, QY + 3.6, -11.8); }, .875, .89, .915, .93, 'Import customs cleared'],
    ['do', function () { return V(389, 12, -8); }, .915, .93, .955, .97, 'Delivery order released'],
    ['chk', function () { return V(458, QY + 3.9, -16.5); }, .975, .985, 1.2, 1.3, 'Goods checked and received']
  ];
  EV.forEach(function (e) { var d = document.createElement('div'); d.className = 'lb'; d.textContent = e[6]; labelsEl.appendChild(d); e.push(d); });
  var tmpV = new THREE.Vector3();
  function placeLabels(p, w, h) {
    EV.forEach(function (e) {
      var op = seg(p, e[2], e[3]) * (1 - seg(p, e[4], e[5])), d = e[7];
      if (op < .02) { if (d.style.opacity !== '0') d.style.opacity = 0; return; }
      tmpV.copy(e[1]()).project(camera);
      if (tmpV.z > 1 || tmpV.z < -1) { d.style.opacity = 0; return; }
      var x = (tmpV.x * .5 + .5) * w, y = (-tmpV.y * .5 + .5) * h, s = .85 + .15 * op, hw = (d.offsetWidth || 160) / 2 + 10;
      x = clamp(x, hw, w - hw); y = clamp(y, 150, h - 70);
      d.style.opacity = op.toFixed(2); d.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 12 - 10 * (1 - op)).toFixed(1) + 'px) translate(-50%,-100%) scale(' + s.toFixed(2) + ')';
    });
  }

  /* ============================== camera film ============================== */
  // [progress, focus(), azimuth, elevation, distance]
  var KEYS = [
    [0.000, function () { return V(0, 3.4, -3); }, 20, 8, 17],
    [0.045, function () { return V(0, 3.6, -3); }, 4, 5, 10],
    [0.090, function () { return V(2, 3.4, -2); }, -22, 9, 17],
    [0.130, function () { return invPos.clone().add(V(0, -1, 0)); }, -8, 10, 25],
    [0.175, function () { return V(19, 3, -5); }, 16, 8, 27],
    [0.215, function () { return V(30, 2, 0); }, 22, 11, 17],
    [0.290, function () { return V(33, 2.2, 0); }, 4, 13, 14],
    [0.345, function () { return V(35, 2, 0); }, -24, 15, 19],
    [0.400, function () { return lorryPos.clone().add(V(4, 1.6, 0)); }, 38, 9, 16],
    [0.440, function () { return V(92, 2.4, -15); }, 42, 14, 25],
    [0.480, function () { return V(91, 2, -16); }, 10, 24, 19],
    [0.525, function () { return V(91, 2.6, -14); }, 36, 11, 21],
    [0.575, function () { return heroPos.clone(); }, -34, 24, 30],
    [0.620, function () { return heroPos.clone(); }, -12, 28, 40],
    [0.655, function () { return shipHoldPos.clone().add(V(0, 3, 0)); }, 24, 18, 36],
    [0.720, function () { return shipPos.clone().add(V(24, 4, 0)); }, 58, 10, 62],
    [0.790, function () { return shipPos.clone().add(V(24, 4, 0)); }, 100, 14, 66],
    [0.835, function () { return shipPos.clone().add(V(24, 4, 0)); }, 36, 12, 56],
    [0.875, function () { return shipHoldPos.clone().add(V(8, 4, -6)); }, -22, 22, 40],
    [0.915, function () { return heroPos.clone(); }, 16, 22, 32],
    [0.955, function () { return truck2Pos.clone().add(V(0, 2, 0)); }, 42, 11, 24],
    [0.990, function () { return V(450, 3, -16); }, 12, 8, 19],
    [1.000, function () { return V(451, 3, -16); }, -8, 12, 22]
  ];
  var camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  function cameraAt(p, t, aspect) {
    var i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
    var a = KEYS[i], b = KEYS[i + 1], s = sm((p - a[0]) / (b[0] - a[0]));
    var f = a[1]().lerp(b[1](), s), az = lerp(a[2], b[2], s) + Math.sin(t * .25) * 2, el = lerp(a[3], b[3], s), d = lerp(a[4], b[4], s);
    var dm = aspect < 1 ? 1 + (1 - aspect) * 1.5 : 1; d *= dm;
    var ca = Math.cos(el * rad);
    camPos.set(f.x + d * ca * Math.sin(az * rad), Math.max(f.y + d * Math.sin(el * rad), .8), f.z + d * ca * Math.cos(az * rad));
    camTgt.copy(f);
  }

  /* ============================== day / night ============================== */
  var SKY = [[0, '#8cc3ee', '#fdebc8'], [.25, '#4fa6e0', '#d3ecf7'], [.5, '#5a9fd6', '#f7d8a6'], [.66, '#46427e', '#f29c52'], [.74, '#101d45', '#3b3f7a'], [.8, '#0b1236', '#26306a'], [.88, '#5d6fb0', '#f6b98a'], [1, '#8fc7f0', '#fdecc9']];
  var cA = new THREE.Color(), cB = new THREE.Color();
  function skyAt(p, out1, out2) { var i = 0; while (i < SKY.length - 2 && p > SKY[i + 1][0]) i++; var t = clamp((p - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]), 0, 1); out1.set(SKY[i][1]).lerp(cB.set(SKY[i + 1][1]), t); out2.set(SKY[i][2]).lerp(cB.set(SKY[i + 1][2]), t); }
  var skyTop = new THREE.Color(), skyBot = new THREE.Color();

  /* ============================== audio ============================== */
  var ctx, soundOn = false;
  function tone(freqs, type, dur, level, lpf) {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime, m = ctx.createGain();
    m.gain.setValueAtTime(.0001, t); m.gain.exponentialRampToValueAtTime(level, t + .1); m.gain.setValueAtTime(level, t + dur - .6); m.gain.exponentialRampToValueAtTime(.0001, t + dur);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf; lp.Q.value = 2;
    var d = ctx.createDelay(1); d.delayTime.value = .3; var fb = ctx.createGain(); fb.gain.value = .27; var wet = ctx.createGain(); wet.gain.value = .33;
    d.connect(fb); fb.connect(d); d.connect(wet); m.connect(lp); lp.connect(ctx.destination); lp.connect(d); wet.connect(ctx.destination);
    freqs.forEach(function (f, i) { var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * .94, t); o.frequency.exponentialRampToValueAtTime(f, t + .25); o.detune.value = (i - 1.5) * 4; var g = ctx.createGain(); g.gain.value = i < 2 ? .5 : .16; o.connect(g); g.connect(m); o.start(t); o.stop(t + dur + .1); });
  }
  function shipHorn() { if (soundOn) tone([73.4, 110, 146.8, 185], 'sawtooth', 2.3, .42, 900); }
  function truckHorn() { if (soundOn) tone([196, 247, 294], 'square', 1, .2, 1600); }
  var sndBtn = $('snd');
  sndBtn.addEventListener('click', function () { soundOn = !soundOn; sndBtn.setAttribute('aria-pressed', soundOn); sndBtn.textContent = soundOn ? 'Sound on' : 'Sound off'; if (soundOn) shipHorn(); });
  var lastP = 0, fired = {};
  function cross(name, a, b) { if (lastP < a && b >= a && !fired[name]) { fired[name] = 1; return true; } if (b < a - .02) fired[name] = 0; return false; }

  /* ============================== HUD: steps, captions, tracker, toast ============================== */
  var stepEls = [].slice.call(document.querySelectorAll('#steps li')), caps = [].slice.call(document.querySelectorAll('.cap')), STAGES = [0, .17, .43, .66, .84];
  var bar = $('bar'), fill = $('fill'), barPos = [.04, .30, .55, .75, .96], barDots = [], lastStage = -1;
  ['Order', 'Loading', 'Port', 'Sailing', 'Delivered'].forEach(function (n, i) {
    var d = document.createElement('i'); d.className = 'dot'; d.style.left = 'calc(12px + (100% - 24px) * ' + barPos[i] + ')'; bar.appendChild(d); barDots.push(d);
    var l = document.createElement('span'); l.className = 'lab'; l.textContent = n; l.style.left = d.style.left; bar.appendChild(l);
  });
  var MS = [
    [0, 'Buyer places the order online'], [.075, 'Proforma invoice issued'], [.12, '50% advance payment received'],
    [.19, 'Nuts sourced and graded at the packhouse'], [.26, 'Semi-husked and packed for ventilation'], [.33, 'Pre-shipment quality check passed'],
    [.37, '20% balance received, cargo loaded on lorry'], [.42, 'Arrived at Tuticorin Port'], [.46, 'Container stuffed and sealed'],
    [.51, 'Phytosanitary certificate issued'], [.545, 'Shipping bill filed, export customs cleared'], [.585, 'Container lifted on board, bill of lading issued'],
    [.635, 'Final 30% paid, documents released'], [.675, 'Vessel sails from Tuticorin'], [.74, 'Ocean transit'],
    [.84, 'Vessel arrives at destination port'], [.875, 'Import customs cleared, delivery order issued'], [.915, 'Container lifted onto delivery truck'],
    [.965, "Truck leaves for the importer's warehouse"], [.985, "Delivered to the importer's warehouse"]
  ];
  var lastMs = -1, toastEl = $('toast'), toastT = 0;
  function tracker(p) {
    var idx = 0; for (var i = 0; i < MS.length; i++) if (p >= MS[i][0]) idx = i;
    var d = 'Step ' + (idx + 1) + ' / ' + MS.length; $('dayM').textContent = d;
    if (idx !== lastMs) {
      var up = idx > lastMs && lastMs >= 0; lastMs = idx;
      if (up) { toastEl.textContent = '✓ ' + MS[idx][1]; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600); }
    }
  }
  if (window.parent !== window) {
    [['closeJ', 'lucky:close'], ['ctaJ', 'lucky:contact']].forEach(function (x) { $(x[0]).addEventListener('click', function (e) { e.preventDefault(); parent.postMessage(x[1], '*'); }); });
  }

  /* ============================== the frame ============================== */
  var track = $('track'), W = 1, H = 1, aspect = 1;
  function resize() { W = window.innerWidth; H = window.innerHeight; aspect = W / H; renderer.setSize(W, H, false); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; camera.aspect = aspect; camera.fov = aspect < 1 ? 52 : 42; camera.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize', resize);

  var tmpM = new THREE.Matrix4(), tmpV2 = new THREE.Vector3(), q = new THREE.Quaternion(), rotQ = new THREE.Quaternion();
  function setNut(idx, x, y, z, rot, s) { dummy.position.set(x, y, z); dummy.rotation.set(rot * .7, rot, rot * .4); dummy.scale.setScalar(s || 1); dummy.updateMatrix(); nutsMesh.setMatrixAt(idx, dummy.matrix); }
  function hideNut(idx) { nutsMesh.setMatrixAt(idx, HID); }

  var tNow = 0, quality = 1, fpsT0 = 0, fpsN = 0, fpsChecked = 0;

  window.__J3D = { renderer: renderer, scene: scene, camera: camera, step: function () { frameBody(performance.now()); } };
  var frameErr = 0;
  function frame(time) {
    requestAnimationFrame(frame);
    try { frameBody(time); } catch (err) { if (frameErr++ < 3) console.error('journey3d frame error:', err && err.stack || err); }
  }
  function frameBody(time) {
    var t = time / 1000, dt = t - tNow; tNow = t;
    var rect = track.getBoundingClientRect(), total = rect.height - window.innerHeight;
    var p = (window.__J3D && typeof window.__J3D.forceP === 'number') ? window.__J3D.forceP : clamp(-rect.top / total, 0, 1);

    /* ---- sky and light ---- */
    skyAt(p, skyTop, skyBot); skyU.uTop.value.copy(skyTop); skyU.uBot.value.copy(skyBot);
    scene.fog.color.copy(skyBot); waterU.uFogCol.value.copy(skyBot); waterU.uSky.value.copy(skyBot).lerp(skyTop, .4);
    var night = seg(p, .68, .76) * (1 - seg(p, .80, .88)); starMat.opacity = night;
    var dayT = p < .72 ? p / .72 : -1, el, az;
    if (dayT >= 0) { el = 22 + Math.sin(Math.PI * dayT) * 44 - 16 * Math.abs(dayT - .5) * 0; az = lerp(-60, 60, dayT); if (dayT > .85) el = lerp(el, 3, (dayT - .85) / .15); }
    else if (p > .86) { var rt = lin(p, .86, 1); el = lerp(-4, 34, rt); az = lerp(-70, -40, rt); } else { el = -12; az = 60; }
    var sunDir = V(Math.sin(az * rad) * Math.cos(el * rad), Math.sin(el * rad), -Math.cos(az * rad) * Math.cos(el * rad) * -1).normalize();
    sunDir.z = Math.abs(sunDir.z) * .6 + .25;   // keep the light coming from the camera side so faces are lit
    var up = clamp((el + 2) / 14, 0, 1);
    sun.intensity = 1.9 * up * (1 - night); sun.color.set(0xfff1d6).lerp(cB.set(0xff9a55), 1 - clamp(el / 25, 0, 1));
    hemi.intensity = .3 + .45 * (1 - night) * (.4 + .6 * up); hemi.color.copy(skyTop).lerp(cB.set(0xffffff), .35); hemi.groundColor.set(0x6b8f55).lerp(cB.set(0x1a2230), night);
    moon.intensity = 1.3 * night; moon.position.set(30, 90, 60).add(camTgt); moon.target.position.copy(camTgt);
    waterU.uSunCol.value.copy(sun.color); waterU.uSunDir.value.copy(night > .5 ? V(-.3, .8, .5).normalize() : sunDir);
    waterU.uDeep.value.set(0x0d5278).lerp(cB.set(0x050f24), night); waterU.uShallow.value.set(0x2c93b8).lerp(cB.set(0x14315a), night);
    renderer.toneMappingExposure = .9 - .1 * night;
    waterU.uTime.value = t;

    /* ---- order scene ---- */
    var a1 = lin(p, 0, .09); drawUI(a1);
    // invoice flies to the packhouse, coins follow
    var fl = lin(p, .075, .17);
    if (fl <= 0 || fl >= 1) invoice.visible = false;
    else { invoice.visible = true; invPos.set(lerp(0, 18, sm(fl)), lerp(4.4, 1.8, sm(fl)) + Math.sin(Math.PI * fl) * 7, lerp(-2.4, -5, sm(fl))); invoice.position.copy(invPos); invoice.rotation.set(0, Math.sin(fl * 6) * .5, Math.sin(fl * 5) * .4); invoice.scale.setScalar(1 - .35 * fl); }
    if (fl <= 0 || fl >= 1) invPos.set(lerp(0, 18, sm(clamp(fl, 0, 1))), 3, -3);
    coins.forEach(function (c, k) {
      var f = lin(p, .105 + k * .012, .17 + k * .012);
      if (f <= 0 || f >= 1) { c.visible = false; return; }
      c.visible = true; c.position.set(lerp(1, 17.6, sm(f)), lerp(4, 1.6, sm(f)) + Math.sin(Math.PI * f) * 6.5, lerp(-2.5, -4.6, sm(f)) + k * .5); c.rotation.set(f * 18, 0, f * 7);
    });
    var recv = seg(p, .165, .19); lamp.material.color.set(recv > .5 ? 0x3fc470 : 0xd94a3a);
    var cursorClick = a1 > .64 && a1 < .7;

    /* ---- worker, pile, nuts ---- */
    var a = lin(p, .17, .35), k = clamp(Math.floor(a / T), 0, N - 1), uK = a >= 1 ? 1 : (a - k * T) / T, po = a <= 0 ? pose(0) : pose(uK);
    wk.visible = p > .1; wk.position.set(WK_X, 0, WK_Z); wk.scale.set(WSC * po.face, WSC, WSC);
    wk.userData.torso.rotation.z = -po.th * rad; wk.userData.arm.rotation.z = (po.psi + po.th) * rad;
    wk.userData.arm2.rotation.z = (a > 0 ? .2 : .1) + Math.sin(t * 1.2) * .04;
    // lorry on its path
    var ls = seg(p, .35, .43), lp = lorryCurve.getPointAt(ls), lt = lorryCurve.getTangentAt(ls);
    lorryG.position.copy(lp); lorryG.rotation.y = Math.atan2(-lt.z, lt.x); lorryPos.copy(lp);
    var dist = lorryCurve.getLength() * ls, wrot = dist / .58;
    lorryG.userData.wheels.forEach(function (w) { w.userData.spin.rotation.z = -wrot; });
    lorryG.updateMatrixWorld(true);
    var moving = p > .355 && p < .425; tpuffs.forEach(function (pf) { var age = ((t * .8 + pf.o) % 1); pf.m.position.set(6.1 - age * 1.2, 4.9 + age * 2.2, 1 + age * .6); pf.m.scale.setScalar(.6 + age * 1.6); pf.mat.opacity = (moving || (p > .17 && p < .35)) ? (1 - age) * .45 : 0; });
    // nuts: pile -> hand -> flight -> lorry bed -> container
    var hideN = 0; for (var j = 0; j < N; j++) if ((a - j * T) / T >= .26) hideN++;
    pileOrder.forEach(function (n, idx) { n.hidden = idx < hideN; });
    pileNuts.forEach(function (n, idx) { if (n.hidden) hideNut(idx); else setNut(idx, n.x, n.y, n.z, idx * 1.7, 1); });
    var contX = CONT_X, landedCount = 0, filling = 0;
    var cont = { x: contX, y: QY, z: CONT_Z };
    for (j = 0; j < N; j++) {
      var uj = (a - j * T) / T, ts = .43 + .04 * (j / (N - 1)), dur = .018, idx2 = NPILE + j, pos2 = null, rot = j * 1.3;
      if (uj < .26) { hideNut(idx2); continue; }
      if (uj < .56) { pos2 = hand(pose(uj)); rot = uj * 5; }
      else if (uj < 1.35) {
        var rel = hand(pose(.56)), ff = (uj - .56) / .79, slot = slots[j].clone().applyMatrix4(lorryG.matrixWorld);
        var slot0 = slots[j].clone(); slot0.applyMatrix4(tmpM.makeRotationY(0)); slot0.add(V(35, 0, 0));
        pos2 = V(lerp(rel.x, slot0.x, ff), lerp(rel.y, slot0.y, ff) + 4 * (2.6 + Math.abs(slot0.x - rel.x) * .12) * ff * (1 - ff), lerp(rel.z, slot0.z, ff)); rot = ff * 12;
      }
      else if (p < ts) { pos2 = slots[j].clone().applyMatrix4(lorryG.matrixWorld); }
      else if (p < ts + dur) {
        var ft = (p - ts) / dur, from = slots[j].clone().applyMatrix4(lorryG.matrixWorld), to = V(cont.x - 1.4 + (j % 5) * .5, QY + .9, cont.z + ((j % 3) - 1) * .45);
        pos2 = V(lerp(from.x, to.x, sm(ft)), lerp(from.y, to.y, ft) + 4 * 2.8 * ft * (1 - ft), lerp(from.z, to.z, ft)); rot = ft * 8;
      }
      else { landedCount++; pos2 = null; }
      if (pos2) setNut(idx2, pos2.x, pos2.y, pos2.z, rot, 1); else { /* now inside the container, drawn as part of the heap */ hideNut(idx2); }
    }
    nutsMesh.instanceMatrix.needsUpdate = true;
    var heapFill = landedCount / N;

    /* ---- inspectors, officers, buyer ---- */
    inspector.visible = p > .1 && p < .45; var qa = lin(p, .295, .36); inspector.userData.arm.rotation.z = 1.3 + Math.sin(t * 3) * .12 * (qa > 0 && qa < 1 ? 1 : 0); inspector.userData.arm2.rotation.z = .15;
    phyto.userData.arm.rotation.z = 1.2 + Math.sin(t * 4) * .35 * (p > .52 && p < .55 ? 1 : 0); customs.userData.arm.rotation.z = 1.1 + Math.sin(t * 3) * .12;
    impOff.userData.arm.rotation.z = 1.2 + Math.sin(t * 4) * .35 * (p > .895 && p < .915 ? 1 : 0);
    buyer2.userData.arm.rotation.z = p > .985 ? 2.6 + Math.sin(t * 7) * .35 : .15;
    [phyto, customs, impOff, buyer2].forEach(function (pp) { pp.userData.torso.rotation.z = Math.sin(t * 1.3 + pp.position.x) * .02; });

    /* ---- container, cranes, ship ---- */
    var shipX = SHIP0 + (SHIP1 - SHIP0) * seg(p, .66, .84);
    var bob = Math.sin(t * 1.3) * .12;
    var sy = WL - SHIP_WL + waveJS(shipX + 30, SHIP_Z, t) * .45 + bob;
    shipG.position.set(shipX, sy, SHIP_Z);
    var hL = waveJS(shipX + 4, SHIP_Z, t), hB = waveJS(shipX + 56, SHIP_Z, t), hP = waveJS(shipX + 30, SHIP_Z - 5, t), hS = waveJS(shipX + 30, SHIP_Z + 5, t);
    shipTilt.rotation.z = Math.atan2(hB - hL, 52) * .35; shipTilt.rotation.x = Math.atan2(hS - hP, 10) * .3;
    shipHoldPos.set(shipX + HOLD_X, sy + SHIP_DECK + 1.3, SHIP_Z); shipPos.set(shipX, sy + 6, SHIP_Z);
    wake.position.set(shipX + 2, WL + .08, SHIP_Z); wake.scale.set(1 + .5 * Math.sin(t), 1, 1); wake.material.opacity = (p > .66 && p < .84) ? .35 * seg(p, .66, .7) * (1 - seg(p, .82, .84)) : 0; wake.position.x = shipX - 18;
    puffs.forEach(function (pf) { var age = (t * .22 + pf.o) % 1, mv = (p > .6 ? 1 : .5); pf.m.position.set(-age * 26 * mv - 2, age * 11, (age - .5) * 2); pf.m.scale.setScalar(.7 + age * 3.2); pf.mat.opacity = (1 - age) * .55 * clamp(age * 8, 0, 1); });

    // crane 1
    var c1x = 120, c1z = -12, c1y = 15, tzPick = CONT_Z, topC = QY + CH + .35;
    if (p >= .50) {
      if (p < .53) { c1x = lerp(120, CONT_X, sm((p - .50) / .03)); c1z = lerp(-12, tzPick, sm((p - .50) / .03)); c1y = 15; }
      else if (p < .56) { c1x = CONT_X; c1z = tzPick; c1y = lerp(15, topC + .3, sm((p - .53) / .03)); }
      else if (p < .59) { c1x = CONT_X; c1z = tzPick; c1y = lerp(topC + .3, 15, sm((p - .56) / .03)); }
      else if (p < .625) { var m1 = sm((p - .59) / .035); c1x = lerp(CONT_X, shipX0() + HOLD_X, m1); c1z = lerp(tzPick, SHIP_Z, m1); c1y = 15 + Math.sin(Math.PI * m1) * 0; }
      else if (p < .65) { c1x = shipX0() + HOLD_X; c1z = SHIP_Z; c1y = lerp(15, SHIP_DECK + WL - SHIP_WL + 1.4 + CH + .55, sm((p - .625) / .025)); }
      else if (p < .67) { c1x = shipX0() + HOLD_X; c1z = SHIP_Z; c1y = lerp(WL - SHIP_WL + SHIP_DECK + CH + 1.95, 15, sm((p - .65) / .02)); }
      else { var r1 = sm((p - .67) / .03); c1x = lerp(shipX0() + HOLD_X, 120, r1); c1z = lerp(SHIP_Z, -12, r1); c1y = 15; }
    }
    function shipX0() { return SHIP0; }
    craneSet(crane1, c1x, c1z, c1y);
    // crane 2
    var holdD = SHIP1 + HOLD_X, deckY = WL - SHIP_WL + SHIP_DECK, c2x = holdD, c2z = SHIP_Z, c2y = 15, truckBedX = 401.5, truckTopY = QY + 1.3 + .35;
    if (p >= .84) {
      if (p < .865) { c2y = lerp(15, deckY + 1.3 + CH + .55, sm((p - .84) / .025)); }
      else if (p < .89) { c2y = lerp(deckY + CH + 1.85, 15, sm((p - .865) / .025)); }
      else if (p < .925) { var m2 = sm((p - .89) / .035); c2x = lerp(holdD, truckBedX, m2); c2z = lerp(SHIP_Z, -16, m2); c2y = 15; }
      else if (p < .945) { c2x = truckBedX; c2z = -16; c2y = lerp(15, truckTopY + CH + .6, sm((p - .925) / .02)); }
      else if (p < .96) { c2x = truckBedX; c2z = -16; c2y = lerp(truckTopY + CH + .6, 15, sm((p - .945) / .015)); }
      else { var r2 = sm((p - .96) / .03); c2x = lerp(truckBedX, holdD, r2); c2z = lerp(-16, SHIP_Z, r2); c2y = 15; }
    } else { c2y = 15; }
    craneSet(crane2, c2x, c2z, c2y);
    // delivery truck
    var tx = lerp(398, 438, seg(p, .955, .985)); truck2.position.set(tx, QY, -16); truck2Pos.set(tx + 4.5, QY, -16);
    var wr2 = (tx - 398) / .58; truck2.userData.wheels.forEach(function (w) { w.userData.spin.rotation.z = -wr2; });
    var drive2 = p > .95 && p < .99; truck2.userData.stack && 0;
    // hero container
    var hx, hy, hz;
    if (p < .56) { hx = CONT_X; hy = QY; hz = CONT_Z; }
    else if (p < .65) { hx = c1x; hz = c1z; hy = c1y - 1 - CH * .5 + .75; hy = c1y - CH - .55; }
    else if (p < .865) { hx = shipHoldPos.x; hy = shipHoldPos.y - 1.3; hz = SHIP_Z; }
    else if (p < .945) { hx = c2x; hz = c2z; hy = c2y - CH - .55; }
    else { hx = tx + 3.4 + 0; hy = QY + 1.3 + .35; hz = -16; }
    if (p >= .65 && p < .865) { hy = shipHoldPos.y - 1.3; }
    hero.position.set(hx, hy, hz); hero.rotation.set(0, 0, 0);
    heroPos.set(hx, hy + 1.4, hz);
    heap.scale.set(2.7, .03 + .9 * heapFill, .95); heap.position.y = .3 + .45 * heapFill * 0;
    tarp.scale.x = Math.max(.001, seg(p, .49, .505)); tarp.position.x = -CW / 2 + (CW / 2 + .05) * tarp.scale.x;
    seal.visible = p > .505; seal.scale.setScalar(.7 + .3 * seg(p, .505, .52));
    // envelopes (documents by courier) and the destination envelope
    var e1 = lin(p, .672, .75), e2 = lin(p, .875, .91);
    envs[0].visible = e1 > 0 && e1 < 1; envs[0].position.set(shipPos.x + 30 + 90 * sm(e1), 20 + 22 * sm(e1) + Math.sin(Math.PI * e1) * 5, SHIP_Z + 10); envs[0].rotation.set(0, Math.sin(e1 * 7) * .4, Math.sin(e1 * 9) * .3); envs[0].scale.setScalar(1 + 1.2 * e1);
    envs[1].visible = e2 > 0 && e2 < 1; envs[1].position.set(lerp(412, 392, sm(e2)), lerp(24, 6, sm(e2)), -9); envs[1].rotation.set(0, Math.sin(e2 * 7) * .4, Math.sin(e2 * 9) * .3);
    // a little life
    clouds.forEach(function (c) { c.position.x += c.userData.sp * dt * 1.2; if (c.position.x > 650) c.position.x = -120; });

    /* ---- camera ---- */
    cameraAt(p, t, aspect);
    camera.position.copy(camPos); camera.lookAt(camTgt);
    waterU.uCam.value.copy(camera.position);
    sky.position.copy(camera.position);
    // sun / moon discs sit in the sky in the light's direction
    var sd = night > .5 ? V(-.3, .8, .5).normalize() : sunDir;
    sunSpr.position.copy(camera.position).addScaledVector(sunDir, 900); sunSpr.material.opacity = clamp(el / 6 + .3, 0, 1) * (1 - night);
    moonSpr.position.copy(camera.position).add(V(-250, 520, -700)); moonSpr.material.opacity = night;
    // keep the shadow map around what the camera looks at
    sun.position.copy(camTgt).addScaledVector(sunDir, 120); sun.target.position.copy(camTgt); sun.target.updateMatrixWorld();
    var sr = clamp(camPos.distanceTo(camTgt) * .8, 30, 70); if (Math.abs(sc.right - sr) > 4) { sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr; sc.updateProjectionMatrix(); }

    renderer.render(scene, camera);
    placeLabels(p, W, H);

    /* ---- HUD ---- */
    var stage = 0; for (var si = 0; si < STAGES.length; si++) if (p >= STAGES[si]) stage = si;
    if (stage !== lastStage) {
      lastStage = stage;
      stepEls.forEach(function (li, i) { li.classList.toggle('on', i === stage); li.classList.toggle('done', i < stage); });
      caps.forEach(function (c, i) { c.classList.toggle('on', i === stage); });
      barDots.forEach(function (d, i) { d.classList.toggle('on', i <= stage); });
    }
    fill.style.width = 'calc((100% - 24px) * ' + p.toFixed(3) + ')'; tracker(p);
    var dn = seg(p, .975, 1), ui = $('doneUi'); ui.style.setProperty('--do', dn.toFixed(2)); ui.style.setProperty('--ds', (.6 + .4 * dn).toFixed(2)); ui.classList.toggle('on', dn > .6);
    if (p > .975) caps.forEach(function (c) { c.classList.remove('on'); });
    document.documentElement.style.setProperty('--hint', (1 - seg(p, .01, .05)).toFixed(2));
    if (cross('truck', .355, p)) truckHorn(); if (cross('ship1', .66, p)) shipHorn(); if (cross('ship2', .84, p)) shipHorn();
    lastP = p;

    /* ---- performance guard: lower quality first, then fall back to the 2D film ---- */
    fpsN++; if (!fpsT0) fpsT0 = t;
    if (!FORCE && t - fpsT0 > 3 && fpsN > 45 && fpsChecked < 3) {
      var fps = fpsN / (t - fpsT0); fpsT0 = t; fpsN = 0; fpsChecked++;
      if (fpsChecked >= 2) {
        if (fps < 22 && quality === 1) { quality = 0; DPR = 1; renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; sun.castShadow = false; resize(); fpsChecked = 1; }
        else if (fps < 14 && quality === 0) { fallback(); }
      }
    }
  }
  $('hint') && ($('hint').style.display = '');
  requestAnimationFrame(frame);
})();
