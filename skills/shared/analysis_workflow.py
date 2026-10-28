"""分析工作流程核心（見 GLOSSARY.md「分析工作流程」）。

在授權範圍內，把輸入資料交給模型、取得報告與結構化輸出的一次執行。各平臺的 api-workflow.py
只提供「怎麼呼叫模型」的 adapter，其餘（載入輸入、授權範圍守門、組提示詞、兩段式對話、解析、存檔）都在這裡。

只用標準函式庫，維持 Python 3.9 相容；平臺 SDK 由各 adapter 在呼叫時才載入，--dry-run 不需要。
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path


class Abort(Exception):
    """中止這次分析：訊息給使用者看，exit_code 是程式的結束碼（輸入、授權範圍、環境或 API 錯誤＝1）。"""

    def __init__(self, message: str, exit_code: int = 1):
        super().__init__(message)
        self.exit_code = exit_code


# 9 個輸入檔：(檔名, 輸入類別＝input-schema.json 的鍵＝--exclude 的值, 標籤, 是否必要)
INPUT_FILES = [
    ("scope.json", "scope", "I1 授權範圍與分析參數", True),
    ("assets.csv", "assets", "I2 資產清冊 + 業務重要性", True),
    ("vulnerabilities.csv", "vulnerabilities", "I3 弱點與發現", True),
    ("exposures.json", "exposures", "I4 外部曝險（EASM）", False),
    ("identities.csv", "identities", "I6 身分與權限", False),
    ("misconfigurations.csv", "misconfigurations", "I7 設定基準偏差", False),
    ("controls.json", "controls", "I8 既有控制措施", False),
    ("threat-intel.json", "threat_intel", "I9 威脅情資", False),
    ("topology.json", "topology", "I10 網路拓樸／信任關係", False),
]
EXCLUDE_CHOICES = [category for _, category, _, _ in INPUT_FILES]

REPO_ROOT = Path(__file__).resolve().parents[2]   # skills/shared/ 的上兩層；ZIP 維持 repo 目錄結構，解壓後同樣成立
SHARED_DIR = REPO_ROOT / "skills" / "shared"


# ---------------------------------------------------------------------------
# 授權範圍守門（規則從 input-schema.json 推導）
# ---------------------------------------------------------------------------

_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "array": lambda v: isinstance(v, list),
    "object": lambda v: isinstance(v, dict),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
}


def _is_full_date(value: str) -> bool:
    """RFC 3339 full-date（schema 的 format: date）：恰好 YYYY-MM-DD，而且是存在的日期。
    不用 date.fromisoformat：它也接受 20260908 與週日期；數字寫 [0-9]，因為 \\d 與 int() 都接受全形數字，JS 那邊不接受。"""
    m = re.fullmatch(r"([0-9]{4})-([0-9]{2})-([0-9]{2})", value)
    if not m:
        return False
    try:
        date(*map(int, m.groups()))
    except ValueError:
        return False
    return True


def _join(prefix: str, key: str) -> str:
    return f"{prefix}.{key}" if prefix else key


def _required_leaf_nodes(node: dict, prefix: str) -> list:
    """必填的末端欄位與它們的 schema 節點：[(路徑, 節點)]。"""
    if node.get("type") != "object" or not node.get("required"):
        return [(prefix, node)]
    leaves = []
    for key in node["required"]:
        leaves += _required_leaf_nodes(node.get("properties", {}).get(key, {}), _join(prefix, key))
    return leaves


def _required_leaves(node: dict, prefix: str) -> list:
    """物件型別的欄位缺少或型別錯誤時，回報它底下所有必填的末端欄位（例如缺整個 authorized_scope）。"""
    return [path for path, _ in _required_leaf_nodes(node, prefix)]


# 兩份解讀（這裡與 assets/scope-gate.js）只認得同一組關鍵字；註記關鍵字不影響判定，放行（見 docs/adr/0004）
_RULE_KEYWORDS = {"type", "required", "properties", "minLength", "minItems", "format", "pattern", "items"}
_NOTE_KEYWORDS = {"default", "description", "title", "$comment"}


def _assert_supported(node: dict, path: str) -> None:
    """整個節點（含 properties、items 底下）只能用認得的關鍵字，format 只支援 date；否則丟出 ValueError，避免規則被默默略過。"""
    for key in node:
        if key not in _RULE_KEYWORDS | _NOTE_KEYWORDS:
            raise ValueError(f"授權範圍守門不認得 schema 關鍵字 {key}（{path or 'scope'}）；兩份解讀都要實作它，見 docs/adr/0004")
    if "format" in node and node["format"] != "date":
        raise ValueError(f"授權範圍守門不支援 schema 關鍵字 format: {node['format']}（{path or 'scope'}），只支援 date；見 docs/adr/0004")
    for key, child in node.get("properties", {}).items():
        _assert_supported(child, _join(path, key))
    if "items" in node:
        _assert_supported(node["items"], path)


def _check(value, node: dict, path: str) -> list:
    """依 schema 節點檢查一個欄位：必填是否存在、type、minLength、format: date、pattern、minItems、items；物件則往下檢查其必填欄位。"""
    if value is None:
        return _required_leaves(node, path)
    expected = node.get("type")
    if expected and not _TYPE_CHECKS.get(expected, lambda v: True)(value):
        return _required_leaves(node, path)
    if expected == "string" and len(value) < node.get("minLength", 0):
        return [path]
    if expected == "string" and node.get("format") == "date" and not _is_full_date(value):
        return [path]
    if expected == "string" and "pattern" in node and not re.search(node["pattern"], value):  # JSON Schema 的 pattern 不錨定
        return [path]
    if expected == "array" and len(value) < node.get("minItems", 0):
        return [path]
    if expected == "array" and "items" in node and any(_check(item, node["items"], path) for item in value):
        return [path]  # 任一項目不合格就回報整個陣列欄位，不細到第幾項
    if expected == "object":
        problems = []
        for key in node.get("required", []):
            problems += _check(value.get(key), node.get("properties", {}).get(key, {}), _join(path, key))
        return problems
    return []


def required_scope_fields(input_schema: dict) -> list:
    """scope.json 的必填末端欄位（缺少 scope.json 時列給使用者看）。"""
    return _required_leaves(input_schema["properties"]["scope"], "")


def scope_problems(scope, input_schema: dict) -> list:
    """授權範圍守門：回傳不合格的必填欄位（空清單＝可以分析）。規則全部來自 input-schema.json 的 scope 定義；
    JS 那邊由 assets/scope-gate.js 依同一份 schema 判定（見 docs/adr/0004），兩邊由 tests/fixtures/scope-cases.json 守住一致。"""
    _assert_supported(input_schema["properties"]["scope"], "")
    return _check(scope if isinstance(scope, dict) else {}, input_schema["properties"]["scope"], "")


# schema 的「至少一個非空白字元」：明確列出空白字元，取 Python 與 JS 兩邊 \s 的聯集。
# 不用 \S：Python 把 U+001C–U+001F、U+0085 當空白而 JS 不當，JS 把 U+FEFF 當空白而 Python 不當
NON_BLANK_PATTERN = r"[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"


def _rule_text(node: dict, path: str) -> str:
    """一個必填欄位的 schema 節點寫成給人看的規則（scope_rule_note 用，與 assets/scope-gate.js 的 ruleText 相同）。
    說明必須涵蓋節點的每一條規則：寫不出來的就丟出 ValueError，不退回比較寬鬆的說明——模型側守門只看得到這段說明（見 docs/adr/0005）。"""
    def unsupported(keyword):
        raise ValueError(f"授權範圍的規則說明寫不出 schema 關鍵字 {keyword}（{path}）；兩份規則說明都要實作它，見 docs/adr/0005")

    kind = node.get("type")
    if kind == "string":
        if node.get("minLength", 0) > 1:
            unsupported(f"minLength: {node['minLength']}")
        if node.get("format") == "date":
            return unsupported("pattern") if "pattern" in node else "須為 YYYY-MM-DD 的有效日期"
        if "pattern" in node:
            return "須含非空白字元" if node["pattern"] == NON_BLANK_PATTERN else unsupported("pattern")
        return "須為非空字串" if node.get("minLength") else "須為字串"
    if kind == "array":
        if node.get("minItems", 0) > 1:
            unsupported(f"minItems: {node['minItems']}")
        text = "須為非空陣列" if node.get("minItems") else "須為陣列"
        return text + (_items_text(node["items"], unsupported) if "items" in node else "")
    if kind == "boolean":
        return "須為布林值"
    if kind is None:
        return "須提供"
    return unsupported(f"type: {kind}")


def _items_text(items: dict, unsupported) -> str:
    if items.get("type") != "string":
        unsupported("items")
    if items.get("minLength", 0) > 1:
        unsupported(f"minLength: {items['minLength']}")
    if "format" in items:
        unsupported("format")
    if "pattern" in items:
        return "，且每項為非空白字串" if items["pattern"] == NON_BLANK_PATTERN else unsupported("pattern")
    return "，且每項為非空字串" if items.get("minLength") else "，且每項為字串"


def scope_rule_note(input_schema: dict) -> str:
    """把 schema 的 scope 規則寫成給人看的說明（規則改了，說明跟著改），不加括號。守門的中止訊息附上它；
    JS 那邊 assets/scope-gate.js 的 scopeRuleNote() 產生同一段，由建置寫進核心提示詞（見 docs/adr/0005）。"""
    _assert_supported(input_schema["properties"]["scope"], "")  # 守門不認得的關鍵字，說明也寫不出來：先擋下，不寫出比較寬鬆的說明
    groups = {}
    for path, node in _required_leaf_nodes(input_schema["properties"]["scope"], ""):
        groups.setdefault(_rule_text(node, path), []).append(path.rsplit(".", 1)[-1])
    return "；".join(f"{'、'.join(names)} {rule}" for rule, names in groups.items())


# ---------------------------------------------------------------------------
# 載入輸入
# ---------------------------------------------------------------------------

@dataclass
class Inputs:
    scope: dict
    files: list = field(default_factory=list)      # [{name, category, label, raw, data, records}]，會送進提示詞
    missing: list = field(default_factory=list)    # 本次未提供的輸入（含 --exclude 與無法解析者）
    unparsable: dict = field(default_factory=dict)  # 無法解析的檔案：{檔名: 錯誤訊息}（也列在 missing）
    findings: list = field(default_factory=list)   # 預檢發現 [PreflightFinding]：只警告、不中止


def _parse(name: str, raw: str):
    """回傳 (資料, 欄位標頭)。CSV 的資料是列（dict 清單）、欄位標頭是第一列；JSON 沒有欄位標頭。
    無法解析時丟出 ValueError。"""
    if name.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(raw))
        rows = list(reader)
        return rows, list(reader.fieldnames or [])
    return json.loads(raw), None


def count_records(data) -> int | None:
    """預先計算筆數（供資料品質與驗收第 1 項）；單一物件、無法判定時回傳 None。"""
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        for key in ("exposures", "controls", "actors", "edges"):
            if isinstance(data.get(key), list):
                return len(data[key])
    return None


def load_inputs(input_dir: Path, exclude: frozenset, input_schema: dict) -> Inputs:
    """讀入 9 個輸入檔（utf-8-sig，可處理 BOM）。授權範圍缺少或不合格就中止；
    --exclude 的類別與無法解析的檔案都視為未提供，不送進提示詞。"""
    scope_path = input_dir / "scope.json"
    if "scope" in exclude or not scope_path.exists():
        fields = ", ".join(required_scope_fields(input_schema))
        raise Abort("[中止] 找不到 scope.json（授權範圍與分析參數）。依共用任務規格第 2.1 節，無授權範圍不得分析。"
                    f"請提供含下列欄位的 scope.json：{fields}")
    try:
        scope = json.loads(scope_path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise Abort(f"[中止] scope.json 無法解析：{exc}") from exc
    problems = scope_problems(scope, input_schema)
    if problems:
        raise Abort("[中止] scope.json 缺少或不合格的必填欄位：" + ", ".join(problems) + f"（{scope_rule_note(input_schema)}）")

    inputs = Inputs(scope=scope)
    for name, category, label, _ in INPUT_FILES:
        if category in exclude:
            inputs.missing.append(f"{name}（{label}；依 --exclude 排除）")
            continue
        path = input_dir / name
        if not path.exists():
            inputs.missing.append(f"{name}（{label}）")
            continue
        try:
            raw = path.read_text(encoding="utf-8-sig")
            data, columns = _parse(name, raw)
        except (ValueError, UnicodeDecodeError, csv.Error) as exc:
            inputs.missing.append(f"{name}（{label}；無法解析：{exc}）")
            inputs.unparsable[name] = str(exc)
            continue
        inputs.files.append({"name": name, "category": category, "label": label, "raw": raw, "data": data,
                             "columns": columns, "records": count_records(data)})
    inputs.findings = script_preflight(inputs, input_schema)
    return inputs


class PreflightKind:
    """預檢發現的種類（kind）：一種問題一個常數，渲染端依它分支、計數或取 detail，不比對訊息字串。"""
    MISSING_REQUIRED_FILE = "missing_required_file"  # 缺少必要輸入（含無法解析而沒有載入的必要檔）
    EMPTY_REQUIRED_FILE = "empty_required_file"  # 必要檔案 0 筆資料
    MISSING_COLUMNS = "missing_columns"  # CSV 標頭缺必填欄位；detail＝欄位清單
    ROWS_MISSING_FIELDS = "rows_missing_fields"  # JSON 清單有 N 筆缺必填欄位；detail＝{count, fields}
    OBJECT_MISSING_FIELDS = "object_missing_fields"  # JSON 物件缺必填欄位；detail＝欄位清單
    NESTED_ROWS_MISSING_FIELDS = "nested_rows_missing_fields"  # JSON 物件裡的清單有 N 筆缺必填欄位；detail＝{key, count, fields}
    DUPLICATE_ASSET_ID = "duplicate_asset_id"  # 重複 asset_id；detail＝重複的筆數
    OUT_OF_SCOPE_ASSET = "out_of_scope_asset"  # 範圍外資產；detail＝asset_id 清單
    INVALID_VALUE = "invalid_value"  # 數值欄位不是數字
    OUT_OF_RANGE = "out_of_range"  # 數值超出範圍
    DANGLING_REFERENCE = "dangling_reference"  # 指向不存在資產的參照
    NON_OBJECT_EDGE = "non_object_edge"  # 拓樸 edges 裡不是物件的項目
    DANGLING_EDGE = "dangling_edge"  # 指向不存在資產的邊，一條邊一筆；detail＝{from, to, missing}
    UNLISTED_HOST = "unlisted_host"  # 未納入清冊的對外資產；detail＝hostname 清單
    UNPARSABLE = "unparsable"  # 檔案無法解析；detail＝錯誤訊息（不列在提示詞）
    NOT_AN_OBJECT = "not_an_object"  # schema 是物件、資料卻不是物件（不列在提示詞）


# 預檢發現的嚴重度（見 GLOSSARY.md「預檢發現」）；哪一種問題是哪一級，只在本模組決定（理由見 script_preflight）
PROBLEM, WARNING, ANOMALY = "必要問題", "警告", "異常"
REQUIRED_FILES = {name for name, _, _, required in INPUT_FILES if required}

# 提示詞與 main() 的 stderr 不列的 kind（理由見 preflight_lines）
NOT_IN_PROMPT = {PreflightKind.UNPARSABLE, PreflightKind.NOT_AN_OBJECT}


@dataclass(frozen=True)
class PreflightFinding:
    """一筆預檢發現：哪個檔案、哪一種問題（kind，見 PreflightKind）、嚴重度、給人看的訊息，
    以及渲染需要的結構化細節 detail（形狀依 kind 而定，寫在 PreflightKind 各常數旁；沒有就是 None）。"""
    file: str
    kind: str
    severity: str
    message: str
    detail: object = None


def _file_severity(name: str) -> str:
    """缺欄位、無法解析這類檔案層級的問題：必要檔案是必要問題，建議檔是警告。"""
    return PROBLEM if name in REQUIRED_FILES else WARNING


def script_preflight(inputs: Inputs, input_schema: dict) -> list:
    """腳本預檢（見 GLOSSARY.md）：回傳有順序的 [PreflightFinding]。順序＝提示詞「腳本預檢結果」的順序：
    必要檔案 → schema 必填欄位 → 資料完整性；提示詞不列的「無法解析」「結構不是物件」排在最後。
    任何一列資料缺值或型別不對，都只會變成預檢發現，不會讓腳本預檢本身失敗。

    嚴重度放在這裡、而不是交給各渲染端：哪一種問題該擋下分析是規則，不是呈現方式，只能有一份。
    但它只給 Claude 與 Gemini 技能的 validate_inputs.py 用（依它決定結束碼）；五支 api-workflow.py 刻意不看嚴重度——
    腳本預檢只警告、不阻擋分析，授權範圍以外的問題都交給模型寫進資料品質章節並下修信心（#59）。"""
    loaded = {f["name"]: f for f in inputs.files}
    return (_required_file_findings(loaded) + _schema_field_findings(inputs.files, input_schema)
            + _integrity_findings(inputs) + _file_status_findings(inputs, input_schema))


