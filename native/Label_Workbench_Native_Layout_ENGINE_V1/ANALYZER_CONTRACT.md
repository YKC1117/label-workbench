# Native layout v1 — 本輪真實契約

輸入 lwb-native-layout-v1；支援單行 text、code128、正方形 datamatrix。保持既有兩份 sample 格式。
頂層只接受 schema/widthMm/heightMm/objects/可選 printerName。id 必須大寫 A–Z/0–9/_/-、1–64 字、唯一；type 固定小寫。value 必須字串保留前導零；文字不可含換行，XML 不容許的控制字元拒絕。
text 接受 fontSizePt 與可選字串 fontName。Code128 接受 widthMm/heightMm。Data Matrix 指定 sizeMm 或 widthMm 之一，不可兩者並用。

X/Y 目前是 BarTender native reference-point coordinates，**尚不是已認證的圖片左上角座標**。引擎保存 ReferencePoint XML 供跨審；不得把此候選引擎接上 OCR 就宣稱完整定位已完成。
Rotation 支援輸入，但 fitting 一律先設 0°；sizing.selected 的 ink 寬高為未旋轉值，presave/reopen raster 為最終方向。文字先設字型/字級、條碼先處理尺寸，最後 rotation/X/Y，再整組讀回。

兩種 barcode 的既有 HumanReadable 必須明確 None。Code128 文字由獨立 text 表達。Data Matrix 若沒可驗證的 caption 狀態即 fail closed，不猜測 absence=hidden。
尺寸是有限 Index 樣本中最接近的可信 ink，非全域最佳、非精確目標、非 decoder symbol size、非列印驗收。不用 Width、不假設 Index+1=dot。至少需觀察 numeric XDimension 和 raster 反應；最終 DPI 不可信就失敗。

所有 printer/page、native Type/root/source、payload/peer isolation、geometry、raster、save/reopen/editability 符合後才發佈 native-output.btw。輸出只代表原生可編輯候選，尚不驗重疊/越界/字型視覺/anchor 映射/quiet zone/decoder/列印掃碼。
printerName 若省略，採新文件實際 printer 並記錄；重開須同一 printer。更換印表機不保證相同 quantization。
