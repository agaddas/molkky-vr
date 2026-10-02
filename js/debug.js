/* =========================================================================
 * Mölkky VR — panneau de diagnostic
 * Affiche dans le casque l'état du jeu, les dernières touches reçues, la
 * mesure du dernier lâcher et les erreurs éventuelles.
 * Ouverture : bouton X de la manette gauche, ou ?debug dans l'adresse.
 * Toute erreur dans la boucle de jeu est rattrapée (MK.safe) pour ne pas
 * figer l'image du casque, et ouvre automatiquement ce panneau.
 * ========================================================================= */
(function () {
  'use strict';

  var state = {};
  var inputs = [];
  var errors = [];
  var visible = /[?&]debug\b/.test(location.search);
  var dirty = true;

  MK.Debug = {
    input: function (str) {
      inputs.push(str);
      if (inputs.length > 6) inputs.shift();
      dirty = true;
    },
    set: function (key, value) {
      if (state[key] === value) return;
      state[key] = value;
      dirty = true;
    },
    error: function (where, e) {
      var msg = where + ' : ' + (e && e.message ? e.message : String(e));
      if (errors[errors.length - 1] !== msg) errors.push(msg);
      if (errors.length > 3) errors.shift();
      console.error('[Mölkky] ' + where, e);
      visible = true;
      dirty = true;
    },
    toggle: function () { visible = !visible; dirty = true; },
    isVisible: function () { return visible; },
    _consume: function () { var d = dirty; dirty = false; return d; },
    _data: function () { return { state: state, inputs: inputs, errors: errors }; }
  };

  /** Exécute fn en rattrapant les erreurs (la boucle XR ne doit jamais s'arrêter). */
  MK.safe = function (where, fn) {
    try { return fn(); } catch (e) { MK.Debug.error(where, e); return undefined; }
  };

  window.addEventListener('error', function (e) { MK.Debug.error('page', e.error || e.message); });

  AFRAME.registerComponent('mk-debug', {
    init: function () {
      this.W = 760; this.H = 500;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.W; this.canvas.height = this.H;
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.276),
        new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, transparent: true, depthTest: false }));
      this.mesh.renderOrder = 20;
      this.el.setObject3D('mesh', this.mesh);
      this.acc = 0;
    },

    draw: function () {
      var ctx = this.canvas.getContext('2d'), W = this.W, H = this.H;
      var d = MK.Debug._data();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(42,30,22,0.92)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#F2B544'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.textBaseline = 'top';
      ctx.font = '700 30px ' + MK.FONT_BODY;
      ctx.fillStyle = '#F2B544';
      ctx.fillText('DIAGNOSTIC  (X : masquer)', 18, 14);
      ctx.font = '500 27px ' + MK.FONT_BODY;
      ctx.fillStyle = '#E8D2A6';
      var y = 58;
      Object.keys(d.state).forEach(function (k) {
        ctx.fillText(k + ' : ' + d.state[k], 18, y, W - 36);
        y += 32;
      });
      ctx.fillStyle = '#F2B544';
      ctx.fillText('touches : ' + (d.inputs.length ? '' : 'aucune reçue'), 18, y); y += 32;
      ctx.fillStyle = '#E8D2A6';
      d.inputs.slice().reverse().forEach(function (s) { ctx.fillText('  ' + s, 18, y); y += 30; });
      ctx.fillStyle = '#FF7A5C';
      d.errors.forEach(function (s) { ctx.fillText(s, 18, y, W - 36); y += 30; });
      this.texture.needsUpdate = true;
    },

    tick: function (t, dt) {
      this.el.object3D.visible = MK.Debug.isVisible();
      if (!MK.Debug.isVisible()) return;
      this.acc += dt || 0;
      if (this.acc < 200) return;
      this.acc = 0;
      if (MK.Debug._consume()) this.draw();
    }
  });
})();
