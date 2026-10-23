/* =========================================================================
 * Mölkky VR — règles du jeu (logique pure, sans 3D)
 * Ce module ne dépend ni d'A-Frame ni du DOM : il est testé avec Node
 * (voir tests/rules.test.js) et utilisé tel quel dans le navigateur.
 *
 * Une partie est un objet immuable ; chaque lancer produit une nouvelle
 * partie et un enregistrement ajouté à l'historique.
 * ========================================================================= */
(function (root) {
  'use strict';

  var TARGET = 50;
  var OVERFLOW_RESET = 25;
  var MAX_MISSES = 3;

  /** Points d'un lancer à partir de la liste des numéros des quilles tombées. */
  function pointsForThrow(fallenPins) {
    if (!fallenPins || fallenPins.length === 0) return 0;
    if (fallenPins.length === 1) return fallenPins[0];
    return fallenPins.length;
  }

  /** Nouvelle partie : score, lancers, échecs et chronomètre remis à zéro. */
  function createGame(difficulty, now) {
    return {
      difficulty: difficulty,
      score: 0,
      throwCount: 0,
      misses: 0,
      status: 'playing',   // 'playing' | 'ended'
      result: null,        // null | 'win' | 'lose'
      history: [],
      startTime: now,
      endTime: null
    };
  }

  /**
   * Applique un lancer. Retourne { game, record } sans modifier l'entrée.
   * record = { throwNumber, fallenPins, points, scoreBefore, totalScore,
   *            overflow, misses, outcome, elapsedMs }
   * outcome : 'points' | 'miss' | 'overflow' | 'win' | 'lose'
   */
  function applyThrow(game, fallenPins, now) {
    if (game.status !== 'playing') {
      throw new Error('La partie est terminée');
    }
    var fallen = (fallenPins || []).slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < fallen.length; i++) {
      var n = fallen[i];
      if (!(n >= 1 && n <= 12) || Math.floor(n) !== n) throw new Error('Quille invalide : ' + n);
      if (i > 0 && fallen[i - 1] === n) throw new Error('Quille comptée deux fois : ' + n);
    }

    var points = pointsForThrow(fallen);
    var scoreBefore = game.score;
    var total = scoreBefore + points;
    var overflow = false;
    if (total > TARGET) {
      total = OVERFLOW_RESET;
      overflow = true;
    }
    var misses = points === 0 ? game.misses + 1 : 0;

    var status = 'playing';
    var result = null;
    var outcome = points === 0 ? 'miss' : (overflow ? 'overflow' : 'points');
    if (total === TARGET) {
      status = 'ended'; result = 'win'; outcome = 'win';
    } else if (misses >= MAX_MISSES) {
      status = 'ended'; result = 'lose'; outcome = 'lose';
    }

    var record = {
      throwNumber: game.throwCount + 1,
      fallenPins: fallen,
      points: points,
      scoreBefore: scoreBefore,
      totalScore: total,
      overflow: overflow,
      misses: misses,
      outcome: outcome,
      elapsedMs: Math.max(0, now - game.startTime)
    };

    var next = {
      difficulty: game.difficulty,
      score: total,
      throwCount: record.throwNumber,
      misses: misses,
      status: status,
      result: result,
      history: game.history.concat([record]),
      startTime: game.startTime,
      endTime: status === 'ended' ? now : null
    };
    return { game: next, record: record };
  }

  /**
   * Défaite immédiate hors lancer (ex. : 'ours', le joueur s'est fait
   * attraper). Le score et l'historique sont conservés.
   */
  function forfeit(game, now, reason) {
    if (game.status !== 'playing') return game;
    return Object.assign({}, game, { status: 'ended', result: 'lose', reason: reason || null, endTime: now });
  }

  /** Durée de la partie en ms (en cours ou terminée). */
  function elapsed(game, now) {
    var end = game.endTime != null ? game.endTime : now;
    return Math.max(0, end - game.startTime);
  }

  /** Résumé de fin de partie, prêt à être sauvegardé. */
  function summarize(game) {
    return {
      difficulty: game.difficulty,
      result: game.result,
      reason: game.reason || null,
      score: game.score,
      throws: game.throwCount,
      timeMs: elapsed(game, game.endTime || game.startTime),
      history: game.history
    };
  }

  /**
   * Comparaison de deux résultats (true si a est meilleur que b).
   * Une victoire bat toujours une défaite. Entre deux victoires : moins de
   * lancers, puis temps le plus court. Entre deux défaites : score le plus
   * haut, puis le plus de lancers tenus.
   */
  function isBetter(a, b) {
    if (!b) return true;
    if (!a) return false;
    var aw = a.result === 'win', bw = b.result === 'win';
    if (aw !== bw) return aw;
    if (aw) {
      if (a.throws !== b.throws) return a.throws < b.throws;
      return a.timeMs < b.timeMs;
    }
    if (a.score !== b.score) return a.score > b.score;
    return a.throws > b.throws;
  }

  /** Formatage mm:ss */
  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var api = {
    TARGET: TARGET,
    OVERFLOW_RESET: OVERFLOW_RESET,
    MAX_MISSES: MAX_MISSES,
    pointsForThrow: pointsForThrow,
    createGame: createGame,
    applyThrow: applyThrow,
    forfeit: forfeit,
    elapsed: elapsed,
    summarize: summarize,
    isBetter: isBetter,
    formatTime: formatTime
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MK = root.MK || {};
    root.MK.Rules = api;
  }
})(typeof window !== 'undefined' ? window : this);
