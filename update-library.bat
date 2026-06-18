@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=C:\Users\starr\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%PYTHON_EXE%" (
  "%PYTHON_EXE%" "tools\update_library.py"
) else (
  py "tools\update_library.py"
)

echo.
pause
