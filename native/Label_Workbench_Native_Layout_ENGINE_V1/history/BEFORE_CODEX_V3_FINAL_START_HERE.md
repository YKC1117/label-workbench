# 2026-10-05 第二次交叉複查更新

一般 GPT 已完成第二次交叉複查；詳見 `GENERAL_GPT_FINAL_REVIEW.md`。
本輪未改 NativeLayoutEngine 核心 COM 演算法；重點是把 `Test-NativePersistence.ps1` 14 種 multi-object mock 正式接進 `SELF_CHECK_NATIVE.ps1`，因此下一次 `program/BUILD_NATIVE.cmd` 會先做 parser / C# helper / input regression / 14 mocks，通過後才開 BarTender。
本 Linux 環境仍無 PowerShell/C# runtime，所以 parser / 14 mocks / Windows BarTender 仍標示 NOT RUN，不冒稱 PASS。

---

# Native Layout Engine V1 FINAL — 交叉複查候選

此包是 Codex 集中修正版，原 V1 不要先測。
本次不要求使用者跑 Windows；先把 Codex 回覆與此 ZIP 一起交第二次交叉檢查。

已修正新空白文件、多物件建立、尺寸/來源隔離、持久化與失敗輸出問題。詳細見 TECHNICAL_REVIEW.md。
**原生 PowerShell parser、regression、C# compile、Windows/BarTender 新路徑仍 NOT RUN。**
沒有把 V4 existing-BTW POC 的 PASS 擴張成新引擎 PASS。

後續若決定做單次實機驗證，唯一新入口是 program/BUILD_NATIVE.cmd，使用 native-layout.multi.sample.json，收集 NATIVE_BUILD_RESULT.zip。
輸出的成功狀態僅為可編輯候選重開驗證；native ReferencePoint 尚未證明符合 OCR 左上角座標，不能宣稱完整還原產品已完成。
