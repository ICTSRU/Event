/**
 * =====================================================================
 *  SRU Secure Access Kit v1.4 — applied to the Event Attendance & Management Platform (v3.4)
 *  Access: Sulaiman Al Rajhi University Google accounts (@sr.edu.sa) on the AllowedUsers list
 *  ICTD — ITOC
 * ---------------------------------------------------------------------
 *  Admin console + dashboard are served by this project (Admin.html / Dashboard.html).
 *  Deploy them as a SECOND web-app deployment:
 *      Execute as: Me  ·  Who has access: Anyone within Sulaiman Al Rajhi University
 *  The existing public deployment ("Anyone") keeps serving the visitor check-in / evaluation API only.
 *  Access log: every sign-in → sheet "AccessLog" · Access list: sheet "AllowedUsers"
 * =====================================================================
 */

/* ▼▼▼ CONFIG ▼▼▼ */
const APP_NAME       = 'منصة تسجيل حضور وإدارة الفعاليات';
const APP_NAME_EN    = 'Event Attendance & Management Platform';
const ALLOWED_DOMAIN = 'sr.edu.sa';
const FAVICON_URL    = 'https://ictsru.github.io/ITOC/assets/itoc-logo.png';

/* Secure platform URL (the "Anyone within Sulaiman Al Rajhi University" deployment, …/exec).
   Used for the link between the console and the dashboard and in access e-mails.
   Leave '' to set it from the console (⚙ الإعدادات) — it is then kept in Script Properties. */
const PLATFORM_URL   = '';
/* Public pages on GitHub Pages (folder that holds checkin.html / feedback.html) — used in QR codes.
   Leave '' to set it from the console (⚙ الإعدادات). Example: 'https://ictsru.github.io/event-attendance/' */
const PUBLIC_PAGES_URL = 'https://melmahdy-2030.github.io/event/';   // GitHub repo melmahdy-2030/event

/* Access log */
const LOG_ENABLED        = true;
const SHEET_LOG          = 'AccessLog';
const LOG_TIMEZONE       = 'Asia/Riyadh';
const LOG_DEDUP_MINUTES  = 30;            // same user within N min = one entry (0 = log every page open)
const LOG_RETENTION_DAYS = 180;           // menu: delete entries older than this

/* Access list (who may open the platform) */
const ACCESS_MODE        = 'LIST';        // 'LIST' = only active emails in AllowedUsers · 'DOMAIN' = any @sr.edu.sa account
const SHEET_ACCESS       = 'AllowedUsers';
const OWNER_EMAILS       = ['m.elmahdy@sr.edu.sa'];   // always allowed (admin), so the owner can never be locked out

/* Default access list — added by setupAccessList() (existing rows are kept). Trim to who needs this platform. */
const DEFAULT_ALLOWED = [
  // [email, name, role, notes]
  ['nabounar@sr.edu.sa',    'Nasser Abounar',  'admin', 'CIO'],
  ['m.elmahdy@sr.edu.sa',   'Mohamed ElMahdy', 'admin', 'Owner — IT Operations Manager'],
  ['n.nawaz@sr.edu.sa',     '', 'user', ''],
  ['m.omar@sr.edu.sa',      '', 'user', ''],
  ['m.saleh@sr.edu.sa',     '', 'user', ''],
  ['a.alrowedan@sr.edu.sa', '', 'user', ''],
  ['n.alrashidi@sr.edu.sa', '', 'user', ''],
  ['a.alawaji@sr.edu.sa',   '', 'user', ''],
  ['a.alaqeel@sr.edu.sa',   '', 'user', ''],
  ['a.alolayan@sr.edu.sa',  '', 'user', ''],
  ['s.albusayli@sr.edu.sa', '', 'user', ''],
  ['i.almutairi@sr.edu.sa', '', 'user', ''],
  ['a.elnadi@sr.edu.sa',    '', 'user', '']
];
const ACCESS_CACHE_SECONDS = 120;         // list changes take effect within 2 minutes
/* ▲▲▲ CONFIG ▲▲▲ */

