@echo off
setlocal
cd /d "%~dp0"
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "native\Label_Workbench_Native_Layout_ENGINE_V1\program\Build-NativeLayout.ps1" -LayoutPath "%~dp0review\renderer-prototype\canonical-stress-8text.json" -CaptureVisualEvidence -RendererMode Auto
exit /b %ERRORLEVEL%
