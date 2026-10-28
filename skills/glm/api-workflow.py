#!/usr/bin/env python3
"""
GLM（Zhipu AI / Z.ai）API 工作流程：先制型曝險分析（Preemptive Exposure Analysis）

用途
  以 skills/shared/core-prompt.md 作為 system prompt，讀入 examples/synthetic-org/ 的 9 個輸入檔，
  透過 GLM 的 OpenAI 相容端點（預設）或 Anthropic 相容端點（--anthropic-compatible，待驗證）
  產出 Markdown 報告與符合 output-schema.json 的 JSON。
  載入輸入、授權範圍守門、組提示詞、兩段式對話、解析與存檔都由 skills/shared/analysis_workflow.py
  （分析工作流程核心）負責；本檔只是 GLM 的模型 adapter（兩種端點各一種呼叫方式）。

兩段式呼叫
  第 1 段：產出人可讀的 Markdown 報告（正體中文）。
  第 2 段：延續同一對話，只輸出符合 output-schema.json 的 JSON 物件。
          ※ GLM 是否支援 response_format={"type":"json_object"} 官方文件未能查證（待驗證），
            因此以提示詞要求純 JSON，並在存檔前做寬鬆解析。

環境變數（勿寫入程式碼、勿提交到 git）
  GLM_API_KEY        必要（--dry-run 時不需要）
  GLM_BASE_URL       預設 https://api.z.ai/api/paas/v4（國際版 Z.ai API Platform）
                     中國大陸 BigModel 可改為 https://open.bigmodel.cn/api/paas/v4
                     ※ 正確的 base URL 請以 docs.z.ai 或 open.bigmodel.cn 官方文件為準（本檔撰寫時官方站台無法直接查證）。
  GLM_MODEL          預設 glm-5.3（※ 模型 ID 請以官方模型列表確認；zai-org/GLM-5 README 記載 GLM-5.3 / GLM-5.3-Flash）
  GLM_ANTHROPIC_BASE_URL  預設 https://api.z.ai/api/anthropic（僅 --anthropic-compatible 使用；PARTIALLY VERIFIED）

用法
  python3 skills/glm/api-workflow.py --dry-run                 # 只跑流程、印出提示詞，不呼叫 API、不需 SDK
  python3 skills/glm/api-workflow.py                           # OpenAI 相容端點（需 pip install openai）
  python3 skills/glm/api-workflow.py --anthropic-compatible    # Anthropic 相容端點（需 pip install anthropic；待驗證）
  python3 skills/glm/api-workflow.py --input-dir /path/to/dir  # 以自己的資料夾取代合成資料
  python3 skills/glm/api-workflow.py --dry-run --exclude threat_intel   # 模擬缺漏（驗收第 6 項）
  python3 skills/glm/api-workflow.py --dry-run --exclude scope          # 模擬缺 scope（驗收第 7 項，應中止）

輸出與結束碼
  output/glm-report.md、output/glm-output.json（JSON 解析或輸出 schema 驗證失敗時另存 output/glm-output.raw.txt）
  0 成功；1 輸入、授權範圍、環境或 API 錯誤；4 JSON 解析或輸出 schema 驗證失敗

安全邊界
  本腳本只做「資料整理 → 呼叫語言模型 → 存檔」。不掃描、不探測、不變更任何系統。
  授權範圍（scope.json）缺少或不合格時，在呼叫 API 之前中止。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# 分析工作流程核心在 skills/shared/（ZIP 維持 repo 目錄結構，解壓後同樣找得到）
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))
import analysis_workflow  # noqa: E402

DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4"           # 請以 docs.z.ai 官方文件確認
ALT_BASE_URL_CN = "https://open.bigmodel.cn/api/paas/v4"    # BigModel（中國大陸）替代端點，請以官方文件確認
DEFAULT_ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic"  # PARTIALLY VERIFIED（第三方引述 docs.z.ai）


class GlmAdapter:
    platform = "glm"
    display_name = "GLM"
    model_env = "GLM_MODEL"
    default_model = "glm-5.3"   # 請以官方模型列表確認模型 ID
    platform_note = (
        "7. 平臺備註（GLM）\n"
        "- 你正透過 Z.ai / BigModel API 被呼叫，沒有檔案系統或工具；所有輸入都已貼在使用者訊息中。\n"
        "- 若使用者要求 JSON，只輸出單一 JSON 物件，不要加 Markdown 圍欄或說明文字。\n"
        "- 你自身的知識（例如對 CVE 或廠商的認知）一律標示「模型知識，需查證」。"
    )

    def __init__(self):
        self._clients = {}   # 兩種端點各自建立、各自快取 client

    def add_arguments(self, parser):
        parser.add_argument("--max-tokens", type=int, default=16000, help="每段回應的最大輸出 token")
        parser.add_argument("--anthropic-compatible", action="store_true",
                            help="改用 Anthropic 相容端點（https://api.z.ai/api/anthropic；待驗證）")

    def describe(self, args):
        return [f"OpenAI 相容端點：{os.environ.get('GLM_BASE_URL', DEFAULT_BASE_URL)}"
                + ("" if args.anthropic_compatible else "（本次使用）")
                + f"；中國大陸 BigModel 可設 GLM_BASE_URL={ALT_BASE_URL_CN}",
                f"Anthropic 相容端點（待驗證）：{os.environ.get('GLM_ANTHROPIC_BASE_URL', DEFAULT_ANTHROPIC_BASE_URL)}"
                + ("（本次使用）" if args.anthropic_compatible else "")]

    def generated_by(self, args):
        endpoint = "Anthropic 相容端點" if args.anthropic_compatible else "OpenAI 相容端點"
        return f"GLM API（{endpoint}）/ {args.model} / skills/glm/api-workflow.py"

    def supports_json_mode(self, args):
        return False   # GLM 的 JSON 模式未經查證，一律以提示詞要求純 JSON

    def send(self, messages, stage, args, json_mode):
        temperature = 0.2 if stage == "report" else 0.0
        if args.anthropic_compatible:
            # Anthropic Messages API 的 system 是獨立參數，不放在 messages 裡
            system, conversation = messages[0]["content"], messages[1:]
            reply = self._anthropic_client().messages.create(model=args.model, system=system, max_tokens=args.max_tokens,
                                                             temperature=temperature, messages=conversation)
            return "".join(getattr(block, "text", "") for block in reply.content)
        reply = self._openai_client().chat.completions.create(model=args.model, messages=messages,
                                                              temperature=temperature, max_tokens=args.max_tokens)
        return reply.choices[0].message.content or ""

    def _openai_client(self):
        if "openai" not in self._clients:
            try:
                from openai import OpenAI  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 openai SDK。請執行：pip install -r skills/glm/requirements.txt") from exc
            self._clients["openai"] = OpenAI(api_key=_api_key(), base_url=os.environ.get("GLM_BASE_URL", DEFAULT_BASE_URL))
        return self._clients["openai"]

    def _anthropic_client(self):
        """Anthropic 相容端點（GLM Coding Plan 所用）。狀態：PARTIALLY VERIFIED／待驗證。
        注意：第三方引述的 Z.ai 條款指出 Coding Plan 額度僅限在 Z.ai 認可的 coding 工具內使用；
        以此端點跑本腳本是否符合方案條款，請自行向 Z.ai 官方確認。"""
        if "anthropic" not in self._clients:
            try:
                import anthropic  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 anthropic SDK。請執行：pip install -r skills/glm/requirements.txt") from exc
            self._clients["anthropic"] = anthropic.Anthropic(
                api_key=_api_key(), base_url=os.environ.get("GLM_ANTHROPIC_BASE_URL", DEFAULT_ANTHROPIC_BASE_URL))
        return self._clients["anthropic"]


def _api_key() -> str:
    api_key = os.environ.get("GLM_API_KEY")
    if not api_key:
        raise analysis_workflow.Abort("[錯誤] 未設定環境變數 GLM_API_KEY（請勿寫入程式碼或提交到 git）。")
    return api_key


if __name__ == "__main__":
    sys.exit(analysis_workflow.main(GlmAdapter()))
