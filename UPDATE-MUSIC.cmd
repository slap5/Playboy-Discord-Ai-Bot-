@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe goto missing
.venv\Scripts\python.exe -m pip install --upgrade "yt-dlp[default]"
if errorlevel 1 goto failed
echo Music search installed/updated. Restart with START-WINDOWS.cmd.
pause
exit /b 0
:missing
echo Run SETUP-WINDOWS.cmd first to create the Python environment.
pause
exit /b 1
:failed
echo Update failed. Read the error above.
pause
exit /b 1
