#!/usr/bin/env python3
"""輸入結構檢查（純標準函式庫，不連網、不執行任何掃描）。

用法：python3 validate_inputs.py <資料夾路徑>
輸出：每個檔案的筆數、缺欄位、異常值；以及範圍外資產、未知對外資產。
結束碼：0 可以分析；1 有必要問題；2 資料夾不存在；3 授權範圍（scope.json）有問題。

授權範圍守門、輸入載入與資料完整性檢查都由分析工作流程核心提供（與四支 api-workflow.py 同一套規則）。
核心是同目錄的 analysis_workflow.py：由建置從 skills/shared/ 複製而來，讓技能資料夾單獨安裝或上傳時
仍可執行（見 docs/adr/0003）；規則來源是技能內的 references/input-schema.json。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analysis_workflow  # noqa: E402

INPUT_SCHEMA = Path(__file__).resolve().parents[1] / "references" / "input-schema.json"

OPTIONAL_JSON = ["controls.json", "threat-intel.json", "topology.json", "exposures.json"]   # 輸出順序


def _items(data: dict, key: str) -> list:
    return data.get(key) if isinstance(data.get(key), list) else []


def main(folder: str) -> int:
    root = Path(folder)
    if not root.is_dir():
        print(f"找不到資料夾：{root}")
        return 2
    input_schema = json.loads(INPUT_SCHEMA.read_text(encoding="utf-8"))
    scope_path = root / "scope.json"
    if not scope_path.exists():
        print("缺少 scope.json：無授權範圍，停止分析。必要欄位：" + "、".join(analysis_workflow.required_scope_fields(input_schema)))
        return 3
    try:
        scope = json.loads(scope_path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        print(f"scope.json 無法解析：{exc}。停止分析。")
        return 3
    scope_missing = analysis_workflow.scope_problems(scope, input_schema)
    if scope_missing:
        print("scope.json 缺少必填欄位：" + "、".join(scope_missing) + "。停止分析。")
        return 3
    in_scope = set(scope.get("authorized_scope", {}).get("in_scope_assets", []))
    print(f"[scope] 組織={scope.get('organization')} 日期={scope.get('analysis_date')} "
          f"範圍內資產={len(in_scope)} 主動測試授權={scope.get('authorized_scope', {}).get('active_testing_authorized')} "
          f"外部掃描授權={scope.get('authorized_scope', {}).get('external_scanning_authorized')}")

    inputs = analysis_workflow.load_inputs(root, frozenset(), input_schema)
    loaded = {f["name"]: f for f in inputs.files}
    findings = analysis_workflow.integrity_findings(inputs)
    problems = 0
    warnings = 0
    for name, category, _, required in analysis_workflow.INPUT_FILES:
        if not name.endswith(".csv"):
            continue
        level = "必要" if required else "建議"
        if name in inputs.unparsable:
            print(f"[{name}] 無法解析：{inputs.unparsable[name]}")
            if required:
                problems += 1
            else:
                warnings += 1
            continue
        if name not in loaded:
            print(f"[{name}] 缺少（{level}）")
            if required:
                problems += 1
            continue
        rows, columns = loaded[name]["data"], loaded[name]["columns"]
        missing = [c for c in analysis_workflow.required_columns(category, input_schema) if c not in columns]
        anomalies = (["必要檔案 0 筆資料"] if required and not rows else []) + [m for n, m in findings if n == name]
        print(f"[{name}] 筆數={len(rows)} 缺欄位={missing or '無'} 異常={anomalies or '無'}")
        if required and (missing or not rows):
            problems += 1
        elif missing:
            warnings += 1
            print(f"[{name}] 警告：建議檔缺欄位 {missing}，將依替代規則處理並下修信心")

    for name in OPTIONAL_JSON:
        if name in inputs.unparsable:
            print(f"[{name}] 無法解析：{inputs.unparsable[name]} → 視同缺少（建議），依替代規則處理並下修信心")
            warnings += 1
            continue
        if name not in loaded:
            print(f"[{name}] 缺少（建議）→ 依替代規則處理並下修信心")
            continue
        data = loaded[name]["data"]
        if not isinstance(data, dict):
            print(f"[{name}] 結構不是物件 → 視同缺少（建議）")
            warnings += 1
            continue
        if name == "controls.json":
            print(f"[{name}] 控制項={len(_items(data, 'controls'))}")
        elif name == "threat-intel.json":
            print(f"[{name}] 行為者={len(_items(data, 'actors'))} 趨勢弱點類別={len(_items(data, 'trending_weakness_classes'))}")
        elif name == "topology.json":
            bad = sum(1 for n, _ in findings if n == name)
            print(f"[{name}] crown_jewels={data.get('crown_jewels')} edges={len(_items(data, 'edges'))} 指向不存在資產的邊={bad}")
        elif name == "exposures.json":
            unknown = analysis_workflow.unlisted_hosts(data)
            print(f"[{name}] 筆數={len(_items(data, 'exposures'))} 未納入清冊的對外資產={unknown or '無'}")

    if warnings:
        print(f"警告：{warnings} 項建議檔問題（不阻擋分析，但信心下修）")
    print("結果：" + ("可以進行分析" if problems == 0 else f"有 {problems} 個必要問題，請先修正"))
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "examples/synthetic-org"))
