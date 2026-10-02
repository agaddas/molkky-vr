/* =========================================================================
 * Mölkky VR — quilles
 * Cylindres de bouleau au sommet biseauté, numérotés de 1 à 12.
 * Chaque quille a un corps physique ; elle sait dire si elle est tombée
 * et peut être remise debout à l'endroit où elle a chuté.
 * ========================================================================= */
(function () {
  'use strict';

  var P = MK.CONFIG.pin;
  var PAL = MK.CONFIG.palette;
  var UP = new CANNON.Vec3(0, 1, 0);
  var tmpUp = new CANNON.Vec3();

  /** Formation officielle, vue depuis la planche de lancer (avant -> arrière). */
  MK.PIN_ROWS = [
    [1, 2],
    [3, 10, 4],
    [5, 11, 12, 6],
    [7, 9, 8]
  ];

  /** Positions initiales (x, z) des 12 quilles pour une distance donnée. */
  MK.pinLayout = function (distance) {
    var d = P.radius * 2 + 0.004;           // quilles quasi jointives
    var rowGap = d * Math.sqrt(3) / 2;      // empilement hexagonal
    var frontZ = MK.CONFIG.throwLineZ - distance;
    var out = {};
    MK.PIN_ROWS.forEach(function (row, ri) {
      row.forEach(function (num, i) {
        out[num] = { x: (i - (row.length - 1) / 2) * d, z: frontZ - ri * rowGap };
      });
    });
    return out;
  };

  // ---------------------------------------------------------------- géométrie
  var sharedGeometry = null;
  function pinGeometry() {
    if (sharedGeometry) return sharedGeometry;
    var r = P.radius, h = P.height, s = P.slant;
    // thetaStart = -PI : u = 0.5 correspond à la face avant (+Z, vers le joueur)
    var g = new THREE.CylinderGeometry(r, r, h, P.segmentsVisual, 1, false, -Math.PI, Math.PI * 2);
    var pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    var n = new THREE.Vector3(0, 1, s / (2 * r)).normalize();
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i);
      if (y > h / 2 - 1e-6) {
        var x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, h / 2 - s * (z + r) / (2 * r));
        if (nor.getY(i) > 0.99) {
          // couvercle : normale inclinée vers l'avant + UV planaires
          nor.setXYZ(i, n.x, n.y, n.z);
          uv.setXY(i, 0.5 + x / (2 * r), 0.5 - z / (2 * r));
        }
      }
    }
    pos.needsUpdate = true;
    sharedGeometry = g;
    return g;
  }

  // ---------------------------------------------------------------- textures
  function drawNumber(ctx, num, x, y, size, color) {
    ctx.font = size + 'px ' + MK.FONT_DISPLAY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(String(num), x, y);
    if (num === 6 || num === 9) {
      // soulignement pour distinguer 6 et 9
      var w = ctx.measureText(String(num)).width;
      ctx.fillRect(x - w * 0.42, y + size * 0.42, w * 0.84, size * 0.08);
    }
  }

  var bottomMaterial = null;

  function pinMaterials(num) {
    var side = MK.Tex.canvas(256, 256), sc = side.getContext('2d');
    MK.Tex.drawWoodGrain(sc, 256, 256, num * 131 + 7, PAL.koivu, '#9C7A4C');
    // bande sombre au pied, comme une quille usée par l'herbe
    var grd = sc.createLinearGradient(0, 200, 0, 256);
    grd.addColorStop(0, 'rgba(60,45,25,0)');
    grd.addColorStop(1, 'rgba(60,45,25,0.35)');
    sc.fillStyle = grd; sc.fillRect(0, 200, 256, 56);
    var big = num >= 10 ? 92 : 118;
    drawNumber(sc, num, 128, 118, big, PAL.terva);   // face avant
    drawNumber(sc, num, 0, 118, big, PAL.terva);     // face arrière (raccord)
    drawNumber(sc, num, 256, 118, big, PAL.terva);

    var top = MK.Tex.canvas(128, 128), tc = top.getContext('2d');
    MK.Tex.drawEndGrain(tc, 128, 128, num * 17 + 3, '#E3C893', '#A88452');
    drawNumber(tc, num, 64, 66, num >= 10 ? 62 : 78, PAL.terva);

    if (!bottomMaterial) {
      var bot = MK.Tex.canvas(64, 64);
      MK.Tex.drawEndGrain(bot.getContext('2d'), 64, 64, 99, '#D9BC86', '#A88452');
      bottomMaterial = new THREE.MeshStandardMaterial({ map: MK.Tex.toTexture(bot), roughness: 0.85 });
    }

    return [
      new THREE.MeshStandardMaterial({ map: MK.Tex.toTexture(side), roughness: 0.7, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: MK.Tex.toTexture(top), roughness: 0.75, metalness: 0 }),
      bottomMaterial
    ];
  }

  // ---------------------------------------------------------------- composant
  AFRAME.registerComponent('mk-pin', {
    schema: { number: { type: 'int', default: 1 } },

    init: function () {
      var phys = this.el.sceneEl.systems['mk-physics'];
      this.phys = phys;
      var num = this.data.number;

      var mesh = new THREE.Mesh(pinGeometry(), pinMaterials(num));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.el.setObject3D('mesh', mesh);
      this.materials = mesh.material;

      var body = new CANNON.Body({
        mass: P.mass,
        material: phys.materials.wood,
        linearDamping: 0.1,
        angularDamping: 0.45,
        allowSleep: true,
        sleepSpeedLimit: 0.05,
        sleepTimeLimit: 0.35
      });
      body.addShape(new CANNON.Cylinder(P.radius, P.radius, P.height, P.segmentsPhysics));
      body.mkType = 'pin';
      body.mkNumber = num;
      body.mkEl = this.el;
      this.body = body;
      phys.link(body, this.el.object3D);
      phys.addBody(body);

      this.fallenThisThrow = false;   // pour ne jouer le son de chute qu'une fois
      this.anim = null;
      this.highlighted = false;
    },

    remove: function () {
      this.phys.removeBody(this.body);
    },

    /** Angle (degrés) entre l'axe de la quille et la verticale. */
    tiltDeg: function () {
      this.body.quaternion.vmult(UP, tmpUp);
      return Math.acos(Math.max(-1, Math.min(1, tmpUp.y))) * 180 / Math.PI;
    },

    isFallen: function () {
      return this.tiltDeg() > MK.CONFIG.fallenTiltDeg;
    },

    /** Pose instantanée, debout, orientée vers le joueur. */
    placeUpright: function (x, z) {
      var q = new CANNON.Quaternion(0, 0, 0, 1); // numéro tourné vers la planche (+Z)
      this.anim = null;
      this.body.mkManual = false;
      this.phys.teleport(this.body, { x: x, y: P.height / 2 + 0.0005, z: z }, q);
      this.phys.addBody(this.body);
      this.body.sleep();
      this.el.object3D.position.set(x, P.height / 2 + 0.0005, z);
      this.el.object3D.quaternion.set(0, 0, 0, 1);
      this.fallenThisThrow = false;
    },

    /** Relève la quille en douceur jusqu'à (x, z), puis rend la main à la physique. */
    raiseTo: function (x, z, durationMs) {
      var o = this.el.object3D;
      this.phys.removeBody(this.body);
      this.body.mkManual = true;
      this.anim = {
        t: 0,
        dur: durationMs || 500,
        fromP: o.position.clone(),
        fromQ: o.quaternion.clone(),
        toP: new THREE.Vector3(x, P.height / 2 + 0.0005, z),
        toQ: new THREE.Quaternion()
      };
    },

    isAnimating: function () { return !!this.anim; },

    setHighlight: function (on) {
      if (on === this.highlighted) return;
      this.highlighted = on;
      var m = this.materials[0];
      m.emissive.set(on ? MK.CONFIG.palette.kulta : '#000000');
      m.emissiveIntensity = on ? 0.35 : 0;
    },

    tick: function (t, dt) {
      if (this.highlighted) {
        this.materials[0].emissiveIntensity = 0.22 + 0.18 * Math.sin(t / 220);
      }
      if (!this.anim) return;
      var a = this.anim;
      a.t += dt;
      var k = Math.min(1, a.t / a.dur);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      var o = this.el.object3D;
      o.position.lerpVectors(a.fromP, a.toP, e);
      // petit arc vertical : la quille est soulevée puis reposée
      o.position.y += Math.sin(Math.PI * k) * 0.06;
      o.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      if (k >= 1) {
        this.placeUpright(a.toP.x, a.toP.z);
      }
    }
  });
})();
