"""DeepSeek 模型 adapter（skills/deepseek/api-workflow.py）：以假的 openai 模組測試，不連網、不需金鑰與 SDK。

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
from fake_sdk import ROOT, blocked, fake_openai, load_platform_script  # noqa: E402

REQUIRED_KEYS = json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]


class DeepSeekAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_platform_script("deepseek")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "out"
        self.env = mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}, clear=False)
        self.env.start()
        for name in ("DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"):
            os.environ.pop(name, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_main(self, *extra, openai=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        modules = {"openai": openai} if openai is not None else {}
        with mock.patch.dict(sys.modules, modules), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = self.module.analysis_workflow.main(self.module.DeepSeekAdapter(), ["--output-dir", str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def test_two_stages_use_deepseek_settings_and_json_mode(self):
        openai, record = fake_openai(["# 報告", json.dumps({k: {} for k in REQUIRED_KEYS})])
        code, out, err = self.run_main(openai=openai)
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key", "base_url": "https://api.deepseek.com"}])
        report_call, json_call = record["calls"]
        self.assertEqual((report_call["model"], report_call["temperature"], report_call["max_tokens"]), ("deepseek-v4-pro", 0.2, 16000))
        self.assertNotIn("response_format", report_call)
        self.assertEqual((json_call["temperature"], json_call["response_format"]), (0.0, {"type": "json_object"}))
        self.assertEqual([m["role"] for m in json_call["messages"]], ["system", "user", "assistant", "user"])
        self.assertTrue((self.out / "deepseek-report.md").exists())
        self.assertTrue((self.out / "deepseek-output.json").exists())

    def test_env_and_flags_override_defaults(self):
        os.environ["DEEPSEEK_BASE_URL"] = "https://example.invalid/v1"
        os.environ["DEEPSEEK_MODEL"] = "deepseek-v4-flash"
        openai, record = fake_openai(["# 報告", "{}"])
        code, out, err = self.run_main("--max-tokens", "2048", "--no-json-mode", openai=openai)
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"][0]["base_url"], "https://example.invalid/v1")
        self.assertEqual(record["calls"][0]["model"], "deepseek-v4-flash")
        self.assertEqual(record["calls"][1]["max_tokens"], 2048)
        self.assertNotIn("response_format", record["calls"][1])

    def test_rejected_json_mode_is_retried_once_without_response_format(self):
        openai, record = fake_openai(["# 報告", "{}"], reject_response_format=True)
        code, out, err = self.run_main(openai=openai)
        self.assertEqual(code, 0, err)
        self.assertEqual(len(record["calls"]), 3)
        self.assertIn("response_format", record["calls"][1])
        self.assertNotIn("response_format", record["calls"][2])
        self.assertIn("[警告] JSON Output 模式被端點拒絕", err)

    def test_missing_api_key_exits_1(self):
        os.environ.pop("DEEPSEEK_API_KEY")
        openai, record = fake_openai([])
        code, out, err = self.run_main(openai=openai)
        self.assertEqual(code, 1)
        self.assertIn("DEEPSEEK_API_KEY", err)
        self.assertEqual(record["calls"], [])

    def test_missing_sdk_exits_1_with_install_hint(self):
        with blocked("openai"):
            code, out, err = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("未安裝 openai SDK", err)
        self.assertIn("pip install -r skills/deepseek/requirements.txt", err)

    def test_dry_run_does_not_import_the_sdk(self):
        with blocked("openai"):
            code, out, err = self.run_main("--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（DeepSeek）", out)
        self.assertIn("https://api.deepseek.com", err)

if __name__ == "__main__":
    unittest.main()
