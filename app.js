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
  const f = { id: uid(), name: 'Franek', nick: 'Franek', role: 'dziecko', kcal: 1750 };
  return {
    profiles: [f, { id: uid(), name: 'Dorosły 1', role: 'dorosły', kcal: 0 }, { id: uid(), name: 'Dorosły 2', role: 'dorosły', kcal: 0 }],
    current: f.id,
    pin: '',
    days: {},
    synced: {},
    fam: null,
    plan: {},
    pantry: [],
    shop: { checked: {} },
    recipes: [],
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.profiles) && s.profiles.length) {
      s.synced = s.synced || {}; s.fam = s.fam || null;
      s.plan = s.plan || {}; s.pantry = s.pantry || []; s.shop = s.shop || { checked: {} }; s.shop.checked = s.shop.checked || {}; s.recipes = s.recipes || [];
      for (const p of s.profiles) if (p.name === 'Franciszek') { p.name = 'Franek'; p.nick = 'Franek'; }
      return s;
    }
  } catch (e) { /* brak danych lub pamięć niedostępna */ }
  return defaults();
}

let state = load();
let parent = false;
let tab = 'dzis';
let rules = { kategorie: [] };

let syncTimer = null;
function save(noSync) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* pamięć niedostępna */ }
  if (!noSync && state.fam && typeof ZdsSync !== 'undefined' && ZdsSync.enabled()) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => runSync(true), 4000);
  }
}

const cur = () => state.profiles.find((p) => p.id === state.current) || state.profiles[0];
// Telefon dziecka: bez trybu rodzica zawsze pokazuje profil dziecka i nie pozwala go zmienić.
function lockKidDevice() {
  if (parent || !state.kidDevice) return;
  if (state.profiles.some((p) => p.id === state.kidDevice)) state.current = state.kidDevice;
}
const isKid = () => { lockKidDevice(); return (cur().role === 'dziecko' || Boolean(state.kidDevice)) && !parent; };

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
    if (m && m.done) t += m.items.reduce((a, i) => a + (i.prop ? 0 : Number(i.kcal) || 0), 0);
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
function gauge(pct, tone, label, sub) {
  return `<div class="gauge-wrap"><div class="gauge ${tone}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="height:${Math.max(pct, 8)}%"></i></div>` +
    `<div class="gauge-text"><strong>${pct}%</strong><span class="muted">${esc(sub)}</span></div></div>`;
}

function ring(done, total) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - done / total);
  return `<svg class="ring" width="68" height="68" viewBox="0 0 68 68" role="img" aria-label="Zjedzone posiłki: ${done} z ${total}">` +
    `<circle cx="34" cy="34" r="${r}" fill="none" stroke="var(--track)" stroke-width="8"/>` +
    `<circle cx="34" cy="34" r="${r}" fill="none" stroke="var(--blue)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 34 34)"/>` +
    `<text x="34" y="39" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">${done}/${total}</text></svg>`;
}

let addOpen = null;
let editOpen = null;
function itemPill(name) {
  if (typeof ku === 'undefined' || !ku.idx) return '';
  const m = ZdsRecipes.matchRule(ku.idx, name);
  if (!m) return '<span class="pill tiny unk">nie ma na liście</span>';
  if (m.amb) return `<span class="pill lim tiny" title="Na liście są różne rodzaje: ${esc(m.it)}">${isKid() ? 'Zapytaj rodzica' : 'Zależy od rodzaju'}</span>`;
  return `<span class="pill ${m.st} tiny"><span aria-hidden="true">${MARK[m.st]}</span>${(isKid() ? LABEL_KID : LABEL)[m.st]}</span>`;
}
const QUICK_ACT = [['Spacer', 30], ['Rower', 45], ['Pływanie', 45], ['Piłka nożna', 60], ['Bieganie', 30], ['Siłownia', 45], ['Taniec', 30], ['Hulajnoga', 30], ['W-F w szkole', 45]];
function activityCard(d) {
  const list = d.activities || [], tot = list.reduce((a, x) => a + x.min, 0);
  return `<div class="card sport"><div class="row sb"><h2>Aktywność</h2><span class="muted">${tot ? tot + ' min' : 'jeszcze nic'}</span></div>` +
    '<div class="chips scroll">' + QUICK_ACT.map(([n, m]) => `<button type="button" class="chip" data-action="act-pick" data-name="${esc(n)}" data-min="${m}">${esc(n)}</button>`).join('') + '</div>' +
    '<form data-act="1"><label class="sr" for="an">Aktywność</label><input type="text" id="an" placeholder="Aktywność" required autocomplete="off">' +
    '<label class="sr" for="am">Minuty</label><input type="number" id="am" value="30" min="1" max="1440" inputmode="numeric" required><button type="submit" class="small">Dodaj</button></form>' +
    (list.length ? '<ul class="drinklist">' + list.map((x, i) => `<li><span>${esc(x.name)} <span class="muted">${x.min} min</span></span>` +
      `<button type="button" class="small ghost" data-action="act-del" data-i="${i}" aria-label="Usuń ${esc(x.name)}">✕</button></li>`).join('') + '</ul>' : '') + '</div>';
}

