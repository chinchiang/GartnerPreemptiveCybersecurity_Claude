"""真 SDK 冒煙測試（real_sdk_smoke.py）在沒裝 SDK 時不能略過，要以非 0 結束（#162）。

冒煙測試本身要真的 SDK，不在 unittest discover 的範圍（檔名不是 test*.py），由 CI 的 real-sdk job 執行；
這裡只確認它在缺 SDK 時會失敗，不會默默當成通過。
"""
import contextlib
import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake_sdk import blocked  # noqa: E402
import real_sdk_smoke  # noqa: E402

# 各平臺 requirements.txt 列的 SDK（import 名稱）：任何一個缺了都要失敗。
# 刻意不 import real_sdk_smoke.SDK_MODULES：預期值要有獨立的來源（CODING_STANDARDS §2），冒煙測試漏列一個 SDK 時這裡才抓得到。
SDK_MODULES = {
    "chatgpt": ["openai"],
    "deepseek": ["openai"],
    "gemini": ["google.genai", "openai"],
    "glm": ["openai", "anthropic"],
    "grok": ["xai_sdk", "openai"],
}


class MissingSdkTest(unittest.TestCase):
    def run_smoke(self, platform):
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            code = real_sdk_smoke.main([platform])
        return code, err.getvalue()

    def test_each_missing_sdk_fails_and_names_it(self):
        for platform, modules in SDK_MODULES.items():
            for module in modules:
                with self.subTest(platform=platform, missing=module), blocked(module, module.split(".")[0]):
                    code, err = self.run_smoke(platform)
                    self.assertNotEqual(code, 0, err)
                    self.assertIn(module.split(".")[0], err)

    def test_unknown_platform_fails(self):
        code, err = self.run_smoke("claude")
        self.assertNotEqual(code, 0)
        self.assertIn("claude", err)


if __name__ == "__main__":
    unittest.main()
