/* =========================================================================
 * Mölkky VR — mode bureau (sans casque)
 * Pour tester et faire la démonstration sur un écran : on vise en
 * faisant glisser la souris, on maintient ESPACE pour doser la force
 * (jauge qui monte puis redescend) et on relâche pour lancer.
 * ========================================================================= */
(function () {
  'use strict';

  var CFG = MK.CONFIG.throw;
  var UP = new THREE.Vector3(0, 1, 0);
  var CYCLE_MS = 1700;

  AFRAME.registerComponent('mk-desktop', {
    init: function () {
      var self = this;
      this.charging = false;
      this.power = 0;
      this.chargeStart = 0;
      this.holder = { getPose: function (p, q) { self.pose(p, q); } };
      this.gauge = document.getElementById('jauge');
      this.gaugeFill = document.getElementById('jauge-niveau');

      // Bouton « maintenir pour lancer » : souris, écran tactile, pointeur du
      // navigateur du casque en mode 2D (sans clavier).
      this.button = document.getElementById('lancer');
      if (this.button) {
        var b = this.button;
        b.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          try { b.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
          self.startCharge();
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
          b.addEventListener(ev, function () { self.releaseCharge(); });
        });
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      }

      // Sur écran, regard légèrement baissé vers le terrain au démarrage.
      this.el.addEventListener('loaded', function () {
        var lc = document.querySelector('[look-controls]');
        if (lc && lc.components['look-controls']) lc.components['look-controls'].pitchObject.rotation.x = -0.09;
      });

      window.addEventListener('keydown', function (e) {
        if (e.code === 'KeyR' && !e.repeat) self.el.emit('mk-action', { action: 'restart-shortcut' });
        if (e.code === 'KeyM' && !e.repeat) self.el.emit('mk-action', { action: 'menu-shortcut' });
        if (e.code !== 'Space') return;
        e.preventDefault();
        if (!e.repeat) self.startCharge();
      });
      window.addEventListener('keyup', function (e) {
        if (e.code !== 'Space') return;
        e.preventDefault();
        self.releaseCharge();
      });
    },

    game: function () { return this.el.sceneEl.systems['mk-game']; },

    startCharge: function () {
      if (this.game().isVR()) return;
      if (!this.game().canDesktopThrow()) return;
      this.charging = true;
      this.chargeStart = performance.now();
      this.power = 0;
    },

    releaseCharge: function () {
      if (!this.charging) return;
      this.charging = false;
      var v = this.velocityFor(this.power, new THREE.Vector3());
      var w = this.spin(new THREE.Vector3());
      this.power = 0;
      this.game().releaseFrom(this, v, w);
    },

    /** Force entre 0 et 1, en aller-retour pour obliger à doser. */
    powerAt: function (now) {
      var k = ((now - this.chargeStart) % CYCLE_MS) / CYCLE_MS;
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * k);
    },

    camBasis: function () {
      var cam = this.el.sceneEl.camera;
      var pos = new THREE.Vector3(), q = new THREE.Quaternion();
      cam.getWorldPosition(pos);
      cam.getWorldQuaternion(q);
      var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      var flat = new THREE.Vector3(fwd.x, 0, fwd.z);
      if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
      flat.normalize();
      var right = new THREE.Vector3().crossVectors(flat, UP).normalize();
      return { pos: pos, fwd: fwd, flat: flat, right: right, pitch: Math.asin(Math.max(-1, Math.min(1, fwd.y))) };
    },

    /** Vitesse de lancer : direction du regard relevée d'environ 24°. */
    velocityFor: function (power, out) {
      var b = this.camBasis();
      var speed = CFG.desktopMinSpeed + (CFG.desktopMaxSpeed - CFG.desktopMinSpeed) * power;
      var elev = Math.max(0.08, Math.min(1.05, b.pitch + 0.42));
      return out.copy(b.flat).multiplyScalar(Math.cos(elev) * speed).addScaledVector(UP, Math.sin(elev) * speed);
    },

    /** Rotation vers l'avant, comme un lancer à la cuillère. */
    spin: function (out) {
      return out.copy(this.camBasis().right).multiplyScalar(-7);
    },

    /** Le mölkky est tenu en bas à droite du champ de vision ; il recule en armant. */
    pose: function (p, q) {
      var b = this.camBasis();
      var k = this.charging ? this.power : 0;
      p.copy(b.pos)
        .addScaledVector(b.flat, 0.5 - 0.16 * k)
        .addScaledVector(b.right, 0.22)
        .addScaledVector(UP, -0.3 - 0.05 * k);
      var yaw = Math.atan2(-b.flat.x, -b.flat.z);
      q.setFromEuler(new THREE.Euler(-0.5 - 0.6 * k, yaw, -0.35, 'YXZ'));
    },

    tick: function () {
      if (this.charging) {
        if (!this.game().canDesktopThrow()) { this.charging = false; }
        else this.power = this.powerAt(performance.now());
      }
      if (this.gauge) {
        this.gauge.classList.toggle('visible', this.charging);
        if (this.charging) this.gaugeFill.style.width = Math.round(this.power * 100) + '%';
      }
      if (this.button) {
        var show = this.charging || this.game().canDesktopThrow();
        if (this.button.hidden === show) this.button.hidden = !show;
        var label = this.charging ? 'Relâcher pour lancer' : 'Maintenir pour lancer';
        if (this.button.textContent !== label) this.button.textContent = label;
      }
    }
  });
})();
