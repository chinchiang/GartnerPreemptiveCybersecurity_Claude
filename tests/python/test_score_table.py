"""分數表的共用案例（#230、ADR 0010）：Python 分析工作流程核心的 score_table／score_table_section 這一份。

示範引擎的 scoreTable／scoreTableSection 讀同一份 tests/fixtures/score-table-cases.json（scripts/score-table-cases.test.mjs），
後端代理與 API 腳本送給模型的分數表因此格式相同；兩份實作只改一份時，其中一邊會失敗。

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

FIXTURE = json.loads((ROOT / "tests/fixtures/score-table-cases.json").read_text(encoding="utf-8"))
RULES = aw.load_scoring_rules()


class SharedScoreTableCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                bundle = copy.deepcopy(case["bundle"])
                if case["expected"] == "unscorable":
                    with self.assertRaises(aw.UnscorableInputs):
                        aw.score_table(bundle, RULES)
                else:
                    self.assertEqual(aw.score_table(bundle, RULES), case["expected"])


    def test_section_matches_the_shared_intro_and_json(self):
        # 說明是共用案例的字面值，接著是縮排 1 的 JSON 區塊；整數值寫成整數，跟示範引擎的 scoreTableSection 逐字相同
        bundle = copy.deepcopy(FIXTURE["cases"][0]["bundle"])
        table = aw.score_table(bundle, RULES)
        expected = FIXTURE["cases"][0]["expected"]
        self.assertEqual(table, expected)
        self.assertEqual(aw.score_table_section(table), FIXTURE["section"])


if __name__ == "__main__":
    unittest.main()