def preflight_lines(findings: list) -> list:
    """提示詞「腳本預檢結果」與 main() 的 stderr 共用的「檔名：訊息」各行，排除 NOT_IN_PROMPT 的兩種 kind：
    無法解析的檔案已經列在【本次未提供的輸入】，不重複；結構不是物件從來不在提示詞裡，
    排除它是為了讓模型看到的文字逐字不變（#59）。"""
    return [f"{f.file}：{f.message}" for f in findings if f.kind not in NOT_IN_PROMPT]


def _required_file_findings(loaded: dict) -> list:
    """必要輸入是否齊全、是否至少有一筆資料（scope.json 另由守門處理）。"""
    findings = []
    for name, _, label, required in INPUT_FILES:
        if not required or name == "scope.json":
            continue
        if name not in loaded:
            findings.append(PreflightFinding(name, PreflightKind.MISSING_REQUIRED_FILE, PROBLEM,
                                             f"缺少必要輸入（{label}）；只能產出曝險面清單並下修信心"))
        elif loaded[name]["records"] == 0:
            findings.append(PreflightFinding(name, PreflightKind.EMPTY_REQUIRED_FILE, PROBLEM, "必要檔案 0 筆資料"))
    return findings


def required_columns(category: str, input_schema: dict) -> list:
    """CSV 類輸入（schema 是陣列）每一列的必填欄位；不是陣列的類別回傳空清單。"""
    node = input_schema["properties"].get(category, {})
    return node.get("items", {}).get("required", []) if node.get("type") == "array" else []


