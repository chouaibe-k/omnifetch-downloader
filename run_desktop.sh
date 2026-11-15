#!/usr/bin/env bash
echo "========================================================"
echo "       OmniFetch Video & Audio Downloader Engine"
echo "========================================================"
echo ""
echo "Starting OmniFetch local engine on your laptop..."

if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required. Please install python3."
    exit 1
fi

echo "Checking dependencies (yt-dlp, fastapi, uvicorn)..."
python3 -m pip install -q "fastapi>=0.109.0" "uvicorn[standard]>=0.27.0" "yt-dlp>=2024.1.0" "httpx>=0.26.0" "pydantic>=2.0.0"

echo "Opening OmniFetch in your browser..."
if which xdg-open > /dev/null 2>&1; then
    xdg-open http://localhost:8000 &
elif which open > /dev/null 2>&1; then
    open http://localhost:8000 &
fi

python3 backend/main.py
