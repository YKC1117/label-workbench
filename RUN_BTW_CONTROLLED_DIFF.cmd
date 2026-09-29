@echo off
setlocal
cd /d "%~dp0"

set "SAMPLE_DIR=%~1"
if "%SAMPLE_DIR%"=="" set "SAMPLE_DIR=btw-controlled-samples"

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] 找不到 Node.js。
  exit /b 1
)

if not exist "%SAMPLE_DIR%" (
  echo [FAIL] 找不到樣本資料夾：
  echo %SAMPLE_DIR%
  echo.
  echo 請建立資料夾並放入至少 2 份 .btw 檔案。
  exit /b 2
)

node tools\btw-controlled-diff.cjs "%SAMPLE_DIR%"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo PASS
  echo 結果：artifacts\btw-controlled-diff
  echo.
  echo 請把以下檔案交給分析端：
  echo - summary.json
  echo - object-map.csv
  echo - changed-ranges.csv
  echo - typed-candidates.csv
) else (
  echo FAIL
)
exit /b %RC%
