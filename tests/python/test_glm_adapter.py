"""GLM 模型 adapter（skills/glm/api-workflow.py）：OpenAI 相容與 Anthropic 相容兩種呼叫方式，
以假的 openai／anthropic 模組測試，不連網、不需金鑰與 SDK。

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
from fake_sdk import ROOT, blocked, fake_anthropic, fake_openai, load_platform_script  # noqa: E402

VALID_OUTPUT = json.dumps({k: {} for k in json.loads((ROOT / "skills" / "shared" / "output-schema.json").read_text(encoding="utf-8"))["required"]})


class GlmAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_platform_script("glm")

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

    def run_main(self, *extra, modules=None, adapter=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        adapter = adapter or self.module.GlmAdapter()
        with mock.patch.dict(sys.modules, modules or {}), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = self.module.analysis_workflow.main(adapter, ["--output-dir", str(self.out), *extra])
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
        self.assertIn("GLM API（OpenAI 相容端點）/ glm-5.3 /", json_call["messages"][-1]["content"])  # generated_by
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
        for call in (report_call, json_call):
            self.assertIn("7. 平臺備註（GLM）", call["system"])  # 兩段都帶 system
        self.assertEqual((report_call["model"], report_call["temperature"], report_call["max_tokens"]), ("glm-5.3", 0.2, 16000))
        self.assertEqual(json_call["temperature"], 0.0)
        self.assertEqual([m["role"] for m in report_call["messages"]], ["user"])  # system 不放在 messages 裡
        self.assertEqual([m["role"] for m in json_call["messages"]], ["user", "assistant", "user"])
        self.assertEqual(json_call["messages"][1]["content"], "# 報告內容")  # 多個 text block 接成一段
        self.assertIn("GLM API（Anthropic 相容端點）/ glm-5.3 /", json_call["messages"][-1]["content"])  # generated_by
        self.assertEqual((self.out / "glm-report.md").read_text(encoding="utf-8"), "# 報告內容")

    def test_anthropic_compatible_env_and_flags(self):
        os.environ["GLM_ANTHROPIC_BASE_URL"] = "https://example.invalid/anthropic"
        anthropic, record = fake_anthropic(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--anthropic-compatible", "--max-tokens", "4096", modules={"anthropic": anthropic})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"][0]["base_url"], "https://example.invalid/anthropic")
        self.assertEqual([c["max_tokens"] for c in record["calls"]], [4096, 4096])

    def test_empty_openai_reply_is_saved_as_empty_report(self):
        openai, record = fake_openai([None, VALID_OUTPUT])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual((self.out / "glm-report.md").read_text(encoding="utf-8"), "")

    def test_each_mode_gets_its_own_client_on_the_same_adapter(self):
        adapter = self.module.GlmAdapter()
        openai, openai_record = fake_openai(["# 報告", VALID_OUTPUT])
        anthropic, anthropic_record = fake_anthropic(["# 報告", VALID_OUTPUT])
        modules = {"openai": openai, "anthropic": anthropic}
        self.assertEqual(self.run_main(modules=modules, adapter=adapter)[0], 0)
        code, out, err = self.run_main("--anthropic-compatible", modules=modules, adapter=adapter)
        self.assertEqual(code, 0, err)
        self.assertEqual((len(openai_record["clients"]), len(anthropic_record["clients"])), (1, 1))

    def test_missing_api_key_exits_1(self):
        os.environ.pop("GLM_API_KEY")
        openai, record = fake_openai([])
        code, out, err = self.run_main(modules={"openai": openai})
        self.assertEqual(code, 1)
        self.assertIn("GLM_API_KEY", err)
        self.assertEqual(record["calls"], [])

    def test_missing_sdk_exits_1_with_install_hint_for_each_mode(self):
        for module, extra in (("openai", ()), ("anthropic", ("--anthropic-compatible",))):
            with self.subTest(sdk=module):
                with blocked(module):
                    code, out, err = self.run_main(*extra)
                self.assertEqual(code, 1)
                self.assertIn(f"未安裝 {module} SDK", err)
                self.assertIn("pip install -r skills/glm/requirements.txt", err)

    def test_dry_run_imports_no_sdk_and_shows_both_endpoints(self):
        with blocked("openai", "anthropic"):
            code, out, err = self.run_main("--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（GLM）", out)
        self.assertIn("https://api.z.ai/api/paas/v4", err)
        self.assertIn("https://api.z.ai/api/anthropic", err)
        self.assertIn("https://open.bigmodel.cn/api/paas/v4", err)  # 中國大陸替代端點的提示


if __name__ == "__main__":
    unittest.main()
