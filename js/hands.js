/* =========================================================================
 * Mölkky VR — saisir, orienter et lancer avec les manettes
 * - Saisir : main près du bâton (moins de 20 cm de son axe) puis grip ou
 *   gâchette ; le mölkky est pris à l'endroit touché et garde l'orientation
 *   qu'il avait par rapport à la main. On peut aussi le viser au laser et
 *   serrer : il vient alors dans la main.
 * - Orienter : tant que le bouton est maintenu, le bâton suit la position
 *   ET la rotation de la manette ; il peut passer d'une main à l'autre.
 * - Lancer : au relâchement, sa vitesse (direction + norme) est celle du
 *   mouvement de la main, mesurée sur les positions réellement suivies ;
 *   la rotation de la main (vitesse angulaire) lui est aussi transmise.
 * ========================================================================= */
(function () {
  'use strict';

  var CFG = MK.CONFIG.throw;
  // Prise par défaut (saisie au laser) : le bâton prolonge le poing vers l'avant.
  var HOLD_OFFSET = new THREE.Vector3(0, 0, -0.075);
  var HOLD_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  var GRAB_RADIUS = 0.2;          // m entre la main et l'axe du bâton
  var RAY_RADIUS = 0.1;           // tolérance du laser autour du mölkky (m)
  var SAMPLE_COUNT = 24;          // ~ 0,25 s à 90 Hz

  var tmpQ = new THREE.Quaternion();
  var tmpV = new THREE.Vector3();

  /** Pente (moindres carrés) de la position en fonction du temps, en m/s. */
  function regress(s, out) {
    out.set(0, 0, 0);
    if (s.length < 2) return out;
    var n = s.length, mt = 0, mx = 0, my = 0, mz = 0;
    s.forEach(function (k) { mt += k.t; mx += k.p.x; my += k.p.y; mz += k.p.z; });
    mt /= n; mx /= n; my /= n; mz /= n;
    var den = 0, nx = 0, ny = 0, nz = 0;
    s.forEach(function (k) {
      var d = k.t - mt;
      den += d * d; nx += d * (k.p.x - mx); ny += d * (k.p.y - my); nz += d * (k.p.z - mz);
    });
    if (den === 0) return out;
    return out.set(nx / den, ny / den, nz / den).multiplyScalar(1000);
  }

  AFRAME.registerComponent('mk-hand', {
    schema: { hand: { default: 'right' } },

    init: function () {
      var self = this;
      var tag = this.data.hand === 'left' ? 'G' : 'D';
      // Tampon circulaire de relevés { t (ms), p, q } du centre du bâton
      this.samples = [];
      for (var i = 0; i < SAMPLE_COUNT; i++) this.samples.push({ t: -1, p: new THREE.Vector3(), q: new THREE.Quaternion() });
      this.head = 0;
      this.count = 0;
      this.holding = false;
      this.holdButton = null;
      this.lastEstimate = null;
      this.inRange = false;
      // Prise : position/rotation du centre du bâton dans le repère de la main
      this.offsetPos = HOLD_OFFSET.clone();
      this.offsetQuat = HOLD_ROT.clone();
      this.attract = null;        // transition douce vers la main après saisie
      this.holder = { getPose: function (p, q) { self.visualPose(p, q); } };

      ['grip', 'trigger'].forEach(function (btn) {
        self.el.addEventListener(btn + 'down', function () { MK.safe('main ' + btn, function () { self.onDown(btn); }); });
        self.el.addEventListener(btn + 'up', function () { MK.safe('main ' + btn, function () { self.onUp(btn); }); });
      });
      // B / Y : retour rapide au menu ; X : panneau de diagnostic
      ['bbuttondown', 'ybuttondown'].forEach(function (ev) {
        self.el.addEventListener(ev, function () {
          self.el.sceneEl.emit('mk-action', { action: 'menu-shortcut' });
        });
      });
      this.el.addEventListener('xbuttondown', function () { MK.Debug.toggle(); });

      // Journal des entrées (visible dans le panneau de diagnostic)
      ['gripdown', 'gripup', 'triggerdown', 'triggerup', 'abuttondown', 'bbuttondown',
        'xbuttondown', 'ybuttondown', 'thumbstickdown'].forEach(function (ev) {
        self.el.addEventListener(ev, function () { MK.Debug.input(tag + ' ' + ev); });
      });
      this.el.addEventListener('controllerconnected', function (e) {
        MK.Debug.input(tag + ' connectée : ' + (e.detail && e.detail.name));
      });
    },

    game: function () { return this.el.sceneEl.systems['mk-game']; },

    /** Pose monde de la poignée de la manette. */
    handPose: function (p, q) {
      var o = this.el.object3D;
      o.updateMatrixWorld();
      o.getWorldPosition(p);
      o.getWorldQuaternion(q);
    },

    /** Pose monde du centre du mölkky tenu dans cette main (prise courante). */
    stickPose: function (p, q) {
      this.handPose(p, q);
      tmpV.copy(this.offsetPos).applyQuaternion(q);
      p.add(tmpV);
      q.multiply(this.offsetQuat);
    },

    /** Pose affichée : comme stickPose, avec un court glissement juste après la saisie. */
    visualPose: function (p, q) {
      this.stickPose(p, q);
      var a = this.attract;
      if (!a) return;
      var k = Math.min(1, (performance.now() - a.start) / a.dur);
      var e = 1 - Math.pow(1 - k, 3);
      p.lerpVectors(a.fromP, p, e);
      tmpQ.copy(q);
      q.copy(a.fromQ).slerp(tmpQ, e);
      if (k >= 1) this.attract = null;
    },

    /**
     * Le mölkky est-il à portée ? 'near' : main à moins de 20 cm de son axe ;
     * 'ray' : le laser le vise. Retourne { mode, point } ou null.
     */
    reach: function (object3D) {
      var h = new THREE.Vector3(), hq = new THREE.Quaternion();
      this.handPose(h, hq);
      var c = MK.closestOnMolkky(object3D, h, new THREE.Vector3());
      if (h.distanceTo(c) < GRAB_RADIUS) return { mode: 'near', point: c };
      var rc = this.el.components.raycaster;
      if (rc && rc.data.enabled && rc.raycaster) {
        var ray = rc.raycaster.ray;
        var d = new THREE.Vector3().subVectors(object3D.position, ray.origin);
        var t = d.dot(ray.direction);
        if (t > 0 && t < 8) {
          var perp = d.addScaledVector(ray.direction, -t).length();
          if (perp < RAY_RADIUS + 0.015 * t) return { mode: 'ray', point: object3D.position.clone() };
        }
      }
      return null;
    },

    /** Saisit le mölkky : calcule la prise (à l'endroit touché, orientation conservée). */
    attach: function (molkky, how) {
      var o = molkky.el.object3D;
      var h = new THREE.Vector3(), hq = new THREE.Quaternion();
      this.handPose(h, hq);
      var inv = hq.clone().invert();
      if (how.mode === 'near') {
        // le point touché vient dans la main, l'orientation relative est gardée
        this.offsetQuat.copy(inv).multiply(o.quaternion);
        this.offsetPos.subVectors(o.position, how.point).applyQuaternion(inv);
      } else {
        this.offsetPos.copy(HOLD_OFFSET);
        this.offsetQuat.copy(HOLD_ROT);
      }
      this.attract = { start: performance.now(), dur: how.mode === 'near' ? 120 : 260, fromP: o.position.clone(), fromQ: o.quaternion.clone() };
      this.count = 0;   // l'historique de vitesse repart de la nouvelle prise
    },

    isPointingUI: function () {
      var rc = this.el.components.raycaster;
      return !!(rc && rc.intersectedEls && rc.intersectedEls.length);
    },

    setLaser: function (on) {
      if (!this.el.components.raycaster) return;
      this.el.setAttribute('raycaster', 'enabled', on);
      this.el.setAttribute('raycaster', 'showLine', on);
    },

    onDown: function (btn) {
      if (this.holding) return;
      if (btn === 'trigger' && this.isPointingUI()) return;   // la gâchette sert aux boutons
      if (this.game().requestGrab(this)) {
        this.holding = true;
        this.holdButton = btn;
        this.setLaser(false);
        this.pulse(0.5, 60);
      } else {
        this.pulse(0.1, 25);   // trop loin : petit « non » dans la main
      }
    },

    onUp: function (btn) {
      if (!this.holding || btn !== this.holdButton) return;
      this.holding = false;
      this.setLaser(true);
      var v = this.estimateVelocity(new THREE.Vector3());
      var w = this.estimateAngularVelocity(new THREE.Vector3());
      this.game().releaseFrom(this, v, w);
    },

    /** Lâche sans lancer (passage à l'autre main, retour menu…). */
    drop: function () {
      this.attract = null;
      if (!this.holding) return;
      this.holding = false;
      this.setLaser(true);
    },

    pulse: function (intensity, ms) {
      try {
        var tc = this.el.components['tracked-controls'];
        var gp = tc && tc.controller && tc.controller.gamepad;
        if (gp && gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(intensity, ms);
      } catch (e) { /* pas de vibration */ }
    },

    // Main à portée du mölkky posé : lueur + petite vibration à l'approche.
    tick: function () {
      var game = this.game();
      var near = false;
      if (game && game.molkky && game.isVR() && !this.holding &&
          (game.phase === 'ready' || game.phase === 'held') && game.heldBy !== this) {
        var r = this.reach(game.molkky.el.object3D);
        near = !!(r && r.mode === 'near');
      }
      if (near && !this.inRange) this.pulse(0.15, 20);
      this.inRange = near;
    },

    // Relevé dans tock (après tous les tick) : la pose de la manette a déjà
    // été mise à jour pour cette image, le temps et la position concordent.
    tock: function (t) {
      var s = this.samples[this.head];
      this.stickPose(s.p, s.q);
      s.t = t;
      this.head = (this.head + 1) % SAMPLE_COUNT;
      this.count = Math.min(SAMPLE_COUNT, this.count + 1);
    },

    /** Relevés du plus ancien au plus récent, limités aux `ms` dernières millisecondes. */
    recent: function (ms) {
      var out = [];
      for (var i = this.count; i >= 1; i--) {
        var s = this.samples[(this.head - i + SAMPLE_COUNT) % SAMPLE_COUNT];
        if (s.t >= 0) out.push(s);
      }
      if (!out.length) return out;
      var from = out[out.length - 1].t - ms;
      var inWindow = out.filter(function (k) { return k.t >= from; });
      // Si la fréquence d'images chute, on garde au moins les 4 derniers relevés.
      return inWindow.length >= 4 ? inWindow : out.slice(-4);
    },

    /**
     * Vitesse du centre du bâton au lâcher (m/s, repère monde), mesurée sur
     * les positions réellement suivies (ce que le joueur voit) :
     * - « tendance » : régression linéaire sur les 5 derniers relevés (~55 ms) ;
     * - « pic » : plus grande vitesse image par image des ~110 dernières ms,
     *   pour ne pas pénaliser un lâcher un peu tardif.
     * La vitesse annoncée par le casque (XRPose.linearVelocity) est seulement
     * affichée dans le diagnostic : elle est bruitée et son repère varie selon
     * les navigateurs.
     */
    estimateVelocity: function (out, quiet) {
      var s = this.recent(110);
      // pic : régressions glissantes sur 3 relevés (lisse les à-coups d'images)
      var peak = new THREE.Vector3(), v = new THREE.Vector3();
      for (var i = 3; i <= s.length; i++) {
        regress(s.slice(i - 3, i), v);
        if (v.lengthSq() > peak.lengthSq()) peak.copy(v);
      }
      var trend = regress(s.slice(-5), new THREE.Vector3());
      var dir = trend.lengthSq() > 1e-6 ? trend.clone() : peak.clone();
      var t0 = trend.length();
      var speed = Math.max(t0, Math.min(0.9 * peak.length(), 1.4 * t0 + 0.5));
      if (dir.lengthSq() < 1e-9) out.set(0, 0, 0);
      else out.copy(dir.normalize()).multiplyScalar(speed * CFG.vrBoost);
      if (quiet) return out;

      var xr = MK.safe('vitesse casque', this.xrVelocity.bind(this));
      this.lastEstimate = { speed: out.length(), trend: trend.length(), peak: peak.length(), xr: xr ? xr.length() : null, samples: s.length };
      MK.Debug.set('lâcher', out.length().toFixed(2) + ' m/s  (tendance ' + trend.length().toFixed(1) +
        ' · pic ' + peak.length().toFixed(1) + ' · casque ' + (xr ? xr.length().toFixed(1) : '—') + ' · ' + s.length + ' relevés)');
      return out;
    },

    /** Vitesse fournie par le casque (v + ω × r), ou null. */
    xrVelocity: function () {
      var pose = this.xrPose();
      if (!pose || !pose.linearVelocity) return null;
      var lv = pose.linearVelocity, av = pose.angularVelocity;
      var v = new THREE.Vector3(lv.x, lv.y, lv.z);
      if (av) {
        var grip = new THREE.Vector3();
        this.el.object3D.getWorldPosition(grip);
        var center = new THREE.Vector3(), q = new THREE.Quaternion();
        this.stickPose(center, q);
        v.add(new THREE.Vector3(av.x, av.y, av.z).cross(center.sub(grip)));
      }
      if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) return null;
      return this.toWorld(v);
    },

    estimateAngularVelocity: function (out) {
      var s = this.recent(60);
      out.set(0, 0, 0);
      if (s.length >= 2) {
        var a = s[0], b = s[s.length - 1];
        var dt = (b.t - a.t) / 1000;
        if (dt > 0) {
          tmpQ.copy(a.q).invert().premultiply(b.q);            // rotation a -> b
          if (tmpQ.w < 0) { tmpQ.x *= -1; tmpQ.y *= -1; tmpQ.z *= -1; tmpQ.w *= -1; }
          var angle = 2 * Math.acos(Math.min(1, tmpQ.w));
          var sin = Math.sqrt(1 - tmpQ.w * tmpQ.w);
          if (sin > 1e-5) out.set(tmpQ.x / sin, tmpQ.y / sin, tmpQ.z / sin).multiplyScalar(angle / dt);
        }
      }
      if (out.length() > 30) out.setLength(30);
      return out;
    },

    xrPose: function () {
      var tc = this.el.components['tracked-controls'];
      return tc && tc.pose ? tc.pose : null;
    },

    /** Les vitesses XR sont dans le repère du rig : on les passe en repère monde. */
    toWorld: function (v) {
      var parent = this.el.object3D.parent;
      if (parent) {
        parent.getWorldQuaternion(tmpQ);
        v.applyQuaternion(tmpQ);
      }
      return v;
    }
  });
})();
