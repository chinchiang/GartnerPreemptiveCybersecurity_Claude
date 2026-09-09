#!/usr/bin/env python3
"""輸入結構檢查（純標準函式庫，不連網、不執行任何掃描）。

用法：python3 validate_inputs.py <資料夾路徑>
輸出：每個檔案的筆數、缺欄位、異常值；以及範圍外資產、未知對外資產。
"""
import csv
import json
import sys
from pathlib import Path

REQUIRED = {
    "assets.csv": ["asset_id", "name", "type", "business_criticality", "internet_exposed", "owner"],
    "vulnerabilities.csv": ["finding_id", "asset_id", "vuln_id", "title", "cvss_base"],
    "identities.csv": ["identity_id", "account", "privilege_level", "linked_assets"],
    "misconfigurations.csv": ["config_id", "asset_id", "control", "status"],
}
OPTIONAL_JSON = ["controls.json", "threat-intel.json", "topology.json", "exposures.json"]


def read_csv(path: Path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def main(folder: str) -> int:
    root = Path(folder)
    if not root.is_dir():
        print(f"找不到資料夾：{root}")
        return 2
    scope_path = root / "scope.json"
    if not scope_path.exists():
        print("缺少 scope.json：無授權範圍，停止分析。必要欄位：organization、analysis_date、"
              "authorized_scope.in_scope_assets、authorized_scope.active_testing_authorized、"
              "authorized_scope.external_scanning_authorized、reporting.audience")
        return 3
    scope = json.loads(scope_path.read_text(encoding="utf-8"))
    in_scope = set(scope.get("authorized_scope", {}).get("in_scope_assets", []))
    print(f"[scope] 組織={scope.get('organization')} 日期={scope.get('analysis_date')} "
          f"範圍內資產={len(in_scope)} 主動測試授權={scope.get('authorized_scope', {}).get('active_testing_authorized')} "
          f"外部掃描授權={scope.get('authorized_scope', {}).get('external_scanning_authorized')}")

    problems = 0
    asset_ids = set()
    for name, req in REQUIRED.items():
        p = root / name
        if not p.exists():
            level = "必要" if name in ("assets.csv", "vulnerabilities.csv") else "建議"
            print(f"[{name}] 缺少（{level}）")
            if level == "必要":
                problems += 1
            continue
        rows = read_csv(p)
        missing = [c for c in req if rows and c not in rows[0]]
        anomalies = []
        if name == "assets.csv":
            asset_ids = {r["asset_id"] for r in rows}
            dup = len(rows) - len(asset_ids)
            if dup:
                anomalies.append(f"重複 asset_id ×{dup}")
            out = sorted(asset_ids - in_scope)
            if out:
                anomalies.append(f"範圍外資產（將排除）：{', '.join(out)}")
            for r in rows:
                try:
                    if not 1 <= int(r["business_criticality"]) <= 5:
                        anomalies.append(f"{r['asset_id']} business_criticality 超出 1–5")
                except (KeyError, ValueError):
                    anomalies.append(f"{r.get('asset_id')} business_criticality 無效")
        if name == "vulnerabilities.csv":
            for r in rows:
                try:
                    if not 0 <= float(r["cvss_base"]) <= 10:
                        anomalies.append(f"{r['finding_id']} cvss_base 超出 0–10")
                except (KeyError, ValueError):
                    anomalies.append(f"{r.get('finding_id')} cvss_base 無效")
                if asset_ids and r.get("asset_id") not in asset_ids:
                    anomalies.append(f"{r['finding_id']} 指向不存在資產 {r.get('asset_id')}")
        if name == "identities.csv":
            for r in rows:
                for a in str(r.get("linked_assets", "")).split(";"):
                    if a and asset_ids and a not in asset_ids:
                        anomalies.append(f"{r['identity_id']} linked_assets 指向不存在資產 {a}")
        print(f"[{name}] 筆數={len(rows)} 缺欄位={missing or '無'} 異常={anomalies or '無'}")
        if missing:
            problems += 1

    for name in OPTIONAL_JSON:
        p = root / name
        if not p.exists():
            print(f"[{name}] 缺少（建議）→ 依替代規則處理並下修信心")
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if name == "controls.json":
            print(f"[{name}] 控制項={len(data.get('controls', []))}")
        elif name == "threat-intel.json":
            print(f"[{name}] 行為者={len(data.get('actors', []))} 趨勢弱點類別={len(data.get('trending_weakness_classes', []))}")
        elif name == "topology.json":
            edges = data.get("edges", [])
            bad = [e for e in edges if e.get("to") not in asset_ids or (e.get("from") != "internet" and e.get("from") not in asset_ids)]
            print(f"[{name}] crown_jewels={data.get('crown_jewels')} edges={len(edges)} 指向不存在資產的邊={len(bad)}")
        elif name == "exposures.json":
            ex = data.get("exposures", [])
            unknown = [e.get("hostname") for e in ex if not e.get("asset_id")]
            print(f"[{name}] 筆數={len(ex)} 未納入清冊的對外資產={unknown or '無'}")

    print("結果：" + ("可以進行分析" if problems == 0 else f"有 {problems} 個必要問題，請先修正"))
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "examples/synthetic-org"))