// Pasek do następnego posiłku: liczy czas od poprzedniego posiłku do następnego niezjedzonego.
const mins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
function nextMealInfo(d, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes();
  const list = MEALS.map(([k, n, hm]) => ({ k, n, at: mins(hm), done: Boolean(d.meals[k] && d.meals[k].done) }));
  const DUE = 30; // przez pół godziny po porze posiłku: „czas na …”
  let idx = list.findIndex((m) => !m.done && t < m.at + DUE);
  if (idx < 0) return { end: true, all: list.every((m) => m.done), next: list[0], left: 24 * 60 - t + list[0].at, pct: 0 };
  const next = list[idx];
  const prevAt = idx > 0 ? list[idx - 1].at : list[list.length - 1].at - 24 * 60;
  const span = Math.max(1, next.at - prevAt);
  const left = next.at - t;
  const pct = Math.max(0, Math.min(100, ((t - prevAt) / span) * 100));
  return { next, left, pct, due: left <= 0 };
}
const fmtLeft = (m) => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h ${r} min` : `${r} min`; };
function nextMealCard(d) {
  const x = nextMealInfo(d);
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  if (x.end) {
    return `<div class="nextmeal end" role="status"><div class="nm-top"><span class="nm-title">${x.all ? 'Na dziś wszystko zjedzone 🎉' : 'Posiłki na dziś za nami'}</span>` +
      `<span class="nm-time">jutro ${esc(x.next.n.toLowerCase())} ${hm(x.next.at)}</span></div><div class="nm-bar"><i style="width:100%"></i></div></div>`;
  }
  // kolor: zielony daleko, pomarańczowy blisko, fioletowy gdy pora posiłku
  const hue = x.due ? 270 : Math.round(140 - (x.pct / 100) * 110);
  const title = x.due ? `Czas na: ${x.next.n.toLowerCase()}!` : `Do posiłku: ${x.next.n.toLowerCase()}`;
  const time = x.due ? `od ${hm(x.next.at)}` : `${fmtLeft(x.left)} · ${hm(x.next.at)}`;
  return `<div class="nextmeal${x.due ? ' due' : ''}" role="status" style="--nm:${hue}"><div class="nm-top"><span class="nm-title">${esc(title)}</span>` +
    `<span class="nm-time">${esc(time)}</span></div><div class="nm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(x.pct)}" aria-label="Czas do następnego posiłku">` +
    `<i style="width:${x.due ? 100 : x.pct.toFixed(1)}%"></i></div></div>`;
}

function syncBtn() {
  const ready = typeof ZdsSync !== 'undefined' && ZdsSync.enabled() && su.session && state.fam;
  const st = su.busy ? 'spin' : !ready ? 'off' : su.err ? 'bad' : su.last ? 'ok' : '';
  return `<button type="button" class="syncbtn ${st}" data-action="hero-sync" aria-label="Odśwież i synchronizuj">` +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3.5v4h-4M5.5 20.5v-4h4"/></svg><i></i></button>';
}
async function heroSync(btn) {
  const ready = typeof ZdsSync !== 'undefined' && ZdsSync.enabled() && su.session && state.fam;
  if (btn) btn.classList.add('spin');
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  if (!ready) {
    setTimeout(() => {
      if (btn) btn.classList.remove('spin');
      su.msg = 'Żeby synchronizować, zaloguj się i połącz z rodziną tutaj.'; su.err = false;
      if (!isKid()) { tab = 'profile'; window.scrollTo(0, 0); }
      render();
    }, 500);
    return;
  }
  const t0 = Date.now();
  await runSync(true);
  if (!su.err) su.last = Date.now();
  else su.last = Date.now();
  setTimeout(render, Math.max(0, 600 - (Date.now() - t0)));
}

function viewToday() {
  const p = cur(), d = day(), kid = isKid();
  const done = MEALS.filter(([k]) => d.meals[k] && d.meals[k].done).length;
  const pct = Math.min(100, Math.round((d.water / WATER_GOAL) * 100));
  const now = new Date();
  let html = `<div class="hero"><div class="hero-plate"><span class="hero-day">${now.getDate()}</span>` +
    `<span class="hero-month">${now.toLocaleDateString('pl-PL', { month: 'long' })}</span></div>` +
    `<div><h1>Cześć, ${esc(p.nick || p.name)}!</h1><div class="hero-sub">${now.toLocaleDateString('pl-PL', { weekday: 'long' })}</div>` +
    (su.last ? `<div class="hero-sync">${su.err ? 'Nie udało się zsynchronizować' : 'Zsynchronizowano ' + new Date(su.last).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</div>` : '') + '</div>' +
    syncBtn() + '</div>';

  const waterW = `<div class="card widget"><h2>Woda</h2>${gauge(pct, 'water', 'Woda', `${d.water * GLASS_ML / 1000} z 2 l`)}` +
    `<div class="row"><button type="button" class="small" data-action="water" data-d="1" aria-label="Dodaj szklankę">+ 250 ml</button>` +
    `<button type="button" class="small ghost" data-action="water" data-d="-1" aria-label="Odejmij szklankę">−</button></div></div>`;
  let side;
  if (!kid && p.kcal > 0) {
    const e = eatenKcal(d), kp = Math.min(100, Math.round((e / p.kcal) * 100));
    side = `<div class="card widget"><h2>Kalorie</h2>${gauge(kp, 'rose', 'Kalorie', `${e} z ${p.kcal} kcal`)}<span class="muted">Zostało ${Math.max(0, p.kcal - e)} kcal</span></div>`;
  } else {
    side = `<div class="card widget"><h2>Posiłki</h2>${gauge(Math.round((done / MEALS.length) * 100), 'meal', 'Posiłki', `${done} z ${MEALS.length}`)}<span class="muted">${kid ? 'Dobra robota!' : 'Zjedzone dziś'}</span></div>`;
  }
  html += nextMealCard(d) + `<div class="widgets">${waterW}${side}</div>`;

  if (new Date().getHours() >= FRUIT_DEADLINE_HOUR) {
    html += '<div class="note warn">Owoce jemy tylko do 16:00 i nie na ostatni posiłek.</div>';
  }

  html += `<div class="card"><div class="row sb"><h2>Posiłki</h2>${ring(done, MEALS.length)}</div>`;
  for (const [key, name, time] of MEALS) {
    const m = meal(d, key);
    html += `<div class="meal"><div class="row sb"><div><strong>${name}</strong> <span class="muted">${time}</span></div>` +
      `<span class="row">${`<button type="button" class="plus" data-action="kid-add" data-meal="${key}" aria-label="${kid ? 'Dopisz, co zjadłeś na' : 'Dodaj danie do'} ${esc(name)}" aria-expanded="${addOpen === key}">+</button>`}` +
      `<button type="button" class="plus propbtn" data-action="prop-add" data-meal="${key}" aria-label="Zaproponuj danie na ${esc(name)}" aria-expanded="${addOpen === 'p:' + key}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg></button>` +
      `<button type="button" class="small ${m.done ? 'done' : 'ghost'}" data-action="done" data-meal="${key}" aria-pressed="${m.done}">${m.done ? '✓ Zjedzone' : 'Zjedzone'}</button></span></div>`;
    if (m.items.length) {
      html += '<ul>' + m.items.map((it, i) => {
        if (it.prop) {
          const mine = (it.from === 'dziecko') === kid;
          const who = it.from === 'dziecko' ? (state.profiles.find((p) => p.role === 'dziecko') || { name: 'dziecko' }).name : 'rodzic';
          const rej = it.rej;
          const state_ = rej ? 'odrzucona' : mine ? 'czeka na odpowiedź' : 'potwierdź albo odrzuć';
          return `<li class="propitem${rej ? ' rej' : ''}"><span class="propname"><span class="pn">${esc(it.name)}</span>${!kid && it.kcal ? ` <span class="pk">· ${esc(it.kcal)} kcal</span>` : ''}` +
            `<span class="by">proponuje: ${esc(who)} · ${state_}</span></span><span class="li-end">${rej ? '' : itemPill(it.name)}` +
            (rej
              ? `<span class="badge no" aria-label="Odrzucona">✕</span><button type="button" class="small nobtn" data-action="prop-rm" data-meal="${key}" data-i="${i}" aria-label="Usuń z listy ${esc(it.name)}">Usuń</button>`
              : `<button type="button" class="small okbtn" data-action="prop-ok" data-meal="${key}" data-i="${i}" aria-label="Potwierdź ${esc(it.name)}"${mine ? ' disabled title="Potwierdza druga osoba"' : ''}>✓</button>` +
                `<button type="button" class="small nobtn" data-action="${mine ? 'prop-rm' : 'prop-no'}" data-meal="${key}" data-i="${i}" aria-label="${mine ? 'Wycofaj' : 'Odrzuć'} ${esc(it.name)}">✕</button>`) +
            '</span></li>';
        }
        const cls = it.kid ? 'kiditem' : it.by === 'rodzic' ? 'paritem' : '';
        if (editOpen === key + '|' + i) {
          return `<li class="${cls}"><form data-edit="${key}" data-i="${i}" class="editform"><label class="sr" for="e-${key}">Popraw nazwę</label>` +
            `<input type="text" id="e-${key}" value="${esc(it.name)}" required autocomplete="off">` +
            (kid ? '' : `<label class="sr" for="ek-${key}">kcal</label><input type="number" id="ek-${key}" value="${esc(it.kcal || '')}" placeholder="kcal" min="0" inputmode="numeric">`) +
            '<button type="submit" class="small">Zapisz</button></form></li>';
        }
        return `<li class="${cls}"><button type="button" class="itemname" data-action="edit-item" data-meal="${key}" data-i="${i}" aria-label="Popraw ${esc(it.name)}">${esc(it.name)}` +
          `${!kid && it.kcal ? ` <span class="muted">· ${esc(it.kcal)} kcal</span>` : ''}${it.by === 'rodzic' ? ' <span class="by">od rodzica</span>' : ''}</button><span class="li-end">${it.acc ? '<span class="badge ok" title="Propozycja zaakceptowana" aria-label="Zaakceptowana">✓</span>' : ''}${itemPill(it.name)}` +
          `<button type="button" class="small ghost" data-action="del" data-meal="${key}" data-i="${i}" aria-label="Usuń ${esc(it.name)}">✕</button></span></li>`;
      }).join('') + '</ul>';
    }
    if (addOpen === 'p:' + key) {
      html += `<form data-meal="${key}" data-prop="1" class="kidform propform${kid ? '' : ' parform'}"><label class="sr" for="n-${key}">Propozycja dania</label>` +
        `<input type="text" id="n-${key}" placeholder="Zaproponuj danie" required autocomplete="off">` +
        (kid ? '' : `<label class="sr" for="k-${key}">kcal</label><input type="number" id="k-${key}" placeholder="kcal" min="0" inputmode="numeric">`) +
        '<button type="submit" class="small">Zaproponuj</button></form>';
    }
    if (addOpen === key) {
      html += kid
        ? `<form data-meal="${key}" class="kidform"><label class="sr" for="n-${key}">Co zjadłeś?</label><input type="text" id="n-${key}" placeholder="np. marchewka" required autocomplete="off"><button type="submit" class="small">Dodaj</button></form>`
        : `<form data-meal="${key}" class="kidform parform"><label class="sr" for="n-${key}">Danie</label><input type="text" id="n-${key}" placeholder="Danie" required autocomplete="off">` +
          `<label class="sr" for="k-${key}">kcal</label><input type="number" id="k-${key}" placeholder="kcal" min="0" inputmode="numeric"><button type="submit" class="small">Dodaj</button></form>`;
    }
    html += '</div>';
  }
  html += '</div>' + activityCard(d);
  if (typeof drinksCard === 'function') html += drinksCard();
  return html;
}

