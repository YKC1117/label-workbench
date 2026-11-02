@echo off
setlocal
chcp 65001 >nul
echo Select the original BTW first. The original file will not be modified.
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Launch-Core.ps1"
set "rc=%errorlevel%"
if exist "%~dp0RETURN_TO_CHATGPT.zip" (
 echo READY: Upload RETURN_TO_CHATGPT.zip back to ChatGPT.
 start "" explorer.exe /select,"%~dp0RETURN_TO_CHATGPT.zip"
) else (
 echo Could not create RETURN_TO_CHATGPT.zip. Please keep this window open.
)
echo Exit code: %rc% ^(2 = diagnostic only, 1 = failed/blocked^)
pause
exit /b %rc%
