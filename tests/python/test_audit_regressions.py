"""審查回歸：跨語言共用輸出案例、資料送出前篩選與舊成功檔清理。"""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'skills/shared'))
import analysis_workflow as aw


class AuditRegressionTest(unittest.TestCase):
    def test_output_cases(self):
        schema = json.loads((ROOT / 'skills/shared/output-schema.json').read_text(encoding='utf-8'))
        for case in json.loads((ROOT / 'tests/fixtures/output-cases.json').read_text(encoding='utf-8')):
            output = json.loads((ROOT / 'examples/acceptance-fixture.json').read_text(encoding='utf-8'))
            node = output
            for key in case['path'][:-1]:
                node = node[key]
            if case['path']:
                node[case['path'][-1]] = case['value']
            else:
                output = case['value']
            self.assertEqual(not aw.output_problems(output, schema), case['valid'], case['name'])

    def test_scope_filter_and_prompt_do_not_leak_excluded_records(self):
        schema = json.loads((ROOT / 'skills/shared/input-schema.json').read_text(encoding='utf-8'))
        inputs = aw.load_inputs(ROOT / 'examples/synthetic-org', frozenset(), schema)
        inputs.scope['authorized_scope']['in_scope_assets'] = ['A01']
        prompt = aw.build_report_prompt(inputs)
        self.assertIn('vpn-gw-01', prompt)
        for text in ['ad-dc-01', 'erp-db-01', 'old-test.northwind-synthetic.example', 'A02,']:
            self.assertNotIn(text, prompt)
        filtered = {f['category']: f['data'] for f in aw.scoped_files(inputs)}
        self.assertEqual([a['asset_id'] for a in filtered['assets']], ['A01'])
        self.assertEqual(filtered['topology']['crown_jewels'], [])
        self.assertEqual(len(inputs.files[1]['data']), 12)  # 原始資料留在本機

    def test_invalid_output_clears_previous_success(self):
        schema = json.loads((ROOT / 'skills/shared/output-schema.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for reply in ['{}', '不是 JSON']:
                (folder / 'fake-output.json').write_text('{}')
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(aw.save_outputs(folder, 'fake', '報告', reply, schema), 4)
                self.assertFalse((folder / 'fake-output.json').exists())
                self.assertEqual((folder / 'fake-output.raw.txt').read_text(encoding='utf-8'), reply)
