// Kopie zapasowe: do pliku na telefonie i do bazy (Supabase). Przed każdym przywróceniem
// aplikacja sama zapisuje kopię bezpieczeństwa obecnych danych, więc przywrócenie można cofnąć.
/* global state, su, save, render, esc, askConfirm, runSync, ZdsSync, KEY */

const BK = { list: undefined, missing: false, msg: '', err: false, busy: false, preview: null };
const SAFE = 'zds.v1.przed-przywroceniem';

const bkStamp = (d = new Date()) => d.toLocaleString('sv-SE').slice(0, 16).replace(' ', '-').replace(':', '');
const bkWhen = (iso) => new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const bkDevice = () => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'przeglądarka');

function backupPayload() {
  // Hasło do logowania nie trafia do kopii (jest trzymane osobno).
  return { app: 'ZdrowieDietaSport', format: 1, createdAt: new Date().toISOString(), device: bkDevice(), state: JSON.parse(JSON.stringify(state)) };
}
function bkSummary(st) {
  const days = Object.keys(st.days || {}), photos = days.reduce((a, k) => a + Object.values((st.days[k] || {}).meals || {}).reduce((b, m) => b + (m ? (m.photos ? m.photos.length : 0) + (m.photo ? 1 : 0) : 0), 0), 0);
  const dates = days.map((k) => k.slice(0, 10)).sort();
  return { profiles: (st.profiles || []).map((p) => p.name).join(', '), days: days.length, from: dates[0], to: dates[dates.length - 1],
    plan: Object.keys(st.plan || {}).length, recipes: (st.recipes || []).length, photos };
}
function bkValid(o) { return o && o.app === 'ZdrowieDietaSport' && o.state && Array.isArray(o.state.profiles) && typeof o.state.days === 'object'; }

// ---------- plik ----------
async function backupDownload() {
  const p = backupPayload(), name = `zdrowie-dieta-kopia-${bkStamp()}.json`;
  const file = new File([JSON.stringify(p)], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kopia zapasowa ZdrowieDietaSport' }); BK.msg = `Kopia ${name} gotowa. Zapisz ją w Plikach albo wyślij sobie mailem.`; BK.err = false; render(); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  BK.msg = `Pobrano kopię ${name}.`; BK.err = false; render();
}
function backupPickFile() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none'; document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!bkValid(o)) throw new Error('To nie jest kopia ZdrowieDietaSport.');
      BK.preview = { data: o, source: 'plik ' + f.name }; BK.msg = ''; BK.err = false;
    } catch (e) { BK.preview = null; BK.msg = 'Nie udało się wczytać kopii: ' + (e.message || e); BK.err = true; }
    render();
  }, { once: true });
  inp.click();
}

