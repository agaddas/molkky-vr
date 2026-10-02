/* =========================================================================
 * Mölkky VR — sauvegarde locale (localStorage)
 * Structure enregistrée sous MK.CONFIG.storageKey :
 * {
 *   version: 1,
 *   best:  { facile: Résumé|null, normal: Résumé|null, difficile: Résumé|null },
 *   last:  Résumé|null,           // dernière partie avec historique complet
 *   gamesPlayed: number
 * }
 * Résumé = { difficulty, result, score, throws, timeMs, date, history }
 * ========================================================================= */
(function (root) {
  'use strict';

  function emptyData() {
    return { version: 1, best: { facile: null, normal: null, difficile: null }, last: null, gamesPlayed: 0 };
  }

  function createStorage(backend, key, rules) {
    var memory = null; // repli si le stockage du navigateur est indisponible

    function load() {
      try {
        var raw = backend && backend.getItem(key);
        if (!raw) return memory || emptyData();
        var data = JSON.parse(raw);
        if (!data || data.version !== 1) return emptyData();
        data.best = data.best || {};
        return data;
      } catch (e) {
        return memory || emptyData();
      }
    }

    function save(data) {
      memory = data;
      try {
        if (backend) backend.setItem(key, JSON.stringify(data));
      } catch (e) { /* quota ou navigation privée : on garde la copie mémoire */ }
    }

    /** Enregistre une partie terminée. Retourne { isNewBest, best, previousBest }. */
    function recordGame(summary) {
      var data = load();
      var entry = Object.assign({}, summary, { date: new Date().toISOString() });
      var previous = data.best[summary.difficulty] || null;
      var isNewBest = rules.isBetter(entry, previous);
      if (isNewBest) {
        // Le meilleur résultat garde aussi son historique de lancers.
        data.best[summary.difficulty] = entry;
      }
      data.last = entry;
      data.gamesPlayed = (data.gamesPlayed || 0) + 1;
      save(data);
      return { isNewBest: isNewBest, best: data.best[summary.difficulty], previousBest: previous };
    }

    function getBest(difficulty) {
      return load().best[difficulty] || null;
    }

    function clear() {
      memory = null;
      try { if (backend) backend.removeItem(key); } catch (e) { /* rien */ }
    }

    return { load: load, recordGame: recordGame, getBest: getBest, clear: clear };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createStorage: createStorage };
  } else {
    var backend = null;
    try { backend = root.localStorage; } catch (e) { backend = null; }
    root.MK = root.MK || {};
    root.MK.Storage = createStorage(backend, root.MK.CONFIG.storageKey, root.MK.Rules);
  }
})(typeof window !== 'undefined' ? window : this);
