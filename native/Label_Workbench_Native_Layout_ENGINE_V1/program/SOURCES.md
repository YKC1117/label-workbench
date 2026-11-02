# 官方資料（2026-10-01 查閱）

1. DesignObject 方法／屬性，Automation/Enterprise：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/DesignObject_Object.htm
2. Width 的適用範圍不含 Barcode，Text 僅段落：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Width_Property%28DesignObject%29.htm
3. Height 對 Barcode 僅適用 1D／postal，不適用 Data Matrix：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Height_Property%28DesignObject%29.htm
4. Format：命名資料來源、PageSetup、SaveAs：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Format_Object.htm
5. SaveAs(FileName, OverwriteIfExists)：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/SaveAs_Method.htm
6. PageSetup 尺寸與單位：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/LabelWidth_Property.htm
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/PaperWidth_Property.htm
7. X/Y 是 anchor 座標：
   https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/X_Property.htm
8. DesignObjects Find/Item/Count（沒有文檔化 Add）：
   https://help.seagullscientific.com/2022/cht/Subsystems/ActiveX/Content/DesignObjects_Collection.htm
9. 2021 release notes 提到新增 barcode X-dimension ActiveX 控制：
   https://support.seagullscientific.com/hc/en-us/articles/360056327394-BarTender-2021
10. BTXML 命名資料來源：
    https://help.seagullscientific.com/2022/en/Subsystems/BTXML/Content/Setting_Label_Field_Data.htm
11. Quit 的 btDoNotSaveChanges=1：
    https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Quit_Method.htm

沒有找到確切 X-dimension 屬性簽章，不能從 release notes 推論其名稱與單位。未以其他廠商的 ActiveX barcode API 代替 BarTender API。

12. 命名資料來源讀寫與 GetAll 參數順序：
    https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/Changing_data.htm
    https://help.seagullscientific.com/2022/en/Subsystems/ActiveX/Content/GetAll_Method.htm

13. DesignObject.ExportToFile 官方說明：BtResolution 可使用 2..3000 的數值代表指定 DPI；本 POC 使用 600 DPI。
    https://help.seagullscientific.com/2016/en/Subsystems/ActiveX/Content/ExportToFile_Method_%28DesignObject%29.htm
14. `Create(objectType)` / `Delete(objectName)` 並非目前線上 2022 DesignObjects 頁面列出的公開清單；本包只因使用者機器 BarTender 2022 R2 build 184527 的 `evidence/installed-api.json` 實際 TypeLib 明列這兩個方法才使用 Create。Delete 本輪不呼叫。

15. blockers-12 實機顯示 Create(4) 預設 Code39，且 SetXML 不能改 root/symbology；這是本包 evidence/latest-result.zip 的真實 Windows 證據。
16. blockers-13 使用安裝 TypeLib 已明列的 GetProperty/SetProperty。`BarcodeId` 名稱來自 BarTend.exe runtime strings 的外部佐證；程式不硬編其值，而是從 donor Code128 GetProperty 後原樣轉寫，並以 GetXML root readback 為驗證。這仍需使用者 Windows 實機一次確認。

17. blockers-13 Windows evidence：generic `BarcodeId`/`Symbology` 類 GetProperty 對 donor/fresh 都回空值，fresh symbology switch 路線停止。
18. controlled-donor-14 改依真實 ExportDataSourceValues/Object XML 的值關聯：條碼 1 的 ObjectValue 值可唯一對應 `文字 3` 與 `文字 5`。這是 evidence-driven feeder mapping，不猜 symbology API。
19. BarTender Help：Object Values data source 取自文件內既有物件；Prefix/Suffix transform 會在指定 data source 前後附加靜態文字。controlled-donor-14 因此改控制 feeder 值並把現有 Prefix/Suffix 原地清空。
20. controlled-donor-14 Windows evidence（2026-10-01）：條碼 1 的 `<Suffix>#</Suffix>` 在 `SetXML` 要求清空後仍由 `GetXML` 原樣回讀，證明此既有 ObjectValue Prefix/Suffix 不能用目前 ActiveX SetXML 路線改寫。donor-bank-15 因此不再嘗試修改 transform，而是在任何寫入前掃描整份模板，淘汰所有含非空 Prefix/Suffix 的 Code128 donor。
21. donor-bank-15 僅清空「唯一解析到文字物件」的 ObjectValue feeder；若 feeder 模糊、被本次可見物件佔用、不是文字，或含未驗證 transform，該 donor 直接淘汰。這是 fail-closed donor selection，不再以猜測 API 修補同一 donor。

## component-insert-17 architecture change

- Real installed TypeLib evidence (`evidence/installed-api.json`) contains `IBtFormat.InsertComponent(componentPath, X, Y)` returning Boolean, with documentation that it inserts a component at the specified location.
- This supersedes the failed idea of finding a clean Code128 donor inside each customer BTW.
- BarTender reusable components use `.btc`; component insertion allows repeated native barcode insertion without switching a fresh default Code39 object's symbology.

## 2026-10-02 深度複查（上面的 12～17c 描述屬歷史，非現行測試流程）

- 現行方法名稱/簽章以隨附 installed-api.json 和本機再次讀取的 TypeLib 為依據。
- IBtFormats.Add(): Format pointer；IBtDesignObjects.Delete(BSTR): BOOL；Value 只有 PROPERTYGET，沒有 setter。
- SetXML(BSTR): VOID：沒有可據以宣稱成功的 Boolean 回傳值。節點可讀不代表可寫。
- ExportToFile 匯出 object image，並非提供 barcode detector bounds：
  https://help.seagullscientific.com/2021/fr/Subsystems/ActiveX/Content/ExportToFile_Method_%28DesignObject%29.htm
- Value 唯讀，回傳 transforms 後的值：
  https://help.seagullscientific.com/2016/en/Subsystems/ActiveX/Content/Value_Property%28DesignObject%29.htm
- BarTender 2022 X Dimension 依印表機與解析度量化，沒有公開 Index+1 等於點數的保證：
  https://help.seagullscientific.com/2022/en/Content/HIDD_BC_XDIM.htm
- Circular Code128 為光碟等用途的環形變體：
  https://help.seagullscientific.com/2016/en/Subsystems/Symbology/Content/CircularCode128.htm
- PowerShell 函式回傳會逐项展開，unary comma 則保留為單一物件：
  https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_return

線上可讀的 ExportToFile/Value 頁有較早版號，因此不能單靠它们宣稱 2022 實作；本包同時使用使用者 2022 R2 TypeLib 的相符簽章。


## V6 visual / coordinate evidence sources

- Seagull Scientific — DesignObject.X: https://help.seagullscientific.com/11.4/en/Subsystems/ActiveX/Content/X_Property.htm
  - X is the coordinate of the object anchor in the document measurement units.
- Seagull Scientific — Understanding Origin Points and Anchors: https://help.seagullscientific.com/2019/en/Content/Understanding_Reference_Points.htm
  - Object X/Y place the anchor relative to the origin; Top Left is the documented default, but V6 records an absent XML ReferencePoint as absent rather than assuming it for product acceptance.
- Seagull Scientific — Format.ExportToFile: https://help.seagullscientific.com/11.5/en/Subsystems/ActiveX/Content/ExportToFile_Method.htm
  - Exports the document template to an image file at a requested resolution.
- Seagull Scientific — DesignObject.ExportToFile: https://help.seagullscientific.com/2016/en/Subsystems/ActiveX/Content/ExportToFile_Method_%28DesignObject%29.htm
  - Exports an individual design object to an image file.
