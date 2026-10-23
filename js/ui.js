/* =========================================================================
 * Mölkky VR — interface dans la scène
 * Panneaux en bois peint plantés dans l'herbe (menu, tableau des scores,
 * fin de partie, commandes) et boutons cliquables au laser ou à la souris.
 * Tout est dessiné dans des canvas avec les polices embarquées.
 * ========================================================================= */
(function () {
  'use strict';

  var PAL = MK.CONFIG.palette;
  var PPM = 800;                    // pixels de canvas par mètre
  var SHADOW = '#120C08';
  var R = function () { return MK.Rules; };

  // ------------------------------------------------------------ outils dessin
  function scaleColor(hex, k) {
    var c = new THREE.Color(hex);
    return 'rgb(' + Math.round(c.r * 255 * k) + ',' + Math.round(c.g * 255 * k) + ',' + Math.round(c.b * 255 * k) + ')';
  }

  function font(kind, size) {
    if (kind === 'display') return size + 'px ' + MK.FONT_DISPLAY;
    if (kind === 'bold') return '700 ' + size + 'px ' + MK.FONT_BODY;
    return '500 ' + size + 'px ' + MK.FONT_BODY;
  }

  /** Texte avec ombre portée dure (copie sombre décalée, sans flou). */
  function text(ctx, str, x, y, opts) {
    ctx.font = font(opts.kind || 'body', opts.size || 32);
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (opts.spacing || 0) + 'px';
    if (opts.maxWidth) {
      // réduit la taille pour que le texte tienne dans la largeur donnée
      var mw = ctx.measureText(str).width;
      if (mw > opts.maxWidth) {
        opts = Object.assign({}, opts, { size: Math.floor((opts.size || 32) * opts.maxWidth / mw) });
        ctx.font = font(opts.kind || 'body', opts.size);
      }
    }
    var off = opts.shadow === undefined ? Math.max(3, Math.round((opts.size || 32) / 18)) : opts.shadow;
    if (off) {
      ctx.fillStyle = SHADOW;
      ctx.fillText(str, x + off, y + off);
    }
    if (opts.outline) {
      // contour sombre : lisible même sur le ciel clair
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.outline;
      ctx.strokeStyle = SHADOW;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = opts.color || PAL.koivu;
    ctx.fillText(str, x, y);
    var w = ctx.measureText(str).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return w;
  }

  /** Fond de panneau : planches horizontales peintes en vert forêt (mis en cache). */
  var plankCache = {};
  function planks(W, H, seed) {
    var key = W + 'x' + H + ':' + seed;
    if (!plankCache[key]) {
      var c = MK.Tex.canvas(W, H);
      drawPlanks(c.getContext('2d'), W, H, seed);
      plankCache[key] = c;
    }
    return plankCache[key];
  }
  function paintedPlanks(ctx, W, H, seed) {
    ctx.drawImage(planks(W, H, seed), 0, 0);
  }

  function drawPlanks(ctx, W, H, seed) {
    var tmp = MK.Tex.canvas(H, W);
    MK.Tex.drawWoodGrain(tmp.getContext('2d'), H, W, seed, '#3A2A1C', '#120C08');
    ctx.save();
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = PAL.metsa;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // joints entre planches
    var n = Math.max(3, Math.round(H / 170));
    for (var i = 1; i < n; i++) {
      var y = Math.round(i * H / n);
      ctx.fillStyle = 'rgba(18,12,8,0.55)';
      ctx.fillRect(0, y - 2, W, 4);
      ctx.fillStyle = 'rgba(232,210,166,0.06)';
      ctx.fillRect(0, y + 2, W, 2);
    }
    // usure légère sur les bords
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(18,12,8,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function rule(ctx, x, y, w, color) {
    ctx.fillStyle = SHADOW;
    ctx.fillRect(x + 4, y + 4, w, 8);
    ctx.fillStyle = color || PAL.kulta;
    ctx.fillRect(x, y, w, 8);
  }

  function difficultyLine(id, terrain) {
    var d = MK.CONFIG.difficulties[id];
    var t = MK.CONFIG.terrains[terrain];
    return d.label.toUpperCase() + '  ·  ' + String(d.distance).replace('.', ',') + ' m' + (t ? '  ·  ' + t.label.toUpperCase() : '');
  }

  function plural(n, word) { return n + ' ' + word + (n > 1 ? 's' : ''); }

  // ------------------------------------------------------------ panneau 3D
  /**
   * Crée un panneau sur pied. opts : { w, h, position, rotationY, posts, draw }
   * draw(ctx, W, H, state) redessine le canvas.
   */
  function Board(scene, opts) {
    this.opts = opts;
    this.W = Math.round(opts.w * PPM);
    this.H = Math.round(opts.h * PPM);
    this.canvas = MK.Tex.canvas(this.W, this.H);
    this.ctx = this.canvas.getContext('2d');
    this.texture = MK.Tex.toTexture(this.canvas);
    this.state = {};

    var el = document.createElement('a-entity');
    el.setAttribute('position', opts.position);
    el.setAttribute('rotation', '0 ' + (opts.rotationY || 0) + ' 0');
    scene.appendChild(el);
    this.el = el;

    var group = new THREE.Group();
    var depth = 0.035, frame = 0.035;
    var wood = MK.Tex.wood('cadre', PAL.manty, '#6E4824', 256, 256);
    var woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 });
    var back = new THREE.Mesh(new THREE.BoxGeometry(opts.w + frame * 2, opts.h + frame * 2, depth), woodMat);
    back.position.z = -depth / 2;
    back.castShadow = true;
    group.add(back);

    var face = new THREE.Mesh(
      new THREE.PlaneGeometry(opts.w, opts.h),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false })
    );
    face.position.z = 0.002;
    group.add(face);

    if (opts.posts !== false) {
      var bottom = parseFloat(String(opts.position).split(' ')[1]) - opts.h / 2 - frame;
      var postH = bottom + 0.05;
      [-1, 1].forEach(function (s) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.06, postH, 0.06), woodMat);
        post.position.set(s * (opts.w / 2 - 0.1), -opts.h / 2 - frame - postH / 2 + 0.05, -depth - 0.03);
        post.castShadow = true;
        group.add(post);
      });
    }
    el.setObject3D('board', group);
    this.buttons = [];
  }

  Board.prototype.redraw = function (state) {
    if (state) this.state = state;
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.opts.draw.call(this, this.ctx, this.W, this.H, this.state);
    this.texture.needsUpdate = true;
  };

  /**
   * Petite zone redessinée seule (ex. chronomètre) : évite de renvoyer toute
   * la texture du panneau à la carte graphique chaque seconde.
   */
  Board.prototype.addOverlay = function (name, px, py, pw, ph, seed, draw) {
    var c = MK.Tex.canvas(pw, ph);
    var tex = MK.Tex.toTexture(c);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw / PPM, ph / PPM),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.set((px + pw / 2) / PPM - this.opts.w / 2, this.opts.h / 2 - (py + ph / 2) / PPM, 0.004);
    this.el.getObject3D('board').add(mesh);
    this.overlays = this.overlays || {};
    this.overlays[name] = { canvas: c, tex: tex, px: px, py: py, pw: pw, ph: ph, seed: seed, draw: draw };
  };

  Board.prototype.redrawOverlay = function (name, state) {
    var o = this.overlays[name];
    var ctx = o.canvas.getContext('2d');
    var bg = planks(this.W, this.H, o.seed);
    ctx.clearRect(0, 0, o.pw, o.ph);
    ctx.drawImage(bg, o.px, o.py, o.pw, o.ph, 0, 0, o.pw, o.ph);
    o.draw(ctx, o.pw, o.ph, state);
    o.tex.needsUpdate = true;
  };

  /** Ajoute un bouton positionné en pixels du canvas (coin haut-gauche). */
  Board.prototype.addButton = function (px, py, pw, ph, data) {
    var b = document.createElement('a-entity');
    var x = (px + pw / 2) / PPM - this.opts.w / 2;
    var y = this.opts.h / 2 - (py + ph / 2) / PPM;
    b.setAttribute('position', x + ' ' + y + ' 0.006');
    b.setAttribute('mk-button', Object.assign({ w: pw / PPM, h: ph / PPM }, data));
    this.el.appendChild(b);
    this.buttons.push(b);
    return b;
  };

  Board.prototype.setVisible = function (v) {
    this.el.object3D.visible = v;
    this.buttons.forEach(function (b) {
      if (v) b.classList.add('clickable'); else b.classList.remove('clickable');
    });
  };

  // ------------------------------------------------------------ bouton
  AFRAME.registerComponent('mk-button', {
    schema: {
      w: { default: 0.5 },
      h: { default: 0.1 },
      label: { default: '' },
      detail: { default: '' },
      kind: { default: 'secondary' },   // primary | secondary | choice
      action: { default: '' },
      value: { default: '' },
      selected: { default: false }
    },

    init: function () {
      var d = this.data;
      this.W = Math.round(d.w * PPM);
      this.H = Math.round(d.h * PPM);
      this.canvas = MK.Tex.canvas(this.W, this.H);
      this.texture = MK.Tex.toTexture(this.canvas);
      this.hover = false;
      var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(d.w, d.h),
        new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, transparent: true })
      );
      this.el.setObject3D('mesh', mesh);
      this.el.classList.add('clickable');

      var self = this;
      this.el.addEventListener('mouseenter', function () { self.hover = true; self.draw(); });
      this.el.addEventListener('mouseleave', function () { self.hover = false; self.draw(); });
      this.el.addEventListener('click', function () {
        if (!self.el.classList.contains('clickable')) return;
        self.el.sceneEl.emit('mk-action', { action: self.data.action, value: self.data.value });
      });
    },

    update: function () { this.draw(); },

    draw: function () {
      var d = this.data, ctx = this.canvas.getContext('2d'), W = this.W, H = this.H;
      var bright = (d.kind === 'primary' || d.selected) ? PAL.kulta : PAL.koivu;
      var frameColor = scaleColor(bright, this.hover ? 1 : 0.72);
      var b = 6;
      ctx.clearRect(0, 0, W, H);
      // ombre dure de la plaque
      ctx.fillStyle = SHADOW;
      ctx.fillRect(6, 6, W - 6, H - 6);
      ctx.fillStyle = frameColor;
      ctx.fillRect(0, 0, W - 6, H - 6);
      ctx.fillStyle = this.hover ? '#3A2A1C' : PAL.terva;
      ctx.fillRect(b, b, W - 6 - b * 2, H - 6 - b * 2);

      var size = d.kind === 'primary' ? Math.round(H * 0.42) : Math.round(H * 0.44);
      var cy = (H - 6) / 2 + size * 0.36;
      var x = 26;
      x += text(ctx, '>', x, cy, { kind: 'display', size: size, color: frameColor, shadow: 3 }) + 14;
      text(ctx, d.label, x, cy, {
        kind: d.kind === 'primary' ? 'display' : 'bold',
        size: d.kind === 'primary' ? size : Math.round(size * 1.08),
        color: PAL.koivu, shadow: 3, spacing: d.kind === 'primary' ? 1 : 0.5
      });
      if (d.detail) {
        text(ctx, d.detail, W - 30, cy - 2, { kind: 'body', size: Math.round(size * 0.72), color: scaleColor(PAL.koivu, 0.8), align: 'right', shadow: 2 });
      }
      if (d.selected) {
        ctx.fillStyle = PAL.kulta;
        ctx.fillRect(W - 6 - b - 12, b + 8, 6, H - 6 - b * 2 - 16);
      }
      this.texture.needsUpdate = true;
    }
  });

  // ------------------------------------------------------------ écrans
  function drawMenu(ctx, W, H, s) {
    paintedPlanks(ctx, W, H, 11);
    var L = 56;
    var tw = text(ctx, 'MÖLKKY', L, 132, { kind: 'display', size: 108, color: PAL.koivu, shadow: 7 });
    // tampon « VR »
    ctx.save();
    ctx.translate(L + tw + 26, 66);
    ctx.rotate(-0.12);
    ctx.fillStyle = SHADOW; ctx.fillRect(5, 5, 92, 64);
    ctx.fillStyle = PAL.punamulta; ctx.fillRect(0, 0, 92, 64);
    text(ctx, 'VR', 46, 50, { kind: 'display', size: 46, color: PAL.koivu, align: 'center', shadow: 3 });
    ctx.restore();
    rule(ctx, L, 162, 300);
    text(ctx, 'Fais tomber les quilles. Atteins 50 points,', L, 222, { kind: 'bold', size: 34, color: PAL.koivu });
    text(ctx, 'pas un de plus.', L, 262, { kind: 'bold', size: 34, color: PAL.koivu });
    text(ctx, 'DIFFICULTÉ', L, 322, { kind: 'bold', size: 26, color: PAL.kulta, spacing: 4 });
    text(ctx, 'TERRAIN', L, 616, { kind: 'bold', size: 26, color: PAL.kulta, spacing: 4 });

    var best = s.best;
    var line;
    if (!best) line = 'Pas encore de record en ' + MK.CONFIG.difficulties[s.difficulty].label.toLowerCase() + '.';
    else if (best.result === 'win') line = 'Record : 50 pile en ' + plural(best.throws, 'lancer') + ', ' + R().formatTime(best.timeMs);
    else line = 'Record : ' + best.score + ' points avant la défaite (' + plural(best.throws, 'lancer') + ')';
    text(ctx, line, L, 872, { kind: 'bold', size: 30, color: PAL.koivu });
    text(ctx, s.vr ? 'Laser + gâchette : boutons   ·   Grip : saisir et lancer'
                    : 'Souris : boutons   ·   Espace maintenu : doser et lancer',
      L, 914, { kind: 'body', size: 24, color: scaleColor(PAL.koivu, 0.75), shadow: 2 });
  }

  function drawScore(ctx, W, H, s) {
    paintedPlanks(ctx, W, H, 23);
    var L = 52;
    text(ctx, 'SCORE', L, 78, { kind: 'bold', size: 34, color: PAL.kulta, spacing: 5 });
    text(ctx, difficultyLine(s.difficulty || 'normal', s.terrain), W - L, 78, { kind: 'bold', size: 32, color: PAL.koivu, align: 'right', spacing: 2 });
    rule(ctx, L, 100, W - 2 * L, 'rgba(232,210,166,0.35)');

    var score = s.score || 0;
    var w = text(ctx, String(score), L - 6, 330, { kind: 'display', size: 230, color: PAL.koivu, shadow: 10 });
    text(ctx, '/ 50', L + w + 20, 330, { kind: 'display', size: 72, color: scaleColor(PAL.koivu, 0.7), shadow: 5 });

    var rest = 50 - score;
    var restLine = score === 0 ? 'Objectif : 50 pile' : (rest === 0 ? '50 pile !' : 'Il reste ' + plural(rest, 'point'));
    text(ctx, restLine, L, 398, { kind: 'bold', size: 46, color: PAL.kulta });

    // grille de statistiques
    var y0 = 470, col = (W - 2 * L) / 4;
    var stats = [
      ['LANCER', 'n° ' + (s.throwNumber || 1)],
      ['DERNIER', s.lastPoints == null ? '—' : (s.lastPoints === 0 ? '0' : '+' + s.lastPoints)],
      ['ÉCHECS', null],
      ['TEMPS', '']                     // valeur dessinée par la zone « chrono »
    ];
    stats.forEach(function (st, i) {
      var x = L + i * col;
      text(ctx, st[0], x, y0, { kind: 'bold', size: 30, color: scaleColor(PAL.koivu, 0.78), spacing: 3, shadow: 3 });
      if (st[1] === '') return;
      if (st[1] !== null) {
        var c = PAL.koivu;
        if (i === 1 && s.lastPoints === 0) c = PAL.punamulta;
        else if (i === 1 && s.lastPoints > 0) c = PAL.nurmi;
        text(ctx, st[1], x, y0 + 74, { kind: 'display', size: 60, color: c, shadow: 5 });
      } else {
        for (var k = 0; k < 3; k++) {
          var bx = x + k * 56, by = y0 + 22;
          ctx.fillStyle = SHADOW; ctx.fillRect(bx + 5, by + 5, 44, 44);
          ctx.fillStyle = k < (s.misses || 0) ? PAL.punamulta : 'rgba(232,210,166,0.18)';
          ctx.fillRect(bx, by, 44, 44);
        }
      }
    });
    if (s.lastDetail) {
      text(ctx, s.lastDetail, L + col, y0 + 118, { kind: 'bold', size: 28, color: scaleColor(PAL.koivu, 0.85), shadow: 3 });
    }

    // derniers lancers
    var hist = (s.history || []).slice(-4);
    text(ctx, 'DERNIERS LANCERS', L, 648, { kind: 'bold', size: 26, color: scaleColor(PAL.koivu, 0.65), spacing: 3, shadow: 2 });
    var x = L;
    hist.forEach(function (r) {
      var label = r.points === 0 ? '0' : '+' + r.points;
      var chip = 'n°' + r.throwNumber + '   ' + label + '   = ' + r.totalScore;
      ctx.font = font('bold', 30);
      var cw = ctx.measureText(chip).width + 28;
      ctx.fillStyle = SHADOW; ctx.fillRect(x + 4, 664 + 4, cw, 48);
      ctx.fillStyle = r.points === 0 ? '#5A2418' : (r.overflow ? '#5C4415' : '#26391B');
      ctx.fillRect(x, 664, cw, 48);
      text(ctx, chip, x + 14, 698, { kind: 'bold', size: 30, color: PAL.koivu, shadow: 0 });
      x += cw + 12;
    });
    if (!hist.length) {
      text(ctx, 'Aucun lancer pour l\'instant.', L, 700, { kind: 'body', size: 30, color: scaleColor(PAL.koivu, 0.6), shadow: 2 });
    }
  }

  function drawEnd(ctx, W, H, s) {
    paintedPlanks(ctx, W, H, 37);
    var L = 56, win = s.result === 'win';
    text(ctx, win ? 'VICTOIRE' : 'DÉFAITE', L, 124, { kind: 'display', size: 104, color: win ? PAL.kulta : PAL.punamulta, shadow: 7 });
    rule(ctx, L, 152, 260, win ? PAL.kulta : PAL.punamulta);
    text(ctx, win ? '50 points pile en ' + plural(s.throws, 'lancer') + '.' : 'Trois lancers de suite sans point.',
      L, 208, { kind: 'bold', size: 36, color: PAL.koivu });

    var stats = [['SCORE FINAL', String(s.score)], ['LANCERS', String(s.throws)], ['TEMPS', R().formatTime(s.timeMs)]];
    stats.forEach(function (st, i) {
      var x = L + i * 180;
      text(ctx, st[0], x, 262, { kind: 'bold', size: 22, color: scaleColor(PAL.koivu, 0.75), spacing: 3, shadow: 2 });
      text(ctx, st[1], x, 326, { kind: 'display', size: 58, color: PAL.koivu, shadow: 4 });
    });

    // record (colonne de droite)
    var rx = 604;
    if (s.isNewBest) {
      ctx.save();
      ctx.translate(rx, 238);
      ctx.rotate(-0.08);
      ctx.fillStyle = SHADOW; ctx.fillRect(6, 6, 150, 82);
      ctx.fillStyle = PAL.kulta; ctx.fillRect(0, 0, 150, 82);
      text(ctx, 'NOUVEAU', 75, 36, { kind: 'display', size: 26, color: PAL.terva, align: 'center', shadow: 0 });
      text(ctx, 'RECORD', 75, 68, { kind: 'display', size: 26, color: PAL.terva, align: 'center', shadow: 0 });
      ctx.restore();
    } else if (s.best) {
      var b = s.best;
      text(ctx, 'RECORD', rx, 262, { kind: 'bold', size: 22, color: PAL.kulta, spacing: 3, shadow: 2 });
      if (b.result === 'win') {
        text(ctx, plural(b.throws, 'lancer'), rx, 298, { kind: 'bold', size: 30, color: PAL.koivu, shadow: 3 });
        text(ctx, R().formatTime(b.timeMs), rx, 332, { kind: 'bold', size: 30, color: PAL.koivu, shadow: 3 });
      } else {
        text(ctx, b.score + ' points', rx, 298, { kind: 'bold', size: 30, color: PAL.koivu, shadow: 3 });
        text(ctx, '(défaite)', rx, 332, { kind: 'body', size: 26, color: scaleColor(PAL.koivu, 0.75), shadow: 2 });
      }
    }

    // historique des lancers
    var y = 382;
    var cols = [L, L + 90, L + 420, L + 520];
    ['N°', 'QUILLES TOMBÉES', 'POINTS', 'TOTAL'].forEach(function (h, i) {
      text(ctx, h, cols[i], y, { kind: 'bold', size: 22, color: scaleColor(PAL.koivu, 0.65), spacing: 2, shadow: 2 });
    });
    rule(ctx, L, y + 14, W - 2 * L, 'rgba(232,210,166,0.3)');
    var hist = s.history || [];
    var shown = hist.slice(-7);
    var rowY = y + 62;
    if (hist.length > shown.length) {
      text(ctx, '… ' + plural(hist.length - shown.length, 'lancer') + ' plus tôt', cols[0], rowY, { kind: 'body', size: 24, color: scaleColor(PAL.koivu, 0.6), shadow: 2 });
      rowY += 36;
    }
    shown.forEach(function (r) {
      var pins = r.fallenPins.length ? r.fallenPins.join(', ') : '—';
      if (pins.length > 26) pins = pins.slice(0, 25) + '…';
      var pc = r.points === 0 ? PAL.punamulta : PAL.nurmi;
      text(ctx, String(r.throwNumber), cols[0], rowY, { kind: 'bold', size: 28, color: PAL.koivu, shadow: 2 });
      text(ctx, pins, cols[1], rowY, { kind: 'body', size: 28, color: PAL.koivu, shadow: 2 });
      text(ctx, r.points === 0 ? '0' : '+' + r.points, cols[2], rowY, { kind: 'bold', size: 28, color: pc, shadow: 2 });
      text(ctx, String(r.totalScore) + (r.overflow ? '  (>50)' : ''), cols[3], rowY, { kind: 'bold', size: 28, color: r.overflow ? PAL.kulta : PAL.koivu, shadow: 2 });
      rowY += 36;
    });
  }

  function drawControls(ctx, W, H) {
    paintedPlanks(ctx, W, H, 51);
    text(ctx, 'PARTIE', 28, 52, { kind: 'bold', size: 26, color: PAL.kulta, spacing: 4, shadow: 3 });
  }

  // ------------------------------------------------------------ toast
  function Toast(scene) {
    this.W = 1280; this.H = 360;
    this.canvas = MK.Tex.canvas(this.W, this.H);
    this.texture = MK.Tex.toTexture(this.canvas);
    var el = document.createElement('a-entity');
    el.setAttribute('position', '0 1.8 -2.6');
    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.5625),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthWrite: false })
    );
    mesh.renderOrder = 10;
    el.setObject3D('mesh', mesh);
    el.object3D.visible = false;
    scene.appendChild(el);
    this.el = el;
    this.mesh = mesh;
    this.t = 0;
    this.dur = 0;
  }

  Toast.prototype.show = function (title, sub, color, durationMs) {
    var ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.W, this.H);
    text(ctx, title, this.W / 2, 170, { kind: 'display', size: 150, color: color || PAL.koivu, align: 'center', shadow: 12, outline: 14, maxWidth: this.W - 60 });
    if (sub) text(ctx, sub, this.W / 2, 268, { kind: 'bold', size: 60, color: PAL.koivu, align: 'center', shadow: 6, outline: 9, maxWidth: this.W - 60 });
    this.texture.needsUpdate = true;
    this.t = 0;
    this.dur = durationMs || 2200;
    this.el.object3D.visible = true;
  };

  Toast.prototype.tick = function (dt) {
    if (!this.el.object3D.visible) return;
    this.t += dt;
    var k = this.t / this.dur;
    var s = this.t < 160 ? 0.6 + 0.4 * (this.t / 160) : 1;   // apparition franche
    this.el.object3D.scale.set(s, s, s);
    this.mesh.material.opacity = k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;
    if (k >= 1) this.el.object3D.visible = false;
  };

  // ------------------------------------------------------------ indication flottante
  function Hint(scene, position, w, h) {
    this.W = Math.round(w * PPM); this.H = Math.round(h * PPM);
    this.canvas = MK.Tex.canvas(this.W, this.H);
    this.texture = MK.Tex.toTexture(this.canvas);
    var el = document.createElement('a-entity');
    el.setAttribute('position', position);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthWrite: false }));
    el.setObject3D('mesh', mesh);
    el.setAttribute('look-at-camera', '');
    scene.appendChild(el);
    this.el = el;
    this.current = undefined;
  }
  /** Une ou deux lignes d'aide ; set(null) masque. */
  Hint.prototype.set = function (title, sub) {
    var key = title ? title + '|' + (sub || '') : null;
    if (key === this.current) return;
    this.current = key;
    this.el.object3D.visible = !!title;
    if (!title) return;
    var ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.W, this.H);
    var big = Math.round(this.H * (sub ? 0.36 : 0.5));
    var maxW = this.W - 40;
    text(ctx, title, this.W / 2, sub ? this.H * 0.44 : this.H * 0.66, { kind: 'bold', size: big, color: PAL.kulta, align: 'center', shadow: 4, spacing: 1, outline: 7, maxWidth: maxW });
    if (sub) text(ctx, sub, this.W / 2, this.H * 0.84, { kind: 'bold', size: Math.round(this.H * 0.24), color: PAL.koivu, align: 'center', shadow: 3, outline: 6, maxWidth: maxW });
    this.texture.needsUpdate = true;
  };

  AFRAME.registerComponent('look-at-camera', {
    tick: function () {
      var cam = this.el.sceneEl.camera;
      if (!cam) return;
      var p = new THREE.Vector3();
      cam.getWorldPosition(p);
      p.y = this.el.object3D.position.y;
      this.el.object3D.lookAt(p);
    }
  });

  // ------------------------------------------------------------ API
  MK.UI = {
    init: function (scene) {
      var D = MK.CONFIG.difficulties;
      this.scene = scene;

      // Menu principal
      this.menu = new Board(scene, { w: 0.95, h: 1.2, position: '-0.72 1.4 -1.7', rotationY: 22, draw: drawMenu });
      var self = this;
      this.choiceButtons = ['facile', 'normal', 'difficile'].map(function (id, i) {
        return self.menu.addButton(56, 340 + i * 80, 648, 70, {
          label: D[id].label, detail: D[id].detail, kind: 'choice', action: 'difficulty', value: id
        });
      });
      var T = MK.CONFIG.terrains;
      this.terrainButtons = ['herbe', 'sable', 'beton'].map(function (id, i) {
        return self.menu.addButton(56 + i * 220, 634, 208, 70, {
          label: T[id].label, kind: 'choice', action: 'terrain', value: id
        });
      });
      this.menu.addButton(56, 728, 648, 88, { label: 'NOUVELLE PARTIE', kind: 'primary', action: 'start' });

      // Tableau des scores (+ zone chrono rafraîchie chaque seconde)
      this.score = new Board(scene, { w: 1.25, h: 0.95, position: '-1.3 1.42 -2.35', rotationY: 29, draw: drawScore });
      var col = (1000 - 2 * 52) / 4;
      this.score.addOverlay('chrono', Math.round(52 + 3 * col - 4), 484, 230, 76, 23, function (ctx, w, h, ms) {
        text(ctx, R().formatTime(ms || 0), 4, 60, { kind: 'display', size: 60, color: PAL.koivu, shadow: 5 });
      });

      // Fin de partie
      this.end = new Board(scene, { w: 1.0, h: 1.0, position: '-0.72 1.32 -1.7', rotationY: 22, draw: drawEnd });
      this.end.addButton(56, 700, 330, 84, { label: 'REJOUER', kind: 'primary', action: 'restart' });
      this.end.addButton(402, 700, 342, 84, { label: 'Menu principal', kind: 'secondary', action: 'menu' });

      // Commandes en cours de partie (à droite du joueur)
      this.controls = new Board(scene, { w: 0.46, h: 0.34, position: '1.05 1.12 -1.45', rotationY: -36, draw: drawControls });
      this.controls.addButton(28, 76, 312, 70, { label: 'Recommencer', kind: 'secondary', action: 'restart' });
      this.controls.addButton(28, 160, 312, 70, { label: 'Menu principal', kind: 'secondary', action: 'menu' });

      this.toastBox = new Toast(scene);
      // aide au geste, sous la ligne de visée vers les quilles
      this.hint = new Hint(scene, '0 1.0 -1.0', 1.0, 0.22);
      this.hint.set(null);

      this.controls.redraw({});
      this.setScreen('none');
    },

    setScreen: function (name) {
      this.menu.setVisible(name === 'menu');
      this.end.setVisible(name === 'end');
      this.score.setVisible(name === 'game');
      this.controls.setVisible(name === 'game');
    },

    showMenu: function (difficulty, terrain, best, vr) {
      this.choiceButtons.forEach(function (b) {
        b.setAttribute('mk-button', 'selected', b.getAttribute('mk-button').value === difficulty);
      });
      this.terrainButtons.forEach(function (b) {
        b.setAttribute('mk-button', 'selected', b.getAttribute('mk-button').value === terrain);
      });
      this.menu.redraw({ difficulty: difficulty, terrain: terrain, best: best, vr: vr });
      this.setScreen('menu');
    },

    showGame: function () { this.setScreen('game'); },

    updateScore: function (state) {
      this.score.redraw(state);
      this.score.redrawOverlay('chrono', state.elapsed);
    },

    updateTimer: function (ms) { this.score.redrawOverlay('chrono', ms); },

    showEnd: function (summary) {
      this.end.redraw(summary);
      this.setScreen('end');
    },

    toast: function (title, sub, color, ms) { this.toastBox.show(title, sub, color, ms); },

    tick: function (dt) { this.toastBox.tick(dt); }
  };
})();
