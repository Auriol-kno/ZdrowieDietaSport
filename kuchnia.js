'use strict';
// Widoki i akcje kuchni: przepisy, tryb gotowania, plan tygodnia, lista zakupów.
// Korzysta z globalnych elementów app.js (state, render, save, day, meal, MEALS, LABEL, ...), wywoływanych dopiero w czasie działania.

const ku = {
  recipes: [], drinks: [], idx: [], q: '', kat: '', dev: '', meal: '', rid: null, port: 3, cook: null,
  sub: 'plan', weekOff: 0, month: new Date().toLocaleDateString('sv-SE').slice(0, 7), sel: '', custom: null, days: 7, form: false, target: null, timer: null, wake: null, flash: '',
};
const DAYN = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const DEV = { tm6: 'Thermomix TM6', af: 'Air fryer' };
const mealName = (k) => (MEALS.find((m) => m[0] === k) || [k, k])[1];

const allRecipes = () => ku.recipes.concat(state.recipes || []);
const rget = (id) => allRecipes().find((r) => r.id === id);
const byIdMap = () => Object.fromEntries(allRecipes().map((r) => [r.id, r]));
const pillSt = (st) => `<span class="pill ${st}"><span aria-hidden="true">${MARK[st]}</span>${(isKid() ? LABEL_KID : LABEL)[st]}</span>`;
const devPills = (r) => r.urz.map((d) => `<span class="pill dev">${DEV[d]}</span>`).join('');

function dayLabel(iso) {
  const t = dayKey();
  if (iso === t) return 'Dziś';
  if (iso === ZdsRecipes.dayAfter(t, 1)) return 'Jutro';
  return DAYN[new Date(iso + 'T12:00:00').getDay()] + ' ' + iso.slice(8) + '.' + iso.slice(5, 7);
}
const fmtT = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

// ---------- lista przepisów ----------
function recipeMatches(r) {
  const nq = ZdsRecipes.norm(ku.q);
  if (nq && !ZdsRecipes.norm(r.name).includes(nq) && !r.skladniki.some((i) => ZdsRecipes.norm(i.n).includes(nq))) return false;
  if (ku.dev === 'none' ? r.urz.length : ku.dev && !r.urz.includes(ku.dev)) return false;
  if (ku.meal && !r.posilki.includes(ku.meal)) return false;
  if (ku.kat && (r.kat || 'danie') !== ku.kat) return false;
  return true;
}

function listHtml() {
  const rs = allRecipes().filter(recipeMatches);
  if (!rs.length) return '<p class="muted">Brak przepisów dla tych filtrów.</p>';
  return rs.map((r) => {
    const c = ZdsRecipes.checkRecipe(ku.idx, r);
    return `<button type="button" class="card rcard" data-action="k-open" data-id="${esc(r.id)}"><strong>${esc(r.name)}</strong>` +
      `<span class="row wrap">${pillSt(c.st)}${devPills(r)}<span class="muted">${r.czas} min</span></span></button>`;
  }).join('');
}

function customForm() {
  return '<form class="card" data-recipe="1"><h2>Własny przepis</h2>' +
    '<div class="field"><label for="cn">Nazwa</label><input type="text" id="cn" required></div>' +
    '<div class="grid"><div class="field"><label for="cp">Porcje</label><input type="number" id="cp" min="1" value="3"></div>' +
    '<div class="field"><label for="ct">Czas (min)</label><input type="number" id="ct" min="1" value="20"></div>' +
    `<div class="field"><label for="cm">Posiłek</label><select id="cm">${MEALS.map((m) => `<option value="${m[0]}">${m[1]}</option>`).join('')}</select></div>` +
    '<div class="field"><label for="cu">Urządzenie</label><select id="cu"><option value="">Brak</option><option value="tm6">Thermomix TM6</option><option value="af">Air fryer</option></select></div></div>' +
    '<div class="field"><label for="ci">Składniki (jeden w linii, np. „200 g kasza gryczana”)</label><textarea id="ci" rows="5" required></textarea></div>' +
    '<div class="field"><label for="cs">Kroki (jeden w linii)</label><textarea id="cs" rows="4" required></textarea></div>' +
    '<div class="row"><button type="submit">Zapisz i sprawdź</button><button type="button" class="ghost" data-action="k-form">Anuluj</button></div></form>';
}

