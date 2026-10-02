/* =========================================================================
 * Mölkky VR — textures procédurales (canvas)
 * Bois de bouleau, bois de pin, herbe, écorce : tout est dessiné au
 * chargement, aucune image externe n'est nécessaire.
 * ========================================================================= */
(function () {
  'use strict';

  /** Générateur pseudo-aléatoire déterministe (mulberry32). */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function toTexture(c, opts) {
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (opts && opts.repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    return tex;
  }

  /** Fil du bois dans le sens vertical du canvas. */
  function drawWoodGrain(ctx, w, h, seed, base, dark) {
    var r = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // légères variations de teinte en bandes
    for (var i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.05 + r() * 0.07;
      ctx.fillStyle = r() > 0.5 ? dark : '#ffffff';
      var x = r() * w, bw = 6 + r() * w * 0.15;
      ctx.fillRect(x, 0, bw, h);
    }
    // veines fines et ondulées
    ctx.strokeStyle = dark;
    for (var j = 0; j < 46; j++) {
      ctx.globalAlpha = 0.08 + r() * 0.22;
      ctx.lineWidth = 0.6 + r() * 1.6;
      var x0 = r() * w, amp = 1 + r() * 4, freq = 0.01 + r() * 0.03, ph = r() * 6;
      ctx.beginPath();
      for (var y = 0; y <= h; y += 6) {
        var xx = x0 + Math.sin(y * freq + ph) * amp;
        if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    // quelques nœuds
    for (var k = 0; k < 2; k++) {
      if (r() < 0.5) continue;
      var kx = r() * w, ky = r() * h, kr = 3 + r() * 5;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(kx, ky, kr * 0.6, kr * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Bois de bout (cernes concentriques). */
  function drawEndGrain(ctx, w, h, seed, base, dark) {
    var r = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    var cx = w * (0.45 + r() * 0.1), cy = h * (0.45 + r() * 0.1);
    ctx.strokeStyle = dark;
    for (var i = 1; i < 16; i++) {
      ctx.globalAlpha = 0.1 + r() * 0.15;
      ctx.lineWidth = 1 + r() * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, i * w * 0.035 + r() * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  var cache = {};

  MK.Tex = {
    rng: rng,
    canvas: canvas,
    toTexture: toTexture,
    drawWoodGrain: drawWoodGrain,
    drawEndGrain: drawEndGrain,

    /** Planche de bois générique (réutilisée par le décor). */
    wood: function (key, base, dark, w, h, repeat) {
      var id = 'wood:' + key;
      if (cache[id]) return cache[id];
      var c = canvas(w || 256, h || 256);
      drawWoodGrain(c.getContext('2d'), c.width, c.height, key.length * 97 + 13, base, dark);
      cache[id] = toTexture(c, repeat ? { repeat: repeat } : null);
      return cache[id];
    },

    /** Herbe : bruit de brins sur un vert de fond. */
    grass: function (base, seed, size) {
      var id = 'grass:' + base + seed;
      if (cache[id]) return cache[id];
      var n = size || 512;
      var c = canvas(n, n), ctx = c.getContext('2d');
      var r = rng(seed || 7);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, n, n);
      var tones = ['#4F7A2E', '#6E9640', '#87A94E', '#3E6326', '#9BB560'];
      for (var i = 0; i < 9000; i++) {
        ctx.globalAlpha = 0.25 + r() * 0.45;
        ctx.strokeStyle = tones[(r() * tones.length) | 0];
        ctx.lineWidth = 1 + r() * 1.4;
        var x = r() * n, y = r() * n, len = 3 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      cache[id] = toTexture(c, { repeat: [1, 1] });
      return cache[id];
    },

    /** Écorce de bouleau : blanc cassé et marques noires horizontales. */
    birchBark: function () {
      if (cache.birch) return cache.birch;
      var c = canvas(128, 512), ctx = c.getContext('2d');
      var r = rng(31);
      ctx.fillStyle = '#EDE6D6';
      ctx.fillRect(0, 0, 128, 512);
      for (var i = 0; i < 60; i++) {
        ctx.globalAlpha = 0.5 + r() * 0.5;
        ctx.fillStyle = r() > 0.25 ? '#2A1E16' : '#6B5A49';
        var y = r() * 512, w = 10 + r() * 50, x = r() * 128;
        ctx.fillRect(x, y, w, 1.5 + r() * 4);
        if (x + w > 128) ctx.fillRect(x - 128, y, w, 2);
      }
      ctx.globalAlpha = 1;
      cache.birch = toTexture(c);
      return cache.birch;
    },

    /** Dégradé vertical utilisé pour le ciel. */
    skyGradient: function (stops) {
      var c = canvas(4, 512), ctx = c.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 0, 512);
      stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 512);
      return toTexture(c);
    }
  };
})();
