(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var ease = function (t) { return t * t * (3 - 2 * t); };
  var seg = function (p, a, b) { return ease(clamp((p - a) / (b - a), 0, 1)); };

  /* ---------- rippling water ----------
     WebGL: the sea part of the hero photo is redrawn every frame with perspective-scaled
     wave noise that refracts the picture, soft light/dark swells and flashing sun-glints.
     If WebGL (or reading the image into it) is not available, fall back to sliding strips. */
  (function () {
    var host = document.getElementById('water');
    if (!host) return;
    var heroImg = document.querySelector('.sea .kb > img');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function stripsFallback() {
      host.innerHTML = '';
      var rnd = Math.random, y0 = 0.672, step = 0.0075, y = y0;
      while (y < 1) {
        var hf = Math.min(step + 0.003, 1 - y);
        var t = (y - y0) / (1 - y0);
        var el = document.createElement('i');
        el.className = 'rip';
        el.style.top = (y * 100).toFixed(2) + '%';
        el.style.height = (hf * 100).toFixed(2) + '%';
        el.style.backgroundPosition = '0 ' + (y / (1 - hf) * 100).toFixed(3) + '%';
        var d = 5.5 + t * 4 + rnd() * 3.5;
        var a = 0.04 + 0.62 * Math.pow(t, 1.5);
        el.style.setProperty('--a', a.toFixed(3) + 'cqw');
        el.style.setProperty('--b', (a * 0.12).toFixed(3) + 'cqw');
        el.style.setProperty('--d', d.toFixed(2) + 's');
        el.style.setProperty('--dl', (-rnd() * d).toFixed(2) + 's');
        host.appendChild(el);
        y += step;
      }
    }

    var VERT = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
    var FRAG = [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
      'uniform sampler2D T;uniform float time;varying vec2 v;',
      'const float H=.672;const float ASPECT=1.5;',
      'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
      ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*noise(p);p=p*2.03+vec2(11.7,5.3);a*=.5;}return s/.875;}',
      'void main(){',
      ' vec2 uv=vec2(v.x,.67+(1.-v.y)*.33);',
      ' float t=clamp((uv.y-H)/(1.-H),0.,1.);',
      ' float k=smoothstep(.0,.07,t);',
      ' float dy=uv.y-H+.045;',
      // ground-plane coordinates: far water is fine and dense, near water is broad
      ' vec2 p=vec2((uv.x-.5)*ASPECT/dy*.42,1./dy*.85);',
      ' float tm=time;',
      ' float n1=fbm(p*vec2(.7,1.6)+vec2(tm*.06,tm*.20));',
      ' float n2=fbm(p*vec2(1.3,3.3)+vec2(-tm*.05,tm*.29)+7.3);',
      ' float h=n1*.62+n2*.38;',
      ' float A=.0025+.011*t;',
      ' vec2 uv2=uv+vec2((n1-.5)*A*1.7,(n2-.5)*A*.8)*k;',
      ' uv2.y=max(uv2.y,H+.004);',
      ' vec3 col=texture2D(T,uv2).rgb;',
      // light and dark swells
      ' col*=1.+(h-.5)*(.12+.3*t)*k;',
      // sky glints on wave crests
      ' float g=fbm(p*vec2(1.9,8.5)+vec2(tm*.22,-tm*.42)+13.1);',
      ' float spec=smoothstep(.70,.86,g+(n1-.5)*.22)*(.05+.34*t)*k;',
      ' col+=vec3(.88,.94,1.)*spec*.5;',
      ' gl_FragColor=vec4(col,1.);',
      '}'
    ].join('\n');

    function startGL() {
      var cv = document.createElement('canvas');
      cv.className = 'water-gl';
      var gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }) ||
               cv.getContext('experimental-webgl');
      if (!gl) return false;

      function sh(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var uTime = gl.getUniformLocation(prog, 'time');

      var tex = gl.createTexture();
      var running = false, visible = true, raf = 0, t0 = performance.now();

      function size() {
        var w = Math.min(1600, Math.round(host.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
        if (w < 2) return;
        var h = Math.max(2, Math.round(w * (2 / 3) * 0.33));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      }
      function frame() {
        raf = 0;
        size();
        gl.uniform1f(uTime, (performance.now() - t0) / 1000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (running && visible && !reduce && !document.hidden) raf = requestAnimationFrame(frame);
      }
      function kick() { if (!raf) raf = requestAnimationFrame(frame); }

      function begin() {
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, heroImg);
        } catch (e) { return stripsFallback(); } // e.g. page opened from file:// with a separate image file
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        host.appendChild(cv);
        running = true;
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) kick(); }).observe(host);
        }
        document.addEventListener('visibilitychange', kick);
        window.addEventListener('resize', kick);
        kick();
      }

      if (heroImg.complete && heroImg.naturalWidth) begin();
      else heroImg.addEventListener('load', begin, { once: true });
      return true;
    }

    var ok = false;
    try { ok = startGL(); } catch (e) { ok = false; }
    if (!ok) stripsFallback();
  })();

  /* ---------- smoke ---------- */
  function makeSmoke(el, n, wind) {
    for (var i = 0; i < n; i++) {
      var puff = document.createElement('i');
      puff.className = 'puff';
      puff.style.animationDelay = (-i * 7 / n).toFixed(2) + 's';
      puff.style.setProperty('--dx', (wind.dx + Math.random() * 5).toFixed(1) + 'cqw');
      puff.style.setProperty('--dy', (wind.dy - Math.random() * 3).toFixed(1) + 'cqw');
      puff.style.setProperty('--s', (3 + Math.random() * 1.6).toFixed(2));
      el.appendChild(puff);
    }
  }
  var shipSmoke = document.getElementById('smoke');
  var truckSmoke = document.getElementById('truckSmoke');
  makeSmoke(shipSmoke, 12, { dx: 7, dy: -7 });
  makeSmoke(truckSmoke, 8, { dx: -3, dy: -9 });

  /* ---------- horn ---------- */
  var ctx, busy = false;
  var toot = document.getElementById('toot');

  function tone(freqs, type, dur, level, lpf) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(level, t + 0.1);
    master.gain.setValueAtTime(level, t + dur - 0.7);
    master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = lpf; lp.Q.value = 2;
    var delay = ctx.createDelay(1); delay.delayTime.value = 0.32;
    var fb = ctx.createGain(); fb.gain.value = 0.28;
    var wet = ctx.createGain(); wet.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); delay.connect(wet);
    master.connect(lp); lp.connect(ctx.destination); lp.connect(delay); wet.connect(ctx.destination);
    freqs.forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.25);
      o.detune.value = (i - 1.5) * 4;
      var og = ctx.createGain(); og.gain.value = i < 2 ? 0.5 : 0.16;
      o.connect(og); og.connect(master);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }

  function steam(el, spread) {
    for (var i = 0; i < 9; i++) {
      var s = document.createElement('i');
      s.className = 'puff steam';
      s.style.setProperty('--dx', (spread.dx + Math.random() * 6).toFixed(1) + 'cqw');
      s.style.setProperty('--dy', (spread.dy - Math.random() * 4).toFixed(1) + 'cqw');
      s.style.setProperty('--s', (1.8 + Math.random() * 1.8).toFixed(2));
      s.style.animationDelay = (i * 0.12).toFixed(2) + 's';
      el.appendChild(s);
      setTimeout(function (n) { n.remove(); }.bind(null, s), 4200);
    }
  }

  function blow(kind, btn) {
    if (busy) return;
    busy = true;
    if (kind === 'ship') { tone([73.4, 110, 146.8, 185], 'sawtooth', 2.3, 0.45, 900); steam(shipSmoke, { dx: 4, dy: -8 }); }
    else { tone([196, 247, 294], 'square', 1.1, 0.22, 1600); steam(truckSmoke, { dx: -4, dy: -7 }); }
    if (btn) btn.classList.add('on');
    toot.textContent = kind === 'ship' ? 'TOOOOT!' : 'HONK HONK!';
    toot.classList.remove('go'); void toot.offsetWidth; toot.classList.add('go');
    setTimeout(function () { if (btn) btn.classList.remove('on'); busy = false; }, kind === 'ship' ? 2400 : 1200);
  }
  var hornBtn = document.getElementById('hornBtn'), truckBtn = document.getElementById('truckBtn');
  hornBtn.addEventListener('click', function () { blow('ship', hornBtn); });
  document.getElementById('shipHit').addEventListener('click', function () { blow('ship', hornBtn); });
  truckBtn.addEventListener('click', function () { blow('truck', truckBtn); });
  document.getElementById('truckHit').addEventListener('click', function () { blow('truck', truckBtn); });

  /* ---------- scroll-driven sea → road journey ---------- */
  var journey = document.getElementById('top');
  var stage = document.getElementById('stage');
  var nav = document.getElementById('nav');
  var ticking = false;

  function update() {
    ticking = false;
    var vh = window.innerHeight;
    var rect = journey.getBoundingClientRect();
    var total = rect.height - vh;
    var p = clamp(-rect.top / total, 0, 1);
    var st = stage.style;

    // sea text out -> sea dissolves while zooming toward horizon -> road eases in -> road text in
    var seaText = 1 - seg(p, 0.12, 0.32);
    var seaFade = 1 - seg(p, 0.38, 0.68);
    var roadFade = seg(p, 0.34, 0.66);
    var roadText = seg(p, 0.68, 0.88);

    st.setProperty('--seaText', seaText.toFixed(3));
    st.setProperty('--seaO', seaFade.toFixed(3));
    st.setProperty('--roadO', roadFade.toFixed(3));
    st.setProperty('--seaZ', (1 + seg(p, 0.2, 0.68) * 0.28).toFixed(3));
    st.setProperty('--roadZ', (1.22 - seg(p, 0.34, 1) * 0.2).toFixed(3));
    st.setProperty('--roadText', roadText.toFixed(3));
    st.setProperty('--trust', (1 - seg(p, 0.1, 0.3)).toFixed(3));
    stage.dataset.scene = p < 0.5 ? 'sea' : 'road';

    nav.classList.toggle('solid', rect.bottom < vh * 0.4 || window.scrollY > vh * 0.2);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();


  /* ---------- product: full-screen photo sequence ---------- */
  (function () {
    var journey = document.getElementById('loadJourney');
    if (!journey) return;
    var frames = [].slice.call(journey.querySelectorAll('.frame'));
    var texts = [].slice.call(journey.querySelectorAll('.st'));
    var steps = [].slice.call(document.querySelectorAll('#loadSteps li'));
    var N = frames.length;
    var W = 0.06; // half-width of each dissolve, as a share of the scroll distance
    var ticking = false, lastIdx = -1;

    function update() {
      ticking = false;
      var vh = window.innerHeight;
      var rect = journey.getBoundingClientRect();
      var total = rect.height - vh;
      var p = clamp(-rect.top / total, 0, 1);

      // frame i sits on top of frame i-1 and fades in around boundary b = i / N
      var covered = -1;
      for (var i = 0; i < N; i++) {
        var b = i / N;
        var rise = i === 0 ? 1 : seg(p, b - W, b + W);
        if (rise >= 1) covered = i;
      }
      for (var k = 0; k < N; k++) {
        var f = frames[k];
        var bk = k / N, bn = (k + 1) / N;
        var o = k === 0 ? 1 : seg(p, bk - W, bk + W);
        f.style.setProperty('--fo', o.toFixed(3));
        f.style.setProperty('--fv', (k < covered || (o <= 0 && k > 0)) ? 'hidden' : 'visible');
        f.style.zIndex = k + 1;
        // slow push-in across the frame's own stretch of scroll
        var local = clamp((p - (bk - W)) / ((bn + W) - (bk - W)), 0, 1);
        f.style.setProperty('--fz', (1.16 - local * 0.1).toFixed(3));
      }

      var idx = Math.min(N - 1, Math.floor(p * N + 0.0001));
      if (idx !== lastIdx) {
        lastIdx = idx;
        texts.forEach(function (t, j) { t.classList.toggle('on', j === idx); });
        steps.forEach(function (li, j) {
          li.classList.toggle('on', j === idx);
          li.classList.toggle('done', j < idx);
        });
      }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  })();

  /* ---------- parallax backgrounds ---------- */
  (function () {
    var imgs = [].slice.call(document.querySelectorAll('.sec-img'));
    if (!imgs.length || reduce) return;
    var tick = false;
    function run() {
      tick = false;
      var vh = window.innerHeight;
      imgs.forEach(function (el) {
        var r = el.parentNode.getBoundingClientRect();
        if (r.bottom < -300 || r.top > vh + 300) return;
        el.style.setProperty('--py', ((r.top + r.height / 2 - vh / 2) * -0.14).toFixed(1) + 'px');
      });
    }
    function on() { if (!tick) { tick = true; requestAnimationFrame(run); } }
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    run();
  })();

  /* ---------- enquiry form (WhatsApp or email, no server needed) ---------- */
  (function () {
    var form = document.getElementById('enquiry');
    if (!form) return;
    var note = document.getElementById('formNote');
    var WA = '919876543210', MAIL = 'sales@luckyexports.example';
    function val(n) { return (form.elements[n].value || '').trim(); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var via = e.submitter && e.submitter.dataset.via || 'wa';
      [].forEach.call(form.querySelectorAll('.bad'), function (n) { n.classList.remove('bad'); });
      var email = val('email'), phone = val('phone');
      var okEmail = !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      if (!val('name') || (!email && !phone) || !okEmail) {
        if (!val('name')) form.elements.name.classList.add('bad');
        if (!okEmail) form.elements.email.classList.add('bad');
        if (!email && !phone) { form.elements.email.classList.add('bad'); form.elements.phone.classList.add('bad'); }
        note.className = 'f-note err';
        note.textContent = !okEmail ? 'That email address does not look right.' : 'Please add your name and either an email or a phone number.';
        return;
      }
      var lines = ['Hello Lucky Exports, I would like a quote for semi-husked coconuts.', '', 'Name: ' + val('name')];
      if (val('company')) lines.push('Company: ' + val('company'));
      if (email) lines.push('Email: ' + email);
      if (phone) lines.push('Phone: ' + phone);
      if (val('country')) lines.push('Destination: ' + val('country'));
      if (val('qty')) lines.push('Quantity: ' + val('qty') + ' MT');
      if (val('msg')) lines.push('', val('msg'));
      var text = lines.join('\n');
      var url = via === 'mail'
        ? 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Quote request: semi-husked coconuts') + '&body=' + encodeURIComponent(text)
        : 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text);
      note.className = 'f-note ok';
      note.textContent = via === 'mail' ? 'Opening your email app with the enquiry ready to send…' : 'Opening WhatsApp with your enquiry ready to send…';
      window.open(url, via === 'mail' ? '_self' : '_blank', 'noopener');
    });
  })();

  /* ---------- order journey, driven by the page scroll ---------- */
  (function () {
    var wrap = document.getElementById('orderJourney'), fr = document.getElementById('ojFrame');
    if (!wrap || !fr) return;
    var pin = wrap.firstElementChild, tick = false, last = -1;
    function send() {
      tick = false;
      var top = parseFloat(getComputedStyle(pin).top) || 0, rect = wrap.getBoundingClientRect(), sh = window.innerHeight - top;
      var p = clamp((top - rect.top) / (rect.height - sh), 0, 1);
      if (p !== last && fr.contentWindow) { fr.contentWindow.postMessage({ lj: p }, '*'); last = p; }
    }
    function on() { if (!tick) { tick = true; requestAnimationFrame(send); } }
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    fr.addEventListener('load', function () { last = -1; send(); });
    window.addEventListener('message', function (e) {
      if (e.data === 'lucky:contact') { var c = document.getElementById('contact'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }
    });
  })();

  /* ---------- nav ---------- */
  var burger = document.getElementById('burger'), links = document.getElementById('links');
  burger.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  });

  document.getElementById('yr').textContent = new Date().getFullYear();
})();
