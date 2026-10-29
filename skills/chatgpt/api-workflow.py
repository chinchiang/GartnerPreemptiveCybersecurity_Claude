#!/usr/bin/env python3
"""先制型曝險分析（PEA）— OpenAI Responses API 工作流程。

用途
  以 skills/shared/core-prompt.md 作為系統提示（instructions），讀入 examples/synthetic-org/
  （或 --input-dir 指定的資料夾）的 9 個輸入檔，透過官方 openai SDK 的 Responses API
  （client.responses.create）產出正體中文 Markdown 報告與符合 output-schema.json 的 JSON。
  載入輸入、授權範圍守門、組提示詞、兩段式對話、解析與存檔都由 skills/shared/analysis_workflow.py
  （分析工作流程核心）負責；本檔只是 ChatGPT 的模型 adapter。

兩段式呼叫
  第 1 段：產出人可讀的 Markdown 報告（正體中文）。
  第 2 段：延續同一對話（整串訊息放在 input），只輸出符合 output-schema.json 的 JSON 物件。

環境變數（勿寫入程式碼、勿提交到 git）
  OPENAI_API_KEY   必要（--dry-run 時不需要）
  OPENAI_MODEL     預設 gpt-6-astra（依 developers.openai.com/api/docs/models「不確定從哪個開始就用 GPT-6 Astra」，
                   2026-10-21 查證；在意成本可改 gpt-6.1-sol；實際可用的模型 ID 請在該頁面確認）
  OPENAI_BASE_URL  選用；由 openai SDK 自行讀取

用法
  python3 skills/chatgpt/api-workflow.py --dry-run            # 只跑流程、印出提示詞，不呼叫 API、不需 SDK
  python3 skills/chatgpt/api-workflow.py                      # 需 pip install -r skills/chatgpt/requirements.txt
  python3 skills/chatgpt/api-workflow.py --input-dir <dir>    # 自己的資料夾
  python3 skills/chatgpt/api-workflow.py --dry-run --exclude threat_intel   # 模擬缺漏（驗收第 6 項）
  python3 skills/chatgpt/api-workflow.py --dry-run --exclude scope          # 模擬缺 scope（驗收第 7 項，應中止）

輸出與結束碼
  output/chatgpt-report.md、output/chatgpt-output.json（JSON 解析、輸出 schema 驗證失敗或內容不一致時另存 output/chatgpt-output.raw.txt）
  0 成功；1 輸入、授權範圍、環境或 API 錯誤；4 JSON 解析、輸出 schema 驗證失敗或內容不一致
  輸出 schema 驗證失敗或內容不一致即中止；合成案例的業務驗收另交給 scripts/check-acceptance.mjs

安全邊界
  不啟用任何工具（無 web search、無 code interpreter、無 function calling）；所有輸入以文字送出。
  資料會離開本機，送到 OpenAI API；請先確認組織政策。
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


class ChatGptAdapter:
    platform = "chatgpt"
    display_name = "ChatGPT"
    model_env = "OPENAI_MODEL"
    default_model = "gpt-6-astra"   # 請在 developers.openai.com/api/docs/models 確認模型 ID
    platform_note = (
        "7. 平臺備註（ChatGPT）\n"
        "- 你正透過 OpenAI Responses API 被呼叫，沒有網路、檔案系統或任何工具；所有輸入都已貼在使用者訊息中，"
        "所有計算請在回覆中逐項列出代入值。\n"
        "- 若使用者要求 JSON，只輸出單一 JSON 物件，不要加 Markdown 圍欄或說明文字。\n"
        "- 你自身的知識（例如對 CVE 或廠商的認知）一律標示「模型知識，需查證」。"
    )

    def __init__(self):
        self._client = None

    def add_arguments(self, parser):
        pass

    def describe(self, args):
        return ["OpenAI Responses API（client.responses.create）；未啟用任何工具"]

    def generated_by(self, args):
        return f"ChatGPT API（Responses API）/ {args.model} / skills/chatgpt/api-workflow.py"

    def supports_json_mode(self, args):
        return False   # 照舊以提示詞要求純 JSON，存檔前做寬鬆解析

    def send(self, messages, stage, args, json_mode):
        # Responses API：system 放 instructions，其餘訊息依序放 input。
        # 照搬原本的設定：不傳 tools（不需要 web search / code interpreter / function calling），也不指定 temperature。
        response = self._openai_client().responses.create(model=args.model, instructions=messages[0]["content"],
                                                          input=messages[1:])
        text = _response_text(response)
        if not text:
            raise analysis_workflow.Abort("[錯誤] API 回覆沒有文字內容；請檢查模型 ID 與帳戶權限。")
        return text

    def _openai_client(self):
        if self._client is None:
            try:
                from openai import OpenAI  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 openai SDK。請執行：pip install -r skills/chatgpt/requirements.txt") from exc
            if not os.environ.get("OPENAI_API_KEY"):
                raise analysis_workflow.Abort("[錯誤] 未設定環境變數 OPENAI_API_KEY（請勿把金鑰寫進程式或檔案）。")
            self._client = OpenAI()   # 自動讀取 OPENAI_API_KEY；可選 OPENAI_BASE_URL
        return self._client


def _response_text(response) -> str:
    """優先用 output_text；沒有時保守處理（不同 SDK 版本的輸出結構若有差異），逐一收集 output 裡的文字片段。"""
    text = getattr(response, "output_text", None)
    if text:
        return text
    chunks = []
    for item in getattr(response, "output", []) or []:
        for part in getattr(item, "content", []) or []:
            if getattr(part, "type", "") in ("output_text", "text"):
                chunks.append(getattr(part, "text", ""))
    return "\n".join(chunks)


if __name__ == "__main__":
    sys.exit(analysis_workflow.main(ChatGptAdapter()))
