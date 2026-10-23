/* =========================================================================
 * Mölkky VR — animaux du pré
 * Lapins, cerfs et un ours se promènent autour du terrain (jamais dans
 * l'aire de jeu, en évitant les arbres). Un mölkky en vol qui en touche
 * un le met K.O. : il ricoche, l'animal tombe sur le flanc avec des étoiles
 * au-dessus de la tête, puis se relève et s'enfuit.
 * Les animaux ne sont pas des corps physiques : la collision avec le
 * mölkky est testée à la main (sphères englobantes), ce qui laisse la
 * simulation des quilles intacte.
 * ========================================================================= */
(function () {
  'use strict';

  var M = MK.CONFIG.molkky;
  var PAL = MK.CONFIG.palette;
  var UP = new THREE.Vector3(0, 1, 0);
  var KO_MS = 5000, FALL_S = 0.35, GETUP_S = 0.6;

  // Aire de jeu (terrain + planche + joueur) : interdite aux animaux.
  function inCourt(x, z) { return Math.abs(x) < 3.8 && z > -10 && z < 2; }

  function mat(color) { return new THREE.MeshStandardMaterial({ color: color, roughness: 0.95, metalness: 0, flatShading: true }); }
  var SPHERE = new THREE.IcosahedronGeometry(1, 1);

  /** Ajoute une forme à parent (sphère par défaut), ombres comprises. */
  function part(parent, geo, m, x, y, z, sx, sy, sz) {
    var mesh = new THREE.Mesh(geo || SPHERE, m);
    mesh.position.set(x, y, z);
    if (sx != null) mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Repère de collision : un point du modèle et son rayon (en mètres, avant échelle). */
  function marker(list, parent, x, y, z, r) {
    var o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    list.push({ obj: o, r: r });
  }

  /** Patte articulée à la hanche : pivot + cylindre + sabot/pied. */
  function leg(parent, x, y, z, r, len, m, footM) {
    var pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    part(pivot, new THREE.CylinderGeometry(r, r * 0.8, len, 6), m, 0, -len / 2, 0);
    if (footM) part(pivot, new THREE.CylinderGeometry(r * 0.9, r * 1.05, len * 0.1, 6), footM, 0, -len * 0.95, 0.01);
    return pivot;
  }

  // ------------------------------------------------------------ modèles
  // Repère local : l'animal regarde vers +z, les pieds en y = 0.
  var BUILD = {
    lapin: function (model, hits) {
      var fur = mat('#8C7A62'), light = mat('#E9E1D2'), dark = mat('#1E1712'), pink = mat('#D9A3A0');
      part(model, null, fur, 0, 0.13, 0, 0.11, 0.11, 0.16);
      part(model, null, fur, 0, 0.24, 0.13, 0.075, 0.075, 0.085);
      var ears = [-1, 1].map(function (s) {
        var e = new THREE.Group();
        e.position.set(s * 0.035, 0.3, 0.11);
        e.rotation.set(-0.25, 0, s * -0.2);
        part(e, null, fur, 0, 0.07, 0, 0.022, 0.075, 0.012);
        part(e, null, pink, 0, 0.07, 0.006, 0.014, 0.06, 0.008);
        model.add(e);
        return e;
      });
      part(model, null, light, 0, 0.15, -0.16, 0.045, 0.045, 0.045);
      part(model, null, dark, -0.045, 0.26, 0.18, 0.012, 0.012, 0.012);
      part(model, null, dark, 0.045, 0.26, 0.18, 0.012, 0.012, 0.012);
      part(model, null, pink, 0, 0.235, 0.215, 0.012, 0.01, 0.01);
      part(model, null, fur, -0.07, 0.035, -0.05, 0.035, 0.03, 0.08);
      part(model, null, fur, 0.07, 0.035, -0.05, 0.035, 0.03, 0.08);
      part(model, null, light, -0.035, 0.03, 0.11, 0.02, 0.03, 0.03);
      part(model, null, light, 0.035, 0.03, 0.11, 0.02, 0.03, 0.03);
      marker(hits, model, 0, 0.14, 0, 0.17);
      marker(hits, model, 0, 0.26, 0.14, 0.11);
      var head = new THREE.Object3D(); head.position.set(0, 0.32, 0.13); model.add(head);
      return { ears: ears, head: head, legs: [] };
    },

    cerf: function (model, hits) {
      var fur = mat('#9A6A3E'), light = mat('#E6D6B8'), dark = mat('#2A1E16'), hoof = mat('#3A2A1E'), horn = mat('#CDB894');
      part(model, null, fur, 0, 0.98, 0, 0.27, 0.3, 0.6);
      part(model, null, light, 0, 0.86, 0.02, 0.2, 0.18, 0.45);
      part(model, null, light, 0, 1.06, -0.6, 0.06, 0.1, 0.05);
      var neck = new THREE.Group();
      neck.position.set(0, 1.12, 0.45);
      model.add(neck);
      var n = part(neck, new THREE.CylinderGeometry(0.08, 0.13, 0.6, 7), fur, 0, 0.25, 0.08);
      n.rotation.x = 0.4;
      var head = new THREE.Group();
      head.position.set(0, 0.55, 0.2);
      neck.add(head);
      part(head, null, fur, 0, 0, 0, 0.1, 0.11, 0.17);
      part(head, null, fur, 0, -0.03, 0.15, 0.065, 0.065, 0.1);
      part(head, null, dark, 0, -0.02, 0.25, 0.03, 0.025, 0.02);
      part(head, null, dark, -0.075, 0.03, 0.08, 0.018, 0.018, 0.018);
      part(head, null, dark, 0.075, 0.03, 0.08, 0.018, 0.018, 0.018);
      [-1, 1].forEach(function (s) {
        var ear = part(head, null, fur, s * 0.12, 0.09, -0.05, 0.07, 0.03, 0.025);
        ear.rotation.z = s * 0.4;
        // bois : une perche et deux andouillers
        var beam = new THREE.Group();
        beam.position.set(s * 0.05, 0.1, -0.02);
        beam.rotation.set(-0.35, 0, s * -0.45);
        head.add(beam);
        part(beam, new THREE.CylinderGeometry(0.012, 0.02, 0.42, 5), horn, 0, 0.21, 0);
        [[0.14, 0.7], [0.3, 0.9]].forEach(function (t) {
          var tine = part(beam, new THREE.CylinderGeometry(0.008, 0.014, 0.16, 5), horn, 0, t[0], 0.06);
          tine.rotation.x = t[1];
        });
      });
      var legs = [[-0.15, 0.4], [0.15, 0.4], [-0.15, -0.4], [0.15, -0.4]].map(function (c) {
        return leg(model, c[0], 0.85, c[1], 0.04, 0.85, fur, hoof);
      });
      marker(hits, model, 0, 0.98, -0.35, 0.32);
      marker(hits, model, 0, 0.98, 0.1, 0.34);
      marker(hits, model, 0, 1.0, 0.45, 0.3);
      marker(hits, model, 0, 0.45, 0.4, 0.17);
      marker(hits, model, 0, 0.45, -0.4, 0.17);
      marker(hits, head, 0, 0, 0.05, 0.2);
      marker(hits, head, 0, 0.3, -0.1, 0.22);
      return { neck: neck, head: head, legs: legs };
    },

    ours: function (model, hits) {
      var fur = mat('#4A3426'), muzzle = mat('#8A6A4C'), dark = mat('#17110D');
      part(model, null, fur, 0, 0.72, -0.05, 0.48, 0.48, 0.82);
      part(model, null, fur, 0, 0.92, 0.25, 0.42, 0.38, 0.4);  // bosse des épaules
      part(model, null, fur, 0, 0.68, -0.85, 0.08, 0.08, 0.06);
      var neck = new THREE.Group();
      neck.position.set(0, 0.85, 0.65);
      model.add(neck);
      var head = new THREE.Group();
      head.position.set(0, 0.05, 0.25);
      neck.add(head);
      part(head, null, fur, 0, 0, 0, 0.26, 0.24, 0.26);
      part(head, null, muzzle, 0, -0.06, 0.24, 0.12, 0.1, 0.14);
      part(head, null, dark, 0, -0.02, 0.37, 0.05, 0.035, 0.03);
      part(head, null, dark, -0.11, 0.07, 0.2, 0.028, 0.028, 0.028);
      part(head, null, dark, 0.11, 0.07, 0.2, 0.028, 0.028, 0.028);
      part(head, null, fur, -0.18, 0.2, -0.02, 0.07, 0.07, 0.04);
      part(head, null, fur, 0.18, 0.2, -0.02, 0.07, 0.07, 0.04);
      var legs = [[-0.28, 0.42], [0.28, 0.42], [-0.28, -0.5], [0.28, -0.5]].map(function (c) {
        return leg(model, c[0], 0.55, c[1], 0.13, 0.58, fur, dark);
      });
      marker(hits, model, 0, 0.75, -0.45, 0.5);
      marker(hits, model, 0, 0.8, 0.2, 0.55);
      marker(hits, model, 0, 0.3, 0, 0.35);
      marker(hits, head, 0, 0, 0.08, 0.32);
      return { neck: neck, head: head, legs: legs };
    }
  };

  // Comportement par espèce. h / w : hauteur du centre du corps et
  // demi-largeur (pour le coucher sur le flanc sans le faire entrer dans le sol).
  var SPECIES = {
    lapin: { name: 'Le lapin', speed: 1.5, turn: 6, idle: [0.6, 3], h: 0.13, w: 0.1, stride: 9, graze: 0 },
    cerf: { name: 'Le cerf', speed: 0.85, turn: 2, idle: [2, 6], h: 0.98, w: 0.25, stride: 5.5, graze: 1.3 },
    ours: { name: 'L\'ours', speed: 0.55, turn: 1.4, idle: [3, 8], h: 0.72, w: 0.42, stride: 4, graze: 0.6 }
  };

  // Où chacun se promène : rectangles x/z autour du terrain, à portée de lancer.
  var HERD = [
    { kind: 'lapin', x: [3.9, 7], z: [-8, 1.5], s: 1 },
    { kind: 'lapin', x: [-7, -3.9], z: [-8, 1.5], s: 0.9 },
    { kind: 'lapin', x: [-3, 3], z: [-12.5, -10.3], s: 1.05 },
    { kind: 'cerf', x: [-10, -4.2], z: [-10, -1], s: 1 },
    { kind: 'cerf', x: [-3.5, 4], z: [-15, -10.6], s: 0.9 },
    { kind: 'ours', x: [5, 12], z: [-14, -4], s: 1 }
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /** Distance minimale entre un segment (sol) et un point. */
  function segDist2(ax, az, bx, bz, px, pz) {
    var dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    var t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    var x = ax + t * dx - px, z = az + t * dz - pz;
    return x * x + z * z;
  }

  function starGeometry() {
    var s = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.035 : 0.08;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false });
  }

  AFRAME.registerComponent('mk-animals', {
    init: function () {
      var self = this;
      this.root = new THREE.Group();
      this.trees = MK.treeSpots || [];
      this.prevMolkky = new THREE.Vector3();
      this.hadMolkky = false;
      var starMat = new THREE.MeshBasicMaterial({ color: PAL.kulta, side: THREE.DoubleSide, fog: false });
      var starGeo = starGeometry();
      this.animals = HERD.map(function (spec) {
        var sp = SPECIES[spec.kind];
        var group = new THREE.Group(), roll = new THREE.Group(), model = new THREE.Group();
        roll.position.y = sp.h;
        model.position.y = -sp.h;
        group.add(roll); roll.add(model);
        group.scale.setScalar(spec.s);
        var hits = [];
        var rig = BUILD[spec.kind](model, hits);
        var stars = new THREE.Group();
        for (var i = 0; i < 4; i++) {
          var st = new THREE.Mesh(starGeo, starMat);
          var a = i * Math.PI / 2;
          st.position.set(Math.cos(a) * 0.22, (i % 2) * 0.04, Math.sin(a) * 0.22);
          stars.add(st);
        }
        stars.visible = false;
        self.root.add(stars);
        var an = {
          kind: spec.kind, sp: sp, spec: spec, group: group, roll: roll, rig: rig, hits: hits, stars: stars,
          state: 'idle', timer: rand(0, 2), heading: rand(-Math.PI, Math.PI), target: null,
          phase: Math.random() * 10, rush: 1, koAt: 0, rollSign: 1, grazing: 0
        };
        var start = self.pickSpot(an, null);
        group.position.set(start.x, 0, start.z);
        group.rotation.y = an.heading;
        self.root.add(group);
        return an;
      });
      this.el.setObject3D('animals', this.root);
    },

    /** Point libre de la zone de l'animal (loin des arbres et du terrain). */
    pickSpot: function (an, from, far) {
      var best = null, bestD = -1;
      for (var k = 0; k < 40; k++) {
        var x = rand(an.spec.x[0], an.spec.x[1]), z = rand(an.spec.z[0], an.spec.z[1]);
        if (inCourt(x, z)) continue;
        var ok = true;
        for (var i = 0; i < this.trees.length && ok; i++) {
          var t = this.trees[i], clear = 1.0 + an.spec.s * (an.kind === 'lapin' ? 0.2 : 0.9);
          if (from) ok = segDist2(from.x, from.z, x, z, t.x, t.z) > clear * clear;
          else ok = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z) > clear * clear;
        }
        if (!ok) continue;
        if (!far) return { x: x, z: z };
        var d = (x - from.x) * (x - from.x) + (z - from.z) * (z - from.z);
        if (d > bestD) { bestD = d; best = { x: x, z: z }; }
      }
      return best || (from ? null : { x: an.spec.x[0], z: an.spec.z[0] });
    },

    // ---------------------------------------------------------------- collision
    /** Le mölkky en vol touche-t-il un animal ? Teste aussi le milieu du déplacement. */
    checkHits: function () {
      var game = MK.game, mk = game && game.molkky;
      if (!mk || mk.state !== 'flying' || !mk.body.mkInWorld) { this.hadMolkky = false; return; }
      var o = mk.el.object3D, cur = o.position;
      if (!this.hadMolkky) this.prevMolkky.copy(cur);
      this.hadMolkky = true;
      var v = mk.body.velocity;
      if (v.length() < 1) { this.prevMolkky.copy(cur); return; }
      var axis = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
      var c = new THREE.Vector3(), q = new THREE.Vector3(), w = new THREE.Vector3();
      for (var i = 0; i < this.animals.length; i++) {
        var an = this.animals[i];
        if (an.state === 'ko' || an.state === 'getup') continue;
        var gp = an.group.position;
        if ((gp.x - cur.x) * (gp.x - cur.x) + (gp.z - cur.z) * (gp.z - cur.z) > 9) continue;
        an.group.updateMatrixWorld(true);
        for (var j = 0; j < an.hits.length; j++) {
          var hit = an.hits[j], r = hit.r * an.spec.s + M.radius;
          hit.obj.getWorldPosition(w);
          for (var s = 0.5; s <= 1; s += 0.5) {
            c.lerpVectors(this.prevMolkky, cur, s);
            var t = THREE.MathUtils.clamp(axis.dot(q.subVectors(w, c)), -M.length / 2, M.length / 2);
            q.copy(c).addScaledVector(axis, t);
            if (q.distanceToSquared(w) < r * r) {
              this.knockOut(an, mk, q, w);
              this.prevMolkky.copy(cur);
              return;
            }
          }
        }
      }
      this.prevMolkky.copy(cur);
    },

    knockOut: function (an, mk, contact, center) {
      var v = mk.body.velocity;
      // ricochet du mölkky sur l'animal (rebond amorti)
      var n = new THREE.Vector3().subVectors(contact, center);
      if (n.lengthSq() < 1e-6) n.set(-v.x, 0, -v.z);
      n.normalize();
      var vn = v.x * n.x + v.y * n.y + v.z * n.z;
      if (vn < 0) {
        v.x -= 1.35 * vn * n.x; v.y -= 1.35 * vn * n.y; v.z -= 1.35 * vn * n.z;
      }
      v.scale(0.55, v);
      mk.body.wakeUp();
      // l'animal tombe du côté où on l'a frappé
      var h = an.heading, rightX = Math.cos(h), rightZ = -Math.sin(h);
      an.rollSign = (v.x * rightX + v.z * rightZ) > 0 ? 1 : -1;
      an.state = 'ko';
      an.koAt = performance.now();
      an.timer = 0;
      an.stars.visible = true;
      var game = MK.game, pos = an.group.position;
      if (game && game.audio) {
        game.audio.play('thud', contact, 1, an.kind === 'lapin' ? 1.6 : (an.kind === 'ours' ? 0.6 : 0.9));
        game.audio.play('overflow', pos, 0.5, an.kind === 'lapin' ? 1.5 : 1);
      }
      if (MK.UI && MK.UI.toast) MK.UI.toast('K.O. !', an.sp.name + ' est sonné', PAL.kulta, 1800);
      MK.Debug.set('animal', an.kind + ' K.O.');
    },

    // ---------------------------------------------------------------- animation
    updateAnimal: function (an, dt, t) {
      var sp = an.sp, g = an.group, rig = an.rig;
      var moving = false;

      if (an.state === 'ko' || an.state === 'getup') {
        var el = (performance.now() - an.koAt) / 1000, k;
        if (an.state === 'ko') {
          k = Math.min(1, el / FALL_S);
          k = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 4) : 1;   // chute avec petit rebond
          if (el * 1000 > KO_MS) { an.state = 'getup'; an.koAt = performance.now(); }
        } else {
          k = 1 - Math.min(1, el / GETUP_S);
          if (k <= 0) {
            an.state = 'walk';
            an.stars.visible = false;
            an.rush = 2.6;      // il s'enfuit
            an.target = this.pickSpot(an, g.position, true);
            if (!an.target) { an.state = 'idle'; an.timer = 1; an.rush = 1; }
          }
        }
        an.roll.rotation.x = 0;
        an.roll.rotation.z = an.rollSign * -k * Math.PI / 2;
        an.roll.position.y = sp.h + (sp.w - sp.h) * k;
        g.position.y = 0;
        if (rig.legs) rig.legs.forEach(function (l, i) { l.rotation.x = k * (i % 2 ? 0.5 : -0.5) * Math.sin(t / 90 + i); });
        if (an.stars.visible) {
          rig.head.getWorldPosition(an.stars.position);
          an.stars.position.y += 0.25 * an.spec.s + (an.state === 'ko' ? 0 : -0.1);
          an.stars.rotation.y += dt * 4;
        }
        return;
      }

      if (an.state === 'idle') {
        an.timer -= dt;
        if (an.timer <= 0) {
          an.target = this.pickSpot(an, g.position);
          if (an.target) { an.state = 'walk'; an.grazing = 0; }
          else an.timer = 1;
        }
      }

      if (an.state === 'walk' && an.target) {
        var dx = an.target.x - g.position.x, dz = an.target.z - g.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.25) {
          an.state = 'idle';
          an.rush = 1;
          an.timer = rand(sp.idle[0], sp.idle[1]);
          an.grazing = sp.graze && Math.random() < 0.6 ? 1 : 0;
        } else {
          var want = Math.atan2(dx, dz);
          var dh = wrapAngle(want - an.heading), maxTurn = sp.turn * an.rush * dt;
          an.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
          // avance moins vite tant qu'il n'est pas tourné vers sa cible
          var speed = sp.speed * an.rush * Math.max(0.15, Math.cos(dh));
          var step = Math.min(dist, speed * dt);
          var nx = g.position.x + Math.sin(an.heading) * step, nz = g.position.z + Math.cos(an.heading) * step;
          if (!inCourt(nx, nz)) { g.position.x = nx; g.position.z = nz; }
          else { an.state = 'idle'; an.timer = 0.3; }
          moving = true;
          an.phase += dt * sp.stride * Math.min(2, an.rush) * (speed / sp.speed / an.rush + 0.3);
        }
      }
      g.rotation.y = an.heading;

      // Pattes, sauts, tête
      if (an.kind === 'lapin') {
        g.position.y = moving ? Math.abs(Math.sin(an.phase)) * 0.11 * an.spec.s : 0;
        an.roll.rotation.x = moving ? -Math.cos(an.phase) * 0.25 : 0;
        rig.ears.forEach(function (e, i) {
          e.rotation.x = -0.25 + (moving ? 0.35 : 0.08 * Math.sin(t / 300 + i * 2) * (Math.sin(t / 1700) > 0.6 ? 1 : 0));
        });
      } else {
        var sw = moving ? Math.sin(an.phase) * (an.rush > 1 ? 0.6 : 0.4) : 0;
        rig.legs.forEach(function (l, i) {
          var dir = (i === 0 || i === 3) ? 1 : -1;   // pattes en diagonale
          l.rotation.x += (dir * sw - l.rotation.x) * Math.min(1, dt * 12);
        });
        g.position.y = moving ? Math.abs(Math.cos(an.phase)) * 0.025 : 0;
        if (an.kind === 'ours') an.roll.rotation.z = moving ? Math.sin(an.phase) * 0.04 : 0;
        var neckGoal = an.state === 'idle' && an.grazing ? sp.graze : (an.kind === 'ours' ? 0.15 : 0);
        rig.neck.rotation.x += (neckGoal - rig.neck.rotation.x) * Math.min(1, dt * 2);
      }
    },

    tick: function (t, dt) {
      if (!dt) return;
      var self = this;
      MK.safe('animaux', function () {
        var s = Math.min(dt / 1000, 0.1);
        self.checkHits();
        for (var i = 0; i < self.animals.length; i++) self.updateAnimal(self.animals[i], s, t);
      });
    }
  });
})();