// ---------- przywracanie ----------
async function backupRestore(o, source) {
  const s = bkSummary(o.state);
  const yes = await askConfirm({ title: `Przywrócić kopię z ${bkWhen(o.createdAt)}?`,
    text: `Dane na tym telefonie zostaną zastąpione kopią (${s.days} dni, ${s.recipes} przepisów, plan: ${s.plan} pozycji). Obecne dane zapiszemy najpierw jako kopię bezpieczeństwa, więc przywrócenie można cofnąć. Po synchronizacji kopia trafi też do rodziny.`, yes: 'Przywróć' });
  if (!yes) return;
  try { localStorage.setItem(SAFE, JSON.stringify({ at: new Date().toISOString(), state })); }
  catch (e) { BK.msg = 'Brak miejsca na kopię bezpieczeństwa, przywracanie przerwane. Najpierw pobierz kopię obecnych danych do pliku.'; BK.err = true; return render(); }
  applyState(o.state);
  BK.preview = null; BK.msg = `Przywrócono kopię z ${bkWhen(o.createdAt)} (${source}). Jeśli coś się nie zgadza, użyj „Cofnij przywrócenie”.`; BK.err = false;
  render();
  if (state.fam && su.session) runSync(false).catch(() => {});
}
function applyState(ns) {
  const keepFam = state.fam, keepTheme = state.theme;
  const now = Date.now();
  // nowsze znaczniki czasu: przywrócone dni wygrywają przy synchronizacji z rodziną
  for (const d of Object.values(ns.days || {})) if (d) d.u = now;
  ns.famBase = {}; ns.synced = {};
  ns.plan = ns.plan || {}; ns.pantry = ns.pantry || []; ns.shop = ns.shop || { checked: {} }; ns.shop.checked = ns.shop.checked || {}; ns.recipes = ns.recipes || []; ns.days = ns.days || {};
  if (keepFam) ns.fam = keepFam;
  if (!ns.theme && keepTheme) ns.theme = keepTheme;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, ns);
  save(true);
}
async function backupUndo() {
  let o; try { o = JSON.parse(localStorage.getItem(SAFE) || 'null'); } catch (e) { o = null; }
  if (!o) return;
  const yes = await askConfirm({ title: 'Cofnąć przywrócenie?', text: `Wrócą dane sprzed przywrócenia (${bkWhen(o.at)}).`, yes: 'Cofnij' });
  if (!yes) return;
  applyState(o.state); localStorage.removeItem(SAFE);
  BK.msg = 'Cofnięto przywrócenie.'; BK.err = false; render();
  if (state.fam && su.session) runSync(false).catch(() => {});
}

// ---------- baza ----------
async function backupRefresh() {
  if (!(state.fam && su.session && ZdsSync.enabled())) { BK.list = undefined; return; }
  try { const l = await ZdsSync.backupList(state.fam.id); BK.missing = l === null; BK.list = l || []; }
  catch (e) { BK.list = []; BK.msg = 'Nie udało się pobrać listy kopii: ' + (e.message || e); BK.err = true; }
}
async function backupToDb() {
  BK.busy = true; render();
  try {
    const r = await ZdsSync.backupSave(state.fam.id, backupPayload(), 'ręczna', bkDevice());
    BK.msg = `Zapisano kopię w bazie (${bkWhen(r.created_at)}).`; BK.err = false;
  } catch (e) { BK.msg = /family_backups|schema cache/i.test(e.message || '') ? 'Najpierw uruchom w Supabase plik supabase/migracja-3-kopie-zapasowe.sql.' : 'Nie udało się zapisać kopii: ' + (e.message || e); BK.err = true; }
  await backupRefresh(); BK.busy = false; render();
}
async function backupFromDb(id) {
  BK.busy = true; render();
  try {
    const r = await ZdsSync.backupGet(id);
    if (!bkValid(r.data)) throw new Error('Kopia jest uszkodzona.');
    BK.busy = false; render();
    await backupRestore(r.data, 'baza');
  } catch (e) { BK.busy = false; BK.msg = 'Nie udało się przywrócić: ' + (e.message || e); BK.err = true; render(); }
}
async function backupDelDb(id) {
  const yes = await askConfirm({ title: 'Usunąć tę kopię z bazy?', text: 'Dane w aplikacji się nie zmienią, zniknie tylko ta kopia.', yes: 'Usuń' });
  if (!yes) return;
  try { await ZdsSync.backupDelete(id); } catch (e) { BK.msg = 'Nie udało się usunąć: ' + (e.message || e); BK.err = true; }
  await backupRefresh(); render();
}

