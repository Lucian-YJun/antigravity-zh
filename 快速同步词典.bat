@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 词典热同步
echo ==============================================
echo.

rem The packaged exe's entry is scripts/patch.js, which dispatches --sync to
rem sync-dict.js runSync(). Source checkouts fall back to `node scripts/sync-dict.js`.
rem No goto/label jumps and no block-internal %errorlevel% reads (see 一键安装.bat).
set "RC=0"
set "MODE=exe"
if not exist "Antigravity-zh-patch.exe" set "MODE=src"

if "%MODE%"=="exe" (
    "Antigravity-zh-patch.exe" --sync %*
    if errorlevel 1 set "RC=1"
)

if "%MODE%"=="src" (
    echo [提示] 未找到 Antigravity-zh-patch.exe，按源码检出模式运行。
    echo.
    where node >nul 2>nul
    if errorlevel 1 (
        echo [错误] 既没有 Antigravity-zh-patch.exe，也没有 Node.js 环境。
        echo.
        pause
        exit /b 1
    )
    if not exist "node_modules\" (
        echo 正在首次安装必要依赖（请稍候）...
        call npm install
        if errorlevel 1 (
            echo [错误] 依赖安装失败，请检查网络后重试。
            echo.
            pause
            exit /b 1
        )
        echo.
    )
    node scripts/sync-dict.js %*
    if errorlevel 1 set "RC=1"
)

echo.
echo ==============================================
if not "%RC%"=="0" echo 同步未成功，请查看上方错误信息。
pause
exit /b %RC%