const ROLE_LABELS   = { admin: 'مسؤول النظام', user: 'منظم فعاليات' };
const LOG_HEADERS   = ['timestamp', 'date', 'time', 'day', 'email', 'result', 'version'];
const DAYS_AR_      = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ACCESS_HEADERS = ['email', 'name', 'role', 'active', 'notes'];

/* ----------------------------- Secure pages ------------------------------ */

function platformUrl_() {
  return PLATFORM_URL || PropertiesService.getScriptProperties().getProperty('PLATFORM_URL') ||
    (function () { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } })();
}
function publicPagesUrl_() {
  return PUBLIC_PAGES_URL || PropertiesService.getScriptProperties().getProperty('PUBLIC_URL') || '';
}

/** Serves Admin.html (default) or Dashboard.html to allowed @sr.edu.sa users; Denied.html otherwise. */
function securePage_(page) {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status !== 'ok') {
    logAccess_(email || '(unknown)', status === 'list' ? 'not-listed' : 'denied');
    const d = HtmlService.createTemplateFromFile('Denied');
    d.appName = APP_NAME; d.appNameEn = APP_NAME_EN;
    d.userEmail = email || '';
    d.reason = status;
    return d.evaluate().setTitle(APP_NAME + ' | غير مصرح')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  logAccess_(email, 'granted');

  const isDash = page === 'dashboard';
  const t = HtmlService.createTemplateFromFile(isDash ? 'Dashboard' : 'Admin');
  t.serverJson = safeJson_({
    user: userInfo_(email),
    platformUrl: platformUrl_(),
    config: {
      VERSION: APP_VERSION,
      PUBLIC_URL: publicPagesUrl_(),
      CHECKIN_PAGE: 'checkin.html',
      ITOC_URL: 'https://ictsru.github.io/ITOC/#forms',
      SHEET_URL: ss_().getUrl(),
      TEST_EMAIL: email
    }
  });
  const out = t.evaluate()
    .setTitle((isDash ? 'لوحة مؤشرات الفعاليات' : APP_NAME) + ' | SRU — v' + APP_VERSION)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (FAVICON_URL) out.setFaviconUrl(FAVICON_URL);
  return out;
}

/**
 * Single entry point for the secure pages (google.script.run.api(action, payload)).
 * Every call re-checks the signed-in Google account against the access list.
 */
function api(action, payload) {
  const email = requireSruUser_();
  const user = userInfo_(email);
  const body = Object.assign({}, payload || {}, { action: String(action || '') });
  const r = adminAction_(user, body);
  return JSON.parse(JSON.stringify(r));          // plain, serialisable result
}

/* ------------------------------ Access ------------------------------ */

function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}
function isAllowed_(email) {
  return !!email && email.endsWith('@' + ALLOWED_DOMAIN);
}
function requireSruUser_() {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status === 'domain') throw new Error('غير مصرح — الدخول لمنسوبي الجامعة فقط');
  if (status === 'list') throw new Error('غير مصرح — حسابك غير مضاف إلى قائمة المصرّح لهم');
  return email;
}
function isOwner_(email) {
  return OWNER_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1;
}

/** 'ok' | 'domain' (not @sr.edu.sa) | 'list' (not on the active list) */
function accessStatus_(email) {
  if (!isAllowed_(email)) return 'domain';
  if (ACCESS_MODE !== 'LIST') return 'ok';
  if (isOwner_(email)) return 'ok';
  const a = aclMap_()[email];
  return a && a.active ? 'ok' : 'list';
}

function userInfo_(email) {
  const a = aclMap_()[email] || {};
  const role = isOwner_(email) ? 'admin' : (a.role === 'admin' ? 'admin' : 'user');
  return { email: email, name: a.name || '', role: role, roleLabel: ROLE_LABELS[role], mode: ACCESS_MODE };
}

/* ---------------------------- Access list --------------------------- */