function backupCard() {
  const online = state.fam && su.session && typeof ZdsSync !== 'undefined' && ZdsSync.enabled();
  if (online && BK.list === undefined && !BK.busy) { BK.list = null; backupRefresh().then(render); }
  let undo = null; try { undo = JSON.parse(localStorage.getItem(SAFE) || 'null'); } catch (e) { undo = null; }
  let h = '<div class="card backup"><h2>Kopia zapasowa</h2>' +
    '<p class="muted small">Kopia zawiera profile, wszystkie dni (posiłki, wodę, napoje, ruch, zdjęcia), plan, przepisy, zakupy, monetki i ustawienia. Hasła do logowania w niej nie ma.</p>';
  if (BK.msg) h += `<p class="note small${BK.err ? ' warn' : ''}" role="status">${esc(BK.msg)}</p>`;
  if (BK.preview) {
    const s = bkSummary(BK.preview.data.state);
    h += `<div class="bk-preview"><strong>Kopia z ${bkWhen(BK.preview.data.createdAt)}</strong><span>${esc(BK.preview.source)} · ${esc(BK.preview.data.device || '')}</span>` +
      `<span>Profile: ${esc(s.profiles)} · dni: ${s.days}${s.from ? ` (${s.from.slice(8)}.${s.from.slice(5, 7)}–${s.to.slice(8)}.${s.to.slice(5, 7)})` : ''} · plan: ${s.plan} · przepisy: ${s.recipes} · zdjęcia: ${s.photos}</span>` +
      '<div class="row wrap"><button type="button" data-action="bk-restore-file">Przywróć z tej kopii</button><button type="button" class="ghost" data-action="bk-cancel">Anuluj</button></div></div>';
  }
  h += '<h3>Na telefonie (plik)</h3><div class="row wrap"><button type="button" data-action="bk-download">Pobierz kopię do pliku</button><button type="button" class="ghost" data-action="bk-pick">Wgraj kopię z pliku</button></div>';
  h += '<h3>W bazie rodziny</h3>';
  if (!online) h += '<p class="muted small">Zaloguj się w Synchronizacji, żeby zapisywać kopie w bazie.</p>';
  else if (BK.missing) h += '<p class="note warn small">Kopie w bazie wymagają jednorazowego uruchomienia w Supabase pliku <strong>supabase/migracja-3-kopie-zapasowe.sql</strong>. Ta migracja tylko dodaje nową tabelę, istniejących danych nie zmienia.</p>';
  else {
    h += `<button type="button" data-action="bk-db-save"${BK.busy ? ' disabled' : ''}>${BK.busy ? 'Pracuję…' : 'Zapisz kopię w bazie teraz'}</button>`;
    if (BK.list === null) h += '<p class="muted small">Wczytuję listę kopii…</p>';
    else if (BK.list && BK.list.length) h += '<ul class="bk-list">' + BK.list.map((b) => `<li><span><strong>${bkWhen(b.created_at)}</strong><em>${esc(b.device || '')} · ${Math.max(1, Math.round(b.size_bytes / 1024))} KB</em></span>` +
      `<button type="button" class="small" data-action="bk-db-restore" data-id="${b.id}">Przywróć</button><button type="button" class="small ghost" data-action="bk-db-del" data-id="${b.id}" aria-label="Usuń kopię z ${bkWhen(b.created_at)}">✕</button></li>`).join('') + '</ul>';
    else h += '<p class="muted small">Brak kopii w bazie.</p>';
  }
  if (undo) h += `<p class="muted small">Kopia bezpieczeństwa sprzed ostatniego przywrócenia: ${bkWhen(undo.at)}</p><button type="button" class="ghost" data-action="bk-undo">Cofnij przywrócenie</button>`;
  return h + '</div>';
}

function backupAction(a, t) {
  if (a === 'bk-download') { backupDownload(); return true; }
  if (a === 'bk-pick') { backupPickFile(); return true; }
  if (a === 'bk-cancel') { BK.preview = null; render(); return true; }
  if (a === 'bk-restore-file') { if (BK.preview) backupRestore(BK.preview.data, BK.preview.source); return true; }
  if (a === 'bk-db-save') { backupToDb(); return true; }
  if (a === 'bk-db-restore') { backupFromDb(t.dataset.id); return true; }
  if (a === 'bk-db-del') { backupDelDb(t.dataset.id); return true; }
  if (a === 'bk-undo') { backupUndo(); return true; }
  return false;
}
