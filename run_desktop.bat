@echo off
title OmniFetch Video Downloader
echo ========================================================
echo        OmniFetch Video & Audio Downloader Engine
echo ========================================================
echo.
echo Starting OmniFetch local engine on your laptop...
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python was not found! Please install Python from https://www.python.org/
    pause
    exit /b
)

echo Checking dependencies (yt-dlp, fastapi, uvicorn)...
python -m pip install -q "fastapi>=0.109.0" "uvicorn[standard]>=0.27.0" "yt-dlp>=2024.1.0" "httpx>=0.26.0" "pydantic>=2.0.0"

echo Opening OmniFetch Downloader in your default browser...
start http://localhost:8000

echo Starting OmniFetch backend on http://localhost:8000 ...
python backend/main.py
pause
