@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo Label Workbench - BarTender 2022 Manual Edit Verification
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Node.js was not found.
  echo Install Node.js 22 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

set EDITED=%~dp0LabelWorkbench_Runtime_Acceptance_EDITED.btw
if not exist "%EDITED%" (
  echo [FAIL] Edited BTW was not found:
  echo %EDITED%
  echo.
  echo In BarTender 2022, edit the acceptance BTW using the values in README.md,
  echo then Save As: LabelWorkbench_Runtime_Acceptance_EDITED.btw
  echo.
  pause
  exit /b 2
)

node "%~dp0tools\verify-btw-manual-edit.cjs" "%EDITED%"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo ============================================================
  echo PASS - Manual Text / 5 Code128 / Data Matrix edits verified.
  echo ============================================================
) else (
  echo ============================================================
  echo FAIL - The edited BTW does not match the required independent edits.
  echo Recheck README.md and the BarTender objects, then save and retry.
  echo ============================================================
)
echo.
pause
exit /b %RC%
