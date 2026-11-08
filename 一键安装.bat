@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 一键安装
echo ==============================================
echo.

rem Two possible installers, chosen by scenario:
rem   1) Release zip ships Antigravity-zh.exe (end-user Rust installer)
rem   2) Source tree has no such file; built artifact is dist\antigravity-tool.exe
rem Same program, renamed at release time. Auto-pick so users need not memorise CLI.
rem
rem Avoid goto and %errorlevel% inside parenthesised blocks:
rem goto labels misalign on UTF-8 multibyte text; block-internal expansion is stale.

set "TOOL="
if exist "Antigravity-zh.exe" set "TOOL=Antigravity-zh.exe"
if not defined TOOL if exist "dist\antigravity-tool.exe" set "TOOL=dist\antigravity-tool.exe"

if not defined TOOL (
    echo [错误] 未找到安装器。
    echo.
    echo   发布包用户：请确认压缩包已完整解压，目录里应有 Antigravity-zh.exe。
    echo   源码目录：  请先构建，执行 npm run build:rust 生成 dist\antigravity-tool.exe。
    echo.
    pause
    exit /b 1
)

echo 使用安装器: %TOOL%
echo.

set "RC=0"
"%TOOL%" install %*
if errorlevel 1 set "RC=1"

echo.
echo ==============================================
if not "%RC%"=="0" echo 安装未成功，请查看上方错误信息。
pause
exit /b %RC%
