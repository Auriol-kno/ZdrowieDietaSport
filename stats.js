// Statystyki dla rodzica: kalorie, ciągłość diety, woda, aktywność, jakość wpisów.
const st = { range: 14 };

function ruleSt(name) {
  if (typeof ku === 'undefined' || !ku.idx) return null;
  const m = ZdsRecipes.matchRule(ku.idx, name);
  return m ? m.st : null;
}

function statsData(pid, n) {
  const out = [];
  const t = dayKey();
  for (let i = n - 1; i >= 0; i--) {
    const iso = ZdsRecipes.dayAfter(t, -i);
    const d = state.days[iso + '|' + pid] || null;
    const r = { iso, has: false, kcal: 0, done: 0, water: 0, act: 0, items: 0, kid: 0, ok: 0, lim: 0, no: 0, unk: 0, bad: [] };
    if (d) {
      r.kcal = eatenKcal(d);
      r.water = (d.water || 0) * GLASS_ML;
      r.act = (d.activities || []).reduce((a, x) => a + (Number(x.min) || 0), 0);
      for (const [mk] of MEALS) {
        const m = d.meals[mk];
        if (!m) continue;
        if (m.done) r.done++;
        for (const it of m.items || []) {
          r.items++; if (it.kid) r.kid++;
          const s = ruleSt(it.name);
          if (s) r[s]++; else r.unk++;
          if (s === 'no') r.bad.push(it.name);
        }
      }
      for (const x of d.drinks || []) {
        if (x.kid) r.kid++;
        const s = ruleSt(x.name);
        if (s === 'no') { r.no++; r.bad.push(x.name); }
      }
      r.has = r.done > 0 || r.items > 0 || r.water > 0 || r.act > 0 || (d.drinks || []).length > 0;
    }
    r.good = r.done === MEALS.length && r.no === 0;
    out.push(r);
  }
  return out;
}

function streaks(rows) {
  let best = 0, run = 0;
  for (const r of rows) { run = r.good ? run + 1 : 0; best = Math.max(best, run); }
  let curr = 0;
  // dzisiejszy dzień jeszcze trwa, więc nie przerywa serii
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].good) curr++;
    else if (i === rows.length - 1) continue;
    else break;
  }
  return { best, curr };
}

function statsCard() {
  const p = cur(), rows = statsData(p.id, st.range), used = rows.filter((r) => r.has);
  const n = used.length || 1;
  const avg = (f) => Math.round(used.reduce((a, r) => a + f(r), 0) / n);
  const s = streaks(rows);
  const goal = p.kcal || 0;
  const inGoal = goal ? used.filter((r) => r.kcal && Math.abs(r.kcal - goal) <= goal * 0.1).length : 0;
  const mealsPct = used.length ? Math.round(used.reduce((a, r) => a + r.done, 0) / (used.length * MEALS.length) * 100) : 0;
  const waterDays = used.filter((r) => r.water >= WATER_GOAL * GLASS_ML).length;
  const actTot = rows.reduce((a, r) => a + r.act, 0), actDays = rows.filter((r) => r.act > 0).length;
  const q = rows.reduce((a, r) => ({ ok: a.ok + r.ok, lim: a.lim + r.lim, no: a.no + r.no, unk: a.unk + r.unk, kid: a.kid + r.kid }), { ok: 0, lim: 0, no: 0, unk: 0, kid: 0 });
  const bad = [...new Set(rows.flatMap((r) => r.bad))];
  const max = Math.max(goal * 1.2, ...rows.map((r) => r.kcal), 1);

  let h = `<div class="card stats"><div class="row sb"><h2>Statystyki: ${esc(p.name)}</h2></div><div class="chips">` +
    [7, 14, 30].map((v) => `<button type="button" class="chip" data-action="st-range" data-v="${v}" aria-pressed="${st.range === v}">${v} dni</button>`).join('') + '</div>';
  if (!used.length) return h + '<p class="muted">Brak wpisów w tym okresie. Statystyki pojawią się, gdy zaczniecie zapisywać posiłki.</p></div>';

  h += '<div class="kpis">' +
    kpi('Seria dni zgodnych z dietą', s.curr + ' dni', 'najdłuższa: ' + s.best) +
    kpi('Śr. kalorie', avg((r) => r.kcal) + ' kcal', goal ? `cel ${goal} · w normie ${inGoal}/${used.length} dni` : 'brak celu') +
    kpi('Regularność posiłków', mealsPct + '%', `śr. ${(used.reduce((a, r) => a + r.done, 0) / n).toFixed(1)} z ${MEALS.length} dziennie`) +
    kpi('Woda', (avg((r) => r.water) / 1000).toFixed(1) + ' l', `2 l w ${waterDays}/${used.length} dni`) +
    kpi('Aktywność', actTot + ' min', `${actDays} dni aktywnych · śr. ${Math.round(actTot / st.range)} min/dzień`) +
    kpi('Wpisy syna', String(q.kid), 'dania i napoje dopisane samodzielnie') + '</div>';

  h += `<h3>Kalorie dzień po dniu</h3><div class="bars" role="img" aria-label="Kalorie z ostatnich ${st.range} dni">` +
    (goal ? `<span class="goal" style="bottom:${(goal / max * 100).toFixed(1)}%"></span>` : '') +
    rows.map((r) => {
      const cls = !r.kcal ? 'empty' : goal && r.kcal > goal * 1.1 ? 'over' : goal && r.kcal < goal * 0.8 ? 'under' : 'okk';
      return `<span class="bar ${cls}${isWeekend(r.iso) ? ' we' : ''}" title="${r.iso}: ${r.kcal} kcal"><i style="height:${Math.max(r.kcal / max * 100, r.kcal ? 4 : 0).toFixed(1)}%"></i><b>${Number(r.iso.slice(8))}</b></span>`;
    }).join('') + '</div><p class="muted small">Zielone: w normie · bursztynowe: poniżej 80% celu · czerwone: powyżej 110% celu. Liczą się posiłki oznaczone jako zjedzone.</p>';

  h += '<h3>Ciągłość (5 posiłków i nic zakazanego)</h3><div class="streak">' +
    rows.map((r) => `<span class="${r.good ? 'g' : r.has ? 'p' : ''}" title="${r.iso}: ${r.done}/${MEALS.length} posiłków${r.no ? ', zakazane: ' + r.no : ''}">${Number(r.iso.slice(8))}</span>`).join('') + '</div>';

  const tot = q.ok + q.lim + q.no + q.unk || 1;
  h += '<h3>Co było jedzone</h3><div class="qbar">' +
    [['ok', q.ok], ['lim', q.lim], ['no', q.no], ['unk', q.unk]].map(([k, v]) => v ? `<i class="${k}" style="width:${(v / tot * 100).toFixed(1)}%"></i>` : '').join('') + '</div>' +
    `<div class="row wrap small"><span class="pill ok tiny">Dozwolone ${q.ok}</span><span class="pill lim tiny">Ograniczone ${q.lim}</span><span class="pill no tiny">Zakazane ${q.no}</span><span class="pill tiny">Spoza listy ${q.unk}</span></div>` +
    (bad.length ? `<div class="note warn">Zakazane w tym okresie: ${esc(bad.join(', '))}.</div>` : '');
  return h + '</div>';
}

function kpi(label, val, sub) {
  return `<div class="kpi"><span class="muted">${esc(label)}</span><strong>${esc(val)}</strong><span class="muted small">${esc(sub)}</span></div>`;
}
