@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0review\renderer-prototype\Patch-HybridPeerScope.ps1" -HybridPoolPath "%~dp0native\Label_Workbench_Native_Layout_ENGINE_V1\program\HybridPool.psm1"
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "native\Label_Workbench_Native_Layout_ENGINE_V1\program\Build-NativeLayout.ps1" -LayoutPath "%~dp0review\renderer-prototype\canonical-stress-8text.json" -CaptureVisualEvidence -RendererMode Auto
exit /b %ERRORLEVEL%