/** { email: { name, role, active, notes } } from the AllowedUsers tab (cached briefly). */
function aclMap_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('acl_v2');
  if (hit) return JSON.parse(hit);
  const map = {};
  try {
    const sh = accessSheet_(false);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
        const e = String(r[0] || '').trim().toLowerCase();
        if (!e) return;
        map[e] = { name: String(r[1] || ''), role: String(r[2] || 'user').toLowerCase() === 'admin' ? 'admin' : 'user',
          active: !(r[3] === false || String(r[3]).toUpperCase() === 'FALSE'), notes: String(r[4] || '') };
      });
    }
  } catch (e) { console.error('aclMap_ failed: ' + e); }
  cache.put('acl_v2', JSON.stringify(map), ACCESS_CACHE_SECONDS);
  return map;
}

function accessSheet_(create) {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_ACCESS);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_ACCESS);
    sh.getRange(1, 1, 1, ACCESS_HEADERS.length).setValues([ACCESS_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    [260, 200, 100, 70, 260].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange(2, 4, 300, 1).insertCheckboxes();
    sh.getRange('A1').setNote('البريد الجامعي كاملًا — name@sr.edu.sa');
    sh.getRange('C1').setNote('admin = مسؤول النظام (إدارة المستخدمين والإعدادات) · user = منظم فعاليات');
    sh.getRange('D1').setNote('ألغِ العلامة لإيقاف الوصول دون حذف الصف');
  }
  return sh;
}

/** Run once from the editor (also called by setup): creates AllowedUsers and seeds owner + default list. */
function setupAccessList() {
  const sh = accessSheet_(true);
  const n = Math.max(sh.getLastRow() - 1, 0);
  const data = n ? sh.getRange(2, 1, n, 5).getValues() : [];
  const kept = data.filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return [String(r[0]).trim(), r[1], r[2], r[3] === true || String(r[3]).toUpperCase() === 'TRUE', r[4]]; });
  const have = kept.map(function (r) { return r[0].toLowerCase(); });
  const seed = OWNER_EMAILS.map(function (e) { return [e, 'Owner', 'admin', 'owner']; }).concat(DEFAULT_ALLOWED);
  let added = 0;
  seed.forEach(function (r) {
    const e = String(r[0]).trim().toLowerCase();
    if (e && have.indexOf(e) === -1) {
      kept.push([e, r[1] || '', r[2] || 'user', true, r[3] || 'added by setupAccessList']);
      have.push(e); added++;
    }
  });
  if (n) sh.getRange(2, 1, n, 5).clearContent();
  const rows = Math.max(n, kept.length, 50);
  sh.getRange(2, 4, rows, 1).insertCheckboxes();
  if (kept.length) sh.getRange(2, 1, kept.length, 5).setValues(kept);
  CacheService.getScriptCache().remove('acl_v2');
  console.log('AllowedUsers ready: ' + kept.length + ' entries (' + added + ' added).');
  try { SpreadsheetApp.getActive().toast('قائمة المصرّح لهم جاهزة: ' + kept.length + ' بريدًا (أُضيف ' + added + ').', SHEET_ACCESS, 8); } catch (e) {}
  return { total: kept.length, added: added };
}

/* ---- managed from the console («المستخدمون», admins only) ---- */

function aclList_() {
  const sh = accessSheet_(true);
  const last = lastAccessMap_();
  const users = [];
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
      const e = String(r[0] || '').trim().toLowerCase();
      if (!e) return;
      const role = isOwner_(e) || String(r[2]).toLowerCase() === 'admin' ? 'admin' : 'user';
      users.push({ email: e, name: String(r[1] || ''), role: role, roleLabel: ROLE_LABELS[role],
        active: isOwner_(e) || !(r[3] === false || String(r[3]).toUpperCase() === 'FALSE'),
        owner: isOwner_(e), notes: String(r[4] || ''), lastLogin: last[e] || '' });
    });
  }
  return { ok: true, users: users, roles: ROLE_LABELS, mode: ACCESS_MODE };
}

