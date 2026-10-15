"""模型 adapter 測試的共用 helper：載入平臺腳本、假的 openai／anthropic／xai_sdk 模組、讓指定模組 import 失敗。

不連網、不需金鑰與 SDK。平臺腳本檔名含連字號（api-workflow.py），所以用 importlib 從路徑載入。
"""
import contextlib
import importlib.abc
import importlib.util
import sys
import types
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]


def load_platform_script(platform: str):
    """載入 skills/<平臺>/api-workflow.py（不執行 __main__ 區塊）。"""
    path = ROOT / "skills" / platform / "api-workflow.py"
    spec = importlib.util.spec_from_file_location(f"{platform}_api_workflow", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_openai(replies, reject_response_format=False):
    """回傳 (假的 openai 模組, 呼叫紀錄)。chat.completions.create 依序回傳 replies（可含 None）；
    reject_response_format=True 時，帶 response_format 的呼叫會丟出例外（模擬端點不支援 JSON 模式）。"""
    record = {"clients": [], "calls": []}

    class Completions:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            if reject_response_format and "response_format" in kwargs:
                raise RuntimeError("response_format is not supported")
            content = replies.pop(0)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=content))])

    class OpenAI:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.chat = types.SimpleNamespace(completions=Completions())

    return types.SimpleNamespace(OpenAI=OpenAI), record


def fake_anthropic(replies):
    """回傳 (假的 anthropic 模組, 呼叫紀錄)。每則回覆拆成兩個 text block，確認 adapter 會把它們接起來。"""
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


def fake_xai_sdk(replies):
    """回傳 ({"xai_sdk": ..., "xai_sdk.chat": ...}, 呼叫紀錄)。chat.create 記下參數（確認沒有傳 tools），
    append 的訊息以 (角色, 內容) 記錄，sample 依序回傳 replies。"""
    record = {"clients": [], "chats": []}

    class Chat:
        def __init__(self, kwargs):
            self.entry = {"create": kwargs, "messages": []}
            record["chats"].append(self.entry)

        def append(self, message):
            self.entry["messages"].append(message)

        def sample(self):
            return types.SimpleNamespace(content=replies.pop(0))

    class Client:
        def __init__(self, api_key=None):
            record["clients"].append({"api_key": api_key})
            self.chat = types.SimpleNamespace(create=lambda **kwargs: Chat(kwargs))

    chat = types.SimpleNamespace(system=lambda text: ("system", text), user=lambda text: ("user", text),
                                 assistant=lambda text: ("assistant", text))
    return {"xai_sdk": types.SimpleNamespace(Client=Client, chat=chat), "xai_sdk.chat": chat}, record


class _Block(importlib.abc.MetaPathFinder):
    def __init__(self, names):
        self.names = names

    def find_spec(self, name, path=None, target=None):
        if name in self.names:
            raise ImportError(f"blocked {name}")
        return None


@contextlib.contextmanager
def blocked(*names):
    """在區塊內讓指定模組 import 失敗（用來確認 --dry-run 不載入 SDK、缺 SDK 時會好好中止）；離開時一定復原。"""
    blocker = _Block(names)
    sys.meta_path.insert(0, blocker)
    try:
        with mock.patch.dict(sys.modules):
            for name in names:
                sys.modules.pop(name, None)
            yield
    finally:
        sys.meta_path.remove(blocker)
