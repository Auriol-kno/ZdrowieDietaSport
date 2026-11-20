'use strict';

const MEALS = [
  ['sniadanie', 'Śniadanie', '7:00'],
  ['ii', 'II śniadanie', '10:30'],
  ['obiad', 'Obiad', '14:00'],
  ['przekaska', 'Przekąska', '17:30'],
  ['kolacja', 'Kolacja', '20:30'],
];
const KEY = 'zds.v1';
const GLASS_ML = 250;
const WATER_GOAL = 8; // 8 x 250 ml = 2 l (zalecenie dietetyka)
const FRUIT_DEADLINE_HOUR = 16;

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayKey = () => new Date().toLocaleDateString('sv-SE');
const uid = () => Math.random().toString(36).slice(2, 9);

function defaults() {
  const f = { id: uid(), name: 'Franciszek', role: 'dziecko', kcal: 1750 };
  return {
    profiles: [f, { id: uid(), name: 'Dorosły 1', role: 'dorosły', kcal: 0 }, { id: uid(), name: 'Dorosły 2', role: 'dorosły', kcal: 0 }],
    current: f.id,
    pin: '',
    days: {},
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.profiles) && s.profiles.length) return s;
  } catch (e) { /* brak danych lub pamięć niedostępna */ }
  return defaults();
}

let state = load();
let parent = false;
let tab = 'dzis';
let rules = { kategorie: [] };

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* pamięć niedostępna */ }
}

const cur = () => state.profiles.find((p) => p.id === state.current) || state.profiles[0];
const isKid = () => cur().role === 'dziecko' && !parent;

function day() {
  const k = dayKey() + '|' + cur().id;
  if (!state.days[k]) state.days[k] = { meals: {}, water: 0 };
  return state.days[k];
}

function meal(d, key) {
  if (!d.meals[key]) d.meals[key] = { done: false, items: [] };
  return d.meals[key];
}

function eatenKcal(d) {
  let t = 0;
  for (const [key] of MEALS) {
    const m = d.meals[key];
    if (m && m.done) t += m.items.reduce((a, i) => a + (Number(i.kcal) || 0), 0);
  }
  return t;
}

// ---------- reguły z zaleceń dietetyka ----------
const LABEL = { ok: 'Dozwolone', lim: 'W ograniczonych ilościach', no: 'Zakazane' };
const LABEL_KID = { ok: 'Można', lim: 'Czasem i mało', no: 'Nie teraz' };
const MARK = { ok: '✓', lim: '▲', no: '✕' };
const KEYS = [['ok', 'dozwolone'], ['lim', 'ograniczone'], ['no', 'zakazane']];

function searchRules(q) {
  const nq = norm(q.trim());
  if (nq.length < 2) return [];
  const out = [];
  for (const c of rules.kategorie) {
    for (const [st, key] of KEYS) {
      for (const it of c[key]) {
        if (norm(it).includes(nq)) out.push({ cat: c.nazwa, st, it });
      }
    }
  }
  return out;
}

function resultsHtml(q) {
  const kid = isKid();
  const res = searchRules(q);
  if (q.trim().length < 2) return '<p class="muted">Wpisz co najmniej 2 litery.</p>';
  if (!res.length) return '<p class="muted">Brak w zaleceniach. Zapytaj dietetyka albo sprawdź skład produktu.</p>';
  return res.map((r) => `<div class="card res"><div><strong>${esc(cap(r.it))}</strong></div>` +
    `<div class="row sb"><span class="muted">${esc(r.cat)}</span>` +
    `<span class="pill ${r.st}"><span aria-hidden="true">${MARK[r.st]}</span>${(kid ? LABEL_KID : LABEL)[r.st]}</span></div></div>`).join('');
}

