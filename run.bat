@echo off
rem Double-click to send the wishlist digest to Telegram.
rem Optional: run.bat --dry  = print to console, send nothing.
chcp 65001 >nul
cd /d "%~dp0"
node src\index.js %*
echo.
if errorlevel 1 (echo FAILED - see the message above) else (echo DONE)
pause