const chk = { q: '', cat: '' };
function colsHtml() {
  const kid = isKid(), nq = norm(chk.q.trim());
  const cols = { ok: [], lim: [], no: [] };
  for (const c of rules.kategorie) {
    if (chk.cat && c.nazwa !== chk.cat) continue;
    for (const [st, key] of KEYS) for (const it of c[key]) if (!nq || ZdsRecipes.looseMatch(nq, it)) cols[st].push(it);
  }
  const top = state.chkTop || [];
  const rank = (it) => { const i = top.indexOf(it); return i < 0 ? 1e9 : i; };
  for (const k of Object.keys(cols)) cols[k] = cols[k].map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
  const L = kid ? { ok: 'Można', lim: 'Czasem i mało', no: 'Nie teraz' } : { ok: 'Można', lim: 'Z ograniczeniami', no: 'Nie można' };
  return '<div class="cols3">' + ['ok', 'lim', 'no'].map((st) =>
    `<section class="col ${st}" aria-label="${L[st]}"><h2><span aria-hidden="true">${MARK[st]}</span> ${L[st]} <span class="muted">${cols[st].length}</span></h2>` +
    `<div class="pills">${cols[st].map((it) => `<button type="button" class="pill ${st} tiny" data-action="chk-top" data-it="${esc(it)}" aria-pressed="${(state.chkTop || []).includes(it)}">${esc(cap(it))}</button>`).join('') || '<span class="muted">–</span>'}</div></section>`).join('') + '</div>';
}
function viewCheck() {
  return '<h1>Czy mogę to zjeść?</h1><div class="grid">' +
    `<div class="field"><label for="q" class="muted">Szukaj produktu</label><input type="text" id="q" value="${esc(chk.q)}" placeholder="np. kefir, płatki" autocomplete="off"></div>` +
    '<div class="field"><label for="ccat" class="muted">Kategoria</label><select id="ccat"><option value="">Wszystkie</option>' +
    rules.kategorie.map((c) => `<option${c.nazwa === chk.cat ? ' selected' : ''}>${esc(c.nazwa)}</option>`).join('') + '</select></div></div>' +
    `<div id="cols">${colsHtml()}</div>`;
}
function viewProfiles() {
  const kd = state.profiles.find((p) => p.id === state.kidDevice);
  let html = '<h1>Profile</h1><div class="card"><h2>Kto korzysta</h2>' + (isKid()
    ? `<p class="muted">Profil: <strong>${esc(cur().name)}</strong>. Zmiana profilu tylko w trybie rodzica.</p>`
    : '<div class="chips">' + state.profiles.map((p) => `<button type="button" class="chip" data-action="pick-profile" data-id="${p.id}" aria-pressed="${p.id === state.current}">${esc(p.name)}</button>`).join('') + '</div>') + '</div>' +
    '<div class="card"><div class="row sb"><div><h2>Tryb rodzica</h2>' +
    `<span class="muted">${parent ? 'Włączony: widać kalorie, plan i zakupy.' : 'Wyłączony: widok dziecka.'}</span></div>` +
    `<button type="button" class="small ${parent ? '' : 'ghost'}" data-action="parent-toggle" aria-pressed="${parent}">${parent ? 'Wyłącz' : 'Włącz'}</button></div></div>`;
  if (isKid()) return html + '<div class="note warn">Reszta profili jest widoczna tylko w trybie rodzica.</div>';
  const kids = state.profiles.filter((p) => p.role === 'dziecko');
  if (kids.length) {
    html += '<div class="card"><h2>Telefon dziecka</h2>' +
      (kd ? `<p class="muted">Ten telefon jest ustawiony jako telefon: <strong>${esc(kd.name)}</strong>. Po wyłączeniu trybu rodzica widać tylko jego profil, bez statystyk, innych profili i synchronizacji.</p>` +
        '<button type="button" class="ghost" data-action="kid-device" data-id="">To nie jest telefon dziecka</button>'
        : '<p class="muted">Na telefonie syna włącz to raz. Wtedy bez PIN-u nie da się przełączyć na profil rodzica.</p><div class="chips">' +
          kids.map((p) => `<button type="button" class="chip" data-action="kid-device" data-id="${p.id}">To telefon: ${esc(p.name)}</button>`).join('') + '</div>') + '</div>';
  }
  if (typeof statsCard === 'function') html += statsCard();
  for (const p of state.profiles) {
    html += `<div class="card" data-pid="${p.id}"><div class="grid">` +
      `<div class="field"><label for="pn-${p.id}">Imię</label><input type="text" id="pn-${p.id}" data-field="name" value="${esc(p.name)}"></div>` +
      `<div class="field"><label for="pz-${p.id}">Powitanie (zdrobnienie)</label><input type="text" id="pz-${p.id}" data-field="nick" value="${esc(p.nick || '')}" placeholder="np. Franek"></div>` +
      `<div class="field"><label for="pr-${p.id}">Rola</label><select id="pr-${p.id}" data-field="role">` +
      ['dziecko', 'dorosły', 'rodzic'].map((r) => `<option${r === p.role ? ' selected' : ''}>${r}</option>`).join('') + '</select></div>' +
      `<div class="field"><label for="pk-${p.id}">Cel kcal (0 = brak)</label><input type="number" id="pk-${p.id}" data-field="kcal" min="0" value="${p.kcal}"></div>` +
      `<div class="field"><span>&nbsp;</span><button type="button" class="ghost" data-action="rm-profile" data-id="${p.id}">Usuń profil</button></div></div></div>`;
  }
  html += '<button type="button" data-action="add-profile">Dodaj profil</button>' + syncCard();
  return html;
}

