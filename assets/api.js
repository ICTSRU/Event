/* SRU Event Attendance & Management Platform — API client (v1.4)
 * Talks to the Apps Script Web App. If no API URL is configured, a local
 * DEMO backend (localStorage) is used so the UI can be tried immediately.
 */
(function () {
  const cfg = window.EA_CONFIG || {};

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  }

  // Extract a clean Apps Script /exec URL from whatever was pasted (quotes, "API_URL:", spaces…)
  function cleanUrl(v) {
    const m = String(v || '').match(/https:\/\/script\.google\.com\/[^\s'"`,;]+?\/exec/);
    return m ? m[0] : '';
  }
  function apiUrl() { return cleanUrl(store('ea_api_url')) || cleanUrl(cfg.API_URL); }
  function isDemo() { return !apiUrl(); }

  async function call(action, payload) {
    const body = Object.assign({ action: action, key: store('ea_admin_key') || '' }, payload || {});
    if (isDemo()) return demo(action, body);
    let res;
    try {
      // text/plain avoids a CORS pre-flight with Apps Script
      res = await fetch(apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('تعذر الاتصال بالخادم — تأكد من رابط Web App وأن النشر متاح لـ Anyone | Network error');
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Unexpected server response — check the Web App URL and access setting'); }
    if (!data.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data: data });
    return data;
  }

  /* ---------------- DEMO backend ---------------- */
  function db() {
    try { return JSON.parse(store('ea_demo_db') || '{"events":[],"att":[]}'); }
    catch (e) { return { events: [], att: [] }; }
  }
  function save(d) { store('ea_demo_db', JSON.stringify(d)); }
  function nowIso() {
    const d = new Date(); const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function newId() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = '';
    for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)];
    const d = nowIso(); return 'EV-' + d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10) + '-' + r;
  }
  function fail(msg) { return Promise.reject(new Error(msg)); }

  function demo(action, b) {
    const d = db();
    const find = id => d.events.find(e => e.id === id);
    switch (action) {
      case 'verify': return Promise.resolve({ ok: true });
      case 'quota': return Promise.resolve({ ok: true, remaining: 100 });
      case 'getEvent': {
        const e = find(b.id); return e ? Promise.resolve({ ok: true, event: e }) : fail('Event not found');
      }
      case 'listEvents':
        return Promise.resolve({ ok: true, quota: 100, events: d.events.map(e => Object.assign({}, e, { attendees: d.att.filter(a => a.eventId === e.id).length })).sort((a, b) => String(b.start).localeCompare(a.start)) });
      case 'createEvent': {
        const e = Object.assign({}, b.event, { id: newId(), status: 'Open', createdAt: nowIso() });
        if (!e.name || !e.location || !e.start) return fail('Name, location and start time are required');
        d.events.push(e); save(d); return Promise.resolve({ ok: true, id: e.id });
      }
      case 'updateEvent': {
        const e = find(b.event.id); if (!e) return fail('Event not found');
        Object.assign(e, b.event); save(d); return Promise.resolve({ ok: true, id: e.id });
      }
      case 'setStatus': {
        const e = find(b.id); if (!e) return fail('Event not found');
        e.status = b.status; save(d); return Promise.resolve({ ok: true });
      }
      case 'checkin': {
        const e = find(b.id); if (!e) return fail('Event not found');
        if (e.status !== 'Open') return Promise.reject(Object.assign(new Error('Registration for this event is closed'), { data: { closed: true } }));
        const email = String(b.email || '').trim().toLowerCase();
        if (d.att.some(a => a.eventId === e.id && a.email === email)) return Promise.resolve({ ok: true, duplicate: true, event: e });
        d.att.push({ eventId: e.id, time: nowIso(), name: String(b.name).trim(), email: email, thankYou: 'Demo (not sent)' });
        save(d); return Promise.resolve({ ok: true, duplicate: false, emailSent: false, event: e });
      }
      case 'getAttendance': {
        const e = find(b.id); if (!e) return fail('Event not found');
        return Promise.resolve({ ok: true, event: e, attendees: d.att.filter(a => a.eventId === e.id) });
      }
      case 'sendBulk': {
        const n = new Set(d.att.filter(a => a.eventId === b.id).map(a => a.email)).size;
        return Promise.resolve({ ok: true, recipients: n, sent: 0, failed: 0, skipped: 0, remaining: 100, demo: true });
      }
    }
    return fail('Unknown action');
  }

  window.EA = { call: call, isDemo: isDemo, apiUrl: apiUrl, cleanUrl: cleanUrl, store: store, cfg: cfg };
})();