function viewRecipes() {
  if (ku.cook) return viewCook();
  if (ku.rid) return viewRecipe();
  let h = '<h1>Przepisy</h1>';
  if (ku.target) {
    h += `<div class="note">Wybierasz przepis na: ${esc(dayLabel(ku.target.day))}, ${esc(mealName(ku.target.meal))}. ` +
      '<button type="button" class="small ghost" data-action="k-untarget">Anuluj</button></div>';
  }
  h += '<div class="field"><label for="rq" class="muted">Szukaj przepisu lub składnika</label><input type="text" id="rq" autocomplete="off" value="' + esc(ku.q) + '"></div>' +
    '<div class="chips" role="group" aria-label="Rodzaj">' +
    [['', 'Wszystko'], ['danie', 'Dania'], ['przekaska', 'Przekąski'], ['napoj', 'Napoje']].map((o) => `<button type="button" class="chip" data-action="k-kat" data-v="${o[0]}" aria-pressed="${ku.kat === o[0]}">${o[1]}</button>`).join('') + '</div>' +
    '<div class="grid"><div class="field"><label for="rdev" class="muted">Urządzenie</label><select id="rdev">' +
    [['', 'Wszystkie'], ['tm6', 'Thermomix TM6'], ['af', 'Air fryer'], ['none', 'Bez urządzeń']].map((o) => `<option value="${o[0]}"${ku.dev === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('') + '</select></div>' +
    '<div class="field"><label for="rmeal" class="muted">Posiłek</label><select id="rmeal"><option value="">Wszystkie</option>' +
    MEALS.map((m) => `<option value="${m[0]}"${ku.meal === m[0] ? ' selected' : ''}>${m[1]}</option>`).join('') + '</select></div></div>';
  h += `<div id="rlist" class="stack">${listHtml()}</div>`;
  if (!isKid()) h += ku.form ? customForm() : '<button type="button" class="ghost" data-action="k-form">Dodaj własny przepis</button>';
  return h;
}

// ---------- szczegóły przepisu ----------
function banner(c) {
  const kid = isKid();
  const bad = c.items.filter((x) => x.st === 'no').map((x) => x.ing.n);
  const lim = c.items.filter((x) => x.st === 'lim' && !x.ing.drobny).map((x) => x.ing.n);
  let h = '';
  if (c.st === 'no') h += `<div class="note warn">${kid ? 'Są tu rzeczy, które teraz odpadają. Zapytaj rodzica.' : 'Zakazane składniki: ' + esc(bad.join(', ')) + '.'}</div>`;
  else if (c.st === 'lim') h += `<div class="note warn">${kid ? 'Są tu rzeczy „czasem i mało”.' : 'Składniki w ograniczonych ilościach: ' + esc(lim.join(', ')) + '.'}</div>`;
  else h += `<div class="note">${kid ? 'Ten przepis jest w porządku.' : 'Wszystkie składniki są zgodne z zaleceniami.'}</div>`;
  if (c.fruit) h += '<div class="note warn">Są tu owoce. Jedz je tylko do godziny 16:00.</div>';
  if (!kid && c.unk) h += `<p class="muted">${c.unk} składników spoza listy zaleceń. Sprawdź z dietetykiem albo po składzie.</p>`;
  if (!kid && c.items.some((x) => x.amb)) h += '<p class="muted">Część składników pasuje do kilku pozycji z listy. Pokazano ostrożniejszą ocenę.</p>';
  return h;
}

function ingList(r, c) {
  const f = ku.port / r.porcje;
  return '<ul class="ing">' + c.items.map((x) => {
    const q = x.ing.q == null ? '' : ZdsRecipes.fmtQty(x.ing.q * f, x.ing.u) + ' ';
    const mark = x.st === 'neutral' || x.st === 'unk' ? '' : `<span class="pill ${x.st} tiny" title="${(isKid() ? LABEL_KID : LABEL)[x.st]}"><span aria-hidden="true">${MARK[x.st]}</span></span>`;
    return `<li><span>${mark}${esc(q + x.ing.n)}</span></li>`;
  }).join('') + '</ul>';
}

function stepsHtml(r) {
  return '<ol class="steps">' + r.kroki.map((k) => `<li>${esc(k.t)}` +
    (k.dev ? `<div class="row wrap"><span class="pill dev">${DEV[k.dev]}</span>${k.p ? `<strong>${esc(k.p)}</strong>` : ''}</div>` : '') + '</li>').join('') + '</ol>';
}

function planBox(r, defMeal) {
  const pm = ku.pm || defMeal, pd = ku.pd || (ku.target ? ku.target.day : dayKey());
  const t = dayKey();
  const quick = [];
  for (let n = 0; n < 7; n++) {
    const iso = ZdsRecipes.dayAfter(t, n);
    quick.push([iso, n === 0 ? 'Dziś' : n === 1 ? 'Jutro' : DAYN[new Date(iso + 'T12:00:00').getDay()] + ' ' + iso.slice(8) + '.' + iso.slice(5, 7)]);
  }
  const mn = (MEALS.find((m) => m[0] === pm) || [])[1] || '';
  const dn = (quick.find((q) => q[0] === pd) || [0, pd.slice(8) + '.' + pd.slice(5, 7)])[1];
  const plural = ku.port === 1 ? 'porcję' : ku.port < 5 ? 'porcje' : 'porcji';
  return '<div class="card planadd"><h2>Dodaj do planu</h2><div class="muted">Posiłek</div><div class="chips scroll">' +
    MEALS.map((m) => `<button type="button" class="chip" data-action="k-pm" data-v="${m[0]}" aria-pressed="${m[0] === pm}">${m[1]}</button>`).join('') +
    '</div><div class="muted">Dzień</div><div class="chips scroll">' +
    quick.map((q) => `<button type="button" class="chip${isWeekend(q[0]) ? ' we' : ''}" data-action="k-pd" data-v="${q[0]}" aria-pressed="${q[0] === pd}">${q[1]}</button>`).join('') +
    '</div><div class="field"><label for="pday" class="muted">Inny dzień</label>' +
    `<input type="date" id="pday" value="${esc(pd)}"></div>` +
    `<button type="button" data-action="k-plan-add">Dodaj ${ku.port} ${plural}: ${esc(mn)}, ${esc(dn)}</button></div>`;
}

function viewRecipe() {
  const r = rget(ku.rid);
  if (!r) { ku.rid = null; return viewRecipes(); }
  const c = ZdsRecipes.checkRecipe(ku.idx, r);
  const kid = isKid();
  const flash = ku.flash; ku.flash = '';
  const defMeal = (ku.target && ku.target.meal) || r.posilki[0] || 'ii';
  const mealOpts = (sel) => MEALS.map((m) => `<option value="${m[0]}"${m[0] === sel ? ' selected' : ''}>${m[1]}</option>`).join('');
  let h = '<button type="button" class="ghost small" data-action="k-back">← Wszystkie przepisy</button>' +
    `<h1>${esc(r.name)}</h1>` + (flash ? `<div class="note">${esc(flash)}</div>` : '');
  h += `<p class="muted">${esc(r.opis || '')}</p>` +
    `<div class="row wrap">${pillSt(c.st)}${devPills(r)}<span class="muted">${r.czas} min${!kid && r.kcal ? ' · ok. ' + r.kcal + ' kcal na porcję (szac.)' : ''}</span></div>` +
    banner(c) + (kid ? '' : planBox(r, defMeal)) +
    `<div class="card"><div class="row sb"><h2>Składniki</h2><div class="row"><button type="button" class="small ghost" data-action="k-port" data-d="-1" aria-label="Mniej porcji">−</button>` +
    `<strong>${ku.port} ${ku.port === 1 ? 'porcja' : ku.port < 5 ? 'porcje' : 'porcji'}</strong><button type="button" class="small ghost" data-action="k-port" data-d="1" aria-label="Więcej porcji">+</button></div></div>` +
    ingList(r, c) + '</div>' +
    `<div class="card"><h2>Przygotowanie</h2>${stepsHtml(r)}<button type="button" data-action="k-cook">Gotuj krok po kroku</button></div>` +
    (r.uwagi ? `<p class="muted">${esc(r.uwagi)}</p>` : '') +
    '<div class="card"><h2>Zjedzone dziś</h2><div class="field">' +
    `<label for="lmeal" class="muted">Do którego posiłku (1 porcja)</label><select id="lmeal">${mealOpts(r.posilki[0] || 'ii')}</select></div>` +
    '<button type="button" class="ghost" data-action="k-log">Zapisz w dzienniku</button></div>';
  if (String(r.id).startsWith('c-')) h += '<button type="button" class="ghost" data-action="k-del">Usuń ten przepis</button>';
  return h;
}

// ---------- tryb gotowania ----------
function viewCook() {
  const r = rget(ku.cook.rid);
  if (!r) { ku.cook = null; return viewRecipes(); }
  const i = ku.cook.i, n = r.kroki.length, k = r.kroki[i];
  const running = ku.timer && ku.timer.rid === r.id && ku.timer.i === i;
  let h = `<div class="row sb"><button type="button" class="ghost small" data-action="k-cook-exit">Zamknij</button><span class="muted">Krok ${i + 1} z ${n}</span></div>` +
    `<div class="bar"><i style="width:${Math.round(((i + 1) / n) * 100)}%"></i></div><h2>${esc(r.name)}</h2>` +
    `<div class="card cookstep"><p class="cooktext">${esc(k.t)}</p>` +
    (k.dev ? `<div class="row wrap"><span class="pill dev">${DEV[k.dev]}</span>${k.p ? `<strong class="cookparam">${esc(k.p)}</strong>` : ''}</div>` : '');
  if (k.timer) {
    h += running
      ? `<div class="row sb"><span id="tmr" class="big">${fmtT(Math.max(0, Math.round((ku.timer.end - Date.now()) / 1000)))}</span><button type="button" class="ghost" data-action="k-timer-stop">Stop</button></div>`
      : `<button type="button" data-action="k-timer" data-s="${k.timer}">Start timera ${fmtT(k.timer)}</button>`;
  }
  h += '</div><div class="row">' +
    `<button type="button" class="ghost" data-action="k-prev"${i === 0 ? ' disabled' : ''}>Wstecz</button>` +
    (i < n - 1 ? '<button type="button" data-action="k-next">Dalej</button>' : '<button type="button" data-action="k-cook-exit">Smacznego!</button>') + '</div>' +
    `<details class="card"><summary>Składniki (${ku.port} porcji)</summary>${ingList(r, ZdsRecipes.checkRecipe(ku.idx, r))}</details>` +
    '<p class="muted">Ekran zostaje włączony na czas gotowania, jeśli telefon na to pozwala.</p>';
  return h;
}

async function wakeOn() {
  try { if (navigator.wakeLock && !ku.wake) ku.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* bez blokady ekranu */ }
}
function wakeOff() {
  try { if (ku.wake) ku.wake.release(); } catch (e) { /* ignoruj */ }
  ku.wake = null;
}

function alarm() {
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) { /* bez wibracji */ }
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    const ctx = new A();
    for (let n = 0; n < 3; n++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.15;
      o.start(ctx.currentTime + n * 0.5); o.stop(ctx.currentTime + n * 0.5 + 0.25);
    }
  } catch (e) { /* bez dźwięku */ }
}

function tick() {
  if (!ku.timer) return;
  const left = Math.max(0, Math.round((ku.timer.end - Date.now()) / 1000));
  const el = typeof document !== 'undefined' && document.getElementById('tmr');
  if (el) el.textContent = left > 0 ? fmtT(left) : 'Gotowe!';
  if (left <= 0 && !ku.timer.done) { ku.timer.done = true; alarm(); }
}
if (typeof document !== 'undefined') setInterval(tick, 500);

// ---------- napoje (karta na ekranie Dziś) ----------
function drinksCard() {
  const d = day(), kid = cur().role === 'dziecko';
  const opts = ku.drinks.filter((x) => x.dla === 'wszyscy' || !kid);
  const list = d.drinks || [];
  const total = list.reduce((a, x) => a + (Number(x.ml) || 0), 0);
  const cups = list.filter((x) => (ku.drinks.find((o) => o.id === x.id) || {}).kawa).length;
  let h = `<div class="card drinks"><div class="row sb"><h2>Inne napoje</h2><span class="muted">${total ? total + ' ml' : 'jeszcze nic'}</span></div>` +
    '<p class="muted">Woda liczy się osobno do celu 2 l. Tu dopisz herbatę, napar, sok albo kefir.</p>' +
    '<div class="chips scroll">' + opts.map((o) => `<button type="button" class="chip" data-action="k-drink" data-id="${esc(o.id)}">+ ${esc(o.name)}</button>`).join('') + '</div>';
  h += '<form data-drink="1" class="kidform"><label class="sr" for="dn">Co piłeś?</label><input type="text" id="dn" placeholder="Wpisz, co piłeś" required autocomplete="off">' +
    '<label class="sr" for="dml">ml</label><input type="number" id="dml" value="250" min="10" max="3000" step="10" inputmode="numeric"><button type="submit" class="small">Dodaj</button></form>';
  if (list.length) {
    h += '<ul class="drinklist">' + list.map((x, i) => {
      const o = ku.drinks.find((y) => y.id === x.id);
      const pill = o && o.rule ? pillSt(ZdsRecipes.matchRule(ku.idx, o.rule) ? ZdsRecipes.matchRule(ku.idx, o.rule).st : 'ok') : itemPill(x.name);
      return `<li class="${x.kid ? 'kiditem' : ''}"><span>${esc(x.name)} <span class="muted">${esc(x.ml)} ml</span> ${pill}</span>` +
        `<button type="button" class="small ghost" data-action="k-drink-del" data-i="${i}" aria-label="Usuń ${esc(x.name)}">✕</button></li>`;
    }).join('') + '</ul>';
  }
  if (!kid && cups) {
    h += `<div class="note">Kawa dziś: ${cups}. Ogólna wskazówka dla zdrowych dorosłych to do ok. 400 mg kofeiny dziennie, czyli około 3–4 filiżanek. W ciąży albo przy chorobach zapytaj lekarza.</div>`;
  }
  return h + '</div>';
}

// ---------- plan tygodnia ----------
function planEntries(from, n) {
  const out = [];
  for (let d = 0; d < n; d++) {
    const iso = ZdsRecipes.dayAfter(from, d);
    for (const [mk] of MEALS) for (const e of (state.plan[iso + '|' + mk] || [])) out.push(e);
  }
  return out;
}

const isWeekend = (iso) => { const g = new Date(iso + 'T12:00:00').getDay(); return g === 0 || g === 6; };
const pad2 = (n) => String(n).padStart(2, '0');
const capw = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function dayChip(iso) {
  const wd = DAYN[new Date(iso + 'T12:00:00').getDay()];
  return `<span class="daylabel${isWeekend(iso) ? ' we' : ''}">${wd} · ${iso.slice(8)}.${iso.slice(5, 7)}</span>`;
}
function dayTitle(iso) {
  const t = dayKey();
  if (iso === t) return 'Dziś';
  if (iso === ZdsRecipes.dayAfter(t, 1)) return 'Jutro';
  return capw(new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long' }));
}

function customPlanForm(iso, mk) {
  return `<form class="cform" data-cplan="1" data-day="${iso}" data-meal="${mk}"><label class="sr" for="cdn">Nazwa dania</label>` +
    '<input type="text" id="cdn" placeholder="Nazwa dania" required autocomplete="off"><label class="sr" for="cdk">kcal</label>' +
    '<input type="number" id="cdk" placeholder="kcal" min="0" inputmode="numeric"><button type="submit" class="small">Dodaj</button></form>';
}

function dayCard(iso) {
  const kid = isKid(), map = byIdMap();
  let kcal = 0, body = '';
  for (const [mk, mn, hr] of MEALS) {
    const es = state.plan[iso + '|' + mk] || [];
    body += `<div class="meal"><div class="row sb"><strong>${esc(mn)} <span class="muted">${hr}</span></strong>` +
      (kid ? '' : `<span class="row"><button type="button" class="small ghost" data-action="k-pick" data-day="${iso}" data-meal="${mk}">+ Przepis</button>` +
        `<button type="button" class="small ghost" data-action="k-custom" data-day="${iso}" data-meal="${mk}">+ Własne</button></span>`) + '</div>';
    if (!kid && ku.custom && ku.custom.day === iso && ku.custom.meal === mk) body += customPlanForm(iso, mk);
    const items = es.map((e, i) => {
      const r = e.rid ? map[e.rid] : null;
      if (e.rid && !r) return '';
      const name = r ? r.name : e.name;
      kcal += r ? (r.kcal || 0) : (Number(e.kcal) || 0);
      const late = r && ZdsRecipes.checkRecipe(ku.idx, r).fruit && (mk === 'przekaska' || mk === 'kolacja');
      const label = r && !kid ? `<button type="button" class="linkish" data-action="k-open" data-id="${esc(r.id)}">${esc(name)}</button> <span class="muted">× ${e.portions}</span>`
        : r ? `<span>${esc(name)}</span>` : `<span>${esc(name)}</span>${!kid && e.kcal ? ` <span class="muted">· ${esc(e.kcal)} kcal</span>` : ''}`;
      return `<li><span>${label}${late ? '<br><span class="inline-warn">Owoce po 16:00 nie są zalecane</span>' : ''}</span>` +
        (kid ? '' : `<button type="button" class="small ghost" data-action="k-plan-rm" data-day="${iso}" data-meal="${mk}" data-i="${i}" aria-label="Usuń z planu">×</button>`) + '</li>';
    }).join('');
    if (items) body += `<ul>${items}</ul>`;
    body += '</div>';
  }
  return `<div class="card daycard${isWeekend(iso) ? ' we' : ''}"><div class="row sb"><div class="row"><h2>${esc(dayTitle(iso))}</h2>${dayChip(iso)}</div>` +
    (!kid && kcal ? `<span class="muted">ok. ${kcal} kcal${cur().kcal ? ' z ' + cur().kcal : ''}</span>` : '') + `</div>${body}</div>`;
}

function viewMonth() {
  const [y, m] = ku.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), lead = (first.getDay() + 6) % 7, total = new Date(y, m, 0).getDate();
  const today = dayKey();
  if (!ku.sel || ku.sel.slice(0, 7) !== ku.month) ku.sel = today.slice(0, 7) === ku.month ? today : ku.month + '-01';
  let h = '<div class="row sb"><button type="button" class="small ghost" data-action="k-mon" data-d="-1" aria-label="Poprzedni miesiąc">‹</button>' +
    `<strong>${esc(capw(first.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })))}</strong>` +
    '<button type="button" class="small ghost" data-action="k-mon" data-d="1" aria-label="Następny miesiąc">›</button></div>';
  h += '<div class="month" role="group" aria-label="Kalendarz planu">' + ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map((n, i) => `<span class="mh${i > 4 ? ' we' : ''}">${n}</span>`).join('');
  for (let i = 0; i < lead; i++) h += '<span></span>';
  for (let d = 1; d <= total; d++) {
    const iso = `${y}-${pad2(m)}-${pad2(d)}`;
    const marks = MEALS.map(([mk]) => ((state.plan[iso + '|' + mk] || []).length ? '<i class="on"></i>' : '<i></i>')).join('');
    const n = MEALS.reduce((a, [mk]) => a + (state.plan[iso + '|' + mk] || []).length, 0);
    h += `<button type="button" class="daycell${isWeekend(iso) ? ' we' : ''}${iso === today ? ' today' : ''}" data-action="k-day" data-day="${iso}" aria-pressed="${iso === ku.sel}" ` +
      `aria-label="${d}. ${esc(first.toLocaleDateString('pl-PL', { month: 'long' }))}, w planie: ${n}"><b>${d}</b><span class="dots">${marks}</span></button>`;
  }
  return h + '</div>' + dayCard(ku.sel);
}

function viewPlan() {
  const kid = isKid();
  if (kid && ku.sub === 'zakupy') ku.sub = 'plan';
  let h = '<h1>Plan</h1><div class="row seg">' +
    [['plan', 'Tydzień'], ['month', 'Miesiąc']].concat(kid ? [] : [['zakupy', 'Zakupy']]).map((o) => `<button type="button" class="ghost" data-action="k-sub" data-v="${o[0]}" aria-pressed="${ku.sub === o[0]}">${o[1]}</button>`).join('') + '</div>';
  if (ku.sub === 'zakupy') return h + viewShop();
  if (ku.sub === 'month') return h + viewMonth();
  const start = ZdsRecipes.dayAfter(dayKey(), ku.weekOff * 7);
  h += '<div class="row sb"><button type="button" class="small ghost" data-action="k-wk" data-d="-1" aria-label="Poprzedni tydzień">‹</button>' +
    `<span class="row"><strong>${start.slice(8)}.${start.slice(5, 7)} – ${ZdsRecipes.dayAfter(start, 6).slice(8)}.${ZdsRecipes.dayAfter(start, 6).slice(5, 7)}</strong>` +
    (ku.weekOff ? '<button type="button" class="small ghost" data-action="k-wk" data-d="0">Dziś</button>' : '') + '</span>' +
    '<button type="button" class="small ghost" data-action="k-wk" data-d="1" aria-label="Następny tydzień">›</button></div>';
  for (let n = 0; n < 7; n++) h += dayCard(ZdsRecipes.dayAfter(start, n));
  return h;
}

// ---------- lista zakupów ----------
function shopData() {
  const entries = planEntries(dayKey(), ku.days);
  const list = ZdsRecipes.shoppingList(ku.idx, entries, byIdMap());
  const pantry = new Set((state.pantry || []).map(ZdsRecipes.norm));
  return { list, pantry, entries };
}

function shopText() {
  const { list, pantry } = shopData();
  const open = list.filter((x) => !pantry.has(ZdsRecipes.norm(x.name)) && !state.shop.checked[x.key]);
  let t = 'Lista zakupów:\n', sec = '';
  for (const x of open) {
    if (x.section !== sec) { sec = x.section; t += '\n' + sec + '\n'; }
    t += '- ' + x.name + (x.qty ? ' ' + ZdsRecipes.fmtQty(x.qty, x.unit, true) : '') + '\n';
  }
  return t;
}

function viewShop() {
  const { list, pantry, entries } = shopData();
  let h = `<div class="field"><label for="sdays" class="muted">Zakres planu</label><select id="sdays">` +
    [[1, 'Tylko dziś'], [3, '3 dni'], [7, '7 dni']].map((o) => `<option value="${o[0]}"${ku.days === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('') + '</select></div>';
  if (!entries.length) return h + '<p class="muted">W planie nic nie ma. Dodaj przepisy w zakładce Przepisy, a lista zakupów policzy się sama.</p>';
  const row = (x, have) => {
    const done = state.shop.checked[x.key];
    return `<div class="shop${done ? ' is-done' : ''}"><button type="button" class="chk ghost" data-action="k-check" data-k="${esc(x.key)}" aria-pressed="${Boolean(done)}" aria-label="Kupione">${done ? '✓' : ''}</button>` +
      `<span class="shopname">${esc(x.name)}${x.qty ? ' <span class="muted">' + esc(ZdsRecipes.fmtQty(x.qty, x.unit, true)) + '</span>' : ''}</span>` +
      `<button type="button" class="small ghost" data-action="k-pantry" data-n="${esc(x.name)}">${have ? 'Nie mam' : 'Mam'}</button></div>`;
  };
  const need = list.filter((x) => !pantry.has(ZdsRecipes.norm(x.name)));
  const have = list.filter((x) => pantry.has(ZdsRecipes.norm(x.name)));
  let sec = '';
  h += '<div class="card">';
  for (const x of need) {
    if (x.section !== sec) { sec = x.section; h += `<h2 class="sec">${esc(sec)}</h2>`; }
    h += row(x, false);
  }
  h += '</div>';
  if (have.length) h += '<div class="card"><h2 class="sec">Mam w domu</h2>' + have.map((x) => row(x, true)).join('') + '</div>';
  h += '<div class="row wrap"><button type="button" data-action="k-copy">Kopiuj listę</button><button type="button" class="ghost" data-action="k-clear">Wyczyść zaznaczenia</button></div>' +
    '<p class="muted">„Mam” zapamiętuje produkt jako zapas w domu, więc następnym razem nie trafi na listę.</p>';
  return h;
}

