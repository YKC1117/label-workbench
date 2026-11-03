@echo off
setlocal
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Probe-NativeContracts.ps1" -DesignerBase
exit /b %ERRORLEVEL%
