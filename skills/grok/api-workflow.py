#!/usr/bin/env python3
"""
Grok（xAI）API 工作流程：先制型曝險分析（Preemptive Exposure Analysis）

用途
  以 skills/shared/core-prompt.md 作為 system prompt，讀入 examples/synthetic-org/ 的 9 個輸入檔，
  透過 xAI API（xai_sdk）產出 Markdown 報告與符合 output-schema.json 的 JSON。

查證狀態（2026-09-09）
  - xai_sdk 的 Client / chat.create / chat.append / chat.sample 用法依 github.com/xai-org/xai-sdk-python
    README 與範例撰寫（已查證），但 SDK 版本更新後可能變動，執行前請對照官方 README。
  - 模型 ID 預設 grok-4.6（SDK README 範例值）；請以 docs.x.ai 模型列表確認。
  - --compat：OpenAI 相容端點（https://api.x.ai/v1）的相容性「待驗證」，僅作為替代路徑。

環境變數（勿寫入程式碼、勿提交到 git）
  XAI_API_KEY   必要（--dry-run 時不需要）
  XAI_MODEL     預設 grok-4.6

用法
  python3 skills/grok/api-workflow.py --dry-run            # 只組裝提示詞，不呼叫 API、不需 SDK
  python3 skills/grok/api-workflow.py                      # xai_sdk（pip install -r skills/grok/requirements.txt）
  python3 skills/grok/api-workflow.py --compat             # OpenAI 相容端點（pip install openai；待驗證）
  python3 skills/grok/api-workflow.py --input-dir <dir>    # 自己的資料夾
  python3 skills/grok/api-workflow.py --dry-run --exclude threat_intel   # 模擬缺漏（驗收第 6 項）
  python3 skills/grok/api-workflow.py --dry-run --exclude scope          # 模擬缺 scope（驗收第 7 項，應中止）

輸出
  output/grok-report.md、output/grok-output.json（JSON 解析失敗時另存 output/grok-output.raw.txt）

安全邊界
  預設不啟用任何伺服器端工具（web_search / x_search / code_execution）。
  本腳本只做「資料整理 → 呼叫語言模型 → 存檔」；不掃描、不探測、不變更任何系統。
  缺少 scope.json 時直接中止。
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_DIR = REPO_ROOT / "skills" / "shared"
DEFAULT_INPUT_DIR = REPO_ROOT / "examples" / "synthetic-org"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "output"
DEFAULT_MODEL = "grok-4.6"          # 依 xai-sdk-python README 範例；請以 docs.x.ai 確認
COMPAT_BASE_URL = "https://api.x.ai/v1"  # OpenAI 相容端點（待驗證）

EXCLUDE_CHOICES = ["scope", "assets", "vulnerabilities", "exposures", "identities", "misconfigurations", "controls", "threat_intel", "topology"]
FILE_CATEGORY = {"scope.json": "scope", "assets.csv": "assets", "vulnerabilities.csv": "vulnerabilities", "exposures.json": "exposures", "identities.csv": "identities", "misconfigurations.csv": "misconfigurations", "controls.json": "controls", "threat-intel.json": "threat_intel", "topology.json": "topology"}

INPUT_FILES = [
    ("scope.json", "I1 授權範圍與分析參數", True),
    ("assets.csv", "I2 資產清冊與業務重要性", True),
    ("vulnerabilities.csv", "I3 弱點與發現", True),
    ("exposures.json", "I4 外部曝險（EASM）", False),
    ("identities.csv", "I6 身分與權限", False),
    ("misconfigurations.csv", "I7 設定基準偏差", False),
    ("controls.json", "I8 既有控制措施", False),
    ("threat-intel.json", "I9 威脅情資", False),
    ("topology.json", "I10 網路拓樸／信任關係", False),
]


def load_core_prompt() -> str:
    text = (SHARED_DIR / "core-prompt.md").read_text(encoding="utf-8")
    m = re.search(r"```text\n(.*?)```", text, re.S)
    if not m:
        sys.exit("[錯誤] 無法在 skills/shared/core-prompt.md 找到提示詞區塊")
    return m.group(1).strip()


def count_records(path: Path) -> str:
    try:
        if path.suffix == ".csv":
            with path.open(encoding="utf-8", newline="") as f:
                return f"{sum(1 for _ in csv.DictReader(f))} 筆"
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, csv.Error, UnicodeDecodeError) as exc:
        return f"無法解析（{type(exc).__name__}）；模型將視為缺漏"
    for key in ("exposures", "controls", "actors", "edges"):
        if isinstance(data, dict) and isinstance(data.get(key), list):
            return f"{len(data[key])} 筆（{key}）"
    return "單一物件"


def validate_scope(path: Path) -> None:
    """I1 守門：scope.json 必須存在、可解析且含六個必填欄位。"""
    try:
        scope = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        sys.exit(f"[中止] scope.json 無法解析：{exc}")
    required = [("organization",), ("analysis_date",), ("authorized_scope", "in_scope_assets"),
                ("authorized_scope", "active_testing_authorized"), ("authorized_scope", "external_scanning_authorized"),
                ("reporting", "audience")]
    missing = []
    for keys in required:
        node = scope
        for k in keys:
            node = node.get(k) if isinstance(node, dict) else None
        if node is None:
            missing.append(".".join(keys))
    if missing:
        sys.exit("[中止] scope.json 缺少必填欄位：" + ", ".join(missing))


def build_user_prompt(input_dir: Path, exclude: frozenset[str] = frozenset()) -> str:
    if "scope" in exclude or not (input_dir / "scope.json").exists():
        sys.exit("[中止] 缺少 scope.json：無授權範圍不得分析。請提供 organization、analysis_date、authorized_scope.in_scope_assets、authorized_scope.active_testing_authorized、authorized_scope.external_scanning_authorized、reporting.audience。")
    validate_scope(input_dir / "scope.json")
    parts = ["請依系統指令進行先制型曝險分析。以下為輸入檔案（來源資料夾：%s）。" % input_dir.name,
             "請先回報每個檔案的筆數與缺欄位，再逐步輸出 S1–S8，最後附上符合 output-schema.json 的 JSON 區塊。"]
    print("[資訊] 已載入檔案與筆數：", file=sys.stderr)
    for name, label, required in INPUT_FILES:
        p = input_dir / name
        if FILE_CATEGORY[name] in exclude or not p.exists():
            why = "依 --exclude 排除" if FILE_CATEGORY[name] in exclude else "缺少"
            print(f"  - {name}: {why}（{'必要' if required else '建議'}）", file=sys.stderr)
            parts.append(f"\n### {name}（{label}）\n（未提供；請依規則以替代方式處理並在 missing_inputs 標示）")
            continue
        print(f"  - {name}: {count_records(p)}", file=sys.stderr)
        lang = "json" if p.suffix == ".json" else "csv"
        parts.append(f"\n### {name}（{label}）\n```{lang}\n{p.read_text(encoding='utf-8').strip()}\n```")
    schema = (SHARED_DIR / "output-schema.json").read_text(encoding="utf-8")
    parts.append("\n### output-schema.json（JSON 輸出須符合）\n```json\n" + schema.strip() + "\n```")
    return "\n".join(parts)


JSON_PROMPT = "請只輸出一個符合 output-schema.json 的 JSON 物件（不要 Markdown 圍欄、不要說明文字），內容對應你上一則報告。"


def extract_json(text: str):
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    candidate = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    return json.loads(candidate)


def call_xai_sdk(system_prompt: str, user_prompt: str, model: str) -> tuple[str, str]:
    try:
        from xai_sdk import Client  # type: ignore
        from xai_sdk.chat import system, user  # type: ignore
    except ImportError:
        sys.exit("[錯誤] 未安裝 xai_sdk。請執行：pip install -r skills/grok/requirements.txt")
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        sys.exit("[錯誤] 未設定 XAI_API_KEY 環境變數")
    client = Client(api_key=api_key)
    # 注意：不傳入任何 tools=[...]，因此不會啟用 web_search / x_search / code_execution。
    chat = client.chat.create(model=model)
    chat.append(system(system_prompt))
    chat.append(user(user_prompt))
    first = chat.sample()
    report = first.content
    chat.append(first)
    chat.append(user(JSON_PROMPT))
    second = chat.sample()
    return report, second.content


def call_openai_compatible(system_prompt: str, user_prompt: str, model: str) -> tuple[str, str]:
    """替代路徑：OpenAI 相容端點（相容性待驗證）。"""
    try:
        from openai import OpenAI  # type: ignore
    except ImportError:
        sys.exit("[錯誤] 未安裝 openai SDK。請執行：pip install openai")
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        sys.exit("[錯誤] 未設定 XAI_API_KEY 環境變數")
    client = OpenAI(api_key=api_key, base_url=os.environ.get("XAI_COMPAT_BASE_URL", COMPAT_BASE_URL))
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    r1 = client.chat.completions.create(model=model, messages=messages)
    report = r1.choices[0].message.content or ""
    messages += [{"role": "assistant", "content": report}, {"role": "user", "content": JSON_PROMPT}]
    r2 = client.chat.completions.create(model=model, messages=messages)
    return report, r2.choices[0].message.content or ""


def main() -> int:
    ap = argparse.ArgumentParser(description="Grok（xAI）先制型曝險分析工作流程")
    ap.add_argument("--input-dir", default=str(DEFAULT_INPUT_DIR))
    ap.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    ap.add_argument("--model", default=os.environ.get("XAI_MODEL", DEFAULT_MODEL))
    ap.add_argument("--dry-run", action="store_true", help="只組裝提示詞，不呼叫 API")
    ap.add_argument("--compat", action="store_true", help="改用 OpenAI 相容端點（待驗證）")
    ap.add_argument("--exclude", action="append", choices=EXCLUDE_CHOICES, default=[],
                    help="模擬缺漏：排除某類輸入（可重複）；排除 scope 會直接中止（驗收第 6、7 項）")
    args = ap.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.is_dir():
        sys.exit(f"[錯誤] 輸入資料夾不存在：{input_dir}")
    system_prompt = load_core_prompt()
    user_prompt = build_user_prompt(input_dir, frozenset(args.exclude))
    print("=" * 78, file=sys.stderr)
    if args.dry_run:
        print(f"[DRY-RUN] 平台：Grok  模型：{args.model}（未呼叫 API）")
        print("\n=== system ===\n" + system_prompt)
        print("\n=== user（前 1500 字）===\n" + user_prompt[:1500] + "\n...")
        return 0

    report, json_text = (call_openai_compatible if args.compat else call_xai_sdk)(system_prompt, user_prompt, args.model)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "grok-report.md").write_text(report, encoding="utf-8")
    try:
        data = extract_json(json_text)
        (out / "grok-output.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[完成] {out/'grok-report.md'} 與 {out/'grok-output.json'}")
    except (ValueError, json.JSONDecodeError):
        (out / "grok-output.raw.txt").write_text(json_text, encoding="utf-8")
        print(f"[警告] JSON 解析失敗，原始回應存於 {out/'grok-output.raw.txt'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
