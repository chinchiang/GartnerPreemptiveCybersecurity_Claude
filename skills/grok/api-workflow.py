#!/usr/bin/env python3
"""
Grok（xAI）API 工作流程：先制型曝險分析（Preemptive Exposure Analysis）

用途
  以 skills/shared/core-prompt.md 作為 system prompt，讀入 examples/synthetic-org/ 的 9 個輸入檔，
  透過 xAI API（xai_sdk，預設）或 OpenAI 相容端點（--compat，待驗證）產出 Markdown 報告與符合
  output-schema.json 的 JSON。
  載入輸入、授權範圍守門、組提示詞、兩段式對話、解析與存檔都由 skills/shared/analysis_workflow.py
  （分析工作流程核心）負責；本檔只是 Grok 的模型 adapter（兩種呼叫方式各一種）。

兩段式呼叫
  第 1 段：產出人可讀的 Markdown 報告（正體中文）。
  第 2 段：延續同一對話，只輸出符合 output-schema.json 的 JSON 物件（以提示詞要求，存檔前做寬鬆解析）。

查證狀態（2026-10-15）
  - xai_sdk 的 Client / chat.create / chat.append / chat.sample 與 xai_sdk.chat 的 system / user / assistant
    依 github.com/xai-org/xai-sdk-python 的 README 與 src/xai_sdk/chat.py 撰寫（已查證），
    但 SDK 版本更新後可能變動，執行前請對照官方 README。
  - 模型 ID 預設 grok-4.6（SDK README 範例值）；請以 docs.x.ai 模型列表確認。
  - --compat：OpenAI 相容端點（https://api.x.ai/v1）的相容性「待驗證」，僅作為替代路徑。

環境變數（勿寫入程式碼、勿提交到 git）
  XAI_API_KEY          必要（--dry-run 時不需要）
  XAI_MODEL            預設 grok-4.6
  XAI_COMPAT_BASE_URL  預設 https://api.x.ai/v1（僅 --compat 使用；待驗證）

用法
  python3 skills/grok/api-workflow.py --dry-run            # 只跑流程、印出提示詞，不呼叫 API、不需 SDK
  python3 skills/grok/api-workflow.py                      # xai_sdk（pip install -r skills/grok/requirements.txt）
  python3 skills/grok/api-workflow.py --compat             # OpenAI 相容端點（同一份 requirements 已含 openai；待驗證）
  python3 skills/grok/api-workflow.py --input-dir <dir>    # 自己的資料夾
  python3 skills/grok/api-workflow.py --dry-run --exclude threat_intel   # 模擬缺漏（驗收第 6 項）
  python3 skills/grok/api-workflow.py --dry-run --exclude scope          # 模擬缺 scope（驗收第 7 項，應中止）

輸出與結束碼
  output/grok-report.md、output/grok-output.json（JSON 解析失敗時另存 output/grok-output.raw.txt）
  0 成功；1 輸入、授權範圍、環境或 API 錯誤；4 JSON 解析失敗

安全邊界
  預設不啟用任何伺服器端工具（web_search / x_search / code_execution），也不讀取 tool-definitions.json
  （function calling 需自建 harness 接上，見 docs/guides/grok.md）。
  本腳本只做「資料整理 → 呼叫語言模型 → 存檔」；不掃描、不探測、不變更任何系統。
  授權範圍（scope.json）缺少或不合格時，在呼叫 API 之前中止。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# 分析工作流程核心在 skills/shared/（ZIP 維持 repo 目錄結構，解壓後同樣找得到）
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))
import analysis_workflow  # noqa: E402

COMPAT_BASE_URL = "https://api.x.ai/v1"  # OpenAI 相容端點（待驗證）


class GrokAdapter:
    platform = "grok"
    display_name = "Grok"
    model_env = "XAI_MODEL"
    default_model = "grok-4.6"   # 依 xai-sdk-python README 範例；請以 docs.x.ai 確認
    platform_note = (
        "7. 平臺備註（Grok）\n"
        "- 你正透過 xAI API 被呼叫，沒有檔案系統，也沒有啟用任何工具（含 web_search、x_search）；所有輸入都已貼在使用者訊息中。\n"
        "- 若使用者要求 JSON，只輸出單一 JSON 物件，不要加 Markdown 圍欄或說明文字。\n"
        "- 你自身的知識（例如對 CVE 或廠商的認知）一律標示「模型知識，需查證」。"
    )

    def __init__(self):
        self._clients = {}   # 兩種呼叫方式各自建立、各自快取 client

    def add_arguments(self, parser):
        parser.add_argument("--compat", action="store_true", help="改用 OpenAI 相容端點（待驗證）")

    def describe(self, args):
        compat_url = os.environ.get("XAI_COMPAT_BASE_URL", COMPAT_BASE_URL)
        return ["xai_sdk" + ("" if args.compat else "（本次使用）") + "；未啟用伺服器端工具",
                f"OpenAI 相容端點（待驗證）：{compat_url}" + ("（本次使用）" if args.compat else "")]

    def generated_by(self, args):
        path = "OpenAI 相容端點" if args.compat else "xai_sdk"
        return f"xAI API（{path}）/ {args.model} / skills/grok/api-workflow.py"

    def supports_json_mode(self, args):
        return False   # 以提示詞要求純 JSON；SDK 的 Pydantic 解析不適用這份較複雜的 output-schema.json

    def send(self, messages, stage, args, json_mode):
        # 照搬原本的設定：兩條路徑都不指定 temperature、max_tokens（用 xAI 的預設值）
        if args.compat:
            reply = self._openai_client().chat.completions.create(model=args.model, messages=messages)
            return reply.choices[0].message.content or ""
        client, roles = self._xai_client_and_roles()
        # 注意：不傳入任何 tools=[...]，因此不會啟用 web_search / x_search / code_execution。
        chat = client.chat.create(model=args.model)
        for m in messages:
            chat.append(roles[m["role"]](m["content"]))
        return chat.sample().content

    def _xai_client_and_roles(self):
        """回傳 (Client, 角色 → 訊息建構函式)。xai_sdk 的對話物件要逐則 append 訊息，不吃 [{role, content}]。"""
        if "xai_sdk" not in self._clients:
            try:
                from xai_sdk import Client  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
                from xai_sdk.chat import assistant, system, user  # type: ignore
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 xai_sdk。請執行：pip install -r skills/grok/requirements.txt") from exc
            self._clients["xai_sdk"] = (Client(api_key=_api_key()), {"system": system, "user": user, "assistant": assistant})
        return self._clients["xai_sdk"]

    def _openai_client(self):
        """替代路徑：OpenAI 相容端點（相容性待驗證）。"""
        if "openai" not in self._clients:
            try:
                from openai import OpenAI  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 openai SDK。請執行：pip install -r skills/grok/requirements.txt") from exc
            self._clients["openai"] = OpenAI(api_key=_api_key(),
                                             base_url=os.environ.get("XAI_COMPAT_BASE_URL", COMPAT_BASE_URL))
        return self._clients["openai"]


def _api_key() -> str:
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise analysis_workflow.Abort("[錯誤] 未設定環境變數 XAI_API_KEY（請勿寫入程式碼或提交到 git）。")
    return api_key


if __name__ == "__main__":
    sys.exit(analysis_workflow.main(GrokAdapter()))
