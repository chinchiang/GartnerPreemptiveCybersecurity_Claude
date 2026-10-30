"""Grok 模型 adapter（skills/grok/api-workflow.py）：xai_sdk（預設）與 --compat 的 OpenAI 相容端點兩種呼叫方式，
以假的 xai_sdk／openai 模組測試，不連網、不需金鑰與 SDK。

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
from fake_sdk import CHAT_COMPLETIONS, as_modules, assert_stops_on_incomplete, ROOT, blocked, fake_openai, fake_xai_sdk, load_platform_script  # noqa: E402

VALID_OUTPUT = (ROOT / "examples/acceptance-fixture.json").read_text(encoding="utf-8")


class GrokAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_platform_script("grok")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "out"
        self.env = mock.patch.dict(os.environ, {"XAI_API_KEY": "test-key"}, clear=False)
        self.env.start()
        for name in ("XAI_MODEL", "XAI_COMPAT_BASE_URL"):
            os.environ.pop(name, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def run_main(self, *extra, modules=None, adapter=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        adapter = adapter or self.module.GrokAdapter()
        with mock.patch.dict(sys.modules, modules or {}), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = self.module.analysis_workflow.main(adapter, ["--output-dir", str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()


    def test_xai_sdk_path_stops_when_the_reply_is_incomplete(self):
        # 缺值用 REASON_INVALID：protobuf 列舉的預設值 0，代表沒有設定
        assert_stops_on_incomplete(self, self.run_main, fake_xai_sdk, calls=lambda rec: len(rec["chats"]),
                                   output_limit="REASON_MAX_LEN", other_incomplete="REASON_MAX_CONTEXT", missing_value="REASON_INVALID",
                                   max_tokens_flag=False)

    def test_compat_path_stops_when_the_reply_is_incomplete(self):
        assert_stops_on_incomplete(self, self.run_main, lambda r: as_modules("openai", fake_openai(r)), extra=("--compat",),
                                   calls=lambda rec: len(rec["calls"]), **CHAT_COMPLETIONS, max_tokens_flag=False)

    def test_xai_sdk_two_stages(self):
        modules, record = fake_xai_sdk(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main(modules=modules)
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key"}])
        report_chat, json_chat = record["chats"]
        for chat in (report_chat, json_chat):
            self.assertEqual(chat["create"], {"model": "grok-4.6"})  # 不傳 tools：不啟用任何伺服器端工具
        self.assertEqual([role for role, _ in report_chat["messages"]], ["system", "user"])
        self.assertIn("7. 平臺備註（Grok）", report_chat["messages"][0][1])
        self.assertNotIn("output-schema.json", report_chat["messages"][1][1])  # 第一段不要求 JSON，只在第二段要一次
        self.assertEqual([role for role, _ in json_chat["messages"]], ["system", "user", "assistant", "user"])
        self.assertEqual(json_chat["messages"][2], ("assistant", "# 報告"))
        self.assertIn("xAI API（xai_sdk）/ grok-4.6 /", json_chat["messages"][-1][1])  # generated_by
        self.assertEqual((self.out / "grok-report.md").read_text(encoding="utf-8"), "# 報告")
        self.assertTrue((self.out / "grok-output.json").exists())

    def test_xai_sdk_model_from_env_and_flag(self):
        os.environ["XAI_MODEL"] = "grok-4.20"
        for extra, expected in (((), "grok-4.20"), (("--model", "grok-5"), "grok-5")):
            with self.subTest(args=extra):
                modules, record = fake_xai_sdk(["# 報告", VALID_OUTPUT])
                code, out, err = self.run_main(*extra, modules=modules)
                self.assertEqual(code, 0, err)
                self.assertEqual([chat["create"]["model"] for chat in record["chats"]], [expected, expected])
                self.assertIn(f"xAI API（xai_sdk）/ {expected} /", record["chats"][1]["messages"][-1][1])

    def test_compat_two_stages(self):
        openai, record = fake_openai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--compat", modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"], [{"api_key": "test-key", "base_url": "https://api.x.ai/v1"}])
        report_call, json_call = record["calls"]
        for call in (report_call, json_call):
            self.assertEqual(set(call), {"model", "messages"})  # 照舊不帶 temperature、max_tokens、tools、response_format
            self.assertEqual(call["model"], "grok-4.6")
        self.assertEqual([m["role"] for m in report_call["messages"]], ["system", "user"])
        self.assertIn("7. 平臺備註（Grok）", report_call["messages"][0]["content"])
        self.assertEqual([m["role"] for m in json_call["messages"]], ["system", "user", "assistant", "user"])
        self.assertIn("xAI API（OpenAI 相容端點）/ grok-4.6 /", json_call["messages"][-1]["content"])  # generated_by
        self.assertTrue((self.out / "grok-output.json").exists())

    def test_compat_env_overrides(self):
        os.environ["XAI_COMPAT_BASE_URL"] = "https://example.invalid/v1"
        os.environ["XAI_MODEL"] = "grok-4.20"
        openai, record = fake_openai(["# 報告", VALID_OUTPUT])
        code, out, err = self.run_main("--compat", modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual(record["clients"][0]["base_url"], "https://example.invalid/v1")
        self.assertEqual([c["model"] for c in record["calls"]], ["grok-4.20", "grok-4.20"])

    def test_missing_api_key_exits_1_for_each_mode(self):
        os.environ.pop("XAI_API_KEY")
        xai_modules, xai_record = fake_xai_sdk([])
        openai, openai_record = fake_openai([])
        for extra in ((), ("--compat",)):
            with self.subTest(args=extra):
                code, out, err = self.run_main(*extra, modules={**xai_modules, "openai": openai})
                self.assertEqual(code, 1)
                self.assertIn("XAI_API_KEY", err)
        self.assertEqual((xai_record["clients"], openai_record["clients"]), ([], []))

    def test_missing_sdk_exits_1_with_install_hint_for_each_mode(self):
        for module, extra in (("xai_sdk", ()), ("openai", ("--compat",))):
            with self.subTest(sdk=module):
                with blocked(module):
                    code, out, err = self.run_main(*extra)
                self.assertEqual(code, 1)
                self.assertIn(f"未安裝 {module}", err)
                self.assertIn("pip install -r skills/grok/requirements.txt", err)

    def test_json_parse_failure_exits_4_and_keeps_raw_reply(self):
        modules, record = fake_xai_sdk(["# 報告", "抱歉，這次無法輸出 JSON。"])
        code, out, err = self.run_main(modules=modules)
        self.assertEqual(code, 4)
        self.assertEqual((self.out / "grok-output.raw.txt").read_text(encoding="utf-8"), "抱歉，這次無法輸出 JSON。")
        self.assertFalse((self.out / "grok-output.json").exists())
        self.assertTrue((self.out / "grok-report.md").exists())

    def test_empty_compat_reply_is_saved_as_empty_report(self):
        openai, record = fake_openai([None, VALID_OUTPUT])
        code, out, err = self.run_main("--compat", modules={"openai": openai})
        self.assertEqual(code, 0, err)
        self.assertEqual((self.out / "grok-report.md").read_text(encoding="utf-8"), "")

    def test_each_mode_gets_its_own_client_on_the_same_adapter(self):
        adapter = self.module.GrokAdapter()
        xai_modules, xai_record = fake_xai_sdk(["# 報告", VALID_OUTPUT])
        openai, openai_record = fake_openai(["# 報告", VALID_OUTPUT])
        modules = {**xai_modules, "openai": openai}
        self.assertEqual(self.run_main(modules=modules, adapter=adapter)[0], 0)
        code, out, err = self.run_main("--compat", modules=modules, adapter=adapter)
        self.assertEqual(code, 0, err)
        self.assertEqual((len(xai_record["clients"]), len(openai_record["clients"])), (1, 1))
        self.assertEqual(len(openai_record["calls"]), 2)

    def test_dry_run_imports_no_sdk_and_prints_full_prompts(self):
        with blocked("xai_sdk", "openai"):
            code, out, err = self.run_main("--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("7. 平臺備註（Grok）", out)
        topology = (ROOT / "examples" / "synthetic-org" / "topology.json").read_text(encoding="utf-8").strip()
        self.assertIn(topology, out)  # 最後一個輸入檔也完整印出，不再截斷在 1500 字
        self.assertIn("output-schema.json", out)  # 第 2 段提示詞
        self.assertIn("https://api.x.ai/v1", err)


if __name__ == "__main__":
    unittest.main()