// ---------- akcje ----------
function kAction(a, t) {
  const top = () => { try { window.scrollTo(0, 0); } catch (e) { /* brak okna */ } };
  switch (a) {
    case 'k-open': {
      const r = rget(t.dataset.id);
      if (!r) return;
      ku.rid = r.id; ku.cook = null; ku.port = r.porcje; ku.pm = null; ku.pd = null; tab = 'przepisy'; top(); break;
    }
    case 'k-back': ku.rid = null; top(); break;
    case 'k-untarget': ku.target = null; break;
    case 'k-port': ku.port = Math.min(12, Math.max(1, ku.port + Number(t.dataset.d))); break;
    case 'k-cook': ku.cook = { rid: ku.rid, i: 0 }; wakeOn(); top(); break;
    case 'k-prev': ku.cook.i = Math.max(0, ku.cook.i - 1); break;
    case 'k-next': { const r = rget(ku.cook.rid); ku.cook.i = Math.min(r.kroki.length - 1, ku.cook.i + 1); break; }
    case 'k-cook-exit': ku.cook = null; ku.timer = null; wakeOff(); top(); break;
    case 'k-timer': ku.timer = { rid: ku.cook.rid, i: ku.cook.i, end: Date.now() + Number(t.dataset.s) * 1000, done: false }; break;
    case 'k-timer-stop': ku.timer = null; break;
    case 'k-pm': ku.pm = t.dataset.v; break;
    case 'k-pd': ku.pd = t.dataset.v; break;
    case 'k-plan-add': {
      const dayv = $('#pday').value || ku.pd || dayKey();
      const key = dayv + '|' + (ku.pm || (ku.target && ku.target.meal) || (rget(ku.rid).posilki[0]) || 'ii');
      (state.plan[key] = state.plan[key] || []).push({ rid: ku.rid, portions: ku.port });
      ku.sel = dayv; ku.month = dayv.slice(0, 7); ku.pm = null; ku.pd = null;
      if (ku.target) { ku.target = null; ku.rid = null; tab = 'plan'; top(); } else { top(); ku.flash = 'Dodano do planu: ' + dayv.slice(8) + '.' + dayv.slice(5, 7) + '.'; }
      save(); break;
    }
    case 'k-plan-rm': {
      const key = t.dataset.day + '|' + t.dataset.meal;
      (state.plan[key] || []).splice(Number(t.dataset.i), 1);
      if (!state.plan[key].length) delete state.plan[key];
      save(); break;
    }
    case 'k-pick': ku.target = { day: t.dataset.day, meal: t.dataset.meal }; ku.custom = null; ku.meal = t.dataset.meal; ku.rid = null; ku.cook = null; tab = 'przepisy'; top(); break;
    case 'k-log': {
      const r = rget(ku.rid);
      const d = day();
      meal(d, $('#lmeal').value).items.push({ name: r.name, kcal: r.kcal || 0 });
      d.u = Date.now();
      ku.flash = 'Zapisano w dzienniku.'; save(); break;
    }
    case 'k-kat': ku.kat = t.dataset.v; break;
    case 'k-drink': {
      const dr = ku.drinks.find((x) => x.id === t.dataset.id);
      if (!dr) return;
      const d = day();
      const x = { id: dr.id, name: dr.name, ml: dr.ml };
      if (isKid()) x.kid = true;
      (d.drinks = d.drinks || []).push(x);
      d.u = Date.now(); save(); break;
    }
    case 'k-drink-del': {
      const d = day();
      (d.drinks || []).splice(Number(t.dataset.i), 1);
      d.u = Date.now(); save(); break;
    }
    case 'k-sub': ku.sub = t.dataset.v; break;
    case 'k-wk': ku.weekOff = t.dataset.d === '0' ? 0 : ku.weekOff + Number(t.dataset.d); break;
    case 'k-mon': {
      const [y, m] = ku.month.split('-').map(Number);
      const dt = new Date(y, m - 1 + Number(t.dataset.d), 1);
      ku.month = dt.getFullYear() + '-' + pad2(dt.getMonth() + 1); ku.sel = ''; break;
    }
    case 'k-day': ku.sel = t.dataset.day; break;
    case 'k-custom': {
      const same = ku.custom && ku.custom.day === t.dataset.day && ku.custom.meal === t.dataset.meal;
      ku.custom = same ? null : { day: t.dataset.day, meal: t.dataset.meal }; break;
    }
    case 'k-check': state.shop.checked[t.dataset.k] = !state.shop.checked[t.dataset.k]; save(); break;
    case 'k-pantry': {
      const n = t.dataset.n, nn = ZdsRecipes.norm(n);
      const has = state.pantry.some((x) => ZdsRecipes.norm(x) === nn);
      state.pantry = has ? state.pantry.filter((x) => ZdsRecipes.norm(x) !== nn) : state.pantry.concat(n);
      save(); break;
    }
    case 'k-clear': state.shop.checked = {}; save(); break;
    case 'k-copy': {
      const txt = shopText();
      const done = () => alert('Lista skopiowana.');
      if (navigator.share) navigator.share({ text: txt }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => prompt('Skopiuj listę:', txt));
      else prompt('Skopiuj listę:', txt);
      return;
    }
    case 'k-form': ku.form = !ku.form; break;
    case 'k-del': {
      if (!confirm('Usunąć ten przepis?')) return;
      state.recipes = state.recipes.filter((r) => r.id !== ku.rid);
      for (const k of Object.keys(state.plan)) { state.plan[k] = state.plan[k].filter((e) => e.rid !== ku.rid); if (!state.plan[k].length) delete state.plan[k]; }
      ku.rid = null; save(); break;
    }
    default: return;
  }
  render();
}

