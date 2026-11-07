@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 一键还原
echo ==============================================
echo.

rem Antigravity-zh.exe is the Rust installer shipped in the release zip.
rem No Node.js, no npm install, no environment setup required.
rem No label jumps and no %errorlevel% read inside a parenthesised
rem block: label seeks are unreliable with UTF-8 multibyte text, and
rem block-internal expansion yields a stale value.

set "RC=0"
if not exist "Antigravity-zh.exe" (
    echo [错误] 未找到 Antigravity-zh.exe，请从 Releases 下载完整发布包。
    echo.
    pause
    exit /b 1
)

"Antigravity-zh.exe" revert %*
if errorlevel 1 set "RC=1"

echo.
echo ==============================================
if not "%RC%"=="0" echo 还原未成功，请查看上方错误信息。
pause
exit /b %RC%
