@echo off
setlocal
cd /d "%~dp0"
if not exist "review\renderer-prototype\runner-evidence" mkdir "review\renderer-prototype\runner-evidence"
node.exe "review\renderer-prototype\materialize-controlled-donor.cjs" "review\renderer-prototype\runner-evidence\controlled-donor.btw"
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Probe-DonorTextAutomation.ps1" -DonorPath "%~dp0review\renderer-prototype\runner-evidence\controlled-donor.btw" -OutputPath "%~dp0review\renderer-prototype\runner-evidence\donor-text-automation-diagnostic.json"
if errorlevel 1 exit /b %ERRORLEVEL%
echo DIAGNOSTIC_ONLY: Designer-authored Text automation capability captured; renderer acceptance intentionally not run.
exit /b 2
