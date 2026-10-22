"""Gemini 模型 adapter（skills/gemini/api-workflow.py）：google-genai 的 Interactions API（預設）與 --compat 的 OpenAI 相容端點兩種呼叫方式，
以假的 google.genai／openai 模組測試，不連網、不需金鑰與 SDK。

執行：python3 -m unittest discover -s tests/python
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake_sdk import ROOT, blocked, fake_google_genai, fake_openai, load_platform_script  # noqa: E402

VALID_OUTPUT = json.dumps({k: {} for k in json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]})
JSON_MIME = {"type": "text", "mime_type": "application/json"}


class GeminiAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_platform_script("gemini")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "out"
        self.env = mock.patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False)
        self.env.start()
        for name in ("GEMINI_MODEL", "GEMINI_COMPAT_BASE_URL", "GOOGLE_API_KEY"):
            os.environ.pop(name, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_main(self, *extra, modules=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(sys.modules, modules or {}), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = self.module.analysis_workflow.main(self.module.GeminiAdapter(), ["--output-dir", str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def test_interactions_two_stages_continue_with_previous_interaction_id(self):
        modules, record = fake_google_genai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main(modules=modules)
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key"}])
        report_call, json_call = record["calls"]
        # 第 1 段：system_instruction 是核心提示詞＋平臺備註，input 是報告的提示詞；不延續任何對話、不要求 JSON、不設 temperature
        self.assertEqual(set(report_call), {"model", "system_instruction", "input", "generation_config"})
        self.assertEqual(report_call["model"], "gemini-3.8-flash")
        self.assertIn("7. 平臺備註（Gemini）", report_call["system_instruction"])
        self.assertEqual(report_call["generation_config"], {"max_output_tokens": 16000})
        self.assertNotIn("output-schema.json", report_call["input"])
        # 第 2 段：延續第 1 段（previous_interaction_id 是它回傳的 id），input 只有 JSON 提示詞；system_instruction 再帶一次
        self.assertEqual(json_call["previous_interaction_id"], "interaction-1")
        self.assertIn("output-schema.json", json_call["input"])
        self.assertNotIn("# 報告", json_call["input"])
        self.assertIn("Gemini API（google-genai）/ gemini-3.8-flash /", json_call["input"])  # generated_by
        self.assertEqual(json_call["system_instruction"], report_call["system_instruction"])
        self.assertEqual(json_call["response_format"], JSON_MIME)
        self.assertEqual((self.out / "gemini-report.md").read_text(encoding="utf-8"), "# 報告")
        self.assertTrue((self.out / "gemini-output.json").exists())

    def test_rejected_json_mode_is_retried_once_without_response_format(self):
        modules, record = fake_google_genai(["# 報告", VALID_OUTPUT], reject_response_format=True)
        code, out, err = self.run_main(modules=modules)
        self.assertEqual(code, 0, err)
        self.assertEqual(len(record["calls"]), 3)
        rejected, retried = record["calls"][1:]
        self.assertEqual(rejected["response_format"], JSON_MIME)
        self.assertEqual({**retried, "response_format": JSON_MIME}, rejected)   # 只拿掉 response_format，其餘參數照舊
        self.assertIn("[警告] JSON 模式被端點拒絕", err)
        self.assertTrue((self.out / "gemini-output.json").exists())

    def test_no_json_mode_sends_no_response_format(self):
        modules, record = fake_google_genai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--no-json-mode", modules=modules)
        self.assertEqual(code, 0, err)
        self.assertEqual(len(record["calls"]), 2)
        self.assertNotIn("response_format", record["calls"][1])
        self.assertEqual(record["calls"][1]["previous_interaction_id"], "interaction-1")

    def test_compat_two_stages_send_full_messages_and_json_object(self):
        openai, record = fake_openai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--compat", modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/"}])
        report_call, json_call = record["calls"]
        self.assertEqual(set(report_call), {"model", "messages", "max_tokens"})   # 第 1 段不要求 JSON、不設 temperature
        self.assertEqual((report_call["model"], report_call["max_tokens"]), ("gemini-3.8-flash", 16000))
        self.assertEqual([m["role"] for m in report_call["messages"]], ["system", "user"])
        self.assertIn("7. 平臺備註（Gemini）", report_call["messages"][0]["content"])
        self.assertEqual([m["role"] for m in json_call["messages"]], ["system", "user", "assistant", "user"])
        self.assertEqual(json_call["messages"][2]["content"], "# 報告")
        self.assertIn("Gemini API（OpenAI 相容端點）/ gemini-3.8-flash /", json_call["messages"][-1]["content"])  # generated_by
        self.assertEqual(json_call["response_format"], {"type": "json_object"})
        self.assertTrue((self.out / "gemini-output.json").exists())

    def test_compat_base_url_from_env_and_rejected_json_mode_is_retried_once(self):
        os.environ["GEMINI_COMPAT_BASE_URL"] = "https://example.invalid/v1"
        openai, record = fake_openai(["# 報告", VALID_OUTPUT], reject_response_format=True)
        code, out, err = self.run_main("--compat", modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"][0]["base_url"], "https://example.invalid/v1")
        self.assertEqual(len(record["calls"]), 3)
        self.assertEqual(record["calls"][1]["response_format"], {"type": "json_object"})
        self.assertNotIn("response_format", record["calls"][2])
        self.assertIn("[警告] JSON 模式被端點拒絕", err)

    def test_missing_gemini_api_key_exits_1_even_with_google_api_key(self):
        os.environ.pop("GEMINI_API_KEY")
        for env in ({}, {"GOOGLE_API_KEY": "google-key"}):   # SDK 自己會讀 GOOGLE_API_KEY，腳本不讓它默默換掉金鑰
            for extra in ((), ("--compat",)):
                with self.subTest(env=env, args=extra), mock.patch.dict(os.environ, env):
                    modules, genai_record = fake_google_genai([])
                    openai, openai_record = fake_openai([])
                    code, out, err = self.run_main(*extra, modules={**modules, "openai": openai})
                    self.assertEqual(code, 1)
                    self.assertIn("GEMINI_API_KEY", err)
                    self.assertEqual((genai_record["clients"], openai_record["clients"]), ([], []))

    def test_missing_sdk_exits_1_with_install_hint_for_each_mode(self):
        for blocked_modules, extra, sdk in ((("google", "google.genai"), (), "google-genai"), (("openai",), ("--compat",), "openai")):
            with self.subTest(sdk=sdk):
                with blocked(*blocked_modules):
                    code, out, err = self.run_main(*extra)
                self.assertEqual(code, 1)
                self.assertIn(f"未安裝 {sdk} SDK", err)
                self.assertIn("pip install -r skills/gemini/requirements.txt", err)

    def test_dry_run_imports_no_sdk_and_needs_no_api_key(self):
        os.environ.pop("GEMINI_API_KEY")
        with blocked("google", "google.genai", "openai"):
            code, out, err = self.run_main("--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（Gemini）", out)
        self.assertIn("output-schema.json", out)   # 第 2 段提示詞
        self.assertIn("https://generativelanguage.googleapis.com/v1beta/openai/", err)

    def test_model_from_env_and_flag_for_each_mode(self):
        os.environ["GEMINI_MODEL"] = "gemini-4-argon"
        for extra, expected in (((), "gemini-4-argon"), (("--model", "gemini-3.6-flash"), "gemini-3.6-flash")):
            for mode in ((), ("--compat",)):
                with self.subTest(args=extra + mode):
                    modules, genai_record = fake_google_genai(["# 報告", VALID_OUTPUT])
                    openai, openai_record = fake_openai(["# 報告", VALID_OUTPUT])
                    code, out, err = self.run_main(*extra, *mode, modules={**modules, "openai": openai})
                    self.assertEqual(code, 0, err)
                    calls = openai_record["calls"] if mode else genai_record["calls"]
                    self.assertEqual([c["model"] for c in calls], [expected, expected])


if __name__ == "__main__":
    unittest.main()
