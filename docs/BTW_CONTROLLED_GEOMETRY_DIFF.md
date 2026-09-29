# BarTender 2022 BTW Controlled Geometry Diff

目的：用單變數實驗定位 `.btw` 原生物件的幾何權威欄位。  
此流程只做研究，不修改正式產生器，也不把「可開啟 BTW」當作版面 PASS。

## 第一輪：只做 Text，總共 8 份

先不要做 Code128 / Data Matrix。Text 是最乾淨的幾何對照；如果能先確認 BarTender 是否有共用的 X/Y/W/H 或 left/top/right/bottom header，後續條碼會快很多。

### 共通設定

- BarTender 2022
- 同一台 Windows
- 同一個 BarTender 版本
- 同一個印表機驅動
- 文件單位：inch
- 標籤尺寸建議：3.000 × 2.000 in
- 文件中只放 1 個 Text object
- 內容固定：`LW-TEXT-01`
- 字型、字級、對齊、旋轉全部固定
- Auto Fit / 自動縮放若可關閉就關閉
- 每個變體都從同一份 baseline 另存，不要連續修改上一份

Baseline 幾何：

- X = 0.413 in
- Y = 0.707 in
- W = 0.937 in
- H = 0.251 in

這些值刻意選成 413 / 707 / 937 / 251 mil，避免數值彼此重複。

### 檔名與唯一修改項目

1. `NOISE_A.btw`
   - Baseline，不修改，另存一次。

2. `NOISE_B.btw`
   - 再從完全相同的 Baseline 不修改另存一次。
   - 用來建立 timestamp / GUID / checksum / preview 等雜訊地圖。

3. `T0_BASE.btw`
   - X 0.413
   - Y 0.707
   - W 0.937
   - H 0.251

4. `T1_W_1313.btw`
   - 只改 W = 1.313 in

5. `T2_W_1771.btw`
   - 只改 W = 1.771 in

6. `T3_H_419.btw`
   - 只改 H = 0.419 in

7. `T4_H_587.btw`
   - 只改 H = 0.587 in

8. `T5_X_613.btw`
   - 只改 X = 0.613 in
   - W / H / Y 全部保持 Baseline
   - 這份用來區分：
     - 直接 width
     - right edge
     - bounding rectangle
     - anchor / transform

## 執行

把 8 份 BTW 放到 repo 根目錄下：

`btw-controlled-samples\`

Windows 直接雙擊：

`RUN_BTW_CONTROLLED_DIFF.cmd`

或：

`RUN_BTW_CONTROLLED_DIFF.cmd "C:\你的\樣本資料夾"`

輸出：

`artifacts\btw-controlled-diff\`

會產生：

- `summary.json`
- `object-map.csv`
- `changed-ranges.csv`
- `typed-candidates.csv`

## 工具做什麼

- 直接使用專案既有 BTW parser 解壓 serialized container。
- 每份檔案都重新定位 `recordStart`，不依賴檔案絕對 offset。
- 對齊相同物件後做 record-relative byte diff。
- 同時解讀候選欄位：
  - int16 LE
  - uint16 LE
  - int32 LE
  - uint32 LE
  - float32 LE
  - float64 LE
- 如果有 `NOISE_A.btw` / `NOISE_B.btw`，會把重疊到自然存檔雜訊的位置標記為 `noiseOverlap=YES`。

## 第一輪成功判準

Width 候選至少要同時符合：

1. T1 與 T2 都只在同一相對欄位形成一致變化。
2. 候選值能對應 937 → 1313 → 1771 mil，或另一個可驗證的固定比例表示。
3. T3 / T4 改 Height 時 Width 候選不應跟著變。
4. T5 只改 X 時：
   - 如果另一欄位也 +200 mil，可能是 right edge；
   - 如果 Width 候選完全不變，較像直接 width。
5. 候選不可只落在 noise map。
6. 找到候選後仍不能直接進 production；必須做 BarTender 寫回驗證與重新存檔驗證。

Height 同理。

## 第二輪才做 Barcode

只有第一輪結果完成後，再建立：

### Code128

- C0 baseline
- X dimension 3 點
- Bar height 3 點
- Human-readable 開關
- 水平拖拉一次

優先找「X dimension / bar height」，不要先假設有直接 barcode width。

### Data Matrix

- D0 baseline
- module size 3 點
- fixed symbol size 一次
- 拖拉一次

優先找「module size / symbol rows-cols」，不要先假設有直接 W/H。

## 重要

- 不猜 `recordStart + 8` / `+12` 就是 W/H。
- 不因 parser round-trip PASS 就認定欄位正確。
- 不因 BarTender 能開檔就認定版面正確。
- 真正可施工的欄位，至少還要經過：
  1. 多點線性關係
  2. 單變數專一性
  3. 寫回後 BarTender UI / 畫面跟著改
  4. BarTender 重新存檔後值能保留
