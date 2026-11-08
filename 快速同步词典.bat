@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 词典热同步
echo ==============================================
echo.

rem Same fallback as the install script: release zip uses Antigravity-zh.exe,
rem source tree uses dist\antigravity-tool.exe.

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
"%TOOL%" sync %*
if errorlevel 1 set "RC=1"

echo.
echo ==============================================
if not "%RC%"=="0" echo 同步未成功，请查看上方错误信息。
pause
exit /b %RC%
