/* =========================================================================
 * Mölkky VR — sons 3D
 * Tous les sons sont synthétisés au démarrage (aucun fichier audio) puis
 * joués par des sources THREE.PositionalAudio (panner HRTF) placées à
 * l'endroit de l'événement : lancer, impacts, chutes, victoire, défaite.
 * ========================================================================= */
(function () {
  'use strict';

  // ------------------------------------------------------------ synthèse
  function noise(seed) {
    var s = seed || 1;
    return function () { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
  }

  function buffer(ctx, dur, fill) {
    var sr = ctx.sampleRate, n = Math.floor(dur * sr);
    var b = ctx.createBuffer(1, n, sr);
    var d = b.getChannelData(0);
    fill(d, sr, n);
    var peak = 0;
    for (var i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (var j = 0; j < n; j++) d[j] *= 0.9 / peak;
    return b;
  }

  /** Bruit de bois : modes amortis + petit clic d'attaque. */
  function knock(modes, clickMs, lowNoise, seed) {
    return function (d, sr, n) {
      var rnd = noise(seed), lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / sr, v = 0;
        for (var m = 0; m < modes.length; m++) {
          var md = modes[m];
          v += md[1] * Math.sin(2 * Math.PI * md[0] * t) * Math.exp(-t / md[2]);
        }
        if (t < clickMs / 1000) {
          var x = rnd();
          lp += (lowNoise ? 0.08 : 0.6) * (x - lp);
          v += lp * (lowNoise ? 2.5 : 0.8) * (1 - t / (clickMs / 1000));
        }
        d[i] = v;
      }
    };
  }

  /** Lame de marimba (bois accordé) : fondamentale + partiel à ~4x. */
  function marimbaNote(d, sr, start, freq, amp, decay) {
    var s0 = Math.floor(start * sr);
    for (var i = s0; i < d.length; i++) {
      var t = (i - s0) / sr;
      var env = Math.exp(-t / decay) * Math.min(1, t / 0.004);
      d[i] += amp * env * (Math.sin(2 * Math.PI * freq * t) +
        0.35 * Math.exp(-t / (decay * 0.25)) * Math.sin(2 * Math.PI * freq * 3.94 * t) +
        0.12 * Math.exp(-t / (decay * 0.1)) * Math.sin(2 * Math.PI * freq * 9.2 * t));
    }
  }

  function melody(notes) {
    return function (d, sr) {
      notes.forEach(function (nt) { marimbaNote(d, sr, nt[0], nt[1], nt[2] || 1, nt[3] || 0.45); });
    };
  }

  var NOTE = { C3: 130.81, C4: 261.63, Eb4: 311.13, E4: 329.63, G4: 392.0, Ab4: 415.3, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5 };

  MK.Synth = {
    build: function (ctx) {
      var B = {};
      B.hit = buffer(ctx, 0.35, knock([[880, 1, 0.07], [1430, 0.6, 0.045], [2310, 0.4, 0.028], [3350, 0.2, 0.016]], 4, false, 3));
      B.clack = buffer(ctx, 0.25, knock([[1240, 1, 0.045], [1960, 0.55, 0.03], [3020, 0.35, 0.018], [4300, 0.15, 0.01]], 3, false, 5));
      B.thud = buffer(ctx, 0.3, knock([[120, 1, 0.06], [210, 0.7, 0.04], [370, 0.35, 0.025]], 45, true, 7));
      B.fall = buffer(ctx, 0.45, function (d, sr, n) {
        knock([[410, 1, 0.05], [780, 0.6, 0.035], [1350, 0.3, 0.02]], 25, true, 9)(d, sr, n);
        // petit rebond 80 ms plus tard
        var tmp = new Float32Array(n);
        knock([[460, 0.45, 0.04], [900, 0.25, 0.025]], 12, true, 11)(tmp, sr, n);
        var off = Math.floor(0.08 * sr);
        for (var i = off; i < n; i++) d[i] += tmp[i - off];
      });
      B.whoosh = buffer(ctx, 0.45, function (d, sr, n) {
        var rnd = noise(13), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (var i = 0; i < n; i++) {
          var k = i / n;
          var f = 350 + 1500 * Math.sin(Math.PI * Math.min(1, k * 1.3));
          var w0 = 2 * Math.PI * f / sr, alpha = Math.sin(w0) / (2 * 1.4);
          var a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
          var x = rnd();
          var y = (alpha * x - alpha * x2 - a1 * y1 - a2 * y2) / a0;
          x2 = x1; x1 = x; y2 = y1; y1 = y;
          d[i] = y * Math.pow(Math.sin(Math.PI * k), 1.6);
        }
      });
      B.click = buffer(ctx, 0.08, knock([[1900, 1, 0.012], [3100, 0.4, 0.008]], 2, false, 17));
      B.raise = buffer(ctx, 0.2, knock([[640, 1, 0.03], [1100, 0.4, 0.02]], 6, true, 19));
      B.score = buffer(ctx, 0.9, melody([[0, NOTE.G5, 0.8, 0.35], [0.11, NOTE.C6, 1, 0.5]]));
      B.miss = buffer(ctx, 0.9, melody([[0, NOTE.E4, 1, 0.3], [0.16, NOTE.C4, 1, 0.45]]));
      B.start = buffer(ctx, 0.8, melody([[0, NOTE.C5, 0.8, 0.3], [0.1, NOTE.G5, 1, 0.45]]));
      B.win = buffer(ctx, 2.4, melody([
        [0, NOTE.C5, 0.8], [0.12, NOTE.E5, 0.8], [0.24, NOTE.G5, 0.85], [0.36, NOTE.C6, 0.9],
        [0.56, NOTE.G5, 0.6, 0.3], [0.68, NOTE.C6, 1, 0.9], [0.68, NOTE.E6, 0.7, 0.9], [0.68, NOTE.C5, 0.7, 1.2]
      ]));
      B.lose = buffer(ctx, 2.2, melody([
        [0, NOTE.G4, 0.9, 0.5], [0.28, NOTE.Eb4, 0.9, 0.5], [0.56, NOTE.C4, 1, 0.6], [0.9, NOTE.C3, 1, 1.1]
      ]));
      B.overflow = buffer(ctx, 1.0, function (d, sr, n) {
        var ph = 0;
        for (var i = 0; i < n; i++) {
          var t = i / sr, k = i / n;
          var f = 620 * Math.pow(0.4, k) * (1 + 0.03 * Math.sin(2 * Math.PI * 6 * t));
          ph += 2 * Math.PI * f / sr;
          var v = 0;
          for (var h = 1; h <= 6; h++) v += Math.sin(ph * h) / (h * h * 0.8);
          d[i] = v * Math.min(1, t / 0.02) * (1 - k) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t));
        }
      });
      return B;
    }
  };

  // ------------------------------------------------------------ système
  AFRAME.registerSystem('mk-audio', {
    init: function () {
      this.voices = [];
      this.buffers = null;
      this.listener = null;
      var self = this;
      var resume = function () {
        if (!self.listener) self.setup();
        var c = self.listener && self.listener.context;
        if (c && c.state !== 'running') c.resume();
      };
      ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(function (ev) {
        window.addEventListener(ev, resume, { passive: true });
      });
      this.sceneEl.addEventListener('enter-vr', resume);
      this.sceneEl.addEventListener('loaded', function () { self.setup(); });
    },

    setup: function () {
      if (this.listener || !this.sceneEl.camera) return;
      try {
        this.listener = new THREE.AudioListener();
        this.sceneEl.camera.add(this.listener);
        this.buffers = MK.Synth.build(this.listener.context);
        for (var i = 0; i < 16; i++) {
          var a = new THREE.PositionalAudio(this.listener);
          a.panner.panningModel = 'HRTF';
          a.setDistanceModel('inverse');
          a.setRefDistance(1.2);
          a.setRolloffFactor(1.0);
          a.setMaxDistance(50);
          var holder = new THREE.Object3D();
          holder.add(a);
          this.sceneEl.object3D.add(holder);
          this.voices.push({ holder: holder, audio: a, started: 0 });
        }
      } catch (e) {
        console.warn('[Mölkky] Audio indisponible', e);
        this.listener = null;
      }
    },

    /** Joue un son à une position du monde. */
    play: function (name, position, volume, rate) {
      var self = this;
      MK.safe('son ' + name, function () { self.playUnsafe(name, position, volume, rate); });
    },

    playUnsafe: function (name, position, volume, rate) {
      if (!this.listener || !this.buffers || !this.buffers[name]) return;
      if (this.listener.context.state !== 'running') return;
      var v = null, oldest = null;
      for (var i = 0; i < this.voices.length; i++) {
        var c = this.voices[i];
        if (!c.audio.isPlaying) { v = c; break; }
        if (!oldest || c.started < oldest.started) oldest = c;
      }
      if (!v) { v = oldest; v.audio.stop(); }
      v.audio.setBuffer(this.buffers[name]);
      v.audio.setVolume(volume == null ? 1 : volume);
      v.audio.setPlaybackRate(rate || 1);
      v.holder.position.set(position.x, position.y, position.z);
      v.holder.updateMatrixWorld(true);
      v.started = performance.now();
      v.audio.play();
    }
  });
})();
