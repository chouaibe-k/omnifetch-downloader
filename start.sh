#!/usr/bin/env bash
# OmniFetch Launch Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo " Starting OmniFetch Social Media Downloader Server"
echo " Web App & Android PWA available at: http://localhost:8000"
echo "=========================================================="

# Activate virtual environment
if [ -d "$SCRIPT_DIR/backend/.venv" ]; then
    source "$SCRIPT_DIR/backend/.venv/bin/activate"
fi

export NO_PROXY="localhost,127.0.0.1"
export no_proxy="localhost,127.0.0.1"

exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
