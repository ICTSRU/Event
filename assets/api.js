/* SRU Event Attendance & Management Platform — API client (v5.1)
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

  const PUBLIC = ['getEvent', 'checkin', 'checkStatus', 'fbInfo', 'feedback'];

  // Safe to repeat: reads, and writes that are idempotent on the server (feedback is an upsert)
  const RETRY = ['getEvent', 'checkStatus', 'fbInfo', 'feedback', 'rate'];
  // Public actions sent by POST (body, not URL) — avoids privacy/ad-block filters that block URLs like "?action=feedback"
  const PUBLIC_POST = ['rate', 'login', 'forgotPassword', 'resetWithCode'];

  // Session token (v5.1): sessionStorage by default, localStorage when "remember me" is ticked
  function token() {
    try { return sessionStorage.getItem('ea_token') || localStorage.getItem('ea_token') || ''; } catch (e) { return ''; }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function call(action, payload) {
    const tries = RETRY.indexOf(action) >= 0 ? 3 : 1;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try { return await call1(action, payload, action === 'rate' && i > 0); }
      catch (e) {
        lastErr = e;
        if (e.data || i === tries - 1) throw e;   // server answered with an error → do not retry
        await wait(1200 * (i + 1));
      }
    }
    throw lastErr;
  }

  async function call1(action, payload, forceGet) {
    const isPublic = PUBLIC.indexOf(action) >= 0 || PUBLIC_POST.indexOf(action) >= 0;
    // never send the admin key from public (visitor) pages
    const body = Object.assign({ action: action }, isPublic ? {} : { token: token() }, payload || {});
    if (isDemo()) return demo(action === 'rate' ? 'feedback' : action, body);
    let res;
    try {
      if (PUBLIC.indexOf(action) >= 0 || forceGet) {
        // Public (visitor) calls use a simple GET — most reliable on iPhone/Safari with Apps Script redirects
        const q = new URLSearchParams();
        Object.keys(body).forEach(k => { if (k !== 'key' && body[k] != null) q.set(k, body[k]); });
        q.set('_', Date.now());
        res = await fetch(apiUrl() + '?' + q.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' });
      } else {
        // text/plain avoids a CORS pre-flight with Apps Script
        res = await fetch(apiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body)
        });
      }
    } catch (e) {
      throw Object.assign(new Error('تعذر الاتصال بالخادم — تأكد من رابط Web App وأن النشر متاح لـ Anyone | Network error'), { cause: action + ': ' + (e && e.message || e) });
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Unexpected server response — check the Web App URL and access setting'); }
    if (!data.ok) {
      if (data.auth) { try { window.dispatchEvent(new CustomEvent('ea:unauth', { detail: data.error })); } catch (e) {} }
      throw Object.assign(new Error(data.error || 'Request failed'), { data: data });
    }
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
      case 'me': case 'login': return Promise.resolve({ ok: true, token: 'demo', version: cfg.VERSION, user: { email: 'demo@sr.edu.sa', name: 'مستخدم تجريبي', role: 'admin', roleLabel: 'مسؤول النظام' } });
      case 'logout': case 'changePassword': case 'forgotPassword': case 'resetWithCode': return Promise.resolve({ ok: true });
      case 'listUsers': return Promise.resolve({ ok: true, roles: { admin: 'مسؤول النظام', organizer: 'منظم فعاليات' }, users: [{ email: 'demo@sr.edu.sa', name: 'مستخدم تجريبي', role: 'admin', roleLabel: 'مسؤول النظام', active: true, lastLogin: nowIso().replace('T', ' ') }] });
      case 'saveUser': case 'resetUserPassword': case 'setUserActive': return Promise.resolve({ ok: true, demo: true });
      case 'quota': return Promise.resolve({ ok: true, remaining: 100 });
      case 'getEvent': {
        const e = find(b.id); return e ? Promise.resolve({ ok: true, event: e }) : fail('Event not found');
      }
      case 'listEvents':
        return Promise.resolve({ ok: true, quota: 100, version: cfg.VERSION, events: d.events.map(e => Object.assign({}, e, { attendees: d.att.filter(a => a.eventId === e.id).length })).sort((a, b) => String(b.start).localeCompare(a.start)) });
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
      case 'checkStatus': {
        const em = String(b.email || '').trim().toLowerCase();
        return Promise.resolve({ ok: true, registered: d.att.some(a => a.eventId === b.id && a.email === em), emailSent: false });
      }
      case 'dashboard':
        return Promise.resolve({ ok: true, events: d.events, attendance: d.att.map(a => ({ e: a.eventId, t: a.time, n: a.name, m: a.email, s: a.thankYou })), feedback: (d.fb || []), generatedAt: nowIso() });
      case 'fbInfo': {
        const e = find(b.id); if (!e) return fail('Event not found');
        if (String(b.test) === '1') return Promise.resolve({ ok: true, event: e, name: 'نسخة تجريبية · Test', test: true, previous: null });
        const em = String(b.email || '').toLowerCase();
        const a = d.att.find(x => x.eventId === e.id && x.email === em); if (!a) return fail('رابط التقييم غير صالح | Invalid evaluation link');
        const prev = (d.fb || []).find(x => x.e === e.id && x.m === em);
        return Promise.resolve({ ok: true, event: e, name: a.name, previous: prev ? { rating: prev.r, comment: prev.c } : null });
      }
      case 'feedback': {
        if (String(b.test) === '1') return Promise.resolve({ ok: true, test: true });
        const em = String(b.email || '').toLowerCase(); const r = +b.r;
        if (!(r >= 1 && r <= 5)) return fail('يرجى اختيار التقييم | Please select a rating');
        d.fb = d.fb || []; const prev = d.fb.find(x => x.e === b.id && x.m === em);
        const a = d.att.find(x => x.eventId === b.id && x.email === em) || {};
        if (prev) { prev.r = r; prev.c = b.c || ''; } else d.fb.push({ e: b.id, t: nowIso(), n: a.name || '', m: em, r: r, c: b.c || '' });
        save(d); return Promise.resolve({ ok: true, updated: !!prev });
      }
      case 'feedbackStatus': {
        const fb = (d.fb || []).filter(x => x.e === b.id);
        const n = new Set(d.att.filter(a => a.eventId === b.id).map(a => a.email)).size;
        return Promise.resolve({ ok: true, attendees: n, responses: fb.length, average: fb.length ? Math.round(fb.reduce((s, x) => s + x.r, 0) / fb.length * 100) / 100 : 0, sentAt: (d.fbSent || {})[b.id] || '' });
      }
      case 'testFeedback':
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(b.to || '')) ? Promise.resolve({ ok: true, to: b.to, demo: true }) : fail('بريد غير صالح | Invalid e-mail');
      case 'sendFeedback': {
        d.fbSent = d.fbSent || {}; d.fbSent[b.id] = nowIso(); save(d);
        const answered = new Set((d.fb || []).filter(x => x.e === b.id).map(x => x.m));
        const n = new Set(d.att.filter(a => a.eventId === b.id && !answered.has(a.email)).map(a => a.email)).size;
        return Promise.resolve({ ok: true, recipients: n, sent: 0, failed: 0, skipped: 0, alreadyAnswered: answered.size, demo: true });
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

  window.EA = { call: call, isDemo: isDemo, apiUrl: apiUrl, cleanUrl: cleanUrl, store: store, cfg: cfg, token: token };
})();
