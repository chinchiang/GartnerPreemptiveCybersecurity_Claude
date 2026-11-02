"""真 SDK 冒煙測試（#162）：用 python3 tests/python/real_sdk_smoke.py <平臺> 執行。

adapter 測試用 fake_sdk.py 的假模組，證明不了 adapter 取欄位的寫法和真的 SDK 物件相符；這裡用已安裝 SDK 的真型別
建立回覆，替換 SDK 的 create／sample（不連網、不需金鑰），跑該平臺每條 API 路徑的 main：
  截斷：第 1 段因輸出上限被截斷 → 結束碼 1、只呼叫 1 次、沒有輸出檔，訊息說是被截斷（#161；判成其他原因的不完整也算失敗）
  正常：兩段都正常結束 → 結束碼 0、呼叫 2 次、存下報告與 JSON
SDK 由 .github/model-acceptance/<平臺>-requirements.txt 安裝；缺 SDK 時以 1 結束，不略過。
替換的位置（例如 openai.resources.chat.completions.Completions）是 SDK 的內部結構，升級 SDK 後這裡失敗時，
先對照新版 SDK 的型別，再看 adapter 與 analysis_workflow.py 的 INCOMPLETE 要不要跟著改。
檔名不是 test*.py，unittest discover 不會收；由 CI 的 real-sdk job 與 model-acceptance.yml 執行。
"""
import contextlib
import importlib
import io
import os
import sys
import tempfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake_sdk import ROOT, VALID_JSON, load_platform_script  # noqa: E402

# 各平臺要測的 SDK（import 名稱）
SDK_MODULES = {
    "chatgpt": ["openai"],
    "deepseek": ["openai"],
    "gemini": ["google.genai", "openai"],
    "glm": ["openai", "anthropic"],
    "grok": ["xai_sdk", "openai"],
}
API_KEYS = ["OPENAI_API_KEY", "XAI_API_KEY", "GLM_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY"]
TRUNCATED_REPORT = "# 報告寫到一半"


def chat_completions():
    """(替換的類別, 方法名稱, 截斷的回覆, 正常的回覆)：OpenAI Chat Completions 與相容端點。"""
    from openai.types.chat import ChatCompletion, ChatCompletionMessage
    from openai.types.chat.chat_completion import Choice
    import openai.resources.chat.completions as completions

    def reply(content, finish):
        return ChatCompletion.model_construct(id="x", object="chat.completion", created=0, model="m", choices=[
            Choice.model_construct(index=0, finish_reason=finish,
                                   message=ChatCompletionMessage.model_construct(role="assistant", content=content))])
    return completions.Completions, "create", reply(TRUNCATED_REPORT, "length"), lambda text: reply(text, "stop")


def responses():
    """OpenAI Responses（ChatGPT）。"""
    from openai.types.responses import Response, ResponseOutputMessage, ResponseOutputText
    from openai.types.responses.response import IncompleteDetails
    import openai.resources.responses as resources

    def reply(text, status, reason=None):
        message = ResponseOutputMessage.model_construct(
            id="m", type="message", role="assistant", status="completed",
            content=[ResponseOutputText.model_construct(type="output_text", text=text, annotations=[])])
        return Response.model_construct(id="r", object="response", model="m", status=status, output=[message],
                                        incomplete_details=IncompleteDetails(reason=reason) if reason else None)
    return resources.Responses, "create", reply(TRUNCATED_REPORT, "incomplete", "max_output_tokens"), lambda text: reply(text, "completed")


def anthropic_messages():
    """Anthropic Messages（GLM --anthropic-compatible）。"""
    from anthropic.types import Message, TextBlock
    import anthropic.resources.messages as messages

    def reply(text, stop):
        return Message.model_construct(id="m", type="message", role="assistant", model="m", stop_reason=stop,
                                       content=[TextBlock(type="text", text=text)])
    return messages.Messages, "create", reply(TRUNCATED_REPORT, "max_tokens"), lambda text: reply(text, "end_turn")


def xai_chat():
    """xai_sdk（Grok 預設）：用 proto 建真的 Response。"""
    from xai_sdk.proto import chat_pb2, sample_pb2
    import xai_sdk.chat as chat
    import xai_sdk.sync.chat as sync_chat

    def reply(text, finish):
        proto = chat_pb2.GetChatCompletionResponse(outputs=[chat_pb2.CompletionOutput(
            finish_reason=finish, message=chat_pb2.CompletionMessage(content=text, role=chat_pb2.MessageRole.ROLE_ASSISTANT))])
        return chat.Response(proto, 0)
    return (sync_chat.Chat, "sample", reply(TRUNCATED_REPORT, sample_pb2.FinishReason.REASON_MAX_LEN),
            lambda text: reply(text, sample_pb2.FinishReason.REASON_STOP))


