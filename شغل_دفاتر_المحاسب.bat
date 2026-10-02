@echo off
rem =====================================================================
rem   دفاتر المحاسب — التشغيل بنقرة مزدوجة (بدون سطر أوامر)
rem   Double-click launcher — no terminal knowledge needed.
rem   ملاحظة: لا تُغلق هذه النافذة أثناء استخدام البرنامج.
rem           إغلاقها يوقف الخادم المحلي.
rem =====================================================================
chcp 65001 >nul
cd /d "%~dp0"
title دفاتر المحاسب — الخادم المحلي

echo.
echo   ==========================================================
echo      دفاتر المحاسب — DAFATIR AL-MUHASIB  (Local Server)
echo   ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [خطأ] لم يُعثر على Node.js.
  echo   ثبّته مرة واحدة من https://nodejs.org  (الخيار الافتراضي)
  echo   ثم شغّل هذا الملف مجدداً.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo   ... إنشاء ملف الإعدادات الأولي (.env)
  copy /y ".env.example" ".env" >nul
)

if not exist "node_modules" (
  echo   أول تشغيل: جارٍ تثبيت المكونات (مرة واحدة وقد يستغرق دقائق)...
  echo   Installing dependencies (first run only)...
  call npm install
  if errorlevel 1 (
    echo.
    echo   [خطأ] فشل التثبيت — تحقق من اتصال الإنترنت ثم أعد المحاولة.
    pause
    exit /b 1
  )
)

if not exist "db\app.db" (
  echo   ... تهيئة قاعدة البيانات (المستخدم: admin)
  call npm run db:init
)

rem يفتح المتصفح تلقائيًا فور جاهزية الخادم
start /b "" node "scripts\launcher\open-browser.mjs"

echo.
echo   جارٍ تشغيل الخادم المحلي على 127.0.0.1:3000 ...
echo   سيفتح المتصفح تلقائيًا. تسجيل الدخول: admin
echo.
echo   ----------------------------------------------------------
echo   (لا تُغلق هذه النافذة — إغلاقها يوقف البرنامج)
echo   ----------------------------------------------------------
echo.

rem نسخة الإنتاج إن وُجدت، وإلا وضع التطوير
if exist ".next\BUILD_ID" (
  call npx next start -p 3000 -H 127.0.0.1
) else (
  call npx next dev -p 3000 -H 127.0.0.1
)

echo.
echo   توقف الخادم.
pause
