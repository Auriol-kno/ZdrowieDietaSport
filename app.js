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
      // zdjęcia dań trzymamy 14 dni, żeby nie zapchać pamięci telefonu
      const cut = new Date(Date.now() - 14 * 864e5).toLocaleDateString('sv-SE');
      for (const [k, d] of Object.entries(s.days || {})) if (k.slice(0, 10) < cut) for (const m of Object.values(d.meals || {})) if (m) { delete m.photo; delete m.photos; }
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
  let ok = true;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { ok = false; /* pamięć pełna albo niedostępna */ }
  if (!noSync && state.fam && typeof ZdsSync !== 'undefined' && ZdsSync.enabled()) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => runSync(true), 4000);
  }
  return ok;
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

// Szacunkowe kcal typowej porcji, gdy nikt ich nie wpisał (najpierw przepisy z aplikacji, potem tabela produktów).
const KCAL_EST = [[/zup|rosół|krem z/, 150], [/pizz/, 600], [/frytk/, 350], [/chips/, 300], [/parówk|kiełbas/, 220], [/pierog/, 350], [/naleśnik/, 250], [/kotlet/, 300],
  [/kurczak|indyk|pierś/, 200], [/ryb|łosoś|dorsz/, 180], [/owsiank/, 250], [/jajecznic|omlet/, 200], [/kanapk/, 200], [/bułk/, 150], [/chleb|pieczyw|grzank/, 80],
  [/kasz|ryż|quinoa/, 200], [/makaron|spaghetti/, 250], [/ziemniak/, 150], [/jogurt/, 120], [/kefir/, 130], [/maślank/, 100], [/mleko/, 125], [/twaróg|twarożek|serek/, 110],
  [/ser\b|ser /, 110], [/jajk/, 75], [/płatk|musli|granol/, 200], [/ciastk|herbatnik/, 150], [/ciast|drożdżówk|pączek/, 300], [/batonik|baton/, 200], [/czekolad/, 250],
  [/lod/, 200], [/żelk/, 100], [/cukierk/, 60], [/orzech|migdał/, 180], [/hummus/, 100], [/koktajl|smoothie/, 180], [/kompot/, 90], [/sok/, 110],
  [/banan/, 105], [/jabłk/, 80], [/gruszk/, 90], [/winogron/, 70], [/pomarańcz/, 70], [/brzoskwin|nektaryn/, 50], [/mandaryn|klementyn/, 40], [/kiwi/, 45],
  [/truskaw|borówk|malin|jagod|porzecz/, 35], [/śliwk/, 40], [/marchew/, 30], [/papryk/, 30], [/pomidor/, 20], [/ogór/, 15], [/rzodkiew/, 10], [/kalarep|brokuł|kalafior/, 30],
  [/herbat|woda|kawa/, 0]];
