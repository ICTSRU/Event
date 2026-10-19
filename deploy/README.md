# التحديث بخطوة واحدة · One-step update (v4.6)

يرفع **جميع** ملفات `apps-script/` إلى مشروع Apps Script دفعة واحدة، ثم يحدّث **النشرين** (الزوار Anyone + لوحة الإدارة SRU) بنسخة جديدة — بدل نسخ كل ملف ولصقه يدويًا.
يعتمد على أداة Google الرسمية **clasp**.

## الإعداد — مرة واحدة فقط

| # | الخطوة |
|---|--------|
| 1 | ثبّت **Node.js LTS** من nodejs.org (قد يحتاج صلاحية مسؤول الجهاز). |
| 2 | فعّل **Google Apps Script API** لحسابك: https://script.google.com/home/usersettings ← **On**. |
| 3 | انسخ **Script ID**: محرر Apps Script ← ⚙ Project Settings ← IDs ← Script ID. |

## في كل تحديث

1. فك ضغط حزمة الإصدار الجديد.
2. **Windows:** انقر مرتين على `deploy/deploy.bat` · **Mac:** شغّل `deploy/deploy.sh` من Terminal.
3. في أول تشغيل فقط: يفتح المتصفح لتسجيل الدخول بحساب `@sr.edu.sa`، ثم يطلب **Script ID** ويحفظه على الجهاز.
4. انتظر رسالة **Done** — تم رفع الملفات وتحديث النشرين.

## ما يفعله السكربت

1. `clasp push --force` — يرفع كل الملفات (ويحذف من المشروع أي ملف غير موجود في الحزمة، مثل `Users.gs` القديم).
2. يحدّث النشر **A** (الزوار) بإعداد الوصول **Anyone**.
3. يحدّث النشر **B** (لوحة الإدارة) بإعداد الوصول **Anyone within Sulaiman Al Rajhi University** (`appsscript.domain.json`).
4. يعيد ملف الإعدادات القياسي إلى المحرر.

روابط النشرين **لا تتغير** — لا حاجة لتعديل أي رابط على GitHub.

## تنبيهات

- أي ملف أضفته يدويًا في المحرر ولا يوجد في الحزمة **سيُحذف** عند الرفع.
- بعد أول تشغيل: افتح Deploy ← Manage deployments وتأكد أن النشر B ما زال «Anyone within Sulaiman Al Rajhi University» والنشر A «Anyone».
- إن ظهرت رسالة «User has not enabled the Apps Script API» فارجع للخطوة 2 من الإعداد، وانتظر دقائق ثم أعد التشغيل.
- إن رفضت Google تسجيل دخول clasp لحساب الجامعة، فقد يحتاج مسؤول Google Workspace إلى السماح بالتطبيق (Admin console ← Security ← API controls).
