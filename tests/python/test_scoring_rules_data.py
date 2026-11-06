"""規則資料（skills/shared/scoring-rules.json）：建置從示範引擎的 RULES 產生，Python 分析工作流程核心讀取（#227、ADR 0010）。

已知正確值與母本目前陳述的示範規則相同（跟 scripts/scoring-rules.test.mjs 對示範引擎斷言的是同一組數字）。
執行：python3 -m unittest discover -s tests/python
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "skills" / "shared"))
import analysis_workflow as aw  # noqa: E402


class ScoringRulesDataTest(unittest.TestCase):
    def test_reads_the_generated_rules_without_the_note(self):
        rules = aw.load_scoring_rules()
        self.assertNotIn("_note", rules)
        self.assertEqual(sorted(rules), ["confidence", "feasibility", "identityIssue", "impact", "likelihood", "thresholds", "weights"])
        self.assertEqual(rules["thresholds"], {"strict": [50, 30, 15], "balanced": [60, 40, 20], "tolerant": [70, 50, 25]})
        self.assertEqual(rules["impact"]["dataWeight"], {"Restricted": 3, "Confidential": 2, "Internal": 1, "Public": 0})
        self.assertEqual(rules["likelihood"]["intel"], {"high": 2, "medium": 1.5, "low": 1})
        self.assertEqual((rules["feasibility"]["unknownNode"], rules["feasibility"]["maxHops"]), (3, 5))
        self.assertEqual(rules["confidence"], {"lowMissing": 3, "inventoryThreshold": 80})

    def test_reads_a_copy_at_another_path(self):
        # 技能資料夾的核心複本在 scripts/ 底下，規則資料在 references/：路徑由呼叫端傳入
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "scoring-rules.json"
            path.write_text(json.dumps({"_note": "產生的", "thresholds": {"balanced": [1, 2, 3]}}), encoding="utf-8")
            self.assertEqual(aw.load_scoring_rules(path), {"thresholds": {"balanced": [1, 2, 3]}})

    def test_missing_file_aborts_with_the_path_and_how_to_rebuild(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "scoring-rules.json"
            with self.assertRaises(aw.Abort) as ctx:
                aw.load_scoring_rules(missing)
            self.assertIn(str(missing), str(ctx.exception))
            self.assertIn("npm run build", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
