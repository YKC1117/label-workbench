# Label Workbench｜Windows BarTender Runner

## 目的

此 Runner **只用於 PR #35 的 BarTender 2022 COM / Format API Renderer 實機證據**。

它不是正式部署機，也不應執行一般 pull request 工作。

## 安全邊界

Repository 目前是 public。GitHub 官方對 public repository 使用 self-hosted runner 有安全風險，因此本專案固定以下限制：

- workflow **沒有** `pull_request` / `pull_request_target` trigger。
- 只接受 `experiment/com-renderer-prototype` branch 的 push。
- 只有 `review/renderer-prototype/run-request.json` 變更才可能觸發。
- commit message 必須包含 `[bartender-probe]`。
- workflow 再限制 `github.actor == 'YKC1117'`。
- Runner 必須同時符合 `self-hosted`, `windows`, `x64`, `bartender` labels。
- `GITHUB_TOKEN` 只有 `contents: read`。
- checkout 使用 `persist-credentials: false`。
- workflow 不使用 repository secrets。
- 外部 PR 不會自動在此 Windows Runner 執行程式。

若未來 Repository 開放其他具有 write 權限的人員，必須重新審視這個 Runner 的安全邊界。

## Windows 主機必要條件

只需要：

- Windows x64
- Windows PowerShell 5.1
- BarTender 2022 已安裝，且目前 Windows 使用者可正常啟動
- `BarTender.Application` COM ProgID 已註冊
- 可連線 GitHub

Node.js **不需要預先安裝**。Workflow 使用 `actions/setup-node@v6` 自動提供 Node 22，並以 `npm ci --ignore-scripts` 安裝鎖定依賴。

## 第一次接線：唯一人工步驟

### 1. 取得一次性 Runner token

GitHub Repository：

`YKC1117/label-workbench`

進入：

`Settings → Actions → Runners → New self-hosted runner`

選：

- Windows
- x64

只需要複製頁面中的 **registration token**。不需要照 GitHub 頁面手動下載 Runner；本專案安裝器會自動下載最新版官方 Windows x64 Runner。

### 2. 在有 BarTender 2022 的 Windows 電腦開啟「Windows PowerShell」

貼上這一行：

```powershell
$u='https://raw.githubusercontent.com/YKC1117/label-workbench/refs/heads/experiment/com-renderer-prototype/review/renderer-prototype/Setup-BarTenderRunner.ps1'; $p="$env:TEMP\Setup-BarTenderRunner.ps1"; Invoke-WebRequest $u -OutFile $p -UseBasicParsing; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p
```

安裝器會自動：

1. 確認 Windows x64。
2. 確認 Windows PowerShell 5.1。
3. 確認 `BarTender.Application` COM 已註冊。
4. 從 GitHub 官方 release API 取得最新版 Windows x64 Actions Runner。
5. 安裝到：`%USERPROFILE%\actions-runner-label-workbench`。
6. 要求貼上剛才取得的一次性 registration token。
7. 自動以名稱 `LWB-<電腦名稱>` 註冊。
8. 自動加上 `bartender` label；GitHub 預設保留 `self-hosted`, `windows`, `x64`。
9. 開啟 Runner 視窗。

看到 Runner 視窗顯示：

`Listening for Jobs`

即完成第一次接線。

> 第一輪刻意採互動模式，不先安裝成 Windows Service。這樣 BarTender COM、授權、目前 Windows 使用者 profile 都與平常使用 BarTender 的環境一致，避免把 Service Session 問題混進 Renderer 驗證。

## 接線完成後

不用人工下載 Prototype，也不用人工執行 `PROBE.cmd`。

只要告知「Runner 已顯示 Listening for Jobs」。之後由本專案端更新：

`review/renderer-prototype/run-request.json`

並使用包含：

`[bartender-probe]`

的 commit message 觸發。

## 自動執行內容

`.github/workflows/bartender-renderer-windows-probe.yml` 會：

1. checkout 精確 trigger commit。
2. 使用 `actions/setup-node@v6` 提供 Node 22。
3. `npm ci --ignore-scripts --no-audit --no-fund`。
4. 在同一台 Windows 先跑 renderer offline regression。
5. 驗證 Windows / PowerShell 5.1 / `BarTender.Application` COM。
6. 拒絕接管已存在的 `BarTend.exe`。
7. 執行 `PROBE.cmd`。
8. 建立 Canonical Renderer BTW。
9. Save / Reopen / BarTender Render Visual Gate。
10. PASS 或 FAIL 都回傳 Evidence Artifact。

## Artifact

可取得的內容會包含：

- `canonical.json`
- `fixture.json`
- `preflight.json`
- Node / npm runtime 記錄
- Windows renderer regression log
- `NATIVE_BUILD_RESULT.zip`
- `LATEST_NATIVE_OUTPUT.btw`
- `LATEST_NATIVE_REPORT.json`
- `native-results/**`
- Visual evidence / renderer evidence

## 第一輪完成後

第一輪目的只在取得真實 BarTender Evidence。

在確認互動 Runner + BarTender COM 穩定之前，不安裝成背景 Service。證據通過後再評估是否需要把 Runner 長期化。

## 禁止事項

在 Windows Evidence 完成前：

- 不 merge PR #35。
- 不修改正式 `main` Renderer 路由。
- 不部署 Canonical Renderer 到正式 GitHub Pages。
- 不把離線 PASS 宣稱成 BarTender 實機 PASS。
