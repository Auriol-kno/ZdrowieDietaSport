// Monetki motywacyjne: za każdy dzień, w którym dziecko trzyma się zasad, dostaje monetę (domyślnie 2 zł).
// Ustawienia nagrody są wspólne dla rodziny (synchronizują się razem z profilami).
/* global state, MEALS, WATER_GOAL, GLASS_ML, dayKey, ZdsRecipes, ku, esc, isKid, save, render */

const RW_DEF = { perDay: 2, bonus: 5, crit: { meals: true, water: true, clean: true, move: true, photo: false }, paid: 0, start: '' };
function rw() {
  const r = state.reward || (state.reward = {});
  for (const k of Object.keys(RW_DEF)) if (r[k] === undefined) r[k] = k === 'crit' ? Object.assign({}, RW_DEF.crit) : RW_DEF[k];
  for (const k of Object.keys(RW_DEF.crit)) if (r.crit[k] === undefined) r.crit[k] = RW_DEF.crit[k];
  if (!r.start) r.start = dayKey();
  return r;
}
const kidProfile = () => state.profiles.find((p) => p.role === 'dziecko') || state.profiles[0];
const monday = (iso) => { const g = new Date(iso + 'T12:00:00').getDay(); return ZdsRecipes.dayAfter(iso, -((g + 6) % 7)); };

// Co jest spełnione danego dnia, a czego brakuje.
function dayCheck(pid, iso) {
  const r = rw(), d = state.days[iso + '|' + pid] || { meals: {}, water: 0 };
  const done = MEALS.filter(([k]) => d.meals[k] && d.meals[k].done).length;
  const water = (d.water || 0);
  let bad = false, photos = 0;
  for (const [k] of MEALS) {
    const m = d.meals[k]; if (!m) continue;
    photos += (Array.isArray(m.photos) ? m.photos.length : m.photo ? 1 : 0);
    for (const it of m.items || []) {
      if (it.prop) continue;
      const x = ku && ku.idx ? ZdsRecipes.matchRule(ku.idx, it.name) : null;
      if (x && x.st === 'no' && !x.amb) bad = true;
    }
  }
  const move = (d.activities || []).reduce((a, x) => a + (Number(x.min) || 0), 0);
  const steps = [];
  const left = MEALS.length - done, pl = left === 1 ? 'posiłek' : left < 5 ? 'posiłki' : 'posiłków';
  const litres = String(Math.round((WATER_GOAL - water) * GLASS_ML / 10) / 100).replace('.', ',');
  if (r.crit.meals) steps.push({ ok: done >= MEALS.length, label: '5 posiłków', miss: `${left} ${pl}` });
  if (r.crit.water) steps.push({ ok: water >= WATER_GOAL, label: '2 l wody', miss: `${litres} l wody` });
  if (r.crit.clean) steps.push({ ok: !bad, label: 'nic zakazanego', miss: 'coś zakazanego w posiłkach' });
  if (r.crit.move) steps.push({ ok: move >= 30, label: 'ruch 30 min', miss: `${Math.max(0, 30 - move)} min ruchu` });
  if (r.crit.photo) steps.push({ ok: photos > 0, label: 'zdjęcie dania', miss: 'zdjęcie dania' });
  return { good: steps.length > 0 && steps.every((s) => s.ok), steps, any: done > 0 || water > 0 || move > 0 };
}

function weekCoins(pid) {
  const t = dayKey(), m = monday(t), names = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];
  return names.map((label, i) => {
    const iso = ZdsRecipes.dayAfter(m, i);
    const st = iso > t ? 'future' : dayCheck(pid, iso).good ? 'on' : iso === t ? 'today' : 'miss';
    return { iso, label, st };
  });
}

function coinColumn(d) {
  const r = rw(), p = state.profiles.find((x) => x.id === state.current);
  const coins = weekCoins(p.id), n = coins.filter((c) => c.st === 'on').length;
  return `<div class="coinvial" role="img" aria-label="Monetki w tym tygodniu: ${n} z 7, ${n * r.perDay} zł">` +
    coins.map((c) => `<span class="coinwrap"><i class="coin ${c.st}" title="${c.label} ${c.iso.slice(8)}.${c.iso.slice(5, 7)}">${c.st === 'on' || c.st === 'today' ? r.perDay + '<small>zł</small>' : ''}</i><b>${c.label}</b></span>`).join('') + '</div>';
}

function todayCoinCard() {
  const r = rw(), p = state.profiles.find((x) => x.id === state.current), c = dayCheck(p.id, dayKey());
  if (!c.steps.length) return '';
  const miss = c.steps.filter((s) => !s.ok);
  if (!miss.length) return `<div class="coincard won"><i class="coin on big">${r.perDay}<small>zł</small></i><div><strong>Dzisiejsza moneta zdobyta!</strong><span>+${r.perDay} zł do skarbonki. Brawo!</span></div></div>`;
  return `<div class="coincard"><i class="coin today big">${r.perDay}<small>zł</small></i><div><strong>Dzisiejsza moneta: jeszcze ${miss.length} ${miss.length === 1 ? 'krok' : 'kroki'}</strong>` +
    `<span>${miss.map((s) => esc(s.miss)).join(' · ')}</span></div></div>`;
}

