@echo off
setlocal
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Invoke-ProbeDispatch.ps1"
exit /b %ERRORLEVEL%