/** Writes to the first empty data row — never appendRow into a sheet with pre-inserted checkboxes (kit rule). */
function aclSave_(admin, b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!isAllowed_(email)) throw new Error('يجب أن يكون البريد جامعيًا ينتهي بـ @' + ALLOWED_DOMAIN);
  const role = b.role === 'admin' ? 'admin' : 'user';
  if (email === admin.email && role !== 'admin') throw new Error('لا يمكنك إزالة صلاحية المسؤول عن حسابك');
  const sh = accessSheet_(true);
  const n = Math.max(sh.getLastRow() - 1, 0);
  const col = n ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); }) : [];
  let idx = col.indexOf(email);
  const isNew = idx === -1;
  if (isNew) { idx = col.indexOf(''); if (idx === -1) idx = col.length; }
  const row = idx + 2;
  const name = clean_(b.name, 120);
  if (isNew) {
    sh.getRange(row, 4).insertCheckboxes();
    sh.getRange(row, 1, 1, 5).setValues([[email, name, role, true, 'أُضيف من المنصة بواسطة ' + admin.email]]);
  } else {
    sh.getRange(row, 2, 1, 2).setValues([[name || sh.getRange(row, 2).getValue(), role]]);
  }
  CacheService.getScriptCache().remove('acl_v2');
  if (isNew && b.notify !== false) {
    try { sendAccessMail_(email, name, role, admin); } catch (e) { console.error('access mail: ' + e); }
  }
  return { ok: true, created: isNew, updated: !isNew };
}

function aclSetActive_(admin, email, active) {
  email = String(email || '').trim().toLowerCase();
  if (email === admin.email) throw new Error('لا يمكنك إيقاف حسابك');
  if (isOwner_(email)) throw new Error('حساب المالك مصرّح له دائمًا (OWNER_EMAILS)');
  const list = aclList_().users;
  const u = list.filter(function (x) { return x.email === email; })[0];
  if (!u) throw new Error('المستخدم غير موجود');
  if (!active && u.role === 'admin' && list.filter(function (x) { return x.role === 'admin' && x.active; }).length <= 1)
    throw new Error('يجب أن يبقى مسؤول نظام واحد مفعّل على الأقل');
  const sh = accessSheet_(true);
  const col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); });
  sh.getRange(col.indexOf(email) + 2, 4).setValue(!!active);
  CacheService.getScriptCache().remove('acl_v2');
  return { ok: true };
}

function sendAccessMail_(email, name, role, admin) {
  const landing = PropertiesService.getScriptProperties().getProperty('LANDING_URL') || publicPagesUrl_() || platformUrl_();
  MailApp.sendEmail({
    to: email, name: SENDER_NAME,
    subject: 'صلاحية دخول إلى منصة الفعاليات | Access granted — ' + APP_NAME_EN,
    htmlBody: emailShell_({ EventName: APP_NAME },
      '<p dir="rtl" style="text-align:right">مرحبًا ' + esc_(name || '') + '،<br>منحك ' + esc_(admin.name || admin.email) +
      ' صلاحية <b>' + esc_(ROLE_LABELS[role]) + '</b> في ' + esc_(APP_NAME) + '.</p>' +
      '<p dir="rtl" style="text-align:right">الدخول بحسابك الجامعي <span dir="ltr">' + esc_(email) + '</span> — لا حاجة لكلمة مرور جديدة.</p>' +
      (landing ? '<p dir="rtl" style="text-align:right">رابط المنصة: <a href="' + esc_(landing) + '">' + esc_(landing) + '</a></p>' : '') +
      '<p dir="ltr" style="text-align:left;color:#6b5a80;font-size:13px">Sign in with your SRU Google account.</p>',
      { kicker: 'صلاحية الدخول · <span dir="ltr" style="white-space:nowrap">Access</span>', noMeta: true }),
    inlineImages: emailImages_(['sru', 'ictd', 'itoc']),
    body: 'Access granted to ' + APP_NAME_EN + (landing ? ': ' + landing : '')
  });
}

/* ---------------------------- Access log ---------------------------- */