def _schema_field_findings(files: list, input_schema: dict) -> list:
    """input-schema.json 的必填欄位：CSV 看欄位標頭，JSON 清單看每一筆，JSON 物件看物件本身與其中清單的每一筆。"""
    findings = []
    for f in files:
        node = input_schema["properties"].get(f["category"], {})
        data, name = f["data"], f["name"]
        if f["category"] == "scope":
            continue
        if node.get("type") == "array":
            required = required_columns(f["category"], input_schema)
            if f["columns"] is not None:
                absent = [k for k in required if k not in f["columns"]]
                if absent:
                    findings.append(PreflightFinding(name, PreflightKind.MISSING_COLUMNS, _file_severity(name),
                                                     f"缺少必填欄位 {', '.join(absent)}", absent))
            elif isinstance(data, list):
                bad = sum(1 for r in data if not isinstance(r, dict) or any(k not in r for k in required))
                if required and bad:
                    findings.append(PreflightFinding(name, PreflightKind.ROWS_MISSING_FIELDS, _file_severity(name),
                                                     f"有 {bad} 筆缺少必填欄位（{', '.join(required)}）",
                                                     {"count": bad, "fields": required}))
        elif node.get("type") == "object" and isinstance(data, dict):
            absent = [k for k in node.get("required", []) if k not in data]
            if absent:
                findings.append(PreflightFinding(name, PreflightKind.OBJECT_MISSING_FIELDS, _file_severity(name),
                                                 f"缺少必填欄位 {', '.join(absent)}", absent))
            for key, sub in node.get("properties", {}).items():
                item_required = sub.get("items", {}).get("required", []) if sub.get("type") == "array" else []
                rows = data.get(key) if isinstance(data.get(key), list) else []
                bad = sum(1 for r in rows if not isinstance(r, dict) or any(k not in r for k in item_required))
                if item_required and bad:
                    findings.append(PreflightFinding(name, PreflightKind.NESTED_ROWS_MISSING_FIELDS, _file_severity(name),
                                                     f"{key} 有 {bad} 筆缺少必填欄位（{', '.join(item_required)}）",
                                                     {"key": key, "count": bad, "fields": item_required}))
    return findings


