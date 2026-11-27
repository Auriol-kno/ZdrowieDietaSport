// Czat rodzinny (pastylka obok synchronizacji) i poglądowy kalendarz miesiąca (klik w datę w nagłówku).
// Wiadomości jadą razem ze wspólnymi danymi rodziny (family_data → prof, wpisy „_m_<id>”), więc nie trzeba nowej tabeli.
/* global state, su, save, render, esc, cur, isKid, uid, runSync, askConfirm, MEALS, WATER_GOAL, dayKey, coinMark, kidProfile */

const CHAT_MAX = 200;
const chatList = () => (state.chat || []).slice().sort((a, b) => a.t - b.t);
const chatMe = () => { const p = cur(); return p.remoteId || p.id; };
function chatUnread() {
  const seen = state.chatSeen || 0, me = chatMe();
  return chatList().filter((m) => m.t > seen && m.from !== me && !m.del).length;
}
function chatPill() {
  const n = chatUnread(), kid = isKid();
  const badge = n ? `<b class="${kid ? '' : 'alert'}" aria-hidden="true">${kid ? (n > 9 ? '9+' : n) : '!'}</b>` : '';
  return `<button type="button" class="chatpill${n ? ' new' : ''}" data-action="chat-open" aria-label="Czat z rodziną${n ? `, nowe wiadomości: ${n}` : ''}">` +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>' + badge + '</button>';
}

const QUICK_KID = ['Zjadłem 👍', 'Jestem głodny', 'Co dziś na obiad?', 'Wypiłem wodę 💧', 'Idę na trening'];
const QUICK_PAR = ['Brawo! 👏', 'Pamiętaj o wodzie 💧', 'Obiad w lodówce', 'Zrób zdjęcie posiłku 📷', 'Kocham Cię ❤️'];
let chatEl = null, chatPoll = null, chatSel = null, chatUndo = null, chatFitOff = null;

function chatWhen(t) {
  const d = new Date(t), today = dayKey() === d.toLocaleDateString('sv-SE');
  return today ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}
