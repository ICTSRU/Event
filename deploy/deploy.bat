@echo off
REM Double-click to upload all Apps Script files and update both deployments
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
echo.
pause
