'use strict';
// Uruchom: node tests/recipes.test.js
const assert = require('assert');
const R = require('../recipes.js');
const rules = require('../data/rules.json');
const { recipes } = require('../data/recipes.json');

const idx = R.indexRules(rules);
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('każdy wbudowany przepis ma wszystkie składniki ze zgodnością z zaleceniami (bez zakazanych i nieznanych)', () => {
  for (const r of recipes) {
    const c = R.checkRecipe(idx, r);
    for (const x of c.items) {
      assert.ok(x.st !== 'no', `${r.id}: zakazany składnik ${x.ing.n} (${x.it})`);
      assert.ok(x.st !== 'unk', `${r.id}: składnik spoza zaleceń: ${x.ing.n}`);
    }
    assert.notStrictEqual(c.st, 'no', r.id);
  }
});

ok('przepisy mają poprawną budowę: posiłki, porcje, kroki, timery', () => {
  const meals = ['sniadanie', 'ii', 'obiad', 'przekaska', 'kolacja'];
  const ids = new Set();
  for (const r of recipes) {
    assert.ok(!ids.has(r.id)); ids.add(r.id);
    assert.ok(r.posilki.length && r.posilki.every((m) => meals.includes(m)), r.id);
    assert.ok(r.porcje > 0 && r.kroki.length > 0 && r.skladniki.length > 0, r.id);
    for (const k of r.kroki) {
      assert.ok(!k.dev || ['tm6', 'af'].includes(k.dev), r.id);
      assert.ok(!k.timer || Number.isInteger(k.timer), r.id);
    }
    for (const d of r.urz) assert.ok(r.kroki.some((k) => k.dev === d), `${r.id}: brak kroku dla ${d}`);
    for (const k of r.kroki) if (k.dev) assert.ok(r.urz.includes(k.dev), r.id);
    for (const i of r.skladniki) assert.ok(R.SECTIONS.includes(i.s), `${r.id}: sekcja ${i.s}`);
  }
});

ok('air fryer: żadnej bułki tartej ani panierki w przepisach', () => {
  for (const r of recipes) for (const i of r.skladniki) assert.ok(!/bułka tarta|panier/i.test(i.n), r.id);
});

ok('matchRule: dokładne dopasowanie wygrywa, zakazane wykrywane', () => {
  assert.strictEqual(R.matchRule(idx, 'banan').st, 'no');
  assert.strictEqual(R.matchRule(idx, 'śmietana').st, 'no');
  assert.strictEqual(R.matchRule(idx, 'Kasza gryczana').st, 'ok');
  assert.strictEqual(R.matchRule(idx, 'marchew').st, 'lim');
  assert.strictEqual(R.matchRule(idx, 'ziemniaki').st, 'lim');
  assert.strictEqual(R.matchRule(idx, 'bułka tarta').st, 'no');
  assert.strictEqual(R.matchRule(idx, 'kalafior').st, 'lim');
});

ok('matchRule: krótkie słowa nie łapią się na środku wyrazu (mak vs makaron)', () => {
  assert.strictEqual(R.matchRule(idx, 'mak').st, 'no');
  assert.strictEqual(R.matchRule(idx, 'makaron razowy').st, 'ok');
  assert.strictEqual(R.matchRule(idx, 'sól morska').st, 'lim');
  assert.strictEqual(R.matchRule(idx, 'xyzzy'), null);
});

ok('matchRule: niejednoznaczne bierze ostrożniejszy wynik i oznacza amb', () => {
  const m = R.matchRule(idx, 'papryka');
  assert.strictEqual(m.st, 'lim');
  assert.strictEqual(m.amb, true);
});

