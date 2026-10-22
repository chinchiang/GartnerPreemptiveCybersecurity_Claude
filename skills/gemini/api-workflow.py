#!/usr/bin/env python3
"""
Gemini（Google）API 工作流程：先制型曝險分析（Preemptive Exposure Analysis）

用途
  以 skills/shared/core-prompt.md 作為 system instruction，讀入 examples/synthetic-org/ 的 9 個輸入檔，
  透過 google-genai SDK 的 Interactions API（預設）或 OpenAI 相容端點（--compat）產出 Markdown 報告與
  符合 output-schema.json 的 JSON。
  載入輸入、授權範圍守門、組提示詞、兩段式對話、解析與存檔都由 skills/shared/analysis_workflow.py
  （分析工作流程核心）負責；本檔只是 Gemini 的模型 adapter（兩種呼叫方式各一種）。

兩段式呼叫
  第 1 段：產出人可讀的 Markdown 報告（正體中文）。
  第 2 段：原生路徑以 previous_interaction_id 延續第 1 段，只送 JSON 的提示詞，response_format 只要求 JSON
          （不帶 schema）；--compat 送完整的對話，response_format={"type": "json_object"}。
          端點拒絕 JSON 模式時，改以提示詞要求純 JSON 重試一次；也可加 --no-json-mode 直接關閉。

查證狀態（2026-10-22，詳見 skills/gemini/README.md）
  - client.interactions.create 的 model／input／system_instruction／generation_config／previous_interaction_id
    與 response_format 依 ai.google.dev 的 text-generation、structured-output 文件撰寫（已查證）；
    「不帶 schema 的 JSON 模式」與「延續對話時是否保留 system_instruction」文件沒寫（待驗證，所以兩段都帶）。
  - 模型 ID 預設 gemini-3.8-flash（官方建議新專案使用）；旗艦推理模型是 gemini-4-argon。
    Gemini 4 與 3.6 以上的模型忽略自訂的 temperature，所以兩條路徑都不設。
  - --compat：OpenAI 相容端點官方標示 beta；json_object 是否支援，文件沒寫（待驗證）。

環境變數（勿寫入程式碼、勿提交到 git）
  GEMINI_API_KEY          必要（--dry-run 時不需要）。只認這一個並明確傳給 client，不讓 SDK 改讀 GOOGLE_API_KEY
  GEMINI_MODEL            預設 gemini-3.8-flash（替代：gemini-4-argon；請以官方模型頁確認）
  GEMINI_COMPAT_BASE_URL  預設 https://generativelanguage.googleapis.com/v1beta/openai/（僅 --compat 使用）

用法
  python3 skills/gemini/api-workflow.py --dry-run                 # 只跑流程、印出提示詞，不呼叫 API、不需 SDK
  python3 skills/gemini/api-workflow.py                           # google-genai（pip install -r skills/gemini/requirements.txt）
  python3 skills/gemini/api-workflow.py --compat                  # OpenAI 相容端點（同一份 requirements 已含 openai）
  python3 skills/gemini/api-workflow.py --input-dir /path/to/dir  # 以自己的資料夾取代合成資料
  python3 skills/gemini/api-workflow.py --dry-run --exclude threat_intel   # 模擬缺漏（驗收第 6 項）
  python3 skills/gemini/api-workflow.py --dry-run --exclude scope          # 模擬缺 scope（驗收第 7 項，應中止）

輸出與結束碼
  output/gemini-report.md、output/gemini-output.json（JSON 解析失敗時另存 output/gemini-output.raw.txt）
  0 成功；1 輸入、授權範圍、環境或 API 錯誤；4 JSON 解析失敗

安全邊界
  不啟用任何工具。原生路徑的對話狀態存在 Google 的伺服器上（previous_interaction_id），送出前請依資料分類政策評估。
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

JSON_MIME = {"type": "text", "mime_type": "application/json"}   # 只要求 JSON，不帶 schema
COMPAT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"   # OpenAI 相容端點（官方標示 beta）


class GeminiAdapter:
    platform = "gemini"
    display_name = "Gemini"
    model_env = "GEMINI_MODEL"
    default_model = "gemini-3.8-flash"
    platform_note = (
        "7. 平臺備註（Gemini）\n"
        "- 你正透過 Gemini API 被呼叫，沒有檔案系統，也沒有啟用任何工具；所有輸入都已貼在使用者訊息中。\n"
        "- 若使用者要求 JSON，只輸出單一 JSON 物件，不要加 Markdown 圍欄或說明文字。\n"
        "- 你自身的知識（例如對 CVE 或廠商的認知）一律標示「模型知識，需查證」。"
    )

    def __init__(self):
        self._clients = {}         # 兩種呼叫方式各自建立、各自快取 client
        self._previous_id = None   # 第 1 段回傳的 interaction id，第 2 段用它延續對話

    def add_arguments(self, parser):
        parser.add_argument("--compat", action="store_true", help="改用 OpenAI 相容端點（官方標示 beta）")
        parser.add_argument("--max-tokens", type=int, default=16000, help="每段回應的最大輸出 token")
        parser.add_argument("--no-json-mode", action="store_true",
                            help="第 2 段不使用 JSON 模式（response_format），改以提示詞要求純 JSON")

    def describe(self, args):
        compat_url = os.environ.get("GEMINI_COMPAT_BASE_URL", COMPAT_BASE_URL)
        return ["google-genai（Interactions API）" + ("" if args.compat else "（本次使用）"),
                f"OpenAI 相容端點（beta）：{compat_url}" + ("（本次使用）" if args.compat else "")]

    def generated_by(self, args):
        path = "OpenAI 相容端點" if args.compat else "google-genai"
        return f"Gemini API（{path}）/ {args.model} / skills/gemini/api-workflow.py"

    def supports_json_mode(self, args):
        return not args.no_json_mode

    def send(self, messages, stage, args, json_mode):
        if args.compat:
            # 替代路徑：Chat Completions 沒有伺服器端的對話狀態，送完整的 messages；不設 temperature（與原生路徑一致）
            kwargs = dict(model=args.model, messages=messages, max_tokens=args.max_tokens)
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}   # 相容端點是否支援 json_object，官方文件沒寫（待驗證）
            reply = _create_with_json_fallback(self._openai_client().chat.completions.create, kwargs, json_mode)
            return reply.choices[0].message.content or ""
        # 第 1 段送報告的提示詞；第 2 段只送最後一則 user 訊息，以 previous_interaction_id 延續第 1 段。
        # system_instruction 兩段都帶：延續對話時會不會保留它，官方文件沒寫（待驗證）
        kwargs = dict(model=args.model, system_instruction=messages[0]["content"], input=messages[-1]["content"],
                      generation_config={"max_output_tokens": args.max_tokens})
        if stage != "report":
            kwargs["previous_interaction_id"] = self._previous_id
        if json_mode:
            kwargs["response_format"] = JSON_MIME
        interaction = _create_with_json_fallback(self._genai_client().interactions.create, kwargs, json_mode)
        if stage == "report":
            self._previous_id = interaction.id
        return interaction.output_text or ""

    def _genai_client(self):
        if "genai" not in self._clients:
            try:
                from google import genai  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 google-genai SDK。請執行：pip install -r skills/gemini/requirements.txt") from exc
            self._clients["genai"] = genai.Client(api_key=_api_key())
        return self._clients["genai"]

    def _openai_client(self):
        if "openai" not in self._clients:
            try:
                from openai import OpenAI  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 openai SDK。請執行：pip install -r skills/gemini/requirements.txt") from exc
            self._clients["openai"] = OpenAI(api_key=_api_key(),
                                             base_url=os.environ.get("GEMINI_COMPAT_BASE_URL", COMPAT_BASE_URL))
        return self._clients["openai"]


def _api_key() -> str:
    """只認 GEMINI_API_KEY，並明確傳給 client：google-genai 沒拿到金鑰時會自己讀 GOOGLE_API_KEY（兩者都有時還以它優先），
    腳本不讓別的環境變數默默換掉使用者設定的金鑰。"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise analysis_workflow.Abort("[錯誤] 未設定環境變數 GEMINI_API_KEY（請勿寫入程式碼或提交到 git）。")
    return api_key


def _create_with_json_fallback(create, kwargs, json_mode):
    """呼叫 create(**kwargs)；端點拒絕 response_format 時（不帶 schema 的 JSON 模式是否支援，官方文件沒寫，待驗證）
    印出警告，拿掉 response_format、改以提示詞要求純 JSON 重試一次。"""
    try:
        return create(**kwargs)
    except Exception as exc:  # noqa: BLE001
        if not json_mode:
            raise
        print(f"[警告] JSON 模式被端點拒絕（{type(exc).__name__}: {exc}）；改以提示詞要求純 JSON 重試一次。", file=sys.stderr)
        kwargs.pop("response_format")
        return create(**kwargs)


if __name__ == "__main__":
    sys.exit(analysis_workflow.main(GeminiAdapter()))
