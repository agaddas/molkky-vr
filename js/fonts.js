/* =========================================================================
 * Mölkky VR — chargement des polices embarquées (licence OFL, voir assets/fonts)
 * Les textes 3D sont dessinés dans des canvas : il faut attendre que les
 * polices soient prêtes avant de les dessiner.
 * ========================================================================= */
(function () {
  'use strict';
  MK.FONT_DISPLAY = '"Alfa Slab One", "Rockwell", Georgia, serif';
  MK.FONT_BODY = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';

  var faces = [
    ['Alfa Slab One', 'assets/fonts/AlfaSlabOne-Regular.ttf', '400'],
    ['Barlow Semi Condensed', 'assets/fonts/BarlowSemiCondensed-Medium.ttf', '500'],
    ['Barlow Semi Condensed', 'assets/fonts/BarlowSemiCondensed-Bold.ttf', '700']
  ];

  var loads = faces.map(function (f) {
    if (!window.FontFace) return Promise.resolve();
    var face = new FontFace(f[0], 'url("' + f[1] + '")', { weight: f[2] });
    return face.load().then(function (loaded) {
      document.fonts.add(loaded);
    }).catch(function (e) {
      console.warn('[Mölkky] Police non chargée (' + f[1] + '), repli système.', e && e.message);
    });
  });

  var timeout = new Promise(function (resolve) { setTimeout(resolve, 4000); });
  MK.fontsReady = Promise.race([Promise.all(loads), timeout]);
})();
