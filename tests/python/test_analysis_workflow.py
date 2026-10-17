"""分析工作流程核心（skills/shared/analysis_workflow.py）的單元測試：標準函式庫 unittest，不連網、不需 SDK。

執行：python3 -m unittest discover -s tests/python
"""
import contextlib
import io
import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "skills" / "shared"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import analysis_workflow as aw  # noqa: E402
from test_scope_gate import CASES, apply_case  # noqa: E402

INPUT_SCHEMA = json.loads((ROOT / "skills" / "shared" / "input-schema.json").read_text(encoding="utf-8"))
SYNTHETIC_SCOPE = json.loads((ROOT / "examples" / "synthetic-org" / "scope.json").read_text(encoding="utf-8"))


class ScopeGateFromSchemaTest(unittest.TestCase):
    def test_follows_shared_cases(self):
        for case in CASES:
            with self.subTest(case=case["name"]):
                self.assertEqual(aw.scope_problems(apply_case(SYNTHETIC_SCOPE, case), INPUT_SCHEMA), case["problems"])


class ScopeGateKeywordTest(unittest.TestCase):
    """schema 用到不認得的關鍵字就丟出錯誤、點名該關鍵字；註記關鍵字放行（與 assets/scope-gate.js 同一組，見 docs/adr/0004）。"""

    def schema_with(self, **extra):
        schema = copy.deepcopy(INPUT_SCHEMA)
        schema["properties"]["scope"]["properties"]["organization"].update(extra)
        return schema

    def test_unknown_keyword_raises_and_names_it(self):
        for extra, keyword in (({"maxLength": 3}, "maxLength"), ({"enum": ["x"]}, "enum")):
            with self.subTest(keyword=keyword):
                with self.assertRaisesRegex(ValueError, keyword):
                    aw.scope_problems(SYNTHETIC_SCOPE, self.schema_with(**extra))

    def test_unsupported_format_raises(self):
        schema = copy.deepcopy(INPUT_SCHEMA)
        schema["properties"]["scope"]["properties"]["analysis_date"]["format"] = "date-time"
        with self.assertRaisesRegex(ValueError, "format"):
            aw.scope_problems(SYNTHETIC_SCOPE, schema)

    def test_annotation_keywords_are_allowed(self):
        schema = self.schema_with(default="x", description="組織名稱", title="組織", **{"$comment": "註記"})
        self.assertEqual(aw.scope_problems(SYNTHETIC_SCOPE, schema), [])


class ScopeRuleNoteTest(unittest.TestCase):
    def test_rule_note_is_derived_from_the_schema(self):
        # 與 assets/scope-gate.js 的 scopeRuleNote() 斷言同一個字面字串（見 docs/adr/0005）；不加括號，括號由中止訊息自己加
        self.assertEqual(aw.scope_rule_note(INPUT_SCHEMA),
                         "organization 須含非空白字元；analysis_date 須為 YYYY-MM-DD 的有效日期；"
                         "in_scope_assets、audience 須為非空陣列，且每項為非空白字串；"
                         "active_testing_authorized、external_scanning_authorized 須為布林值")

    def schema_with(self, path, node):
        """母本 schema 的深拷貝，把 scope 底下 path 那個必填欄位的節點換掉。"""
        schema = copy.deepcopy(INPUT_SCHEMA)
        parent = schema["properties"]["scope"]
        *parents, key = path.split(".")
        for name in parents:
            parent = parent["properties"][name]
        parent["properties"][key] = node
        return schema

    def test_undescribable_rule_raises_and_names_field_and_keyword(self):
        cases = [
            ("organization", {"type": "string", "minLength": 1, "pattern": "^[A-Z]"}, ("organization", "pattern")),
            ("organization", {"type": "string", "minLength": 3}, ("organization", "minLength")),
            ("analysis_date", {"type": "string", "format": "date", "pattern": "^20"}, ("analysis_date", "pattern")),
            ("organization", {"type": "integer"}, ("organization", "type")),
            ("organization", {"type": "object"}, ("organization", "type")),
            ("organization", {"type": "string", "minLength": 1, "format": "email"}, ("organization", "format")),
            ("organization", {"type": "string", "minLength": 1, "enum": ["Northwind"]}, ("organization", "enum")),
            ("organization", {"type": "string", "maxLength": 3}, ("organization", "maxLength")),
            ("authorized_scope.in_scope_assets", {"type": "array", "minItems": 2, "items": {"type": "string"}},
             ("authorized_scope.in_scope_assets", "minItems")),
            ("authorized_scope.in_scope_assets", {"type": "array", "minItems": 1, "items": {"type": "boolean"}},
             ("authorized_scope.in_scope_assets", "items")),
            ("authorized_scope.in_scope_assets", {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 2}},
             ("authorized_scope.in_scope_assets", "minLength")),
        ]
        for path, node, names in cases:
            with self.subTest(node=node):
                with self.assertRaises(ValueError) as ctx:
                    aw.scope_rule_note(self.schema_with(path, node))
                for name in names:
                    self.assertIn(name, str(ctx.exception))

    def test_annotation_keywords_do_not_change_the_rule_note(self):
        node = dict(INPUT_SCHEMA["properties"]["scope"]["properties"]["organization"],
                    default="x", description="組織名稱", title="組織", **{"$comment": "註記"})
        self.assertEqual(aw.scope_rule_note(self.schema_with("organization", node)), aw.scope_rule_note(INPUT_SCHEMA))


