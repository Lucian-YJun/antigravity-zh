@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 一键还原
echo ==============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境！
    echo 请先前往 https://nodejs.org 下载并安装 Node.js 后重试。
    echo.
    pause
    exit /b 1
)

node scripts/patch.js --revert

echo.
echo ==============================================
pause