function estKcal(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return 0;
  if (typeof allRecipes === 'function') {
    const nn = norm(n), r = allRecipes().find((x) => norm(x.name) === nn);
    if (r && r.kcal) return r.kcal;
  }
  const f = KCAL_EST.find(([re]) => re.test(n));
  return f ? f[1] : 150;
}
// Pozycja się liczy, gdy posiłek jest zjedzony albo syn sam ją dopisał (wpisuje to, co zjadł).
const counts = (m, it) => !it.prop && (m.done || it.kid);
const itemKcal = (it) => Number(it.kcal) || estKcal(it.name);
function eatenKcal(d) {
  let t = 0;
  for (const [key] of MEALS) {
    const m = d.meals[key];
    if (m) t += (m.items || []).reduce((a, i) => a + (counts(m, i) ? itemKcal(i) : 0), 0);
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
// Spalone kcal (szacunkowo): MET × waga (kg) × czas (h). Wartości MET z tabel wysiłku, dla dzieci orientacyjne.
const MET = [[/spacer|chodz/, 3.5], [/rower/, 6], [/pływ|basen/, 6], [/piłk|nożn|kosz|siatk|ręczn/, 7], [/bieg|jogging/, 8], [/siłown|ćwicz|trening/, 5],
  [/taniec|tańcz/, 5], [/hulajn|rolk|wrotk/, 5], [/w-f|wf|wychowanie/, 5], [/narty|snowboard/, 6], [/łyżw/, 6], [/sztuki walki|karate|judo|taekwondo/, 7], [/joga|rozciąg/, 2.5], [/tenis/, 7]];
const metOf = (name) => { const n = String(name).toLowerCase(); const f = MET.find(([r]) => r.test(n)); return f ? f[1] : 4; };
const weightOf = (p) => Number(p.kg) || (p.role === 'dziecko' ? 40 : 75);
const burned = (x, p) => Math.round(metOf(x.name) * weightOf(p) * (x.min / 60));
function activityCard(d) {
  const p = cur(), kid = isKid();
  const list = d.activities || [], tot = list.reduce((a, x) => a + x.min, 0), kc = list.reduce((a, x) => a + burned(x, p), 0);
  return `<div class="card sport"><div class="row sb"><h2>Aktywność</h2><span class="muted">${tot ? tot + ' min' + ` · ${kid ? 'spalone' : 'ok.'} ${kc} kcal` : 'jeszcze nic'}</span></div>` +
    '<div class="chips scroll">' + QUICK_ACT.map(([n, m]) => `<button type="button" class="chip" data-action="act-pick" data-name="${esc(n)}" data-min="${m}">${esc(n)}</button>`).join('') + '</div>' +
    '<form data-act="1"><label class="sr" for="an">Aktywność</label><input type="text" id="an" placeholder="Aktywność" required autocomplete="off">' +
    '<label class="sr" for="am">Minuty</label><input type="number" id="am" value="30" min="1" max="1440" inputmode="numeric" required><button type="submit" class="small">Dodaj</button></form>' +
    `<p class="muted small" id="aest">${actEst('', 30)}</p>` +
    (list.length ? '<ul class="drinklist">' + list.map((x, i) => `<li><span>${esc(x.name)} <span class="muted">${x.min} min · ${kid ? '🔥 ' : 'ok. '}${burned(x, p)} kcal</span></span>` +
      `<button type="button" class="small ghost" data-action="act-del" data-i="${i}" aria-label="Usuń ${esc(x.name)}">✕</button></li>`).join('') + '</ul>' : '') + '</div>';
}
function actEst(n0, m0) {
  const n = n0 !== undefined ? n0 : ($('#an') || {}).value || '', m = m0 !== undefined ? m0 : Number(($('#am') || {}).value) || 30, p = cur();
  const x = { name: n, min: m };
  if (isKid()) return `${n ? esc(n) : 'Ruch'} przez ${m} min to ok. <strong>${burned(x, p)} kcal</strong> spalonych. Brawo za każdy ruch! 💪`;
  return `${n ? esc(n) : 'Aktywność'} przez ${m} min spala ok. <strong>${burned(x, p)} kcal</strong> (waga ${weightOf(p)} kg${p.kg ? '' : ', przyjęta, wpisz w Profilach'}).`;
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
// Dźwięk pory posiłku: pik, pyk albo cisza. Gra raz, gdy przychodzi pora (aplikacja musi być otwarta).
let actx = null;
function audio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
  return actx;
}
document.addEventListener('pointerdown', () => audio(), { once: true });
function playChime(kind) {
  const c = audio(); if (!c || kind === 'off') return;
  const tone = (f1, f2, at, dur, vol) => {
    const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + at;
    o.type = 'sine'; o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  if (kind === 'pyk') { tone(520, 180, 0, 0.09, 0.5); tone(520, 180, 0.22, 0.09, 0.45); }
  else { tone(1046, 1046, 0, 0.12, 0.25); tone(1568, 1568, 0.16, 0.16, 0.25); }
}
const SOUNDS = { pik: 'pik', pyk: 'pyk', off: 'wyciszone' };
function soundBtn() {
  const s = state.sound || 'pik';
  return `<button type="button" class="sndbtn ${s}" data-action="sound" aria-label="Dźwięk pory posiłku: ${SOUNDS[s]}. Dotknij, aby zmienić."><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>` +
    (s === 'off' ? '<path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>') + `</svg><span>${SOUNDS[s]}</span></button>`;
}
function checkChime() {
  const d = day(), x = nextMealInfo(d);
  if (x.end || !x.due) return;
  const k = dayKey() + '|' + x.next.k;
  if (state.chimed === k) return;
  state.chimed = k; save(true);
  playChime(state.sound || 'pik');
}

function nextMealCard(d) {
  const x = nextMealInfo(d);
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  if (x.end) {
    return `<div class="nextmeal end" role="status"><div class="nm-top"><span class="nm-title">${x.all ? 'Na dziś wszystko zjedzone 🎉' : 'Posiłki na dziś za nami'}</span>` +
      `<span class="nm-time">jutro ${esc(x.next.n.toLowerCase())} ${hm(x.next.at)}</span></div><div class="nm-row"><div class="nm-bar"><i style="width:100%"></i></div>${soundBtn()}</div></div>`;
  }
  // kolor: zielony daleko, pomarańczowy blisko, fioletowy gdy pora posiłku
  const hue = x.due ? 270 : Math.round(140 - (x.pct / 100) * 110);
  const title = x.due ? `Czas na: ${x.next.n.toLowerCase()}!` : `Do posiłku: ${x.next.n.toLowerCase()}`;
  const time = x.due ? `od ${hm(x.next.at)}` : `${fmtLeft(x.left)} · ${hm(x.next.at)}`;
  return `<div class="nextmeal${x.due ? ' due' : ''}" role="status" style="--nm:${hue}"><div class="nm-top"><span class="nm-title">${esc(title)}</span>` +
    `<span class="nm-time">${esc(time)}</span></div><div class="nm-row"><div class="nm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(x.pct)}" aria-label="Czas do następnego posiłku">` +
    `<i style="width:${x.due ? 100 : x.pct.toFixed(1)}%"></i></div>${soundBtn()}</div></div>`;
}

// Zdjęcie zjedzonego dania: zmniejszone do 360 px (JPEG), zapisane w dniu, więc synchronizuje się z rodziną.
// Starsze dane miały jedno zdjęcie w m.photo, teraz lista m.photos.
const photosOf = (m) => (Array.isArray(m.photos) ? m.photos : m.photo && m.photo.src ? [m.photo] : []).slice();
function takePhoto(key) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
  inp.style.display = 'none'; document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0]; inp.remove();
    if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const max = 360, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const dd = day(), m = meal(dd, key), wasDone = m.done;
      const ph = photosOf(m); ph.push({ src: c.toDataURL('image/jpeg', 0.6), at: Date.now() }); m.photos = ph; delete m.photo;
      m.done = true; dd.u = Date.now();
      if (!save()) { ph.pop(); m.done = wasDone; save(true); alert('Brak miejsca w pamięci telefonu na zdjęcie. Usuń starsze zdjęcia.'); }
      render();
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Nie udało się wczytać zdjęcia.'); };
    img.src = url;
  }, { once: true });
  inp.click();
}
function viewPhoto(src) {
  const o = document.createElement('div'); o.className = 'photoview'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Zdjęcie dania');
  o.innerHTML = `<img src="${src}" alt="Zdjęcie dania"><button type="button" class="small">Zamknij</button>`;
  o.addEventListener('click', () => o.remove()); document.body.appendChild(o); o.querySelector('button').focus();
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
      '<span class="row">' +
      `<span class="eatpill${m.done ? ' on' : ''}"><button type="button" class="eat" data-action="done" data-meal="${key}" aria-pressed="${m.done}">${m.done ? '✓ Zjedzone' : 'Zjedzone'}</button>` +
      `<button type="button" class="cam" data-action="photo" data-meal="${key}" aria-label="Dodaj zdjęcie: ${esc(name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>${photosOf(m).length ? `<b>${photosOf(m).length}</b>` : ''}</button></span></span></div>`;
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
          `${kid ? '' : it.kcal ? ` <span class="muted">· ${esc(it.kcal)} kcal</span>` : ` <span class="muted">· ≈${estKcal(it.name)} kcal</span>`}${it.by === 'rodzic' ? ' <span class="by">od rodzica</span>' : ''}</button><span class="li-end">${it.acc ? '<span class="badge ok" title="Propozycja zaakceptowana" aria-label="Zaakceptowana">✓</span>' : ''}${itemPill(it.name)}` +
          `<button type="button" class="small ghost" data-action="del" data-meal="${key}" data-i="${i}" aria-label="Usuń ${esc(it.name)}">✕</button></span></li>`;
      }).join('') + '</ul>';
    }
    const phs = photosOf(m);
    if (phs.length) {
      html += '<div class="mphotos">' + phs.map((p, pi) => `<span class="phw"><button type="button" class="ph" data-action="photo-view" data-meal="${key}" data-i="${pi}" aria-label="Powiększ zdjęcie ${pi + 1}: ${esc(name)}">` +
        `<img src="${p.src}" alt="Zdjęcie ${pi + 1}: ${esc(name)}"></button><button type="button" class="phdel" data-action="photo-del" data-meal="${key}" data-i="${pi}" aria-label="Usuń zdjęcie ${pi + 1}">✕</button>` +
        `<span class="pht">${p.at ? new Date(p.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : ''}</span></span>`).join('') +
        `<button type="button" class="phadd" data-action="photo" data-meal="${key}" aria-label="Dodaj kolejne zdjęcie">+</button></div>`;
    }
    html += `<div class="addrow"><button type="button" class="addbtn" data-action="kid-add" data-meal="${key}" aria-expanded="${addOpen === key}" aria-label="${kid ? 'Dopisz, co zjadłeś na' : 'Dodaj danie do'} ${esc(name)}"><span class="ic">+</span>Dodaj</button>` +
      `<button type="button" class="addbtn prop" data-action="prop-add" data-meal="${key}" aria-expanded="${addOpen === 'p:' + key}" aria-label="Zaproponuj danie na ${esc(name)}"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg></span>Zaproponuj</button></div>`;
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
const UZU = {};
function uzuNote(cols) {
  const shown = Object.keys(UZU).filter((it) => cols.ok.includes(it) || cols.lim.includes(it) || cols.no.includes(it));
  if (!shown.length) return '';
  return '<div class="note small"><strong>* Dopisane w aplikacji</strong>, nie ma ich w zaleceniach dietetyka:<ul class="uzu">' +
    shown.map((it) => `<li><strong>${esc(cap(it))}</strong>: ${esc(UZU[it])}</li>`).join('') + '</ul></div>';
}
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
    `<div class="pills">${cols[st].map((it) => `<button type="button" class="pill ${st} tiny" data-action="chk-top" data-it="${esc(it)}" aria-pressed="${(state.chkTop || []).includes(it)}"${UZU[it] ? ` title="${esc(UZU[it])}"` : ''}>${esc(cap(it))}${UZU[it] ? ' *' : ''}</button>`).join('') || '<span class="muted">–</span>'}</div></section>`).join('') + '</div>' + uzuNote(cols);
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
    '<div class="card"><h2>Wygląd</h2><div class="chips">' + [['light', 'Jasny'], ['warm', 'Ciepły przygaszony'], ['gray', 'Szary'], ['dark', 'Ciemny'], ['system', 'Jak w systemie']].map(([v, n]) =>
      `<button type="button" class="chip" data-action="theme" data-v="${v}" aria-pressed="${(state.theme || 'system') === v}">${n}</button>`).join('') + '</div></div>' +
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
      `<div class="field"><label for="pw-${p.id}">Waga (kg), do spalonych kcal</label><input type="number" id="pw-${p.id}" data-field="kg" min="0" max="300" step="0.5" inputmode="decimal" value="${esc(p.kg || '')}" placeholder="np. ${p.role === 'dziecko' ? 40 : 75}"></div>` +
      `<div class="field"><span>&nbsp;</span><button type="button" class="ghost" data-action="rm-profile" data-id="${p.id}">Usuń profil</button></div></div></div>`;
  }
  html += '<button type="button" data-action="add-profile">Dodaj profil</button>' + syncCard();
  return html;
}

