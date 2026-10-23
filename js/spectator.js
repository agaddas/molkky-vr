/* =========================================================================
 * Mölkky VR — retransmission sur l'écran du PC (mode spectateur)
 * Pendant une session VR lancée depuis un PC (Quest Link / Air Link), le
 * navigateur n'affiche rien de lui-même sur l'écran : l'image va au casque
 * et la page reste figée (souvent sur un aplat vert). Ce composant redessine
 * à chaque image ce que voit le joueur dans la page, pour le public.
 * - Rendu dans une petite texture (≤ 1280 px) puis étiré sur la page : le
 *   coût reste faible pour ne pas faire chuter les images du casque.
 * - Caméra lissée, pour que les petits mouvements de tête ne donnent pas le
 *   mal de mer aux spectateurs.
 * - Inutile et coûteux dans le navigateur autonome du casque : désactivé
 *   là-bas, ainsi qu'avec ?miroir=0 dans l'adresse ; bouton A pour le
 *   couper ou le rétablir pendant la partie.
 * - Attention : en VR, three.js redirige « dessiner sur la page » vers
 *   l'image du casque ; le drapeau xr.isPresenting est levé le temps du
 *   dessin, sinon la vue du PC s'affiche en double dans les yeux.
 * ========================================================================= */
(function () {
  'use strict';

  var STANDALONE = /OculusBrowser|Quest|Pico|Wolvic|VR Browser/i.test(navigator.userAgent);

  AFRAME.registerComponent('mk-spectator', {
    schema: {
      fov: { default: 72 },
      smoothing: { default: 0.35 },   // part de la pose de la tête reprise à chaque image
      maxWidth: { default: 1280 }
    },

    init: function () {
      var q = location.search;
      this.enabled = /[?&]miroir=force\b/.test(q) || (!STANDALONE && !/[?&]miroir=0\b/.test(q));
      this.cam = new THREE.PerspectiveCamera(this.data.fov, 16 / 9, 0.03, 300);
      this.rt = null;
      this.first = true;
      this.p = new THREE.Vector3();
      this.q = new THREE.Quaternion();
      this.s = new THREE.Vector3();

      // Écran : un rectangle plein cadre qui affiche la texture rendue.
      this.quadScene = new THREE.Scene();
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quadMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
      this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat));

      var self = this;
      this.el.addEventListener('enter-vr', function () { self.first = true; });
      // Bouton A (manette droite) : couper / rétablir la retransmission
      this.el.addEventListener('abuttondown', function () {
        self.enabled = !self.enabled;
        self.first = true;
        MK.Debug.set('miroir PC', self.enabled ? 'actif (A pour couper)' : 'coupé (A pour rétablir)');
      });
      MK.Debug.set('miroir PC', this.enabled ? 'actif (A pour couper)' : 'désactivé (casque autonome)');
    },

    /** Faut-il dessiner ? Seulement si l'image du casque ne passe pas déjà par la page. */
    shouldMirror: function (r) {
      if (!this.enabled || !r || !r.xr || !r.xr.isPresenting) return false;
      if (/[?&]miroir=force\b/.test(location.search)) return true;
      var session = r.xr.getSession && r.xr.getSession();
      var layer = session && session.renderState && session.renderState.baseLayer;
      // framebuffer nul = l'image du casque est déjà dessinée dans la page (émulateur)
      return !(layer && layer.framebuffer === null);
    },

    ensureTarget: function (canvas) {
      var w = Math.max(320, Math.min(this.data.maxWidth, canvas.clientWidth || 1280));
      var h = Math.max(180, Math.round(w * (canvas.clientHeight || 720) / (canvas.clientWidth || 1280)));
      if (this.rt && this.rt.width === w && this.rt.height === h) return;
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
      this.quadMat.map = this.rt.texture;
      this.quadMat.needsUpdate = true;
    },

    // tock : après le rendu du casque, dans la même image.
    tock: function () {
      var r = this.el.renderer;
      if (!this.shouldMirror(r)) return;
      var self = this;
      MK.safe('miroir PC', function () { self.mirror(r); });
    },

    mirror: function (r) {
      var canvas = r.domElement;
      this.ensureTarget(canvas);

      // Pose de la tête du joueur (œil gauche), lissée.
      var xrCam = r.xr.getCamera();
      var eye = xrCam.cameras && xrCam.cameras.length ? xrCam.cameras[0] : xrCam;
      eye.matrixWorld.decompose(this.p, this.q, this.s);
      var cam = this.cam;
      if (this.first) {
        cam.position.copy(this.p);
        cam.quaternion.copy(this.q);
        this.first = false;
      } else {
        cam.position.lerp(this.p, this.data.smoothing);
        cam.quaternion.slerp(this.q, this.data.smoothing);
      }
      cam.aspect = this.rt.width / this.rt.height;
      cam.layers.mask = this.el.camera.layers.mask;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      var xrTarget = r.getRenderTarget();
      var shadowAuto = r.shadowMap.autoUpdate;
      var presenting = r.xr.isPresenting;
      r.xr.enabled = false;               // rendu « normal », hors casque
      r.shadowMap.autoUpdate = false;     // les ombres de cette image sont déjà calculées
      try {
        r.setRenderTarget(this.rt);
        r.clear();
        r.render(this.el.object3D, cam);
        // Pendant une session VR, three.js redirige setRenderTarget(null) vers
        // l'image du casque : on lève ce drapeau le temps de dessiner la page.
        r.xr.isPresenting = false;
        r.setRenderTarget(null);
        if (r.getRenderTarget() !== null) throw new Error('rendu redirigé vers le casque, miroir coupé');
        r.render(this.quadScene, this.quadCam);
      } catch (e) {
        this.enabled = false;             // ne jamais risquer de gâcher l'image du casque
        throw e;
      } finally {
        r.xr.isPresenting = presenting;
        r.setRenderTarget(xrTarget);
        r.shadowMap.autoUpdate = shadowAuto;
        r.xr.enabled = true;
      }
    }
  });
})();
