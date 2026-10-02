/* =========================================================================
 * Mölkky VR — le bâton de lancer
 * États : 'stand' (posé sur le tabouret), 'held' (suit une main ou la
 * caméra), 'flying' (simulé par la physique).
 * ========================================================================= */
(function () {
  'use strict';

  var M = MK.CONFIG.molkky;
  var PAL = MK.CONFIG.palette;

  MK.STAND_POSE = {
    position: new THREE.Vector3(0.42, 0.78 + M.radius + 0.002, -0.18),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
  };

  /** Déplace le tabouret (et la place du mölkky au repos) en (x, z). */
  MK.moveStool = function (x, z) {
    MK.STAND_POSE.position.x = x;
    MK.STAND_POSE.position.z = z;
    if (MK.stool) MK.stool.position.set(x, 0, z);
  };

  /** Point du bâton (segment de son axe) le plus proche de p, en coordonnées monde. */
  MK.closestOnMolkky = function (object3D, p, out) {
    var axis = new THREE.Vector3(0, 1, 0).applyQuaternion(object3D.quaternion);
    var c = object3D.position;
    var t = THREE.MathUtils.clamp(axis.dot(new THREE.Vector3().subVectors(p, c)), -M.length / 2, M.length / 2);
    return out.copy(c).addScaledVector(axis, t);
  };

  function molkkyMaterials() {
    var side = MK.Tex.canvas(256, 512), ctx = side.getContext('2d');
    MK.Tex.drawWoodGrain(ctx, 256, 512, 4242, PAL.manty, '#6E4824');
    // anneaux brûlés près des extrémités
    ctx.fillStyle = 'rgba(42,30,22,0.85)';
    ctx.fillRect(0, 34, 256, 10);
    ctx.fillRect(0, 468, 256, 10);
    ctx.fillStyle = 'rgba(181,65,46,0.9)';
    ctx.fillRect(0, 50, 256, 6);
    // inscription le long du bâton (deux fois pour être visible de partout)
    ctx.save();
    ctx.fillStyle = 'rgba(42,30,22,0.8)';
    ctx.font = '64px ' + MK.FONT_DISPLAY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [64, 192].forEach(function (x) {
      ctx.save();
      ctx.translate(x, 260);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('MÖLKKY', 0, 0);
      ctx.restore();
    });
    ctx.restore();

    var end = MK.Tex.canvas(128, 128);
    MK.Tex.drawEndGrain(end.getContext('2d'), 128, 128, 77, '#C99A62', '#7A5230');
    var endMat = new THREE.MeshStandardMaterial({ map: MK.Tex.toTexture(end), roughness: 0.8 });
    return [
      new THREE.MeshStandardMaterial({ map: MK.Tex.toTexture(side), roughness: 0.6 }),
      endMat,
      endMat
    ];
  }

  AFRAME.registerComponent('mk-molkky', {
    init: function () {
      var phys = this.el.sceneEl.systems['mk-physics'];
      this.phys = phys;

      var geo = new THREE.CylinderGeometry(M.radius, M.radius, M.length, 24, 1);
      var mesh = new THREE.Mesh(geo, molkkyMaterials());
      mesh.castShadow = true;
      this.sideMaterial = mesh.material[0];
      this.glow = 0;
      this.el.setObject3D('mesh', mesh);

      var body = new CANNON.Body({
        mass: M.mass,
        material: phys.materials.wood,
        linearDamping: 0.12,
        angularDamping: 0.35,
        allowSleep: true,
        sleepSpeedLimit: 0.05,
        sleepTimeLimit: 0.4
      });
      body.addShape(new CANNON.Cylinder(M.radius, M.radius, M.length, 12));
      body.mkType = 'molkky';
      body.mkEl = this.el;
      this.body = body;
      phys.link(body, this.el.object3D);

      this.state = 'stand';
      this.holder = null;
      this.toStand();
    },

    toStand: function () {
      this.phys.removeBody(this.body);
      this.holder = null;
      this.state = 'stand';
      this.el.object3D.position.copy(MK.STAND_POSE.position);
      this.el.object3D.quaternion.copy(MK.STAND_POSE.quaternion);
      this.el.object3D.visible = true;
    },

    /** holder : objet avec getPose(position, quaternion) en coordonnées monde. */
    hold: function (holder) {
      this.phys.removeBody(this.body);
      this.holder = holder;
      this.state = 'held';
      this.followHolder();
    },

    followHolder: function () {
      if (!this.holder) return;
      this.holder.getPose(this.el.object3D.position, this.el.object3D.quaternion);
    },

    /** Lâcher : la physique reprend la main avec les vitesses fournies. */
    release: function (velocity, angularVelocity) {
      var o = this.el.object3D;
      this.holder = null;
      this.state = 'flying';
      this.phys.teleport(this.body, o.position, o.quaternion);
      this.body.velocity.set(velocity.x, velocity.y, velocity.z);
      this.body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);
      this.phys.addBody(this.body);
      this.body.wakeUp();
    },

    /** Vrai si le mölkky est sorti largement du terrain. */
    isLost: function () {
      var p = this.body.position;
      return p.y < -1 || Math.abs(p.x) > 14 || p.z < -22 || p.z > 6;
    },

    /**
     * Lueur dorée en VR : 0 = aucune, 1 = pulsation (il attend d'être pris),
     * 2 = lueur franche (la main est assez proche pour le saisir).
     */
    setGlow: function (level) {
      level = level || 0;
      if (level === this.glow) return;
      this.glow = level;
      this.sideMaterial.emissive.set(level ? MK.CONFIG.palette.kulta : '#000000');
      this.sideMaterial.emissiveIntensity = level === 2 ? 0.6 : 0;
    },

    tick: function (t) {
      if (this.state === 'held') this.followHolder();
      if (this.glow === 1) this.sideMaterial.emissiveIntensity = 0.2 + 0.2 * Math.sin(t / 180);
    }
  });
})();
