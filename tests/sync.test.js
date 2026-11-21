'use strict';
// Uruchom: node tests/sync.test.js
const assert = require('assert');
const S = require('../sync.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
let idc = 0;
const mkId = () => 'L' + (++idc);

// ---------- mergeMembers ----------
ok('łączy po imieniu, dodaje brakujące, wysyła lokalne bez odpowiednika', () => {
  const local = [{ id: 'a', name: 'Franciszek', role: 'dziecko', kcal: 1750 }, { id: 'b', name: 'Dorosły 2', role: 'dorosły', kcal: 0 }];
  const remote = [
    { id: 'R1', user_id: null, name: 'franciszek ', role: 'dziecko', kcal_goal: 1750 },
    { id: 'R2', user_id: 'u1', name: 'Rodzic 1', role: 'rodzic', kcal_goal: 0 },
  ];
  const { profiles, toInsert } = S.mergeMembers(local, remote, mkId);
  assert.strictEqual(profiles.length, 3);
  assert.strictEqual(profiles.find((p) => p.id === 'a').remoteId, 'R1');
  assert.ok(profiles.find((p) => p.remoteId === 'R2'));
  assert.deepStrictEqual(toInsert.map((p) => p.id), ['b']);
});

ok('napoje dnia synchronizują się w obie strony, a puste nie zmieniają formatu', () => {
  const days = { '2026-11-20|a': { meals: {}, water: 1, drinks: [{ id: 'herbata-owocowa', name: 'Herbata owocowa', ml: 250 }], u: 200 } };
  const rows = S.dayRowsToPush(days, {}, [{ id: 'a', remoteId: 'R1' }]);
  assert.deepStrictEqual(rows[0].row.data.drinks, [{ id: 'herbata-owocowa', name: 'Herbata owocowa', ml: 250 }]);
  const remote = [{ member_id: 'R1', day: '2026-11-21', data: { water: 2, drinks: [{ id: 'kefir', name: 'Kefir', ml: 200 }] }, updated_at: new Date(9000).toISOString() }];
  const d2 = {};
  assert.strictEqual(S.applyRemoteDays(d2, {}, remote, [{ id: 'a', remoteId: 'R1' }]), 1);
  assert.strictEqual(d2['2026-11-21|a'].drinks[0].id, 'kefir');
});

ok('aktywności dnia synchronizują się', () => {
  const days = { '2026-11-20|a': { meals: {}, water: 0, activities: [{ name: 'Rower', min: 45 }], u: 5 } };
  const rows = S.dayRowsToPush(days, {}, [{ id: 'a', remoteId: 'R1' }]);
  assert.deepStrictEqual(rows[0].row.data.activities, [{ name: 'Rower', min: 45 }]);
});

ok('wspólne dane: nowy telefon dostaje plan i przepisy z serwera', () => {
  const st = { plan: {}, recipes: [], pantry: [], shop: { checked: {} }, profiles: [] };
  const remote = [{ key: 'plan', data: { '2026-11-22|obiad': [{ rid: 'losos', portions: 3 }] } }, { key: 'recipes', data: { 'c-1': { id: 'c-1', name: 'Zupa mamy' } } }];
  const up = S.mergeFamily(st, remote);
  assert.deepStrictEqual(st.plan['2026-11-22|obiad'], [{ rid: 'losos', portions: 3 }]);
  assert.strictEqual(st.recipes[0].name, 'Zupa mamy');
  assert.ok(!up.some((u) => u.key === 'plan' || u.key === 'recipes'));
});

ok('wspólne dane: zmiany z dwóch telefonów w tym samym posiłku łączą się, usunięcie działa', () => {
  const base = { '2026-11-22|obiad': [{ rid: 'a' }], '2026-11-23|obiad': [{ rid: 'x' }] };
  const local = { '2026-11-22|obiad': [{ rid: 'a' }, { rid: 'b' }] };                // dodano b, usunięto 23.11
  const remote = { '2026-11-22|obiad': [{ rid: 'a' }, { rid: 'c' }], '2026-11-23|obiad': [{ rid: 'x' }] };
  const m = S.mergeMap(local, base, remote, true);
  assert.deepStrictEqual(m['2026-11-22|obiad'].map((e) => e.rid).sort(), ['a', 'b', 'c']);
  assert.strictEqual(m['2026-11-23|obiad'], undefined);
});

ok('wspólne dane: pierwszy telefon wysyła swój plan na serwer', () => {
  const st = { plan: { '2026-11-22|ii': [{ name: 'jabłko', kcal: 80, portions: 1 }] }, recipes: [], pantry: ['sól'], shop: { checked: {} }, profiles: [] };
  const up = S.mergeFamily(st, []);
  assert.ok(up.some((u) => u.key === 'plan'));
  assert.ok(up.some((u) => u.key === 'pantry'));
  assert.deepStrictEqual(S.mergeFamily(st, up.map((u) => ({ key: u.key, data: u.data }))), []);
});

ok('serwer wygrywa w danych profilu, usunięty na serwerze znika lokalnie', () => {
  const local = [{ id: 'a', remoteId: 'R1', name: 'Stare', role: 'dorosły', kcal: 1 }, { id: 'x', remoteId: 'R9', name: 'Usunięty', role: 'dorosły', kcal: 0 }];
  const remote = [{ id: 'R1', user_id: 'u', name: 'Nowe', role: 'rodzic', kcal_goal: 2200 }];
  const { profiles } = S.mergeMembers(local, remote, mkId);
  assert.deepStrictEqual(profiles.map((p) => [p.name, p.role, p.kcal]), [['Nowe', 'rodzic', 2200]]);
});

// ---------- dni ----------
const profs = [{ id: 'a', remoteId: 'R1' }, { id: 'b' }];

ok('wysyła tylko zmienione dni profili z kontem na serwerze', () => {
  const days = {
    '2026-11-20|a': { meals: {}, water: 3, u: 200 },
    '2026-11-19|a': { meals: {}, water: 1, u: 100 },
    '2026-11-20|b': { meals: {}, water: 2, u: 300 },
  };
  const synced = { '2026-11-19|a': 100 };
  const rows = S.dayRowsToPush(days, synced, profs);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0].row, { member_id: 'R1', day: '2026-11-20', data: { meals: {}, water: 3 } });
});