function kSubmitCustom(f) {
  const name = f.querySelector('input[type=text]').value.trim();
  const kc = f.querySelector('input[type=number]').value;
  if (!name) return;
  const key = f.dataset.day + '|' + f.dataset.meal;
  (state.plan[key] = state.plan[key] || []).push({ name, kcal: kc === '' ? 0 : Math.max(0, Number(kc)), portions: 1 });
  ku.custom = null; ku.sel = f.dataset.day;
  save(); render();
}

function kSubmitRecipe(f) {
  const v = (id) => f.querySelector('#' + id).value;
  const lines = (id) => v(id).split('\n').map((s) => s.trim()).filter(Boolean);
  const name = v('cn').trim();
  const skl = lines('ci').map((l) => {
    const p = ZdsRecipes.parseLine(l);
    const ing = { n: p.n, q: p.q, u: p.u };
    if (/^woda$/i.test(p.n)) ing.neutral = true;
    if (/^(sól|pieprz)/i.test(p.n)) ing.drobny = true;
    ing.s = ZdsRecipes.guessSection(ku.idx, ing);
    return ing;
  });
  const kroki = lines('cs').map((t) => ({ t }));
  if (!name || !skl.length || !kroki.length) return alert('Podaj nazwę, składniki i kroki.');
  const r = {
    id: 'c-' + uid(), name, posilki: [v('cm')], porcje: Math.max(1, Number(v('cp')) || 1), czas: Math.max(1, Number(v('ct')) || 10),
    urz: v('cu') ? [v('cu')] : [], kcal: 0, opis: 'Własny przepis.', skladniki: skl, kroki,
  };
  state.recipes.push(r);
  ku.form = false; ku.rid = r.id; ku.port = r.porcje; ku.flash = 'Przepis zapisany. Sprawdź ocenę składników poniżej.';
  save(); render();
}

if (typeof module !== 'undefined') module.exports = { ku };
