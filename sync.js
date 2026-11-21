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
    return { pulled, pushed, members: st.profiles.length };
  }

  return {
    enabled, init, session, signIn, verifyCode, signOut, myMembership, createFamily, familyPreview, joinFamily,
    inviteCode, newInviteCode, pushMember, removeMember, syncAll,
    mergeMembers, dayRowsToPush, applyRemoteDays,
    _setClient: (c) => { sb = c; }, // tylko do testów
  };
})();

if (typeof module !== 'undefined') module.exports = ZdsSync;
