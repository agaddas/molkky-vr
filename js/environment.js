/* =========================================================================
 * Mölkky VR — décor
 * Pré d'été finlandais : herbe, allée tondue, bouleaux et pins, mökki
 * rouge, planche de lancer et tabouret où attend le mölkky.
 * Le terrain de jeu change selon le choix du menu : allée tondue, carré de
 * sable ou dalle de béton (MK.showTerrain).
 * Les arbres sont instanciés (quelques appels de rendu seulement) pour
 * rester fluide sur un casque autonome.
 * ========================================================================= */
(function () {
  'use strict';

  var PAL = MK.CONFIG.palette;

  function std(opts) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, opts)); }

  function sky() {
    var tex = MK.Tex.skyGradient([
      [0.0, '#6F98A6'], [0.30, '#A9C0BA'], [0.46, '#EAD9B0'], [0.5, '#F3DFB2'], [0.53, '#C4B487'], [1, '#556B3A']
    ]);
    var m = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = -10;
    return m;
  }

  function ground() {
    var tex = MK.Tex.grass('#5E8A36', 7, 512);
    tex.repeat.set(36, 36);
    // Disque subdivisé en anneaux : de petits triangles près du joueur évitent
    // les artefacts de profondeur/brouillard des très grands triangles.
    var g = new THREE.Mesh(new THREE.RingGeometry(0.001, 90, 48, 40), std({ map: tex, roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    return g;
  }

  /** Allée tondue : bandes plus claires, bords fondus dans l'herbe. */
  function mowedStrip(lengthZ, centerZ) {
    var c = MK.Tex.canvas(256, 1024), ctx = c.getContext('2d');
    var grass = MK.Tex.grass('#7EA348', 21, 256).image;
    for (var y = 0; y < 1024; y += 256) ctx.drawImage(grass, 0, y);
    for (var i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,240,190,0.10)' : 'rgba(30,50,10,0.08)';
      ctx.fillRect(0, i * 128, 256, 128);
    }
    // fondu des bords (masque alpha)
    ctx.globalCompositeOperation = 'destination-in';
    var gx = ctx.createLinearGradient(0, 0, 256, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.18, 'rgba(0,0,0,1)');
    gx.addColorStop(0.82, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, 256, 1024);
    var gy = ctx.createLinearGradient(0, 0, 0, 1024);
    gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.08, 'rgba(0,0,0,1)');
    gy.addColorStop(0.95, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gy; ctx.fillRect(0, 0, 256, 1024);
    var tex = MK.Tex.toTexture(c);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, lengthZ), std({
      map: tex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.002, centerZ);
    m.receiveShadow = true;
    return m;
  }

  // Terrain de sable / béton : couvre la zone où les quilles peuvent finir.
  var COURT_W = 7.2, COURT_L = 10.6, COURT_Z = -4.1, COURT_PPM = 142;

  /** Surfaces dessinées seulement au premier choix du terrain (grandes textures). */
  var courtBuilders = {
    sable: function () {
      var tex = MK.Tex.sandCourt(Math.round(COURT_W * COURT_PPM), Math.round(COURT_L * COURT_PPM));
      var m = new THREE.Mesh(new THREE.PlaneGeometry(COURT_W + 0.8, COURT_L + 0.8), std({
        map: tex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.002, COURT_Z);
      m.receiveShadow = true;
      return m;
    },
    beton: function () {
      var tex = MK.Tex.concreteCourt(Math.round(COURT_W * COURT_PPM), Math.round(COURT_L * COURT_PPM), 1.8 * COURT_PPM);
      // dalle à peine plus haute que l'herbe : bord net
      var m = new THREE.Mesh(new THREE.BoxGeometry(COURT_W, 0.04, COURT_L), [
        std({ color: '#8E8B84' }), std({ color: '#8E8B84' }),
        std({ map: tex, roughness: 0.85 }), std({ color: '#8E8B84' }),
        std({ color: '#8E8B84' }), std({ color: '#8E8B84' })
      ]);
      m.position.set(0, -0.016, COURT_Z);
      m.receiveShadow = true;
      return m;
    }
  };

  function throwPlank() {
    var g = new THREE.Group();
    var wood = std({ map: MK.Tex.wood('planche', PAL.koivu, '#9C7A4C', 128, 512), roughness: 0.8 });
    var plank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.07), wood);
    plank.position.set(0, 0.015, MK.CONFIG.throwLineZ);
    plank.castShadow = true; plank.receiveShadow = true;
    g.add(plank);
    return g;
  }

  /** Tabouret du mölkky : groupe déplaçable (il se place à portée de main en VR). */
  function stool() {
    var g = new THREE.Group();
    var wood = std({ map: MK.Tex.wood('tabouret', PAL.manty, '#6E4824', 256, 256), roughness: 0.75 });
    var p = MK.STAND_POSE.position;
    var top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.36), wood);
    top.position.set(0, 0.76, 0);
    top.castShadow = true; top.receiveShadow = true;
    g.add(top);
    // petites cales pour que le mölkky ne roule pas
    [-1, 1].forEach(function (s) {
      var cleat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), wood);
      cleat.position.set(s * 0.045, 0.79, 0);
      g.add(cleat);
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.74, 0.035), wood);
      leg.position.set(c[0] * 0.12, 0.37, c[1] * 0.15);
      leg.castShadow = true;
      g.add(leg);
    });
    g.position.set(p.x, 0, p.z);
    MK.stool = g;
    return g;
  }

  function cottage() {
    var g = new THREE.Group();
    var red = std({ color: '#9C3826', roughness: 0.85 });
    var white = std({ color: '#EFE7D6', roughness: 0.7 });
    var tar = std({ color: PAL.terva, roughness: 0.9 });
    var glass = std({ color: '#2B3A3A', roughness: 0.25, metalness: 0.2 });
    var walls = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 3.2), red);
    walls.position.y = 1.2;
    g.add(walls);
    [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]].forEach(function (c) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.4, 0.14), white);
      t.position.set(c[0], 1.2, c[1]);
      g.add(t);
    });
    var shape = new THREE.Shape();
    shape.moveTo(-2.55, 0); shape.lineTo(2.55, 0); shape.lineTo(0, 1.45); shape.lineTo(-2.55, 0);
    var roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3.7, bevelEnabled: false }), tar);
    roof.position.set(0, 2.4, -1.85);
    g.add(roof);
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.06), std({ color: '#5A4632' }));
    door.position.set(-0.9, 0.9, 1.62);
    g.add(door);
    [0.8, 1.7].forEach(function (x) {
      var f = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.05), white);
      f.position.set(x, 1.35, 1.62);
      var gl = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.06), glass);
      gl.position.set(x, 1.35, 1.63);
      g.add(f); g.add(gl);
    });
    var steps = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.5), std({ color: '#7A6650' }));
    steps.position.set(-0.9, 0.1, 1.85);
    g.add(steps);
    g.traverse(function (o) { if (o.isMesh) o.receiveShadow = true; });
    return g;
  }

  /** Emplacements d'arbres : couronne autour du terrain, allée de jeu dégagée. */
  function treeSpots(count, seed) {
    var r = MK.Tex.rng(seed), out = [];
    var tries = 0;
    while (out.length < count && tries++ < 4000) {
      var a = r() * Math.PI * 2, d = 10 + Math.pow(r(), 0.7) * 30;
      var x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 4.5 && z < 4 && z > -12) continue;    // couloir de jeu
      if (x < -5 && x > -13.5 && z < -11 && z > -19.5) continue; // mökki
      var ok = true;
      for (var i = 0; i < out.length; i++) {
        var dx = out[i].x - x, dz = out[i].z - z;
        if (dx * dx + dz * dz < 6) { ok = false; break; }
      }
      if (ok) out.push({ x: x, z: z, s: 0.75 + r() * 0.6, rot: r() * Math.PI * 2 });
    }
    return out;
  }

  function instanced(geo, mat, spots, place) {
    var m = new THREE.InstancedMesh(geo, mat, spots.length);
    var mx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    spots.forEach(function (sp, i) {
      place(sp, p, q, s);
      mx.compose(p, q, s);
      m.setMatrixAt(i, mx);
    });
    m.instanceMatrix.needsUpdate = true;
    return m;
  }

  function trees() {
    var g = new THREE.Group();
    var all = treeSpots(46, 1234);
    var birches = all.filter(function (_, i) { return i % 2 === 0; });
    var pines = all.filter(function (_, i) { return i % 2 === 1; });
    var up = new THREE.Vector3(0, 1, 0);

    // Bouleaux : tronc blanc à marques noires, houppier vert clair
    var trunkMat = std({ map: MK.Tex.birchBark(), roughness: 0.8 });
    g.add(instanced(new THREE.CylinderGeometry(0.09, 0.14, 7, 8), trunkMat, birches, function (sp, p, q, s) {
      p.set(sp.x, 3.5 * sp.s, sp.z); q.setFromAxisAngle(up, sp.rot); s.set(sp.s, sp.s, sp.s);
    }));
    var leafMat = std({ color: '#8DA94A', flatShading: true, roughness: 0.95 });
    var leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
    [[0, 6.2, 0, 1], [0.7, 5.2, 0.3, 0.8], [-0.6, 5.5, -0.4, 0.75]].forEach(function (o) {
      g.add(instanced(leafGeo, leafMat, birches, function (sp, p, q, s) {
        p.set(sp.x + o[0] * sp.s, o[1] * sp.s, sp.z + o[2] * sp.s);
        q.setFromAxisAngle(up, sp.rot + o[0]);
        s.set(sp.s * o[3], sp.s * o[3] * 1.15, sp.s * o[3]);
      }));
    });

    // Pins : tronc brun, trois cônes vert sombre
    var pineTrunk = std({ color: '#5B3B24' });
    g.add(instanced(new THREE.CylinderGeometry(0.12, 0.2, 3, 7), pineTrunk, pines, function (sp, p, q, s) {
      p.set(sp.x, 1.5 * sp.s, sp.z); q.identity(); s.set(sp.s, sp.s, sp.s);
    }));
    var needles = std({ color: '#2E4A2C', flatShading: true });
    [[2.4, 2.2, 2.6], [1.9, 1.9, 4.0], [1.3, 1.6, 5.3]].forEach(function (c) {
      g.add(instanced(new THREE.ConeGeometry(c[0], c[1] * 1.6, 8), needles, pines, function (sp, p, q, s) {
        p.set(sp.x, c[2] * sp.s * 1.25, sp.z); q.setFromAxisAngle(up, sp.rot); s.set(sp.s, sp.s * 1.25, sp.s);
      }));
    });
    return g;
  }

  function rocks() {
    var g = new THREE.Group();
    var mat = std({ color: '#8A877C', flatShading: true });
    var r = MK.Tex.rng(77);
    for (var i = 0; i < 9; i++) {
      var m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + r() * 0.5, 0), mat);
      var a = r() * Math.PI * 2, d = 6 + r() * 10;
      var x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 3.6 && z > -11 && z < 3) { x += 5 * Math.sign(x || 1); }
      m.position.set(x, 0.05, z);
      m.scale.y = 0.55;
      m.rotation.y = r() * 3;
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  AFRAME.registerComponent('mk-environment', {
    init: function () {
      var root = new THREE.Group();
      root.add(sky());
      root.add(ground());
      var strip = mowedStrip(8.6, -3.6);
      root.add(strip);
      root.add(throwPlank());
      root.add(stool());
      var c = cottage();
      c.position.set(-9.5, 0, -15.5);
      c.rotation.y = 0.55;
      root.add(c);
      root.add(trees());
      root.add(rocks());
      this.el.setObject3D('env', root);

      // Affiche le terrain choisi (herbe : allée tondue ; sinon sable ou béton).
      var courts = {};
      MK.showTerrain = function (id) {
        if (id !== 'herbe' && !courts[id] && courtBuilders[id]) {
          courts[id] = courtBuilders[id]();
          root.add(courts[id]);
        }
        strip.visible = id === 'herbe';
        Object.keys(courts).forEach(function (k) { courts[k].visible = k === id; });
      };
    }
  });
})();