ok('checkRecipe: zakazany składnik psuje cały przepis, sól nie obniża oceny, owoce wykrywane', () => {
  const bad = { skladniki: [{ n: 'banan', q: 1, u: 'szt' }, { n: 'jogurt naturalny', q: 100, u: 'g' }] };
  assert.strictEqual(R.checkRecipe(idx, bad).st, 'no');
  const salty = { skladniki: [{ n: 'sól', q: 1, u: 'łyżeczka', drobny: true }, { n: 'kasza jaglana', q: 50, u: 'g' }] };
  const c = R.checkRecipe(idx, salty);
  assert.strictEqual(c.st, 'ok');
  assert.strictEqual(c.fruit, false);
  assert.strictEqual(R.checkRecipe(idx, { skladniki: [{ n: 'jabłka', q: 1, u: 'szt' }] }).fruit, true);
  const unk = R.checkRecipe(idx, { skladniki: [{ n: 'cukinia', q: 1, u: 'szt' }, { n: 'woda', q: 1, u: 'ml', neutral: true }] });
  assert.strictEqual(unk.unk, 1);
  assert.strictEqual(unk.st, 'ok');
});

ok('parseLine: ilości, jednostki, przeliczanie kg i l', () => {
  assert.deepStrictEqual(R.parseLine('200 g kasza gryczana'), { n: 'kasza gryczana', q: 200, u: 'g' });
  assert.deepStrictEqual(R.parseLine('1,5 kg jabłka'), { n: 'jabłka', q: 1500, u: 'g' });
  assert.deepStrictEqual(R.parseLine('0,5 l woda'), { n: 'woda', q: 500, u: 'ml' });
  assert.deepStrictEqual(R.parseLine('2 jajka'), { n: 'jajka', q: 2, u: '' });
  assert.deepStrictEqual(R.parseLine('oliwa'), { n: 'oliwa', q: null, u: '' });
});

ok('fmtQty: zaokrąglenia, polski przecinek, zaokrąglanie w górę na zakupach', () => {
  assert.strictEqual(R.fmtQty(152, 'g'), '150 g');
  assert.strictEqual(R.fmtQty(152, 'g', true), '155 g');
  assert.strictEqual(R.fmtQty(1.5, 'szt'), '1,5 szt');
  assert.strictEqual(R.fmtQty(0.33, 'łyżka'), '0,25 łyżka');
  assert.strictEqual(R.fmtQty(2.75, 'szt', true), '3 szt');
  assert.strictEqual(R.fmtQty(2.75, 'szt'), '2,75 szt');
  assert.strictEqual(R.fmtQty(0.33, 'łyżka', true), '0,5 łyżka');
  assert.strictEqual(R.fmtQty(null, ''), '');
});

ok('shoppingList: sumuje te same składniki, skaluje porcje, pomija wodę, grupuje', () => {
  const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const list = R.shoppingList(idx, [{ rid: 'owsianka-jablko', portions: 3 }, { rid: 'jaglanka-maliny', portions: 6 }, { rid: 'jablko-af', portions: 3 }], byId);
  const jog = list.find((x) => x.name === 'jogurt naturalny');
  assert.strictEqual(jog.qty, 150 + 300 + 150);
  const jab = list.find((x) => x.name === 'jabłka');
  assert.strictEqual(jab.qty, 5);
  assert.ok(!list.some((x) => x.name === 'woda'));
  assert.strictEqual(jab.section, 'Owoce');
  const order = list.map((x) => R.SECTIONS.indexOf(x.section));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b));
  const half = R.shoppingList(idx, [{ rid: 'jogurt-jagody', portions: 1 }], byId);
  assert.strictEqual(half.find((x) => x.name === 'jogurt naturalny').qty, 150);
});

ok('guessSection: własny przepis dostaje sekcję z kategorii zaleceń, jajka do nabiału', () => {
  assert.strictEqual(R.guessSection(idx, { n: 'brokuły' }), 'Warzywa');
  assert.strictEqual(R.guessSection(idx, { n: 'jajka' }), 'Nabiał i jaja');
  assert.strictEqual(R.guessSection(idx, { n: 'coś nieznanego' }), 'Inne');
});

ok('dayAfter: dodaje dni także przez zmianę miesiąca', () => {
  assert.strictEqual(R.dayAfter('2026-11-29', 2), '2026-12-01');
});

(async () => {
  let fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('OK   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); }
  }
  console.log(fail ? `\n${fail} niepowodzeń` : '\nWSZYSTKIE TESTY OK');
  process.exit(fail ? 1 : 0);
})();
