@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   Antigravity 中文汉化补丁 - 词典热同步
echo ==============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境！
    pause
    exit /b 1
)

node scripts/sync-dict.js

echo.
echo ==============================================
pause
