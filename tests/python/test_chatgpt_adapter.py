"""ChatGPT 模型 adapter（skills/chatgpt/api-workflow.py）：OpenAI Responses API，
以假的 openai 模組測試，不連網、不需金鑰與 SDK。

執行：python3 -m unittest discover -s tests/python
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake_sdk import ROOT, blocked, fake_openai_responses, load_platform_script  # noqa: E402

VALID_OUTPUT = json.dumps({k: {} for k in json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]})


class ChatGptAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_platform_script("chatgpt")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "out"
        self.env = mock.patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False)
        self.env.start()
        os.environ.pop("OPENAI_MODEL", None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_main(self, *extra, modules=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(sys.modules, modules or {}), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = self.module.analysis_workflow.main(self.module.ChatGptAdapter(), ["--output-dir", str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def test_responses_api_two_stages(self):
        openai, record = fake_openai_responses(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": None, "base_url": None}])  # 照舊由 SDK 讀 OPENAI_API_KEY／OPENAI_BASE_URL
        report_call, json_call = record["calls"]
        for call in (report_call, json_call):
            self.assertEqual(set(call), {"model", "instructions", "input"})  # 不傳 tools、temperature
            self.assertEqual(call["model"], "gpt-6-astra")
            self.assertIn("7. 平臺備註（ChatGPT）", call["instructions"])  # system 放在 instructions
        self.assertEqual([m["role"] for m in report_call["input"]], ["user"])
        self.assertNotIn("output-schema.json", report_call["input"][0]["content"])  # schema 放在第二段
        self.assertEqual([m["role"] for m in json_call["input"]], ["user", "assistant", "user"])
        self.assertEqual(json_call["input"][1]["content"], "# 報告")
        self.assertIn("output-schema.json", json_call["input"][-1]["content"])
        self.assertIn("ChatGPT API（Responses API）/ gpt-6-astra /", json_call["input"][-1]["content"])  # generated_by
        self.assertEqual((self.out / "chatgpt-report.md").read_text(encoding="utf-8"), "# 報告")
        self.assertTrue((self.out / "chatgpt-output.json").exists())

    def test_text_is_collected_from_output_items_when_output_text_is_empty(self):
        part = lambda kind, text: types.SimpleNamespace(type=kind, text=text)  # noqa: E731
        response = types.SimpleNamespace(output_text="", output=[
            types.SimpleNamespace(type="reasoning", content=None),
            types.SimpleNamespace(type="message", content=[part("output_text", "# 報告"), part("refusal", "不該出現"),
                                                           part("text", "第二段")]),
        ])
        openai, record = fake_openai_responses([response, VALID_OUTPUT])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual((self.out / "chatgpt-report.md").read_text(encoding="utf-8"), "# 報告\n第二段")
        self.assertEqual(record["calls"][1]["input"][1]["content"], "# 報告\n第二段")

    def test_reply_without_any_text_exits_1(self):
        for stage, replies in (("report", [types.SimpleNamespace(output_text=None, output=[])]),
                               ("json", ["# 報告", types.SimpleNamespace(output_text="", output=None)])):
            with self.subTest(stage=stage):
                openai, record = fake_openai_responses(replies)
                code, out, err = self.run_main(modules={"openai": openai})
                self.assertEqual(code, 1)
                self.assertIn("API 回覆沒有文字內容", err)
                self.assertFalse((self.out / "chatgpt-output.json").exists())

    def test_missing_api_key_exits_1_before_creating_client(self):
        os.environ.pop("OPENAI_API_KEY")
        openai, record = fake_openai_responses([])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 1)
        self.assertIn("未設定環境變數 OPENAI_API_KEY", err)
        self.assertEqual(record["clients"], [])

    def test_missing_sdk_exits_1_with_install_hint(self):
        with blocked("openai"):
            code, out, err = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("未安裝 openai SDK", err)
        self.assertIn("pip install -r skills/chatgpt/requirements.txt", err)

    def test_model_from_env_and_flag(self):
        os.environ["OPENAI_MODEL"] = "example-env-model"
        for extra, expected in (((), "example-env-model"), (("--model", "example-flag-model"), "example-flag-model")):
            with self.subTest(args=extra):
                openai, record = fake_openai_responses(["# 報告", VALID_OUTPUT])
                code, out, err = self.run_main(*extra, modules={"openai": openai})
                self.assertEqual(code, 0, err)
                self.assertEqual([c["model"] for c in record["calls"]], [expected, expected])
                self.assertIn(f"ChatGPT API（Responses API）/ {expected} /", record["calls"][1]["input"][-1]["content"])

    def test_json_parse_failure_exits_4_and_keeps_raw_reply(self):
        openai, record = fake_openai_responses(["# 報告", "抱歉，這次無法輸出 JSON。"])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 4)  # 原本是 2，且沒有 raw.txt
        self.assertEqual((self.out / "chatgpt-output.raw.txt").read_text(encoding="utf-8"), "抱歉，這次無法輸出 JSON。")
        self.assertFalse((self.out / "chatgpt-output.json").exists())
        self.assertTrue((self.out / "chatgpt-report.md").exists())

    def test_output_check_problems_only_warn_and_exit_0(self):
        openai, record = fake_openai_responses(["# 報告", json.dumps({"meta": {}})])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 0)  # 原本是 3；完整判定交給 scripts/check-acceptance.mjs
        self.assertIn("exposure_priorities", err)
        self.assertTrue((self.out / "chatgpt-output.json").exists())

    def test_dry_run_imports_no_sdk_and_prints_full_prompts(self):
        with blocked("openai"):
            code, out, err = self.run_main("--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（ChatGPT）", out)
        topology = (ROOT / "examples" / "synthetic-org" / "topology.json").read_text(encoding="utf-8").strip()
        self.assertIn(topology, out)
        self.assertIn("output-schema.json", out)  # 第 2 段提示詞
        self.assertNotIn("已載入檔案與筆數", out)  # 資訊訊息在 stderr
        self.assertIn("已載入檔案與筆數", err)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
