@echo off
rem Pure-ASCII launcher. DO NOT put any non-ASCII characters in this file.
rem (A UTF-8 .bat with Chinese text gets mis-parsed under GBK codepage and
rem  spams "is not recognized as an internal or external command".)
rem The interactive menu lives in menu.js, where UTF-8 Chinese is safe.
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"

rem ---------- locate node: PATH, then WorkBuddy bundled, then ProgramFiles ----------
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"

if not defined NODE (
  for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%~d\node.exe" set "NODE=%%~d\node.exe"
  )
)
if not defined NODE if exist "%USERPROFILE%\.workbuddy\binaries\node\current\node.exe" (
  set "NODE=%USERPROFILE%\.workbuddy\binaries\node\current\node.exe"
)
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
)

if not defined NODE (
  echo.
  echo [!] node not found.
  echo     Install Node.js 18+ from https://nodejs.org and add it to PATH,
  echo     or make sure the WorkBuddy bundled node still exists at:
  echo       %USERPROFILE%\.workbuddy\binaries\node\versions\
  echo.
  pause
  exit /b 1
)

rem ---------- with args: pass through, then pause so the window stays ----------
if not "%~1"=="" (
  "%NODE%" index.js %*
  echo.
  pause
  exit /b 0
)

rem ---------- no args: interactive menu (in menu.js, UTF-8 safe) ----------
"%NODE%" menu.js
if errorlevel 1 (
  echo.
  echo [!] menu.js exited with an error. Press any key to close.
  pause >nul
)
