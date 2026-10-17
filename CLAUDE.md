## Agent skills

### Issue tracker

Issues 放在本 repo 的 GitHub Issues，一律用 `gh` CLI 操作。見 `docs/agents/issue-tracker.md`。

### Triage labels

沿用預設的五個標籤：needs-triage、needs-info、ready-for-agent、ready-for-human、wontfix。見 `docs/agents/triage-labels.md`。

### Domain docs

單一 context：詞彙表是根目錄的 `GLOSSARY.md`（技能文件寫 `CONTEXT.md` 時，在本 repo 一律指 `GLOSSARY.md`），ADR 放在 `docs/adr/`。見 `docs/agents/domain.md`。

### Workflow

測試、建置與驗證一律直接用 `node`／`python3` 執行；commit、PR 的更新與合併方式見 `docs/agents/workflow.md`。
