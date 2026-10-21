# OpenAI GPT-6 Model Family (API IDs, Sol Naming, Migration Notes) — Evidence File

**Accessed date for all sources:** 2026-10-21
**Scope:** choosing the default model for `skills/chatgpt/api-workflow.py`, which calls `client.responses.create(model=..., instructions=..., input=[...])` with no tools and no `temperature`, then parses JSON out of `response.output_text`.

> **中文說明**：本檔是研究代理在 2026-10-21 逐條記錄的英文原始證據，用來決定 ChatGPT skill 的預設模型 ID。結論：GPT-6 家族的 API 模型 ID 有四個：`gpt-6-astra`、`gpt-6.1-sol`、`gpt-6-sol`、`gpt-6-luna`。`gpt-6-sol` 與 `gpt-6.1-sol` 是兩個各自獨立的模型（各有模型頁與 SDK 識別字），彼此不是別名，文件也沒有寫錯。OpenAI 官方建議「不確定從哪個開始就用 `gpt-6-astra`」。我們的呼叫方式（不帶 tools、不帶 temperature）不受遷移注意事項影響。API 的 `gpt-5.5` 沒有被棄用；ChatGPT 登入的 Codex 已於 2026-10-14 停用 GPT-5.5。

## Verification method and caveats

- `developers.openai.com` was **reachable** this session. Each page was fetched twice: once with WebFetch (summary) and once as raw Markdown with `curl https://developers.openai.com/<path>.md`. The site documents that suffix: "Markdown versions of documentation pages are available by appending `.md` to the page URL." All quotes below come from the raw Markdown.
- `learn.chatgpt.com` was reachable. `developers.openai.com/codex/models.md` returns a 308 redirect to `https://learn.chatgpt.com/docs/models.md`.
- `github.com/openai/openai-python` was read with `gh api` (README, `src/openai/types/shared/chat_model.py`, CHANGELOG.md, commits, releases).
- **Blocked (HTTP 403):** `openai.com` (`/index/`, `/index/gpt-6-astra/`, `/index/path-to-astra/`), `help.openai.com`, `chatgpt.com`. No announcement-page or help-center text is used below.
- No third-party sources are used.

Evidence tiers: **VERIFIED** means the text was fetched verbatim from an official OpenAI page or the official GitHub repo. **PARTIALLY VERIFIED** means it is official, but the specific point is inferred or only stated indirectly. **UNVERIFIED** means it could not be confirmed.

---

## Q1. GPT-6 model IDs and OpenAI's positioning

