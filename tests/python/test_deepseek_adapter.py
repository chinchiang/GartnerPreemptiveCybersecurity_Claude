"""DeepSeek 模型 adapter（skills/deepseek/api-workflow.py）：以假的 openai 模組測試，不連網、不需金鑰與 SDK。

執行：python3 -m unittest discover -s tests/python
"""
import contextlib
import importlib.abc
import importlib.util
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "skills" / "deepseek" / "api-workflow.py"
REQUIRED_KEYS = json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]


def load_script():
    spec = importlib.util.spec_from_file_location("deepseek_api_workflow", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_openai(replies, reject_response_format=False):
    """回傳 (假的 openai 模組, 呼叫紀錄)。chat.completions.create 依序回傳 replies。"""
    record = {"clients": [], "calls": []}

    class Completions:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            if reject_response_format and "response_format" in kwargs:
                raise RuntimeError("response_format is not supported")
            content = replies.pop(0)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=content))])

    class OpenAI:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.chat = types.SimpleNamespace(completions=Completions())

    return types.SimpleNamespace(OpenAI=OpenAI), record


class _BlockOpenAI(importlib.abc.MetaPathFinder):
    """讓 import openai 失敗，用來確認 --dry-run 不載入 SDK、缺 SDK 時會好好中止。"""

    def find_spec(self, name, path=None, target=None):
        if name == "openai":
            raise ImportError("blocked openai")
        return None


class DeepSeekAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_script()

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
        blocker = _BlockOpenAI()
        sys.meta_path.insert(0, blocker)
        try:
            with mock.patch.dict(sys.modules):
                sys.modules.pop("openai", None)
                code, out, err = self.run_main()
        finally:
            sys.meta_path.remove(blocker)
        self.assertEqual(code, 1)
        self.assertIn("pip install", err)

    def test_dry_run_does_not_import_the_sdk(self):
        blocker = _BlockOpenAI()
        sys.meta_path.insert(0, blocker)
        try:
            with mock.patch.dict(sys.modules):
                sys.modules.pop("openai", None)
                code, out, err = self.run_main("--dry-run")
        finally:
            sys.meta_path.remove(blocker)
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（DeepSeek）", out)
        self.assertIn("https://api.deepseek.com", err)


if __name__ == "__main__":
    unittest.main()
