"""輸出判定的共用案例（#275）：Python 分析工作流程核心的 output_verdict 這一份。

scripts/output-verdict.mjs 的 outputVerdict（後端代理用）讀同一份 tests/fixtures/verdict-cases.json
（scripts/verdict-cases.test.mjs），API 腳本與後端代理因此用同一個判定順序；兩份實作只改一份時，其中一邊會失敗。

執行：python3 -m unittest discover -s tests/python
"""
import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "skills" / "shared"))

import analysis_workflow as aw  # noqa: E402

FIXTURE = json.loads((ROOT / "tests/fixtures/verdict-cases.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((ROOT / "skills/shared/output-schema.json").read_text(encoding="utf-8"))
BASE = json.loads((ROOT / "examples/acceptance-fixture.json").read_text(encoding="utf-8"))


def apply_changes(changes):
    output = copy.deepcopy(BASE)
    for path, value in changes:
        node = output
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value
    return output


class SharedVerdictCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                table = copy.deepcopy(FIXTURE["table"]) if case["with_table"] else None
                self.assertEqual(aw.output_verdict(apply_changes(case["changes"]), SCHEMA, table), case["expected"])


class SaveOutputsFollowsVerdictTest(unittest.TestCase):
    """save_outputs 只依輸出判定寫檔：判定失敗時存原始回應、刪掉舊的 JSON、回傳 4，stderr 只列第一個失敗。"""

    def save(self, output, scores=None):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            folder = Path(tmp)
            (folder / "fake-output.json").write_text("{}", encoding="utf-8")   # 上一次成功的輸出
            reply = json.dumps(output, ensure_ascii=False)
            code = aw.save_outputs(folder, "fake", "# 報告", reply, SCHEMA, scores)
            files = {p.name: p.read_text(encoding="utf-8") for p in folder.iterdir()}
        return code, files, err.getvalue(), reply

    def test_inconsistent_and_mismatched_reports_only_the_inconsistency(self):
        code, files, err, reply = self.save(apply_changes([[["exposure_priorities", "items", 1, "score"], 0]]), FIXTURE["table"])
        self.assertEqual(code, 4)
        self.assertNotIn("fake-output.json", files)
        self.assertEqual(files["fake-output.raw.txt"], reply)
        self.assertIn("output_inconsistent", err)
        self.assertIn("$.exposure_priorities.items[1] 分數 0 依門檻應為 P4，卻標為 P1", err)
        self.assertNotIn("分數表", err)

    def test_schema_invalid_keeps_raw_reply_and_exits_4(self):
        code, files, err, reply = self.save(apply_changes([[["exposure_priorities", "thresholds", "P1"], "60"]]), FIXTURE["table"])
        self.assertEqual(code, 4)
        self.assertNotIn("fake-output.json", files)
        self.assertEqual(files["fake-output.raw.txt"], reply)
        self.assertIn("輸出不符合 output-schema.json（output_schema_invalid）：$.exposure_priorities.thresholds.P1 型別不合格", err)

    def test_score_table_mismatch_prints_readable_messages(self):
        code, files, err, reply = self.save(apply_changes([[["exposure_priorities", "items", 1, "score"], 70]]), FIXTURE["table"])
        self.assertEqual(code, 4)
        self.assertNotIn("fake-output.json", files)
        self.assertEqual(files["fake-output.raw.txt"], reply)
        self.assertIn("（score_table_mismatch）：$.exposure_priorities.items[1] F009 腳本算的是 P1／72.5，輸出是 P1／70", err)

    def test_passing_verdict_writes_json_and_exits_0(self):
        for name, scores in [("附分數表", FIXTURE["table"]), ("沒附分數表", None)]:
            with self.subTest(name):
                code, files, err, _ = self.save(BASE, scores)
                self.assertEqual(code, 0)
                self.assertEqual(json.loads(files["fake-output.json"]), BASE)
                self.assertNotIn("fake-output.raw.txt", files)
                self.assertEqual(err, "")


if __name__ == "__main__":
    unittest.main()
