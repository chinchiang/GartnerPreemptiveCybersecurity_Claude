"""曝險評分（#228、ADR 0010）：Python 分析工作流程核心的評分函式，跟示範引擎 assets/demo.js 的 analyze() 是同一條規則的兩份實作。

1. 共用案例 tests/fixtures/scoring-cases.json：預期值是手算的；示範引擎那一份由 scripts/scoring-cases.test.mjs 跑。
2. 合成資料：從 examples/synthetic-org/ 的實際檔案讀起（連 CSV 的型別轉換一起測），算出的 14 項跟示範快照
   examples/demo-snapshot.txt 的分級、分數、L、I、依據逐項一致。

執行：python3 -m unittest discover -s tests/python
"""
import copy
import json
import sys
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
                findings = aw.score_findings(copy.deepcopy(FIXTURE["baseData"]), case["inputs"])
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
        findings = aw.score_findings(*aw.scoring_bundle(inputs))
        got = [[f["priority"], f["asset_name"], f["vuln_id"], f"score {aw.js_number(f['score'])}",
                f"L {f['likelihood']:.1f}", f"I {f['impact']:.1f}", "；".join(f["factors"])] for f in findings]
        self.assertEqual(got, [[e[0], e[1], e[2], e[3], e[4], e[5], e[7]] for e in expected])

    def test_missing_threat_intel_turns_the_intel_factor_off(self):
        # 缺 threat-intel.json 時對應示範引擎的 inputs.threatIntel = false：SYN-2026-0101 少了情資因子，分數照樣 86（可能性已達上限）
        inputs = aw.load_inputs(ROOT / "examples/synthetic-org", frozenset({"threat_intel"}), INPUT_SCHEMA)
        bundle, flags = aw.scoring_bundle(inputs)
        self.assertFalse(flags["threatIntel"])
        vpn = next(f for f in aw.score_findings(bundle, flags) if f["vuln_id"] == "SYN-2026-0101")
        self.assertEqual((vpn["priority"], vpn["score"]), ("P1", 86))
        self.assertFalse(any("威脅情資" in factor for factor in vpn["factors"]))


if __name__ == "__main__":
    unittest.main()
