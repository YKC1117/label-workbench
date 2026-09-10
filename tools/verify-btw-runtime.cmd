@echo off
setlocal
if "%~1"=="" (
  echo Drag a generated .btw file onto this verifier.
  echo.
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-btw-runtime.ps1" "%~1"
set CODE=%ERRORLEVEL%
echo.
if "%CODE%"=="0" (
  echo PASS - BarTender loaded and re-saved this BTW.
) else (
  echo FAIL - this BTW is not runtime-verified yet.
)
pause
exit /b %CODE%
