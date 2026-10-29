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


class ExcludedAssetsTest(unittest.TestCase):
    """稽核 1（#146）：excluded_assets 排除優先；重疊時列為異常，格式不符時列為必要問題（排除未生效）。"""

    def load(self, **authorized):
        schema = json.loads((ROOT / 'skills/shared/input-schema.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for f in (ROOT / 'examples/synthetic-org').iterdir():
                (folder / f.name).write_bytes(f.read_bytes())
            scope = json.loads((folder / 'scope.json').read_text(encoding='utf-8'))
            scope['authorized_scope'].update(authorized)
            (folder / 'scope.json').write_text(json.dumps(scope, ensure_ascii=False), encoding='utf-8')
            return aw.load_inputs(folder, frozenset(), schema)

    def test_excluded_asset_is_not_sent_and_overlap_is_reported(self):
        inputs = self.load(excluded_assets=['A01'])
        filtered = {f['category']: f['data'] for f in aw.scoped_files(inputs)}
        self.assertNotIn('A01', [a['asset_id'] for a in filtered['assets']])
        self.assertFalse([v for v in filtered['vulnerabilities'] if v['asset_id'] == 'A01'])
        self.assertNotIn('vpn-gw-01', aw.build_report_prompt(inputs).split('【腳本預檢結果】')[0])
        overlap = [f for f in inputs.findings if f.kind == aw.PreflightKind.EXCLUDED_ASSET]
        self.assertEqual([(f.file, f.severity, f.detail) for f in overlap], [('assets.csv', aw.ANOMALY, ['A01'])])

    def test_text_excluded_does_not_filter(self):
        inputs = self.load(excluded=['A01'])
        filtered = {f['category']: f['data'] for f in aw.scoped_files(inputs)}
        self.assertIn('A01', [a['asset_id'] for a in filtered['assets']])
        self.assertFalse([f for f in inputs.findings if f.kind in (aw.PreflightKind.EXCLUDED_ASSET, aw.PreflightKind.INVALID_EXCLUDED_ASSETS)])

    def test_malformed_excluded_assets_is_a_required_problem(self):
        for value in ['A01', ['A01', 7], ['  ']]:
            with self.subTest(value=value):
                inputs = self.load(excluded_assets=value)
                bad = [f for f in inputs.findings if f.kind == aw.PreflightKind.INVALID_EXCLUDED_ASSETS]
                self.assertEqual([(f.file, f.severity) for f in bad], [('scope.json', aw.PROBLEM)])
                self.assertIn('excluded_assets 須為非空白字串的陣列', '\n'.join(aw.preflight_lines(inputs.findings)))
