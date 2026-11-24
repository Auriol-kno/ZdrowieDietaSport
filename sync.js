'use strict';
// Synchronizacja z Supabase. Bez wypełnionego config.js aplikacja działa tylko lokalnie.
// Zasada: dane lokalne są źródłem na urządzeniu, serwer scala zmiany (nowszy wpis dnia wygrywa).

const ZdsSync = (() => {
  const cfg = (typeof window !== 'undefined' && window.ZDS_CONFIG) || {};
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  let sb = null;

  const normName = (s) => String(s).trim().toLowerCase();
  const enabled = () => Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  // Dane dnia, które się synchronizują. Napoje dołączamy tylko gdy są, żeby stare wpisy wyglądały jak dawniej.
  const core = (d) => {
    const o = { meals: (d && d.meals) || {}, water: (d && d.water) || 0 };
    if (d && Array.isArray(d.drinks) && d.drinks.length) o.drinks = d.drinks;
    if (d && Array.isArray(d.activities) && d.activities.length) o.activities = d.activities;
    return o;
  };
  const sameDay = (a, b) => JSON.stringify(core(a)) === JSON.stringify(core(b));

  // ---------- czysta logika scalania (testowalna bez sieci) ----------

  // Łączy profile lokalne z członkami rodziny z serwera. Serwer wygrywa w imieniu, roli i celu kcal.
  function mergeMembers(local, remote, mkId) {
    const byId = new Map(remote.map((m) => [m.id, m]));
    const linked = new Set();
    const profiles = [];
    const unlinked = [];
    const fromRemote = (p, m) => ({ ...p, remoteId: m.id, name: m.name, role: m.role, kcal: m.kcal_goal, userId: m.user_id });
    for (const p of local) {
      const m = p.remoteId && byId.get(p.remoteId);
      if (m) { linked.add(m.id); profiles.push(fromRemote(p, m)); }
      else if (!p.remoteId) unlinked.push(p);
      // profil z remoteId, którego nie ma już na serwerze, został tam usunięty: pomijamy
    }
    const toInsert = [];
    for (const p of unlinked) {
      const m = remote.find((r) => !linked.has(r.id) && normName(r.name) === normName(p.name));
      if (m) { linked.add(m.id); profiles.push(fromRemote(p, m)); }
      else { profiles.push(p); toInsert.push(p); }
    }
    for (const m of remote) {
      if (!linked.has(m.id)) profiles.push(fromRemote({ id: mkId() }, m));
    }
    return { profiles, toInsert };
  }

  // Dni lokalne zmienione od ostatniej synchronizacji, do wysłania.
  function dayRowsToPush(days, synced, profiles) {
    const out = [];
    for (const key of Object.keys(days)) {
      const [day, pid] = key.split('|');
      const p = profiles.find((x) => x.id === pid);
      const d = days[key];
      if (!p || !p.remoteId || !d.u || d.u <= (synced[key] || 0)) continue;
      out.push({ key, u: d.u, row: { member_id: p.remoteId, day, data: core(d) } });
    }
    return out;
  }

  // Nakłada dni z serwera. Nowszy wygrywa; identyczne dane nie zmieniają niczego. Zwraca liczbę zmian.
  function applyRemoteDays(days, synced, rows, profiles) {
    let changed = 0;
    for (const r of rows) {
      const p = profiles.find((x) => x.remoteId === r.member_id);
      if (!p) continue;
      const key = r.day + '|' + p.id;
      const ts = Date.parse(r.updated_at) || 0;
      const remote = core(r.data);
      const local = days[key];
      if (local && sameDay(local, remote)) { synced[key] = Math.max(synced[key] || 0, local.u || 0); continue; }
      if (!local || ts > (local.u || 0)) {
        days[key] = { ...remote, u: ts };
        synced[key] = ts;
        changed++;
      }
    }
    return changed;
  }

  // ---------- Supabase ----------

  function loadLib() {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.supabase) return resolve();
      const s = document.createElement('script');
      s.src = LIB; s.onload = resolve; s.onerror = () => reject(new Error('Nie udało się pobrać biblioteki Supabase (brak sieci?)'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (!enabled()) return false;
    if (!sb) {
      await loadLib();
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return true;
  }

  async function session() { return unwrap(await sb.auth.getSession()).session; }
  async function signIn(email) {
    unwrap(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
  }
  async function verifyCode(email, token) {
    unwrap(await sb.auth.verifyOtp({ email, token, type: 'email' }));
  }
  async function signUpPw(email, password) {
    const r = unwrap(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
    return Boolean(r && r.session);
  }
  async function signInPw(email, password) {
    unwrap(await sb.auth.signInWithPassword({ email, password }));
  }
  async function signOut() { await sb.auth.signOut(); }

  async function myMembership() {
    const s = await session();
    if (!s) return null;
    const rows = unwrap(await sb.from('members').select('id, family_id, role, name, families(name)').eq('user_id', s.user.id).limit(1));
    return rows[0] || null;
  }

  const createFamily = async (familyName, myName) => unwrap(await sb.rpc('create_family', { family_name: familyName, my_name: myName }));
  const familyPreview = async (code) => unwrap(await sb.rpc('family_preview', { code }));
  const joinFamily = async (code, myName, claimId) => unwrap(await sb.rpc('join_family', { code, my_name: myName, claim_member_id: claimId || null }));
  const inviteCode = async (fid) => unwrap(await sb.rpc('get_invite_code', { fid }));
  const newInviteCode = async (fid) => unwrap(await sb.rpc('regenerate_invite', { fid }));

  async function pushMember(fid, p) {
    const row = { family_id: fid, name: p.name, role: p.role, kcal_goal: p.kcal || 0 };
    if (p.remoteId) unwrap(await sb.from('members').update({ name: row.name, role: row.role, kcal_goal: row.kcal_goal }).eq('id', p.remoteId));
    else return unwrap(await sb.from('members').insert(row).select('id').single()).id;
    return p.remoteId;
  }
  async function removeMember(remoteId) { unwrap(await sb.from('members').delete().eq('id', remoteId)); }

  // Pełna synchronizacja. `app` to { state, mkId } z aplikacji; zwraca podsumowanie.
  async function syncAll(fid, myRole, app) {
    const st = app.state;
    st.synced = st.synced || {};
    const remote = unwrap(await sb.from('members').select('id, user_id, name, role, kcal_goal').eq('family_id', fid));
    const { profiles, toInsert } = mergeMembers(st.profiles, remote, app.mkId);
    st.profiles = profiles;
    if (myRole === 'rodzic') {
      for (const p of toInsert) {
        const target = st.profiles.find((x) => x.id === p.id);
        target.remoteId = await pushMember(fid, target);
      }
    }
    if (!st.profiles.some((p) => p.id === st.current)) st.current = st.profiles[0].id;

    const ids = st.profiles.filter((p) => p.remoteId).map((p) => p.remoteId);
    let pulled = 0, pushed = 0;
    if (ids.length) {
      const rows = unwrap(await sb.from('day_logs').select('member_id, day, data, updated_at').in('member_id', ids));
      pulled = applyRemoteDays(st.days, st.synced, rows, st.profiles);
      const up = dayRowsToPush(st.days, st.synced, st.profiles);
      for (const item of up) {
        unwrap(await sb.from('day_logs').upsert(item.row, { onConflict: 'member_id,day' }));
        st.synced[item.key] = item.u;
        pushed++;
      }
    }
    const fam = await syncFamily(fid, st);
    return { pulled, pushed, members: st.profiles.length, famMissing: fam.missing, famPushed: fam.pushed };
  }

  // ---------- wspólne dane rodziny: plan, własne przepisy, zakupy, spiżarnia, ustawienia profili ----------
  // Scalanie trójstronne na poziomie pozycji: lokalnie / ostatnio zsynchronizowane (base) / serwer.
  const J = (v) => JSON.stringify(v === undefined ? null : v);
  function mergeMap(local, base, remote, union) {
    const out = {}, keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {}), ...Object.keys(base || {})]);
    for (const k of keys) {
      const l = (local || {})[k], b = (base || {})[k], r = (remote || {})[k];
      let v;
      if (J(l) === J(r)) v = l;
      else if (J(l) === J(b)) v = r;          // zmiana tylko na serwerze
      else if (J(r) === J(b)) v = l;          // zmiana tylko lokalnie
      else if (union && Array.isArray(l) && Array.isArray(r)) {
        const seen = new Set(); v = [];
        for (const x of [...r, ...l]) { const s = J(x); if (!seen.has(s)) { seen.add(s); v.push(x); } }
      } else v = l;                            // konflikt: wygrywa ten telefon
      if (v !== undefined && v !== null) out[k] = v;
    }
    return out;
  }
  // Mapowanie stanu aplikacji na klucze w tabeli family_data.
  function famLocal(st) {
    const rec = {}; for (const r of st.recipes || []) rec[r.id] = r;
    const prof = {}; for (const p of st.profiles || []) if (p.remoteId) prof[p.remoteId] = { nick: p.nick || '', kg: Number(p.kg) || 0 };
    if (st.reward) prof._reward = st.reward;
    return { plan: st.plan || {}, recipes: rec, pantry: { list: st.pantry || [] }, shop: { checked: (st.shop && st.shop.checked) || {} }, prof };
  }
  function famApply(st, key, v) {
    if (key === 'plan') st.plan = v;
    else if (key === 'recipes') st.recipes = Object.values(v);
    else if (key === 'pantry') st.pantry = (v.list) || [];
    else if (key === 'shop') st.shop = Object.assign(st.shop || {}, { checked: v.checked || {} });
    else if (key === 'prof') {
      for (const p of st.profiles || []) if (p.remoteId && v[p.remoteId]) { p.nick = v[p.remoteId].nick || p.nick; if (v[p.remoteId].kg) p.kg = v[p.remoteId].kg; }
      if (v._reward) st.reward = v._reward;
    }
  }
  const FAM_KEYS = ['plan', 'recipes', 'pantry', 'shop', 'prof'];
  function mergeFamily(st, remoteRows) {
    st.famBase = st.famBase || {};
    const local = famLocal(st), remote = {}, toPush = [];
    for (const r of remoteRows || []) remote[r.key] = r.data || {};
    for (const key of FAM_KEYS) {
      const whole = key === 'pantry' || key === 'shop';
      const L = whole ? { _: local[key] } : local[key], B = whole ? { _: (st.famBase[key] || {})._ } : st.famBase[key] || {};
      const R0 = remote[key], R = whole ? (R0 ? { _: R0 } : {}) : R0 || {};
      let m = mergeMap(L, B, R, key === 'plan');
      if (key === 'plan') for (const k of Object.keys(m)) if (!m[k].length) delete m[k];
      const val = whole ? m._ || local[key] : m;
      famApply(st, key, val);
      if (J(val) !== J(R0)) toPush.push({ key, data: val });
      st.famBase[key] = whole ? { _: val } : JSON.parse(J(val));
    }
    return toPush;
  }
  async function syncFamily(fid, st) {
    let rows;
    try { rows = unwrap(await sb.from('family_data').select('key, data, updated_at').eq('family_id', fid)); }
    catch (e) {
      if (/family_data|schema cache|does not exist/i.test(e.message || '')) return { missing: true, pushed: 0 };
      throw e;
    }
    const up = mergeFamily(st, rows);
    for (const u of up) unwrap(await sb.from('family_data').upsert({ family_id: fid, key: u.key, data: u.data }, { onConflict: 'family_id,key' }));
    return { missing: false, pushed: up.length, pulled: (rows || []).length };
  }

  return {
    enabled, init, session, signIn, verifyCode, signUpPw, signInPw, signOut, myMembership, createFamily, familyPreview, joinFamily,
    inviteCode, newInviteCode, pushMember, removeMember, syncAll,
    mergeMembers, dayRowsToPush, applyRemoteDays, mergeMap, mergeFamily,
    _setClient: (c) => { sb = c; }, // tylko do testów
  };
})();

if (typeof module !== 'undefined') module.exports = ZdsSync;