function chatBody() {
  const me = chatMe(), list = chatList();
  if (!list.length) return '<p class="chat-empty">Napisz pierwszą wiadomość. Rodzice zobaczą ją z wykrzyknikiem przy czacie.</p>';
  let prevDay = '';
  return list.map((m) => {
    const dd = new Date(m.t).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
    const sep = dd !== prevDay ? `<div class="chat-day">${esc(dd)}</div>` : ''; prevDay = dd;
    const mine = m.from === me;
    if (m.del) return sep + `<div class="msg gone${mine ? ' me' : ''}"><p>${mine ? 'Usunięto Twoją wiadomość' : `${esc(m.name || '')} usunął(-ęła) wiadomość`}</p><time>${chatWhen(m.t)}</time></div>`;
    // Usuwać można tylko własne wiadomości: dotknięcie dymka pokazuje „Usuń”, potem potwierdzenie i 10 s na cofnięcie.
    const open = mine && chatSel === m.id;
    return sep + `<div class="msg${mine ? ' me' : ''}${m.role === 'dziecko' ? ' kid' : ''}${open ? ' sel' : ''}"${mine ? ` data-c="sel" data-id="${esc(m.id)}" role="button" tabindex="0" aria-expanded="${open}" aria-label="Twoja wiadomość: ${esc(m.text)}. Dotknij, żeby usunąć."` : ''}>` +
      `${mine ? '' : `<span class="who">${esc(m.name || '')}</span>`}<p>${esc(m.text)}</p><time>${chatWhen(m.t)}</time></div>` +
      (open ? `<div class="msg-act"><button type="button" class="small ghost" data-c="nosel">Anuluj</button><button type="button" class="small danger" data-c="del" data-id="${esc(m.id)}">Usuń wiadomość</button></div>` : '');
  }).join('');
}
function chatRefresh() {
  if (!chatEl) return;
  const box = chatEl.querySelector('.chat-list'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const html = chatBody();
  if (box.dataset.h !== html) { const top = box.scrollTop; box.innerHTML = html; box.dataset.h = html; box.scrollTop = atEnd ? box.scrollHeight : top; }
  const u = chatEl.querySelector('.chat-undo');
  u.hidden = !chatUndo;
  if (chatUndo) u.innerHTML = '<span>Wiadomość usunięta</span><button type="button" class="small" data-c="undo">Cofnij</button>';
  state.chatSeen = Date.now(); save(true);
  const st = chatEl.querySelector('.chat-state');
  const online = state.fam && su.session;
  st.textContent = online ? (su.busy ? 'Łączę…' : 'Wiadomości docierają do całej rodziny') : 'Bez połączenia z rodziną: wiadomości zostaną na tym telefonie';
}
function chatSend(text) {
  text = String(text || '').trim().slice(0, 500);
  if (!text) return;
  const p = cur();
  state.chat = (state.chat || []).concat({ id: uid() + Date.now().toString(36), t: Date.now(), from: chatMe(), name: p.nick || p.name, role: p.role, text });
  if (state.chat.length > CHAT_MAX) state.chat = chatList().slice(-CHAT_MAX);
  save(true);
  chatRefresh();
  const box = chatEl && chatEl.querySelector('.chat-list'); if (box) box.scrollTop = box.scrollHeight;
  if (state.fam && su.session && !su.busy) runSync(true).then(chatRefresh).catch(() => {});
}
function chatOpen() {
  if (chatEl) return;
  const prev = document.activeElement, kid = isKid();
  chatEl = document.createElement('div'); chatEl.className = 'sheetbg';
  chatEl.innerHTML = '<div class="sheet chat" role="dialog" aria-modal="true" aria-labelledby="chat-t">' +
    '<div class="sheet-h"><div><h2 id="chat-t">Czat rodzinny</h2><span class="chat-state small muted"></span></div><button type="button" class="xbtn small ghost" data-c="close" aria-label="Zamknij czat">✕</button></div>' +
    '<div class="chat-list" aria-live="polite"></div><div class="chat-undo" role="status" hidden></div>' +
    '<div class="chat-quick">' + (kid ? QUICK_KID : QUICK_PAR).map((q) => `<button type="button" class="chip" data-c="q">${esc(q)}</button>`).join('') + '</div>' +
    '<form class="chat-form"><label class="sr" for="chat-in">Wiadomość</label><input id="chat-in" type="text" maxlength="500" placeholder="Napisz wiadomość…" autocomplete="off" enterkeyhint="send">' +
    '<button type="submit" aria-label="Wyślij"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-2.5-6.5z"/></svg></button></form></div>';
  const close = () => {
    clearInterval(chatPoll); chatPoll = null; chatSel = null; chatUndoEnd(); if (chatFitOff) { chatFitOff(); chatFitOff = null; } document.removeEventListener('keydown', onKey);
    chatEl.remove(); chatEl = null; document.body.classList.remove('noscroll'); render();
    if (prev && prev.focus && document.contains(prev)) prev.focus(); else { const b = document.querySelector('.chatpill'); if (b) b.focus(); }
  };
  const onKey = (e) => {
    if (document.querySelector('.askbg')) return;   // otwarte potwierdzenie ma pierwszeństwo
    if (e.key === 'Escape') { if (chatSel) { chatSel = null; chatRefresh(); } else close(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.msg[data-c="sel"]')) { e.preventDefault(); e.target.click(); }
  };
  chatEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === chatEl) return close();
    const b = e.target.closest('[data-c]'); if (!b) return;
    if (b.dataset.c === 'close') close();
    else if (b.dataset.c === 'q') chatSend(b.textContent);
    else if (b.dataset.c === 'sel') { chatSel = chatSel === b.dataset.id ? null : b.dataset.id; chatRefresh(); }
    else if (b.dataset.c === 'nosel') { chatSel = null; chatRefresh(); }
    else if (b.dataset.c === 'del') chatDelete(b.dataset.id);
    else if (b.dataset.c === 'undo') chatRestore();
  });
  chatEl.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const i = chatEl.querySelector('#chat-in'); chatSend(i.value); i.value = ''; i.focus(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(chatEl); document.body.classList.add('noscroll');
  // Klawiatura telefonu zmniejsza widoczny obszar: dopasowujemy okno czatu, żeby pole pisania było zawsze widać.
  const vv = window.visualViewport;
  const fit = () => {
    if (!chatEl || !vv) return;
    const kb = window.innerHeight - vv.height > 120;
    chatEl.style.top = vv.offsetTop + 'px'; chatEl.style.height = vv.height + 'px'; chatEl.style.bottom = 'auto';
    chatEl.classList.toggle('kb', kb);
    const box = chatEl.querySelector('.chat-list'); if (box) box.scrollTop = box.scrollHeight;
  };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
  chatFitOff = () => { if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); } };
  chatRefresh();
  const box = chatEl.querySelector('.chat-list'); box.scrollTop = box.scrollHeight;
  chatEl.querySelector('#chat-in').focus({ preventScroll: true });
  if (state.fam && su.session) {
    const pull = () => { if (!su.busy && !document.hidden) runSync(true).then(chatRefresh).catch(() => {}); };
    pull(); chatPoll = setInterval(pull, 8000);
  }
}

