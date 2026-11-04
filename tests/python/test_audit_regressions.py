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


class SentDataIsReserializedTest(unittest.TestCase):
    """送往模型的是解析後重新序列化的資料，不是原文：原文裡解析時被蓋掉的內容（重複的 JSON 鍵、重複的 CSV 欄位標頭）
    不能夾帶出去，範圍外的資產也就不會經由原文送出。JS 的 scopedBundle 一向如此；Python 曾在篩選後資料不變時改送原文。"""
    MARKER = 'ZZ-OUT-OF-SCOPE-MARKER'

    def prompt_after(self, name, edit):
        schema = json.loads((ROOT / 'skills/shared/input-schema.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for f in (ROOT / 'examples/synthetic-org').iterdir():
                (folder / f.name).write_bytes(f.read_bytes())
            path = folder / name
            path.write_text(edit(path.read_text(encoding='utf-8')), encoding='utf-8')
            return aw.build_report_prompt(aw.load_inputs(folder, frozenset(), schema))

    def test_duplicate_json_key_does_not_carry_the_overwritten_value(self):
        # 第一個 edges 指向範圍外資產；解析時被後面的 edges 蓋掉，篩選後的資料與解析結果相同
        dup = '{\n  "edges": [{ "from": "internet", "to": "%s", "via": "x", "trust": "exposed" }],' % self.MARKER
        prompt = self.prompt_after('topology.json', lambda text: text.replace('{', dup, 1))
        self.assertIn('"crown_jewels"', prompt)
        self.assertNotIn(self.MARKER, prompt)

    def test_duplicate_csv_header_does_not_carry_the_overwritten_column(self):
        # 第一個 notes 欄只在原文裡；解析時同名的最後一欄勝出
        def edit(text):
            header, *rows = text.split('\n')
            return '\n'.join([header + ',notes'] + [row + ',' + row.split(',')[-1] if row else row for row in rows])
        def first_notes_marker(text):
            lines = edit(text).split('\n')
            lines[1] = lines[1].replace(',員工遠端存取入口,', ',%s,' % self.MARKER, 1)
            return '\n'.join(lines)
        prompt = self.prompt_after('assets.csv', first_notes_marker)
        self.assertIn('vpn-gw-01', prompt)
        self.assertNotIn(self.MARKER, prompt)


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


class OutputConsistencyTest(unittest.TestCase):
    """稽核 3（#148）：與 JS 共用 tests/fixtures/consistency-cases.json，訊息逐字相同。"""

    def test_shared_cases(self):
        schema = json.loads((ROOT / 'skills/shared/output-schema.json').read_text(encoding='utf-8'))
        cases = json.loads((ROOT / 'tests/fixtures/consistency-cases.json').read_text(encoding='utf-8'))['cases']
        for c in cases:
            with self.subTest(c['name']):
                output = json.loads((ROOT / 'examples/acceptance-fixture.json').read_text(encoding='utf-8'))
                for path, value in c['changes']:
                    node = output
                    for key in path[:-1]:
                        node = node[key]
                    node[path[-1]] = value
                self.assertEqual(aw.output_problems(output, schema), [])
                self.assertEqual(aw.output_consistency_problems(output), c['problems'])

    def test_save_outputs_rejects_inconsistent_output(self):
        schema = json.loads((ROOT / 'skills/shared/output-schema.json').read_text(encoding='utf-8'))
        output = json.loads((ROOT / 'examples/acceptance-fixture.json').read_text(encoding='utf-8'))
        output['remediation']['items'][0]['finding_id'] = 'F-999'
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as err:
            folder = Path(tmp)
            (folder / 'fake-output.json').write_text('{}', encoding='utf-8')   # 上一次成功的輸出
            code = aw.save_outputs(folder, 'fake', '# 報告', json.dumps(output, ensure_ascii=False), schema)
            self.assertEqual(code, 4)
            self.assertFalse((folder / 'fake-output.json').exists())
            self.assertTrue((folder / 'fake-output.raw.txt').exists())
            self.assertIn('輸出內容不一致', err.getvalue())
