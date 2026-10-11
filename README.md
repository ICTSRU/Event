# SRU Event Attendance & Management Platform · منصة تسجيل حضور وإدارة الفعاليات — v2.5

QR-based attendance for any event: the organizer creates an event, prints its QR code, visitors scan and check in with name + e-mail, receive an automatic thank-you e-mail, and every check-in is stored in Google Sheets. The admin console produces attendance reports and sends e-mails to all attendees of an event.

## Components

| File | Purpose |
|---|---|
| `index.html` | Admin console — create/edit events, QR code + printable poster, attendance report (KPIs, hourly chart, CSV/Excel, print/PDF), bulk e-mail, all-events overview |
| `dashboard.html` | Events & attendance dashboard — KPIs, attendees per event, monthly trend, check-ins by hour/weekday, internal vs external, top domains, events summary, repeat attendees; filters, auto-refresh, Excel export, print/PDF |
| `feedback.html` | Event evaluation page opened from the evaluation e-mail — 5-point Likert satisfaction + open suggestions; personal signed link |
| `checkin.html` | Public check-in page opened by the QR code (`checkin.html?e=EVENT_ID`) — bilingual, mobile-first |
| `assets/config.js` | Set `API_URL` (Apps Script Web App URL) |
| `assets/api.js` | API client + built-in DEMO backend (used when `API_URL` is empty) |
| `assets/sru-theme.css` | SRU identity tokens (purple #501e8c, blue #0a6eaa, Cairo, RTL) |
| `assets/logo-*.png` | **Add these:** `logo-sru.png`, `logo-ictd.png`, `logo-itoc.png` (text fallbacks show until added) |
| `apps-script/Code.gs` | Backend — Sheets storage, thank-you e-mail, reports, bulk e-mail |
| `apps-script/Feedback.gs` | Event evaluation: signed links, responses (sheet `Feedback`), manual/automatic sending — add as a third script file |
| `apps-script/EmailAssets.gs` | Logos and check icon embedded in e-mails (inline images) — add as a second script file |
| `apps-script/appsscript.json` | Manifest (Asia/Riyadh, minimal scopes, Web App settings) |

## Data model (Google Sheet)

| Sheet | Columns |
|---|---|
| `Events` | EventID, EventName, Location, StartDateTime, EndDateTime, Organizer, Description, Status (Open/Closed), CreatedAt, UpdatedAt |
| `Attendance` | Timestamp, EventID, EventName, FullName, Email, ThankYouSent, UserAgent |
| `Feedback` | Timestamp, EventID, EventName, FullName, Email, Rating (1–5), Comment, UpdatedAt |
| `MailLog` | Timestamp, EventID, Subject, Recipients, Sent, Failed, Notes |

## Setup (≈10 minutes)

1. **Create a Google Sheet** (e.g. *ICTD Event Attendance*) using the account that should send the e-mails.
2. **Extensions → Apps Script.** Replace `Code.gs` with `apps-script/Code.gs`, then add a new script file **EmailAssets** (＋ → Script) and paste `apps-script/EmailAssets.gs`. Enable *Project Settings → Show appsscript.json* and paste `apps-script/appsscript.json`.
3. Run **`setup()`** once and approve permissions. Open *Executions / Logs* and copy the **ADMIN_KEY** (stored in *Project Settings → Script properties*; change it there any time).
4. **Deploy → New deployment → Web app** — *Execute as: Me*, *Who has access: Anyone*. Copy the `/exec` URL.
5. Put the URL in `assets/config.js` → `API_URL` (or paste it in the console under **الإعدادات / Settings**).
6. Add the three logo PNGs to `assets/`, push the folder to GitHub, and enable **GitHub Pages**.
7. Open `index.html`, enter the admin key in Settings, create an event, print the QR poster.

> After editing `Code.gs`, use **Deploy → Manage deployments → Edit → New version** so the same `/exec` URL keeps working.

## Security notes

- *Anyone* access is required so visitors can check in without signing in. Only `getEvent` and `checkin` are public; every admin action requires the **ADMIN_KEY**.
- The admin key is kept in the admin's browser (localStorage) — do not use the console on shared PCs, and rotate the key in Script properties if exposed.
- Inputs are length-limited, e-mail validated, HTML-escaped in e-mails, and protected against spreadsheet formula injection. Duplicate check-ins (same e-mail + event) are ignored.
- Check-in is accepted only while the event status is **Open**.

## E-mail limits

`MailApp` daily quota: ~1,500 recipients/day on Google Workspace (100 on consumer Gmail). The console shows the remaining quota; bulk sends stop at the limit and log the skipped count in `MailLog`.

## Demo mode

With `API_URL` empty the whole flow works locally (events and check-ins stored in the browser, no e-mails sent) — useful for a walkthrough before deployment.

---
Executive Directorate of Communications & IT — Sulaiman Al Rajhi University · ITOC
