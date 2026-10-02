/* Tests des règles de score — lancer avec : node tests/rules.test.js */
'use strict';
const assert = require('assert');
const R = require('../js/rules.js');
const { createStorage } = require('../js/storage.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  ÉCHEC  ' + name + '\n        ' + e.message); process.exitCode = 1; }
}

/** Joue une suite de lancers (tableaux de quilles) et retourne la partie. */
function play(throws) {
  let g = R.createGame('normal', 0);
  throws.forEach((pins, i) => { g = R.applyThrow(g, pins, (i + 1) * 1000).game; });
  return g;
}

console.log('Calcul des points');
test('aucune quille : 0 point', () => assert.strictEqual(R.pointsForThrow([]), 0));
test('une seule quille : sa valeur', () => assert.strictEqual(R.pointsForThrow([9]), 9));
test('une seule quille 12 : 12 points', () => assert.strictEqual(R.pointsForThrow([12]), 12));
test('plusieurs quilles : leur nombre', () => assert.strictEqual(R.pointsForThrow([12, 11, 10]), 3));
test('toutes les quilles : 12 points', () => assert.strictEqual(R.pointsForThrow([1,2,3,4,5,6,7,8,9,10,11,12]), 12));

console.log('Déroulement d\'une partie');
test('nouvelle partie remise à zéro', () => {
  const g = R.createGame('facile', 500);
  assert.deepStrictEqual([g.score, g.throwCount, g.misses, g.status, g.history.length], [0, 0, 0, 'playing', 0]);
});
test('le score s\'additionne et le numéro de lancer avance', () => {
  const g = play([[5], [3, 4], [12]]);
  assert.strictEqual(g.score, 5 + 2 + 12);
  assert.strictEqual(g.throwCount, 3);
});
test('chaque lancer est enregistré (quilles, points, total, numéro)', () => {
  const g = play([[7], [2, 9, 1]]);
  const r = g.history[1];
  assert.deepStrictEqual(r.fallenPins, [1, 2, 9]);
  assert.strictEqual(r.points, 3);
  assert.strictEqual(r.totalScore, 10);
  assert.strictEqual(r.throwNumber, 2);
});
test('dépasser 50 ramène à 25', () => {
  const g = play([[12], [12], [12], [12], [3]]); // 48 puis +3 = 51
  assert.strictEqual(g.score, 25);
  assert.strictEqual(g.history[4].overflow, true);
  assert.strictEqual(g.history[4].outcome, 'overflow');
  assert.strictEqual(g.status, 'playing');
});
test('50 pile : victoire immédiate', () => {
  const g = play([[12], [12], [12], [12], [2]]);
  assert.strictEqual(g.score, 50);
  assert.strictEqual(g.status, 'ended');
  assert.strictEqual(g.result, 'win');
  assert.strictEqual(g.endTime, 5000);
});
test('trois échecs consécutifs : défaite', () => {
  const g = play([[4], [], [], []]);
  assert.strictEqual(g.result, 'lose');
  assert.strictEqual(g.misses, 3);
  assert.strictEqual(g.history[3].outcome, 'lose');
});
test('un lancer réussi remet le compteur d\'échecs à zéro', () => {
  const g = play([[], [], [6], [], []]);
  assert.strictEqual(g.status, 'playing');
  assert.strictEqual(g.misses, 2);
});
test('un dépassement compte comme un lancer avec points (pas un échec)', () => {
  const g = play([[12], [12], [12], [12], [], [], [5]]);
  assert.strictEqual(g.score, 25);
  assert.strictEqual(g.misses, 0);
});
test('aucun lancer accepté après la fin', () => {
  const g = play([[], [], []]);
  assert.throws(() => R.applyThrow(g, [1], 9999));
});
test('quille invalide ou en double refusée', () => {
  const g = R.createGame('normal', 0);
  assert.throws(() => R.applyThrow(g, [13], 1));
  assert.throws(() => R.applyThrow(g, [4, 4], 1));
});
test('la partie d\'origine n\'est pas modifiée', () => {
  const g = R.createGame('normal', 0);
  R.applyThrow(g, [8], 10);
  assert.strictEqual(g.score, 0);
  assert.strictEqual(g.history.length, 0);
});

console.log('Meilleur résultat');
const win = (throws, timeMs) => ({ result: 'win', score: 50, throws, timeMs });
const lose = (score, throws) => ({ result: 'lose', score, throws, timeMs: 1 });
test('une victoire bat une défaite', () => assert.ok(R.isBetter(win(30, 9e5), lose(49, 10))));
test('moins de lancers gagne', () => assert.ok(R.isBetter(win(9, 9e5), win(10, 1))));
test('à lancers égaux, le plus rapide gagne', () => assert.ok(R.isBetter(win(10, 60000), win(10, 61000))));
test('entre défaites, le meilleur score gagne', () => assert.ok(R.isBetter(lose(40, 5), lose(30, 20))));
test('n\'importe quel résultat bat l\'absence de record',() => assert.ok(R.isBetter(lose(0, 3), null)));

console.log('Sauvegarde');
function fakeBackend() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
test('le meilleur résultat est gardé par difficulté', () => {
  const s = createStorage(fakeBackend(), 'k', R);
  assert.strictEqual(s.recordGame({ difficulty: 'normal', result: 'win', score: 50, throws: 14, timeMs: 1000, history: [] }).isNewBest, true);
  assert.strictEqual(s.recordGame({ difficulty: 'normal', result: 'win', score: 50, throws: 16, timeMs: 500, history: [] }).isNewBest, false);
  assert.strictEqual(s.recordGame({ difficulty: 'normal', result: 'win', score: 50, throws: 11, timeMs: 900, history: [] }).isNewBest, true);
  assert.strictEqual(s.getBest('normal').throws, 11);
  assert.strictEqual(s.getBest('facile'), null);
  assert.strictEqual(s.load().gamesPlayed, 3);
});
test('stockage corrompu : on repart de zéro sans planter', () => {
  const b = fakeBackend(); b.setItem('k', '{pas du json');
  const s = createStorage(b, 'k', R);
  assert.strictEqual(s.getBest('normal'), null);
});

console.log('Formatage');
test('mm:ss', () => { assert.strictEqual(R.formatTime(0), '00:00'); assert.strictEqual(R.formatTime(125400), '02:05'); });

console.log('\n' + passed + ' tests réussis' + (process.exitCode ? ' — des tests ont échoué' : ''));
