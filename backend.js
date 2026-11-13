/* Magnus – eigenständiges Handy-Backend.
   Ersetzt den PC-Server: alle Daten liegen im Speicher dieses Geräts (localStorage).
   Bietet dieselben /api/...-Routen wie companion.py, damit die Oberfläche unverändert bleibt. */
const LocalAPI = (() => {
  const KEY = 'magnus_db_v1';
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtS = d => fmt(d) + ':' + pad(d.getSeconds());
  const dayKey = d => fmt(d).slice(0, 10);
  const parse = s => { const [a, b = '00:00'] = s.split('T'); const [y, m, d] = a.split('-').map(Number); const [h, mi, se] = b.split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0, se || 0); };
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

  const DEFAULT_SETTINGS = { name: '', nag_minutes: '5', os_notify: '1', focus_minutes: '25' };
  const DEFAULT_ROUTINES = [
    ['Ein Glas Wasser trinken', 'morgen'], ['Tagesplan anschauen (Was jetzt?)', 'morgen'], ['Bett machen', 'morgen'],
    ['Sachen für morgen bereitlegen', 'abend'], ['Abend-Rückblick (2 Minuten)', 'abend'], ['Handy 30 Min vor dem Schlafen weglegen', 'abend'],
  ];
  const ITEM_FIELDS = ['title', 'notes', 'kind', 'project', 'status', 'priority', 'energy', 'minutes', 'due',
    'remind_at', 'repeat', 'today', 'parent_id', 'postponed'];

  // ------------------------------------------------------------ Speicher
  let db;
  function fresh() {
    return {
      items: [], done_log: [], routines: DEFAULT_ROUTINES.map(([name, part], i) => ({ id: i + 1, name, part, sort: i })),
      routine_log: [], reviews: [], focus_log: [], settings: { ...DEFAULT_SETTINGS },
      seq: { items: 0, done_log: 0, routines: DEFAULT_ROUTINES.length, focus_log: 0 },
    };
  }
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
    if (!db) { db = fresh(); save(); }
    db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { throw new Error('Speicher voll oder gesperrt – bitte ein Backup machen.'); }
  }
  const nextId = t => (db.seq[t] = (db.seq[t] || 0) + 1);
  load();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* egal */ }

  // ------------------------------------------------------------ Schnelleingabe-Parser
  const WEEKDAYS = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0 };
  const WD_RE = Object.keys(WEEKDAYS).join('|');
  const KIND_TAGS = { pflicht: 'pflicht', aufgabe: 'aufgabe', todo: 'aufgabe', idee: 'idee', einkauf: 'einkauf', kaufen: 'einkauf',
    interesse: 'interesse', thema: 'interesse', inbox: 'inbox', notiz: 'inbox' };
  const DAYTIME = { morgens: [8, 0], vormittags: [10, 0], mittags: [12, 0], nachmittags: [15, 0], abends: [19, 0], nachts: [22, 0] };
  const L = '(?<![\\p{L}\\d])', R = '(?![\\p{L}\\d])';
  const rx = src => new RegExp(src, 'iu');

  function parseCapture(text, now = new Date()) {
    let t = ' ' + String(text).trim() + ' ';
    const res = { kind: null, project: '', priority: 0, minutes: 0, repeat: 'none' };
    const f = { date: null, time: null, rel: null, weekday: null };
    const cut = m => { t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); };
    let m;

    for (const tm of [...t.matchAll(/#([\p{L}\d_-]+)/gu)].reverse()) {
      const tag = tm[1].toLowerCase();
      if (KIND_TAGS[tag]) res.kind = KIND_TAGS[tag]; else res.project = tm[1];
      cut(tm);
    }
    if ((m = t.match(/(?<!\S)(!{1,3})(?!\S)/))) { res.priority = Math.min(m[1].length, 2); cut(m); }
    if ((m = t.match(rx(`~\\s*(\\d+)\\s*(min|m|std|h)${R}`)))) { res.minutes = /^(std|h)$/i.test(m[2]) ? +m[1] * 60 : +m[1]; cut(m); }
    if ((m = t.match(rx(`${L}jeden\\s+(${WD_RE})${R}`)))) { res.repeat = 'weekly'; f.weekday = WEEKDAYS[m[1].toLowerCase()]; cut(m); }
    for (const [src, rep] of [[`${L}(jeden\\s+tag|täglich)${R}`, 'daily'], [`${L}werktags${R}`, 'weekdays'],
      [`${L}(jede\\s+woche|wöchentlich)${R}`, 'weekly'], [`${L}(jeden\\s+monat|monatlich)${R}`, 'monthly']]) {
      if ((m = t.match(rx(src)))) { res.repeat = rep; cut(m); }
    }
    if ((m = t.match(rx(`${L}in\\s+(\\d+)\\s*(minuten|minute|min|m|stunden|stunde|std|h|tagen|tage|tag|d)${R}`)))) {
      const n = +m[1], u = m[2].toLowerCase();
      if (u[0] === 'm') f.rel = new Date(now.getTime() + n * 60000);
      else if (['stunden', 'stunde', 'std', 'h'].includes(u)) f.rel = new Date(now.getTime() + n * 3600000);
      else f.rel = at(addDays(now, n), 9, 0);
      cut(m);
    }
    if ((m = t.match(rx(`${L}(übermorgen|morgen|heute)${R}`)))) {
      f.date = addDays(startOfDay(now), { heute: 0, morgen: 1, 'übermorgen': 2 }[m[1].toLowerCase()]); cut(m);
    }
    if (!f.date && (m = t.match(rx(`${L}(?:am\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?`)))) {
      const d = +m[1], mo = +m[2];
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
      let cand = new Date(y, mo - 1, d);
      if (cand.getMonth() === mo - 1 && cand.getDate() === d) {
        if (!m[3] && cand < startOfDay(now)) cand = new Date(y + 1, mo - 1, d);
        f.date = cand; cut(m);
      }
    }
    if (!f.date && (m = t.match(rx(`${L}(?:am\\s+|nächsten\\s+|kommenden\\s+)?(${WD_RE})${R}`)))) {
      const wd = WEEKDAYS[m[1].toLowerCase()];
      f.date = addDays(startOfDay(now), ((wd - now.getDay() + 7) % 7) || 7); cut(m);
    }
    for (const src of [`${L}(?:um\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*uhr${R}`, `${L}(?:um\\s+)?(\\d{1,2}):(\\d{2})${R}`, `${L}um\\s+(\\d{1,2})()${R}`]) {
      m = t.match(rx(src));
      if (m && +m[1] < 24 && +(m[2] || 0) < 60) { f.time = [+m[1], +(m[2] || 0)]; cut(m); break; }
    }
    if (!f.time && (m = t.match(rx(`${L}(morgens|vormittags|nachmittags|mittags|abends|nachts)${R}`)))) {
      f.time = DAYTIME[m[1].toLowerCase()]; cut(m);
    }

    let dt = null;
    if (f.rel) dt = f.rel;
    else if (f.date || f.time || res.repeat !== 'none') {
      const [hh, mm] = f.time || [9, 0];
      let d;
      if (f.date) d = f.date;
      else if (f.weekday !== null) { d = addDays(startOfDay(now), (f.weekday - now.getDay() + 7) % 7); if (at(d, hh, mm) <= now) d = addDays(d, 7); }
      else { d = startOfDay(now); if (at(d, hh, mm) <= now) d = addDays(d, 1); }
      dt = at(d, hh, mm);
    }
    if (dt && res.repeat === 'weekdays') while (dt.getDay() === 0 || dt.getDay() === 6) dt = addDays(dt, 1);

    res.title = t.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '') || String(text).trim();
    res.remind_at = dt ? fmt(dt) : null;
    res.due = res.remind_at;
    if (!res.kind) res.kind = (dt || res.project || res.priority || res.minutes) ? 'aufgabe' : 'inbox';
    return res;
  }

  // ------------------------------------------------------------ Wiederholungen
  function advance(d, rep) {
    if (rep === 'daily') return addDays(d, 1);
    if (rep === 'weekly') return addDays(d, 7);
    if (rep === 'weekdays') { let x = addDays(d, 1); while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1); return x; }
    if (rep === 'monthly') {
      const x = new Date(d); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + 1);
      x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x;
    }
    return d;
  }
  function nextOccurrence(start, rep, now = new Date()) {
    let d = advance(start, rep);
    while (d <= now) d = advance(d, rep);
    return d;
  }

  // ------------------------------------------------------------ Logik
  const clone = o => JSON.parse(JSON.stringify(o));
  const item = id => db.items.find(i => i.id === id);

  function cleanItem(data) {
    const out = {};
    for (const k of ITEM_FIELDS) {
      if (!(k in data)) continue;
      let v = data[k];
      if (['due', 'remind_at', 'today'].includes(k) && !v) v = null;
      if (['priority', 'minutes', 'postponed'].includes(k)) v = parseInt(v || 0, 10) || 0;
      out[k] = v;
    }
    return out;
  }
  function createItem(data) {
    const d = cleanItem(data);
    if (!(d.title || '').trim()) throw new Error('Titel fehlt');
    const it = {
      id: nextId('items'), title: '', notes: '', kind: 'inbox', project: '', status: 'offen', priority: 0, energy: 'mittel',
      minutes: 0, due: null, remind_at: null, repeat: 'none', last_notified: null, today: null, parent_id: null,
      postponed: 0, created_at: fmt(new Date()), done_at: null, ...d,
    };
    db.items.push(it);
    return it.id;
  }
  function completeItem(id) {
    const r = item(id); if (!r) return;
    const now = new Date();
    db.done_log.push({ id: nextId('done_log'), item_id: id, title: r.title, kind: r.kind, done_at: fmt(now) });
    if (r.repeat && r.repeat !== 'none' && r.remind_at) {
      const old = parse(r.remind_at), nxt = nextOccurrence(old, r.repeat, now);
      if (r.due) r.due = fmt(new Date(parse(r.due).getTime() + (nxt - old)));
      Object.assign(r, { remind_at: fmt(nxt), last_notified: null, postponed: 0, today: null });
    } else Object.assign(r, { status: 'erledigt', done_at: fmt(now) });
  }

  function getState() {
    const today = dayKey(new Date());
    const weekAgo = dayKey(addDays(new Date(), -6));
    return clone({
      now: fmt(new Date()), today,
      items: db.items.filter(i => i.status === 'offen' || (i.done_at || '') >= weekAgo).sort((a, b) => b.id - a.id),
      routines: [...db.routines].sort((a, b) => a.part.localeCompare(b.part) || a.sort - b.sort || a.id - b.id),
      routine_done: db.routine_log.filter(r => r.day === today).map(r => r.routine_id),
      done_log: db.done_log.filter(d => d.done_at >= weekAgo).sort((a, b) => b.done_at.localeCompare(a.done_at)),
      focus_log: db.focus_log.filter(f => f.started_at >= weekAgo).sort((a, b) => b.started_at.localeCompare(a.started_at)),
      reviews: [...db.reviews].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14),
      settings: db.settings,
    });
  }
  const dueItems = () => db.items.filter(i => i.status === 'offen' && i.remind_at && i.remind_at <= fmt(new Date()))
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at));

  function exportAll() {
    return clone({
      items: db.items, done_log: db.done_log, routines: db.routines, routine_log: db.routine_log, reviews: db.reviews,
      focus_log: db.focus_log, settings: Object.entries(db.settings).map(([key, value]) => ({ key, value })),
    });
  }
  // Nimmt Backups vom PC oder vom Handy an
  function importAll(data) {
    if (!data || !Array.isArray(data.items)) throw new Error('Das ist keine Magnus-Backup-Datei.');
    const n = fresh();
    for (const t of ['items', 'done_log', 'routines', 'routine_log', 'reviews', 'focus_log']) if (Array.isArray(data[t])) n[t] = data[t];
    const st = Array.isArray(data.settings) ? Object.fromEntries(data.settings.map(s => [s.key, s.value])) : (data.settings || {});
    n.settings = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in st) n.settings[k] = String(st[k]);
    for (const t of ['items', 'done_log', 'routines', 'focus_log']) n.seq[t] = n[t].reduce((a, x) => Math.max(a, x.id || 0), 0);
    db = n; save();
    return { ok: true, items: n.items.length };
  }

  // ------------------------------------------------------------ Benachrichtigungen
  async function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200], tag: 'magnus-' + body, renotify: true };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return true; }
    } catch { /* Fallback unten */ }
    try { new Notification(title, opts); return true; } catch { return false; }
  }
  function checkDue() {
    load();   // falls ein anderer Tab etwas geändert hat
    const now = new Date(), nag = parseInt(db.settings.nag_minutes || 0, 10);
    let changed = false;
    for (const r of dueItems()) {
      if (r.last_notified) {
        if (nag <= 0) continue;
        if (parse(r.last_notified) > new Date(now.getTime() - nag * 60000)) continue;
      }
      if (db.settings.os_notify === '1') notify('✦ Magnus erinnert dich', r.title);
      r.last_notified = fmtS(now); changed = true;
    }
    if (changed) save();
  }
  setInterval(checkDue, 30000);
  setTimeout(checkDue, 2000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDue(); });

  // ------------------------------------------------------------ Routen
  function route(method, path, data) {
    let m;
    if (method === 'GET') {
      if (path === '/api/state') return getState();
      if (path === '/api/due') return clone(dueItems());
      if (path === '/api/export') return exportAll();
      return null;
    }
    if (path === '/api/parse') return parseCapture(data.text || '');
    if (path === '/api/capture') {
      const text = (data.text || '').trim();
      if (!text) throw new Error('Leere Eingabe');
      const parsed = parseCapture(text);
      return { id: createItem(parsed), parsed };
    }
    if (path === '/api/items' && method === 'POST') return { id: createItem(data) };
    if ((m = path.match(/^\/api\/items\/(\d+)(?:\/(\w+))?$/))) {
      const id = +m[1], action = m[2], it = item(id);
      if (!action && method === 'PUT') { if (it) { const d = cleanItem(data); if ('remind_at' in d) d.last_notified = null; Object.assign(it, d); } return { ok: true }; }
      if (!action && method === 'DELETE') { db.items = db.items.filter(i => i.id !== id && i.parent_id !== id); return { ok: true }; }
      if (!it) return null;
      if (action === 'done') { completeItem(id); return { ok: true }; }
      if (action === 'undo') {
        Object.assign(it, { status: 'offen', done_at: null });
        const last = db.done_log.filter(d => d.item_id === id).reduce((a, d) => (!a || d.id > a.id ? d : a), null);
        if (last) db.done_log = db.done_log.filter(d => d !== last);
        return { ok: true };
      }
      if (action === 'snooze') {
        it.remind_at = data.until || fmt(new Date(Date.now() + (parseInt(data.minutes, 10) || 10) * 60000));
        it.last_notified = null; return { ok: true };
      }
      if (action === 'postpone') { it.postponed = (it.postponed || 0) + 1; return { ok: true }; }
      if (action === 'split') {
        const steps = (data.steps || []).map(s => s.trim()).filter(Boolean);
        for (const s of steps) createItem({ title: s, kind: it.kind !== 'inbox' ? it.kind : 'aufgabe', project: it.project, parent_id: id, energy: 'niedrig', minutes: 10 });
        it.postponed = 0; return { ok: true, count: steps.length };
      }
    }
    if (path === '/api/routines' && method === 'POST') {
      const name = (data.name || '').trim(); if (!name) throw new Error('Name fehlt');
      db.routines.push({ id: nextId('routines'), name, part: data.part || 'morgen', sort: 999 }); return { ok: true };
    }
    if ((m = path.match(/^\/api\/routines\/(\d+)(?:\/(\w+))?$/))) {
      const rid = +m[1];
      if (!m[2] && method === 'DELETE') { db.routines = db.routines.filter(r => r.id !== rid); db.routine_log = db.routine_log.filter(r => r.routine_id !== rid); return { ok: true }; }
      if (m[2] === 'toggle') {
        const day = dayKey(new Date());
        const has = db.routine_log.some(r => r.routine_id === rid && r.day === day);
        db.routine_log = has ? db.routine_log.filter(r => !(r.routine_id === rid && r.day === day)) : [...db.routine_log, { routine_id: rid, day }];
        return { ok: true };
      }
    }
    if (path === '/api/review') {
      const day = data.day || dayKey(new Date());
      const rv = { day, mood: parseInt(data.mood || 0, 10), wins: data.wins || '', tomorrow: data.tomorrow || '', note: data.note || '' };
      db.reviews = db.reviews.filter(r => r.day !== day).concat(rv); return { ok: true };
    }
    if (path === '/api/focus') {
      db.focus_log.push({ id: nextId('focus_log'), item_id: data.item_id || null, title: data.title || 'Freier Fokus',
        minutes: parseInt(data.minutes || 0, 10), started_at: data.started_at || fmt(new Date()) });
      return { ok: true };
    }
    if (path === '/api/settings' && method === 'PUT') {
      for (const [k, v] of Object.entries(data)) if (k in DEFAULT_SETTINGS) db.settings[k] = String(v);
      return { ok: true };
    }
    if (path === '/api/notify') { notify(data.title || '✦ Magnus', data.msg || 'So sehen meine Erinnerungen aus.'); return { ok: true }; }
    if (path === '/api/import') return importAll(data);
    return null;
  }

  async function handle(method, url, body) {
    const path = url.split('?')[0];
    if (method !== 'GET') load();
    const res = route(method, path, body || {});
    if (res === null) throw new Error('Nicht gefunden');
    if (method !== 'GET') save();
    return res;
  }

  return { handle, parseCapture, nextOccurrence, notify };
})();
window.LocalAPI = LocalAPI;
