"""授權範圍守門：四支 api-workflow.py 與 Claude 的 validate_inputs.py，對共用案例的判定必須與網站示範引擎一致。

案例在 tests/fixtures/scope-cases.json（JS 那邊由 scripts/scope-cases.test.mjs 套在 demo.js 上）。
這裡只看腳本的外部行為：結束碼與輸出訊息。執行：python3 -m unittest discover -s tests/python
"""
import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SYNTHETIC = ROOT / "examples" / "synthetic-org"
CASES = json.loads((ROOT / "tests" / "fixtures" / "scope-cases.json").read_text(encoding="utf-8"))["cases"]
API_PLATFORMS = ["chatgpt", "grok", "glm", "deepseek"]
VALIDATE_INPUTS = ROOT / "skills" / "claude" / "preemptive-exposure-analysis" / "scripts" / "validate_inputs.py"


def apply_case(scope: dict, case: dict) -> dict:
    """依案例的 set／remove 修改一份合成資料 scope 的深拷貝。"""
    s = copy.deepcopy(scope)

    def walk(path):
        *keys, last = path.split(".")
        node = s
        for k in keys:
            if not isinstance(node.get(k), dict):
                node[k] = {}
            node = node[k]
        return node, last

    for path, value in case.get("set", {}).items():
        node, k = walk(path)
        node[k] = value
    for path in case.get("remove", []):
        node, k = walk(path)
        node.pop(k, None)
    return s


class ScopeGateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = json.loads((SYNTHETIC / "scope.json").read_text(encoding="utf-8"))

    def run_case(self, case: dict, argv: list) -> subprocess.CompletedProcess:
        with tempfile.TemporaryDirectory() as tmp:
            input_dir = Path(tmp) / "inputs"
            shutil.copytree(SYNTHETIC, input_dir)
            (input_dir / "scope.json").write_text(json.dumps(apply_case(self.base, case), ensure_ascii=False), encoding="utf-8")
            return subprocess.run([sys.executable, *[str(a).replace("{input}", str(input_dir)).replace("{output}", str(Path(tmp) / "out")) for a in argv]],
                                  capture_output=True, text=True, encoding="utf-8", cwd=tmp)

    def test_api_workflows_follow_shared_cases(self):
        for platform in API_PLATFORMS:
            script = ROOT / "skills" / platform / "api-workflow.py"
            for case in CASES:
                with self.subTest(platform=platform, case=case["name"]):
                    r = self.run_case(case, [script, "--dry-run", "--input-dir", "{input}", "--output-dir", "{output}"])
                    out = r.stdout + r.stderr
                    if case["problems"]:
                        self.assertNotEqual(r.returncode, 0, f"應中止卻放行：{out[-300:]}")
                        self.assertIn("scope.json", out)
                        for field in case["problems"]:
                            self.assertIn(field, out)
                    else:
                        self.assertEqual(r.returncode, 0, out[-500:])

    def test_validate_inputs_follows_shared_cases(self):
        for case in CASES:
            with self.subTest(case=case["name"]):
                r = self.run_case(case, [VALIDATE_INPUTS, "{input}"])
                out = r.stdout + r.stderr
                if case["problems"]:
                    self.assertEqual(r.returncode, 3, f"應以 3 中止：{out[-300:]}")
                    for field in case["problems"]:
                        self.assertIn(field, out)
                else:
                    self.assertEqual(r.returncode, 0, out[-500:])


if __name__ == "__main__":
    unittest.main()