def _in_range(value, low: float, high: float):
    """True／False＝是否在範圍內；None＝不是數字（欄位不足的列，值會是 None）。"""
    try:
        return low <= float(value) <= high
    except (TypeError, ValueError):
        return None


def _integrity_findings(inputs: Inputs) -> list:
    """資料完整性（嚴重度一律是異常）：重複、範圍外、數值範圍、懸空參照、拓樸的邊、未納入清冊的對外資產。"""
    findings = []

    def anomaly(name, kind, message, detail=None):
        findings.append(PreflightFinding(name, kind, ANOMALY, message, detail))

    loaded = {f["name"]: f for f in inputs.files}
    authorized = inputs.scope.get("authorized_scope") if isinstance(inputs.scope.get("authorized_scope"), dict) else {}
    in_scope = set(authorized.get("in_scope_assets") or [])
    assets = loaded.get("assets.csv", {}).get("data") or []
    # 只看有 asset_id 的列：缺這個欄位（另有缺欄位的預檢發現）時不能算成全部重複，也不能把每個參照都當成懸空
    listed = [r.get("asset_id") for r in assets if r.get("asset_id")]
    asset_ids = set(listed)
    if listed:
        dup = len(listed) - len(asset_ids)
        if dup:
            anomaly("assets.csv", PreflightKind.DUPLICATE_ASSET_ID, f"重複 asset_id ×{dup}", dup)
        outside = sorted(asset_ids - in_scope)
        if outside:
            anomaly("assets.csv", PreflightKind.OUT_OF_SCOPE_ASSET, f"範圍外資產（分析時應排除）：{', '.join(outside)}", outside)
        for r in assets:
            ok = _in_range(r.get("business_criticality"), 1, 5)
            if ok is None:
                anomaly("assets.csv", PreflightKind.INVALID_VALUE, f"{r.get('asset_id')} business_criticality 無效")
            elif not ok:
                anomaly("assets.csv", PreflightKind.OUT_OF_RANGE, f"{r.get('asset_id')} business_criticality 超出 1–5")
    for r in loaded.get("vulnerabilities.csv", {}).get("data") or []:
        ok = _in_range(r.get("cvss_base"), 0, 10)
        if ok is None:
            anomaly("vulnerabilities.csv", PreflightKind.INVALID_VALUE, f"{r.get('finding_id')} cvss_base 無效")
        elif not ok:
            anomaly("vulnerabilities.csv", PreflightKind.OUT_OF_RANGE, f"{r.get('finding_id')} cvss_base 超出 0–10")
        if asset_ids and r.get("asset_id") not in asset_ids:
            anomaly("vulnerabilities.csv", PreflightKind.DANGLING_REFERENCE, f"{r.get('finding_id')} 指向不存在資產 {r.get('asset_id')}")
    for r in loaded.get("identities.csv", {}).get("data") or []:
        for a in str(r.get("linked_assets") or "").split(";"):
            if a and asset_ids and a not in asset_ids:
                anomaly("identities.csv", PreflightKind.DANGLING_REFERENCE, f"{r.get('identity_id')} linked_assets 指向不存在資產 {a}")
    topology = loaded.get("topology.json", {}).get("data")
    if isinstance(topology, dict) and asset_ids:
        for e in topology.get("edges", []) if isinstance(topology.get("edges"), list) else []:
            if not isinstance(e, dict):
                anomaly("topology.json", PreflightKind.NON_OBJECT_EDGE, f"edges 裡有不是物件的項目（{e!r}）")
                continue
            dangling = [str(e.get(end)) for end in ("from", "to") if e.get(end) != "internet" and e.get(end) not in asset_ids]
            if dangling:  # 一條邊一筆
                anomaly("topology.json", PreflightKind.DANGLING_EDGE, f"邊 {e.get('from')}→{e.get('to')} 指向不存在資產 {', '.join(dangling)}",
                        {"from": e.get("from"), "to": e.get("to"), "missing": dangling})
    hosts = unlisted_hosts(loaded.get("exposures.json", {}).get("data"))
    if hosts:
        anomaly("exposures.json", PreflightKind.UNLISTED_HOST, f"未納入清冊的對外資產 {', '.join(str(h) for h in hosts)}", hosts)
    return findings


