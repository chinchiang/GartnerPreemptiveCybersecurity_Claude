"""檔案筆數的共用案例（#238）：Python 分析工作流程核心的 count_records 這一份。

示範引擎的 recordCount 讀同一份 tests/fixtures/record-count-cases.json（scripts/record-count-cases.test.mjs），
兩份實作只改一份時，其中一邊會失敗。預期值是手數的。

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

FIXTURE = json.loads((ROOT / "tests/fixtures/record-count-cases.json").read_text(encoding="utf-8"))


class SharedRecordCountCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                self.assertEqual(aw.count_records(copy.deepcopy(case["data"]), case["file"]), case["expected"])


if __name__ == "__main__":
    unittest.main()