// Zarobki od początku (minus wypłacone), z bonusem za pełny tydzień.
function earnings(pid) {
  const r = rw(), t = dayKey();
  let days = 0, weeks = 0, total = 0, thisWeek = 0, month = 0;
  const wk = monday(t), mo = t.slice(0, 7);
  for (let iso = r.start; iso <= t; iso = ZdsRecipes.dayAfter(iso, 1)) {
    if (!dayCheck(pid, iso).good) continue;
    days++; total += r.perDay;
    if (iso >= wk) thisWeek += r.perDay;
    if (iso.slice(0, 7) === mo) month += r.perDay;
  }
  for (let m = monday(r.start); ZdsRecipes.dayAfter(m, 6) < t; m = ZdsRecipes.dayAfter(m, 7)) {
    let all = true; for (let i = 0; i < 7; i++) { const iso = ZdsRecipes.dayAfter(m, i); if (iso < r.start || !dayCheck(pid, iso).good) { all = false; break; } }
    if (all) { weeks++; total += r.bonus; if (ZdsRecipes.dayAfter(m, 6).slice(0, 7) === mo) month += r.bonus; }
  }
  return { days, weeks, total, toPay: Math.max(0, total - (r.paid || 0)), thisWeek, month };
}

function rewardCard() {
  const r = rw(), p = kidProfile(), e = earnings(p.id), t = dayKey();
  const last = []; for (let i = 1; i <= 5; i++) { const iso = ZdsRecipes.dayAfter(t, -i); if (iso < r.start) break; const c = dayCheck(p.id, iso); last.push({ iso, c }); }
  const C = [['meals', '5 posiłków oznaczonych jako zjedzone'], ['water', '2 l wody'], ['clean', 'nic zakazanego'], ['move', 'ruch co najmniej 30 min'], ['photo', 'zdjęcie dania']];
  return `<div class="card rewardcard"><div class="rw-top"><span>${esc(p.name)} zarobił</span><strong>${e.toPay} zł</strong><em>do wypłaty</em></div>` +
    `<div class="rw-kpis"><span><b>${e.thisWeek} zł</b>ten tydzień</span><span><b>${e.month} zł</b>ten miesiąc</span><span><b>${e.days}</b>dobrych dni</span></div>` +
    (e.toPay ? `<button type="button" class="rw-pay" data-action="rw-pay">Wypłacono ${e.toPay} zł: wyzeruj licznik</button>` : '') + '</div>' +
    '<div class="card"><h2>Zasady nagrody</h2><div class="grid">' +
    `<div class="field"><label for="rw-day" class="muted">Za dobry dzień (zł)</label><input type="number" id="rw-day" data-rw="perDay" min="0" max="100" step="0.5" inputmode="decimal" value="${r.perDay}"></div>` +
    `<div class="field"><label for="rw-bonus" class="muted">Bonus za 7 z 7 (zł)</label><input type="number" id="rw-bonus" data-rw="bonus" min="0" max="500" step="0.5" inputmode="decimal" value="${r.bonus}"></div></div>` +
    '<p class="muted small">Dzień się liczy, gdy:</p><div class="rw-crit">' +
    C.map(([k, n]) => `<label><input type="checkbox" data-rwc="${k}"${r.crit[k] ? ' checked' : ''}> ${n}</label>`).join('') + '</div>' +
    (last.length ? '<p class="muted small">Ostatnie dni</p><ul class="rw-last">' + last.map(({ iso, c }) => `<li><span>${iso.slice(8)}.${iso.slice(5, 7)}</span>` +
      (c.good ? `<b class="ok">+${r.perDay} zł · wszystko spełnione</b>` : `<b class="no">0 zł · ${esc(c.steps.filter((s) => !s.ok).map((s) => s.label).join(', ') || 'brak wpisów')}</b>`) + '</li>').join('') + '</ul>' : '') +
    `<p class="muted small">Liczymy od ${r.start.slice(8)}.${r.start.slice(5, 7)}.${r.start.slice(0, 4)}. Ustawienia są wspólne dla całej rodziny.</p></div>`;
}

function rewardAction(a) {
  const r = rw();
  if (a === 'rw-pay') { r.paid = (r.paid || 0) + earnings(kidProfile().id).toPay; save(); render(); return true; }
  return false;
}
function rewardChange(t) {
  const r = rw();
  if (t.dataset.rw) { r[t.dataset.rw] = Math.max(0, Number(t.value) || 0); save(); render(); return true; }
  if (t.dataset.rwc) { r.crit[t.dataset.rwc] = t.checked; save(); render(); return true; }
  return false;
}