/** Appends one row to AccessLog. Never blocks the page if logging fails. */
function logAccess_(email, result) {
  if (!LOG_ENABLED) return;
  try {
    if (LOG_DEDUP_MINUTES > 0 && result === 'granted') {
      const cache = CacheService.getScriptCache();
      const key = 'log_' + email;
      if (cache.get(key)) return;
      cache.put(key, '1', LOG_DEDUP_MINUTES * 60);
    }
    const now = new Date();
    const f = function (p) { return Utilities.formatDate(now, LOG_TIMEZONE, p); };
    getLogSheet_().appendRow([now, f('yyyy-MM-dd'), f('HH:mm:ss'), DAYS_AR_[Number(f('u')) % 7],
      email, result === 'granted' ? 'دخول' : (result === 'not-listed' ? 'غير مدرج' : 'مرفوض'), APP_VERSION]);
  } catch (e) {
    console.error('logAccess_ failed: ' + e);
  }
}

function getLogSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#3a1464');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    [170, 100, 80, 80, 260, 80, 70].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

/** Last successful sign-in per e-mail (scans the most recent 3000 log rows). */
function lastAccessMap_() {
  const map = {};
  try {
    const sh = getLogSheet_(), last = sh.getLastRow();
    if (last < 2) return map;
    const from = Math.max(2, last - 2999);
    sh.getRange(from, 2, last - from + 1, 5).getDisplayValues().forEach(function (r) {
      if (r[4] !== 'دخول') return;
      const e = String(r[3]).toLowerCase(), d = r[0] + ' ' + r[1];
      if (!map[e] || d > map[e]) map[e] = d;
    });
  } catch (e) {}
  return map;
}

/** Menu: quick summary of the last 30 days. */
function showLogSummary() {
  const sh = getLogSheet_();
  const ui = SpreadsheetApp.getUi();
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('سجل الدخول', 'لا توجد سجلات بعد.', ui.ButtonSet.OK); return; }
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues()
    .filter(function (r) { return r[0] instanceof Date && r[0] >= since && r[5] === 'دخول'; });
  const users = {};
  rows.forEach(function (r) { users[r[4]] = (users[r[4]] || 0) + 1; });
  const top = Object.keys(users).sort(function (a, b) { return users[b] - users[a]; }).slice(0, 10)
    .map(function (u, i) { return (i + 1) + '. ' + u + ' — ' + users[u]; }).join('\n');
  ui.alert('سجل الدخول — آخر 30 يومًا — ' + APP_NAME,
    'عدد الزيارات: ' + rows.length + '\nعدد المستخدمين: ' + Object.keys(users).length + '\n\nالأكثر دخولًا:\n' + (top || '—'),
    ui.ButtonSet.OK);
}

/** Menu: delete entries older than LOG_RETENTION_DAYS. */
function purgeOldLogs() {
  const sh = getLogSheet_();
  const last = sh.getLastRow();
  let removed = 0;
  if (last > 1) {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 864e5);
    const stamps = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = stamps.length - 1; i >= 0; i--) {
      if (stamps[i][0] instanceof Date && stamps[i][0] < cutoff) { sh.deleteRow(i + 2); removed++; }
    }
  }
  try { SpreadsheetApp.getActive().toast('حُذف ' + removed + ' سجل أقدم من ' + LOG_RETENTION_DAYS + ' يومًا.', APP_NAME_EN, 6); } catch (e) {}
}

/** Sheet menu (bound script). */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('منصة الفعاليات · Events Platform')
      .addItem('إعداد قائمة المصرّح لهم (AllowedUsers)', 'setupAccessList')
      .addSeparator()
      .addItem('ملخص سجل الدخول (30 يومًا)', 'showLogSummary')
      .addItem('حذف سجلات الدخول القديمة', 'purgeOldLogs')
      .addSeparator()
      .addItem('تفعيل الإرسال التلقائي لطلبات التقييم', 'installFeedbackTrigger')
      .addItem('عرض رابط المنصة', 'showWebAppUrl')
      .addToUi();
  } catch (e) { /* standalone script: no sheet UI */ }
}

function showWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('رابط ' + APP_NAME, platformUrl_() || 'لم يُنشر بعد: Deploy ▸ New deployment ▸ Web app', ui.ButtonSet.OK);
}

/* ----------------------------- Helpers ------------------------------ */

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function safeJson_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
