"""模型 adapter 測試的共用 helper：載入平臺腳本、假的 openai（Chat Completions、Responses）／anthropic／xai_sdk／google.genai 模組、讓指定模組 import 失敗。

不連網、不需金鑰與 SDK。平臺腳本檔名含連字號（api-workflow.py），所以用 importlib 從路徑載入。
"""
import contextlib
import importlib.abc
import importlib.util
import shutil
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


def _with_finish(reply, normal):
    """replies 的一項：(內容, 結束原因) 或只有內容；只有內容時結束原因是 normal（該 SDK 的正常結束）。"""
    return reply if isinstance(reply, tuple) else (reply, normal)


def fake_openai(replies, reject_response_format=False):
    """回傳 (假的 openai 模組, 呼叫紀錄)。chat.completions.create 依序回傳 replies（可含 None）；
    每一項也可以寫成 (內容, finish_reason)，只寫內容時 finish_reason 是 "stop"（正常結束）。
    reject_response_format=True 時，帶 response_format 的呼叫會丟出例外（模擬端點不支援 JSON 模式）。"""
    record = {"clients": [], "calls": []}

    class Completions:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            if reject_response_format and "response_format" in kwargs:
                raise RuntimeError("response_format is not supported")
            content, finish_reason = _with_finish(replies.pop(0), "stop")
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=content),
                                                                        finish_reason=finish_reason)])

    class OpenAI:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.chat = types.SimpleNamespace(completions=Completions())

    return types.SimpleNamespace(OpenAI=OpenAI), record


def fake_openai_responses(replies):
    """回傳 (假的 openai 模組, 呼叫紀錄)，模擬 Responses API（client.responses.create）。replies 的字串
    包成只有 output_text 的回應（status 是 "completed"）；其他物件原樣回傳（用來測 output_text 為空時從 output 收集文字）。
    每一項也可以寫成 (內容, 結束原因)：結束原因是 completed／failed／cancelled 時放在 status；None 表示沒有 status；
    其他值當成 status="incomplete" 的 incomplete_details.reason（例如 max_output_tokens）。"""
    record = {"clients": [], "calls": []}

    class Responses:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            reply = replies.pop(0)
            if isinstance(reply, str):
                return types.SimpleNamespace(output_text=reply, output=[], status="completed", incomplete_details=None)
            if isinstance(reply, tuple):
                text, finish = reply
                if finish is None or finish in ("completed", "failed", "cancelled"):
                    return types.SimpleNamespace(output_text=text, output=[], status=finish, incomplete_details=None)
                return types.SimpleNamespace(output_text=text, output=[], status="incomplete",
                                             incomplete_details=types.SimpleNamespace(reason=finish))
            return reply

    class OpenAI:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.responses = Responses()

    return types.SimpleNamespace(OpenAI=OpenAI), record


def fake_anthropic(replies):
    """回傳 (假的 anthropic 模組, 呼叫紀錄)。每則回覆拆成兩個 text block，確認 adapter 會把它們接起來。
    每一項也可以寫成 (內容, stop_reason)，只寫內容時 stop_reason 是 "end_turn"（正常結束）。"""
    record = {"clients": [], "calls": []}

    class Messages:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            text, stop_reason = _with_finish(replies.pop(0), "end_turn")
            half = len(text) // 2
            return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text=text[:half]),
                                                  types.SimpleNamespace(type="text", text=text[half:])],
                                         stop_reason=stop_reason)

    class Anthropic:
        def __init__(self, api_key=None, base_url=None):
            record["clients"].append({"api_key": api_key, "base_url": base_url})
            self.messages = Messages()

    return types.SimpleNamespace(Anthropic=Anthropic), record


def fake_xai_sdk(replies):
    """回傳 ({"xai_sdk": ..., "xai_sdk.chat": ...}, 呼叫紀錄)。chat.create 記下參數（確認沒有傳 tools），
    append 的訊息以 (角色, 內容) 記錄，sample 依序回傳 replies。每一項也可以寫成 (內容, finish_reason)，
    只寫內容時 finish_reason 是 "REASON_STOP"（正常結束；真的 Response.finish_reason 也是列舉名稱的字串）。"""
    record = {"clients": [], "chats": []}

    class Chat:
        def __init__(self, kwargs):
            self.entry = {"create": kwargs, "messages": []}
            record["chats"].append(self.entry)

        def append(self, message):
            self.entry["messages"].append(message)

        def sample(self):
            content, finish_reason = _with_finish(replies.pop(0), "REASON_STOP")
            return types.SimpleNamespace(content=content, finish_reason=finish_reason)

    class Client:
        def __init__(self, api_key=None):
            record["clients"].append({"api_key": api_key})
            self.chat = types.SimpleNamespace(create=lambda **kwargs: Chat(kwargs))

    chat = types.SimpleNamespace(system=lambda text: ("system", text), user=lambda text: ("user", text),
                                 assistant=lambda text: ("assistant", text))
    return {"xai_sdk": types.SimpleNamespace(Client=Client, chat=chat), "xai_sdk.chat": chat}, record