def _file_status_findings(inputs: Inputs, input_schema: dict) -> list:
    """檔案層級的狀態：無法解析、schema 是物件但資料不是物件（兩者都不列在提示詞，見 NOT_IN_PROMPT）。"""
    loaded = {f["name"]: f for f in inputs.files}
    findings = []
    for name, category, _, _ in INPUT_FILES:
        if name in inputs.unparsable:
            findings.append(PreflightFinding(name, PreflightKind.UNPARSABLE, _file_severity(name), f"無法解析：{inputs.unparsable[name]}",
                                             inputs.unparsable[name]))
        elif (name in loaded and category != "scope" and input_schema["properties"].get(category, {}).get("type") == "object"
              and not isinstance(loaded[name]["data"], dict)):
            findings.append(PreflightFinding(name, PreflightKind.NOT_AN_OBJECT, WARNING, "結構不是物件"))
    return findings


def unlisted_hosts(exposures) -> list:
    """exposures.json 裡沒有對應 asset_id 的對外資產（未納入清冊），回傳其 hostname。"""
    if not isinstance(exposures, dict) or not isinstance(exposures.get("exposures"), list):
        return []
    return [e.get("hostname") for e in exposures["exposures"] if isinstance(e, dict) and not e.get("asset_id")]


# ---------------------------------------------------------------------------
# 提示詞：system＝核心提示詞＋平臺備註；第一段要報告，第二段要 JSON
# ---------------------------------------------------------------------------

