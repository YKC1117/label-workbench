# Native engine final review

新路徑：BUILD_NATIVE.cmd → Build-NativeLayout.ps1 → SELF_CHECK_NATIVE.ps1 → NativeLayoutEngine.psm1。
CORE_TEST 與舊 POC 檔保留為歷史，並非新引擎入口。

SELF_CHECK_NATIVE 在 BarTender 啟動前做 parser、helper compile、兩份 sample/輸入斷言及既有 TypeLib signature/hash 檢查；不執行多物件 mock。
開發端可在各自獨立 PowerShell process 執行 Test-NativeLayoutEngine.ps1 與 Test-NativePersistence.ps1。後者使用 NativeReviewFixtures.cs，是 mock；不啟動 BarTender，不能證明 Windows COM 行為。
本輪環境沒有 PowerShell/C# compiler，因此這些命令都沒有實際執行。

跨審完成前不要求使用者測試。單次實機候選是 native-layout.multi.sample.json，回傳 NATIVE_BUILD_RESULT.zip。
失敗時沒有新的 LATEST_NATIVE_OUTPUT.btw；未驗證 candidate 以 .FAILED_UNVERIFIED 標示。若檔案系統禁止寫入或磁碟不足，無法保證產生回傳 ZIP。
