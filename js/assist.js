/* =========================================================================
 * Mölkky VR — assistance visuelle (niveau Facile)
 * - trajectoire prédite (pointillés) pendant que l'on arme / balance le bras
 * - anneau au point d'impact prévu
 * - ligne de visée tracée dans l'herbe vers le centre des quilles
 * La prédiction reprend la gravité et l'amortissement du moteur physique.
 * ========================================================================= */
(function () {
  'use strict';

  var PAL = MK.CONFIG.palette;
  var DOTS = 36;
  var G = MK.CONFIG.physics.gravity;
  var DAMP = 0.12;   // même amortissement linéaire que le corps du mölkky

  AFRAME.registerComponent('mk-assist', {
    init: function () {
      var mat = new THREE.MeshBasicMaterial({ color: PAL.kulta, toneMapped: false, transparent: true, opacity: 0.9 });
      this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), mat, DOTS);
      this.dots.frustumCulled = false;
      this.dots.visible = false;

      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.15, 32),
        new THREE.MeshBasicMaterial({ color: PAL.kulta, toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.visible = false;

      // ligne de visée en tirets
      var c = MK.Tex.canvas(16, 256), ctx = c.getContext('2d');
      for (var y = 0; y < 256; y += 32) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, y, 16, 18); }
      var tex = MK.Tex.toTexture(c);
      tex.wrapT = THREE.RepeatWrapping;
      this.guideTex = tex;
      this.guide = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1),
        new THREE.MeshBasicMaterial({ map: tex, color: PAL.kulta, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
      this.guide.rotation.x = -Math.PI / 2;
      this.guide.visible = false;

      var g = new THREE.Group();
      g.add(this.dots); g.add(this.ring); g.add(this.guide);
      this.el.setObject3D('assist', g);

      this.m = new THREE.Matrix4();
      this.p = new THREE.Vector3();
      this.v = new THREE.Vector3();
    },

    /** Ligne de visée entre la planche et la première rangée de quilles. */
    setGuide: function (on, fromZ, toZ) {
      this.guide.visible = on;
      if (!on) return;
      var len = Math.abs(fromZ - toZ);
      this.guide.scale.set(1, len, 1);
      this.guide.position.set(0, 0.006, (fromZ + toZ) / 2);
      this.guideTex.repeat.set(1, len * 3);
    },

    hidePrediction: function () {
      this.dots.visible = false;
      this.ring.visible = false;
    },

    tick: function () {
      var self = this;
      MK.safe('assistance', function () { self.update(); });
    },

    update: function () {
      var game = this.el.sceneEl.systems['mk-game'];
      var pred = game && game.predictedThrow ? game.predictedThrow() : null;
      if (!pred) { this.hidePrediction(); return; }

      // intégration balistique jusqu'au sol, un point tous les 3 pas
      var p = this.p.copy(pred.origin), v = this.v.copy(pred.velocity);
      var dt = 1 / 90, i = 0, step = 0, landed = false;
      var damp = Math.pow(1 - DAMP, dt);
      while (step < 400) {
        v.y += G * dt;
        v.multiplyScalar(damp);
        p.addScaledVector(v, dt);
        step++;
        if (p.y <= 0.02) { landed = true; break; }
        if (step % 3 === 0 && i < DOTS) {
          this.m.makeTranslation(p.x, p.y, p.z);
          this.dots.setMatrixAt(i++, this.m);
        }
      }
      this.dots.count = i;
      this.dots.instanceMatrix.needsUpdate = true;
      this.dots.visible = i > 0;
      this.ring.visible = landed;
      if (landed) this.ring.position.set(p.x, 0.008, p.z);
    }
  });
})();