function render() {
  if (isKid() && tab === 'przepisy') tab = 'dzis';
  const rt = document.querySelector('.tabs [data-tab=przepisy]'); if (rt) rt.hidden = isKid();
  document.body.classList.toggle('kid', isKid());
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const views = { dzis: viewToday, sprawdz: viewCheck, przepisy: typeof viewRecipes === 'function' ? viewRecipes : viewToday, plan: typeof viewPlan === 'function' ? viewPlan : viewToday, profile: viewProfiles };
  $('#view').innerHTML = (views[tab] || viewToday)();
}

// ---------- zdarzenia ----------
function toggleParent() {
  if (parent) { parent = false; lockKidDevice(); save(true); render(); return; }
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
  if (t.dataset.tab) {
    if (t.dataset.tab === 'przepisy') {
      if (tab === 'przepisy') { ku.cook = null; ku.timer = null; wakeOff(); }
      if (!ku.cook) ku.rid = null;
    }
    tab = t.dataset.tab;
    return render();
  }
  const a = t.dataset.action;
  if (!a) return;
  if (a === 'parent-toggle') return toggleParent();
  if (a.startsWith('k-')) return kAction(a, t);
  if (a.startsWith('sync-')) return syncAction(a);
  const d = day();
  if (['water', 'done', 'del', 'prop-ok', 'prop-no', 'prop-rm'].includes(a)) d.u = Date.now();
  if (a === 'water') d.water = Math.max(0, d.water + Number(t.dataset.d));
  else if (a === 'done') { const m = meal(d, t.dataset.meal); m.done = !m.done; }
  else if (a === 'del') { meal(d, t.dataset.meal).items.splice(Number(t.dataset.i), 1); editOpen = null; }
  else if (a === 'edit-item') { const k = t.dataset.meal + '|' + t.dataset.i; editOpen = editOpen === k ? null : k; render(); const i = $('#e-' + t.dataset.meal); if (i) i.focus(); return; }
  else if (a === 'chk-top') {
    const it = t.dataset.it; state.chkTop = [it].concat((state.chkTop || []).filter((x) => x !== it)).slice(0, 30);
    save(true); $('#cols').innerHTML = colsHtml();
    document.querySelectorAll('#cols .pills').forEach((p) => { p.scrollTop = 0; });
    return;
  }
  else if (a === 'hero-sync') return heroSync(t);
  else if (a === 'kid-device') { if (!parent) return; state.kidDevice = t.dataset.id || null; save(true); return render(); }
  else if (a === 'pick-profile') { if (isKid()) return; state.current = t.dataset.id; addOpen = null; }
  else if (a === 'stats-share') return statsShare();
  else if (a === 'stats-mail') return statsMail();
  else if (a === 'prop-add') { const k = 'p:' + t.dataset.meal; addOpen = addOpen === k ? null : k; render(); const i = $('#n-' + t.dataset.meal); if (i) i.focus(); return; }
  else if (a === 'prop-ok') {
    const it = meal(d, t.dataset.meal).items[Number(t.dataset.i)];
    if (it && it.prop && !it.rej) { delete it.prop; it.acc = true; if (it.from === 'dziecko') it.kid = true; else it.by = 'rodzic'; delete it.from; }
  }
  else if (a === 'prop-no') { const it = meal(d, t.dataset.meal).items[Number(t.dataset.i)]; if (it && it.prop) it.rej = true; }
  else if (a === 'prop-rm') meal(d, t.dataset.meal).items.splice(Number(t.dataset.i), 1);
  else if (a === 'kid-add') { addOpen = addOpen === t.dataset.meal ? null : t.dataset.meal; render(); const i = $('#n-' + addOpen); if (i) i.focus(); return; }
  else if (a === 'st-range') { st.range = Number(t.dataset.v); return render(); }
  else if (a === 'act-del') { (d.activities = d.activities || []).splice(Number(t.dataset.i), 1); d.u = Date.now(); }
  else if (a === 'act-pick') { $('#an').value = t.dataset.name; $('#am').value = t.dataset.min; $('#am').focus(); return; }
  else if (a === 'add-profile') { const p = { id: uid(), name: 'Nowy profil', role: 'dorosły', kcal: 0 }; state.profiles.push(p); }
  else if (a === 'rm-profile') {
    if (state.profiles.length < 2) return alert('Musi zostać co najmniej jeden profil.');
    if (!confirm('Usunąć ten profil?')) return;
    const gone = state.profiles.find((p) => p.id === t.dataset.id);
    if (gone && gone.remoteId && state.fam && state.fam.role === 'rodzic') ZdsSync.removeMember(gone.remoteId).catch(() => {});
    state.profiles = state.profiles.filter((p) => p.id !== t.dataset.id);
    if (state.current === t.dataset.id) state.current = state.profiles[0].id;
  }
  save(); render();
});

