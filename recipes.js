'use strict';
// Logika przepisów: sprawdzanie składników względem zaleceń dietetyka, skalowanie porcji, lista zakupów.
// Czyste funkcje bez DOM, żeby dało się je testować w Node.

const ZdsRecipes = (() => {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
  const RANK = { ok: 0, lim: 1, no: 2 };
  const KEYS = [['ok', 'dozwolone'], ['lim', 'ograniczone'], ['no', 'zakazane']];

  const SECTIONS = ['Warzywa', 'Owoce', 'Mięso i ryby', 'Nabiał i jaja', 'Zboża i pieczywo', 'Tłuszcze i przyprawy', 'Inne'];
  const CAT_SECTION = {
    'Produkty zbożowe': 'Zboża i pieczywo',
    'Mięso, ryby, jaja': 'Mięso i ryby',
    'Mleko i produkty mleczne': 'Nabiał i jaja',
    'Tłuszcze': 'Tłuszcze i przyprawy',
    'Warzywa, przetwory z warzyw': 'Warzywa',
    'Owoce': 'Owoce',
    'Przyprawy': 'Tłuszcze i przyprawy',
  };

  function indexRules(rules) {
    const idx = [];
    for (const c of (rules && rules.kategorie) || []) {
      for (const [st, key] of KEYS) {
        for (const it of c[key]) {
          const n = norm(it);
          idx.push({ cat: c.nazwa, st, it, n, word: n.length >= 3 && !/[:(),]/.test(n) });
        }
      }
    }
    return idx;
  }

  // Zwraca najlepsze dopasowanie albo null. Przy kilku różnych wynikach bierze ostrożniejszy (gorszy)
  // i ustawia amb: true, żeby widok mógł poprosić o sprawdzenie dokładnego rodzaju.
  function matchRule(idx, text) {
    const q = norm(text);
    if (q.length < 2) return null;
    const exact = idx.filter((x) => x.n === q);
    let hits = exact;
    if (!hits.length) {
      hits = idx.filter((x) => (q.length >= 4 && x.n.includes(q)) || (x.word && (' ' + q + ' ').includes(' ' + x.n + ' ')));
    }
    if (!hits.length) return null;
    let worst = hits[0];
    for (const h of hits) if (RANK[h.st] > RANK[worst.st]) worst = h;
    const amb = new Set(hits.map((h) => h.st)).size > 1;
    return { st: worst.st, cat: worst.cat, it: worst.it, amb };
  }

  // st: ok | lim | no | unk (brak w zaleceniach) | neutral (np. woda)
  function checkIngredient(idx, ing) {
    if (ing.neutral) return { st: 'neutral' };
    const m = matchRule(idx, ing.rule || ing.n);
    return m ? { st: m.st, cat: m.cat, it: m.it, amb: m.amb } : { st: 'unk' };
  }

  // Wynik przepisu: najgorszy status składników. Składniki drobne (sól, pieprz) nie zmieniają oceny całości.
  function checkRecipe(idx, r) {
    const items = r.skladniki.map((ing) => ({ ing, ...checkIngredient(idx, ing) }));
    let st = 'ok';
    let unk = 0;
    let fruit = false;
    for (const x of items) {
      if (x.st === 'unk') { unk++; continue; }
      if (x.st === 'neutral') continue;
      if (x.cat === 'Owoce') fruit = true;
      if (x.ing.drobny && x.st !== 'no') continue;
      if (RANK[x.st] > RANK[st]) st = x.st;
    }
    return { st, unk, fruit, items };
  }

  function fmtQty(q, unit, up) {
    if (q == null) return '';
    let v = q;
    if (unit === 'g' || unit === 'ml') {
      const step = v >= 50 ? 5 : 1;
      v = (up ? Math.ceil(v / step - 1e-9) : Math.round(v / step)) * step;
    } else if (up && ['szt', 'kromka', 'ząbek', 'pęczek', 'garść', ''].includes(unit)) {
      v = Math.ceil(v - 1e-9);
    } else {
      v = (up ? Math.ceil(v * 4 - 1e-9) : Math.round(v * 4)) / 4;
    }
    return String(v).replace('.', ',') + (unit ? ' ' + unit : '');
  }

  function parseLine(line) {
    const m = String(line).trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|szt|łyżka|łyżki|łyżeczka|łyżeczki|ząbek|ząbki|pęczek|garść|kromka|kromki)?\.?\s+(.+)$/i);
    if (!m) return { n: String(line).trim(), q: null, u: '' };
    let q = Number(m[1].replace(',', '.'));
    let u = (m[2] || '').toLowerCase();
    if (u === 'kg') { q *= 1000; u = 'g'; }
    if (u === 'l') { q *= 1000; u = 'ml'; }
    return { n: m[3].trim(), q, u };
  }

  function guessSection(idx, ing) {
    if (ing.s) return ing.s;
    if (/jaj/.test(norm(ing.n))) return 'Nabiał i jaja';
    const m = matchRule(idx, ing.rule || ing.n);
    return (m && CAT_SECTION[m.cat]) || 'Inne';
  }

  // entries: [{ rid, portions }], byId: id -> przepis
  function shoppingList(idx, entries, byId) {
    const map = new Map();
    for (const e of entries) {
      const r = byId[e.rid];
      if (!r) continue;
      const f = e.portions / (r.porcje || 1);
      for (const ing of r.skladniki) {
        if (ing.neutral) continue;
        const key = norm(ing.n) + '|' + (ing.u || '');
        const cur = map.get(key) || { key, name: ing.n, unit: ing.u || '', qty: ing.q == null ? null : 0, section: guessSection(idx, ing) };
        if (ing.q != null && cur.qty != null) cur.qty += ing.q * f;
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.name.localeCompare(b.name, 'pl'));
  }

  const dayAfter = (iso, n) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('sv-SE');
  };

  return { norm, indexRules, matchRule, checkIngredient, checkRecipe, fmtQty, parseLine, guessSection, shoppingList, dayAfter, SECTIONS };
})();

if (typeof module !== 'undefined') module.exports = ZdsRecipes;
