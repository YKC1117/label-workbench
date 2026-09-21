@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  echo Usage: RUN_LAYOUT_CASE.cmd "C:\path\Image.jpg" 100x65
  exit /b 2
)

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Node.js was not found.
  exit /b 1
)

if not exist "node_modules\@playwright\test" (
  echo Installing project test dependencies...
  call npm ci
  if errorlevel 1 exit /b 1
)

call npx playwright install chromium
if errorlevel 1 exit /b 1

node tools\run-layout-case.cjs "%~1" "%~2"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo PASS
  echo Evidence: artifacts\manual-case
) else (
  echo FAIL
)
exit /b %RC%
