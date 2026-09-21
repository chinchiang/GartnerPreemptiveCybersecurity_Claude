# Reusable "Skills" / Custom Instructions / Workflows Across Five AI Platforms — Evidence File

**Accessed date for all sources:** 2026-09-09
**Scope:** ChatGPT (OpenAI), Claude (Anthropic), Grok (xAI), GLM (Zhipu / Z.ai), DeepSeek — plus the Agent Skills open standard (agentskills.io).

> **中文說明**：本檔是研究代理在 2026-09-09 逐條記錄的英文原始證據（平台能力、官方文件可達性、查證等級），供核對網站「平台比較」與「證據與來源」表使用；正體中文整理版見 `docs/research/07-platforms.md` 與各平台教學。注意：agentskills.io 採用清單宣告 50 筆、本檔只擷取到 45 筆，因此「xAI／Z.ai／DeepSeek 不在清單上」屬部分查證。

## Verification method and an important caveat

Pages were fetched directly (WebFetch) wherever the network egress policy of this session allowed. The following official hosts were **blocked by the egress proxy** and could not be fetched: `agentskills.io`, `help.openai.com`, `platform.openai.com`, `developers.openai.com`, `openai.com`, `chatgpt.com`, `docs.x.ai`, `x.ai`, `grok.com`, `docs.z.ai`, `z.ai`, `chat.z.ai`, `open.bigmodel.cn`, `chatglm.cn`, `api-docs.deepseek.com`, `deepseek.com`, `chat.deepseek.com`, `huggingface.co`, `support.claude.com`, `en.wikipedia.org`.

Reachable and fetched in full: `platform.claude.com`, `code.claude.com`, `github.com` / `raw.githubusercontent.com` (including the official repos of all five vendors and of the Agent Skills standard), plus web search.

Evidence tiers used below:

- **VERIFIED** — fetched from an official page (vendor docs site or the vendor's official GitHub organization); quotes are verbatim.
- **PARTIALLY VERIFIED** — an official URL was surfaced by web search with a snippet, but the page itself could not be fetched because of the egress block. Treat as likely but not fully confirmed.
- **UNVERIFIED** — only third-party sources (blogs, news, aggregators) were available. Do not rely on these without re-checking.

---

## 0. The Agent Skills open standard (agentskills.io)

### What it is (VERIFIED via the standard's official GitHub repo)

- Repo `github.com/agentskills/agentskills` README: "Agent Skills are a lightweight, open format for extending AI agent capabilities with specialized knowledge and workflows." Licensing: "Code: Apache 2.0 | Documentation: CC-BY-4.0". The README points to `agentskills.io/specification` and to example skills at `github.com/anthropics/skills`.
- Specification (`docs/specification.mdx`, raw): `name` "Must be 1-64 characters", "only unicode lowercase alphanumeric characters (a-z, 0-9) and hyphens", "Must not start or end with a hyphen", "Must not contain consecutive hyphens". `description`: "Max 1024 characters. Non-empty. Describes what the skill does and when to use it." Optional fields: `license`, `compatibility` ("Max 500 characters if provided"), `metadata` ("A map from string keys to string values"), `allowed-tools` ("A space-separated string of tools that are pre-approved to run", marked experimental). Directory layout: `SKILL.md` (required) plus optional `scripts/`, `references/`, `assets/`. Body: "The Markdown body after the frontmatter contains the skill instructions. There are no format restrictions." Guidance: "Keep your main SKILL.md under 500 lines. Move detailed reference material to separate files."
- Progressive disclosure (README): "Discovery: Agents load skill names and descriptions at startup"; "Activation: Full SKILL.md instructions load when task-relevant"; "Execution: Agents follow instructions and execute bundled code as needed".

### Adopters listed by the official site (VERIFIED from the site's source data file `docs/snippets/clients.jsx`)

The data file reports **50 entries**; 45 could be extracted from the fetch. Entries include (vendor in parentheses where the file gives one): Junie (JetBrains), ZeroClaw, Gemini CLI (Google), Autohand Code CLI, OpenCode (SST), OpenHands, Mux (Coder), Cursor, Amp, Letta, Firebender, Goose (Block), GitHub Copilot (Microsoft/GitHub), VS Code (Microsoft), **Claude Code (Anthropic)**, **Claude (Anthropic)**, **"ChatGPT & Codex" (OpenAI, https://chatgpt.com/codex/)**, Piebald, Factory, pi, Databricks Genie Code, Agentman, TRAE, Spring AI, Roo Code, Mistral AI Vibe, Command Code, Ona, VT Code, Qodo, Laravel Boost, Emdash, Snowflake Cortex Code, Kiro, Workshop, Google AI Edge Gallery, nanobot, fast-agent, bub, Tabnine, Vita, Superconductor, **Deep Code ("DeepSeek terminal assistant")**, Pulumi Neo, Hermes Agent (Nous Research), OpenClaw.

**Not present in the extracted list:** any xAI/Grok product, any Zhipu/Z.ai product, and DeepSeek's own first-party apps (only the third-party "Deep Code" terminal assistant references DeepSeek). Five entries of the 50 were not extracted, so absence is strong but not absolute — marked PARTIALLY VERIFIED for those three vendors.

Third-party counts ("32 adopters as of March 2026", "40+ by mid-2026") are UNVERIFIED and superseded by the 50-entry data file above.

---

## 1. ChatGPT (OpenAI)

### Model vs. application

- **Model layer:** GPT-5.x family served through the OpenAI API.
- **Application/runtime layer:** ChatGPT (consumer/business app: Custom Instructions, Projects, Custom GPTs, agent features), Codex (CLI, IDE extension, desktop app, cloud), and the API (Responses API).

### Models (verification status mixed)

- **VERIFIED (official GitHub `openai/openai-python` README):** examples use `model="gpt-5.5"` throughout, `"gpt-realtime-2"` for Realtime, and `"openai.gpt-5.4"` for the Amazon Bedrock route. The Responses API pattern shown is `response = client.responses.create(model="gpt-5.5", input=...)`, "recommended over the Chat Completions API".
- **PARTIALLY VERIFIED:** official announcement URLs surfaced by search: `openai.com/index/introducing-gpt-5-5/` and `openai.com/index/gpt-5-6/` ("GPT-5.6: Frontier intelligence that scales with your ambition"). Pages could not be fetched.
- **UNVERIFIED (third-party only):** the ChatGPT model-picker lineup described as "GPT-5.6 Sol / Terra / Luna", "GPT-5.5 / 5.5 Pro", "GPT-5.4 / 5.4 Pro / mini / nano", and a claimed "GPT-6 Astra". Do not cite.

### Hosting apps and customization mechanisms

- **Custom Instructions — PARTIALLY VERIFIED.** Official article `help.openai.com/en/articles/8096356-chatgpt-custom-instructions` exists (search-surfaced). Snippets: "custom instructions allow you to share anything you'd like ChatGPT to consider in its response"; fields "What would you like ChatGPT to know about you?" and "How would you like ChatGPT to respond?". Character limits reported as 1,500 (Free/Go) vs 5,000 (paid) — UNVERIFIED (third-party).
- **Projects — UNVERIFIED for limits.** Third-party sources report per-project file caps (5 Free / 25 Go-Plus / 40 Pro-Business-Enterprise) and "no published character limit exists for project instructions". Official article could not be fetched.
- **Custom GPTs — PARTIALLY VERIFIED.** Official articles `help.openai.com/en/articles/8554397-creating-a-gpt` and `8555545-file-uploads-faq` exist. Search snippets attributed to the FAQ: "hard limit of 512MB per file", "capped at 2M tokens per file", "Up to 20 files per GPT". Not fetched.
- **Workspace agents vs Custom GPTs — PARTIALLY VERIFIED.** Search snippet from official Enterprise/Business release notes: "Custom GPTs are lighter, builder-first helpers, while workspace agents are shared, persistent, and schedulable".
- **Codex — VERIFIED (official GitHub `openai/codex`):** "We recommend signing into your ChatGPT account to use Codex as part of your Plus, Pro, Business, Edu, or Enterprise plan." Docs live at `developers.openai.com/codex`; the repo's `docs/skills.md` says only: "For information about skills, refer to this documentation (https://developers.openai.com/codex/skills)." PARTIALLY VERIFIED (help-center snippet): "Codex is included across ChatGPT plans, including Free and Go."

### Agent Skills support in Codex

- **VERIFIED (official GitHub `openai/skills` README):** the repo describes itself as governed by the "Agent Skills open standard (https://agentskills.io)"; "Skills in `.system` are automatically installed in the latest version of Codex"; install via "$skill-installer gh-address-comments" or a GitHub directory URL; "restart Codex to pick up new skills". **Deprecation notice:** "This repository is deprecated. For current Codex skill and plugin examples, use the OpenAI Plugins repository (https://github.com/openai/plugins)."
- **VERIFIED (official GitHub `openai/plugins` README):** "Each plugin lives under `plugins/<name>/` with a required `.codex-plugin/plugin.json` manifest and optional companion surfaces such as `skills/`, `.app.json`, `.mcp.json`"; a default marketplace file at `.agents/plugins/marketplace.json`.
- **VERIFIED (agentskills.io data file):** "ChatGPT & Codex (OpenAI)" is listed as a supporting client.
- **PARTIALLY VERIFIED (search snippets attributed to `developers.openai.com/codex/skills`):** "Codex reads skills from repository, user, admin, and system locations"; "Codex scans `.agents/skills` in every directory from your current working directory up to the repository root"; user-level skills at "`$HOME/.agents/skills`"; "Codex starts with each skill's name, description, and file path, and loads the full SKILL.md instructions only when it decides to use a skill"; invoke with "$skill-name". The `~/.codex/skills` path appears only in third-party sources (UNVERIFIED as a current path).
- **PARTIALLY VERIFIED:** an API-side skills guide exists at `developers.openai.com/api/docs/guides/tools-skills` ("Skills | OpenAI API"); content not fetched.

### API / tool calling

- **VERIFIED:** Responses API (`client.responses.create`) is the primary pattern in the official SDK README; the SDK documents `base_url` / `OPENAI_BASE_URL` override and an mTLS endpoint `https://mtls.api.openai.com/v1`.
- Function-calling guide at `platform.openai.com/docs/guides/function-calling` — UNVERIFIED for current content (blocked).

### Skill-equivalent mechanism recommendation

- For **developer/agent workflows**: use the Agent Skills format in `.agents/skills/<name>/SKILL.md` (repo scope) or `$HOME/.agents/skills` (user scope) for Codex; package multiple skills plus MCP/app config as a Codex **plugin** (`.codex-plugin/plugin.json` + `skills/`). This is the same SKILL.md format Claude Code uses, so one skill folder can be shared across both.
- For **ChatGPT chat users**: Projects (instructions + files) is the closest per-workflow container; Custom GPTs for shareable, instruction+knowledge+Actions bundles; Custom Instructions for global defaults. None of these consume SKILL.md directly (no official evidence found).

### Unverified items

- Exact current ChatGPT model-picker names; Custom Instructions/Project character limits; Projects file caps; whether ChatGPT (non-Codex) can load SKILL.md skills; `~/.codex/skills` as a still-supported path; "ChatGPT Agent mode" current naming and capabilities.

---

## 2. Claude (Anthropic)

### Model vs. application

- **Model layer:** Claude API models (below).
- **Application/runtime layers:** claude.ai apps (web/desktop/mobile), Claude Code (terminal, IDE, desktop app, web), Claude Developer Platform (Messages API with Skills API, code execution, MCP connector, Files API), Claude Agent SDK.

### Models (VERIFIED — `platform.claude.com/docs/en/about-claude/models/overview`)

Current lineup table: **Claude Fable 5.1** (`claude-fable-5-1`, 1M context, 128K max output, $10/$50 per MTok, retirement "Not sooner than September 1, 2027"), **Claude Opus 5** (`claude-opus-5`, 1M, 128K, $5/$25), **Claude Sonnet 5** (`claude-sonnet-5`, 1M, 128K, $2/$10), **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`, 200K, 64K, $1/$5). "If you're unsure which model to use, start with Claude Opus 5 for most workloads." Legacy, still available: "Claude Fable 5, Claude Opus 4.8, Claude Opus 4.7, Claude Opus 4.6, Claude Opus 4.5, Claude Sonnet 4.6, Claude Sonnet 4.5." Note: "Every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation on."

### Hosting apps and customization mechanisms (VERIFIED)

**Agent Skills overview** (`platform.claude.com/docs/en/agents-and-tools/agent-skills/overview`):

- Definition: "Agent Skills are modular capabilities that extend Claude's functionality. Each Skill packages instructions, metadata, and optional resources (scripts, templates) that Claude uses automatically when relevant."
- Progressive disclosure levels: "Level 1: Metadata (always loaded)" (~100 tokens per Skill), "Level 2: Instructions (loaded when triggered)" (under 5k tokens), "Level 3: Resources and code (loaded as needed)".
- Required frontmatter: `name` ("Maximum 64 characters", lowercase letters/numbers/hyphens, "Cannot contain reserved words: 'anthropic', 'claude'") and `description` ("Maximum 1024 characters").
- Where Skills work: "Custom Skills ... create them in Claude Code, upload them through the Claude API, or add them in claude.ai settings."
  - **claude.ai:** "Upload your own Skills as zip files through Settings > Features. Available on Pro, Max, Team, and Enterprise plans with code execution enabled. Custom Skills are individual to each user."
  - **Claude API:** "specify the relevant `skill_id` in the `container` parameter along with the code execution tool"; "create and upload your own through the Skills API (`/v1/skills` endpoints). Custom Skills are shared workspace-wide."
  - **Claude Code:** "place them in `~/.claude/skills/` (personal) or `.claude/skills/` (project)."
- Pre-built skills `pptx`, `xlsx`, `docx`, `pdf` on claude.ai, the API, Claude Platform on AWS, Microsoft Foundry.
- Cross-surface limitation: "Custom Skills do not sync across surfaces."

**Claude Code skills** (`code.claude.com/docs/en/skills`):

- "Claude Code skills follow the Agent Skills (https://agentskills.io) open standard, which works across multiple AI tools. Claude Code extends the standard with additional features like invocation control, subagent execution, and dynamic context injection."
- Locations: `~/.claude/skills/`, `.claude/skills/`, nested `<subdir>/.claude/skills/`, enterprise managed settings, and plugin `skills/`. Invocation: "/skill-name" or automatic. Extra frontmatter fields: `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell`, `arguments`, `when_to_use`, `argument-hint`, `metadata`, `license`, `compatibility`.
- Interop rule: "When uploading skills to claude.ai or the Skills API, only spec-compliant frontmatter fields work: `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`." Skills "synced from claude.ai" are honored in Claude Code with sanitized display text.

**Claude Agent SDK** (`code.claude.com/docs/en/agent-sdk/skills`): skills are "Defined as filesystem artifacts" loaded via `settingSources` / `setting_sources` (`user`, `project`); a `skills` option accepts `"all"`, a name list, or `[]`; "The SDK doesn't provide a programmatic API for registering them."

**Claude Code surfaces** (`code.claude.com/docs/en/overview`): "Available in your terminal, IDE, desktop app, and browser." Also `CLAUDE.md` project instructions, hooks, MCP, Routines.

**Projects in claude.ai** — PARTIALLY VERIFIED: official article `support.claude.com/en/articles/9517075-what-are-projects` exists; snippet: "you can define project instructions for each project" and upload files to a project knowledge base. Not fetched (blocked).

### API / tool calling (VERIFIED)

- Skills API (`platform.claude.com/docs/en/build-with-claude/skills-guide`): endpoints `POST/GET /v1/skills`, `GET/DELETE /v1/skills/{skill_id}`, `POST/GET /v1/skills/{skill_id}/versions`; limits "Maximum Skills per request: 20", "Maximum upload size: 30 MB (uncompressed)". Requests use `container.skills[{type, skill_id, version}]` plus a code execution tool; the quickstart uses `code_execution_20260521` (older `code_execution_20250825` also accepted). No beta header shown for Skills.
- MCP connector (`.../agents-and-tools/mcp-connector`): "Status: Beta", header `mcp-client-2025-11-20`; "connect to remote MCP servers directly from the Messages API without a separate MCP client"; "only tool calls are currently supported"; "The server must be publicly exposed through HTTP (supports both Streamable HTTP and SSE transports)."
- Files API (`.../build-with-claude/files`): "Maximum file size: 500 MB per file", "Total storage: 1 TB per organization"; "The Files API is out of beta and needs no beta header."

### Skill-equivalent mechanism recommendation

Use the SKILL.md Agent Skills format as the single source of truth. Keep the frontmatter to the six spec-compliant fields so the same folder can be (a) committed under `.claude/skills/` for Claude Code and the Agent SDK, (b) zipped and uploaded in claude.ai Settings, and (c) uploaded via `/v1/skills` for API use. Use Claude Code-only fields (`context: fork`, `paths`, `hooks`, etc.) only where those extras are needed. Use Projects for per-topic instructions and files in the chat app; use MCP (connector or Claude Code MCP config) for live tool access.

### Unverified items

- claude.ai Projects feature details (instructions length, file limits) — support article blocked. Claude Cowork specifics. Any "Claude Mythos 5.1" details (name appears once in a pricing footnote on the models page but has no lineup row).

---

## 3. Grok (xAI)

### Model vs. application

- **Model layer:** Grok 4.x API models.
- **Application/runtime layers:** grok.com / Grok apps, Grok in X, and the xAI API (api.x.ai) with server-side "Agent Tools".

### Models

- **VERIFIED (official GitHub `xai-org/xai-sdk-python`):** README examples use `"grok-4.6"`; `examples/sync/server_side_tools.py` uses `"grok-4.20"`. README feature bullets: "Agentic Tool Calling: Let Grok autonomously decide when to search the web, 𝕏, or execute code to answer your questions with real-time information"; "Function Calling: Define tools and let the model intelligently call them"; "Structured Outputs: Return model responses as structured objects in the form of Pydantic models".
- **PARTIALLY VERIFIED:** official pages surfaced by search: `x.ai/news/grok-4-6` ("Introducing Grok 4.6"), `x.ai/news/grok-4-1-fast` ("Grok 4.1 Fast and Agent Tools API"), `docs.x.ai/developers/grok-4-6` (snippet: "Grok 4.6 is the flagship model for code and everything else: agentic tool calling, minimal hallucinations, configurable reasoning"). Third-party reports give Grok 4.6 a release date of August 12, 2026 and a 500K context — UNVERIFIED.
- **UNVERIFIED:** Grok 5 (reported "in training"); Grok 4.5 / 4.3 details; context sizes (2M for 4.20/4.1 Fast, 1M for 4.3) — third-party only. The corporate naming "SpaceXAI (formerly xAI)" appears in search-result page titles from docs.x.ai and x.ai ("SpaceXAI Docs", "SpaceXAI"), so PARTIALLY VERIFIED; treat as a rename to confirm.

### Hosting apps and customization mechanisms (all UNVERIFIED — grok.com and x.ai blocked; no official help page reachable)

Third-party sources describe: custom instructions in grok.com settings (limit reportedly changed 12,000 → 4,000 → back); "Workspaces" (project-like containers with instructions and uploaded files); "Custom Agents" (up to 4 named personas, reportedly launched March 2026); Tasks (scheduled). None of this could be confirmed on an official page. No evidence of SKILL.md / Agent Skills support in grok.com.

### API / tool calling

- **VERIFIED (official SDK repo):** server-side tools `web_search()`, `x_search()`, `code_execution()`; client-side custom tools via `tool()`; example comment "All three tools are active, you can add/remove server-side tools as needed"; web/x search output "encrypted by default". Other examples: `collections_tool.py`, `function_calling.py`, `structured_outputs.py`, `files_chat.py`, `stored_chat.py`, `compaction.py`, `batch_request.py`.
- **PARTIALLY VERIFIED (docs.x.ai pages surfaced by search):** `docs.x.ai/developers/tools/overview`, `.../tools/web-search`, `.../tools/function-calling`, `docs.x.ai/docs/guides/structured-outputs`. Snippet: "These tools run entirely on xAI's infrastructure, so developers no longer need to manage API keys, rate limits, sandboxes, or retrieval pipelines."
- OpenAI-compatible endpoint: not mentioned in the SDK README; UNVERIFIED for current state.

### Skill-equivalent mechanism recommendation

xAI has no verified skills format. For the API, encode reusable procedures as system prompts plus function-calling tool definitions, and use Agent Tools (web/X search, code execution, collections) for server-side capabilities. For grok.com, the reported Workspaces/Custom Agents features would be the container — but confirm on grok.com before designing around them. A SKILL.md folder can still be used as a prompt-assembly source in your own harness that targets the xAI API.

### Unverified items

- All grok.com app features; Grok 5; exact model list, context windows and pricing on docs.x.ai; OpenAI/Anthropic API compatibility; "SpaceXAI" rename.

---

## 4. GLM (Zhipu AI / Z.ai)

### Model vs. application

- **Model layer:** GLM-5.x open-weight models (Hugging Face `zai-org/*`) served via Z.ai API Platform (international) and BigModel (China).
- **Application/runtime layers:** chat.z.ai (international), 智谱清言 chatglm.cn (China), ZCode (reported agentic IDE), GLM Coding Plan (subscription used inside third-party coding agents such as Claude Code).

### Models (VERIFIED — official GitHub `zai-org/GLM-5` README)

Model table: "GLM-5.3 & GLM-5.3-BF16: 744B-A40B"; "GLM-5.3-Flash & GLM-5.3-Flash-BF16: 320B-A18B"; "GLM-5.2 & GLM-5.2-FP8: 744B-A40B"; "GLM-5.1 & GLM-5.1-FP8: 744B-A40B"; "GLM-5 & GLM-5-FP8: 744B-A40B". GLM-5.2 has "a solid 1M-token context that stably sustains long-horizon work". GLM-5.2 claim: "81.0 vs. 62.0 on Terminal-Bench 2.1" vs GLM-5.1. README: "Use GLM-5.3 & GLM-5.3-Flash API services on Z.ai API Platform" with docs at `docs.z.ai/guides/llm/glm-5.3`. Repo license Apache-2.0. GitHub org also shows GLM-4.5 ("Agentic, Reasoning, and Coding (ARC) Foundation Models") and GLM-V.

- **PARTIALLY VERIFIED:** `docs.z.ai/guides/llm/glm-5` exists (search-surfaced). Third-party: GLM-5.3 released August 14, 2026, weights on Hugging Face August 28 under a custom "GLM-5.3 License" — UNVERIFIED. GLM-4.6 / GLM-4.7 existence — appears in third-party Claude Code configs (`glm-4.7`) — UNVERIFIED for current availability.

### Hosting apps and customization mechanisms

- **GLM Coding Plan + Claude Code — VERIFIED (official GitHub `zai-org/zai-coding-plugins`):** "Z.ai Coding Plugins Marketplace in Claude Code"; plugins "enhance coding productivity and provide GLM Coding Plan relate service for Claude Code"; install with `claude plugin marketplace add zai-org/zai-coding-plugins`; plugins `glm-plan-usage` and `glm-plan-bug` invoked as `/glm-plan-usage:usage-query`. This confirms Z.ai officially targets Claude Code as a host runtime.
- **Anthropic-compatible endpoint — PARTIALLY VERIFIED (third-party quoting docs.z.ai DevPack):** `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic` with `ANTHROPIC_AUTH_TOKEN`; "The GLM Coding Plan quota is only intended to be used within coding/IDE tools designated or recognized by Z.ai (such as Claude Code, Kilo Code, etc.)". Not fetched.
- **Agent Skills support — VERIFIED in part:** the official `zai-org/GLM-5` repo ships `skills/glm-master-skill/SKILL.md` whose frontmatter uses `name`, `description`, and `metadata` (with an `openclaw:` sub-map) — all agentskills.io spec fields — and describes itself as a "documentation-only master skill" listing "official GLM skills, install methods, and source links". Interpretation: Z.ai publishes skills in the open SKILL.md format for third-party hosts (Claude Code, OpenClaw); no evidence that chat.z.ai or chatglm.cn themselves load SKILL.md.
- **chat.z.ai / 智谱清言 features (智能体 / agent center, 知识库 knowledge base, file upload) — UNVERIFIED:** both hosts blocked; only third-party Chinese directory pages found.
- **ZCode — UNVERIFIED:** third-party reports of a free desktop agentic IDE (launched around July 2026) with Claude Code-like tool and skill taxonomy.

### API / tool calling

- **PARTIALLY VERIFIED:** Z.ai API Platform docs (`docs.z.ai`) referenced by the official README; OpenAI-compatible and Anthropic-compatible endpoints are reported by third parties. Function calling on GLM-5.x is UNVERIFIED on official pages (blocked), although the models are marketed as agentic ("From Vibe Coding to Agentic Engineering").

### Skill-equivalent mechanism recommendation

Author skills in the standard SKILL.md format and run them in Claude Code (or OpenCode/OpenClaw) with the GLM Coding Plan's Anthropic-compatible endpoint as the model backend — this is the configuration Z.ai itself supports via its Claude Code plugin marketplace and its published `glm-master-skill`. For the consumer chat apps, rely on their native agent/knowledge-base features once verified.

### Unverified items

- GLM-5.3 release date and license; GLM-4.6/4.7 status; chat.z.ai and chatglm.cn agent/knowledge-base features; ZCode; official function-calling/structured-output docs; BigModel (open.bigmodel.cn) model list.

---

## 5. DeepSeek

### Model vs. application

- **Model layer:** DeepSeek-V4 family (open weights on Hugging Face) served by the DeepSeek API.
- **Application layer:** chat.deepseek.com and the mobile apps; open-source `deepseek-harness` agent harness.

### Is DeepSeek V4 officially released? — Answer: **Yes (PARTIALLY VERIFIED on official pages; corroborated by official GitHub content).**

- **VERIFIED (official GitHub `deepseek-ai/awesome-deepseek-agent` README):** integration guides reference "DeepSeek-V4-Pro or DeepSeek-V4-Flash" as the primary models. This is first-party content confirming the V4 model names exist.
- **VERIFIED (official GitHub org listing):** there is **no** `DeepSeek-V4` code repo on GitHub; the newest model repo is `DeepSeek-V3.2-Exp` (updated Nov 18, 2025; MIT). Newer org activity is infrastructure: `deepseek-harness` ("Everything is a Plugin", updated Sep 9, 2026), `DeepGEMM`, `DeepEP`, `FlashMLA`, `DeepSpec`, `DeepSeek-OCR-2`.
- **PARTIALLY VERIFIED (official URLs surfaced by search, not fetchable):**
  - `api-docs.deepseek.com/news/news260424/` — "DeepSeek V4 Preview Release" (April 24, 2026). Snippet: models `deepseek-v4-pro` and `deepseek-v4-flash`, "available via both the OpenAI ChatCompletions interface and the Anthropic interface"; "the base_url remains unchanged, and the model parameter should be set to deepseek-v4-pro or deepseek-v4-flash"; "The two legacy API model names, deepseek-chat and deepseek-reasoner, will be discontinued in three months (2026-07-24)."
  - `api-docs.deepseek.com/news/news260813/` — "DeepSeek-V4-Pro GA Release". Snippets: model ID remains `deepseek-v4-pro`; "Context length remains 1M tokens; maximum output is 384K tokens"; "JSON Output, Tool Calls, Chat Prefix Completion (Beta), and FIM Completion (Beta, non-thinking only) are supported"; new pricing effective "16:00 UTC, Aug 16, 2026"; an experimental "DeepSeek-V4-Flash-Vision-Exp" added.
  - `api-docs.deepseek.com/updates/` — Change Log: "deepseek-chat & deepseek-reasoner will be fully retired and inaccessible after Jul 24th, 2026, 15:59 (UTC Time)".
  - Hugging Face: `deepseek-ai/DeepSeek-V4-Pro-0813`, `DeepSeek-V4-Pro`, `DeepSeek-V4-Pro-Base`, `DeepSeek-V4-Pro-DSpark`. Snippet: "1.6T total parameters and 49B activated parameters, supporting a context length of one million tokens"; "DeepSeek-V4-Pro-0813 is the official release of DeepSeek-V4-Pro, superseding the preview version". License not visible in snippets — UNVERIFIED.
- **Latest prior verifiable versions:** DeepSeek-V3.2-Exp (GitHub repo, Nov 2025), DeepSeek-V3 (Aug 2025 update), DeepSeek-Math-V2 (Dec 2025). V3.1, V3.2 (non-Exp) and R1 repos did not appear in the org's "DeepSeek-V" filter; R1 is a separate name and was not checked — UNVERIFIED here.

### API / tool calling

- **PARTIALLY VERIFIED (snippets):** OpenAI ChatCompletions-compatible and Anthropic Messages-compatible endpoints; Tool Calls; JSON Output. **Strict tool calling** (schema-enforced) — no evidence found either way — UNVERIFIED. Legacy aliases `deepseek-chat` / `deepseek-reasoner` are retired as of July 24, 2026 (per official change-log snippet).
- **VERIFIED (official GitHub):** `deepseek-harness` ("dsh") is "an open-source agent harness developed by DeepSeek AI" on an "everything-is-a-plugin architecture"; "developer preview"; plugins tagged `dsh-plugin`. No SKILL.md / agentskills mention in the README.

### Hosting app (chat.deepseek.com) — UNVERIFIED

Blocked. Third-party sources describe file upload (PDF, DOCX, PPTX, XLSX, TXT, code), DeepThink, web search, "Instant and Expert modes" added with V4, free with no subscription tier. No evidence of custom instructions or Projects in the first-party app; a third-party browser extension ("better-deepseek") adds "custom skills" and project scaffolding, which underlines the absence of a native feature.

### Skill-equivalent mechanism recommendation

DeepSeek has no first-party skills feature. Use the model through a skills-capable host: Claude Code (via the Anthropic-compatible endpoint), OpenClaw or Deep Code (both listed on agentskills.io and in DeepSeek's own awesome-agent list as Agent Skills-capable), or a custom harness/`deepseek-harness` plugin that injects SKILL.md content. For the API, rely on Tool Calls + JSON Output with system-prompt procedures.

### Unverified items

- Exact V4 GA date and license; V4-Flash parameters; strict tool calling; chat app custom instructions/projects; R1/V3.1 status; `deepseek-harness` model defaults.

---

## Cross-platform summary (as of 2026-09-09)

| Platform | Native reusable-skill format | SKILL.md (agentskills.io) support | Chat-app "project" container | Evidence tier |
|---|---|---|---|---|
| ChatGPT / Codex | Codex skills + plugins; Custom GPTs; Projects | Yes in Codex (`.agents/skills`, `$HOME/.agents/skills`); listed on agentskills.io | Projects, Custom GPTs | Codex: VERIFIED/PARTIAL; ChatGPT app: PARTIAL/UNVERIFIED |
| Claude | Agent Skills (SKILL.md) across claude.ai, API (`/v1/skills`), Claude Code, Agent SDK | Yes (originator); extra Claude Code fields | Projects | VERIFIED |
| Grok | None verified | No evidence | Workspaces / Custom Agents (reported) | API: VERIFIED via SDK; app: UNVERIFIED |
| GLM / Z.ai | Publishes SKILL.md skills for third-party hosts; Claude Code plugin marketplace | Partial (as a skill publisher, not a host) | 智能体 / knowledge base (reported) | Models & Claude Code integration: VERIFIED; apps: UNVERIFIED |
| DeepSeek | None; plugin-based `deepseek-harness` | No first-party evidence; third-party hosts (Deep Code, OpenClaw) | None found | V4 existence: PARTIAL + GitHub corroboration; app: UNVERIFIED |

---

## Source table

| Title | URL | Date (as visible) | Accessed | Notes |
|---|---|---|---|---|
| Agent Skills repo README | https://github.com/agentskills/agentskills | n/a | 2026-09-09 | VERIFIED; Apache-2.0/CC-BY-4.0; points to spec and anthropics/skills |
| Agent Skills specification (source) | https://raw.githubusercontent.com/agentskills/agentskills/main/docs/specification.mdx | n/a | 2026-09-09 | VERIFIED; frontmatter rules, directory layout |
| Agent Skills client showcase data | https://raw.githubusercontent.com/agentskills/agentskills/main/docs/snippets/clients.jsx | n/a | 2026-09-09 | VERIFIED; 50 entries stated, 45 extracted |
| agentskills.io (site) | https://agentskills.io | n/a | 2026-09-09 | BLOCKED by egress proxy |
| Claude models overview | https://platform.claude.com/docs/en/about-claude/models/overview | n/a | 2026-09-09 | VERIFIED; Fable 5.1 / Opus 5 / Sonnet 5 / Haiku 4.5 |
| Claude Agent Skills overview | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview | n/a | 2026-09-09 | VERIFIED; redirected from docs.claude.com |
| Claude Skills API guide | https://platform.claude.com/docs/en/build-with-claude/skills-guide | n/a | 2026-09-09 | VERIFIED; /v1/skills, 20 skills/request, 30 MB |
| Claude Skills quickstart | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart | n/a | 2026-09-09 | VERIFIED; code_execution_20260521 |
| Claude MCP connector | https://platform.claude.com/docs/en/agents-and-tools/mcp-connector | n/a | 2026-09-09 | VERIFIED; beta mcp-client-2025-11-20 |
| Claude Files API | https://platform.claude.com/docs/en/build-with-claude/files | n/a | 2026-09-09 | VERIFIED; 500 MB/file, 1 TB/org |
| Claude Code skills | https://code.claude.com/docs/en/skills | n/a | 2026-09-09 | VERIFIED; open-standard statement, frontmatter table |
| Claude Agent SDK skills | https://code.claude.com/docs/en/agent-sdk/skills | n/a | 2026-09-09 | VERIFIED; settingSources, skills option |
| Claude Code overview | https://code.claude.com/docs/en/overview | n/a | 2026-09-09 | VERIFIED; surfaces list |
| Claude "What are projects?" | https://support.claude.com/en/articles/9517075-what-are-projects | n/a | 2026-09-09 | PARTIAL; search snippet only (blocked) |
| Claude "Use skills in Claude" | https://support.claude.com/en/articles/12512180-use-skills-in-claude | n/a | 2026-09-09 | PARTIAL; blocked |
| openai/skills (Skills Catalog for Codex) | https://github.com/openai/skills | n/a | 2026-09-09 | VERIFIED; deprecated → openai/plugins; agentskills.io reference |
| openai/plugins | https://github.com/openai/plugins | n/a | 2026-09-09 | VERIFIED; .codex-plugin/plugin.json, skills/ |
| openai/codex README + docs/skills.md | https://github.com/openai/codex | n/a | 2026-09-09 | VERIFIED; plan note; skills doc redirects to developers.openai.com/codex/skills |
| openai/openai-python README | https://github.com/openai/openai-python | n/a | 2026-09-09 | VERIFIED; gpt-5.5, responses.create |
| Codex "Build skills" | https://developers.openai.com/codex/skills | n/a | 2026-09-09 | PARTIAL; snippets (.agents/skills, $HOME/.agents/skills); blocked |
| OpenAI API "Skills" guide | https://developers.openai.com/api/docs/guides/tools-skills | n/a | 2026-09-09 | PARTIAL; title only |
| ChatGPT Custom Instructions | https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions | n/a | 2026-09-09 | PARTIAL; blocked |
| Creating a GPT | https://help.openai.com/en/articles/8554397-creating-a-gpt | n/a | 2026-09-09 | PARTIAL; blocked |
| File Uploads FAQ | https://help.openai.com/en/articles/8555545-file-uploads-faq | n/a | 2026-09-09 | PARTIAL; 512 MB / 2M tokens / 20 files per GPT (snippets) |
| Using Codex with your ChatGPT plan | https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan | n/a | 2026-09-09 | PARTIAL; snippet |
| Introducing GPT-5.5 | https://openai.com/index/introducing-gpt-5-5/ | n/a | 2026-09-09 | PARTIAL; blocked |
| GPT-5.6 | https://openai.com/index/gpt-5-6/ | n/a | 2026-09-09 | PARTIAL; blocked |
| xai-org/xai-sdk-python README | https://github.com/xai-org/xai-sdk-python | n/a | 2026-09-09 | VERIFIED; grok-4.6, agentic tool calling, structured outputs |
| xai-sdk server_side_tools.py | https://raw.githubusercontent.com/xai-org/xai-sdk-python/main/examples/sync/server_side_tools.py | n/a | 2026-09-09 | VERIFIED; web_search/x_search/code_execution; grok-4.20 |
| Introducing Grok 4.6 | https://x.ai/news/grok-4-6 | reported 2026-08-12 (third-party) | 2026-09-09 | PARTIAL; blocked |
| Grok 4.1 Fast and Agent Tools API | https://x.ai/news/grok-4-1-fast | n/a | 2026-09-09 | PARTIAL; blocked |
| xAI Tools overview / Grok 4.6 docs | https://docs.x.ai/developers/tools/overview ; https://docs.x.ai/developers/grok-4-6 | n/a | 2026-09-09 | PARTIAL; blocked |
| zai-org/GLM-5 README | https://github.com/zai-org/GLM-5 | n/a | 2026-09-09 | VERIFIED; GLM-5.3 744B-A40B etc. |
| zai-org GLM-5 glm-master-skill SKILL.md | https://raw.githubusercontent.com/zai-org/GLM-5/main/skills/glm-master-skill/SKILL.md | n/a | 2026-09-09 | VERIFIED; spec-style frontmatter |
| zai-org/zai-coding-plugins | https://github.com/zai-org/zai-coding-plugins | n/a | 2026-09-09 | VERIFIED; Claude Code marketplace for GLM Coding Plan |
| Z.ai GLM-5 docs | https://docs.z.ai/guides/llm/glm-5 | n/a | 2026-09-09 | PARTIAL; blocked |
| Z.ai blog / chat.z.ai / open.bigmodel.cn / chatglm.cn | https://z.ai/blog ; https://chat.z.ai ; https://open.bigmodel.cn ; https://chatglm.cn | n/a | 2026-09-09 | BLOCKED |
| GLM-5.3 coverage (third-party) | https://www.marktechpost.com/2026/08/14/z-ai-ships-glm-5-3-without-retraining-the-base-model-better-at-complex-coding-and-long-horizon-tasks/ | 2026-08-14 | 2026-09-09 | UNVERIFIED |
| deepseek-ai GitHub org (repos filtered "DeepSeek-V") | https://github.com/orgs/deepseek-ai/repositories?q=DeepSeek-V | n/a | 2026-09-09 | VERIFIED; no V4 repo; V3.2-Exp Nov 2025 |
| deepseek-ai/awesome-deepseek-agent | https://github.com/deepseek-ai/awesome-deepseek-agent | n/a | 2026-09-09 | VERIFIED; names DeepSeek-V4-Pro / V4-Flash |
| deepseek-ai/deepseek-harness | https://github.com/deepseek-ai/deepseek-harness | n/a | 2026-09-09 | VERIFIED; plugin-based harness, developer preview |
| DeepSeek V4 Preview Release | https://api-docs.deepseek.com/news/news260424/ | 2026-04-24 (from URL/snippet) | 2026-09-09 | PARTIAL; blocked |
| DeepSeek-V4-Pro GA Release | https://api-docs.deepseek.com/news/news260813/ | 2026-08-13 (from URL/snippet) | 2026-09-09 | PARTIAL; blocked |
| DeepSeek API Change Log | https://api-docs.deepseek.com/updates/ | n/a | 2026-09-09 | PARTIAL; deepseek-chat/reasoner retired 2026-07-24 |
| deepseek-ai/DeepSeek-V4-Pro-0813 (HF) | https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813 | n/a | 2026-09-09 | PARTIAL; 1.6T/49B active, 1M context (snippet); blocked |
| chat.deepseek.com | https://chat.deepseek.com | n/a | 2026-09-09 | BLOCKED; app features UNVERIFIED |
| Simon Willison, "Agent Skills" | https://simonwillison.net/2025/Dec/19/agent-skills/ | 2025-12-19 | 2026-09-09 | Third-party context on the standard's launch |
