@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 一键安装
echo ==============================================
echo.

rem Prefer the self-contained exe shipped in the release zip: it embeds the Node
rem runtime, so end users need nothing installed. The old version called
rem "node scripts/patch.js" directly, but the zip contains neither scripts/ nor
rem node_modules/, so following the README could never work.
rem
rem Deliberately no goto/label jumps and no %errorlevel% read inside a
rem parenthesised block: label seeks are unreliable with UTF-8 multibyte text,
rem and block-internal expansion yields a stale value. "if errorlevel 1" reads
rem the live exit status, so it is correct inside blocks.
set "RC=0"
set "MODE=exe"
if not exist "Antigravity-zh-patch.exe" set "MODE=src"

if "%MODE%"=="exe" (
    "Antigravity-zh-patch.exe" %*
    if errorlevel 1 set "RC=1"
)

if "%MODE%"=="src" (
    echo [提示] 未找到 Antigravity-zh-patch.exe，按源码检出模式运行。
    echo.
    where node >nul 2>nul
    if errorlevel 1 (
        echo [错误] 既没有 Antigravity-zh-patch.exe，也没有 Node.js 环境。
        echo   请下载官方发布包（内含 exe），或安装 Node.js 后从源码运行。
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
    node scripts/patch.js %*
    if errorlevel 1 set "RC=1"
)

echo.
echo ==============================================
if not "%RC%"=="0" echo 安装未成功，请查看上方错误信息。
pause
exit /b %RC%
