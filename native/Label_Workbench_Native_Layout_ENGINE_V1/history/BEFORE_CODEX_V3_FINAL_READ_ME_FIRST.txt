Label Workbench Native Layout Engine V1 — 2026-10-05 第二次交叉複查版

這包目前已完成一般 GPT 第二次交叉複查。

重要：
1. 新架構唯一入口：program\BUILD_NATIVE.cmd
2. 它現在會先跑 PowerShell parser / C# helper / input regression / 14 種 multi-object mock。
3. 前置驗證失敗時，不應啟動 BarTender。
4. 前置驗證全過後，才會做一次 fresh blank BTW + 6 個原生物件的 BarTender 實機驗證。
5. 測試完成只需要回傳 program\NATIVE_BUILD_RESULT.zip。

仍未宣稱完成：
- OCR 圖片左上座標 -> BarTender ReferencePoint 映射
- 真正列印/掃碼驗收
- 任意圖片/PDF完整版面還原

詳細結果：GENERAL_GPT_FINAL_REVIEW.md


HOTFIX 2026-10-05: Windows PowerShell 5.1 mock fixture compile now explicitly references System.Xml.dll.
