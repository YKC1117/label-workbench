@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Run.ps1" -BaseDirectory "%~dp0." -OpenResults -LayoutPath "%~dp0layout-supported.json"
set "rc=%errorlevel%"
echo.
echo Exit code: %rc% (2 = PARTIAL, 1 = failed/blocked)
pause
exit /b %rc%