// Motyw: jasny, ciemny albo jak w systemie.
const darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const t = state.theme || 'system';
  const v = t === 'system' ? (darkMq && darkMq.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = v;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = { dark: '#23211f', warm: '#CFC5B8', gray: '#D4D4D6', light: '#ECE6DF' }[v] || '#ECE6DF';
}
if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', () => applyTheme());

function render() {
  applyTheme();
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

// Usuwanie tylko po świadomym potwierdzeniu.
const lbl = (t) => (t.getAttribute('aria-label') || '').replace(/^(Usuń|Wycofaj|Odrzuć)( z listy| z planu)?\s*/, '');
const mealN = (k) => ((MEALS.find((m) => m[0] === k) || [])[1] || '').toLowerCase();
const NEED_OK = {
  del: (t) => {
    const it = (day().meals[t.dataset.meal] || { items: [] }).items[Number(t.dataset.i)] || {};
    return { title: `Usunąć „${it.name || lbl(t)}”?`, text: `Danie zniknie z posiłku: ${mealN(t.dataset.meal)}.` + (isKid() && it.by === 'rodzic' ? ' To danie dodał rodzic.' : ''), yes: 'Usuń' };
  },
  'prop-rm': (t) => ({ title: `Usunąć propozycję „${lbl(t)}”?`, text: 'Propozycja zniknie z listy.', yes: 'Usuń' }),
  'prop-no': (t) => ({ title: `Odrzucić propozycję „${lbl(t)}”?`, text: 'Autor zobaczy, że propozycja została odrzucona.', yes: 'Odrzuć' }),
  'photo-del': () => ({ title: 'Usunąć to zdjęcie?', text: 'Zdjęcia nie da się przywrócić.', yes: 'Usuń' }),
  'act-del': (t) => ({ title: `Usunąć aktywność „${lbl(t)}”?`, text: '', yes: 'Usuń' }),
  'k-drink-del': (t) => ({ title: `Usunąć napój „${lbl(t)}”?`, text: '', yes: 'Usuń' }),
  'k-plan-rm': () => ({ title: 'Usunąć danie z planu?', text: '', yes: 'Usuń' }),
};
function askConfirm(o) {
  return new Promise((res) => {
    const prev = document.activeElement;
    const w = document.createElement('div');
    w.className = 'askbg';
    w.innerHTML = `<div class="ask" role="alertdialog" aria-modal="true" aria-labelledby="ask-t" aria-describedby="ask-d"><h2 id="ask-t">${esc(o.title)}</h2>` +
      (o.text ? `<p id="ask-d" class="muted">${esc(o.text)}</p>` : '<p id="ask-d" class="sr">Potwierdź</p>') +
      `<div class="row"><button type="button" class="ghost" data-ask="0">Anuluj</button><button type="button" class="danger" data-ask="1">${esc(o.yes || 'Tak')}</button></div></div>`;
    const done = (v) => { w.remove(); document.removeEventListener('keydown', esc_); if (prev && prev.focus) prev.focus(); res(v); };
    const esc_ = (e) => { if (e.key === 'Escape') done(false); };
    w.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-ask]'); if (b) done(b.dataset.ask === '1'); else if (e.target === w) done(false); });
    document.addEventListener('keydown', esc_);
    document.body.appendChild(w);
    w.querySelector('[data-ask="0"]').focus();
  });
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
  if (NEED_OK[a] && !t._ok) {
    askConfirm(NEED_OK[a](t)).then((yes) => { if (yes && t.isConnected) { t._ok = true; t.click(); t._ok = false; } });
    return;
  }
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
  else if (a === 'rep-prep') { const i = $('#smail'); if (i) { state.statsMail = i.value.trim(); save(true); } return reportPrepare(); }
  else if (a === 'rep-send') return reportSend();
  else if (a === 'stats-mail') return statsMail();
  else if (a === 'theme') { state.theme = t.dataset.v; save(true); return render(); }
  else if (a === 'sound') {
    const order = ['pik', 'pyk', 'off'], s = state.sound || 'pik';
    state.sound = order[(order.indexOf(s) + 1) % order.length]; save(true); playChime(state.sound); return render();
  }
  else if (a === 'photo') return takePhoto(t.dataset.meal);
  else if (a === 'photo-view') { const ph = photosOf(meal(d, t.dataset.meal))[Number(t.dataset.i) || 0]; if (ph) viewPhoto(ph.src); return; }
  else if (a === 'photo-del') { const m = meal(d, t.dataset.meal), ph = photosOf(m); ph.splice(Number(t.dataset.i) || 0, 1); m.photos = ph; delete m.photo; d.u = Date.now(); }
  else if (a === 'prop-add') { const k = 'p:' + t.dataset.meal; addOpen = addOpen === k ? null : k; render(); const i = $('#n-' + t.dataset.meal); if (i) i.focus(); return; }
  else if (a === 'prop-ok') {
    const it = meal(d, t.dataset.meal).items[Number(t.dataset.i)];
    if (it && it.prop && !it.rej) { delete it.prop; it.acc = true; if (it.from === 'dziecko') it.kid = true; else it.by = 'rodzic'; delete it.from; }
  }
  else if (a === 'prop-no') { const it = meal(d, t.dataset.meal).items[Number(t.dataset.i)]; if (it && it.prop) it.rej = true; }
  else if (a === 'prop-rm') meal(d, t.dataset.meal).items.splice(Number(t.dataset.i), 1);
  else if (a === 'kid-add') { addOpen = addOpen === t.dataset.meal ? null : t.dataset.meal; render(); const i = $('#n-' + addOpen); if (i) i.focus(); return; }
  else if (a === 'st-range') { st.range = Number(t.dataset.v); if (typeof rep !== 'undefined') { rep.file = null; rep.msg = ''; } return render(); }
  else if (a === 'act-del') { (d.activities = d.activities || []).splice(Number(t.dataset.i), 1); d.u = Date.now(); }
  else if (a === 'act-pick') { $('#an').value = t.dataset.name; $('#am').value = t.dataset.min; const es = $('#aest'); if (es) es.innerHTML = actEst(); $('#am').focus(); return; }
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
  if ((e.target.id === 'an' || e.target.id === 'am') && $('#aest')) $('#aest').innerHTML = actEst();
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
    p[f] = f === 'kcal' ? Math.max(0, Number(e.target.value) || 0) : f === 'kg' ? Math.max(0, Number(e.target.value) || 0) : f === 'nick' ? e.target.value.trim() : e.target.value.trim() || p[f];
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
    checkChime();
  }, 30000);
}

async function init() {
  try {
    const r = await fetch('data/rules.json');
    rules = await r.json();
    for (const u of rules.uzupelnienia || []) UZU[u.it] = u.uw;
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
