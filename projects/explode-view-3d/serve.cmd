@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没找到 Node.js。装一个再来：https://nodejs.org/
  echo 装完双击本文件即可。
  echo.
  pause
  exit /b 1
)
echo.
echo 服务已启动：http://127.0.0.1:5188/
echo 关掉这个窗口就停了。
echo.
start "" http://127.0.0.1:5188/
node tools\serve.mjs
pause
