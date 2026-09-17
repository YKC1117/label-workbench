@echo off
setlocal
if "%~1"=="" (
  echo Usage: verify-btw-runtime.cmd candidate.btw -Fixture A -BarTenderExe "C:\...\bartend.exe" -Operator "Name" -Edition Automation
  exit /b 2
)
powershell.exe -NoProfile -File "%~dp0verify-btw-runtime.ps1" %*
exit /b %ERRORLEVEL%
