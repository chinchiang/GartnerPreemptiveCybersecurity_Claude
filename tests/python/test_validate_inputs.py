"""Claude 技能的 validate_inputs.py：改用分析工作流程核心（技能內 scripts/ 的建置複本）後，
輸出的行結構與結束碼 0（可分析）／1（有必要問題）／2（資料夾不存在）／3（scope 問題）維持不變，
檢查結果與核心一致，技能資料夾單獨安裝（不帶 skills/shared/）也能執行。

這裡只看腳本的外部行為：結束碼與 stdout。共用 scope 案例另見 test_scope_gate.py。
執行：python3 -m unittest discover -s tests/python
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SYNTHETIC = ROOT / "examples" / "synthetic-org"
SKILL_DIR = ROOT / "skills" / "claude" / "preemptive-exposure-analysis"
VALIDATE_INPUTS = SKILL_DIR / "scripts" / "validate_inputs.py"
sys.path.insert(0, str(ROOT / "skills" / "shared"))
import analysis_workflow as aw  # noqa: E402

INPUT_SCHEMA = json.loads((ROOT / "skills" / "shared" / "input-schema.json").read_text(encoding="utf-8"))
# 資料完整性問題：(檔案, 原文, 改成)
INTEGRITY_CASES = [
    ("assets.csv", "\nA02,", "\nA01,"),                       # 重複 asset_id
    ("vulnerabilities.csv", ",A01,", ",A99,"),                 # 指向不存在資產
    ("identities.csv", "A04;A05;A06", "A04;A98"),              # linked_assets 指向不存在資產
    ("topology.json", '"to": "A06"', '"to": "A97"'),           # 拓樸的邊指向不存在資產
    ("scope.json", '"A01",', ""),                              # 範圍外資產
]


class ValidateInputsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fresh()

    def fresh(self):
        """在同一個暫存目錄底下複製一份新的合成資料（subTest 之間互不影響，tearDown 一次清掉）。"""
        self.dir = Path(tempfile.mkdtemp(dir=self.tmp.name)) / "inputs"
        shutil.copytree(SYNTHETIC, self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, folder=None, script=VALIDATE_INPUTS):
        r = subprocess.run([sys.executable, str(script), str(folder or self.dir)], capture_output=True, text=True,
                           encoding="utf-8", cwd=self.tmp.name, env={**os.environ, "PYTHONUTF8": "1"})
        return r.returncode, r.stdout, r.stderr

    def edit(self, name, old, new):
        path = self.dir / name
        text = path.read_text(encoding="utf-8")
        self.assertIn(old, text, f"測試夾具找不到要改的內容：{old}")
        path.write_text(text.replace(old, new, 1), encoding="utf-8")

    def line(self, out, name):
        lines = [l for l in out.splitlines() if l.startswith(f"[{name}]")]
        self.assertTrue(lines, f"輸出沒有 [{name}] 這一行：{out}")
        return lines[0]

    def test_synthetic_data_output_lines(self):
        code, out, err = self.run_script()
        self.assertEqual(code, 0, out + err)
        self.assertEqual(out.splitlines(), [
            "[scope] 組織=Northwind Precision（虛構） 日期=2026-09-08 範圍內資產=12 主動測試授權=False 外部掃描授權=False",
            "[assets.csv] 筆數=12 缺欄位=無 異常=無",
            "[vulnerabilities.csv] 筆數=14 缺欄位=無 異常=無",
            "[identities.csv] 筆數=8 缺欄位=無 異常=無",
            "[misconfigurations.csv] 筆數=9 缺欄位=無 異常=無",
            "[controls.json] 控制項=8",
            "[threat-intel.json] 行為者=3 趨勢弱點類別=4",
            "[topology.json] crown_jewels=['A06', 'A07'] edges=19 指向不存在資產的邊=0",
            "[exposures.json] 筆數=7 未納入清冊的對外資產=['old-test.northwind-synthetic.example']",
            "結果：可以進行分析",
        ])

    def test_integrity_findings_come_from_the_core(self):
        for name, old, new in INTEGRITY_CASES:
            with self.subTest(case=name):
                self.fresh()
                self.edit(name, old, new)
                findings = aw.integrity_findings(aw.load_inputs(self.dir, frozenset(), INPUT_SCHEMA))
                self.assertTrue([f for f in findings if f[0] != "exposures.json"], "案例沒有觸發任何資料完整性問題")
                code, out, err = self.run_script()
                self.assertEqual(code, 0, out + err)  # 資料完整性問題只警告、不阻擋分析
                for file, message in findings:
                    if file.endswith(".csv"):
                        self.assertIn(message, self.line(out, file))
                bad_edges = sum(1 for f in findings if f[0] == "topology.json")
                self.assertIn(f"指向不存在資產的邊={bad_edges}", self.line(out, "topology.json"))

    def test_dangling_topology_edges_are_counted_per_edge(self):
        self.edit("topology.json", '"to": "A06"', '"to": "A97"')
        self.edit("topology.json", '"from": "A01"', '"from": "A96"')
        self.edit("topology.json", '"from": "A05", "to": "A06"', '"from": "A94", "to": "A93"')  # 兩端都不存在，仍算一條邊
        code, out, err = self.run_script()
        self.assertEqual(code, 0, out + err)
        self.assertIn("指向不存在資產的邊=3", self.line(out, "topology.json"))

    def test_out_of_scope_asset_uses_core_wording(self):
        self.edit("scope.json", '"A01",', "")
        code, out, err = self.run_script()
        self.assertIn("範圍外資產（分析時應排除）：A01", self.line(out, "assets.csv"))

    def test_runs_from_a_standalone_skill_folder(self):
        installed = Path(self.tmp.name) / ".claude" / "skills" / "preemptive-exposure-analysis"
        shutil.copytree(SKILL_DIR, installed, ignore=shutil.ignore_patterns("__pycache__"))
        code, out, err = self.run_script(script=installed / "scripts" / "validate_inputs.py")
        self.assertEqual(code, 0, out + err)
        self.assertIn("結果：可以進行分析", out)

    def test_non_object_scope_exits_3_without_traceback(self):
        for content in ("[]", '"scope"', "42", "null"):
            with self.subTest(scope=content):
                (self.dir / "scope.json").write_text(content, encoding="utf-8")
                code, out, err = self.run_script()
                self.assertEqual(code, 3, out + err)
                self.assertNotIn("Traceback", err)
                self.assertIn("scope.json 缺少必填欄位：organization、analysis_date", out)
                self.assertIn("停止分析", out)


    def test_missing_folder_exits_2(self):
        code, out, err = self.run_script(folder=Path(self.tmp.name) / "nope")
        self.assertEqual(code, 2)
        self.assertIn("找不到資料夾", out)

    def test_scope_missing_or_unparsable_exits_3(self):
        (self.dir / "scope.json").unlink()
        code, out, err = self.run_script()
        self.assertEqual(code, 3)
        self.assertIn("缺少 scope.json：無授權範圍，停止分析。必要欄位：organization、analysis_date、"
                      "authorized_scope.in_scope_assets、authorized_scope.active_testing_authorized、"
                      "authorized_scope.external_scanning_authorized、reporting.audience", out)
        (self.dir / "scope.json").write_text("{not json", encoding="utf-8")
        code, out, err = self.run_script()
        self.assertEqual(code, 3)
        self.assertIn("scope.json 無法解析", out)

    def test_scope_with_bom_is_accepted(self):
        path = self.dir / "scope.json"
        path.write_bytes(b"\xef\xbb\xbf" + path.read_bytes())
        code, out, err = self.run_script()
        self.assertEqual(code, 0, out + err)

    def test_required_file_problems_exit_1(self):
        header = (SYNTHETIC / "assets.csv").read_text(encoding="utf-8").splitlines()[0]
        cases = [
            ("缺少", lambda: (self.dir / "assets.csv").unlink(), "[assets.csv] 缺少（必要）"),
            ("缺欄位", lambda: self.edit("assets.csv", header, header.replace(",owner", ",owner_name")), "缺欄位=['owner']"),
            ("0 筆", lambda: (self.dir / "vulnerabilities.csv").write_text(
                (SYNTHETIC / "vulnerabilities.csv").read_text(encoding="utf-8").splitlines()[0] + "\n", encoding="utf-8"),
             "必要檔案 0 筆資料"),
            ("無法解析", lambda: (self.dir / "assets.csv").write_bytes(b"asset_id\n\xff\xfe\n"), "[assets.csv] 無法解析"),
        ]
        for label, mutate, expected in cases:
            with self.subTest(case=label):
                self.fresh()
                mutate()
                code, out, err = self.run_script()
                self.assertEqual(code, 1, out + err)
                self.assertIn(expected, out)
                self.assertIn("結果：有 1 個必要問題，請先修正", out)

    def test_optional_file_problems_only_warn(self):
        header = (SYNTHETIC / "identities.csv").read_text(encoding="utf-8").splitlines()[0]
        cases = [
            ("CSV 缺欄位", lambda: self.edit("identities.csv", header, header.replace("account", "acct")),
             "[identities.csv] 警告：建議檔缺欄位 ['account']", 1),
            ("CSV 無法解析", lambda: (self.dir / "identities.csv").write_bytes(b"identity_id\n\xff\n"), "[identities.csv] 無法解析", 1),
            ("JSON 無法解析", lambda: (self.dir / "controls.json").write_text("{", encoding="utf-8"),
             "[controls.json] 無法解析", 1),
            ("JSON 不是物件", lambda: (self.dir / "topology.json").write_text("[]", encoding="utf-8"),
             "[topology.json] 結構不是物件 → 視同缺少（建議）", 1),
            ("缺少", lambda: (self.dir / "threat-intel.json").unlink(), "[threat-intel.json] 缺少（建議）", 0),
        ]
        for label, mutate, expected, warnings in cases:
            with self.subTest(case=label):
                self.fresh()
                mutate()
                code, out, err = self.run_script()
                self.assertEqual(code, 0, out + err)
                self.assertIn(expected, out)
                if warnings:
                    self.assertIn(f"警告：{warnings} 項建議檔問題（不阻擋分析，但信心下修）", out)
                else:
                    self.assertNotIn("項建議檔問題", out)
                self.assertIn("結果：可以進行分析", out)

if __name__ == "__main__":
    unittest.main()
