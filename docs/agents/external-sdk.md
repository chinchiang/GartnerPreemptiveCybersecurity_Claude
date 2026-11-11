# 查證外部 SDK

核對平臺 SDK 的型別或行為，或下載 SDK 原始碼來讀時用。

- 核對 SDK 的型別或行為，用鎖定檔的版本（`.github/model-acceptance/*-requirements.txt`），不要用本機剛好裝的版本。
- `pip download` 很慢（前景曾經超過 3 分鐘），用 `run_in_background` 跑。下載到 `scratch/<n>/` 的獨立目錄，加 `--no-deps`；只讀檔，不執行。
