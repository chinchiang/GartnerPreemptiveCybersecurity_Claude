"""資料送出前篩選：Python 與 JavaScript 共用手寫輸入與預期結果。"""
import copy
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'skills/shared'))
import analysis_workflow as aw

CASES = json.loads((ROOT / 'tests/fixtures/scoped-bundle-cases.json').read_text(encoding='utf-8'))
FILES = {'assets': 'assets.csv', 'vulnerabilities': 'vulnerabilities.csv', 'misconfigurations': 'misconfigurations.csv',
         'identities': 'identities.csv', 'exposures': 'exposures.json', 'controls': 'controls.json', 'topology': 'topology.json'}


class ScopedBundleTest(unittest.TestCase):
    def test_csv_surplus_values_do_not_break_filtered_prompt(self):
        schema = json.loads((ROOT / 'skills/shared/input-schema.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'inputs'
            shutil.copytree(ROOT / 'examples/synthetic-org', folder)
            scope = json.loads((folder / 'scope.json').read_text(encoding='utf-8'))
            scope['authorized_scope']['in_scope_assets'] = ['A01']
            (folder / 'scope.json').write_text(json.dumps(scope), encoding='utf-8')
            lines = (folder / 'assets.csv').read_text(encoding='utf-8').splitlines()
            lines[1] += ',EXCLUDED_SURPLUS'
            (folder / 'assets.csv').write_text('\n'.join(lines), encoding='utf-8')
            prompt = aw.build_report_prompt(aw.load_inputs(folder, frozenset(), schema))
            self.assertIn('vpn-gw-01', prompt)
            self.assertNotIn('EXCLUDED_SURPLUS', prompt)

    def test_shared_cases_through_scoped_files(self):
        for c in CASES:
            with self.subTest(c['name']):
                source = copy.deepcopy(c['bundle'])
                files = []
                for category, data in source.items():
                    if category == 'scope':
                        continue
                    rows = data if isinstance(data, list) else []
                    columns = list(dict.fromkeys(k for row in rows if isinstance(row, dict) for k in row))
                    files.append(dict(category=category, data=data, raw=json.dumps(data), name=FILES[category], columns=columns))
                inputs = aw.Inputs(scope=source['scope'], files=files)
                result = {'scope': inputs.scope, **{f['category']: f['data'] for f in aw.scoped_files(inputs)}}
                self.assertEqual(result, c['expected'])
                self.assertEqual(source, c['bundle'])
    def test_load_and_prompt_handle_review_regressions(self):
        schema = json.loads((ROOT / 'skills/shared/input-schema.json').read_text(encoding='utf-8'))
        for filename, data in [('exposures.json', [{'asset_id': 'A02', 'hostname': 'EXCLUDED_SENTINEL'}]),
                               ('controls.json', {'controls': [None]}),
                               ('controls.json', {'controls': [{'coverage_assets': None, 'gaps': []}]})]:
            with self.subTest(data=data), tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp) / 'inputs'
                shutil.copytree(ROOT / 'examples/synthetic-org', folder)
                scope = json.loads((folder / 'scope.json').read_text(encoding='utf-8'))
                scope['authorized_scope']['in_scope_assets'] = ['A01']
                (folder / 'scope.json').write_text(json.dumps(scope), encoding='utf-8')
                (folder / filename).write_text(json.dumps(data), encoding='utf-8')
                prompt = aw.build_report_prompt(aw.load_inputs(folder, frozenset(), schema))
                self.assertNotIn('EXCLUDED_SENTINEL', prompt)
                self.assertNotIn('ad-dc-01', prompt)
                self.assertIn('vpn-gw-01', prompt)
