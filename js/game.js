/* =========================================================================
 * Mölkky VR — déroulement de la partie
 * Machine à états :
 *   menu -> ready -> held -> flying -> scoring -> ready ... -> ended
 *   ready   : le mölkky attend (sur le tabouret en VR, en main sur bureau)
 *   held    : tenu par une manette
 *   flying  : simulation en cours, on attend que tout soit immobile
 *   scoring : score appliqué, les quilles tombées sont relevées
 *   ended   : victoire ou défaite, panneau de fin
 * Les règles elles-mêmes sont dans rules.js (testées séparément).
 * ========================================================================= */
(function () {
  'use strict';

  var C = MK.CONFIG;
  var PAL = C.palette;
  var P = C.pin;
  var PREF_KEY = 'molkky-vr.difficulty';

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function now() { return performance.now(); }

  function waitLoaded(el) {
    return new Promise(function (resolve) {
      if (el.hasLoaded) resolve(); else el.addEventListener('loaded', function () { resolve(); }, { once: true });
    });
  }

  function loadPref() {
    try { var v = localStorage.getItem(PREF_KEY); return C.difficulties[v] ? v : null; } catch (e) { return null; }
  }
  function savePref(v) {
    try { localStorage.setItem(PREF_KEY, v); } catch (e) { /* rien */ }
  }

  AFRAME.registerSystem('mk-game', {
    init: function () {
      var self = this;
      this.phase = 'boot';
      this.difficulty = loadPref() || C.defaultDifficulty;
      this.game = null;
      this.lastRecord = null;
      this.pins = [];
      this.molkky = null;
      this.heldBy = null;
      this.flight = null;
      this.timers = [];
      this.lastSec = -1;
      this.idleTimer = 0;
      MK.game = this;   // accès console / tests

      this.sceneEl.addEventListener('loaded', function () {
        MK.fontsReady.then(function () { self.setup(); });
      });
      this.sceneEl.addEventListener('mk-action', function (e) { self.onAction(e.detail); });
      // l'aide du menu change selon le mode (casque ou écran)
      ['enter-vr', 'exit-vr'].forEach(function (ev) {
        self.sceneEl.addEventListener(ev, function () { if (self.phase === 'menu') self.showMenu(); });
      });
      // une fois le casque en place, tabouret à portée de main
      this.sceneEl.addEventListener('enter-vr', function () {
        setTimeout(function () { MK.safe('tabouret', function () { self.placeStoolForPlayer(); }); }, 600);
      });
    },

    setup: function () {
      var self = this, scene = this.sceneEl;
      this.phys = scene.systems['mk-physics'];
      this.audio = scene.systems['mk-audio'];

      var els = [];
      for (var n = 1; n <= 12; n++) {
        var el = document.createElement('a-entity');
        el.id = 'quille-' + n;
        el.setAttribute('mk-pin', 'number', n);
        scene.appendChild(el);
        els.push(el);
      }
      var m = document.createElement('a-entity');
      m.id = 'molkky';
      m.setAttribute('mk-molkky', '');
      scene.appendChild(m);

      Promise.all(els.concat([m]).map(waitLoaded)).then(function () {
        self.pins = els.map(function (e) { return e.components['mk-pin']; });
        self.molkky = m.components['mk-molkky'];
        self.desktop = scene.components['mk-desktop'];
        self.assist = scene.components['mk-assist'];
        MK.UI.init(scene);
        self.phys.onImpact(self.onImpact.bind(self));
        self.showMenu();
        document.body.classList.add('mk-ready');
        scene.emit('mk-ready');
      });
    },

    // ---------------------------------------------------------------- outils
    /**
     * Vrai seulement pendant une vraie session immersive WebXR. L'état
     * « vr-mode » d'A-Frame ne suffit pas : sans WebXR (page en http:// sur
     * une adresse réseau, navigateur sans casque) il est aussi posé par le
     * simple passage en plein écran.
     */
    isVR: function () {
      var r = this.sceneEl.renderer;
      return !!(r && r.xr && r.xr.isPresenting);
    },

    diff: function () { return C.difficulties[this.difficulty]; },

    later: function (ms, fn) {
      var self = this;
      var id = setTimeout(function () {
        self.timers = self.timers.filter(function (x) { return x !== id; });
        fn();
      }, ms);
      this.timers.push(id);
    },

    cancelTimers: function () {
      this.timers.forEach(clearTimeout);
      this.timers = [];
    },

    releaseHands: function () {
      document.querySelectorAll('[mk-hand]').forEach(function (h) { h.components['mk-hand'].drop(); });
      if (this.desktop) this.desktop.charging = false;
      this.heldBy = null;
    },

    emitState: function () {
      this.sceneEl.emit('mk-state', { phase: this.phase, difficulty: this.difficulty, game: this.game });
    },

    playerPos: function () {
      var p = new THREE.Vector3();
      if (this.sceneEl.camera) this.sceneEl.camera.getWorldPosition(p); else p.set(0, 1.6, 0);
      return p;
    },

    pinsCenter: function () {
      var z = C.throwLineZ - this.diff().distance - 0.08;
      return new THREE.Vector3(0, 0.2, z);
    },

    // ---------------------------------------------------------------- quilles
    layoutPins: function () {
      var layout = MK.pinLayout(this.diff().distance);
      this.pins.forEach(function (p) {
        var L = layout[p.data.number];
        p.placeUpright(L.x, L.z);
        p.setHighlight(false);
      });
      if (this.assist) {
        this.assist.setGuide(this.diff().assist, C.throwLineZ - 0.1, C.throwLineZ - this.diff().distance + 0.15);
      }
    },

    /** Zone où l'on peut remettre une quille debout. */
    bounds: function () {
      var rowGap = (P.radius * 2 + 0.004) * Math.sqrt(3) / 2;
      var backRow = C.throwLineZ - this.diff().distance - 3 * rowGap;
      return {
        xMin: -C.field.halfWidth, xMax: C.field.halfWidth,
        zMin: backRow - C.field.backMargin, zMax: C.throwLineZ - C.field.frontGap
      };
    },

    /**
     * Pour chaque quille tombée : position (x, z) où elle a fini sa chute,
     * ramenée dans le terrain et décalée si elle chevauche une autre quille.
     */
    computeRaiseTargets: function (fallen) {
      var b = this.bounds();
      var minD = P.radius * 2 + 0.008;
      var placed = this.pins.filter(function (p) { return fallen.indexOf(p) < 0; })
        .map(function (p) { return { x: p.body.position.x, z: p.body.position.z }; });
      return fallen.map(function (p) {
        var x = clamp(p.body.position.x, b.xMin, b.xMax);
        var z = clamp(p.body.position.z, b.zMin, b.zMax);
        for (var it = 0; it < 40; it++) {
          var moved = false;
          for (var i = 0; i < placed.length; i++) {
            var q = placed[i], dx = x - q.x, dz = z - q.z, d = Math.sqrt(dx * dx + dz * dz);
            if (d < minD) {
              var nx = d > 1e-6 ? dx / d : Math.cos(it * 2.4), nz = d > 1e-6 ? dz / d : Math.sin(it * 2.4);
              x = q.x + nx * minD; z = q.z + nz * minD;
              moved = true;
            }
          }
          x = clamp(x, b.xMin, b.xMax); z = clamp(z, b.zMin, b.zMax);
          if (!moved) break;
        }
        var t = { x: x, z: z };
        placed.push(t);
        return t;
      });
    },

    // ---------------------------------------------------------------- écrans
    showMenu: function () {
      this.cancelTimers();
      this.releaseHands();
      this.phase = 'menu';
      this.game = null;
      this.lastRecord = null;
      this.flight = null;
      this.molkky.toStand();
      this.layoutPins();
      MK.UI.showMenu(this.difficulty, MK.Storage.getBest(this.difficulty), this.isVR());
      this.emitState();
    },

    /** Nouvelle partie : score, lancers, échecs, chrono et quilles réinitialisés. */
    startGame: function (difficulty) {
      if (difficulty && C.difficulties[difficulty]) {
        this.difficulty = difficulty;
        savePref(difficulty);
      }
      this.cancelTimers();
      this.releaseHands();
      this.flight = null;
      this.layoutPins();
      this.molkky.toStand();
      this.game = MK.Rules.createGame(this.difficulty, now());
      this.lastRecord = null;
      this.lastSec = -1;
      this.phase = 'ready';
      MK.UI.showGame();
      this.refreshScore();
      this.audio.play('start', this.playerPos(), 0.5);
      if (this.isVR()) MK.UI.toast('À TOI !', 'Le mölkky t\'attend sur le tabouret, à côté de toi', PAL.kulta, 3200);
      this.emitState();
    },

    onAction: function (d) {
      if (!d || !d.action) return;
      if (d.action.indexOf('shortcut') < 0) this.audio.play('click', this.playerPos(), 0.6);
      switch (d.action) {
        case 'difficulty':
          if (!C.difficulties[d.value]) return;
          this.difficulty = d.value;
          savePref(d.value);
          if (this.phase === 'menu') this.showMenu();
          break;
        case 'start': this.startGame(this.difficulty); break;
        case 'restart': this.startGame(this.difficulty); break;
        case 'menu': this.showMenu(); break;
        case 'menu-shortcut':
          if (this.phase !== 'menu' && this.phase !== 'boot') this.showMenu();
          break;
        case 'restart-shortcut':
          if (this.game) this.startGame(this.difficulty);
          break;
      }
    },

    // ---------------------------------------------------------------- saisie / lancer
    /**
     * Une manette demande à saisir le mölkky. Accepté s'il attend (phase
     * ready) ou s'il est dans l'autre main (passage de main à main), et si
     * la main est à portée ou le vise au laser.
     */
    requestGrab: function (hand) {
      if (!this.game) return false;
      var transfer = this.phase === 'held' && this.heldBy && this.heldBy !== hand && !!this.heldBy.attach;
      if (this.phase !== 'ready' && !transfer) return false;
      var how = hand.reach(this.molkky.el.object3D);
      if (!how || (transfer && how.mode !== 'near')) {
        this.lastMiss = performance.now();
        MK.Debug.set('saisie', 'refusée : main trop loin (' + hand.data.hand + ')');
        return false;
      }
      if (transfer) this.heldBy.drop();
      hand.attach(this.molkky, how);
      this.heldBy = hand;
      this.lastHand = hand.data.hand;
      this.molkky.hold(hand.holder);
      this.phase = 'held';
      MK.Debug.set('saisie', (how.mode === 'near' ? 'à la main' : 'au laser') + ' (' + hand.data.hand + ')');
      return true;
    },

    handComponents: function () {
      var out = [];
      document.querySelectorAll('[mk-hand]').forEach(function (el) { if (el.components['mk-hand']) out.push(el.components['mk-hand']); });
      return out;
    },

    /**
     * En VR, le tabouret se replace à portée de main du joueur (du côté de la
     * main qui a lancé en dernier) : sa position dans la pièce varie.
     */
    placeStoolForPlayer: function () {
      if (!this.isVR() || !this.molkky || this.molkky.state !== 'stand') return;
      var head = this.playerPos();
      var side = this.lastHand === 'left' ? -1 : 1;
      var x = clamp(head.x + side * 0.38, -2, 2);
      var z = Math.max(head.z - 0.12, C.throwLineZ + 0.2);
      var cur = MK.STAND_POSE.position;
      if (Math.hypot(cur.x - x, cur.z - z) > 0.25) {
        MK.moveStool(x, z);
        this.molkky.toStand();
      }
      MK.UI.hint.el.object3D.position.set(head.x, 1.0, Math.max(head.z - 1.0, C.throwLineZ - 0.6));
    },

    canDesktopThrow: function () {
      return this.phase === 'ready' && this.heldBy === this.desktop && !this.isVR();
    },

    releaseFrom: function (owner, velocity, angular) {
      if (owner !== this.heldBy) return;
      if (this.phase !== 'held' && this.phase !== 'ready') return;
      var speed = velocity.length();
      this.heldBy = null;
      if (speed < C.throw.minSpeed) {
        // lâcher accidentel : le lancer ne compte pas
        this.molkky.toStand();
        this.phase = 'ready';
        this.weakThrows = (this.weakThrows || 0) + 1;
        MK.UI.toast('TROP DOUX', speed.toFixed(1).replace('.', ',') + ' m/s : balance le bras plus fort', PAL.kulta, 2200);
        return;
      }
      this.validThrows = (this.validThrows || 0) + 1;
      if (speed > C.throw.maxSpeed) velocity.multiplyScalar(C.throw.maxSpeed / speed);
      this.molkky.release(velocity, angular);
      this.audio.play('whoosh', this.molkky.el.object3D.position, clamp(speed / 7, 0.35, 1), 0.85 + speed / 30);
      this.pins.forEach(function (p) { p.fallenThisThrow = p.isFallen(); p.setHighlight(false); });
      this.phase = 'flying';
      this.flight = { start: this.phys.simTime, restSince: null, speed: speed };
      this.emitState();
    },

    /** Trajectoire à prévisualiser (niveau Facile uniquement). */
    predictedThrow: function () {
      if (!this.game || !this.diff().assist) return null;
      if (this.phase === 'held' && this.heldBy && this.heldBy.estimateVelocity) {
        var v = this.heldBy.estimateVelocity(new THREE.Vector3(), true);
        if (v.length() < 1.2) return null;
        return { origin: this.molkky.el.object3D.position, velocity: v };
      }
      if (this.phase === 'ready' && this.heldBy === this.desktop && this.desktop.charging) {
        return { origin: this.molkky.el.object3D.position, velocity: this.desktop.velocityFor(this.desktop.power, new THREE.Vector3()) };
      }
      return null;
    },

    // ---------------------------------------------------------------- vol et score
    updateFlight: function () {
      var f = this.flight, self = this;
      var elapsed = (this.phys.simTime - f.start) * 1000;
      this.pins.forEach(function (p) {
        if (!p.fallenThisThrow && p.isFallen()) {
          p.fallenThisThrow = true;
          self.audio.play('fall', p.el.object3D.position, 0.8, 0.92 + Math.random() * 0.16);
        }
      });
      if (this.molkky.isLost()) this.phys.removeBody(this.molkky.body);

      // Fin du lancer : plus rien ne se déplace et l'ensemble des quilles tombées
      // ne change plus. Un léger tremblement de contact (rotation lente sur place)
      // n'empêche pas de conclure : il ne peut plus faire tomber ni relever une quille.
      var bodies = this.pins.map(function (p) { return p.body; }).concat([this.molkky.body]);
      var key = this.pins.map(function (p) { return p.isFallen() ? 1 : 0; }).join('');
      var calm = this.phys.allAtRest(bodies, C.settle.linear, C.settle.angular);
      if (calm && key === f.fallenKey) {
        if (f.restSince == null) f.restSince = elapsed;
      } else {
        f.restSince = null;
      }
      f.fallenKey = key;
      var settled = f.restSince != null && elapsed - f.restSince > C.settle.holdMs && elapsed > C.settle.minMs;
      if (settled || elapsed > C.settle.timeoutMs) this.resolveThrow();
    },

    /** Compte les quilles tombées, applique les règles et relève les quilles. */
    resolveThrow: function () {
      var self = this;
      var fallen = this.pins.filter(function (p) { return p.isFallen(); });
      var numbers = fallen.map(function (p) { return p.data.number; });
      var res = MK.Rules.applyThrow(this.game, numbers, now());
      this.game = res.game;
      this.lastRecord = res.record;
      this.flight = null;
      console.info('[Mölkky] lancer', res.record);
      this.feedback(res.record);
      this.refreshScore();

      if (this.game.status === 'ended') { this.endGame(); return; }

      this.phase = 'scoring';
      this.emitState();
      var targets = this.computeRaiseTargets(fallen);
      this.later(350, function () { self.molkky.toStand(); });
      fallen.forEach(function (p, i) {
        self.later(500 + i * 90, function () {
          p.raiseTo(targets[i].x, targets[i].z, 520);
          self.audio.play('raise', p.el.object3D.position, 0.35, 0.9 + Math.random() * 0.2);
        });
      });
      this.later(500 + fallen.length * 90 + 650, function () {
        if (self.phase === 'scoring') { self.phase = 'ready'; self.emitState(); }
      });
    },

    feedback: function (r) {
      var at = this.pinsCenter();
      switch (r.outcome) {
        case 'points':
          MK.UI.toast('+' + r.points,
            r.fallenPins.length === 1 ? 'Quille n° ' + r.fallenPins[0] : r.fallenPins.length + ' quilles tombées', PAL.nurmi);
          this.audio.play('score', at, 0.8);
          break;
        case 'miss':
          MK.UI.toast('RATÉ', '0 point  ·  échec ' + r.misses + ' sur 3', PAL.punamulta);
          this.audio.play('miss', at, 0.8);
          break;
        case 'overflow':
          MK.UI.toast('TROP !', (r.scoreBefore + r.points) + ' dépasse 50 : retour à 25', PAL.kulta, 2800);
          this.audio.play('overflow', at, 0.9);
          break;
        case 'win':
          MK.UI.toast('50 PILE !', 'Victoire en ' + r.throwNumber + ' lancers', PAL.kulta, 2600);
          break;
        case 'lose':
          MK.UI.toast('PERDU', 'Trois lancers de suite sans point', PAL.punamulta, 2600);
          break;
      }
    },

    describeLast: function (r) {
      if (!r) return '';
      if (r.points === 0) return 'aucune quille';
      if (r.overflow) return 'dépassement : retour à 25';
      if (r.fallenPins.length === 1) return 'quille ' + r.fallenPins[0];
      return 'quilles ' + r.fallenPins.join(', ');
    },

    refreshScore: function () {
      var g = this.game;
      if (!g) return;
      MK.UI.updateScore({
        difficulty: this.difficulty,
        score: g.score,
        throwNumber: g.status === 'playing' ? g.throwCount + 1 : g.throwCount,
        lastPoints: this.lastRecord ? this.lastRecord.points : null,
        lastDetail: this.describeLast(this.lastRecord),
        misses: g.misses,
        elapsed: MK.Rules.elapsed(g, now()),
        history: g.history
      });
    },

    endGame: function () {
      var self = this;
      this.phase = 'ended';
      var summary = MK.Rules.summarize(this.game);
      var store = MK.Storage.recordGame(summary);
      var win = this.game.result === 'win';
      this.audio.play(win ? 'win' : 'lose', this.pinsCenter().setY(1.2), 1);
      if (win) this.later(250, function () { self.celebrate(); });
      this.later(900, function () { self.molkky.toStand(); });
      this.later(1800, function () {
        MK.UI.showEnd(Object.assign({}, summary, { isNewBest: store.isNewBest, best: store.best }));
        self.emitState();
      });
      this.emitState();
    },

    /** Victoire : les quilles sautent en l'air. */
    celebrate: function () {
      this.pins.forEach(function (p, i) {
        var b = p.body;
        if (!b.mkInWorld) return;
        b.wakeUp();
        var a = (i / 12) * Math.PI * 2;
        b.velocity.set(Math.cos(a) * 0.9, 3.4 + Math.random() * 1.4, Math.sin(a) * 0.6 - 0.2);
        b.angularVelocity.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 14);
      });
    },

    onImpact: function (body, other, speed) {
      if (this.phase !== 'flying' && this.phase !== 'ended') return;
      var a = body.mkType, b = other.mkType;
      if (a === 'pin' && b === 'molkky') return;               // traité côté mölkky
      if (a === 'pin' && b === 'pin' && body.id > other.id) return;
      var vol = clamp(speed / 4, 0.08, 1);
      var pos = body.position;
      var name = null, rate = 1;
      if (a === 'molkky' && b === 'pin') name = 'hit';
      else if (a === 'pin' && b === 'pin') name = 'clack';
      else if (a === 'molkky' && b === 'ground') name = 'thud';
      else if (a === 'pin' && b === 'ground') { name = 'thud'; rate = 1.7; vol *= 0.7; }
      if (name) this.audio.play(name, pos, vol, rate * (0.94 + Math.random() * 0.12));
    },

    /** Quille tombée hors lancer (appuyée sur le mölkky retiré…) : relevée sans compter. */
    idleCheck: function (dt) {
      this.idleTimer += dt;
      if (this.idleTimer < 500) return;
      this.idleTimer = 0;
      var fallen = this.pins.filter(function (p) {
        return !p.isAnimating() && p.body.mkInWorld && p.isFallen() && p.body.velocity.length() < 0.05;
      });
      if (!fallen.length) return;
      var targets = this.computeRaiseTargets(fallen);
      fallen.forEach(function (p, i) { p.raiseTo(targets[i].x, targets[i].z, 450); });
    },

    updateHighlight: function () {
      var target = null;
      if (this.game && this.diff().assist && (this.phase === 'ready' || this.phase === 'held')) {
        var rest = MK.Rules.TARGET - this.game.score;
        if (rest >= 1 && rest <= 12) target = rest;
      }
      this.pins.forEach(function (p) { p.setHighlight(p.data.number === target && !p.isFallen()); });
    },

    // ---------------------------------------------------------------- boucle
    tick: function (t, dt) {
      var self = this;
      MK.safe('jeu', function () { self.step(t, dt); });
    },

    step: function (t, dt) {
      if (!this.molkky || !dt) return;
      MK.UI.tick(dt);
      var vr = this.isVR();

      // Qui tient le mölkky ?
      if (this.phase === 'ready') {
        if (!vr && !this.heldBy && this.desktop) {
          this.heldBy = this.desktop;
          this.molkky.hold(this.desktop.holder);
        } else if (vr && this.heldBy === this.desktop) {
          this.heldBy = null;
          this.molkky.toStand();
        }
      } else if (this.phase === 'held' && !vr) {
        this.releaseHands();
        this.molkky.toStand();
        this.phase = 'ready';
      }

      if (this.phase === 'flying') this.updateFlight();
      if (this.phase === 'ready' || this.phase === 'held') this.idleCheck(dt);

      // Chronomètre affiché, rafraîchi chaque seconde
      if (this.game && this.game.status === 'playing') {
        var sec = Math.floor(MK.Rules.elapsed(this.game, now()) / 1000);
        if (sec !== this.lastSec) { this.lastSec = sec; MK.UI.updateTimer(sec * 1000); }
      }

      // Aide au geste dans le casque
      var inRange = vr && this.handComponents().some(function (h) { return h.inRange; });
      var missed = this.lastMiss && performance.now() - this.lastMiss < 2500;
      if (vr && this.phase === 'ready') {
        if (inRange) MK.UI.hint.set('SERRE GRIP POUR LE SAISIR', 'tiens-le dans le sens que tu veux');
        else MK.UI.hint.set(missed ? 'TROP LOIN : APPROCHE LA MAIN' : 'APPROCHE TA MAIN DU MÖLKKY',
          'il est sur le tabouret · ou vise-le au laser + GRIP');
      } else if (vr && this.phase === 'held' && (this.validThrows || 0) < 3) {
        MK.UI.hint.set('ORIENTE-LE, BALANCE LE BRAS', 'et relâche le bouton pour lancer');
      } else {
        MK.UI.hint.set(null);
      }
      this.molkky.setGlow(vr && this.phase === 'ready' ? (inRange ? 2 : 1) : 0);

      // Tabouret à portée à chaque nouveau lancer en VR
      if (vr && this.phase === 'ready' && this.prevPhase !== 'ready') this.placeStoolForPlayer();
      this.prevPhase = this.phase;

      MK.Debug.set('mode', vr ? 'casque' : 'écran');
      MK.Debug.set('phase', this.phase + (this.heldBy ? ' (tenu : ' + (this.heldBy === this.desktop ? 'bureau' : this.heldBy.data.hand) + ')' : ''));
      MK.Debug.set('mölkky', this.molkky.state);
      this.updateHighlight();
    }
  });
})();
