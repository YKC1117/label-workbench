@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "review\renderer-prototype\Apply-TextDefaultAnchorProbePatch.ps1"
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "native\Label_Workbench_Native_Layout_ENGINE_V1\program\Build-NativeLayout.ps1" -LayoutPath "%~dp0canonical.json" -CaptureVisualEvidence
exit /b %ERRORLEVEL%
