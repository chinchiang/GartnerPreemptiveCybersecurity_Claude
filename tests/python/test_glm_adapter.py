"""GLM 模型 adapter（skills/glm/api-workflow.py）：OpenAI 相容與 Anthropic 相容兩種呼叫方式，
以假的 openai／anthropic 模組測試，不連網、不需金鑰與 SDK。

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
SCRIPT = ROOT / "skills" / "glm" / "api-workflow.py"
VALID_OUTPUT = json.dumps({k: {} for k in json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]})


def load_script():
    spec = importlib.util.spec_from_file_location("glm_api_workflow", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_openai(replies):
    record = {"clients": [], "calls": []}

    class Completions:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=replies.pop(0)))])

    class OpenAI:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.chat = types.SimpleNamespace(completions=Completions())

    return types.SimpleNamespace(OpenAI=OpenAI), record


def fake_anthropic(replies):
    """回覆的 content 拆成多個 text block，確認 adapter 會把它們接起來。"""
    record = {"clients": [], "calls": []}

    class Messages:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            text = replies.pop(0)
            half = len(text) // 2
            return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=text[:half]),
                                                  types.SimpleNamespace(type="text", text=text[half:])])

    class Anthropic:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.messages = Messages()

    return types.SimpleNamespace(Anthropic=Anthropic), record


class _Block(importlib.abc.MetaPathFinder):
    """讓指定的模組 import 失敗。"""

    def __init__(self, *names):
        self.names = names

    def find_spec(self, name, path=None, target=None):
        if name in self.names:
            raise ImportError(f"blocked {name}")
        return None


@contextlib.contextmanager
def blocked(*names):
    blocker = _Block(*names)
    sys.meta_path.insert(0, blocker)
    try:
        with mock.patch.dict(sys.modules):
            for n in names:
                sys.modules.pop(n, None)
            yield
    finally:
        sys.meta_path.remove(blocker)


class GlmAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_script()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "out"
        self.env = mock.patch.dict(os.environ, {"GLM_API_KEY": "test-key"}, clear=False)
        self.env.start()
        for name in ("GLM_BASE_URL", "GLM_MODEL", "GLM_ANTHROPIC_BASE_URL"):
            os.environ.pop(name, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_main(self, *extra, modules=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(sys.modules, modules or {}), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = self.module.analysis_workflow.main(self.module.GlmAdapter(), ["--output-dir", str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def test_openai_compatible_two_stages(self):
        openai, record = fake_openai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key", "base_url": "https://api.z.ai/api/paas/v4"}])
        report_call, json_call = record["calls"]
        self.assertEqual((report_call["model"], report_call["temperature"], report_call["max_tokens"]), ("glm-5.3", 0.2, 16000))
        self.assertEqual(json_call["temperature"], 0.0)
        self.assertNotIn("response_format", json_call)  # GLM 的 JSON 模式未經查證，不使用
        self.assertEqual([m["role"] for m in report_call["messages"]], ["system", "user"])
        self.assertIn("7. 平臺備註（GLM）", report_call["messages"][0]["content"])
        self.assertEqual([m["role"] for m in json_call["messages"]], ["system", "user", "assistant", "user"])
        self.assertTrue((self.out / "glm-report.md").exists())
        self.assertTrue((self.out / "glm-output.json").exists())

    def test_openai_compatible_env_and_flags(self):
        os.environ["GLM_BASE_URL"] = "https://open.bigmodel.cn/api/paas/v4"
        os.environ["GLM_MODEL"] = "glm-5.3-flash"
        openai, record = fake_openai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--max-tokens", "4096", modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"][0]["base_url"], "https://open.bigmodel.cn/api/paas/v4")
        self.assertEqual((record["calls"][0]["model"], record["calls"][1]["max_tokens"]), ("glm-5.3-flash", 4096))

    def test_anthropic_compatible_two_stages(self):
        anthropic, record = fake_anthropic(["# 報告內容", VALID_OUTPUT])
        code, out, err = self.run_main("--anthropic-compatible", modules={"anthropic": anthropic})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key", "base_url": "https://api.z.ai/api/anthropic"}])
        report_call, json_call = record["calls"]
        self.assertIn("7. 平臺備註（GLM）", report_call["system"])
        self.assertEqual((report_call["model"], report_call["temperature"], report_call["max_tokens"]), ("glm-5.3", 0.2, 16000))
        self.assertEqual(json_call["temperature"], 0.0)
        self.assertEqual([m["role"] for m in report_call["messages"]], ["user"])  # system 不放在 messages 裡
        self.assertEqual([m["role"] for m in json_call["messages"]], ["user", "assistant", "user"])
        self.assertEqual(json_call["messages"][1]["content"], "# 報告內容")  # 多個 text block 接成一段
        self.assertEqual((self.out / "glm-report.md").read_text(encoding="utf-8"), "# 報告內容")

    def test_anthropic_compatible_base_url_from_env(self):
        os.environ["GLM_ANTHROPIC_BASE_URL"] = "https://example.invalid/anthropic"
        anthropic, record = fake_anthropic(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--anthropic-compatible", modules={"anthropic": anthropic})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"][0]["base_url"], "https://example.invalid/anthropic")

    def test_missing_api_key_exits_1(self):
        os.environ.pop("GLM_API_KEY")
        openai, record = fake_openai([])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 1)
        self.assertIn("GLM_API_KEY", err)
        self.assertEqual(record["calls"], [])

    def test_missing_sdk_exits_1_with_install_hint_for_each_mode(self):
        for module, extra in (("openai", ()), ("anthropic", ("--anthropic-compatible",))):
            with self.subTest(sdk=module), blocked(module):
                code, out, err = self.run_main(*extra)
            self.assertEqual(code, 1)
            self.assertIn(module, err)
            self.assertIn("pip install", err)

    def test_dry_run_imports_no_sdk_and_shows_both_endpoints(self):
        with blocked("openai", "anthropic"):
            code, out, err = self.run_main("--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（GLM）", out)
        self.assertIn("https://api.z.ai/api/paas/v4", err)
        self.assertIn("https://api.z.ai/api/anthropic", err)


if __name__ == "__main__":
    unittest.main()
