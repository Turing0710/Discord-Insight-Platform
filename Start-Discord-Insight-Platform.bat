@echo off
chcp 65001 >nul
title Discord Insight Platform

set "ROOT=%~dp0"
set "SETUP=%ROOT%scripts\setup.ps1"
set "OPEN_SITE=%ROOT%deploy\open-site-stable.ps1"
set "BACKEND_PY=%ROOT%backend\.venv\Scripts\python.exe"
set "FRONTEND_NODE_MODULES=%ROOT%frontend\node_modules"
set "BACKEND_ENV=%ROOT%backend\.env"
set "EXPORTER_EXE=%ROOT%backend\tools\DiscordChatExporter.Cli\DiscordChatExporter.Cli.exe"
set "EXPORTER_DLL=%ROOT%backend\tools\DiscordChatExporter.Cli\DiscordChatExporter.Cli.dll"

cd /d "%ROOT%"

if not exist "%SETUP%" (
  echo Missing setup script: %SETUP%
  pause
  exit /b 1
)

if not exist "%OPEN_SITE%" (
  echo Missing startup script: %OPEN_SITE%
  pause
  exit /b 1
)

set "NEED_SETUP=0"
if not exist "%BACKEND_PY%" set "NEED_SETUP=1"
if not exist "%FRONTEND_NODE_MODULES%" set "NEED_SETUP=1"
if not exist "%BACKEND_ENV%" set "NEED_SETUP=1"
if not exist "%EXPORTER_EXE%" if not exist "%EXPORTER_DLL%" set "NEED_SETUP=1"

if "%NEED_SETUP%"=="1" (
  echo First run detected. Installing local dependencies...
  echo This may take a few minutes.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SETUP%"
  if errorlevel 1 (
    echo.
    echo Setup failed. Please check the message above.
    pause
    exit /b 1
  )
)

echo.
echo Starting Discord Insight Platform...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%OPEN_SITE%"
if errorlevel 1 (
  echo.
  echo Startup failed. Logs are in the deploy folder.
  pause
  exit /b 1
)

echo.
echo Website opened: http://127.0.0.1:3000
echo You can close this window after the browser opens.
pause