- **VERIFIED**: the models overview (https://developers.openai.com/api/docs/models) says: "If you're not sure where to start, use [GPT-6 Astra](/api/docs/models/gpt-6-astra), our flagship model for complex reasoning and coding. Choose [GPT-6.1 Sol](/api/docs/models/gpt-6.1-sol) to balance intelligence and cost, or [GPT-6 Luna](/api/docs/models/gpt-6-luna) for cost-sensitive, high-volume workloads." Featured models: "GPT-6 Astra … Start here for complex reasoning and coding." / "GPT-6.1 Sol … Balance intelligence and cost." / "GPT-6 Luna … Optimize cost-sensitive, high-volume workloads."
- **VERIFIED**: the full catalog on the same page lists four GPT-6 entries: "GPT-6 Astra: Our most capable model for the most demanding work." / "GPT-6 Luna: Our most efficient model for focused, high-volume tasks." / "GPT-6 Sol: Built to power complex coding and agentic workflows." / "GPT-6.1 Sol: Near-Astra performance for complex work at a lower cost."
- **VERIFIED**: the "Using GPT-6" guide (https://developers.openai.com/api/docs/guides/latest-model) describes GPT-6 Astra as "**Highest intelligence**", GPT-6.1 Sol as "**Balanced speed, cost, and intelligence**", and GPT-6 Luna as "**Fastest and most cost-effective**". The guide's frontmatter sets `latestModelInfo: model: gpt-6-astra`.
- **VERIFIED**: the model-selection guide (https://developers.openai.com/api/docs/guides/model-selection) says: "If cost and latency aren't a concern, you can default to Astra." It describes tiers from "Luna · Low" through "GPT-6.1 Sol · Medium" ("Complex technical work and coordinated deliverables you expect to revise.") up to "Astra · Extra high".
- **VERIFIED**: the reasoning guide (https://developers.openai.com/api/docs/guides/reasoning) says: "Start with `gpt-6-astra` for most reasoning workloads."
- **VERIFIED**: the official SDK model list `src/openai/types/shared/chat_model.py` contains `"gpt-6-astra"`, `"gpt-6.1-sol"`, `"gpt-6-sol"`, `"gpt-6-luna"`, `"gpt-5.6-sol"`, `"gpt-5.6-terra"`, `"gpt-5.6-luna"`, `"gpt-5.5"` and `"gpt-5.5-2026-04-23"`.

| Model ID | Snapshot(s) listed | reasoning.effort (default) | Context / max output | Knowledge cutoff | Price in/out per 1M (Standard) |
|---|---|---|---|---|---|
| `gpt-6-astra` | `gpt-6-astra` only | `low`…`max`; **no default stated** | 1,050,000 / 128,000 (max input 922,000) | Apr 30, 2026 | $10 / $50 |
| `gpt-6.1-sol` | `gpt-6.1-sol` only | `low`, `medium` (default), `high`, `xhigh`, `max` | 1,050,000 / 128,000 | Apr 30, 2026 | $2 / $10 |
| `gpt-6-sol` | `gpt-6-sol` only | `none`, `low`, `medium` (default), `high`, `xhigh`, `max` | 1,050,000 / 128,000 | Apr 20, 2026 | $2 / $10 |
| `gpt-6-luna` | `gpt-6-luna` only | `none`, `low`, `medium` (default), `high`, `xhigh`, `max` | 1,050,000 / 128,000 | May 18, 2026 | $0.1 / $0.5 |
| `gpt-5.5` (reference) | `gpt-5.5-2026-04-23` | none, low, medium (default), high, xhigh | 1,050,000 / 128,000 | Dec 01, 2025 | $5 / $30 |

Every value in the table is **VERIFIED** from the corresponding page `https://developers.openai.com/api/docs/models/<id>`. All five pages list `structured_outputs` and mark `v1/responses` as "Supported".

## Q2. `gpt-6-sol` vs `gpt-6.1-sol`

- **VERIFIED**: both IDs have separate model pages. https://developers.openai.com/api/docs/models/gpt-6-sol has "Model ID: `gpt-6-sol`", "Default snapshot: `gpt-6-sol`", "Use `gpt-6-sol` in your API requests.", and "See [GPT-6.1 Sol](/api/docs/models/gpt-6.1-sol) for the newer Sol model." No deprecated or legacy label is applied to the model. The only "legacy" text on the page is the endpoint row "Completions (legacy)".
- **VERIFIED**: https://developers.openai.com/api/docs/models/gpt-6.1-sol has "Model ID: `gpt-6.1-sol`", "Default snapshot: `gpt-6.1-sol`", and "Use `gpt-6.1-sol` to select this model." The page does not mention `gpt-6-sol` and contains no alias text.
- **VERIFIED**: the SDK added the two IDs separately. CHANGELOG v3.18.0 (2026-09-22): "**api:** add GPT-6 Sol and Luna model identifiers (#3935)". CHANGELOG v3.21.0 (2026-09-29): "**api:** add GPT-6.1 Sol model identifier (#3986)". Earlier, v3.8.0 (2026-09-03): "**api:** add gpt-6-astra and related features (#3791)".
- **VERIFIED**: the guide treats them as different models that behave differently: "If you already use [`gpt-6-sol`](…/models/gpt-6-sol), review the [migration guidance](#migration-quickstart) before switching to GPT-6.1 Sol." It also says: "GPT-6 Astra and GPT-6.1 Sol do not support the `none` reasoning effort; GPT-6 Sol and GPT-6 Luna do." The two models also differ in cached-input price ($0.2 vs $0.1) and knowledge cutoff (Apr 20 vs Apr 30, 2026).
- **VERIFIED**: the deprecations page (https://developers.openai.com/api/docs/deprecations), section "2026-10-01: GPT-5.3-Codex, GPT-5.1, GPT-5.4-Nano", lists "| Apr 1, 2027 | `gpt-5.3-codex` | `gpt-6-sol` |" and "| Apr 1, 2027 | `gpt-5.1` | `gpt-6-sol` |". The ChatGPT workspace page also says "Replace `gpt-5.4` with `gpt-6-sol` (GPT-6 Sol) when available."

**Conclusion:** `gpt-6-sol` and `gpt-6.1-sol` are **both valid, distinct model IDs**. Neither is an alias or snapshot of the other. `gpt-6.1-sol` is the newer Sol model and the one featured in the overview. The deprecations page is therefore **not a doc error**: it names a real, live, non-deprecated model. The docs never say why the 2026-10-01 replacements point to the older Sol. The fact that `gpt-6-sol` still accepts `none` effort is a possible reason, but that is UNVERIFIED speculation.

## Q3. Migration notes from GPT-5.5 that could affect our call shape

All of the following are **VERIFIED** from the "Migration quickstart › Update API and model parameters" section of https://developers.openai.com/api/docs/guides/latest-model.

- "Set `model` to `gpt-6-astra`, `gpt-6.1-sol`, or `gpt-6-luna`, then check the following:"
- Reasoning effort: "Preserve your current effective reasoning effort where supported. GPT-6 Astra and GPT-6.1 Sol do not support `none`; use `low` instead. GPT-6 Sol and GPT-6 Luna support `none`. If your existing request uses `minimal`, start with `low` …" The reasoning guide adds: "Setting `reasoning.effort` … to `none` returns HTTP 400" for GPT-6 Astra.
- Unsupported parameters: "When reasoning effort is not `none`, remove `temperature`, `top_p`, and `top_logprobs`. … For Responses, remove `message.output_text.logprobs` from `include`."
- Prompt caching: "When migrating from GPT-5.5 or earlier, replace `prompt_cache_retention` with `prompt_cache_options.ttl` set to `"30m"`."
- Tool calling: "GPT-6 Astra and GPT-6.1 Sol support Chat Completions, but tool calling requires Responses."
- Defaults (reasoning guide): "If you omit `reasoning.effort`, GPT-5.6 defaults to `medium` in both modes. GPT-6.1 Sol, GPT-6 Sol, and GPT-6 Luna also default to `medium` reasoning effort." Also: "`standard` is the default" `reasoning.mode`.
- Structured Outputs: "GPT-6 also supports the existing API capabilities available with GPT-5.6, including … [Structured Outputs](…/guides/structured-outputs)". Every GPT-6 model page lists `structured_outputs`.
- **Not stated anywhere in the fetched pages:** any change to the response object, `output_text`, `text.format`, `verbosity` or `max_output_tokens`. The guide contains no "phase", "verbosity" or "max_output_tokens" text. The default effort for `gpt-6-astra` is also not stated (UNVERIFIED). Its model page only says "`reasoning.effort` supports `low`, `medium`, `high`, `xhigh`, and `max`."
- **Effect on our call (inference, PARTIALLY VERIFIED):** we send no `temperature`, `top_p`, `reasoning`, `include`, tools, or `prompt_cache_retention`. None of the listed breaking changes applies, so swapping only the `model` string should be enough. The GPT-6 prompting section warns: "The model tends toward detailed, formatted responses". Our JSON-from-text parsing should therefore keep its tolerance for surrounding prose or code fences. Structured Outputs (`text.format`) is available if we ever want strict JSON.

## Q4. Status of `gpt-5.5`

- **VERIFIED (API):** the deprecations page contains no `gpt-5.5` entry. Its latest announcement is "2026-10-14: GPT-4 series model deprecations". The models catalog still lists "GPT-5.5: A new class of intelligence for coding and professional work." The model page https://developers.openai.com/api/docs/models/gpt-5.5 has no deprecation notice and lists snapshot `gpt-5.5-2026-04-23`. Note: "deprecated" here only means listed on the deprecations page. The docs define "legacy" separately, and that term was not checked for gpt-5.5 beyond the model page.
- **VERIFIED (ChatGPT/Codex, not API):** https://learn.chatgpt.com/docs/models says: "Effective October 14, 2026, at noon PDT (19:00 UTC), GPT-5.5 retires from Codex for users signed in with ChatGPT. The OpenAI API and Codex sessions authenticated with an API key aren't affected."

## Q5. Official SDK examples (openai/openai-python)

- **VERIFIED:** the README (fetched 2026-10-21 via `gh api repos/openai/openai-python/readme`) still uses `model="gpt-5.5"` throughout, including `client.responses.create(model="gpt-5.5", instructions=..., input=...)` followed by `print(response.output_text)`. It has 0 matches for `gpt-6`, `astra` or `luna`. A code search of `examples/` for `gpt-6` returns 0 results, while `gpt-5.5` appears in `examples/demo.py`, `streaming.py`, `async_demo.py` and others.
- **VERIFIED:** the GPT-6 IDs exist only in the type definitions (`chat_model.py`) and the CHANGELOG (see Q2). The last 5 releases (v3.32.0 2026-10-16 through v3.35.1 2026-10-18) do not mention GPT-6 in their notes. Recent commits (to 2026-10-20) do not mention it either.

## Q6. ChatGPT app model picker names

- **BLOCKED:** `help.openai.com` and `chatgpt.com` both return 403.
- **VERIFIED (learn.chatgpt.com, OpenAI's ChatGPT Work/Codex docs):** "In ChatGPT, GPT-6.1 Sol, GPT-6 Sol, and GPT-6 Luna are available in Work and Codex. They aren't available in Chat." Also: "Select `gpt-6.1-sol` or `gpt-6-luna` in your model picker or saved configuration when available." The model cards are labelled "Astra", "6.1 Sol" and "6 Luna"; the Astra card is marked for "ChatGPT desktop app" and "ChatGPT web". Recommendation text: "For complex coding and agentic workflows, use GPT-6.1 Sol when available to your account and client."
- **UNVERIFIED:** the exact names in the consumer Chat model picker (help center blocked).

---

## Sources

| Title | URL | Date | Accessed | Status |
|---|---|---|---|---|
| Models (overview + catalog) | https://developers.openai.com/api/docs/models | n/a | 2026-10-21 | VERIFIED; Astra "start here"; 4 GPT-6 IDs |
| GPT-6 Astra model page | https://developers.openai.com/api/docs/models/gpt-6-astra | n/a | 2026-10-21 | VERIFIED; no default effort stated |
| GPT-6.1 Sol model page | https://developers.openai.com/api/docs/models/gpt-6.1-sol | n/a | 2026-10-21 | VERIFIED; no none/minimal |
| GPT-6 Sol model page | https://developers.openai.com/api/docs/models/gpt-6-sol | n/a | 2026-10-21 | VERIFIED; "newer Sol model" pointer |
| GPT-6 Luna model page | https://developers.openai.com/api/docs/models/gpt-6-luna | n/a | 2026-10-21 | VERIFIED |
| GPT-5.5 model page | https://developers.openai.com/api/docs/models/gpt-5.5 | n/a | 2026-10-21 | VERIFIED; no deprecation notice |
| Using GPT-6 (latest-model guide) | https://developers.openai.com/api/docs/guides/latest-model | n/a | 2026-10-21 | VERIFIED; migration quickstart |
| Model selection guide | https://developers.openai.com/api/docs/guides/model-selection | n/a | 2026-10-21 | VERIFIED |
| Reasoning guide | https://developers.openai.com/api/docs/guides/reasoning | n/a | 2026-10-21 | VERIFIED; defaults, HTTP 400 for none on Astra |
| Deprecations | https://developers.openai.com/api/docs/deprecations | latest entry 2026-10-14 | 2026-10-21 | VERIFIED; gpt-6-sol as replacement; no gpt-5.5 |
| Developer blog index | https://developers.openai.com/blog/ | n/a | 2026-10-21 | VERIFIED (titles only); 4 GPT-6/Astra posts |
| Maintaining software with the GPT-6 family | https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family.md | n/a | 2026-10-21 | VERIFIED via WebFetch summary; display names only |
| ChatGPT Work/Codex Models | https://learn.chatgpt.com/docs/models | n/a | 2026-10-21 | VERIFIED; GPT-5.5 retirement in Codex 2026-10-14 |
| Workspace model availability | https://learn.chatgpt.com/docs/enterprise/workspace-model-availability | n/a | 2026-10-21 | VERIFIED |
| openai-python README | https://github.com/openai/openai-python | n/a | 2026-10-21 | VERIFIED; still gpt-5.5 |
| openai-python chat_model.py | https://github.com/openai/openai-python/blob/main/src/openai/types/shared/chat_model.py | n/a | 2026-10-21 | VERIFIED; all 4 GPT-6 IDs |
| openai-python CHANGELOG / releases | https://github.com/openai/openai-python/blob/main/CHANGELOG.md | v3.8.0 2026-09-03; v3.18.0 2026-09-22; v3.21.0 2026-09-29 | 2026-10-21 | VERIFIED |
| GPT-6 Astra announcement | https://openai.com/index/gpt-6-astra/ | n/a | 2026-10-21 | BLOCKED (403) |
| Path to Astra | https://openai.com/index/path-to-astra/ | n/a | 2026-10-21 | BLOCKED (403) |
| OpenAI Help Center / ChatGPT | https://help.openai.com/en/ ; https://chatgpt.com/ | n/a | 2026-10-21 | BLOCKED (403) |
