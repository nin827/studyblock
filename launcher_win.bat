@echo off
rem StudyBlock launcher for Windows: double-click this file.
rem It serves this folder on 127.0.0.1 and opens your browser. Closing this window stops the server.
title StudyBlock (close this window to stop)
cd /d "%~dp0"

where py >nul 2>nul && (py tools\serve.py %* || pause) && goto :end
where py >nul 2>nul && goto :end
where python >nul 2>nul && (python tools\serve.py %* || pause) && goto :end
where python >nul 2>nul && goto :end

echo.
echo   Python 3 is needed to run the local server.
echo   Install it from https://www.python.org/downloads/ and try again,
echo   or open dist\studyblock.html directly instead (build it with: py tools\bundle.py).
echo.
pause

:end