def fake_google_genai(replies, reject_response_format=False):
    """回傳 ({"google": ..., "google.genai": ...}, 呼叫紀錄)。client.interactions.create 記下參數，依序回傳 replies
    （回應帶 id＝interaction-1、interaction-2…、output_text 與 status）；每一項也可以寫成 (內容, status)，只寫內容時
    status 是 "completed"（正常結束；Interaction 沒有原因欄位）。reject_response_format=True 時，帶 response_format 的呼叫會丟出例外。
    google 也要放進 sys.modules：from google import genai 會先找 google 這個 package。"""
    record = {"clients": [], "calls": []}

    class Interactions:
        def create(self, **kwargs):
            record["calls"].append(kwargs)
            if reject_response_format and "response_format" in kwargs:
                raise RuntimeError("response_format is not supported")
            text, status = _with_finish(replies.pop(0), "completed")
            return types.SimpleNamespace(id=f"interaction-{len(record['calls'])}", output_text=text, status=status)

    class Client:
        def __init__(self, api_key=None):
            record["clients"].append({"api_key": api_key})
            self.interactions = Interactions()

    genai = types.SimpleNamespace(Client=Client)
    return {"google": types.SimpleNamespace(genai=genai), "google.genai": genai}, record


VALID_JSON = (ROOT / "examples" / "acceptance-fixture.json").read_text(encoding="utf-8")


def as_modules(name, fake):
    """把 (假模組, 紀錄) 換成 ({模組名稱: 假模組}, 紀錄)，給 assert_stops_on_incomplete 的 fake 用。"""
    module, record = fake
    return {name: module}, record


# 四條 Chat Completions 路徑（DeepSeek、GLM、Grok --compat、Gemini --compat）共用的結束原因
CHAT_COMPLETIONS = dict(output_limit="length", other_incomplete="content_filter", missing_value=None)


def assert_stops_on_incomplete(test, run, fake, *, extra=(), calls, output_limit, other_incomplete, missing_value,
                               max_tokens_flag):
    """回覆不完整就中止（#161）的四種情境，每條 API 路徑各跑一次：
    run(*extra, modules=...) → (結束碼, stdout, stderr)；fake(replies) → (sys.modules 要放的模組, 呼叫紀錄)；
    calls(紀錄) → 呼叫了幾次；output_limit／other_incomplete／missing_value 是這種介面「因輸出上限」「其他不完整」
    「缺值」時的結束原因；max_tokens_flag：這個平臺有沒有 --max-tokens（決定提示怎麼寫）。"""
    out = test.out

    def run_with(replies):
        if out.exists():
            shutil.rmtree(out)
        modules, record = fake(replies)
        code, _, err = run(*extra, modules=modules)
        return code, calls(record), err, out.exists() and any(out.iterdir())

    with test.subTest("第 1 段因輸出上限"):
        code, n, err, saved = run_with([("# 報告寫到一半", output_limit), VALID_JSON])   # 第 2 段合格：沒中止的話會存檔、以 0 結束
        test.assertEqual((code, n, saved), (1, 1, False), err)
        for text in ("報告", "截斷", str(output_limit), "--max-tokens" if max_tokens_flag else "沒有輸出上限的參數"):
            test.assertIn(text, err)
    with test.subTest("第 2 段因輸出上限"):
        code, n, err, saved = run_with(["# 報告", (VALID_JSON[:200], output_limit)])
        test.assertEqual((code, n, saved), (1, 2, False), err)
        for text in ("JSON", "截斷", str(output_limit)):
            test.assertIn(text, err)
    with test.subTest("其他不完整"):
        code, n, err, saved = run_with([("# 報告寫到一半", other_incomplete), VALID_JSON])
        test.assertEqual((code, n, saved), (1, 1, False), err)
        test.assertIn(str(other_incomplete), err)
        test.assertNotIn("--max-tokens", err)
    with test.subTest("缺值放行"):
        code, n, err, saved = run_with([("# 報告", missing_value), (VALID_JSON, missing_value)])
        test.assertEqual((code, n, saved), (0, 2, True), err)


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
