@echo off
title InstaClone Studio - Autonomous Carousel Engine
echo ============================================================
echo   InstaClone Studio - Launching Application...
echo ============================================================
echo.

cd /d "%~dp0"

start "" http://localhost:5000

"C:\Users\visha\miniforge3\envs\instastories\python.exe" app.py

pause
