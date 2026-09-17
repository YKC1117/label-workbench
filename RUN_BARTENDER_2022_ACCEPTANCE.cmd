@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo Label Workbench - BarTender 2022 Runtime Acceptance
echo 5 Code128 + 1 Data Matrix + editable Text
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Node.js was not found.
  echo Install Node.js 22 or newer, then run this file again.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%V in ('node --version 2^>nul') do set NODE_VERSION=%%V
echo Node: %NODE_VERSION%
echo.
echo IMPORTANT: Save your work and close BarTender before continuing.
echo The test will open and save a temporary BTW twice.
echo It will NOT print a physical label.
echo.
pause

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\verify-btw-runtime-suite.ps1" -ReportPath "%~dp0runtime-acceptance-report.json"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo ============================================================
  echo PASS - BarTender 2022 runtime acceptance completed.
  echo Report: %~dp0runtime-acceptance-report.json
  echo ============================================================
) else (
  echo ============================================================
  echo FAIL - Runtime acceptance did not complete successfully.
  echo Check the message above and runtime-acceptance-report.json.
  echo ============================================================
)
echo.
pause
exit /b %RC%
