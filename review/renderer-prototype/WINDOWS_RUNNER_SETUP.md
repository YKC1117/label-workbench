# Label Workbench｜Windows BarTender Runner

## 目的

此 Runner **只用於 PR #35 的 BarTender 2022 COM / Format API Renderer 實機證據**。

它不是正式部署機，也不應執行一般 pull request 工作。

## 安全邊界

Repository 目前是 public。GitHub 官方對 public repository 使用 self-hosted runner 有明確安全警告，因此本專案採以下限制：

- workflow **沒有** `pull_request` / `pull_request_target` trigger。
- 只接受 `experiment/com-renderer-prototype` branch 的 push。
- 只有 `review/renderer-prototype/run-request.json` 變更才可能觸發。
- commit message 還必須包含 `[bartender-probe]`。
- workflow 再限制 `github.actor == 'YKC1117'`。
- Runner 必須同時符合 `self-hosted`, `windows`, `x64`, `bartender` labels。
- `GITHUB_TOKEN` 權限只有 `contents: read`。
- checkout 使用 `persist-credentials: false`。
- workflow 不使用 repository secrets。
- 不會因外部 PR 自動在此 Windows Runner 執行程式。

若未來 Repository 開放其他具有 write 權限的人員，必須重新審視這個 Runner 的安全邊界。

## Windows 主機必要條件

- Windows x64
- Windows PowerShell 5.1
- BarTender 2022 已安裝且目前 Windows 使用者可正常啟動
- `BarTender.Application` COM ProgID 已註冊
- Node.js 可用（Prototype 的 Visual Gate 需要）
- Git 可用
- Windows 使用者對 BarTender 與專案工作目錄有讀寫權限

## Runner 設定

GitHub Repository：

`YKC1117/label-workbench`

到：

`Settings → Actions → Runners → New self-hosted runner`

選擇 Windows x64，依 GitHub 當下頁面提供的官方命令安裝最新版 Runner。

### Runner labels

保留 GitHub 預設：

- `self-hosted`
- `windows`
- `x64`

另加：

- `bartender`

### 建議先使用互動模式

第一階段不要先安裝成 Windows Service。

使用同一個已能正常使用 BarTender 2022 的 Windows 帳號執行 Runner 的 `run.cmd`，避免先把 COM / 使用者設定 / BarTender 授權問題和 Windows Service Session 問題混在一起。

完成 Prototype 證據後，再評估是否適合改為背景 Service。

## 自動執行流程

Windows Runner online 後，不需人工下載 Prototype。

更新：

`review/renderer-prototype/run-request.json`

並讓該 commit message 包含：

`[bartender-probe]`

GitHub Actions 會自動：

1. checkout 精確 trigger commit。
2. 驗證 Windows / PowerShell 5.1 / `BarTender.Application` COM。
3. 拒絕接管已存在的 `BarTend.exe`。
4. 執行根目錄 `PROBE.cmd`。
5. 建立 Canonical Renderer BTW。
6. 執行 BarTender Save / Reopen / Render Visual Gate。
7. 無論 PASS / FAIL 都嘗試上傳 Evidence Artifact。

## Artifact

Workflow：

`.github/workflows/bartender-renderer-windows-probe.yml`

Artifact 會包含可取得的：

- `canonical.json`
- `fixture.json`
- runner preflight / summary
- `NATIVE_BUILD_RESULT.zip`
- `LATEST_NATIVE_OUTPUT.btw`
- `LATEST_NATIVE_REPORT.json`
- `native-results/**`

## 禁止事項

在 Windows Evidence 完成前：

- 不 merge PR #35。
- 不修改正式 `main` Renderer 路由。
- 不部署 Canonical Renderer 到正式 GitHub Pages。
- 不把離線 PASS 宣稱成 BarTender 實機 PASS。