class InputLoadingTest(unittest.TestCase):
    """載入 9 個輸入檔：BOM、授權範圍中止、--exclude、解析失敗視為缺漏、預先計算筆數。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "inputs"
        shutil.copytree(ROOT / "examples" / "synthetic-org", self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def load(self, exclude=()):
        return aw.load_inputs(self.dir, frozenset(exclude), INPUT_SCHEMA)

    def test_synthetic_data_loads_with_record_counts(self):
        inputs = self.load()
        counts = {f["name"]: f["records"] for f in inputs.files}
        self.assertEqual(counts["assets.csv"], 12)
        self.assertEqual(counts["topology.json"], 19)
        self.assertEqual(inputs.missing, [])

    def test_utf8_bom_is_accepted(self):
        scope = (self.dir / "scope.json").read_text(encoding="utf-8")
        (self.dir / "scope.json").write_bytes("\ufeff".encode("utf-8") + scope.encode("utf-8"))
        self.assertEqual(self.load().scope["organization"], SYNTHETIC_SCOPE["organization"])

    def test_missing_or_excluded_scope_aborts_with_exit_1(self):
        for setup, exclude in ((lambda: None, ("scope",)), (lambda: (self.dir / "scope.json").unlink(), ())):
            with self.subTest(exclude=exclude):
                setup()
                with self.assertRaises(aw.Abort) as ctx:
                    self.load(exclude)
                self.assertEqual(ctx.exception.exit_code, 1)
                self.assertIn("scope.json", str(ctx.exception))

    def test_invalid_scope_aborts_and_lists_fields(self):
        scope = dict(SYNTHETIC_SCOPE, authorized_scope=dict(SYNTHETIC_SCOPE["authorized_scope"], in_scope_assets=[]))
        (self.dir / "scope.json").write_text(json.dumps(scope), encoding="utf-8")
        with self.assertRaises(aw.Abort) as ctx:
            self.load()
        self.assertIn("scope.json", str(ctx.exception))
        self.assertIn("authorized_scope.in_scope_assets", str(ctx.exception))

    def test_invalid_scope_abort_message_ends_with_the_rule_note_in_parentheses(self):
        (self.dir / "scope.json").write_text(json.dumps(dict(SYNTHETIC_SCOPE, analysis_date="2026-02-30")), encoding="utf-8")
        with self.assertRaises(aw.Abort) as ctx:
            self.load()
        self.assertEqual(str(ctx.exception),
                         "[中止] scope.json 缺少或不合格的必填欄位：analysis_date"
                         "（organization 須含非空白字元；analysis_date 須為 YYYY-MM-DD 的有效日期；"
                         "in_scope_assets、audience 須為非空陣列，且每項為非空白字串；"
                         "active_testing_authorized、external_scanning_authorized 須為布林值）")

    def test_excluded_category_is_missing(self):
        inputs = self.load(exclude=("threat_intel",))
        self.assertNotIn("threat-intel.json", [f["name"] for f in inputs.files])
        self.assertTrue(any("threat-intel.json" in m and "--exclude" in m for m in inputs.missing))

    def test_unparsable_input_is_treated_as_missing_and_not_sent(self):
        (self.dir / "controls.json").write_text("{ 這不是 JSON", encoding="utf-8")
        inputs = self.load()
        self.assertNotIn("controls.json", [f["name"] for f in inputs.files])
        self.assertTrue(any("controls.json" in m and "無法解析" in m for m in inputs.missing))


class InputChecksTest(unittest.TestCase):
    """腳本預檢結果（資料完整性與 schema 必填欄位）：只警告、不中止。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fresh()

    def tearDown(self):
        self.tmp.cleanup()

    def fresh(self):
        """在同一個暫存目錄底下複製一份新的合成資料（subTest 之間互不影響，tearDown 一次清掉）。"""
        self.dir = Path(tempfile.mkdtemp(dir=self.tmp.name)) / "inputs"
        shutil.copytree(ROOT / "examples" / "synthetic-org", self.dir)

    def edit(self, name, old, new):
        path = self.dir / name
        text = path.read_text(encoding="utf-8")
        self.assertIn(old, text, f"測試夾具找不到要改的內容：{old}")
        path.write_text(text.replace(old, new, 1), encoding="utf-8")

    def warnings(self):
        return "\n".join(aw.load_inputs(self.dir, frozenset(), INPUT_SCHEMA).warnings)

    def test_synthetic_data_has_only_the_known_unlisted_external_host(self):
        warnings = aw.load_inputs(self.dir, frozenset(), INPUT_SCHEMA).warnings
        self.assertEqual(len(warnings), 1, warnings)
        self.assertIn("old-test.northwind-synthetic.example", warnings[0])

    def test_each_integrity_problem_is_reported(self):
        cases = [
            ("assets.csv", "\nA02,", "\nA01,", "重複 asset_id"),
            ("vulnerabilities.csv", ",A01,", ",A99,", "指向不存在資產 A99"),
            ("identities.csv", "A04;A05;A06", "A04;A98", "指向不存在資產 A98"),
            ("topology.json", '"to": "A06"', '"to": "A97"', "A97"),
            ("topology.json", '"from": "A01"', '"from": "A96"', "A96"),
        ]
        for name, old, new, expected in cases:
            with self.subTest(name=name, expected=expected):
                self.fresh()
                self.edit(name, old, new)
                self.assertIn(expected, self.warnings())

    def test_missing_asset_id_column_only_reports_the_column(self):
        header = (self.dir / "assets.csv").read_text(encoding="utf-8").splitlines()[0]
        self.edit("assets.csv", header, header.replace("asset_id,", "id,", 1))
        out = self.warnings()
        self.assertIn("assets.csv：缺少必填欄位 asset_id", out)
        self.assertNotIn("重複 asset_id", out)       # 沒有 asset_id 不等於全部重複
        self.assertNotIn("指向不存在資產", out)      # 也不能把每個參照都當成懸空

    def test_value_ranges_are_checked(self):
        assets = (self.dir / "assets.csv").read_text(encoding="utf-8").splitlines()
        header = assets[0].split(",")
        row = assets[1].split(",")
        row[header.index("business_criticality")] = "9"
        assets[1] = ",".join(row)
        (self.dir / "assets.csv").write_text("\n".join(assets) + "\n", encoding="utf-8")
        vulns = (self.dir / "vulnerabilities.csv").read_text(encoding="utf-8").splitlines()
        vh = vulns[0].split(",")
        vr = vulns[1].split(",")
        vr[vh.index("cvss_base")] = "11"
        vulns[1] = ",".join(vr)
        (self.dir / "vulnerabilities.csv").write_text("\n".join(vulns) + "\n", encoding="utf-8")
        out = self.warnings()
        self.assertIn("business_criticality 超出 1–5", out)
        self.assertIn("cvss_base 超出 0–10", out)

    def test_asset_outside_authorized_scope_is_reported(self):
        scope = dict(SYNTHETIC_SCOPE, authorized_scope=dict(SYNTHETIC_SCOPE["authorized_scope"],
                                                            in_scope_assets=SYNTHETIC_SCOPE["authorized_scope"]["in_scope_assets"][1:]))
        (self.dir / "scope.json").write_text(json.dumps(scope, ensure_ascii=False), encoding="utf-8")
        self.assertIn("範圍外資產", self.warnings())

    def test_required_columns_come_from_schema(self):
        header = (self.dir / "assets.csv").read_text(encoding="utf-8").splitlines()[0]
        self.edit("assets.csv", header, header.replace(",owner", ",owner_name"))
        self.assertIn("owner", self.warnings())

    def test_short_or_malformed_rows_only_warn(self):
        cases = [
            ("assets.csv", lambda t: t + "A99,short-row\n", "A99"),
            ("vulnerabilities.csv", lambda t: t + "F99,A01\n", "F99"),
            ("topology.json", lambda t: t.replace('"edges": [', '"edges": ["not-an-edge", ', 1), "topology.json"),
        ]
        for name, mutate, expected in cases:
            with self.subTest(name=name):
                self.fresh()
                path = self.dir / name
                path.write_text(mutate(path.read_text(encoding="utf-8")), encoding="utf-8")
                self.assertIn(expected, self.warnings())

    def test_header_only_required_file_reports_zero_rows_and_missing_columns(self):
        header = (self.dir / "assets.csv").read_text(encoding="utf-8").splitlines()[0]
        (self.dir / "assets.csv").write_text(header.replace(",owner", ",owner_name") + "\n", encoding="utf-8")
        out = self.warnings()
        self.assertIn("assets.csv：必要檔案 0 筆資料", out)
        self.assertIn("assets.csv：缺少必填欄位 owner", out)

    def test_utf8_bom_in_a_csv_input_does_not_hide_its_first_column(self):
        raw = (self.dir / "assets.csv").read_text(encoding="utf-8")
        (self.dir / "assets.csv").write_bytes("\ufeff".encode("utf-8") + raw.encode("utf-8"))
        inputs = aw.load_inputs(self.dir, frozenset(), INPUT_SCHEMA)
        assets = next(f for f in inputs.files if f["name"] == "assets.csv")
        self.assertEqual(assets["columns"][0], "asset_id")
        self.assertNotIn("assets.csv：缺少必填欄位", "\n".join(inputs.warnings))

    def test_required_fields_of_object_inputs_come_from_schema(self):
        self.edit("controls.json", '"maturity"', '"maturity_level"')
        self.assertIn("controls.json：controls 有", self.warnings())

    def test_missing_required_file_is_a_warning_not_an_abort(self):
        (self.dir / "assets.csv").unlink()
        out = self.warnings()
        self.assertIn("assets.csv", out)
        self.assertIn("必要", out)