def extract_core_prompt(md: str) -> str:
    """核心提示詞＝core-prompt.md 裡第一個 ```text 區塊；找不到就中止（與 JS 版 extractCorePrompt 一致，不改用全文）。"""
    m = re.search(r"```text\n(.*?)\n```", md.replace("\r\n", "\n"), re.S)
    if not m:
        raise Abort("[錯誤] 找不到 core-prompt.md 內的 ```text 區塊（核心提示詞）")
    return m.group(1)


def build_system_prompt(core_prompt_md: str, platform_note: str) -> str:
    core = extract_core_prompt(core_prompt_md)
    return f"{core}\n\n{platform_note}" if platform_note else core


def scoped_files(inputs: Inputs) -> list:
    """模型只接收範圍內的結構化資料；輸入檔與腳本預檢留在本機。"""
    import copy
    allowed = set(inputs.scope["authorized_scope"]["in_scope_assets"])

    def rows(value):
        return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []

    def in_scope(value):
        return isinstance(value, str) and value in allowed

    def refs(value):
        return [ref for ref in value if in_scope(ref)] if isinstance(value, list) else []

    result = []
    for source in inputs.files:
        f = copy.deepcopy(source)
        data, category = f["data"], f["category"]
        if category in ("assets", "vulnerabilities", "misconfigurations"):
            data = [row for row in rows(data) if in_scope(row.get("asset_id"))]
        elif category == "identities":
            identities = []
            for row in rows(data):
                linked = refs(row["linked_assets"].split(";")) if isinstance(row.get("linked_assets"), str) else []
                if linked:
                    row["linked_assets"] = ";".join(linked)
                    identities.append(row)
            data = identities
        elif category == "exposures":
            data = data if isinstance(data, dict) else {}
            data["exposures"] = [row for row in rows(data.get("exposures")) if in_scope(row.get("asset_id"))]
        elif category == "controls":
            data = data if isinstance(data, dict) else {}
            controls = []
            for row in rows(data.get("controls")):
                row["coverage_assets"] = refs(row.get("coverage_assets"))
                row["gaps"] = refs(row.get("gaps"))
                if row["coverage_assets"] or row["gaps"]:
                    controls.append(row)
            data["controls"] = controls
        elif category == "topology":
            data = data if isinstance(data, dict) else {}
            data["crown_jewels"] = refs(data.get("crown_jewels"))
            data["edges"] = [e for e in rows(data.get("edges")) if (e.get("from") == "internet" or in_scope(e.get("from"))) and in_scope(e.get("to"))]
        f["data"] = data
        if f["name"].endswith(".csv"):
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=f["columns"], lineterminator="\n", extrasaction="ignore")
            writer.writeheader()
            writer.writerows(data)
            f["raw"] = buf.getvalue()
        else:
            f["raw"] = json.dumps(data, ensure_ascii=False)
        if data == source["data"]:
            f["raw"] = source["raw"]
        f["records"] = count_records(data)
        result.append(f)
    return result


def build_report_prompt(inputs: Inputs) -> str:
    """第一段 user 訊息：只補模型自己算不出或需要事先知道的資訊（筆數、缺漏、腳本預檢結果），
    不重複核心提示詞已有的規則（八步流程、免責聲明），也不放本機路徑。"""
    parts = ["以下是授權範圍內的輸入資料。請依系統提示的流程產出完整的正體中文 Markdown 報告；"
             "先回報每個檔案的筆數、缺欄位與異常值，缺漏不得補造。這一段先不要輸出 JSON。", ""]
    parts.append("【輸入檔案筆數（排除前，本機統計）】" + "；".join(f"{f['name']}：{f['records'] if f['records'] is not None else 1}" for f in inputs.files))
    if inputs.missing:
        parts += ["【本次未提供的輸入】" + "；".join(inputs.missing) + "。請依規則以替代方式處理並標示。", ""]
    counts = {}
    for finding in inputs.findings:
        if finding.kind in NOT_IN_PROMPT:
            continue
        key = (finding.file, finding.kind, finding.severity)
        counts[key] = counts.get(key, 0) + 1
    lines = ["範圍外資料與未確認歸屬的對外資產已於送出前排除；原始腳本預檢請在本機檢視。"]
    lines += [f"{name}：{kind} ×{count}（{severity}）" for (name, kind, severity), count in counts.items()]
    if lines:
        parts += ["【腳本預檢結果】以下是腳本對輸入的機械檢查，請寫進資料品質章節並據以下修信心："]
        parts += [f"- {line}" for line in lines]
        parts.append("")
    for f in scoped_files(inputs):
        count = f"（腳本預先計算筆數：{f['records']}）" if f["records"] is not None else ""
        fence = "csv" if f["name"].endswith(".csv") else "json"
        parts += [f"### {f['name']} — {f['label']}{count}", f"```{fence}\n{f['raw'].strip()}\n```", ""]
    return "\n".join(parts).rstrip() + "\n"


def build_json_prompt(output_schema_text: str, generated_by: str) -> str:
    """第二段 user 訊息：延續同一對話，只輸出符合 output-schema.json 的單一 JSON 物件。
    明確寫出「json」字樣：部分平臺的 JSON 模式要求提示詞裡出現這個字。"""
    return ("請把上一則報告的內容轉為單一 JSON 物件（json），嚴格符合下列 JSON Schema（output-schema.json）。"
            "只輸出 JSON，不要 Markdown 圍欄、不要任何說明文字。"
            f"meta.generated_by 請填「{generated_by}」；meta.scoring_rules 說明實際使用的評分規則；"
            "meta.disclaimer 填入固定聲明。\n\n```json\n" + output_schema_text.strip() + "\n```")



