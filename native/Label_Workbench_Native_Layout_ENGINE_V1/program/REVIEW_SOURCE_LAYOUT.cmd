@echo off
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-NativeLayout.ps1" -CaptureVisualEvidence
pause
