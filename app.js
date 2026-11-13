/* Magnus – Daily Companion – Oberfläche (reines JavaScript, keine Bibliotheken) */

// ---------------------------------------------------------------- Helfer
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const KINDS = { inbox: '📥 Inbox', aufgabe: '✅ Aufgabe', pflicht: '❗ Pflicht', idee: '💡 Idee', einkauf: '🛒 Einkauf', interesse: '📚 Interesse' };
const REPEAT = { none: 'keine', daily: 'täglich', weekdays: 'werktags (Mo–Fr)', weekly: 'wöchentlich', monthly: 'monatlich' };
const ENERGY = { niedrig: '🪫 wenig Energie', mittel: '🙂 normale Energie', hoch: '⚡ viel Energie' };
const MOODS = ['😫', '😕', '😐', '🙂', '😄'];
const nm = () => (S && S.settings.name) || '';
const say = key => Magnus.say(key, nm());

const store = {
  get(k, d) { try { const v = localStorage.getItem('dc_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dc_' + k, JSON.stringify(v)); } catch { /* egal */ } },
};

function toLocal(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDT(s) {
  if (!s) return null;
  const [d, t = '00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, h || 0, mi || 0);
}
function fmtDT(s) {
  const d = parseDT(s); if (!d) return '';
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
  const diff = Math.round((d0 - t0) / 86400000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let day;
  if (diff === 0) day = 'heute';
  else if (diff === 1) day = 'morgen';
  else if (diff === -1) day = 'gestern';
  else if (diff > 1 && diff < 7) day = WD[d.getDay()];
  else day = `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
  return `${day} ${time}`;
}
function fmtMin(m) { return m >= 60 ? `${Math.floor(m / 60)} Std${m % 60 ? ' ' + (m % 60) + ' Min' : ''}` : `${m} Min`; }
function tomorrowAt(h = 9) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return toLocal(d); }

const standalone = !!window.LocalAPI;   // eigenständige Handy-Version (ohne PC)
const isPC = !standalone && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(location.hostname);
async function api(method, url, body) {
  if (standalone) {
    try { return await LocalAPI.handle(method, url, body); }
    catch (e) { toast(e.message || Magnus.say('error'), 'alert'); throw e; }
  }
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', 'X-Magnus-PIN': store.get('pin', '') },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.pin) { askPin(); throw new Error('PIN'); }
  if (!res.ok) { toast(data.error || Magnus.say('error'), 'alert'); throw new Error(data.error || res.status); }
  return data;
}

let toastTimer;
function toast(msg, mood = 'happy') {
  const t = $('#toast'); t.innerHTML = `${Magnus.face(mood, 30)}<span>${esc(msg)}</span>`; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

let audioCtx;
function beep(times = 2) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.35;
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.32);
    }
  } catch { /* kein Ton möglich */ }
}

// ---------------------------------------------------------------- Zustand
let S = null;
let view = store.get('view', 'heute');
let projectFilter = '';
const wn = { open: false, energy: null, time: null, skip: [], line: '' };   // "Was jetzt?"
const F = { half: false, running: false, paused: false, total: 0, left: 0, endAt: 0, itemId: null, title: '', startedAt: null, minutes: null };
let review = null;   // Entwurf des Abend-Rückblicks
let greetLine = '', greetDay = '';

const openItems = () => S.items.filter(i => i.status === 'offen');
const isTask = i => i.kind === 'aufgabe' || i.kind === 'pflicht';
const tasks = () => openItems().filter(isTask);
const byId = id => S.items.find(i => i.id === id);
const kids = id => S.items.filter(i => i.parent_id === id);
const whenOf = i => i.due || i.remind_at;
const byWhen = (a, b) => (whenOf(a) || '9999').localeCompare(whenOf(b) || '9999') || b.priority - a.priority;

async function load() {
  S = await api('GET', '/api/state');
  render();
}

// ---------------------------------------------------------------- Bausteine
function itemRow(i, o = {}) {
  const done = i.status === 'erledigt';
  const chips = [];
  if (o.showKind && i.kind !== 'aufgabe') chips.push(`<span class="chip">${KINDS[i.kind] || i.kind}</span>`);
  if (i.kind === 'pflicht') chips.push('<span class="chip pflicht">Pflicht</span>');
  if (i.priority > 0) chips.push(`<span class="chip prio">${'!'.repeat(i.priority)} wichtig</span>`);
  if (i.project) chips.push(`<span class="chip proj">#${esc(i.project)}</span>`);
  const w = whenOf(i);
  if (w) {
    const d = parseDT(w);
    const cls = done ? '' : d < new Date() ? 'late' : dayKey(d) === S.today ? 'soon' : '';
    chips.push(`<span class="chip ${cls}">📅 ${fmtDT(w)}</span>`);
  }
  if (i.repeat && i.repeat !== 'none') chips.push(`<span class="chip">🔁 ${REPEAT[i.repeat]}</span>`);
  if (i.minutes) chips.push(`<span class="chip">⏱ ${fmtMin(i.minutes)}</span>`);
  if (i.energy && i.energy !== 'mittel' && isTask(i)) chips.push(`<span class="chip">${ENERGY[i.energy]}</span>`);
  if (i.today === S.today && !done) chips.push('<span class="chip soon">⭐ Top heute</span>');
  if (i.notes) chips.push(`<span class="chip" title="${esc(i.notes)}">📝 Notiz</span>`);
  const sub = kids(i.id);
  if (sub.length) chips.push(`<span class="chip">${sub.filter(c => c.status === 'erledigt').length}/${sub.length} Schritte</span>`);

  const hint = !done && i.postponed >= 3
    ? `<div class="hint">Schon ${i.postponed}× verschoben. Vielleicht zerlegen ✂️, Datum ändern oder löschen?</div>` : '';

  let acts = '';
  if (!done) {
    if (o.sortButtons) {
      acts += ['aufgabe', 'pflicht', 'idee', 'einkauf', 'interesse'].map(k =>
        `<button class="btn ghost" data-act="kind" data-kind="${k}" data-id="${i.id}" title="${KINDS[k]}">${KINDS[k].split(' ')[0]}</button>`).join('');
    }
    if (isTask(i)) {
      acts += `<button class="btn ghost" data-act="star" data-id="${i.id}" title="Als Top 3 heute markieren">${i.today === S.today ? '⭐' : '☆'}</button>`;
      if (!i.parent_id) acts += `<button class="btn ghost" data-act="split" data-id="${i.id}" title="In kleine Schritte zerlegen">✂️</button>`;
    }
    if (o.toTask) acts += `<button class="btn ghost" data-act="kind" data-kind="aufgabe" data-id="${i.id}" title="Zur Aufgabe machen">→ Aufgabe</button>`;
    acts += `<button class="btn ghost" data-act="edit" data-id="${i.id}" title="Bearbeiten">✏️</button>`;
  }
  acts += `<button class="btn ghost danger" data-act="del" data-id="${i.id}" title="Löschen">🗑</button>`;

  const checkAct = done ? (i.repeat === 'none' ? 'undo' : '') : 'done';
  return `<div class="item ${done ? 'done' : ''} ${i.parent_id && o.tree ? 'sub-item' : ''}">
    <button class="check ${done ? 'on' : ''}" ${checkAct ? `data-act="${checkAct}"` : ''} data-id="${i.id}" title="${done ? 'Rückgängig' : 'Erledigt'}">${done ? '✓' : ''}</button>
    <div class="body"><div class="title">${esc(i.title)}</div>
      ${chips.length ? `<div class="meta">${chips.join('')}</div>` : ''}${hint}</div>
    <div class="acts">${acts}</div></div>`;
}

function list(items, o = {}) {
  if (!items.length) return `<div class="empty">${o.empty || 'Nichts hier.'}</div>`;
  return `<div class="list">${items.map(i => itemRow(i, o)).join('')}</div>`;
}

// Aufgaben mit ihren Unterschritten
function tree(items, o = {}) {
  if (!items.length) return `<div class="empty">${o.empty || 'Nichts hier.'}</div>`;
  const ids = new Set(items.map(i => i.id));
  const roots = items.filter(i => !i.parent_id || !ids.has(i.parent_id));
  const out = [];
  for (const r of roots) {
    out.push(itemRow(r, { ...o, tree: true }));
    for (const c of kids(r.id).sort((a, b) => (a.status === 'erledigt') - (b.status === 'erledigt') || a.id - b.id))
      out.push(itemRow(c, { ...o, tree: true }));
  }
  return `<div class="list">${out.join('')}</div>`;
}

function inlineAdd(form, placeholder, extra = '') {
  return `<form class="inline-form" data-form="${form}" ${extra}>
    <input class="field" name="title" placeholder="${placeholder}" autocomplete="off">
    <button class="btn primary">Hinzufügen</button></form>`;
}

// ---------------------------------------------------------------- "Was jetzt?"
function candidates() {
  const all = tasks();
  return all.filter(i => !all.some(c => c.parent_id === i.id));   // Eltern mit offenen Schritten überspringen
}
function score(i) {
  let s = 0; const now = new Date(); const w = whenOf(i);
  if (w) { const hrs = (parseDT(w) - now) / 36e5; s += hrs < 0 ? 50 : hrs < 24 ? 30 : hrs < 72 ? 10 : 0; }
  if (i.today === S.today) s += 40;
  s += i.priority * 15;
  if (i.kind === 'pflicht') s += 10;
  const E = { niedrig: 1, mittel: 2, hoch: 3 };
  if (wn.energy) { const need = E[i.energy] || 2, have = E[wn.energy]; s += need > have ? -40 : need === have ? 5 : 0; }
  if (wn.time) s += (i.minutes || 15) > wn.time ? -30 : 5;
  if (i.parent_id) s += 8;                       // kleine Schritte bevorzugen
  s -= Math.min(i.postponed, 5) * 2;
  return s;
}
function pickNext() {
  const c = candidates().filter(i => !wn.skip.includes(i.id));
  c.sort((a, b) => score(b) - score(a));
  return c[0] || null;
}

function whatNowCard() {
  if (!wn.open) {
    return `<div class="card hero">
      <div class="magnus-row">${Magnus.face('think', 56)}<div>
      <h2 style="margin-bottom:4px">Magnus, was jetzt?</h2>
      <p class="muted" style="margin:0 0 12px">Keine Lust auf lange Listen? Ich wähle genau <b>eine</b> Sache, die jetzt passt.</p>
      <button class="btn primary big" data-act="wn-open">Was soll ich jetzt machen?</button></div></div></div>`;
  }
  const opt = (key, val, label) =>
    `<button class="btn ${wn[key] === val ? 'sel' : ''}" data-act="wn-set" data-key="${key}" data-v="${val}">${label}</button>`;
  const t = pickNext();
  const task = t ? `<div class="wn-task">
      <div class="magnus-say">${Magnus.face('happy', 30)}<span>${esc(wn.line || say('suggest'))}</span></div>
      <div class="big-title">${esc(t.title)}</div>
      ${t.parent_id && byId(t.parent_id) ? `<div class="muted small">Schritt von: ${esc(byId(t.parent_id).title)}</div>` : ''}
      ${t.notes ? `<p class="small muted">${esc(t.notes)}</p>` : ''}
      <div class="meta" style="margin:8px 0 14px">${t.minutes ? `<span class="chip">⏱ ${fmtMin(t.minutes)}</span>` : ''}
        ${whenOf(t) ? `<span class="chip">📅 ${fmtDT(whenOf(t))}</span>` : ''}${t.kind === 'pflicht' ? '<span class="chip pflicht">Pflicht</span>' : ''}</div>
      ${t.postponed >= 3 ? `<div class="hint">Schon ${t.postponed}× verschoben. Zu groß? Dann zerleg sie in Mini-Schritte.</div>` : ''}
      <div class="row-btns">
        <button class="btn primary" data-act="wn-focus" data-id="${t.id}">▶ Fokus starten</button>
        <button class="btn" data-act="wn-done" data-id="${t.id}">✓ Schon erledigt</button>
        <button class="btn" data-act="wn-skip" data-id="${t.id}">↷ Andere Aufgabe</button>
        <button class="btn" data-act="wn-postpone" data-id="${t.id}">Nicht jetzt</button>
        <button class="btn" data-act="split" data-id="${t.parent_id || t.id}">✂️ Zerlegen</button>
      </div></div>`
    : `<div class="wn-task"><div class="magnus-say">${Magnus.face('proud', 30)}<span>${esc(say('nothing'))}</span></div>
       <p class="muted">Oder schau kurz in die Inbox, ob da noch was liegt.</p>
       ${wn.skip.length ? '<button class="btn" data-act="wn-reset">Nochmal von vorn</button>' : ''}</div>`;
  return `<div class="card hero">
    <h2>🎯 Magnus, was jetzt? <span style="flex:1"></span><button class="btn ghost" data-act="wn-close">✕</button></h2>
    <div class="wn-options">
      <div class="row-btns"><span class="muted small" style="width:90px">Energie:</span>
        ${opt('energy', 'niedrig', '🪫 wenig')}${opt('energy', 'mittel', '🙂 normal')}${opt('energy', 'hoch', '⚡ viel')}</div>
      <div class="row-btns"><span class="muted small" style="width:90px">Zeit:</span>
        ${opt('time', 5, '5 Min')}${opt('time', 15, '15 Min')}${opt('time', 30, '30 Min')}${opt('time', 60, '1 Std+')}</div>
    </div>${task}</div>`;
}

// ---------------------------------------------------------------- Ansichten
const VIEWS = {};

VIEWS.heute = () => {
  const now = new Date(), h = now.getHours();
  const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const top = tasks().filter(i => i.today === S.today);
  const end = S.today + 'T23:59';
  const due = openItems().filter(i => i.today !== S.today && whenOf(i) && whenOf(i) <= end && i.kind !== 'einkauf').sort(byWhen);
  const part = h < 14 ? 'morgen' : 'abend';
  const rts = S.routines.filter(r => r.part === part);
  const rDone = rts.filter(r => S.routine_done.includes(r.id)).length;
  const doneToday = S.done_log.filter(d => d.done_at.startsWith(S.today));
  const inbox = openItems().filter(i => i.kind === 'inbox').length;
  const lastReview = S.reviews.find(r => r.day < S.today && r.tomorrow);
  const nowStr = toLocal(now);
  const b = Magnus.briefing({
    overdue: openItems().filter(i => whenOf(i) && whenOf(i) < nowStr && i.kind !== 'einkauf').length,
    dueToday: openItems().filter(i => whenOf(i) && whenOf(i) >= nowStr && whenOf(i) <= end).length,
    top: top.length, inbox, doneToday: doneToday.length,
    reviewed: S.reviews.some(r => r.day === S.today),
    lastNote: lastReview ? lastReview.tomorrow : '',
  });
  if (!greetLine || greetDay !== S.today) { greetLine = Magnus.greet(nm()); greetDay = S.today; }

  return `<div class="card magnus-card"><div class="magnus-row">${Magnus.face(b.mood, 120)}
    <div class="bubble"><div class="bubble-title">${esc(greetLine)}</div>
      ${b.lines.map(l => `<div>${esc(l)}</div>`).join('')}
      ${b.action ? `<button class="btn primary" style="margin-top:10px" data-act="${b.action.act}" data-v="${b.action.v || ''}">${b.action.label}</button>` : ''}
    </div></div>
    <div class="muted small tip">💡 <b>Magnus' Tipp:</b> ${esc(Magnus.tipOfDay())} · ${dateStr}</div></div>
  ${whatNowCard()}
  <div class="grid">
    <div class="card"><h2>⭐ Top 3 für heute</h2>
      ${list(top, { empty: 'Noch nichts gewählt. Markier bis zu 3 Aufgaben mit ☆ – mehr nicht.' })}
      ${top.length > 3 ? '<div class="hint">Mehr als 3 Top-Aufgaben machen den Tag schwerer. Wähl lieber weniger.</div>' : ''}
    </div>
    <div class="card"><h2>📅 Heute fällig & überfällig</h2>${list(due, { empty: 'Nichts fällig – sehr gut.', showKind: true })}</div>
    <div class="card"><h2>🔁 ${part === 'morgen' ? 'Morgen' : 'Abend'}-Routine <span class="muted small">${rDone}/${rts.length}</span></h2>
      <div class="bar"><div style="width:${rts.length ? rDone / rts.length * 100 : 0}%"></div></div>
      ${routineList(rts, false)}</div>
    <div class="card"><h2>✅ Heute geschafft <span class="muted small">${doneToday.length}</span></h2>
      ${doneToday.length ? `<div class="list">${doneToday.slice(0, 8).map(d => `<div class="item done"><span class="check on">✓</span><div class="body"><div class="title">${esc(d.title)}</div></div></div>`).join('')}</div>`
      : `<div class="magnus-say">${Magnus.face('neutral', 28)}<span class="muted">Noch nichts – der erste Haken ist der schwerste. Fang klein an.</span></div>`}
      ${inbox ? `<div class="hint" style="margin-top:12px">📥 ${inbox} Notiz${inbox > 1 ? 'en warten' : ' wartet'} in der Inbox aufs Sortieren. <button class="btn ghost" data-act="go" data-v="inbox">Ansehen →</button></div>` : ''}
    </div>
  </div>`;
};

VIEWS.inbox = () => {
  const items = openItems().filter(i => i.kind === 'inbox');
  return `<h1>📥 Inbox</h1><p class="sub">Hier landet alles, was du schnell notiert hast. Einmal am Tag kurz sortieren: ✅ Aufgabe · ❗ Pflicht · 💡 Idee · 🛒 Einkauf · 📚 Interesse</p>
    <div class="card">${list(items, { sortButtons: true, empty: 'Inbox leer – Kopf frei! 🧘' })}</div>`;
};

VIEWS.aufgaben = () => {
  const all = tasks();
  const projects = [...new Set(all.map(i => i.project).filter(Boolean))].sort();
  const items = projectFilter ? all.filter(i => i.project === projectFilter) : all;
  const now = toLocal(new Date()), end = S.today + 'T23:59';
  const weekEnd = toLocal(new Date(Date.now() + 7 * 864e5));
  const roots = items.filter(i => !i.parent_id || !byId(i.parent_id) || byId(i.parent_id).status !== 'offen');
  const g = { late: [], today: [], week: [], later: [], none: [] };
  for (const i of roots.sort(byWhen)) {
    const w = whenOf(i);
    if (!w) (i.today === S.today ? g.today : g.none).push(i);
    else if (w < now) g.late.push(i);
    else if (w <= end || i.today === S.today) g.today.push(i);
    else if (w <= weekEnd) g.week.push(i);
    else g.later.push(i);
  }
  const doneRecent = S.items.filter(i => i.status === 'erledigt' && isTask(i) && !i.parent_id).slice(0, 15);
  const sec = (title, arr) => arr.length ? `<div class="group-title">${title} · ${arr.length}</div>${tree(arr)}` : '';
  return `<h1>✅ Aufgaben</h1><p class="sub">Tipp: Große Brocken mit ✂️ zerlegen – kleine Schritte sind leichter anzufangen.</p>
    <div class="filters">
      <button class="btn ${!projectFilter ? 'sel' : ''}" data-act="filter" data-v="">Alle</button>
      ${projects.map(p => `<button class="btn ${projectFilter === p ? 'sel' : ''}" data-act="filter" data-v="${esc(p)}">#${esc(p)}</button>`).join('')}
      <span style="flex:1"></span><button class="btn primary" data-act="new" data-kind="aufgabe">+ Neue Aufgabe</button>
    </div>
    <div class="card">
      ${roots.length ? '' : '<div class="empty">Keine offenen Aufgaben. 🎉</div>'}
      ${sec('🔴 Überfällig', g.late)}${sec('☀️ Heute', g.today)}${sec('📆 Diese Woche', g.week)}${sec('🗓 Später', g.later)}${sec('📋 Ohne Termin', g.none)}
    </div>
    ${doneRecent.length ? `<div class="card"><h2>✓ Zuletzt erledigt</h2>${list(doneRecent)}</div>` : ''}`;
};

VIEWS.erinnerungen = () => {
  const items = openItems().filter(i => i.remind_at).sort((a, b) => a.remind_at.localeCompare(b.remind_at));
  const rep = items.filter(i => i.repeat !== 'none'), once = items.filter(i => i.repeat === 'none');
  return `<h1>⏰ Erinnerungen</h1><p class="sub">Erinnerungen melden sich so lange, bis du sie abhakst oder verschiebst.</p>
    <div class="filters"><span style="flex:1"></span><button class="btn primary" data-act="new" data-kind="aufgabe" data-remind="1">+ Neue Erinnerung</button></div>
    <div class="grid">
      <div class="card"><h2>📍 Einmalig</h2>${list(once, { showKind: true, empty: 'Keine. Schreib oben z. B. „Wäsche aufhängen in 30 min“.' })}</div>
      <div class="card"><h2>🔁 Wiederkehrend</h2>${list(rep, { showKind: true, empty: 'Keine. Z. B. „Müll rausbringen jeden Dienstag abends“.' })}</div>
    </div>`;
};

function routineList(rts, editable) {
  if (!rts.length) return '<div class="empty">Noch keine Schritte.</div>';
  return `<div class="list">${rts.map(r => {
    const on = S.routine_done.includes(r.id);
    return `<div class="item ${on ? 'done' : ''}">
      <button class="check ${on ? 'on' : ''}" data-act="routine-toggle" data-id="${r.id}">${on ? '✓' : ''}</button>
      <div class="body"><div class="title">${esc(r.name)}</div></div>
      ${editable ? `<div class="acts"><button class="btn ghost danger" data-act="routine-del" data-id="${r.id}">🗑</button></div>` : ''}</div>`;
  }).join('')}</div>`;
}

VIEWS.routinen = () => {
  const card = (part, title) => {
    const rts = S.routines.filter(r => r.part === part);
    const d = rts.filter(r => S.routine_done.includes(r.id)).length;
    return `<div class="card"><h2>${title} <span class="muted small">${d}/${rts.length}</span></h2>
      <div class="bar"><div style="width:${rts.length ? d / rts.length * 100 : 0}%"></div></div>
      ${routineList(rts, true)}${inlineAdd('routine', 'Neuer Schritt …', `data-part="${part}"`)}</div>`;
  };
  return `<h1>🔁 Routinen</h1><p class="sub">Feste Abläufe sparen Entscheidungen. Die Haken werden jeden Tag zurückgesetzt.</p>
    <div class="grid">${card('morgen', '🌅 Morgen')}${card('abend', '🌙 Abend')}</div>`;
};

VIEWS.fokus = () => {
  if (F.running) {
    return `<h1>🎯 Fokus</h1><div class="card"><div class="focus-wrap">
      <div class="focus-task">${esc(F.title)}</div>
      <div class="ring"><svg width="260" height="260"><circle cx="130" cy="130" r="115" stroke="#1e2731" stroke-width="14" fill="none"/>
        <circle id="f-ring" cx="130" cy="130" r="115" stroke="url(#gr)" stroke-width="14" fill="none" stroke-linecap="round"
          stroke-dasharray="${2 * Math.PI * 115}" stroke-dashoffset="0"/>
        <defs><linearGradient id="gr"><stop offset="0" stop-color="#4fd1c5"/><stop offset="1" stop-color="#9f7aea"/></linearGradient></defs></svg>
        <div class="time" id="f-time">--:--</div></div>
      <div class="row-btns">
        ${F.paused ? '<button class="btn primary" data-act="f-resume">▶ Weiter</button>' : '<button class="btn" data-act="f-pause">⏸ Pause</button>'}
        <button class="btn" data-act="f-plus">+5 Min</button>
        <button class="btn danger" data-act="f-stop">■ Beenden</button>
      </div>
      <div class="magnus-say">${Magnus.face(F.paused ? 'sleepy' : 'happy', 30)}<span id="f-say">${esc(F.say || '')}</span></div>
      <p class="muted small">Ablenkung im Kopf? Oben schnell notieren – ich merk's mir.</p></div></div>`;
  }
  const def = F.minutes || +S.settings.focus_minutes || 25;
  const opts = tasks().sort(byWhen).map(i => `<option value="${i.id}" ${F.itemId === i.id ? 'selected' : ''}>${esc(i.title)}</option>`).join('');
  const weekMin = S.focus_log.reduce((a, f) => a + f.minutes, 0);
  return `<h1>🎯 Fokus</h1><p class="sub">Eine Sache, eine feste Zeit. Danach kurze Pause.</p>
    <div class="card"><div class="form-grid">
      <label class="f full">Woran arbeitest du?<select id="f-item"><option value="">– freier Fokus –</option>${opts}</select></label>
      <label class="f">Minuten<input id="f-min" type="number" min="1" max="180" value="${def}"></label>
      <div class="row-btns" style="align-items:end">${[5, 15, 25, 45].map(m => `<button class="btn" data-act="f-preset" data-v="${m}">${m}</button>`).join('')}</div>
    </div>
    <div style="margin-top:18px"><button class="btn primary big" data-act="f-start">▶ Fokus starten</button></div></div>
    <div class="card"><h2>📈 Diese Woche</h2><p>${weekMin ? `<b>${fmtMin(weekMin)}</b> fokussiert in ${S.focus_log.length} Einheiten.` : 'Noch keine Fokus-Einheiten.'}</p></div>`;
};

VIEWS.einkauf = () => {
  const items = openItems().filter(i => i.kind === 'einkauf');
  const done = S.items.filter(i => i.kind === 'einkauf' && i.status === 'erledigt' && (i.done_at || '').startsWith(S.today));
  return `<h1>🛒 Einkauf</h1><p class="sub">Schnell ergänzen: oben „Milch #einkauf“ oder hier direkt.</p>
    <div class="card">${inlineAdd('einkauf', 'Was brauchst du?')}<div style="margin-top:14px">${list(items, { empty: 'Liste leer.' })}</div>
    ${done.length ? `<div class="group-title">Heute gekauft</div>${list(done)}` : ''}</div>`;
};

VIEWS.ideen = () => {
  const items = openItems().filter(i => i.kind === 'idee');
  return `<h1>💡 Ideen-Parkplatz</h1><p class="sub">Ideen hier parken statt sofort loszulegen. Wenn eine nach ein paar Tagen noch spannend ist → zur Aufgabe machen.</p>
    <div class="card">${inlineAdd('idee', 'Neue Idee …')}<div style="margin-top:14px">${list(items, { toTask: true, empty: 'Noch keine Ideen geparkt.' })}</div></div>`;
};

VIEWS.interessen = () => {
  const items = openItems().filter(i => i.kind === 'interesse');
  return `<h1>📚 Interessen</h1><p class="sub">Themen, die dich interessieren – mit deinen Notizen, Links und Fragen.</p>
    <div class="card">${inlineAdd('interesse', 'Neues Thema, z. B. „Lokale KI mit Ollama“')}</div>
    <div class="cards-grid">${items.map(i => `<div class="topic">
      <div style="display:flex;gap:8px;align-items:center"><b style="flex:1">${esc(i.title)}</b>
        <button class="btn ghost danger" data-act="del" data-id="${i.id}">🗑</button></div>
      <textarea class="field" data-notes="${i.id}" placeholder="Notizen, Links, offene Fragen …">${esc(i.notes)}</textarea>
      <div class="muted small">Speichert automatisch</div></div>`).join('') || '<div class="empty">Noch keine Themen.</div>'}</div>`;
};

VIEWS.rueckblick = () => {
  const saved = S.reviews.find(r => r.day === S.today) || {};
  review = review || { mood: saved.mood || 0, wins: saved.wins || '', tomorrow: saved.tomorrow || '', note: saved.note || '' };
  const days = [];
  for (let k = 6; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); days.push(dayKey(d)); }
  const counts = days.map(d => S.done_log.filter(x => x.done_at.startsWith(d)).length);
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const past = S.reviews.filter(r => r.day !== S.today).slice(0, 7);
  return `<h1>🌙 Rückblick</h1>
    <div class="magnus-say" style="margin-bottom:18px">${Magnus.face('happy', 40)}<span>Zwei Minuten. Was lief gut, was nimmst du mit? Kein Urteil – nur Klarheit. Was du für morgen notierst, sage ich dir früh wieder.</span></div>
    <div class="card"><h2>Heute</h2>
      <div class="f" style="margin-bottom:12px"><span class="muted small">Wie war dein Tag?</span>
        <div class="moods">${MOODS.map((m, k) => `<button class="${review.mood === k + 1 ? 'sel' : ''}" data-act="mood" data-v="${k + 1}">${m}</button>`).join('')}</div></div>
      <div class="form-grid">
        <label class="f">Was lief gut? (auch Kleinigkeiten)<textarea data-review="wins">${esc(review.wins)}</textarea></label>
        <label class="f">Was soll morgen-früh-Du wissen?<textarea data-review="tomorrow">${esc(review.tomorrow)}</textarea></label>
        <label class="f full">Sonstige Gedanken<textarea data-review="note">${esc(review.note)}</textarea></label>
      </div>
      <div style="margin-top:12px"><button class="btn primary" data-act="review-save">Speichern</button>
      ${saved.day ? '<span class="muted small"> ✓ gespeichert</span>' : ''}</div></div>
    <div class="grid">
      <div class="card"><h2>📊 Erledigt – letzte 7 Tage <span class="muted small">${total}</span></h2>
        <div class="chart">${days.map((d, k) => `<div class="col"><span class="small">${counts[k] || ''}</span>
          <div class="colbar" style="height:${counts[k] / max * 85}%"></div><span class="lbl">${WD[parseDT(d).getDay()]}</span></div>`).join('')}</div></div>
      <div class="card"><h2>📖 Frühere Rückblicke</h2>${past.length ? past.map(r => `<div style="margin-bottom:10px">
        <b>${parseDT(r.day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}</b> ${MOODS[r.mood - 1] || ''}
        ${r.wins ? `<div class="small muted">👍 ${esc(r.wins)}</div>` : ''}</div>`).join('') : '<div class="empty">Noch keine.</div>'}</div>
    </div>
    <div class="card"><h2>✓ Erledigt-Liste</h2>${S.done_log.length ? `<div class="list">${S.done_log.slice(0, 40).map(d =>
      `<div class="item done"><span class="check on">✓</span><div class="body"><div class="title">${esc(d.title)}</div>
       <div class="meta"><span class="chip">${fmtDT(d.done_at)}</span></div></div></div>`).join('')}</div>` : '<div class="empty">Noch nichts erledigt diese Woche.</div>'}</div>`;
};

VIEWS.einstellungen = () => {
  const s = S.settings;
  return `<h1>⚙️ Einstellungen</h1>
    <div class="card"><form data-form="settings" class="form-grid">
      <label class="f">Dein Name (für die Begrüßung)<input name="name" value="${esc(s.name)}"></label>
      <label class="f">Fokus-Standard (Minuten)<input name="focus_minutes" type="number" min="1" value="${esc(s.focus_minutes)}"></label>
      <label class="f">Erinnerung wiederholen, bis abgehakt
        <select name="nag_minutes">${[[0, 'nur einmal'], [2, 'alle 2 Min'], [5, 'alle 5 Min'], [10, 'alle 10 Min'], [15, 'alle 15 Min'], [30, 'alle 30 Min']]
      .map(([v, l]) => `<option value="${v}" ${+s.nag_minutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">${standalone ? 'Handy-Benachrichtigungen' : 'Windows-Benachrichtigungen'}
        <select name="os_notify"><option value="1" ${s.os_notify === '1' ? 'selected' : ''}>an</option><option value="0" ${s.os_notify !== '1' ? 'selected' : ''}>aus</option></select></label>
      ${isPC ? `<label class="f">Magnus-Leiste beim Start öffnen
        <select name="bar_autostart"><option value="1" ${s.bar_autostart !== '0' ? 'selected' : ''}>ja</option><option value="0" ${s.bar_autostart === '0' ? 'selected' : ''}>nein</option></select></label>` : ''}
      <div class="full row-btns"><button class="btn primary">Speichern</button>
        ${isPC ? '<button type="button" class="btn" data-act="open-bar">🪟 Desktop-Leiste öffnen</button>' : ''}
        ${standalone ? '' : '<button type="button" class="btn" data-act="test-notify">🔔 Test-Benachrichtigung</button>'}
        ${standalone ? '' : '<a class="btn" href="/api/export" download>💾 Backup herunterladen</a>'}</div>
    </form></div>
    <div class="card" id="phone-card"><h2>📱 Handy</h2><div class="muted">Lade …</div></div>
    <div class="card help"><h2>⌨️ Schnelleingabe – so funktioniert's</h2><ul>
      <li><code>morgen 10 Uhr</code>, <code>heute 18:30</code>, <code>übermorgen</code>, <code>am 24.12.</code>, <code>Freitag</code>, <code>abends</code></li>
      <li><code>in 20 min</code>, <code>in 2 std</code>, <code>in 3 tagen</code></li>
      <li><code>täglich</code>, <code>werktags</code>, <code>jeden Dienstag</code>, <code>wöchentlich</code>, <code>monatlich</code></li>
      <li><code>#pflicht</code> <code>#idee</code> <code>#einkauf</code> <code>#interesse</code> – oder ein eigenes Projekt wie <code>#umzug</code></li>
      <li><code>!</code> = wichtig, <code>!!</code> = sehr wichtig · <code>~30m</code> / <code>~1h</code> = geschätzte Dauer</li>
      <li>Ohne Datum und Tag landet alles in der 📥 Inbox.</li>
      ${isPC ? '<li>Taste <kbd>N</kbd> springt überall ins Eingabefeld, <kbd>Esc</kbd> schließt Fenster.</li>' : ''}</ul></div>`;
};

// ---------------------------------------------------------------- Handy / PIN
let pinOpen = false;
function askPin() {
  if (pinOpen) return;
  pinOpen = true;
  $('#modal').innerHTML = `<div class="modal-box" style="text-align:center">
    <div style="display:flex;justify-content:center">${Magnus.face('think', 110)}</div>
    <h2 style="justify-content:center">Wer bist du?</h2>
    <p class="muted">Gib die PIN ein, die du am PC unter ⚙️ Einstellungen → Handy festgelegt hast.</p>
    <form data-form="pin"><input class="field" name="pin" inputmode="numeric" autocomplete="off" maxlength="8"
      style="font-size:24px;text-align:center;letter-spacing:8px;width:200px" autofocus>
    <div style="margin-top:14px"><button class="btn primary">Eintreten</button></div></form></div>`;
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#modal input').focus(), 50);
}

async function phoneCard() {
  const box = $('#phone-card');
  if (!box) return;
  if (standalone) return standaloneCard(box);
  let n;
  try { n = await api('GET', '/api/netinfo'); } catch { return; }
  const s = S.settings;
  if (standalone) return standaloneCard(box);
  if (!isPC) {
    box.innerHTML = `<h2>📱 Handy</h2><p>Du bist mit Magnus auf deinem PC verbunden. Alles, was du hier einträgst, landet direkt dort.</p>
      <button class="btn" data-act="forget-pin">PIN auf diesem Gerät vergessen</button>`;
    return;
  }
  const urls = n.ips.map(ip => `http://${ip}:${n.port}`);
  let status;
  if (n.lan_active) {
    status = `<div class="hint" style="background:#173634;border-color:#2c5d58;color:#9ff0e6">✦ Handy-Zugriff ist aktiv. Öffne auf dem Handy (im selben WLAN):</div>
      ${urls.map(u => `<div class="url-row"><code>${u}</code><div class="qr" data-url="${u}"></div></div>`).join('') || '<div class="hint">Keine Netzwerk-Adresse gefunden – ist der PC im WLAN/LAN?</div>'}`;
  } else if (n.lan_setting && n.pin_set) {
    status = '<div class="hint">Eingestellt – bitte Magnus einmal neu starten (Fenster schließen, start.bat erneut öffnen).</div>';
  } else {
    status = '<p class="muted small">Aktuell nur am PC erreichbar.</p>';
  }
  box.innerHTML = `<h2>📱 Handy-App</h2>
    <p class="muted">Magnus läuft auf deinem PC – dein Handy greift im selben WLAN darauf zu. Gleiche Daten, keine Cloud.</p>
    <form data-form="lan" class="form-grid">
      <label class="f">Handy-Zugriff im Heimnetz
        <select name="lan_access"><option value="0" ${s.lan_access !== '1' ? 'selected' : ''}>aus</option><option value="1" ${s.lan_access === '1' ? 'selected' : ''}>an</option></select></label>
      <label class="f">PIN (4–8 Ziffern)<input name="lan_pin" inputmode="numeric" value="${esc(s.lan_pin)}" placeholder="z. B. 4711"></label>
      <div class="full"><button class="btn primary">Speichern</button></div>
    </form>
    <div style="margin-top:14px">${status}</div>
    <details style="margin-top:12px"><summary>So kommt Magnus auf den Startbildschirm</summary>
      <ol class="small">
        <li>Handy ins selbe WLAN wie den PC, Adresse oben im Browser öffnen (oder QR-Code scannen), PIN eingeben.</li>
        <li><b>Android (Chrome):</b> Menü ⋮ → „Zum Startbildschirm hinzufügen“.</li>
        <li><b>iPhone (Safari):</b> Teilen-Symbol → „Zum Home-Bildschirm“.</li>
        <li>Beim ersten Start fragt Windows nach der Firewall: <b>„Private Netzwerke“ zulassen</b>.</li>
      </ol></details>`;
  const qrs = box.querySelectorAll('.qr');
  if (qrs.length) loadQr(() => qrs.forEach(el => {
    const q = window.qrcode(0, 'M'); q.addData(el.dataset.url); q.make(); el.innerHTML = q.createSvgTag(4, 8);
  }));
}
function standaloneCard(box) {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permTxt = { granted: '✓ erlaubt', denied: '✕ blockiert – in den Handy-Einstellungen für diese App erlauben', default: 'noch nicht erlaubt', unsupported: 'von diesem Browser nicht unterstützt' }[perm];
  box.innerHTML = `<h2>📱 Magnus auf diesem Handy</h2>
    <p class="muted">Diese Version läuft komplett auf deinem Handy – ohne PC, auch offline. Deine Daten liegen nur hier.</p>
    <div class="row-btns" style="align-items:center;margin-bottom:12px">
      <span>🔔 Benachrichtigungen: <b>${permTxt}</b></span>
      ${perm === 'default' ? '<button class="btn primary" data-act="ask-notify">Erlauben</button>' : ''}
      ${perm === 'granted' ? '<button class="btn" data-act="test-notify">Testen</button>' : ''}
    </div>
    <div class="row-btns">
      <button class="btn" data-act="export">💾 Backup speichern</button>
      <label class="btn">📂 Backup laden<input type="file" accept=".json,application/json" id="import-file" hidden></label>
    </div>
    <p class="muted small" style="margin-top:10px">Tipp: Mach ab und zu ein Backup. Ein Backup vom PC-Magnus kannst du hier auch laden – dann ist alles vom PC auf dem Handy.</p>`;
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function loadQr(cb) {
  if (window.qrcode) return cb();
  const sc = document.createElement('script');
  sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
  sc.onload = cb; sc.onerror = () => {};   // ohne Internet: nur die Adresse anzeigen
  document.head.appendChild(sc);
}

// ---------------------------------------------------------------- Rendern
function render() {
  if (!S) return;
  if (!VIEWS[view]) view = 'heute';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const inbox = openItems().filter(i => i.kind === 'inbox').length;
  const shop = openItems().filter(i => i.kind === 'einkauf').length;
  $('#badge-inbox').textContent = inbox || '';
  $('#badge-einkauf').textContent = shop || '';
  $('#view').innerHTML = VIEWS[view]();
  if (!isPC) document.querySelectorAll('.sidebar-foot [data-act=open-bar]').forEach(b => b.remove());
  if (view === 'fokus') tickFocus();
  if (view === 'einstellungen') phoneCard();
}

function go(v) { view = v; store.set('view', v); review = null; render(); window.scrollTo(0, 0); }

// ---------------------------------------------------------------- Modal
function closeModal() { if (pinOpen) return; $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }

function openEdit(i) {
  const isNew = !i.id;
  const opt = (obj, cur) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
  $('#modal').innerHTML = `<div class="modal-box"><h2>${isNew ? 'Neu' : 'Bearbeiten'}</h2>
    <form data-form="edit" data-id="${i.id || ''}" class="form-grid">
      <label class="f full">Titel<input name="title" value="${esc(i.title)}" required></label>
      <label class="f">Art<select name="kind">${opt(KINDS, i.kind || 'aufgabe')}</select></label>
      <label class="f">Projekt<input name="project" value="${esc(i.project)}" placeholder="z. B. umzug" list="projects"></label>
      <datalist id="projects">${[...new Set(S.items.map(x => x.project).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="f">Fällig am<input type="datetime-local" name="due" value="${i.due || ''}"></label>
      <label class="f">Erinnern um<input type="datetime-local" name="remind_at" value="${i.remind_at || ''}"></label>
      <label class="f">Wiederholen<select name="repeat">${opt(REPEAT, i.repeat || 'none')}</select></label>
      <label class="f">Wichtigkeit<select name="priority">${opt({ 0: 'normal', 1: '! wichtig', 2: '!! sehr wichtig' }, String(i.priority || 0))}</select></label>
      <label class="f">Benötigte Energie<select name="energy">${opt(ENERGY, i.energy || 'mittel')}</select></label>
      <label class="f">Geschätzte Dauer (Min)<input type="number" min="0" name="minutes" value="${i.minutes || ''}"></label>
      <label class="f full">Notizen<textarea name="notes">${esc(i.notes)}</textarea></label>
      <div class="full modal-foot">
        <button type="button" class="btn" data-act="modal-close">Abbrechen</button>
        <button class="btn primary">Speichern</button></div>
    </form></div>`;
  $('#modal').classList.remove('hidden');
  $('#modal input[name=title]').focus();
}

function openSplit(i) {
  $('#modal').innerHTML = `<div class="modal-box"><h2>✂️ „${esc(i.title)}“ zerlegen</h2>
    <p class="muted small">Schreib die Mini-Schritte untereinander – jeder sollte in 5–15 Minuten machbar sein.
    Der erste Schritt darf lächerlich klein sein (z. B. „Ordner öffnen“).</p>
    <form data-form="split" data-id="${i.id}">
      <textarea name="steps" class="field" style="width:100%;min-height:160px" placeholder="Schritt 1&#10;Schritt 2&#10;Schritt 3"></textarea>
      <div class="modal-foot"><button type="button" class="btn" data-act="modal-close">Abbrechen</button>
      <button class="btn primary">Schritte anlegen</button></div></form></div>`;
  $('#modal').classList.remove('hidden');
  $('#modal textarea').focus();
}

// ---------------------------------------------------------------- Fokus-Timer
function startFocus(itemId, minutes) {
  const it = itemId ? byId(itemId) : null;
  Object.assign(F, {
    running: true, paused: false, total: minutes * 60, left: minutes * 60, endAt: Date.now() + minutes * 60000,
    itemId: it ? it.id : null, title: it ? it.title : 'Freier Fokus', startedAt: toLocal(new Date()), minutes,
    half: false, say: say('focusStart'),
  });
  go('fokus');
}
async function endFocus(finished) {
  const usedMin = Math.round((F.total - F.left) / 60);
  const { itemId, title, startedAt } = F;
  F.running = false; F.paused = false;
  document.title = 'Magnus – Daily Companion';
  $('#badge-focus').textContent = '';
  if (usedMin >= 1) await api('POST', '/api/focus', { item_id: itemId, title, minutes: usedMin, started_at: startedAt }).catch(() => {});
  if (finished) {
    beep(3);
    api('POST', '/api/notify', { title: '🤖 Magnus: Fokuszeit vorbei!', msg: title }).catch(() => {});
    $('#modal').innerHTML = `<div class="modal-box"><div class="magnus-row">${Magnus.face('proud', 64)}<div>
      <h2>${esc(say('focusEnd'))}</h2>
      <p>${fmtMin(usedMin)} an <b>${esc(title)}</b>. Steh kurz auf, trink was, beweg dich 5 Minuten.</p></div></div>
      <div class="modal-foot">
        ${itemId ? `<button class="btn" data-act="done" data-id="${itemId}">✓ Aufgabe erledigt</button>` : ''}
        <button class="btn" data-act="f-again">↻ Noch eine Runde</button>
        <button class="btn primary" data-act="modal-close">Pause machen</button></div></div>`;
    $('#modal').classList.remove('hidden');
  }
  await load();
}
function tickFocus() {
  if (!F.running) return;
  if (!F.paused) F.left = Math.max(0, Math.round((F.endAt - Date.now()) / 1000));
  const txt = `${pad(Math.floor(F.left / 60))}:${pad(F.left % 60)}`;
  $('#badge-focus').textContent = txt;
  document.title = `${F.paused ? '⏸' : '🎯'} ${txt} – ${F.title}`;
  const t = $('#f-time'), r = $('#f-ring');
  if (t) t.textContent = txt;
  if (!F.half && F.total >= 600 && F.left <= F.total / 2) { F.half = true; F.say = say('focusHalf'); const fs = $('#f-say'); if (fs) fs.textContent = F.say; }
  if (r) r.setAttribute('stroke-dashoffset', String(2 * Math.PI * 115 * (1 - F.left / F.total)));
  if (F.left <= 0 && !F.paused) endFocus(true);
}
setInterval(tickFocus, 1000);

// ---------------------------------------------------------------- Fällige Erinnerungen
const seenAlerts = new Set();
async function pollDue() {
  let due;
  try { due = await api('GET', '/api/due'); } catch { return; }
  const fresh = due.some(d => !seenAlerts.has(d.id + d.remind_at));
  due.forEach(d => seenAlerts.add(d.id + d.remind_at));
  if (fresh) beep(2);
  $('#alerts').innerHTML = due.slice(0, 4).map(d => `<div class="alert">
    <div class="magnus-say">${Magnus.face('alert', 30)}<span class="muted small">${nm() ? esc(nm()) + ', ' : ''}es ist Zeit. · ${fmtDT(d.remind_at)}</span></div>
    <div class="t">${esc(d.title)}</div>
    <div class="row-btns">
      <button class="btn primary" data-act="done" data-id="${d.id}">✓ Erledigt</button>
      <button class="btn" data-act="snooze" data-min="10" data-id="${d.id}">+10 Min</button>
      <button class="btn" data-act="snooze" data-min="60" data-id="${d.id}">+1 Std</button>
      <button class="btn" data-act="snooze-tomorrow" data-id="${d.id}">Morgen</button>
    </div></div>`).join('') + (due.length > 4 ? `<div class="alert small">… und ${due.length - 4} weitere</div>` : '');
}
setInterval(pollDue, 15000);

// ---------------------------------------------------------------- Ereignisse
document.addEventListener('click', async e => {
  const nav = e.target.closest('#nav button');
  if (nav) return go(nav.dataset.view);
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = +el.dataset.id || null, item = id ? byId(id) : null;
  const refresh = async () => { await load(); pollDue(); };

  switch (act) {
    case 'go': return go(el.dataset.v);
    case 'done':
      await api('POST', `/api/items/${id}/done`);
      toast(say('done'), 'proud');
      if (!$('#modal').classList.contains('hidden')) closeModal();
      return refresh();
    case 'undo': await api('POST', `/api/items/${id}/undo`); return refresh();
    case 'del':
      if (!confirm(`„${item ? item.title : 'Eintrag'}“ wirklich löschen?`)) return;
      await api('DELETE', `/api/items/${id}`); toast(say('deleted'), 'neutral'); return refresh();
    case 'edit': return openEdit(item);
    case 'new': {
      const d = { kind: el.dataset.kind || 'aufgabe' };
      if (el.dataset.remind) { const t = new Date(Date.now() + 3600e3); t.setMinutes(0); d.remind_at = d.due = toLocal(t); }
      return openEdit(d);
    }
    case 'split': return openSplit(item);
    case 'kind':
      await api('PUT', `/api/items/${id}`, { kind: el.dataset.kind });
      toast(`${say('sorted')} → ${KINDS[el.dataset.kind]}`); return refresh();
    case 'star': {
      const on = item.today === S.today;
      await api('PUT', `/api/items/${id}`, { today: on ? null : S.today });
      if (!on) toast(tasks().filter(i => i.today === S.today).length >= 3 ? say('tooMany') : say('star'), tasks().filter(i => i.today === S.today).length >= 3 ? 'think' : 'happy');
      return refresh();
    }
    case 'snooze': await api('POST', `/api/items/${id}/snooze`, { minutes: +el.dataset.min }); toast(say('snooze')); return refresh();
    case 'snooze-tomorrow': await api('POST', `/api/items/${id}/snooze`, { until: tomorrowAt(9) }); toast('Okay – ich erinnere dich morgen um 9 Uhr.'); return refresh();
    case 'filter': projectFilter = el.dataset.v; return render();
    // Was jetzt?
    case 'wn-open': wn.open = true; wn.skip = []; wn.line = say('suggest'); return render();
    case 'wn-close': wn.open = false; return render();
    case 'wn-reset': wn.skip = []; return render();
    case 'wn-set': {
      const v = el.dataset.key === 'time' ? +el.dataset.v : el.dataset.v;
      wn[el.dataset.key] = wn[el.dataset.key] === v ? null : v; wn.skip = []; return render();
    }
    case 'wn-skip': wn.skip.push(id); wn.line = say('skip'); return render();
    case 'wn-postpone': await api('POST', `/api/items/${id}/postpone`); wn.skip.push(id); wn.line = say('postpone'); return refresh();
    case 'wn-done': await api('POST', `/api/items/${id}/done`); toast(say('done'), 'proud'); wn.line = say('suggest'); return refresh();
    case 'wn-focus': return startFocus(id, item.minutes && item.minutes <= 60 ? item.minutes : (+S.settings.focus_minutes || 25));
    // Routinen
    case 'routine-toggle': await api('POST', `/api/routines/${id}/toggle`); return refresh();
    case 'routine-del':
      if (!confirm('Diesen Routine-Schritt löschen?')) return;
      await api('DELETE', `/api/routines/${id}`); return refresh();
    // Fokus
    case 'f-preset': $('#f-min').value = el.dataset.v; return;
    case 'f-start': {
      const mins = Math.max(1, +$('#f-min').value || 25);
      F.minutes = mins;
      return startFocus(+$('#f-item').value || null, mins);
    }
    case 'f-pause': F.paused = true; return render();
    case 'f-resume': F.paused = false; F.endAt = Date.now() + F.left * 1000; return render();
    case 'f-plus': F.left += 300; F.total += 300; F.endAt += 300000; return tickFocus();
    case 'f-stop': return endFocus(false);
    case 'f-again': closeModal(); return startFocus(F.itemId, F.minutes || 25);
    // Rückblick
    case 'mood': review.mood = +el.dataset.v; return render();
    case 'review-save':
      document.querySelectorAll('[data-review]').forEach(t => { review[t.dataset.review] = t.value; });
      await api('POST', '/api/review', { ...review, day: S.today });
      toast(say('review'), 'sleepy'); review = null; return refresh();
    // Sonstiges
    case 'test-notify': await api('POST', '/api/notify', {}); toast('Ein Zeichen ist unterwegs – schau unten rechts.'); return;
    case 'open-bar': { const r = await api('POST', '/api/bar'); toast(r.status === 'läuft schon' ? 'Ich bin bereits auf deinem Desktop.' : r.status === 'gestartet' ? 'Ich wache jetzt auch über deinen Desktop.' : 'Die Leiste konnte nicht starten.', r.status === 'fehler' ? 'alert' : 'happy'); return; }
    case 'modal-close': return closeModal();
    case 'forget-pin': store.set('pin', ''); location.reload(); return;
    case 'ask-notify': {
      const r = await Notification.requestPermission();
      toast(r === 'granted' ? 'Ab jetzt melde ich mich auch hier.' : 'Ohne Erlaubnis kann ich mich nur in der App melden.', r === 'granted' ? 'happy' : 'think');
      return render();
    }
    case 'export': {
      const data = await api('GET', '/api/export');
      download(`magnus-backup-${S.today}.json`, JSON.stringify(data, null, 1));
      toast('Backup gespeichert. Gut aufheben.'); return;
    }
  }
});

document.addEventListener('submit', async e => {
  const f = e.target;
  e.preventDefault();
  if (f.id === 'capture') return;   // eigener Handler unten
  const fd = Object.fromEntries(new FormData(f));
  switch (f.dataset.form) {
    case 'edit': {
      const data = { ...fd, priority: +fd.priority, minutes: +fd.minutes || 0 };
      if (data.remind_at && !data.due) data.due = data.remind_at;
      if (f.dataset.id) await api('PUT', `/api/items/${f.dataset.id}`, data);
      else await api('POST', '/api/items', data);
      closeModal(); toast(say('saved_generic')); break;
    }
    case 'split': {
      const steps = fd.steps.split('\n').map(s => s.trim()).filter(Boolean);
      if (!steps.length) return;
      await api('POST', `/api/items/${f.dataset.id}/split`, { steps });
      closeModal(); toast(`${say('split')} (${steps.length} Schritte)`, 'proud'); break;
    }
    case 'routine':
      if (!fd.title.trim()) return;
      await api('POST', '/api/routines', { name: fd.title, part: f.dataset.part }); break;
    case 'einkauf': case 'idee': case 'interesse':
      if (!fd.title.trim()) return;
      await api('POST', '/api/items', { title: fd.title.trim(), kind: f.dataset.form }); break;
    case 'pin':
      store.set('pin', (fd.pin || '').trim()); pinOpen = false; closeModal();
      try { await load(); pollDue(); toast('Willkommen zurück.'); } catch { /* askPin öffnet sich erneut */ }
      return;
    case 'lan':
      if (fd.lan_access === '1' && !/^\d{4,8}$/.test(fd.lan_pin || '')) { toast('Leg zuerst eine PIN mit 4–8 Ziffern fest.', 'alert'); return; }
      await api('PUT', '/api/settings', fd);
      toast(fd.lan_access === '1' ? 'Gespeichert. Starte Magnus neu, dann ist das Handy dran.' : 'Handy-Zugriff aus (nach Neustart).', 'think');
      break;
    case 'settings':
      await api('PUT', '/api/settings', fd); greetLine = ''; toast('Einstellungen gespeichert. Danke!'); break;
  }
  await load();
  const again = document.querySelector(`[data-form="${f.dataset.form}"] input[name=title]`);
  if (again) again.focus();
});

// Interessen-Notizen automatisch speichern
document.addEventListener('change', async e => {
  const id = e.target.dataset && e.target.dataset.notes;
  if (id) { await api('PUT', `/api/items/${id}`, { notes: e.target.value }); toast(say('saved_generic')); const it = byId(+id); if (it) it.notes = e.target.value; }
});
// Backup laden (Handy-Version)
document.addEventListener('change', async e => {
  if (e.target.id !== 'import-file' || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!confirm('Backup laden? Die aktuellen Daten auf diesem Gerät werden ersetzt.')) return;
    const r = await api('POST', '/api/import', data);
    toast(`Backup geladen – ${r.items} Einträge.`, 'proud'); greetLine = ''; await load();
  } catch (err) { if (err instanceof SyntaxError) toast('Die Datei konnte ich nicht lesen.', 'alert'); }
  e.target.value = '';
});
// Rückblick-Entwurf beim Tippen merken
document.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.review && review) review[e.target.dataset.review] = e.target.value;
});