def genai_interactions():
    """google-genai interactions（Gemini 預設）：只有 status，沒有原因欄位。"""
    from google import genai
    interaction = importlib.import_module("google.genai._gaos.types.interactions.interaction").Interaction
    interaction_ids = iter(range(1, 100))   # 第 2 段以 previous_interaction_id 接續第 1 段，id 要不同

    def reply(text, status):
        return interaction.model_construct(id=f"i{next(interaction_ids)}", status=status, output_text=text)
    return type(genai.Client(api_key="x").interactions), "create", reply(TRUNCATED_REPORT, "incomplete"), lambda text: reply(text, "completed")


# 各平臺的 API 路徑：(說明, adapter 類別名稱, 額外參數, 回覆的建立方式)
PATHS = {
    "chatgpt": [("Responses", "ChatGptAdapter", [], responses)],
    "deepseek": [("Chat Completions", "DeepSeekAdapter", [], chat_completions)],
    "gemini": [("interactions", "GeminiAdapter", [], genai_interactions),
               ("--compat", "GeminiAdapter", ["--compat"], chat_completions)],
    "glm": [("Chat Completions", "GlmAdapter", [], chat_completions),
            ("--anthropic-compatible", "GlmAdapter", ["--anthropic-compatible"], anthropic_messages)],
    "grok": [("xai_sdk", "GrokAdapter", [], xai_chat),
             ("--compat", "GrokAdapter", ["--compat"], chat_completions)],
}


def run_path(platform, adapter_name, extra, target, attr, replies):
    """跑一次 main；回傳 (結束碼, 呼叫次數, 輸出檔名, stderr)。"""
    module = load_platform_script(platform)
    err = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {k: "test-key" for k in API_KEYS}), \
            mock.patch.object(target, attr, side_effect=replies) as fake, \
            contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
        out = Path(tmp) / "out"
        code = module.analysis_workflow.main(getattr(module, adapter_name)(), [
            "--input-dir", str(ROOT / "examples" / "synthetic-org"), "--output-dir", str(out), *extra])
        saved = sorted(p.name for p in out.iterdir()) if out.exists() else []
    return code, fake.call_count, saved, err.getvalue()


def errors(stderr):
    """stderr 裡的 [錯誤] 行（筆數與預檢發現不列）。"""
    return "／".join(line for line in stderr.splitlines() if line.startswith("[錯誤]")) or "（沒有錯誤訊息）"


def check_path(platform, adapter_name, extra, build):
    """回傳這條路徑的問題清單（空的就是通過）。"""
    problems = []
    target, attr, truncated, normal = build()
    code, calls, saved, err = run_path(platform, adapter_name, extra, target, attr, [truncated, normal(VALID_JSON)])
    if (code, calls, saved) != (1, 1, []) or "被截斷" not in err:
        problems.append(f"截斷：結束碼 {code}、呼叫 {calls} 次、輸出檔 {saved or '無'}（預期 1、1 次、無，且訊息說是被截斷）；{errors(err)}")
    target, attr, _, normal = build()
    code, calls, saved, err = run_path(platform, adapter_name, extra, target, attr, [normal("# 報告"), normal(VALID_JSON)])
    expected = [f"{platform}-output.json", f"{platform}-report.md"]
    if (code, calls, saved) != (0, 2, expected):
        problems.append(f"正常：結束碼 {code}、呼叫 {calls} 次、輸出檔 {saved or '無'}（預期 0、2 次、{expected}）；{errors(err)}")
    return problems


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in SDK_MODULES:
        print(f"[錯誤] 用法：real_sdk_smoke.py <平臺>；不認得 {' '.join(argv) or '（沒有平臺）'}；"
              f"可用的平臺：{'、'.join(SDK_MODULES)}", file=sys.stderr)
        return 2
    platform = argv[0]
    missing = []
    for name in SDK_MODULES[platform]:
        try:
            importlib.import_module(name)
        except ImportError as exc:
            missing.append(f"{name}（{exc}）")
    if missing:
        print(f"[錯誤] {platform} 的冒煙測試缺少 SDK：{'、'.join(missing)}；先執行 "
              f"pip install --require-hashes -r .github/model-acceptance/{platform}-requirements.txt", file=sys.stderr)
        return 1
    failed = 0
    for label, adapter_name, extra, build in PATHS[platform]:
        try:
            problems = check_path(platform, adapter_name, extra, build)
        except Exception as exc:  # noqa: BLE001 — SDK 內部結構改了（替換的位置不見、型別建不起來）也算這條路徑失敗，繼續測下一條
            problems = [f"{type(exc).__name__}: {exc}"]
        for problem in problems:
            print(f"[失敗] {platform} {label}：{problem}", file=sys.stderr)
        if not problems:
            print(f"[通過] {platform} {label}：截斷時中止、正常時存檔")
        failed += bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
