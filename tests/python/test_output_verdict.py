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


DEEP_MARK = "__DEEP__"


def deep_reply(place, depth):
    """BASE 的 JSON 文字，place 放 DEEP_MARK 的位置換成 depth 層的陣列。"""
    output = copy.deepcopy(BASE)
    place(output)
    text = json.dumps(output, ensure_ascii=False)
    assert text.count(json.dumps(DEEP_MARK)) == 1
    return text.replace(json.dumps(DEEP_MARK), "[" * depth + '"x"' + "]" * depth)


class SharedVerdictCasesTest(unittest.TestCase):
    def test_shared_cases(self):
        for case in FIXTURE["cases"]:
            with self.subTest(case["name"]):
                table = copy.deepcopy(FIXTURE["table"]) if case["with_table"] else None
                self.assertEqual(aw.output_verdict(apply_changes(case["changes"]), SCHEMA, table), case["expected"])


class SaveOutputsFollowsVerdictTest(unittest.TestCase):
    """save_outputs 只依輸出判定寫檔：判定失敗時存這次的原始回應、刪掉舊的 JSON、回傳 4，stderr 只列第一個失敗；
    判定通過時寫出 JSON，不留下上一次失敗的原始回應（#279）。每個案例都在兩種輸出目錄各跑一次：
    只有上一次成功的 JSON，以及另外還有上一次失敗的 raw.txt。"""

    PREVIOUS_RUNS = [("上一次成功", False), ("上一次成功、之後又失敗", True)]

    def save(self, output, scores=None, previous_raw=False):
        """output 是字串時原樣當成模型回應（用來測 JSON 解析失敗），否則序列化成 JSON。"""
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            folder = Path(tmp)
            (folder / "fake-output.json").write_text("{}", encoding="utf-8")   # 上一次成功的輸出
            if previous_raw:
                (folder / "fake-output.raw.txt").write_text("上一次失敗的原始回應", encoding="utf-8")
            reply = output if isinstance(output, str) else json.dumps(output, ensure_ascii=False)
            code = aw.save_outputs(folder, "fake", "# 報告", reply, SCHEMA, scores)
            files = {p.name: p.read_text(encoding="utf-8") for p in folder.iterdir()}
        return code, files, err.getvalue(), reply

    def assert_failure_keeps_this_reply(self, output, scores, expected_err):
        """兩種輸出目錄都要回傳 4、沒有 JSON、raw.txt 是這次的回應、stderr 含 expected_err；回傳各次的 stderr。"""
        errs = []
        for name, previous_raw in self.PREVIOUS_RUNS:
            with self.subTest(name):
                code, files, err, reply = self.save(output, scores, previous_raw)
                self.assertEqual(code, 4)
                self.assertNotIn("fake-output.json", files)
                self.assertEqual(files["fake-output.raw.txt"], reply)
                for text in expected_err:
                    self.assertIn(text, err)
                errs.append(err)
        return errs

    def test_unparsable_reply_keeps_raw_reply_and_exits_4(self):
        for err in self.assert_failure_keeps_this_reply("抱歉，我無法輸出 JSON", FIXTURE["table"], ["JSON 解析失敗"]):
            self.assertNotIn("巢狀太深", err)   # 跟巢狀太深的訊息分得開

    # 巢狀太深的回應（#278）：解析與寫出 JSON 是遞迴的，哪一步先超過呼叫堆疊依 Python 版本而定；
    # 判定不會，因為陣列沒有 items 限制時不逐項檢查（#281）。回應用字串拼出深層陣列，不經過 json.dumps：測試自己序列化時就可能先超過呼叫堆疊。

    def test_too_deeply_nested_reply_keeps_raw_reply_and_exits_4(self):
        # 10 萬層：每個版本都在 json.loads 解析時丟 RecursionError，不是 JSONDecodeError
        reply = deep_reply(lambda output: output.__setitem__("metrics", DEEP_MARK), 100_000)
        self.assert_failure_keeps_this_reply(reply, FIXTURE["table"], ["巢狀太深"])

    def test_deep_but_valid_reply_never_ends_with_a_traceback(self):
        # 沒有型別限制的欄位與 schema 沒列出的鍵：深層資料都不影響判定，判定通過。接著寫出 JSON 時（json.dumps 加 indent）
        # 在 Python 3.12 超過呼叫堆疊，3.13 則寫得出來；3.11 預期在解析時就失敗。所以只要求兩者其一：
        # 通過就寫出 JSON、沒有 raw.txt；失敗就回傳 4、保留這次的原始回應。
        # 這個測試守的是 save_outputs 不帶著 traceback 結束；判定不沿著資料往下走（#281）由共用案例 output-cases.json 的 nest 守住。
        # 3.12 另外斷言回傳 4：CI 用 3.12 另跑一次，就是要測到「寫出 JSON 也要攔下」（#278）。之後的 3.12.x 若寫得出來，
        # 這裡會失敗提醒，不會默默變成沒測到。
        places = [
            ("沒有型別限制的 metrics.items[0].value", lambda output: output["metrics"]["items"][0].__setitem__("value", DEEP_MARK)),
            ("schema 沒列出的鍵", lambda output: output.__setitem__("extra_key", DEEP_MARK)),
        ]
        for place_name, place in places:
            reply = deep_reply(place, 2500)
            for run_name, previous_raw in self.PREVIOUS_RUNS:
                with self.subTest(f"{place_name}、{run_name}"):
                    code, files, err, _ = self.save(reply, FIXTURE["table"], previous_raw)
                    self.assertIn(code, (0, 4))
                    if sys.version_info[:2] == (3, 12):
                        self.assertEqual(code, 4, "3.12 預期在寫出 JSON 時超過呼叫堆疊")
                    if code == 0:
                        self.assertIn("fake-output.json", files)
                        self.assertNotIn("fake-output.raw.txt", sorted(files))
                    else:
                        self.assertNotIn("fake-output.json", files)
                        self.assertEqual(files["fake-output.raw.txt"], reply)
                        self.assertIn("巢狀太深", err)

    def test_unsupported_schema_rule_is_a_program_error_and_propagates(self):
        # schema 用了不支援的規則是程式錯誤，不是模型輸出的問題：不當成判定失敗（#278 只攔 RecursionError）
        schema = {**SCHEMA, "additionalProperties": False}
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaisesRegex(ValueError, "不支援的輸出 schema 規則"):
                aw.save_outputs(Path(tmp), "fake", "# 報告", json.dumps(BASE, ensure_ascii=False), schema, None)

    def test_inconsistent_and_mismatched_reports_only_the_inconsistency(self):
        output = apply_changes([[["exposure_priorities", "items", 1, "score"], 0]])
        expected = ["output_inconsistent", "$.exposure_priorities.items[1] 分數 0 依門檻應為 P4，卻標為 P1"]
        for err in self.assert_failure_keeps_this_reply(output, FIXTURE["table"], expected):
            self.assertNotIn("分數表", err)

    def test_schema_invalid_keeps_raw_reply_and_exits_4(self):
        output = apply_changes([[["exposure_priorities", "thresholds", "P1"], "60"]])
        expected = ["輸出不符合 output-schema.json（output_schema_invalid）：$.exposure_priorities.thresholds.P1 型別不合格"]
        self.assert_failure_keeps_this_reply(output, FIXTURE["table"], expected)

    def test_score_table_mismatch_prints_readable_messages(self):
        output = apply_changes([[["exposure_priorities", "items", 1, "score"], 70]])
        expected = ["（score_table_mismatch）：$.exposure_priorities.items[1] F009 腳本算的是 P1／72.5，輸出是 P1／70"]
        self.assert_failure_keeps_this_reply(output, FIXTURE["table"], expected)

    def test_passing_verdict_writes_json_leaves_no_raw_reply_and_exits_0(self):
        for table_name, scores in [("附分數表", FIXTURE["table"]), ("沒附分數表", None)]:
            for run_name, previous_raw in self.PREVIOUS_RUNS:
                with self.subTest(f"{table_name}、{run_name}"):
                    code, files, err, _ = self.save(BASE, scores, previous_raw)
                    self.assertEqual(code, 0)
                    self.assertEqual(json.loads(files["fake-output.json"]), BASE)
                    self.assertNotIn("fake-output.raw.txt", sorted(files))   # 失敗時只印檔名，不印整份 JSON
                    self.assertEqual(err, "")


if __name__ == "__main__":
    unittest.main()