// ---------- widoki ----------
function viewToday() {
  const p = cur(), d = day(), kid = isKid();
  const done = MEALS.filter(([k]) => d.meals[k] && d.meals[k].done).length;
  const pct = Math.min(100, Math.round((d.water / WATER_GOAL) * 100));
  let html = `<div><h1>${kid ? `Cześć, ${esc(p.name)}!` : esc(p.name)}</h1><div class="muted">${new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>`;

  if (!kid && p.kcal > 0) {
    const e = eatenKcal(d), kp = Math.min(100, Math.round((e / p.kcal) * 100));
    html += `<div class="card"><div class="row sb"><div><span class="big">${e}</span> <span class="muted">kcal zjedzone</span></div><div class="muted">Cel: ${p.kcal} kcal</div></div>` +
      `<div class="bar" role="progressbar" aria-label="Kalorie" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${kp}"><i style="width:${kp}%"></i></div>` +
      `<div class="muted">Zostało ${Math.max(0, p.kcal - e)} kcal</div></div>`;
  }

  html += `<div class="card"><div class="row sb"><h2>Woda</h2><span class="muted">${d.water} z ${WATER_GOAL} szklanek (${d.water * GLASS_ML / 1000} l z 2 l)</span></div>` +
    `<div class="bar water" role="progressbar" aria-label="Woda" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>` +
    `<div class="row"><button type="button" class="small" data-action="water" data-d="1">+ szklanka</button>` +
    `<button type="button" class="small ghost" data-action="water" data-d="-1">− szklanka</button></div></div>`;

  if (new Date().getHours() >= FRUIT_DEADLINE_HOUR) {
    html += '<div class="note warn">Owoce jemy tylko do 16:00 i nie na ostatni posiłek.</div>';
  }

  html += `<div class="card"><div class="row sb"><h2>Posiłki</h2><span class="muted">${done} z ${MEALS.length}</span></div>`;
  for (const [key, name, time] of MEALS) {
    const m = meal(d, key);
    html += `<div class="meal"><div class="row sb"><div><strong>${name}</strong> <span class="muted">${time}</span></div>` +
      `<button type="button" class="small ${m.done ? 'done' : 'ghost'}" data-action="done" data-meal="${key}" aria-pressed="${m.done}">${m.done ? '✓ Zjedzone' : 'Zjedzone'}</button></div>`;
    if (m.items.length) {
      html += '<ul>' + m.items.map((it, i) => `<li><span>${esc(it.name)}${!kid && it.kcal ? ` <span class="muted">· ${esc(it.kcal)} kcal</span>` : ''}</span>` +
        (!kid ? `<button type="button" class="small ghost" data-action="del" data-meal="${key}" data-i="${i}" aria-label="Usuń ${esc(it.name)}">✕</button>` : '') + '</li>').join('') + '</ul>';
    } else if (kid) {
      html += '<div class="muted">Rodzic jeszcze nie dopisał dań.</div>';
    }
    if (!kid) {
      html += `<form data-meal="${key}"><label class="sr" for="n-${key}">Danie</label><input type="text" id="n-${key}" placeholder="Danie" required>` +
        `<label class="sr" for="k-${key}">kcal</label><input type="number" id="k-${key}" placeholder="kcal" min="0" inputmode="numeric">` +
        '<button type="submit" class="small">Dodaj</button></form>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function viewCheck() {
  return '<h1>Czy mogę to zjeść?</h1>' +
    '<div class="field"><label for="q" class="muted">Szukaj produktu</label><input type="text" id="q" placeholder="np. kefir, płatki, banan" autocomplete="off"></div>' +
    `<div id="results">${resultsHtml('')}</div>`;
}

function viewProfiles() {
  if (isKid()) {
    return '<h1>Profile</h1><div class="note warn">Tę część widzą tylko rodzice. Włącz tryb rodzica na górze.</div>';
  }
  let html = '<h1>Profile</h1>';
  for (const p of state.profiles) {
    html += `<div class="card" data-pid="${p.id}"><div class="grid">` +
      `<div class="field"><label for="pn-${p.id}">Imię</label><input type="text" id="pn-${p.id}" data-field="name" value="${esc(p.name)}"></div>` +
      `<div class="field"><label for="pr-${p.id}">Rola</label><select id="pr-${p.id}" data-field="role">` +
      ['dziecko', 'dorosły'].map((r) => `<option${r === p.role ? ' selected' : ''}>${r}</option>`).join('') + '</select></div>' +
      `<div class="field"><label for="pk-${p.id}">Cel kcal (0 = brak)</label><input type="number" id="pk-${p.id}" data-field="kcal" min="0" value="${p.kcal}"></div>` +
      `<div class="field"><span>&nbsp;</span><button type="button" class="ghost" data-action="rm-profile" data-id="${p.id}">Usuń profil</button></div></div></div>`;
  }
  html += '<button type="button" data-action="add-profile">Dodaj profil</button>' +
    '<div class="note">Synchronizacja między telefonami: wkrótce. Na razie dane są tylko na tym urządzeniu.</div>';
  return html;
}

function render() {
  const sel = $('#profile');
  sel.innerHTML = state.profiles.map((p) => `<option value="${p.id}"${p.id === state.current ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#parent-toggle').textContent = parent ? 'Tryb rodzica: wł.' : 'Tryb rodzica';
  document.body.classList.toggle('kid', isKid());
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#view').innerHTML = tab === 'dzis' ? viewToday() : tab === 'sprawdz' ? viewCheck() : viewProfiles();
}

// ---------- zdarzenia ----------
function toggleParent() {
  if (parent) { parent = false; render(); return; }
  if (!state.pin) {
    const p = prompt('Ustaw PIN rodzica (min. 4 cyfry). To tylko zasłona widoku dziecka, nie zabezpieczenie danych.');
    if (!p) return;
    if (!/^\d{4,}$/.test(p)) { alert('PIN: co najmniej 4 cyfry.'); return; }
    state.pin = p; save(); parent = true;
  } else {
    const p = prompt('PIN rodzica');
    if (p !== state.pin) { if (p !== null) alert('Zły PIN.'); return; }
    parent = true;
  }
  render();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'parent-toggle') return toggleParent();
  if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
  const a = t.dataset.action;
  if (!a) return;
  const d = day();
  if (a === 'water') d.water = Math.max(0, d.water + Number(t.dataset.d));
  else if (a === 'done') { const m = meal(d, t.dataset.meal); m.done = !m.done; }
  else if (a === 'del') meal(d, t.dataset.meal).items.splice(Number(t.dataset.i), 1);
  else if (a === 'add-profile') { const p = { id: uid(), name: 'Nowy profil', role: 'dorosły', kcal: 0 }; state.profiles.push(p); }
  else if (a === 'rm-profile') {
    if (state.profiles.length < 2) return alert('Musi zostać co najmniej jeden profil.');
    if (!confirm('Usunąć ten profil?')) return;
    state.profiles = state.profiles.filter((p) => p.id !== t.dataset.id);
    if (state.current === t.dataset.id) state.current = state.profiles[0].id;
  }
  save(); render();
});

document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-meal]');
  if (!f) return;
  e.preventDefault();
  const name = f.querySelector('input[type=text]').value.trim();
  const kcal = f.querySelector('input[type=number]').value;
  if (!name) return;
  meal(day(), f.dataset.meal).items.push({ name, kcal: kcal === '' ? 0 : Number(kcal) });
  save(); render();
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') $('#results').innerHTML = resultsHtml(e.target.value);
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'profile') { state.current = e.target.value; save(); return render(); }
  const box = e.target.closest('[data-pid]');
  if (box && e.target.dataset.field) {
    const p = state.profiles.find((x) => x.id === box.dataset.pid);
    const f = e.target.dataset.field;
    p[f] = f === 'kcal' ? Math.max(0, Number(e.target.value) || 0) : e.target.value.trim() || p[f];
    save(); render();
  }
});

async function init() {
  try {
    const r = await fetch('data/rules.json');
    rules = await r.json();
  } catch (e) { /* offline bez cache: wyszukiwarka pusta */ }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (typeof document !== 'undefined' && document.getElementById('view')) init();
if (typeof module !== 'undefined') module.exports = { norm, searchRules, setRules: (r) => { rules = r; } };
