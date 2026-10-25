@echo off
setlocal
cd /d "%~dp0"
echo Checking Node.js, Python 3.11, FFmpeg, and Ollama...
where node >nul 2>nul
if errorlevel 1 goto missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing
where ffmpeg >nul 2>nul
if errorlevel 1 goto missing
where ollama >nul 2>nul
if errorlevel 1 goto missing
py -3.11 --version
if errorlevel 1 goto missing
if not exist .env copy .env.example .env >nul
call npm.cmd ci
if errorlevel 1 goto failed
py -3.11 -m venv .venv
if errorlevel 1 goto failed
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto failed
.venv\Scripts\python.exe scripts\prepare_models.py
if errorlevel 1 goto failed
echo Downloading the local chat model. Keep Ollama open.
ollama pull qwen3:4b-instruct
if errorlevel 1 goto failed
echo.
echo SETUP COMPLETE. Put your Discord token and server ID in .env.
echo Then double-click START-WINDOWS.cmd. See README.md for help.
pause
exit /b 0
:missing
echo Missing requirement. Install Node.js 24.17+, Python 3.11, FFmpeg, and Ollama.
echo Follow README.md, then reopen this setup window.
pause
exit /b 1
:failed
echo Setup stopped. Read the error above; do not start the bot until setup succeeds.
pause
exit /b 1
