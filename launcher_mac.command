#!/bin/sh
# StudyBlock launcher for macOS: double-click this file.
# It serves this folder on 127.0.0.1 and opens your browser.
# Close this Terminal window (or press Ctrl+C) to stop the server.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 tools/serve.py "$@"; fi
echo "Python 3 is needed. Install it from https://www.python.org/downloads/"
echo "or open dist/studyblock.html instead."
read -r _
