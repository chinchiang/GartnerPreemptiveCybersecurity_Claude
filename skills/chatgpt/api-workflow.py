#!/usr/bin/env python3
"""先制型曝險分析（PEA）— OpenAI Responses API 工作流程。

用途：
  1. 讀取 examples/synthetic-org/（或 --input-dir 指定的資料夾）內的 9 個輸入檔。
  2. 以 skills/shared/core-prompt.md 組成系統提示（instructions）。
  3. 透過官方 openai SDK 的 Responses API（client.responses.create）取得
     正體中文 Markdown 報告 + 符合 output-schema.json 的 JSON。
  4. 存到 output/chatgpt-report.md 與 output/chatgpt-output.json。

安全：
  - API 金鑰只從環境變數 OPENAI_API_KEY 讀取，絕不寫在程式或檔案內。
  - 沒有 scope.json 就中止（task-spec.md 第 2.1 節 I1）。
  - 不啟用任何工具（無 web search、無 code interpreter、無 function calling）；
    所有輸入以文字送出。資料會離開本機，送到 OpenAI API；請先確認組織政策。
  - --dry-run 只印出組好的提示，不呼叫 API，也不需要安裝 openai 套件。

依賴：Python 3.9+ 標準函式庫 + openai>=1.0（僅在非 dry-run 時載入）。
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from pathlib import Path

# 模型 ID：預設 gpt-5.5（依 github.com/openai/openai-python README 範例，2026-09-09 查證）。
# 實際可用的模型 ID 必須在 platform.openai.com 的 Models 頁面確認；以環境變數 OPENAI_MODEL 覆蓋。
DEFAULT_MODEL = "gpt-5.5"

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = REPO_ROOT / "examples" / "synthetic-org"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "output"
CORE_PROMPT = REPO_ROOT / "skills" / "shared" / "core-prompt.md"
OUTPUT_SCHEMA = REPO_ROOT / "skills" / "shared" / "output-schema.json"

# 9 個輸入檔：檔名 → (輸入類別, 是否必要)
INPUT_FILES = [
    ("scope.json", "scope", True),
    ("assets.csv", "assets", True),
    ("vulnerabilities.csv", "vulnerabilities", True),
    ("exposures.json", "exposures", False),
    ("identities.csv", "identities", False),
    ("misconfigurations.csv", "misconfigurations", False),
    ("controls.json", "controls", False),
    ("threat-intel.json", "threat_intel", False),
    ("topology.json", "topology", False),
]

SKILL_VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# 輸入載入
# ---------------------------------------------------------------------------

def extract_core_prompt(md_text: str) -> str:
    """從 core-prompt.md 取出 ```text 圍欄內的核心指令；取不到就用全文。"""
    m = re.search(r"```text\s*\n(.*?)\n```", md_text, re.S)
    return m.group(1).strip() if m else md_text.strip()


def count_records(name: str, text: str) -> int | None:
    """回報筆數（CSV：資料列；JSON：主要陣列長度），供資料品質檢查。"""
    try:
        if name.endswith(".csv"):
            rows = list(csv.DictReader(io.StringIO(text)))
            return len(rows)
        data = json.loads(text)
        if isinstance(data, list):
            return len(data)
        if isinstance(data, dict):
            for key in ("exposures", "controls", "actors", "edges"):
                if isinstance(data.get(key), list):
                    return len(data[key])
        return None
    except (json.JSONDecodeError, csv.Error):
        return None


def load_inputs(input_dir: Path) -> tuple[list[dict], list[str]]:
    """讀入 9 個檔案；回傳 (已載入清單, 缺少的必要檔清單)。"""
    loaded: list[dict] = []
    missing_required: list[str] = []
    for filename, category, required in INPUT_FILES:
        path = input_dir / filename
        if not path.exists():
            if required:
                missing_required.append(filename)
            loaded.append({"name": filename, "category": category, "present": False, "text": "", "records": None})
            continue
        text = path.read_text(encoding="utf-8-sig")
        loaded.append({
            "name": filename,
            "category": category,
            "present": True,
            "text": text,
            "records": count_records(filename, text),
        })
    return loaded, missing_required


def build_system_prompt() -> str:
    core = extract_core_prompt(CORE_PROMPT.read_text(encoding="utf-8"))
    schema = OUTPUT_SCHEMA.read_text(encoding="utf-8")
    return (
        f"{core}\n\n"
        "7. 本次執行環境（OpenAI Responses API，無任何工具）\n"
        "- 你沒有網路、沒有程式執行工具；所有計算請在回覆中逐項列出代入值。\n"
        "- 欄位對應：vulnerabilities 中的 epss_sim 視同 epss、kev_sim 視同 kev；linked_assets 以分號分隔。\n"
        f"- meta.generated_by 請填「ChatGPT API / <模型 ID> / preemptive-exposure-analysis {SKILL_VERSION}」。\n"
        "- 回覆結構：先是完整 Markdown 報告，最後恰好一個以 ```json 開頭、``` 結尾的區塊，內容為符合下列 schema 的 JSON。\n\n"
        "output-schema.json：\n"
        f"```json\n{schema}\n```"
    )


def build_user_prompt(loaded: list[dict], input_dir: Path) -> str:
    parts = [
        "請對以下輸入資料執行完整的先制型曝險分析（S1–S8）。",
        f"輸入資料夾：{input_dir}",
        "",
        "檔案清單與本機初步筆數（供你在 S2 交叉核對）：",
    ]
    for item in loaded:
        status = f"{item['records']} 筆" if item["records"] is not None else ("已提供" if item["present"] else "未提供")
        parts.append(f"- {item['name']}（{item['category']}）：{status}")
    parts.append("")
    for item in loaded:
        if not item["present"]:
            parts.append(f"===== {item['name']}（{item['category']}）：未提供，請依規則處理缺漏 =====\n")
            continue
        lang = "csv" if item["name"].endswith(".csv") else "json"
        parts.append(f"===== {item['name']}（{item['category']}）=====\n```{lang}\n{item['text'].rstrip()}\n```\n")
    parts.append("請先輸出 Markdown 報告，再輸出 JSON 區塊。")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 輸出處理
# ---------------------------------------------------------------------------

def split_report_and_json(text: str) -> tuple[str, dict | None, str | None]:
    """取最後一個 ```json 區塊解析為 JSON；回傳 (markdown, json_obj, 錯誤訊息)。"""
    blocks = re.findall(r"```json\s*\n(.*?)\n```", text, re.S)
    if not blocks:
        return text, None, "回覆中找不到 ```json 區塊"
    candidate = blocks[-1]
    try:
        return text, json.loads(candidate), None
    except json.JSONDecodeError as exc:
        return text, None, f"JSON 解析失敗：{exc}"


def basic_output_checks(obj: dict) -> list[str]:
    """對照 output-schema.json 的 required 與 task-spec 第 7 節做最小檢查。"""
    problems: list[str] = []
    try:
        required = json.loads(OUTPUT_SCHEMA.read_text(encoding="utf-8")).get("required", [])
    except json.JSONDecodeError:
        required = []
    for key in required:
        if key not in obj:
            problems.append(f"缺少頂層鍵：{key}")
    for path in obj.get("attack_path_hypotheses", {}).get("items", []) or []:
        if path.get("status") != "hypothesis":
            problems.append(f"攻擊路徑 {path.get('id')} 的 status 不是 hypothesis")
    summary = obj.get("executive_summary", {}).get("text", "") or ""
    if len(summary) > 300:
        problems.append(f"管理摘要 {len(summary)} 字，超過 300 字")
    return problems


# ---------------------------------------------------------------------------
# API 呼叫（僅非 dry-run 時載入 openai）
# ---------------------------------------------------------------------------

def call_openai(system_prompt: str, user_prompt: str, model: str) -> str:
    try:
        from openai import OpenAI  # 延遲載入，讓 --dry-run 不需安裝 SDK
    except ImportError:
        sys.exit("未安裝 openai 套件：pip install -r skills/chatgpt/requirements.txt")

    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("未設定環境變數 OPENAI_API_KEY（請勿把金鑰寫進程式或檔案）。")

    client = OpenAI()  # 自動讀取 OPENAI_API_KEY；可選 OPENAI_BASE_URL
    # Responses API：github.com/openai/openai-python README 建議優先於 Chat Completions。
    # 不傳 tools：本任務不需要 web search / code interpreter / function calling。
    response = client.responses.create(
        model=model,
        instructions=system_prompt,
        input=user_prompt,
    )
    text = getattr(response, "output_text", None)
    if not text:
        # 保守處理：不同 SDK 版本的輸出結構若有差異，逐一收集文字片段
        chunks = []
        for item in getattr(response, "output", []) or []:
            for part in getattr(item, "content", []) or []:
                if getattr(part, "type", "") in ("output_text", "text"):
                    chunks.append(getattr(part, "text", ""))
        text = "\n".join(chunks)
    if not text:
        sys.exit("API 回覆沒有文字內容；請檢查模型 ID 與帳戶權限。")
    return text


# ---------------------------------------------------------------------------
# 主程式
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="先制型曝險分析 — OpenAI Responses API 工作流程")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR, help="輸入資料夾（預設 examples/synthetic-org）")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="輸出資料夾（預設 output/）")
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", DEFAULT_MODEL), help="模型 ID（預設取環境變數 OPENAI_MODEL，否則 gpt-5.5）")
    parser.add_argument("--dry-run", action="store_true", help="只印出組好的提示，不呼叫 API")
    args = parser.parse_args()

    input_dir: Path = args.input_dir.resolve()
    if not input_dir.is_dir():
        sys.exit(f"輸入資料夾不存在：{input_dir}")

    # I1 守門：沒有 scope.json 就中止，不得分析。
    if not (input_dir / "scope.json").exists():
        sys.exit(
            "中止：找不到 scope.json（授權範圍與分析參數）。依 task-spec.md 第 2.1 節，無授權範圍不得分析。\n"
            "請提供含 organization、analysis_date、authorized_scope.in_scope_assets、"
            "authorized_scope.active_testing_authorized、authorized_scope.external_scanning_authorized、"
            "reporting.audience 的 scope.json。"
        )

    for required_file in (CORE_PROMPT, OUTPUT_SCHEMA):
        if not required_file.exists():
            sys.exit(f"缺少共用檔案：{required_file}")

    loaded, missing_required = load_inputs(input_dir)
    if missing_required:
        print(f"警告：缺少必要輸入 {missing_required}；模型將依規則只產出曝險面清單並詢問是否繼續。", file=sys.stderr)

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(loaded, input_dir)

    print("=== 輸入檔案筆數 ===")
    for item in loaded:
        print(f"  {item['name']:<24} {item['records'] if item['records'] is not None else ('已提供' if item['present'] else '未提供')}")
    print(f"=== 模型：{args.model}（請在 platform.openai.com 確認此 ID 可用）===")

    if args.dry_run:
        print("\n=== [DRY-RUN] 系統提示（instructions）===\n")
        print(system_prompt)
        print("\n=== [DRY-RUN] 使用者輸入（input）===\n")
        print(user_prompt)
        print(f"\n[DRY-RUN] 未呼叫 API。系統提示 {len(system_prompt)} 字元，使用者輸入 {len(user_prompt)} 字元。")
        return 0

    text = call_openai(system_prompt, user_prompt, args.model)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.output_dir / "chatgpt-report.md"
    json_path = args.output_dir / "chatgpt-output.json"

    markdown, obj, err = split_report_and_json(text)
    report_path.write_text(markdown, encoding="utf-8")
    print(f"已寫入 {report_path}")

    if obj is None:
        print(f"警告：{err}；JSON 未寫出，請檢查 {report_path}。", file=sys.stderr)
        return 2

    json_path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已寫入 {json_path}")

    problems = basic_output_checks(obj)
    if problems:
        print("輸出檢查發現問題：", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 3
    print("輸出檢查通過（頂層鍵齊全、路徑皆為 hypothesis、摘要 ≤ 300 字）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