document.addEventListener('submit', (e) => {
  const rf = e.target.closest('form[data-recipe]');
  if (rf) { e.preventDefault(); return kSubmitRecipe(rf); }
  const cf = e.target.closest('form[data-cplan]');
  if (cf) { e.preventDefault(); return kSubmitCustom(cf); }
  const df = e.target.closest('form[data-drink]');
  if (df) {
    e.preventDefault();
    const nm = df.querySelector('input[type=text]').value.trim(), ml = Number(df.querySelector('input[type=number]').value) || 250;
    if (!nm) return;
    const dd = day(); const x = { id: 'wlasny', name: nm, ml: Math.min(3000, Math.round(ml)) };
    if (isKid()) x.kid = true;
    (dd.drinks = dd.drinks || []).push(x); dd.u = Date.now();
    save(); return render();
  }
  const af = e.target.closest('form[data-act]');
  if (af) {
    e.preventDefault();
    const nm = af.querySelector('input[type=text]').value.trim(), mi = Number(af.querySelector('input[type=number]').value);
    if (!nm || !(mi > 0)) return;
    const dd = day(); (dd.activities = dd.activities || []).push({ name: nm, min: Math.min(1440, Math.round(mi)) }); dd.u = Date.now();
    save(); return render();
  }
  const ef = e.target.closest('form[data-edit]');
  if (ef) {
    e.preventDefault();
    const dd = day(), it = meal(dd, ef.dataset.edit).items[Number(ef.dataset.i)];
    const nm = ef.querySelector('input[type=text]').value.trim();
    if (it && nm) {
      it.name = nm;
      const kc = ef.querySelector('input[type=number]');
      if (kc) it.kcal = kc.value === '' ? 0 : Math.max(0, Number(kc.value));
      dd.u = Date.now();
    }
    editOpen = null; save(); return render();
  }
  const f = e.target.closest('form[data-meal]');
  if (!f) return;
  e.preventDefault();
  const name = f.querySelector('input[type=text]').value.trim();
  const ki = f.querySelector('input[type=number]');
  const kcal = ki ? ki.value : '';
  if (!name) return;
  const d = day();
  const item = { name, kcal: kcal === '' ? 0 : Number(kcal) };
  if (f.dataset.prop) { item.prop = true; item.from = isKid() ? 'dziecko' : 'rodzic'; }
  else if (isKid()) item.kid = true; else item.by = 'rodzic';
  meal(d, f.dataset.meal).items.push(item);
  addOpen = null;
  d.u = Date.now();
  save(); render();
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { chk.q = e.target.value; $('#cols').innerHTML = colsHtml(); }
  if (e.target.id === 'rq') { ku.q = e.target.value; $('#rlist').innerHTML = listHtml(); }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'pday' && e.target.value) { ku.pd = e.target.value; return render(); }
  if (e.target.id === 'smail') { state.statsMail = e.target.value.trim(); save(true); return; }
  if (e.target.id === 'ccat') { chk.cat = e.target.value; return render(); }
  if (e.target.id === 'rdev') { ku.dev = e.target.value; return render(); }
  if (e.target.id === 'rmeal') { ku.meal = e.target.value; return render(); }
  if (e.target.id === 'sdays') { ku.days = Number(e.target.value); return render(); }
  const box = e.target.closest('[data-pid]');
  if (box && e.target.dataset.field) {
    const p = state.profiles.find((x) => x.id === box.dataset.pid);
    const f = e.target.dataset.field;
    p[f] = f === 'kcal' ? Math.max(0, Number(e.target.value) || 0) : f === 'nick' ? e.target.value.trim() : e.target.value.trim() || p[f];
    save(); render();
    if (p.remoteId && state.fam && state.fam.role === 'rodzic') ZdsSync.pushMember(state.fam.id, p).catch(() => {});
  }
});