# ---------------------------------------------------------------------------
# 兩段式對話與模型 adapter
# ---------------------------------------------------------------------------
#
# 模型 adapter（各平臺 api-workflow.py 提供）需要具備：
#   platform           平臺代號，用於輸出檔名（例如 "deepseek" → deepseek-report.md）
#   display_name       顯示名稱
#   model_env          模型 ID 的環境變數名稱；default_model 為沒有設定時的預設值
#   platform_note      接在核心提示詞後面的平臺備註
#   add_arguments(parser)        加上平臺專屬的 CLI 參數
#   describe(args)               回傳要印出的平臺資訊（端點、JSON 模式等），dry-run 與正式執行都會印
#   generated_by(args)           meta.generated_by 的寫法
#   supports_json_mode(args)     這次執行能否使用平臺的 JSON 模式（例如 response_format）；核心只在 json 階段開啟
#   send(messages, stage, args, json_mode)
#                                送出整串訊息（[{role, content}]，第一則是 system）並回傳文字。stage 是 "report"
#                                或 "json"，temperature 等設定由 adapter 依 stage 決定；json_mode 為 True 時使用 JSON 模式。
#                                SDK 在這裡才載入，--dry-run 不會呼叫它。
#   adapter 遇到使用者能處理的問題（缺 SDK、缺金鑰）時丟出 Abort(訊息)；其他例外由核心轉成結束碼 1。

def run_conversation(adapter, args, system_prompt: str, report_prompt: str, json_prompt: str):
    """第一段要報告；延續同一對話，第二段要 JSON。回傳 (報告, JSON 回覆原文)。"""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": report_prompt}]
    report = adapter.send(list(messages), "report", args, False)
    messages += [{"role": "assistant", "content": report}, {"role": "user", "content": json_prompt}]
    return report, adapter.send(list(messages), "json", args, bool(adapter.supports_json_mode(args)))


class DryRunAdapter:
    """--dry-run 用的 adapter：走同一段兩段式對話，但不呼叫模型；把每一段新增的 user 訊息印到 stdout。"""

    def __init__(self, platform_adapter):
        self.platform_adapter = platform_adapter

    def supports_json_mode(self, args):
        return self.platform_adapter.supports_json_mode(args)

    def send(self, messages, stage, args, json_mode):
        if stage == "report":
            print("----- SYSTEM PROMPT -----")
            print(messages[0]["content"])
            print("----- USER PROMPT（第 1 段：Markdown 報告） -----")
        else:
            print("----- USER PROMPT（第 2 段：JSON） -----")
        print(messages[-1]["content"])
        return f"（dry-run：未呼叫模型，這裡會是 {self.platform_adapter.display_name} 的第 1 段報告）"


# ---------------------------------------------------------------------------
# 輸出
# ---------------------------------------------------------------------------

JSON_PARSE_FAILED = 4


