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

    /**
     * Terrain de sable : grains clairs et sombres, quelques traces de râteau,
     * bords fondus dans l'herbe (masque alpha irrégulier).
     */
    sandCourt: function (w, h) {
      if (cache.sand) return cache.sand;
      var c = canvas(w, h), ctx = c.getContext('2d');
      var r = rng(53);
      ctx.fillStyle = '#D6BC89';
      ctx.fillRect(0, 0, w, h);
      // taches de sable plus ou moins tassé
      for (var i = 0; i < 70; i++) {
        ctx.globalAlpha = 0.06 + r() * 0.08;
        ctx.fillStyle = r() > 0.5 ? '#B89B68' : '#EAD6AA';
        ctx.beginPath();
        ctx.ellipse(r() * w, r() * h, 20 + r() * 90, 12 + r() * 60, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // traces de râteau, légèrement ondulées
      ctx.strokeStyle = '#A88B5B';
      for (var j = 0; j < 9; j++) {
        var y0 = r() * h, amp = 4 + r() * 10, len = 0.3 + r() * 0.5, x0 = r() * w * (1 - len);
        ctx.globalAlpha = 0.12 + r() * 0.1;
        for (var t = 0; t < 4; t++) {
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (var x = x0; x <= x0 + len * w; x += 8) {
            var yy = y0 + t * 7 + Math.sin(x * 0.012 + j) * amp;
            if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      }
      // grains
      var tones = ['#F2E2BE', '#C2A574', '#9E8256', '#E3CC9C', '#7E6748'];
      for (var k = 0; k < 60000; k++) {
        ctx.globalAlpha = 0.25 + r() * 0.5;
        ctx.fillStyle = tones[(r() * tones.length) | 0];
        ctx.fillRect(r() * w, r() * h, 1 + r() * 1.6, 1 + r() * 1.6);
      }
      ctx.globalAlpha = 1;
      // bords fondus (largeur variable pour un contour naturel)
      ctx.globalCompositeOperation = 'destination-in';
      var mask = canvas(w, h), m = mask.getContext('2d');
      m.fillStyle = '#000';
      m.filter = 'blur(' + Math.round(w * 0.025) + 'px)';
      m.beginPath();
      var n = 48, cx = w / 2, cy = h / 2;
      for (var a = 0; a <= n; a++) {
        var ang = a / n * Math.PI * 2;
        var ux = Math.cos(ang), uy = Math.sin(ang);
        // rectangle aux coins arrondis, rayon un peu bruité
        var sx = Math.pow(Math.abs(ux), 0.25) * Math.sign(ux), sy = Math.pow(Math.abs(uy), 0.25) * Math.sign(uy);
        var k2 = 0.9 + r() * 0.05;
        var px = cx + sx * cx * k2, py = cy + sy * cy * k2;
        if (a === 0) m.moveTo(px, py); else m.lineTo(px, py);
      }
      m.closePath();
      m.fill();
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      cache.sand = toTexture(c);
      return cache.sand;
    },

    /**
     * Dalle de béton : gris moucheté, joints de dilatation tous les
     * jointEvery pixels, bord légèrement plus sombre.
     */
    concreteCourt: function (w, h, jointEvery) {
      if (cache.concrete) return cache.concrete;
      var c = canvas(w, h), ctx = c.getContext('2d');
      var r = rng(91);
      ctx.fillStyle = '#A6A39B';
      ctx.fillRect(0, 0, w, h);
      // marbrures
      for (var i = 0; i < 90; i++) {
        ctx.globalAlpha = 0.05 + r() * 0.07;
        ctx.fillStyle = r() > 0.5 ? '#8C8981' : '#BDBAB1';
        ctx.beginPath();
        ctx.ellipse(r() * w, r() * h, 30 + r() * 120, 20 + r() * 80, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // granulats
      var tones = ['#7A776F', '#C9C6BD', '#8F8B82', '#B3AFA6', '#5F5C55'];
      for (var k = 0; k < 45000; k++) {
        ctx.globalAlpha = 0.2 + r() * 0.45;
        ctx.fillStyle = tones[(r() * tones.length) | 0];
        ctx.fillRect(r() * w, r() * h, 1 + r() * 1.4, 1 + r() * 1.4);
      }
      // quelques fissures fines
      ctx.strokeStyle = '#55524C';
      for (var f = 0; f < 6; f++) {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        var x = r() * w, y = r() * h;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (var s = 0; s < 8; s++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // joints de dilatation
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#4E4B46';
      for (var jy = jointEvery; jy < h - 4; jy += jointEvery) ctx.fillRect(0, Math.round(jy) - 2, w, 4);
      ctx.fillRect(Math.round(w / 2) - 2, 0, 4, h);
      // bord de la dalle
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#5E5B55';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.globalAlpha = 1;
      cache.concrete = toTexture(c);
      return cache.concrete;
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
