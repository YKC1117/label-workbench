# Label Workbench BarTender ONE-SHOT V4

這是目前唯一建議的下一次 Windows + BarTender 2022 診斷包。

## 操作

1. 解壓縮整個 ZIP。
2. 進入 `program`。
3. 雙擊 `CORE_TEST.cmd`。
4. 選擇原本的 `第一個.btw`。
5. 不要手動操作 BarTender，讓腳本跑完。
6. 回傳 `program\RETURN_TO_CHATGPT.zip`。

## V3 已完成的實機進展

V2 真實 Windows 結果已證明：

- clean native Code128 元件可直接插入一次，不必再掃 798 個元件。
- Code128 與 Data Matrix payload 都可寫入並讀回。
- V2 卡住不是 payload，而是「位置驗證在尺寸處理之前」且把位置差異當成 fatal。

V3 已完成文字與 Data Matrix 的主要實機持久化驗證；V4 只集中處理剩餘 Code128 尺寸／持久化路徑。

本輪重點請看 `ONE_SHOT_V4_HANDOFF.md`。

## 不得宣稱的項目

在這包真正於 Windows + BarTender 執行前，V4 新增的 Code128 尺寸路徑仍是 NOT RUN。
Designer 視覺、實體列印、掃碼、Code128 32 mm decoder-confirmed symbol width 仍未驗收。

## ONE_SHOT V4 update (2026-10-02)

Latest real Windows + BarTender 2022 R2 evidence is bundled as `evidence/latest-real-v3-return.zip` and `latest-real-v3-report.json`.

V3 proved on the real machine:
- Text payload/geometry persists across SaveAs -> Close -> Reopen.
- A bundled clean native Code128 component inserts successfully and accepts `LWB-C128-001` as its single EmbeddedDataSource payload.
- Data Matrix payload, X/Y, bounded empirical XDimension sizing, SaveAs -> Reopen, and second-payload editability all run successfully.
- Data Matrix trusted 600-DPI raster ink bounds reached about 12.192 x 12.192 mm at XDimension Index 8; this remains layout/raster evidence, not decoder-confirmed symbol bounds or physical-print acceptance.

The remaining V3 Code128 blocker was diagnostic-code-only: the XDimension probe called the generic `Width` COM getter, which throws on this native barcode object before the real XDimension experiment can run.

V4 removes all runtime Code128 dependency on the generic Width property. It first attempts one bounded `SetXML` change to `HumanReadable Visibility=None`; if BarTender accepts and reads it back, Code128 raster sizing is measured without the caption. If BarTender rejects it, the exact starting XML is restored and the bounded XDimension experiment still runs using explicitly layout-only total ink width. No claim of decoder symbol bounds is made.