def parse_json_loose(text: str):
    """去掉可能的 ```json 圍欄後解析；不行就取第一個 { 到最後一個 }。失敗回傳 None。"""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m:
        t = m.group(1)
    else:
        start, end = t.find("{"), t.rfind("}")
        if start != -1 and end > start:
            t = t[start:end + 1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        return None


def output_problems(value, schema, root=None, path="$"):
    """依輸出 schema 驗證型別、參照、組合、必要欄位及界限；未知規則拒絕處理。"""
    import math
    root = schema if root is None else root
    supported = {"$schema", "$id", "$defs", "$ref", "title", "description", "type", "required", "properties", "items", "allOf", "enum", "minimum", "maximum", "minLength", "maxLength", "minItems"}
    if set(schema) - supported:
        raise ValueError("不支援的輸出 schema 規則：" + str(set(schema) - supported))
    errors = []
    if "$ref" in schema:
        node = root
        for key in schema["$ref"][2:].split("/"):
            node = node[key]
        errors += output_problems(value, node, root, path)
    for node in schema.get("allOf", []):
        errors += output_problems(value, node, root, path)
    kinds = schema.get("type", [])
    kinds = [kinds] if isinstance(kinds, str) else kinds
    checks = {**_TYPE_CHECKS, "null": lambda v: v is None}
    if kinds and not any(checks[k](value) for k in kinds):
        return errors + [path + " 型別不合格"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(path + " 不在允許值中")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value) or value < schema.get("minimum", -math.inf) or value > schema.get("maximum", math.inf):
            errors.append(path + " 數值超出範圍")
    if isinstance(value, str) and not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", math.inf):
        errors.append(path + " 字數不合格")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(path + " 項目不足")
        for i, item in enumerate(value):
            errors += output_problems(item, schema.get("items", {}), root, f"{path}[{i}]")
    if isinstance(value, dict):
        errors += [path + "." + key + " 必填" for key in schema.get("required", []) if key not in value]
        for key, node in schema.get("properties", {}).items():
            if key in value:
                errors += output_problems(value[key], node, root, path + "." + key)
    return errors


def save_outputs(output_dir: Path, platform: str, report: str, json_text: str, output_schema: dict) -> int:
    """寫出 <平臺>-report.md 與 <平臺>-output.json；JSON 解析失敗時另存 <平臺>-output.raw.txt 並回傳 4。
    輸出不符合 schema 時保留原始回應並回傳 4；合成案例的業務驗收另交給 scripts/check-acceptance.mjs。"""
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / f"{platform}-report.md"
    report_path.write_text(report, encoding="utf-8")
    print(f"[完成] Markdown 報告：{report_path}")
    (output_dir / f"{platform}-output.json").unlink(missing_ok=True)
    data = parse_json_loose(json_text)
    if not isinstance(data, dict):
        raw_path = output_dir / f"{platform}-output.raw.txt"
        raw_path.write_text(json_text, encoding="utf-8")
        print(f"[警告] JSON 解析失敗，原始回應已存至 {raw_path}；請人工檢查或重跑。", file=sys.stderr)
        return JSON_PARSE_FAILED
    problems = output_problems(data, output_schema)
    if problems:
        (output_dir / f"{platform}-output.raw.txt").write_text(json_text, encoding="utf-8")
        (output_dir / f"{platform}-output.json").unlink(missing_ok=True)
        print("[錯誤] 輸出不符合 output-schema.json：" + "；".join(problems), file=sys.stderr)
        return 4
    json_path = output_dir / f"{platform}-output.json"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[完成] JSON 輸出：{json_path}")
    return 0


# ---------------------------------------------------------------------------
# 主程式
# ---------------------------------------------------------------------------

def _read_shared(name: str) -> str:
    path = SHARED_DIR / name
    if not path.exists():
        raise Abort(f"[錯誤] 找不到共用檔案：{path}")
    return path.read_text(encoding="utf-8-sig")


def build_parser(adapter) -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=f"{adapter.display_name} 先制型曝險分析 API 工作流程")
    ap.add_argument("--input-dir", type=Path, default=REPO_ROOT / "examples" / "synthetic-org",
                    help="輸入資料夾（預設 examples/synthetic-org）")
    ap.add_argument("--output-dir", type=Path, default=REPO_ROOT / "output", help="輸出資料夾（預設 output/）")
    ap.add_argument("--model", default=os.environ.get(adapter.model_env, adapter.default_model),
                    help=f"模型 ID（預設取 {adapter.model_env} 或 {adapter.default_model}；請以官方列表確認）")
    ap.add_argument("--dry-run", action="store_true", help="只跑流程、印出兩段提示詞，不呼叫 API、不載入 SDK、不需 API key")
    ap.add_argument("--exclude", action="append", choices=EXCLUDE_CHOICES, default=[],
                    help="模擬缺漏：排除某類輸入（可重複）；排除 scope 會直接中止（驗收第 6、7 項）")
    adapter.add_arguments(ap)
    return ap


def main(adapter, argv=None) -> int:
    """一次分析工作流程。結束碼：0 成功；1 輸入、授權範圍、環境或 API 錯誤；4 JSON 解析或 schema 驗證失敗。
    資訊訊息一律印到 stderr；stdout 只放產物路徑與 dry-run 的提示詞。"""
    args = build_parser(adapter).parse_args(argv)
    try:
        if not args.input_dir.is_dir():
            raise Abort(f"[錯誤] 輸入資料夾不存在：{args.input_dir}")
        input_schema = json.loads(_read_shared("input-schema.json"))
        output_schema_text = _read_shared("output-schema.json")
        system_prompt = build_system_prompt(_read_shared("core-prompt.md"), adapter.platform_note)
        inputs = load_inputs(args.input_dir, frozenset(args.exclude), input_schema)
        report_prompt = build_report_prompt(inputs)
        json_prompt = build_json_prompt(output_schema_text, adapter.generated_by(args))

        print(f"[資訊] 平臺：{adapter.display_name}  模型：{args.model}", file=sys.stderr)
        for line in adapter.describe(args):
            print(f"[資訊] {line}", file=sys.stderr)
        print("[資訊] 已載入檔案與筆數：", file=sys.stderr)
        for f in inputs.files:
            shown = f"{f['records']} 筆" if f["records"] is not None else "單一物件"
            print(f"  - {f['name']}: {shown}", file=sys.stderr)
        if inputs.missing:
            print("[資訊] 未提供：" + "；".join(inputs.missing), file=sys.stderr)
        for line in preflight_lines(inputs.findings):
            print(f"[預檢] {line}", file=sys.stderr)

        if args.dry_run:
            print(f"[DRY-RUN] 不會呼叫 API；system prompt {len(system_prompt)} 字元、第 1 段 {len(report_prompt)} 字元、"
                  f"第 2 段 {len(json_prompt)} 字元", file=sys.stderr)
            run_conversation(DryRunAdapter(adapter), args, system_prompt, report_prompt, json_prompt)
            return 0
        try:
            report, json_text = run_conversation(adapter, args, system_prompt, report_prompt, json_prompt)
        except Abort:
            raise
        except Exception as exc:  # noqa: BLE001 — SDK／網路錯誤一律以結束碼 1 回報，不印 traceback
            raise Abort(f"[錯誤] 呼叫 {adapter.display_name} API 失敗：{type(exc).__name__}: {exc}") from exc
        return save_outputs(args.output_dir, adapter.platform, report, json_text, json.loads(output_schema_text))
    except Abort as exc:
        print(str(exc), file=sys.stderr)
        return exc.exit_code
