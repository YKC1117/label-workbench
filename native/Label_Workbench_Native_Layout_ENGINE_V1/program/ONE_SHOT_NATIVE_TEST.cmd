@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo Label Workbench Native Layout - ONE SHOT WINDOWS TEST
echo Fixed input: native-layout.multi.sample.json
echo Preflight must pass before BarTender is opened.
echo ============================================================
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-NativeLayout.ps1" -BaseDirectory "%~dp0." -LayoutPath "%~dp0native-layout.multi.sample.json" -CaptureVisualEvidence
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" (
 echo VERIFIED CANDIDATE: LATEST_NATIVE_OUTPUT.btw
) else (
 echo FAILED/BLOCKED. Do not use previous output.
)
if exist "%~dp0NATIVE_BUILD_RESULT.zip" echo Return NATIVE_BUILD_RESULT.zip
pause
exit /b %RC%
