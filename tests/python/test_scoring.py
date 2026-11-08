"""曝險評分（#228、ADR 0010）：Python 分析工作流程核心的評分函式，跟示範引擎 assets/demo.js 的 analyze() 是同一條規則的兩份實作。

1. 共用案例 tests/fixtures/scoring-cases.json：預期值是手算的；示範引擎那一份由 scripts/scoring-cases.test.mjs 跑。
2. 合成資料：從 examples/synthetic-org/ 的實際檔案讀起（連 CSV 的型別轉換一起測），算出的 14 項跟示範快照
   examples/demo-snapshot.txt 的分級、分數、L、I、依據逐項一致。

執行：python3 -m unittest discover -s tests/python
"""
import copy
import json
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "skills" / "shared"))
import analysis_workflow as aw  # noqa: E402

FIXTURE = json.loads((ROOT / "tests/fixtures/scoring-cases.json").read_text(encoding="utf-8"))
INPUT_SCHEMA = json.loads((ROOT / "skills/shared/input-schema.json").read_text(encoding="utf-8"))


class SharedScoringCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                # data：選用，覆蓋 baseData 的某幾個鍵（例如形狀不對的輸入，#237）
                findings = aw.score_findings(copy.deepcopy({**FIXTURE["baseData"], **case.get("data", {})}), case["inputs"])
                self.assertEqual([f["finding_id"] for f in findings], [e["finding_id"] for e in case["expected"]], "依分數由高到低排列")
                for f, e in zip(findings, case["expected"]):
                    self.assertAlmostEqual(f["likelihood"], e["likelihood"], delta=1e-9, msg=f"{e['finding_id']} 可能性")
                    self.assertAlmostEqual(f["impact"], e["impact"], delta=1e-9, msg=f"{e['finding_id']} 影響")
                    self.assertEqual(f["score"], e["score"], f"{e['finding_id']} 分數")
                    self.assertEqual(f["priority"], e["priority"], f"{e['finding_id']} 分級")
                    self.assertEqual(f["factors"], e["factors"], f"{e['finding_id']} 依據")

    def test_half_rounds_up_like_math_round(self):
        # 示範引擎的 round1 是 Math.round(v×10)/10：.x5 一律往上（Python 的 round 是銀行家捨入，0.25 會變 0.2）
        self.assertEqual(aw.round1(0.25), 0.3)
        self.assertEqual(aw.round1(47.12), 47.1)
        self.assertEqual(aw.round1(2.35), 2.4)

    def test_numbers_are_written_like_javascript(self):
        # factors 裡的數字要跟示範引擎的樣板字串相同：1.0 寫成 1，0.5 寫成 0.5
        self.assertEqual(aw.js_number(1.0), "1")
        self.assertEqual(aw.js_number(0.91), "0.91")
        self.assertEqual(aw.js_number(86.0), "86")
        self.assertEqual(aw.js_number(72.5), "72.5")


class SyntheticDataMatchesDemoSnapshotTest(unittest.TestCase):
    def test_fourteen_findings_match_the_demo_snapshot(self):
        lines = (ROOT / "examples/demo-snapshot.txt").read_text(encoding="utf-8").split("== 攻擊路徑假設")[0].splitlines()[1:]
        expected = [line.split(" | ") for line in lines if line.strip()]
        self.assertEqual(len(expected), 14)
        inputs = aw.load_inputs(ROOT / "examples/synthetic-org", frozenset(), INPUT_SCHEMA)
        findings = aw.score_findings(aw.scoring_bundle(inputs))
        got = [[f["priority"], f["asset_name"], f["vuln_id"], f"score {aw.js_number(f['score'])}",
                f"L {f['likelihood']:.1f}", f"I {f['impact']:.1f}", "；".join(f["factors"])] for f in findings]
        self.assertEqual(got, [[e[0], e[1], e[2], e[3], e[4], e[5], e[7]] for e in expected])

    def test_missing_threat_intel_has_no_intel_factor(self):
        # 缺 threat-intel.json 時沒有情資可以命中：SYN-2026-0101 少了情資因子，分數照樣 86（可能性已達上限）。
        # 開關用預設值（全部開著），只看行為（#255）
        inputs = aw.load_inputs(ROOT / "examples/synthetic-org", frozenset({"threat_intel"}), INPUT_SCHEMA)
        vpn = next(f for f in aw.score_findings(aw.scoring_bundle(inputs)) if f["vuln_id"] == "SYN-2026-0101")
        self.assertEqual((vpn["priority"], vpn["score"]), ("P1", 86))
        self.assertFalse(any("威脅情資" in factor for factor in vpn["factors"]))


class DenseTopologyTest(unittest.TestCase):
    """密集拓樸（#248）：40 個資產，internet 連到每一個，資產之間兩兩互連，crown jewel 是 D0。
    窮舉簡單路徑要幾十秒；入口加分只需要「哪些入口可達 crown jewel」，要在 2 秒內算完。
    每個資產都有一條直達 D0 的邊（D0 本身是 crown jewel），所以每一項發現都有入口加分。示範引擎那一份在 scripts/attack-paths.test.mjs。"""

    def test_forty_fully_connected_assets_score_within_two_seconds(self):
        ids = [f"D{i}" for i in range(40)]
        data = {
            "assets": [{"asset_id": i, "name": i, "type": "server", "business_criticality": 3, "data_classification": "Internal",
                        "internet_exposed": True, "environment": "IT"} for i in ids],
            "vulnerabilities": [{"finding_id": f"F{n}", "asset_id": i, "vuln_id": "TEST-1", "cvss_base": 5, "exploit_public": False,
                                 "epss_sim": 0, "kev_sim": False} for n, i in enumerate(ids)],
            "topology": {"crown_jewels": ["D0"], "edges": [{"from": "internet", "to": i, "trust": "network"} for i in ids]
                         + [{"from": a, "to": b, "trust": "network"} for a in ids for b in ids if a != b]},
        }
        started = time.perf_counter()
        findings = aw.score_findings(data)
        elapsed = time.perf_counter() - started
        self.assertLess(elapsed, 2, f"score_findings 花了 {elapsed:.1f} 秒")
        self.assertEqual(len(findings), 40)
        self.assertTrue(all("可達 crown jewel 之入口（blast radius）" in f["factors"] for f in findings), "每一項都有入口加分")


if __name__ == "__main__":
    unittest.main()
