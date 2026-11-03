@echo off
setlocal
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Run-GeneralRendererSuite.ps1"
exit /b %ERRORLEVEL%