ok('nowszy wpis z serwera wygrywa, starszy nie nadpisuje lokalnego', () => {
  const days = { '2026-11-20|a': { meals: {}, water: 3, u: 5000 } };
  const synced = {};
  const older = [{ member_id: 'R1', day: '2026-11-20', data: { water: 1 }, updated_at: new Date(1000).toISOString() }];
  assert.strictEqual(S.applyRemoteDays(days, synced, older, profs), 0);
  assert.strictEqual(days['2026-11-20|a'].water, 3);
  const newer = [{ member_id: 'R1', day: '2026-11-20', data: { water: 6 }, updated_at: new Date(9000).toISOString() }];
  assert.strictEqual(S.applyRemoteDays(days, synced, newer, profs), 1);
  assert.strictEqual(days['2026-11-20|a'].water, 6);
  assert.strictEqual(synced['2026-11-20|a'], 9000);
});

ok('identyczne dane nie powodują nadpisania ani ponownego wysyłania', () => {
  const days = { '2026-11-20|a': { meals: {}, water: 4, u: 7000 } };
  const synced = {};
  const same = [{ member_id: 'R1', day: '2026-11-20', data: { meals: {}, water: 4 }, updated_at: new Date(8000).toISOString() }];
  assert.strictEqual(S.applyRemoteDays(days, synced, same, profs), 0);
  assert.strictEqual(days['2026-11-20|a'].u, 7000);
  assert.strictEqual(S.dayRowsToPush(days, synced, profs).length, 0);
});

// ---------- syncAll z udawanym klientem Supabase ----------
function fakeSb(db) {
  const q = (table) => {
    let filter = () => true, op = 'select', payload;
    const b = {
      select() { return b; },
      eq(c, v) { const f = filter; filter = (r) => f(r) && r[c] === v; return b; },
      in(c, vs) { const f = filter; filter = (r) => f(r) && vs.includes(r[c]); return b; },
      insert(row) { op = 'insert'; payload = row; return b; },
      update(row) { op = 'update'; payload = row; return b; },
      upsert(row) { op = 'upsert'; payload = row; return b; },
      single() { return b; },
      then(res) {
        if (!db[table]) return Promise.resolve({ data: null, error: { message: `Could not find the table 'public.${table}' in the schema cache` } }).then(res);
        let data = null;
        if (op === 'select') data = db[table].filter(filter);
        else if (op === 'insert') { const r = { id: 'S' + db[table].length, user_id: null, ...payload }; db[table].push(r); data = r; }
        else if (op === 'update') db[table].filter(filter).forEach((r) => Object.assign(r, payload));
        else if (op === 'upsert') {
          const ex = db[table].find((r) => r.member_id === payload.member_id && r.day === payload.day);
          if (ex) Object.assign(ex, payload, { updated_at: new Date(50000).toISOString() });
          else db[table].push({ ...payload, updated_at: new Date(50000).toISOString() });
        }
        return Promise.resolve({ data, error: null }).then(res);
      },
    };
    return b;
  };
  return { from: q };
}

ok('syncAll: rodzic wysyła lokalne profile i dni, pobiera dni z serwera', async () => {
  const db = {
    members: [{ id: 'R2', user_id: 'u1', family_id: 'F', name: 'Rodzic 1', role: 'rodzic', kcal_goal: 0 }],
    day_logs: [{ member_id: 'R2', day: '2026-11-19', data: { water: 5, meals: {} }, updated_at: new Date(10000).toISOString() }],
  };
  S._setClient(fakeSb(db));
  const state = {
    profiles: [{ id: 'a', name: 'Franciszek', role: 'dziecko', kcal: 1750 }, { id: 'p', name: 'Rodzic 1', role: 'rodzic', kcal: 0 }],
    current: 'a', synced: {},
    days: { '2026-11-20|a': { meals: { obiad: { done: true, items: [] } }, water: 2, u: 20000 } },
  };
  const res = await S.syncAll('F', 'rodzic', { state, mkId });
  assert.strictEqual(db.members.length, 2);
  const fr = state.profiles.find((p) => p.name === 'Franciszek');
  assert.ok(fr.remoteId);
  assert.strictEqual(state.profiles.find((p) => p.name === 'Rodzic 1').remoteId, 'R2');
  assert.strictEqual(db.day_logs.length, 2);
  assert.strictEqual(state.days['2026-11-19|p'].water, 5);
  assert.strictEqual(res.pushed, 1);
  assert.strictEqual(res.pulled, 1);
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log('ok -', name); }
  console.log(`\n${tests.length} testów OK`);
})().catch((e) => { console.error(e); process.exit(1); });
