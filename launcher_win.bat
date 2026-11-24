@echo off
rem StudyBlock launcher for Windows: double-click this file.
rem It serves this folder on 127.0.0.1 and opens your browser.
rem This window stays open while the server runs. Close it to stop the server.
title StudyBlock - close this window to stop
cd /d "%~dp0"

set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if not defined PYCMD where python >nul 2>nul && set "PYCMD=python"

if not defined PYCMD (
  echo.
  echo   Python 3 is needed to run the local server.
  echo   Install it from https://www.python.org/downloads/ and try again,
  echo   or open dist\studyblock.html directly instead.
  goto :hold
)

%PYCMD% tools\serve.py %*

:hold
echo.
echo   Press any key to close this window.
pause >nul