// ---------- synchronizacja (Supabase) ----------
const su = { session: false, msg: '', err: false, busy: false, preview: null, code: '' };

function syncCard() {
  if (typeof ZdsSync === 'undefined' || !ZdsSync.enabled()) {
    return '<div class="card"><h2>Synchronizacja</h2><p class="muted">Wyłączona: wpisz adres i klucz Supabase w pliku config.js. Do tego czasu dane są tylko na tym urządzeniu.</p></div>';
  }
  let h = '<div class="card"><h2>Synchronizacja</h2>';
  if (su.msg) h += `<p class="note${su.err ? ' warn' : ''}">${esc(su.msg)}</p>`;
  if (!su.session) {
    h += `<div class="field"><label for="s-email">E-mail</label><input type="email" id="s-email" autocomplete="email" value="${esc(su.email || '')}"></div>` +
      '<div class="field"><label for="s-pw">Hasło (min. 6 znaków)</label><input type="password" id="s-pw" autocomplete="current-password" minlength="6"></div>' +
      '<div class="row wrap"><button type="button" data-action="sync-pw-in">Zaloguj</button><button type="button" class="ghost" data-action="sync-pw-up">Załóż konto</button></div>' +
      '<p class="muted small">Pierwszy raz: „Załóż konto”. Jeśli przyjdzie mail z potwierdzeniem, kliknij link (wystarczy raz, w dowolnej przeglądarce), a potem wróć tu i „Zaloguj”.</p>';
  } else if (!state.fam) {
    h += '<p class="muted">Wpisz swoje imię tak samo jak w profilu powyżej, wtedy profile się połączą.</p>' +
      '<h2>Utwórz rodzinę</h2><div class="grid">' +
      '<div class="field"><label for="s-fam">Nazwa rodziny</label><input type="text" id="s-fam"></div>' +
      '<div class="field"><label for="s-me">Twoje imię</label><input type="text" id="s-me"></div></div>' +
      '<button type="button" data-action="sync-create">Utwórz</button>' +
      '<h2>Dołącz kodem</h2><div class="field"><label for="s-code">Kod zaproszenia</label><input type="text" id="s-code" autocapitalize="characters" value="' + esc(su.code) + '"></div>' +
      '<button type="button" class="ghost" data-action="sync-preview">Dalej</button>';
    if (su.preview) {
      h += '<div class="field"><label for="s-claim">To jestem ja</label><select id="s-claim">' +
        su.preview.map((m) => `<option value="${esc(m.member_id)}">${esc(m.name)} (${esc(m.role)})</option>`).join('') +
        '<option value="">Nowa osoba</option></select></div>' +
        '<div class="field"><label for="s-me2">Imię (dla nowej osoby)</label><input type="text" id="s-me2"></div>' +
        '<button type="button" data-action="sync-join">Dołącz</button>';
    }
  } else {
    h += `<p class="muted">Rodzina: <strong>${esc(state.fam.name || '')}</strong> · rola: ${esc(state.fam.role)}</p>` +
      '<div class="row"><button type="button" data-action="sync-now">Synchronizuj teraz</button>' +
      '<button type="button" class="ghost" data-action="sync-out">Wyloguj</button></div>';
    if (state.fam.role === 'rodzic') {
      h += '<div class="row" style="margin-top:8px"><button type="button" class="small ghost" data-action="sync-code">Pokaż kod zaproszenia</button>' +
        '<button type="button" class="small ghost" data-action="sync-newcode">Nowy kod</button></div>';
    }
  }
  return h + '</div>';
}