class PromptTest(unittest.TestCase):
    """兩段式對話的提示詞組成（核心提示詞＋平臺備註、第一段報告、第二段 JSON）。"""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name) / "inputs"
        shutil.copytree(ROOT / "examples" / "synthetic-org", cls.dir)
        cls.inputs = aw.load_inputs(cls.dir, frozenset({"threat_intel"}), INPUT_SCHEMA)
        cls.report_prompt = aw.build_report_prompt(cls.inputs)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_report_prompt_carries_files_counts_missing_and_checks(self):
        p = self.report_prompt
        self.assertIn("### assets.csv — I2 資產清冊 + 業務重要性（腳本預先計算筆數：12）", p)
        self.assertIn("A01,vpn-gw-01", p)
        self.assertIn("【本次未提供的輸入】", p)
        self.assertIn("threat-intel.json", p)
        self.assertIn("【腳本預檢結果】", p)
        self.assertIn("old-test.northwind-synthetic.example", p)

    def test_report_prompt_omits_local_path_step_list_and_disclaimer(self):
        p = self.report_prompt
        self.assertNotIn(str(self.dir), p)
        self.assertNotIn(self.tmp.name, p)
        self.assertNotIn("S1–S8", p)
        self.assertNotIn("未驗證實際曝險", p)

    def test_json_prompt_carries_schema_generated_by_and_the_word_json(self):
        schema = (ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8")
        p = aw.build_json_prompt(schema, "DeepSeek API / deepseek-v4-pro / api-workflow.py")
        self.assertIn(schema.strip(), p)
        self.assertIn("DeepSeek API / deepseek-v4-pro / api-workflow.py", p)
        self.assertIn("單一 JSON 物件（json）", p)  # 部分平臺的 JSON 模式要求提示詞裡出現小寫 json

    def test_system_prompt_is_core_prompt_plus_platform_note(self):
        md = "---\ntitle: 核心\n---\n\n```text\n你是先制型曝險分析助理。\n```\n"
        self.assertEqual(aw.build_system_prompt(md, "7. 平臺備註\n- 測試。"), "你是先制型曝險分析助理。\n\n7. 平臺備註\n- 測試。")

    def test_missing_core_prompt_block_aborts(self):
        with self.assertRaises(aw.Abort) as ctx:
            aw.build_system_prompt("# 沒有 text 區塊\n", "")
        self.assertIn("core-prompt.md", str(ctx.exception))


class FakeAdapter:
    """測試用的模型 adapter：記錄每一段收到的訊息，依序回傳預先寫好的回覆。"""
    platform = "fake"
    display_name = "Fake"
    model_env = "FAKE_MODEL"
    default_model = "fake-1"
    platform_note = "7. 平臺備註（Fake）\n- 測試用。"

    def __init__(self, replies, json_mode=False, error=None):
        self.replies = list(replies)
        self.calls = []
        self.json_mode_supported = json_mode
        self.error = error

    def add_arguments(self, parser):
        parser.add_argument("--fake-flag", action="store_true")

    def describe(self, args):
        return ["端點：fake://"]

    def generated_by(self, args):
        return f"Fake API / {args.model} / api-workflow.py"

    def supports_json_mode(self, args):
        return self.json_mode_supported

    def send(self, messages, stage, args, json_mode):
        self.calls.append((stage, [dict(m) for m in messages]))
        self.json_modes = getattr(self, "json_modes", []) + [json_mode]
        if self.error:
            raise self.error
        return self.replies.pop(0)


VALID_OUTPUT = {k: {} for k in json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]}