// ---------------------------------------------------------------- Schnelleingabe
const cap = $('#capture-input'), prev = $('#capture-preview');
let capTimer;
cap.addEventListener('input', () => {
  clearTimeout(capTimer);
  const text = cap.value.trim();
  if (!text) { prev.innerHTML = ''; return; }
  capTimer = setTimeout(async () => {
    const p = await api('POST', '/api/parse', { text }).catch(() => null);
    if (!p || cap.value.trim() !== text) return;
    const chips = [`<span class="chip">${KINDS[p.kind]}</span>`];
    if (p.remind_at) chips.push(`<span class="chip soon">⏰ ${fmtDT(p.remind_at)}</span>`);
    if (p.repeat !== 'none') chips.push(`<span class="chip">🔁 ${REPEAT[p.repeat]}</span>`);
    if (p.project) chips.push(`<span class="chip proj">#${esc(p.project)}</span>`);
    if (p.priority) chips.push(`<span class="chip prio">${'!'.repeat(p.priority)}</span>`);
    if (p.minutes) chips.push(`<span class="chip">⏱ ${fmtMin(p.minutes)}</span>`);
    prev.innerHTML = `→ „${esc(p.title)}“ ${chips.join('')}`;
  }, 250);
});
$('#capture').addEventListener('submit', async e => {
  e.preventDefault();
  const text = cap.value.trim();
  if (!text) return;
  const r = await api('POST', '/api/capture', { text });
  cap.value = ''; prev.innerHTML = '';
  toast(`${say('saved')} → ${KINDS[r.parsed.kind]}${r.parsed.remind_at ? ' · ⏰ ' + fmtDT(r.parsed.remind_at) : ''}`);
  await load();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); cap.blur(); return; }
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'N' || e.key === '/') { e.preventDefault(); cap.focus(); }
});

// Regelmäßig aktualisieren (z. B. damit "überfällig" stimmt) – aber nicht beim Tippen
setInterval(() => {
  const active = document.activeElement;
  const typing = active && ['input', 'textarea', 'select'].includes((active.tagName || '').toLowerCase());
  if (!typing && $('#modal').classList.contains('hidden') && !F.running) load().catch(() => {});
}, 60000);

load().then(pollDue).catch(e => {
  if (e.message === 'PIN') return;
  $('#view').innerHTML = `<div class="card"><div class="magnus-row">${Magnus.face('sleepy', 64)}<div>Die Verbindung zu meinem Hauptprogramm ist gekappt. Läuft <b>companion.py</b> bzw. <b>start.bat</b>?</div></div></div>`;
});
