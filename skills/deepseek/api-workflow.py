#!/usr/bin/env python3
"""
DeepSeek API 工作流程：先制型曝險分析（Preemptive Exposure Analysis）

用途
  以 skills/shared/core-prompt.md 作為 system prompt，讀入 examples/synthetic-org/ 的 9 個輸入檔，
  透過 DeepSeek 的 OpenAI 相容 Chat Completions 端點產出 Markdown 報告與符合 output-schema.json 的 JSON。

版本無關設計
  本腳本只依賴「OpenAI 相容 chat completions + system prompt + JSON Output」三件事，
  不依賴特定模型版本。模型 ID 以環境變數 DEEPSEEK_MODEL 指定（預設 deepseek-v4-pro），
  請以 https://api-docs.deepseek.com 的最新模型列表為準。
  ※ 依官方 change log 摘要，舊名稱 deepseek-chat / deepseek-reasoner 已於 2026-07-24 退役（PARTIALLY VERIFIED）。

兩段式呼叫
  第 1 段：產出人可讀的 Markdown 報告（正體中文）。
  第 2 段：延續同一對話，以 response_format={"type": "json_object"} 只輸出符合 output-schema.json 的 JSON。
          ※ JSON Output 支援依官方 V4-Pro GA 公告摘要（PARTIALLY VERIFIED）；若端點回報不支援，
            可加 --no-json-mode 改以提示詞要求純 JSON。

環境變數（勿寫入程式碼、勿提交到 git）
  DEEPSEEK_API_KEY   必要（--dry-run 時不需要）
  DEEPSEEK_BASE_URL  預設 https://api.deepseek.com
  DEEPSEEK_MODEL     預設 deepseek-v4-pro（替代：deepseek-v4-flash；請以官方文件確認）

用法
  python3 skills/deepseek/api-workflow.py --dry-run                 # 只組裝提示詞，不呼叫 API、不需 SDK
  python3 skills/deepseek/api-workflow.py                           # 需 pip install openai
  python3 skills/deepseek/api-workflow.py --input-dir /path/to/dir  # 以自己的資料夾取代合成資料

輸出
  output/deepseek-report.md、output/deepseek-output.json（JSON 解析失敗時另存 output/deepseek-output.raw.txt）

安全邊界
  本腳本只做「資料整理 → 呼叫語言模型 → 存檔」。不掃描、不探測、不變更任何系統。
  缺少 scope.json 時直接中止（無授權範圍不得分析）。
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

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_DIR = REPO_ROOT / "skills" / "shared"
DEFAULT_INPUT_DIR = REPO_ROOT / "examples" / "synthetic-org"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "output"

PLATFORM = "deepseek"
DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-pro"   # 請以 api-docs.deepseek.com 確認；模型 ID 隨版本變動，腳本本身與版本無關

# 9 個輸入檔：(檔名, 輸入類別, 是否必要)
INPUT_FILES = [
    ("scope.json", "I1 授權範圍與分析參數", True),
    ("assets.csv", "I2 資產清冊 + 業務重要性", True),
    ("vulnerabilities.csv", "I3 弱點與發現", True),
    ("exposures.json", "I4 外部曝險（EASM）", False),
    ("identities.csv", "I6 身分與權限", False),
    ("misconfigurations.csv", "I7 設定基準偏差", False),
    ("controls.json", "I8 既有控制措施", False),
    ("threat-intel.json", "I9 威脅情資", False),
    ("topology.json", "I10 網路拓樸／信任關係", False),
]

DISCLAIMER = "本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。"


# ---------------------------------------------------------------------------
# 提示詞組裝
# ---------------------------------------------------------------------------

def load_core_prompt() -> str:
    """從 skills/shared/core-prompt.md 取出 ```text ... ``` 區塊作為 system prompt。"""
    path = SHARED_DIR / "core-prompt.md"
    if not path.exists():
        sys.exit(f"[錯誤] 找不到共用核心提示詞：{path}")
    text = path.read_text(encoding="utf-8")
    m = re.search(r"```text\n(.*?)\n```", text, re.S)
    core = m.group(1).strip() if m else text.strip()
    platform_note = (
        "\n\n7. 平台備註（DeepSeek）\n"
        "- 你正透過 DeepSeek API 被呼叫，沒有檔案系統或工具；所有輸入都已貼在使用者訊息中。\n"
        "- 若使用者要求 JSON，只輸出單一 JSON 物件，不要加 Markdown 圍欄或說明文字。\n"
        "- 你自身的知識（例如對 CVE 或廠商的認知）一律標示「模型知識，需查證」。"
    )
    return core + platform_note


def load_output_schema() -> str:
    path = SHARED_DIR / "output-schema.json"
    if not path.exists():
        sys.exit(f"[錯誤] 找不到輸出 schema：{path}")
    return path.read_text(encoding="utf-8")


def count_records(name: str, raw: str) -> int | None:
    """回報筆數（供資料品質檢查與驗收第 1 項使用）。無法判定時回傳 None。"""
    try:
        if name.endswith(".csv"):
            return len(list(csv.DictReader(io.StringIO(raw))))
        data = json.loads(raw)
        if isinstance(data, list):
            return len(data)
        if isinstance(data, dict):
            for key in ("exposures", "controls", "actors", "edges"):
                if isinstance(data.get(key), list):
                    return len(data[key])
    except (json.JSONDecodeError, csv.Error):
        return None
    return None


def load_inputs(input_dir: Path) -> tuple[list[dict], list[str]]:
    """讀入 9 個輸入檔。回傳 (已載入檔案列表, 缺少檔案列表)。缺 scope.json 直接中止。"""
    scope_path = input_dir / "scope.json"
    if not scope_path.exists():
        sys.exit(
            "[中止] 找不到 scope.json（授權範圍與分析參數）。\n"
            "依共用任務規格第 2.1 節，無授權範圍不得分析。請提供含下列欄位的 scope.json：\n"
            "  organization, analysis_date, authorized_scope.in_scope_assets,\n"
            "  authorized_scope.active_testing_authorized, authorized_scope.external_scanning_authorized,\n"
            "  reporting.audience"
        )
    try:
        scope = json.loads(scope_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"[中止] scope.json 不是合法 JSON：{exc}")
    required = [
        ("organization",), ("analysis_date",),
        ("authorized_scope", "in_scope_assets"),
        ("authorized_scope", "active_testing_authorized"),
        ("authorized_scope", "external_scanning_authorized"),
        ("reporting", "audience"),
    ]
    missing_fields = []
    for keys in required:
        node = scope
        for k in keys:
            node = node.get(k) if isinstance(node, dict) else None
        if node is None:
            missing_fields.append(".".join(keys))
    if missing_fields:
        sys.exit("[中止] scope.json 缺少必填欄位：" + ", ".join(missing_fields))

    loaded, missing = [], []
    for name, label, required_file in INPUT_FILES:
        path = input_dir / name
        if not path.exists():
            missing.append(f"{name}（{label}）")
            if required_file and name != "scope.json":
                print(f"[警告] 缺少必要輸入 {name}；模型只能產出曝險面清單並下修信心。", file=sys.stderr)
            continue
        raw = path.read_text(encoding="utf-8")
        loaded.append({"name": name, "label": label, "raw": raw, "records": count_records(name, raw)})
    return loaded, missing


def build_user_prompt(loaded: list[dict], missing: list[str]) -> str:
    parts = [
        "以下是授權範圍內的輸入資料，請依系統提示中的八步流程（S1–S8）產出完整的正體中文 Markdown 報告"
        "（章節：資料品質、曝險優先序、攻擊路徑假設、改善建議、安全驗證計畫、人工審查點、管理摘要、追蹤指標）。"
        "先回報每個檔案的筆數、缺欄位與異常值；缺漏不得補造。這一段先不要輸出 JSON。",
        "",
    ]
    if missing:
        parts.append("【本次未提供的輸入】" + "；".join(missing) + "。請依規則以替代方式處理並標示。")
        parts.append("")
    for f in loaded:
        rec = f"（腳本預先計算筆數：{f['records']}）" if f["records"] is not None else ""
        fence = "csv" if f["name"].endswith(".csv") else "json"
        parts.append(f"### {f['name']} — {f['label']}{rec}")
        parts.append(f"```{fence}\n{f['raw'].strip()}\n```")
        parts.append("")
    parts.append(f"報告結尾請固定加上聲明：「{DISCLAIMER}」")
    return "\n".join(parts)


def build_json_prompt(schema_text: str) -> str:
    # 註：DeepSeek JSON Output 模式要求提示詞中明確出現「json」字樣並給出格式範例（依官方文件慣例；待以最新文件確認）。
    return (
        "請把上一則報告的內容轉為**單一 JSON 物件**（json），嚴格符合下列 JSON Schema（output-schema.json）。"
        "只輸出 JSON，不要 Markdown 圍欄、不要任何說明文字。"
        "meta.generated_by 請填「DeepSeek via " + PLATFORM + " api-workflow.py」；"
        "meta.scoring_rules 說明實際使用的評分規則；meta.disclaimer 填入固定聲明。\n\n"
        "```json\n" + schema_text + "\n```"
    )


# ---------------------------------------------------------------------------
# 模型呼叫（延遲載入 SDK，--dry-run 不需要安裝）
# ---------------------------------------------------------------------------

def call_deepseek(system_prompt: str, user_prompt: str, json_prompt: str,
                  model: str, max_tokens: int, json_mode: bool) -> tuple[str, str]:
    try:
        from openai import OpenAI  # type: ignore
    except ImportError:
        sys.exit("[錯誤] 未安裝 openai SDK。請執行：pip install -r skills/deepseek/requirements.txt")

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        sys.exit("[錯誤] 未設定環境變數 DEEPSEEK_API_KEY（請勿寫入程式碼或提交到 git）。")
    base_url = os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL)
    client = OpenAI(api_key=api_key, base_url=base_url)
    print(f"[資訊] DeepSeek 端點：{base_url}，模型：{model}", file=sys.stderr)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    # 第 1 段：Markdown 報告
    r1 = client.chat.completions.create(model=model, messages=messages,
                                        temperature=0.2, max_tokens=max_tokens)
    report = r1.choices[0].message.content or ""

    # 第 2 段：延續對話，只輸出 JSON。
    # JSON Output（response_format json_object）支援依 DeepSeek-V4-Pro GA 公告摘要（PARTIALLY VERIFIED）。
    messages += [
        {"role": "assistant", "content": report},
        {"role": "user", "content": json_prompt},
    ]
    kwargs = dict(model=model, messages=messages, temperature=0.0, max_tokens=max_tokens)
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    r2 = client.chat.completions.create(**kwargs)
    return report, r2.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# 輸出處理
# ---------------------------------------------------------------------------

def parse_json_loose(text: str) -> dict | None:
    """去除可能的 ```json 圍欄後解析；失敗回傳 None。"""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m:
        t = m.group(1)
    else:
        start, end = t.find("{"), t.rfind("}")
        if start != -1 and end > start:
            t = t[start:end + 1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        return None


def save_outputs(output_dir: Path, report: str, json_text: str) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / f"{PLATFORM}-report.md"
    json_path = output_dir / f"{PLATFORM}-output.json"
    report_path.write_text(report, encoding="utf-8")
    print(f"[完成] Markdown 報告：{report_path}")
    data = parse_json_loose(json_text)
    if data is None:
        raw_path = output_dir / f"{PLATFORM}-output.raw.txt"
        raw_path.write_text(json_text, encoding="utf-8")
        print(f"[警告] JSON 解析失敗，原始回應已存至 {raw_path}；請人工檢查或重跑。", file=sys.stderr)
        return 1
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[完成] JSON 輸出：{json_path}")
    missing_keys = [k for k in ("meta", "data_quality", "exposure_priorities", "attack_path_hypotheses",
                                "remediation", "validation_plan", "executive_summary", "metrics",
                                "human_review_points") if k not in data]
    if missing_keys:
        print(f"[警告] JSON 缺少 schema 必要區塊：{', '.join(missing_keys)}", file=sys.stderr)
    return 0


# ---------------------------------------------------------------------------
# 主程式
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="DeepSeek 先制型曝險分析 API 工作流程")
    ap.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR,
                    help="輸入資料夾（預設 examples/synthetic-org）")
    ap.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                    help="輸出資料夾（預設 output/）")
    ap.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", DEFAULT_MODEL),
                    help="模型 ID（預設取 DEEPSEEK_MODEL 或 deepseek-v4-pro；請以官方列表確認）")
    ap.add_argument("--max-tokens", type=int, default=16000, help="每段回應的最大輸出 token")
    ap.add_argument("--no-json-mode", action="store_true",
                    help="第 2 段不使用 response_format json_object，改以提示詞要求純 JSON")
    ap.add_argument("--dry-run", action="store_true",
                    help="只印出組裝好的提示詞，不呼叫 API、不載入 SDK、不需 API key")
    args = ap.parse_args()

    input_dir: Path = args.input_dir
    if not input_dir.is_dir():
        sys.exit(f"[錯誤] 輸入資料夾不存在：{input_dir}")

    system_prompt = load_core_prompt()
    loaded, missing = load_inputs(input_dir)
    user_prompt = build_user_prompt(loaded, missing)
    json_prompt = build_json_prompt(load_output_schema())

    print("[資訊] 已載入檔案與筆數：", file=sys.stderr)
    for f in loaded:
        shown = f"{f['records']} 筆" if f["records"] is not None else "單一物件"
        print(f"  - {f['name']}: {shown}", file=sys.stderr)
    if missing:
        print("[資訊] 未提供：" + "；".join(missing), file=sys.stderr)

    if args.dry_run:
        print("=" * 78)
        print(f"[DRY-RUN] 平台：DeepSeek  模型：{args.model}")
        print(f"[DRY-RUN] 端點：{os.environ.get('DEEPSEEK_BASE_URL', DEFAULT_BASE_URL)}")
        print(f"[DRY-RUN] JSON 模式：{'關閉（提示詞要求純 JSON）' if args.no_json_mode else 'response_format json_object（PARTIALLY VERIFIED）'}")
        print(f"[DRY-RUN] 不會呼叫 API；system prompt {len(system_prompt)} 字元、user prompt {len(user_prompt)} 字元、"
              f"JSON 指令 {len(json_prompt)} 字元")
        print("=" * 78)
        print("----- SYSTEM PROMPT -----")
        print(system_prompt)
        print("----- USER PROMPT（第 1 段：Markdown 報告） -----")
        print(user_prompt)
        print("----- USER PROMPT（第 2 段：JSON） -----")
        print(json_prompt)
        return 0

    report, json_text = call_deepseek(system_prompt, user_prompt, json_prompt,
                                      args.model, args.max_tokens, json_mode=not args.no_json_mode)
    return save_outputs(args.output_dir, report, json_text)


if __name__ == "__main__":
    sys.exit(main())
