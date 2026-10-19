# منصة تسجيل حضور وإدارة الفعاليات · Event Attendance & Management Platform — v4.7

QR attendance, thank-you and evaluation e-mails, agenda, reports and dashboard for SRU events.
From v3.3 the admin console and dashboard are protected with the **SRU Secure Access Kit v1.4**:
sign-in with the university Google account (@sr.edu.sa), an access list, and a sign-in log.

## Architecture
```
Visitors (any phone, no sign-in)                    Staff (SRU Google accounts on the access list)
github/checkin.html · feedback.html                 github/index.html  (branded sign-in page)
        │  fetch                                            │  link
        ▼                                                   ▼
Apps Script deployment A — "Anyone"                 Apps Script deployment B — "Anyone within Sulaiman Al Rajhi University"
public JSON API only (check-in, evaluation)        Admin.html + Dashboard.html, google.script.run.api()
        └──────────────── same project · same Google Sheet ────────────────┘
```
- **One Apps Script project, two web-app deployments** of the same code:
  - **A (existing, Anyone):** used by the visitor pages. Admin actions are refused on this endpoint.
  - **B (new, Anyone within SRU):** serves the console and dashboard.
- Every admin call re-checks the signed-in Google account against `AllowedUsers` on the server.
- No passwords and no keys are kept in the platform: sign-in happens on Google's page.

## Folders
| Path | Upload to | Contents |
|---|---|---|
| `apps-script/` | the Apps Script project bound to the Sheet | `Code.gs`, `SecureAccess.gs`, `Feedback.gs`, `EmailAssets.gs`, `appsscript.json`, HTML files `Admin`, `Dashboard`, `Client`, `Styles`, `Logos`, `Denied` |
| `github/` | the GitHub Pages repository (its root) | `index.html` (sign-in landing), `checkin.html`, `feedback.html`, `dashboard.html` (redirect) — **self-contained** (styles, scripts and logos inside each page). `assets/` holds the editable sources only |

## Sheet tabs
| Tab | Purpose |
|---|---|
| `Events` | EventID, EventName, Location, StartDateTime, EndDateTime, Organizer, Description, Status, CreatedAt, UpdatedAt, Agenda |
| `Attendance` | Timestamp, EventID, EventName, FullName, Email, ThankYouSent, UserAgent |
| `Feedback` | Timestamp, EventID, EventName, FullName, Email, Rating (1–5), Comment, UpdatedAt |
| `MailLog` | Timestamp, EventID, Subject, Recipients, Sent, Failed, Notes |
| `AllowedUsers` | email, name, role (`admin` / `user`), active ☑, notes — who may open the console |
| `AccessLog` | timestamp, date, time, day, email, result (دخول / مرفوض / غير مدرج), version |

## Upgrade from v3.2 (≈15 min)
1. **Apps Script** (Extensions ▸ Apps Script from the Sheet):
   - Replace `Code.gs`, `Feedback.gs`, `EmailAssets.gs`, `appsscript.json`.
   - **Delete** `Users.gs` (password sign-in is retired).
   - Add script file `SecureAccess` and HTML files `Admin`, `Dashboard`, `Client`, `Styles`, `Logos`, `Denied` (＋ ▸ HTML; name without `.html`).
   - In `SecureAccess.gs` CONFIG, trim `DEFAULT_ALLOWED` to the people who manage events.
2. Run **`setup`** once → creates `AllowedUsers` and `AccessLog`, removes the old admin key.
3. **Deployment A (existing):** Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: **New version** ▸ Deploy. URL unchanged; visitor pages keep working.
4. **Deployment B (new):** Deploy ▸ **New deployment** ▸ Web app — Execute as **Me**, Who has access **Anyone within Sulaiman Al Rajhi University**. Copy its URL.
5. Open deployment B's URL, sign in, then open **⚙ الإعدادات** and set:
   - رابط صفحات الزوار — the GitHub Pages folder (used in QR codes)
   - رابط المنصة الآمن — deployment B's URL
   - رابط صفحة الدخول — the GitHub landing page
6. **GitHub (`ICTSRU/Event`):** upload `index.html`, `checkin.html`, `feedback.html`, `dashboard.html` to the repository root (replace the old files). No folder structure is needed — each page is self-contained. Delete the old loose files (`api.js`, `config.js`, `sru-theme.css`, logos, `Code.gs`, `appsscript.json`, `download`).
7. **Test:** own account ✓ · Incognito → Google sign-in ✓ · personal Gmail → refused ✓ · scan a QR code ✓.

Later code updates: update **both** deployments (Manage deployments ▸ ✏️ ▸ New version), so their URLs stay the same.

## Access list
- `ACCESS_MODE = 'LIST'` (default): only active rows in `AllowedUsers` plus `OWNER_EMAILS`. `'DOMAIN'`: any @sr.edu.sa account.
- Roles: `admin` = مسؤول النظام (users window ⚙ settings), `user` = منظم فعاليات (events, reports, e-mails, dashboard).
- Manage from the console (**المستخدمون**) or directly in the sheet; changes apply within 2 minutes.
- New users added from the console get an e-mail with the platform link (optional).

## Access log
Every sign-in is written to `AccessLog`. The same user within 30 minutes counts as one row. Refused and not-listed attempts are logged too.
The Sheet menu **منصة الفعاليات** has three items: a 30-day summary, purge entries older than 180 days, and show the platform URL.

## Security notes
- Keep the Google Sheet private: it holds attendee and staff e-mails.
- The public deployment accepts only visitor actions; its bare URL shows the "SRU accounts only" page.
- Evaluation links are HMAC-signed per attendee; test copies never save answers.
