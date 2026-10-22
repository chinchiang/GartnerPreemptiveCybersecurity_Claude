#!/usr/bin/env python3
"""輸入結構檢查（純標準函式庫，不連網、不執行任何掃描）。

用法：python3 validate_inputs.py <資料夾路徑>
輸出：每個檔案的筆數、缺欄位、異常值；以及範圍外資產、未知對外資產。
結束碼：0 可以分析；1 有必要問題；2 資料夾不存在；3 授權範圍（scope.json）有問題。

這支腳本只負責渲染：授權範圍守門、輸入載入、腳本預檢與預檢發現的嚴重度都由分析工作流程核心提供
（與五支 api-workflow.py 同一套規則；scope 有問題時印出核心的中止訊息）。每個檔案那一行由核心的預檢發現
依 kind 渲染、依嚴重度計數，不比對訊息字串（見 GLOSSARY.md「腳本預檢」「預檢發現」）。
本檔是母本：建置把它和 analysis_workflow.py 一起複製到 Claude 與 Gemini 技能的 scripts/，讓技能資料夾
單獨安裝或上傳時仍可執行（見 docs/adr/0003、0006）。執行的是複本：核心是同目錄的 analysis_workflow.py，
規則來源是技能內的 references/input-schema.json；skills/shared/ 底下沒有 references/，母本本身不直接執行。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analysis_workflow  # noqa: E402

KIND = analysis_workflow.PreflightKind

INPUT_SCHEMA_PATH = Path(__file__).resolve().parents[1] / "references" / "input-schema.json"

OPTIONAL_JSON = ["controls.json", "threat-intel.json", "topology.json", "exposures.json"]   # 輸出順序
# 這幾種預檢發現有自己的欄位（缺欄位=、指向不存在資產的邊=、未納入清冊的對外資產=）或自己的一行，不再列進「異常=」
OWN_FIELD = {KIND.MISSING_REQUIRED_FILE, KIND.MISSING_COLUMNS, KIND.UNPARSABLE, KIND.NOT_AN_OBJECT, KIND.DANGLING_EDGE, KIND.UNLISTED_HOST}


def _list_at(data: dict, key: str) -> list:
    """data[key] 是清單就回傳它，否則（缺少或型別不對）回傳空清單，供 JSON 摘要行計數。"""
    return data.get(key) if isinstance(data.get(key), list) else []


def _detail(findings: list, kind: str, default):
    """該檔案某一種預檢發現的 detail（沒有這種發現就回傳 default）。"""
    return next((f.detail for f in findings if f.kind == kind), default)


def main(folder: str) -> int:
    root = Path(folder)
    if not root.is_dir():
        print(f"找不到資料夾：{root}")
        return 2
    input_schema = json.loads(INPUT_SCHEMA_PATH.read_text(encoding="utf-8"))
    try:
        inputs = analysis_workflow.load_inputs(root, frozenset(), input_schema)
    except analysis_workflow.Abort as exc:   # 授權範圍守門：與 api-workflow.py 同一段中止訊息
        print(exc)
        return 3
    scope = inputs.scope
    authorized = scope.get("authorized_scope", {})
    print(f"[scope] 組織={scope.get('organization')} 日期={scope.get('analysis_date')} "
          f"範圍內資產={len(set(authorized.get('in_scope_assets', [])))} 主動測試授權={authorized.get('active_testing_authorized')} "
          f"外部掃描授權={authorized.get('external_scanning_authorized')}")

    loaded = {f["name"]: f for f in inputs.files}
    by_file = {}
    for f in inputs.findings:
        by_file.setdefault(f.file, []).append(f)
    for name, _, _, required in analysis_workflow.INPUT_FILES:
        if not name.endswith(".csv"):
            continue
        findings = by_file.get(name, [])
        error = _detail(findings, KIND.UNPARSABLE, None)
        if error is not None:
            print(f"[{name}] 無法解析：{error}")
            continue
        if name not in loaded:
            print(f"[{name}] 缺少（{'必要' if required else '建議'}）")
            continue
        missing = _detail(findings, KIND.MISSING_COLUMNS, [])
        anomalies = [f.message for f in findings if f.kind not in OWN_FIELD]
        print(f"[{name}] 筆數={len(loaded[name]['data'])} 缺欄位={missing or '無'} 異常={anomalies or '無'}")
        if missing and not required:
            print(f"[{name}] 警告：建議檔缺欄位 {missing}，將依替代規則處理並下修信心")

    for name in OPTIONAL_JSON:
        findings = by_file.get(name, [])
        error = _detail(findings, KIND.UNPARSABLE, None)
        if error is not None:
            print(f"[{name}] 無法解析：{error} → 視同缺少（建議），依替代規則處理並下修信心")
            continue
        if name not in loaded:
            print(f"[{name}] 缺少（建議）→ 依替代規則處理並下修信心")
            continue
        if any(f.kind == KIND.NOT_AN_OBJECT for f in findings):
            print(f"[{name}] 結構不是物件 → 視同缺少（建議）")
            continue
        data = loaded[name]["data"]
        anomalies = [f.message for f in findings if f.kind not in OWN_FIELD]
        extra = f" 異常={anomalies}" if anomalies else ""   # 合成資料沒有這類發現，輸出維持原樣
        if name == "controls.json":
            print(f"[{name}] 控制項={len(_list_at(data, 'controls'))}{extra}")
        elif name == "threat-intel.json":
            print(f"[{name}] 行為者={len(_list_at(data, 'actors'))} 趨勢弱點類別={len(_list_at(data, 'trending_weakness_classes'))}{extra}")
        elif name == "topology.json":
            bad = sum(1 for f in findings if f.kind == KIND.DANGLING_EDGE)   # 一條邊一筆
            print(f"[{name}] crown_jewels={data.get('crown_jewels')} edges={len(_list_at(data, 'edges'))} "
                  f"指向不存在資產的邊={bad} 異常={anomalies or '無'}")
        elif name == "exposures.json":
            unknown = _detail(findings, KIND.UNLISTED_HOST, [])
            print(f"[{name}] 筆數={len(_list_at(data, 'exposures'))} 未納入清冊的對外資產={unknown or '無'}{extra}")

    # 嚴重度由核心決定；以檔案為單位計數是這支腳本的呈現方式（同一個檔案有多筆必要問題也只算一個，
    # 有必要問題的檔案不再另算警告），與改用核心之前的計數相同
    severities = {name: {f.severity for f in fs} for name, fs in by_file.items()}
    problems = sum(1 for s in severities.values() if analysis_workflow.PROBLEM in s)
    warnings = sum(1 for s in severities.values() if analysis_workflow.WARNING in s and analysis_workflow.PROBLEM not in s)
    if warnings:
        print(f"警告：{warnings} 項建議檔問題（不阻擋分析，但信心下修）")
    print("結果：" + ("可以進行分析" if problems == 0 else f"有 {problems} 個必要問題，請先修正"))
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "examples/synthetic-org"))