class WorkflowRunTest(unittest.TestCase):
    """透過核心的 main(adapter, argv) 跑完整的分析工作流程：兩段式對話、存檔、結束碼、dry-run。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "out"

    def tearDown(self):
        self.tmp.cleanup()

    def run_main(self, adapter, *extra):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = aw.main(adapter, ["--output-dir", str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def test_two_stage_conversation(self):
        adapter = FakeAdapter(["# 報告", json.dumps(VALID_OUTPUT)])
        code, out, err = self.run_main(adapter)
        self.assertEqual(code, 0, err)
        (s1, m1), (s2, m2) = adapter.calls
        self.assertEqual((s1, s2), ("report", "json"))
        self.assertEqual([m["role"] for m in m1], ["system", "user"])
        self.assertIn("7. 平臺備註（Fake）", m1[0]["content"])
        self.assertEqual([m["role"] for m in m2], ["system", "user", "assistant", "user"])
        self.assertEqual(m2[2]["content"], "# 報告")
        self.assertIn("output-schema.json", m2[3]["content"])
        self.assertIn("Fake API / fake-1 / api-workflow.py", m2[3]["content"])

    def test_json_mode_is_requested_only_in_the_json_stage_when_supported(self):
        for supported, expected in ((True, [False, True]), (False, [False, False])):
            with self.subTest(supported=supported):
                adapter = FakeAdapter(["# 報告", json.dumps(VALID_OUTPUT)], json_mode=supported)
                code, out, err = self.run_main(adapter)
                self.assertEqual(code, 0, err)
                self.assertEqual(adapter.json_modes, expected)

    def test_outputs_are_written_and_paths_printed_to_stdout(self):
        code, out, err = self.run_main(FakeAdapter(["# 報告", "```json\n" + json.dumps(VALID_OUTPUT) + "\n```"]))
        self.assertEqual(code, 0, err)
        self.assertEqual((self.out / "fake-report.md").read_text(encoding="utf-8"), "# 報告")
        self.assertEqual(json.loads((self.out / "fake-output.json").read_text(encoding="utf-8")), VALID_OUTPUT)
        self.assertIn(str(self.out / "fake-report.md"), out)
        self.assertIn(str(self.out / "fake-output.json"), out)
        self.assertNotIn("assets.csv", out)  # 筆數等資訊在 stderr
        self.assertIn("assets.csv", err)

    def test_unparsable_json_exits_4_and_keeps_raw_reply(self):
        code, out, err = self.run_main(FakeAdapter(["# 報告", "抱歉，我無法輸出 JSON"]))
        self.assertEqual(code, 4)
        self.assertEqual((self.out / "fake-output.raw.txt").read_text(encoding="utf-8"), "抱歉，我無法輸出 JSON")
        self.assertFalse((self.out / "fake-output.json").exists())

    def test_missing_required_keys_only_warn(self):
        partial = dict(VALID_OUTPUT)
        partial.pop("metrics")
        code, out, err = self.run_main(FakeAdapter(["# 報告", json.dumps(partial)]))
        self.assertEqual(code, 0)
        self.assertIn("metrics", err)

    def test_scope_problem_exits_1_before_calling_the_model(self):
        adapter = FakeAdapter([])
        code, out, err = self.run_main(adapter, "--exclude", "scope")
        self.assertEqual(code, 1)
        self.assertIn("scope.json", err)
        self.assertEqual(adapter.calls, [])

    def test_dry_run_prints_both_stages_and_writes_nothing(self):
        adapter = FakeAdapter([])
        code, out, err = self.run_main(adapter, "--dry-run")
        self.assertEqual(code, 0, err)
        self.assertEqual(adapter.calls, [])
        self.assertFalse(self.out.exists())
        self.assertIn("7. 平臺備註（Fake）", out)
        self.assertIn("### assets.csv", out)
        self.assertIn("output-schema.json", out)
        self.assertIn("端點：fake://", err)

    def test_dry_run_prints_full_prompts_and_keeps_info_out_of_stdout(self):
        inputs = aw.load_inputs(ROOT / "examples" / "synthetic-org", frozenset(), INPUT_SCHEMA)
        code, out, err = self.run_main(FakeAdapter([]), "--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn(aw.build_report_prompt(inputs), out)  # 完整、不截斷
        for tag in ("[資訊]", "[預檢]", "[DRY-RUN]"):
            self.assertNotIn(tag, out)
            self.assertIn(tag, err)

    def test_invalid_scope_exits_1_before_calling_the_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            inputs = Path(tmp) / "inputs"
            shutil.copytree(ROOT / "examples" / "synthetic-org", inputs)
            (inputs / "scope.json").write_text(json.dumps(dict(SYNTHETIC_SCOPE, organization="")), encoding="utf-8")
            adapter = FakeAdapter([])
            code, out, err = self.run_main(adapter, "--input-dir", str(inputs))
        self.assertEqual(code, 1)
        self.assertIn("organization", err)
        self.assertEqual(adapter.calls, [])

    def test_api_error_exits_1_without_traceback(self):
        code, out, err = self.run_main(FakeAdapter([], error=ConnectionError("連線逾時")))
        self.assertEqual(code, 1)
        self.assertIn("連線逾時", err)
        self.assertNotIn("Traceback", err)
        self.assertFalse(self.out.exists())

    def test_shared_files_are_read_with_bom_and_a_missing_one_exits_1(self):
        names = ("input-schema.json", "output-schema.json", "core-prompt.md")
        for missing in (None, *names):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as tmp:
                shared = Path(tmp)
                for name in names:
                    if name != missing:
                        raw = (ROOT / "skills" / "shared" / name).read_text(encoding="utf-8")
                        (shared / name).write_bytes("\ufeff".encode("utf-8") + raw.encode("utf-8"))
                with mock.patch.object(aw, "SHARED_DIR", shared):
                    code, out, err = self.run_main(FakeAdapter([]), "--dry-run")
                if missing is None:
                    self.assertEqual(code, 0, err)
                else:
                    self.assertEqual(code, 1, err)
                    self.assertIn(f"找不到共用檔案：{shared / missing}", err)

    def test_adapter_arguments_are_added_to_the_cli(self):
        code, out, err = self.run_main(FakeAdapter([]), "--dry-run", "--fake-flag")
        self.assertEqual(code, 0, err)


if __name__ == "__main__":
    unittest.main()
