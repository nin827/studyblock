#!/bin/sh
# StudyBlock launcher for Linux: run ./launcher_linux.sh (or double-click and choose "Run in Terminal").
# It serves this folder on 127.0.0.1 and opens your browser.
# Close the terminal (or press Ctrl+C) to stop the server.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 tools/serve.py "$@"; fi
if command -v python >/dev/null 2>&1; then exec python tools/serve.py "$@"; fi
echo "Python 3 is needed. Install it with your package manager (e.g. sudo apt install python3)"
echo "or open dist/studyblock.html instead."