async function runSync(silent) {
  if (su.busy || !state.fam) return;
  su.busy = true;
  try {
    await ZdsSync.init();
    const r = await ZdsSync.syncAll(state.fam.id, state.fam.role, { state, mkId: uid });
    save(true);
    su.last = Date.now(); su.err = false;
    if (!silent) { su.msg = `Zsynchronizowano: wysłano ${r.pushed}, pobrano ${r.pulled}.`; su.err = false; }
  } catch (e) {
    su.msg = 'Synchronizacja nie powiodła się: ' + e.message; su.err = true;
  }
  su.busy = false;
  const ae = document.activeElement;
  if (!(silent && ae && ae.closest && ae.closest('#view') && /INPUT|SELECT/.test(ae.tagName))) render();
}

const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

async function setMembership() {
  const m = await ZdsSync.myMembership();
  if (m) state.fam = { id: m.family_id, role: m.role, name: m.families && m.families.name };
  save(true);
}

async function syncAction(a) {
  try {
    if (a === 'sync-login') {
      const email = val('s-email');
      if (!email) throw new Error('Wpisz e-mail.');
      await ZdsSync.signIn(email);
      su.email = email;
      su.msg = 'Wysłano mail na ' + email + '. Wpisz kod z maila poniżej.'; su.err = false;
    } else if (a === 'sync-pw-in' || a === 'sync-pw-up') {
      const email = val('s-email'), pw = ($('#s-pw') || {}).value || '';
      if (!email || pw.length < 6) throw new Error('Wpisz e-mail i hasło (min. 6 znaków).');
      su.email = email;
      if (a === 'sync-pw-up') {
        const logged = await ZdsSync.signUpPw(email, pw);
        if (!logged) { su.msg = 'Konto założone. Sprawdź mail ' + email + ', kliknij link potwierdzający, potem wróć i dotknij „Zaloguj”.'; su.err = false; return; }
      } else {
        await ZdsSync.signInPw(email, pw);
      }
      su.session = true;
      if (!state.fam) await setMembership();
      if (state.fam) await runSync(true);
      su.msg = 'Zalogowano.'; su.err = false;
    } else if (a === 'sync-otp') {
      const code = val('s-otp').replace(/\s/g, '');
      if (!su.email || !code) throw new Error('Wpisz kod z maila.');
      await ZdsSync.verifyCode(su.email, code);
      su.session = true;
      if (!state.fam) await setMembership();
      if (state.fam) await runSync(true);
      su.msg = 'Zalogowano.'; su.err = false;
    } else if (a === 'sync-create') {
      const fam = val('s-fam'), me = val('s-me');
      if (!fam || !me) throw new Error('Wpisz nazwę rodziny i swoje imię.');
      await ZdsSync.createFamily(fam, me);
      await setMembership();
      su.msg = 'Rodzina utworzona.'; su.err = false;
      await runSync(true);
    } else if (a === 'sync-preview') {
      su.code = val('s-code');
      if (!su.code) throw new Error('Wpisz kod zaproszenia.');
      su.preview = await ZdsSync.familyPreview(su.code);
      su.msg = su.preview.length ? '' : 'Brak wolnych profili. Możesz dołączyć jako nowa osoba (wybierz „Nowa osoba").'; su.err = false;
      if (!su.preview.length) su.preview = [];
    } else if (a === 'sync-join') {
      const claim = val('s-claim'), name = val('s-me2');
      if (!claim && !name) throw new Error('Wpisz imię nowej osoby.');
      await ZdsSync.joinFamily(su.code, name, claim || null);
      await setMembership();
      su.preview = null; su.msg = 'Dołączono do rodziny.'; su.err = false;
      await runSync(true);
    } else if (a === 'sync-code') {
      su.msg = 'Kod zaproszenia: ' + await ZdsSync.inviteCode(state.fam.id); su.err = false;
    } else if (a === 'sync-newcode') {
      if (!confirm('Stary kod przestanie działać. Wygenerować nowy?')) return;
      su.msg = 'Nowy kod zaproszenia: ' + await ZdsSync.newInviteCode(state.fam.id); su.err = false;
    } else if (a === 'sync-now') {
      return runSync(false);
    } else if (a === 'sync-out') {
      await ZdsSync.signOut();
      state.fam = null; su.session = false; su.msg = 'Wylogowano. Dane lokalne zostały na telefonie.'; su.err = false; save(true);
    }
  } catch (e) {
    const m = String(e.message || e);
    const PL = [[/invalid login credentials/i, 'Zły e-mail albo hasło. Jeśli konto było zakładane bez hasła, usuń je w Supabase (Authentication → Users) i załóż ponownie.'],
      [/email not confirmed/i, 'Najpierw potwierdź adres: kliknij link z maila od Supabase, potem dotknij „Zaloguj”.'],
      [/already registered|already been registered/i, 'To konto już istnieje: dotknij „Zaloguj”.'],
      [/signups? (are|is) disabled|signups? not allowed|signup.*disabled/i, 'Supabase nie pozwala zakładać kont. Załóż konto w Supabase: Authentication → Users → Add user → Create new user (zaznacz Auto Confirm), a tu dotknij „Zaloguj”.'],
      [/rate limit|too many/i, 'Za dużo prób albo maili. Odczekaj kilka minut.'],
      [/password should be at least/i, 'Hasło musi mieć co najmniej 6 znaków.'],
      [/failed to fetch|network/i, 'Brak połączenia z internetem.']];
    su.msg = (PL.find(([r]) => r.test(m)) || [0, m])[1]; su.err = true;
  }
  render();
}

