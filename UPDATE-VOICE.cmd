@echo off
setlocal
cd /d "%~dp0"
echo Stop the bot before running this update.
if not exist .venv\Scripts\python.exe goto missing
.venv\Scripts\python.exe scripts\update_voice.py
if errorlevel 1 goto failed
echo Voice update complete.
pause
exit /b 0
:missing
echo Missing Python environment. Run SETUP-WINDOWS.cmd first.
pause
exit /b 1
:failed
echo Voice update failed. Read the error above before restarting the bot.
pause
exit /b 1