function chatPush() { save(true); if (state.fam && su.session && !su.busy) runSync(true).then(chatRefresh).catch(() => {}); }
async function chatDelete(id) {
  const m = (state.chat || []).find((x) => x.id === id);
  if (!m || m.from !== chatMe() || m.del) return;   // tylko własne wiadomości
  const yes = await askConfirm({ title: 'Usunąć tę wiadomość?', text: `„${m.text.length > 80 ? m.text.slice(0, 80) + '…' : m.text}”\nZniknie u całej rodziny. Przez 10 sekund możesz to cofnąć.`, yes: 'Usuń' });
  if (!yes || !chatEl) return;
  chatUndoEnd();
  chatUndo = { id, text: m.text, timer: setTimeout(() => { chatUndo = null; chatRefresh(); }, 10000) };
  m.del = Date.now(); m.text = ''; chatSel = null;
  chatRefresh(); chatPush();
}
function chatRestore() {
  if (!chatUndo) return;
  const m = (state.chat || []).find((x) => x.id === chatUndo.id);
  if (m) { m.text = chatUndo.text; delete m.del; }
  chatUndoEnd(); chatRefresh(); chatPush();
}
function chatUndoEnd() { if (chatUndo) clearTimeout(chatUndo.timer); chatUndo = null; }

// ---------- poglądowy kalendarz miesiąca ----------
let calEl = null, calMonth = '';
function calHtml() {
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), lead = (first.getDay() + 6) % 7, total = new Date(y, m, 0).getDate(), today = dayKey(), p = cur();
  const pad = (n) => String(n).padStart(2, '0');
  let coins = 0, full = 0, water = 0, h = '<div class="pk-grid">' + ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map((n, i) => `<span class="pk-h${i > 4 ? ' we' : ''}">${n}</span>`).join('');
  for (let i = 0; i < lead; i++) h += '<span></span>';
  for (let d = 1; d <= total; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`, fut = iso > today, dd = state.days[iso + '|' + p.id];
    const done = dd ? MEALS.filter(([k]) => dd.meals && dd.meals[k] && dd.meals[k].done).length : 0;
    const wOk = dd && (dd.water || 0) >= WATER_GOAL, pct = Math.round((done / MEALS.length) * 100);
    const coin = !fut && typeof coinMark === 'function' ? coinMark(iso) : '';
    if (coin) coins++; if (done === MEALS.length) full++; if (wOk) water++;
    h += `<div class="pk-day${fut ? ' fut' : ''}${iso === today ? ' today' : ''}" style="--p:${pct}" aria-label="${d}. dzień: posiłki ${done} z ${MEALS.length}${wOk ? ', woda wypita' : ''}${coin ? ', moneta' : ''}">` +
      `<span class="pk-ring"><b>${d}</b></span><span class="pk-dots">${MEALS.map((_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>` +
      `${wOk ? '<em class="pk-w" aria-hidden="true"></em>' : ''}${coin}</div>`;
  }
  h += '</div>';
  const title = first.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return '<div class="sheet-h"><div><h2 id="pk-t">' + esc(title.charAt(0).toUpperCase() + title.slice(1)) + `</h2><span class="small muted">${esc(p.nick || p.name)} · podgląd</span></div>` +
    '<button type="button" class="xbtn small ghost" data-c="close" aria-label="Zamknij kalendarz">✕</button></div>' +
    '<div class="row sb pk-nav"><button type="button" class="small ghost" data-c="prev" aria-label="Poprzedni miesiąc">‹</button>' +
    `<div class="pk-sum"><span><i class="coin on mini">${(typeof rw === 'function' ? rw().perDay : 2)}</i> ${coins}</span><span><i class="pk-full"></i> ${full} pełnych dni</span><span><em class="pk-w"></em> ${water} dni z wodą</span></div>` +
    '<button type="button" class="small ghost" data-c="next" aria-label="Następny miesiąc">›</button></div>' + h +
    '<p class="pk-leg small muted"><span class="pk-dots"><i class="on"></i><i class="on"></i><i></i></span> zjedzone posiłki · <em class="pk-w"></em> 2 l wody · <i class="coin on mini">2</i> moneta</p>';
}
function calOpen() {
  if (calEl) return;
  const prev = document.activeElement;
  calMonth = dayKey().slice(0, 7);
  calEl = document.createElement('div'); calEl.className = 'sheetbg';
  calEl.innerHTML = `<div class="sheet peek" role="dialog" aria-modal="true" aria-labelledby="pk-t">${calHtml()}</div>`;
  const close = () => { document.removeEventListener('keydown', onKey); calEl.remove(); calEl = null; document.body.classList.remove('noscroll'); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  calEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target === calEl) return close();
    const b = e.target.closest('[data-c]'); if (!b) return;
    if (b.dataset.c === 'close') return close();
    const [y, m] = calMonth.split('-').map(Number), d = new Date(y, m - 1 + (b.dataset.c === 'next' ? 1 : -1), 1);
    calMonth = d.toLocaleDateString('sv-SE').slice(0, 7);
    calEl.querySelector('.sheet').innerHTML = calHtml();
    calEl.querySelector(`[data-c="${b.dataset.c}"]`).focus();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(calEl); document.body.classList.add('noscroll');
  calEl.querySelector('[data-c="close"]').focus();
}