async function initSync() {
  if (typeof ZdsSync === 'undefined' || !ZdsSync.enabled()) return;
  try {
    await ZdsSync.init();
    su.session = Boolean(await ZdsSync.session());
    if (su.session && !state.fam) await setMembership();
    if (su.session && state.fam) await runSync(true);
  } catch (e) { /* brak sieci: działamy lokalnie */ }
  render();
  // Samoodświeżanie: po powrocie do aplikacji i co minutę, gdy jest otwarta
  const auto = () => { const typing = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (su.session && state.fam && !document.hidden && !su.busy && !typing) runSync(true).catch(() => {}); };
  document.addEventListener('visibilitychange', auto);
  window.addEventListener('focus', auto);
  setInterval(auto, 60000);
  // odświeżanie paska posiłku co 30 s bez przerysowania całego ekranu
  setInterval(() => {
    const el = document.querySelector('.nextmeal');
    if (el && tab === 'dzis') { const w = document.createElement('div'); w.innerHTML = nextMealCard(day()); el.replaceWith(w.firstElementChild); }
  }, 30000);
}

async function init() {
  try {
    const r = await fetch('data/rules.json');
    rules = await r.json();
  } catch (e) { /* offline bez cache: wyszukiwarka pusta */ }
  try {
    ku.recipes = (await (await fetch('data/recipes.json')).json()).recipes;
  } catch (e) { /* offline bez cache: brak wbudowanych przepisów */ }
  try {
    ku.drinks = (await (await fetch('data/napoje.json')).json()).napoje;
  } catch (e) { /* offline bez cache: bez szybkich napojów */ }
  ku.idx = ZdsRecipes.indexRules(rules);
  render();
  initSync();
  if ('serviceWorker' in navigator) {
    const had = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
  }
}

if (typeof document !== 'undefined' && document.getElementById('view')) init();
if (typeof module !== 'undefined') module.exports = { norm, searchRules, setRules: (r) => { rules = r; }, syncCard, su, getState: () => state };
