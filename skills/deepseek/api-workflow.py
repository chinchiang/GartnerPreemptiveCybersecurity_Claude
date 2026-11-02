#!/usr/bin/env python3
"""
DeepSeek API 工作流程：先制型曝險分析（Preemptive Exposure Analysis）

用途
  以 skills/shared/core-prompt.md 作為 system prompt，讀入 examples/synthetic-org/ 的 9 個輸入檔，
  透過 DeepSeek 的 OpenAI 相容 Chat Completions 端點產出 Markdown 報告與符合 output-schema.json 的 JSON。
  載入輸入、授權範圍守門、組提示詞、兩段式對話、解析與存檔都由 skills/shared/analysis_workflow.py
  （分析工作流程核心）負責；本檔只是 DeepSeek 的模型 adapter。

版本無關設計
  本腳本只依賴「OpenAI 相容 chat completions + system prompt + JSON Output」三件事，
  不依賴特定模型版本。模型 ID 以環境變數 DEEPSEEK_MODEL 指定（預設 deepseek-v4-pro），
  請以 https://api-docs.deepseek.com 的最新模型列表為準。
  ※ 依官方 change log 摘要，舊名稱 deepseek-chat / deepseek-reasoner 已於 2026-07-24 退役（PARTIALLY VERIFIED）。

兩段式呼叫
  第 1 段：產出人可讀的 Markdown 報告（正體中文）。
  第 2 段：延續同一對話，以 response_format={"type": "json_object"} 只輸出符合 output-schema.json 的 JSON。
          ※ JSON Output 支援依官方 V4-Pro GA 公告摘要（PARTIALLY VERIFIED）；端點拒絕時自動改以提示詞要求
            純 JSON 重試一次，也可加 --no-json-mode 直接關閉。

環境變數（勿寫入程式碼、勿提交到 git）
  DEEPSEEK_API_KEY   必要（--dry-run 時不需要）
  DEEPSEEK_BASE_URL  預設 https://api.deepseek.com
  DEEPSEEK_MODEL     預設 deepseek-v4-pro（替代：deepseek-v4-flash；請以官方文件確認）

用法
  python3 skills/deepseek/api-workflow.py --dry-run                 # 只跑流程、印出提示詞，不呼叫 API、不需 SDK
  python3 skills/deepseek/api-workflow.py                           # 需 pip install openai
  python3 skills/deepseek/api-workflow.py --input-dir /path/to/dir  # 以自己的資料夾取代合成資料
  python3 skills/deepseek/api-workflow.py --dry-run --exclude threat_intel   # 模擬缺漏（驗收第 6 項）
  python3 skills/deepseek/api-workflow.py --dry-run --exclude scope          # 模擬缺 scope（驗收第 7 項，應中止）

輸出與結束碼
  output/deepseek-report.md、output/deepseek-output.json（JSON 解析、輸出 schema 驗證失敗或內容不一致時另存 output/deepseek-output.raw.txt）
  0 成功；1 輸入、授權範圍、環境或 API 錯誤（含回覆不完整，例如因輸出上限被截斷；這時不存任何輸出檔）；4 JSON 解析、輸出 schema 驗證失敗或內容不一致

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

DEFAULT_BASE_URL = "https://api.deepseek.com"


class DeepSeekAdapter:
    platform = "deepseek"
    display_name = "DeepSeek"
    model_env = "DEEPSEEK_MODEL"
    default_model = "deepseek-v4-pro"   # 請以 api-docs.deepseek.com 確認；模型 ID 隨版本變動，腳本本身與版本無關
    platform_note = (
        "7. 平臺備註（DeepSeek）\n"
        "- 你正透過 DeepSeek API 被呼叫，沒有檔案系統或工具；所有輸入都已貼在使用者訊息中。\n"
        "- 若使用者要求 JSON，只輸出單一 JSON 物件，不要加 Markdown 圍欄或說明文字。\n"
        "- 你自身的知識（例如對 CVE 或廠商的認知）一律標示「模型知識，需查證」。"
    )

    def __init__(self):
        self._client = None

    def add_arguments(self, parser):
        parser.add_argument("--max-tokens", type=int, default=16000, help="每段回應的最大輸出 token")
        parser.add_argument("--no-json-mode", action="store_true",
                            help="第 2 段不使用 response_format json_object，改以提示詞要求純 JSON")

    def describe(self, args):
        mode = "關閉（提示詞要求純 JSON）" if args.no_json_mode else "response_format json_object（PARTIALLY VERIFIED）"
        return [f"端點：{os.environ.get('DEEPSEEK_BASE_URL', DEFAULT_BASE_URL)}", f"JSON 模式：{mode}"]

    def generated_by(self, args):
        return f"DeepSeek API / {args.model} / skills/deepseek/api-workflow.py"

    def supports_json_mode(self, args):
        return not args.no_json_mode

    def _connect(self):
        if self._client is None:
            try:
                from openai import OpenAI  # type: ignore  # 延遲載入：--dry-run 不需要 SDK
            except ImportError as exc:
                raise analysis_workflow.Abort("[錯誤] 未安裝 openai SDK。請執行：pip install -r skills/deepseek/requirements.txt") from exc
            api_key = os.environ.get("DEEPSEEK_API_KEY")
            if not api_key:
                raise analysis_workflow.Abort("[錯誤] 未設定環境變數 DEEPSEEK_API_KEY（請勿寫入程式碼或提交到 git）。")
            self._client = OpenAI(api_key=api_key, base_url=os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL))
        return self._client

    def send(self, messages, stage, args, json_mode):
        client = self._connect()
        kwargs = dict(model=args.model, messages=messages, max_tokens=args.max_tokens,
                      temperature=0.2 if stage == "report" else 0.0)
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            reply = client.chat.completions.create(**kwargs)
        except Exception as exc:  # noqa: BLE001 — 端點拒絕 response_format 時退回純提示詞模式，重試一次
            if not json_mode:
                raise
            print(f"[警告] JSON Output 模式被端點拒絕（{type(exc).__name__}: {exc}）；改以提示詞要求純 JSON 重試一次。",
                  file=sys.stderr)
            kwargs.pop("response_format")
            reply = client.chat.completions.create(**kwargs)
        analysis_workflow.require_complete("chat_completions", getattr(reply.choices[0], "finish_reason", None), stage, args)
        return reply.choices[0].message.content or ""


if __name__ == "__main__":
    sys.exit(analysis_workflow.main(DeepSeekAdapter()))
