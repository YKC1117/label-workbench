@echo off
setlocal
cd /d "%~dp0"
if not exist "review\renderer-prototype\runner-evidence" mkdir "review\renderer-prototype\runner-evidence"
node.exe "review\renderer-prototype\materialize-controlled-donor.cjs" "review\renderer-prototype\runner-evidence\controlled-donor.btw"
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Apply-HybridBarcodeAnchorProbePatch.ps1"
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Probe-HybridRenderer.ps1" -CanonicalPath "%~dp0canonical.json" -TextPoolPath "%~dp0review\renderer-prototype\runner-evidence\controlled-donor.btw"
exit /b %ERRORLEVEL%
