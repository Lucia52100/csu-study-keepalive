@echo off
setlocal
cd /d "%~dp0"

rem ============================================================
rem  CSU Study Keepalive - one-click installer
rem  1) copies csu-study-keepalive.user.js to the clipboard
rem  2) opens the Tampermonkey "new userscript" editor
rem  This file is ASCII-only on purpose: cmd.exe mis-parses
rem  UTF-8 batch files containing non-ASCII characters.
rem ============================================================

set "EDGE_TM_STORE=%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Extensions\iikmkjmpaadaobahmlepeloendndfphd"
set "EDGE_TM_CHROME=%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Extensions\dhdgffkkebhmkfjojejmpbldmpobfkfo"
set "CHROME_TM=%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\dhdgffkkebhmkfjojejmpbldmpobfkfo"

set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_EXE%" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

set "TM_URL="
set "BROWSER="

if exist "%EDGE_TM_STORE%" (
  set "TM_URL=chrome-extension://iikmkjmpaadaobahmlepeloendndfphd/options.html#nav=new-user-script"
  set "BROWSER=%EDGE_EXE%"
)
if not defined TM_URL if exist "%EDGE_TM_CHROME%" (
  set "TM_URL=chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=new-user-script"
  set "BROWSER=%EDGE_EXE%"
)
if not defined TM_URL if exist "%CHROME_TM%" (
  set "TM_URL=chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=new-user-script"
  set "BROWSER=%CHROME_EXE%"
)

echo.
echo   CSU Study Keepalive - One-click install
echo   ======================================
echo.
echo   [1/2] Copying the userscript to your clipboard ...
powershell -NoProfile -WindowStyle Hidden -Command "Get-Content -LiteralPath '%~dp0csu-study-keepalive.user.js' -Raw -Encoding UTF8 | Set-Clipboard"
if errorlevel 1 (
  echo         FAILED. Open csu-study-keepalive.user.js in Notepad, select all, copy.
) else (
  echo         OK.
)
echo.

if defined TM_URL (
  echo   [2/2] Opening the Tampermonkey editor ...
  for %%f in ("%~dp0*.html") do start "" "%%~ff"
  start "" "%BROWSER%" "%TM_URL%"
) else (
  echo   Tampermonkey not found. Opening the install guide ...
  for %%f in ("%~dp0*.html") do start "" "%%~ff"
)

echo.
echo   In the editor, press:   Ctrl+A   then   Ctrl+V   then   Ctrl+S
echo   Then open the study page. A green badge shows at the bottom-right.
echo.
echo   This window closes automatically in 12 seconds.
timeout /t 12 >nul 2>nul
endlocal
