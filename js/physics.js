/* =========================================================================
 * Mölkky VR — système physique (cannon-es)
 * Monde physique à pas fixe (1/180 s) pour que le mölkky, rapide et fin,
 * ne traverse pas les quilles. Les corps actifs sont recopiés à chaque image
 * dans les objets 3D A-Frame correspondants, avec interpolation.
 * ========================================================================= */
(function () {
  'use strict';

  var tmpV = new CANNON.Vec3();
  var tmpQ = new CANNON.Quaternion();

  AFRAME.registerSystem('mk-physics', {
    init: function () {
      var cfg = MK.CONFIG.physics;
      this.cfg = cfg;
      this.paused = false;
      this.acc = 0;
      this.simTime = 0;     // temps simulé cumulé (s)
      this.links = [];
      this.impactListeners = [];

      var world = new CANNON.World();
      world.gravity.set(0, cfg.gravity, 0);
      world.broadphase = new CANNON.SAPBroadphase(world);
      world.allowSleep = true;
      world.solver.iterations = 18;
      this.world = world;

      // Matériaux : herbe / bois
      var ground = new CANNON.Material('herbe');
      var wood = new CANNON.Material('bois');
      this.materials = { ground: ground, wood: wood };
      world.addContactMaterial(new CANNON.ContactMaterial(ground, wood, {
        friction: 0.55,
        restitution: 0.14,
        contactEquationStiffness: 5e6,
        contactEquationRelaxation: 3
      }));
      world.addContactMaterial(new CANNON.ContactMaterial(wood, wood, {
        friction: 0.32,
        restitution: 0.38,
        contactEquationStiffness: 5e6,
        contactEquationRelaxation: 3
      }));

      // Sol infini
      var groundBody = new CANNON.Body({ mass: 0, material: ground });
      groundBody.addShape(new CANNON.Plane());
      groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      groundBody.mkType = 'ground';
      world.addBody(groundBody);
      this.groundBody = groundBody;
    },

    /** Associe un corps à un Object3D : la position du corps pilotera l'objet. */
    link: function (body, object3D) {
      var self = this;
      this.links.push({ body: body, object3D: object3D });
      body.mkInWorld = false;
      body.mkLastImpact = 0;
      body.addEventListener('collide', function (e) {
        var now = performance.now();
        if (now - body.mkLastImpact < 60) return;
        var speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (speed < 0.25) return;
        body.mkLastImpact = now;
        for (var i = 0; i < self.impactListeners.length; i++) {
          self.impactListeners[i](body, e.body, speed);
        }
      });
    },

    onImpact: function (fn) { this.impactListeners.push(fn); },

    addBody: function (body) {
      if (body.mkInWorld) return;
      this.world.addBody(body);
      body.mkInWorld = true;
    },

    removeBody: function (body) {
      if (!body.mkInWorld) return;
      this.world.removeBody(body);
      body.mkInWorld = false;
    },

    /** Place un corps sans vitesse ni interpolation parasite. */
    teleport: function (body, pos, quat) {
      body.position.set(pos.x, pos.y, pos.z);
      body.previousPosition.copy(body.position);
      body.interpolatedPosition.copy(body.position);
      if (quat) {
        body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
        body.previousQuaternion.copy(body.quaternion);
        body.interpolatedQuaternion.copy(body.quaternion);
      }
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.force.set(0, 0, 0);
      body.torque.set(0, 0, 0);
    },

    /** Vrai si tous les corps actifs donnés sont quasi immobiles. */
    allAtRest: function (bodies, lin, ang) {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        if (!b.mkInWorld || b.sleepState === CANNON.Body.SLEEPING) continue;
        if (b.velocity.length() > lin || b.angularVelocity.length() > ang) return false;
      }
      return true;
    },

    /** Avance la simulation d'un temps donné (utilisé aussi par les tests). */
    advance: function (seconds) {
      var h = this.cfg.step;
      this.acc += seconds;
      var n = 0;
      while (this.acc >= h && n < this.cfg.maxSubSteps) {
        this.world.step(h);
        this.acc -= h;
        this.simTime += h;
        n++;
      }
      // Image trop lente : on abandonne le retard plutôt que d'accumuler.
      if (this.acc > h) this.acc = 0;
    },

    sync: function () {
      var alpha = this.acc / this.cfg.step;
      for (var i = 0; i < this.links.length; i++) {
        var l = this.links[i];
        var b = l.body;
        if (!b.mkInWorld || b.mkManual) continue;
        b.previousPosition.lerp(b.position, alpha, tmpV);
        b.previousQuaternion.slerp(b.quaternion, alpha, tmpQ);
        if (b.sleepState === CANNON.Body.SLEEPING) {
          tmpV.copy(b.position);
          tmpQ.copy(b.quaternion);
        }
        l.object3D.position.set(tmpV.x, tmpV.y, tmpV.z);
        l.object3D.quaternion.set(tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w).normalize();
      }
    },

    tick: function (t, dt) {
      if (this.paused || !dt) return;
      var self = this;
      MK.safe('physique', function () {
        self.advance(Math.min(dt / 1000, 0.1));
        self.sync();
      });
    }
  });
})();
