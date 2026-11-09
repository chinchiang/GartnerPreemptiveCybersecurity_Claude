"""評分入口的正規化（#262）：Python 分析工作流程核心的 scoring_rows，跟示範引擎 assets/demo.js 的 scoringRows 是同一條規則的兩份實作。

1. 共用正規化案例 tests/fixtures/scoring-rows-cases.json：預期值是手寫的；示範引擎那一份由 scripts/scoring-rows.test.mjs 跑。
2. 形狀表涵蓋：SCORING_ROW_SHAPES 的鍵等於 input-schema.json 的 properties 去掉 scope（threat_intel 換成 threatIntel）。

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

FIXTURE = json.loads((ROOT / "tests/fixtures/scoring-rows-cases.json").read_text(encoding="utf-8"))
INPUT_SCHEMA = json.loads((ROOT / "skills/shared/input-schema.json").read_text(encoding="utf-8"))


class SharedScoringRowsCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                data = copy.deepcopy(case["data"])
                self.assertEqual(aw.scoring_rows(data), case["expected"])
                self.assertEqual(data, case["data"], "不修改輸入")


class ScoringRowShapesCoverageTest(unittest.TestCase):
    def test_shape_table_covers_every_input_category(self):
        # 新的輸入類別沒補進形狀表就失敗
        expected = ["threatIntel" if k == "threat_intel" else k for k in INPUT_SCHEMA["properties"] if k != "scope"]
        self.assertEqual(sorted(aw.SCORING_ROW_SHAPES), sorted(expected))


if __name__ == "__main__":
    unittest.main()
