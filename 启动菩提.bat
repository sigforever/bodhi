@echo off
chcp 65001 >nul
if /i "%~1"=="--server" goto server
wscript.exe //nologo "%~dp0启动菩提.vbs"
exit /b

:server
where python >nul 2>nul
if not errorlevel 1 (
  start "" /b python -m http.server 8321 --bind 127.0.0.1 --directory "%~dp0"
  goto open_server
)
where py >nul 2>nul
if not errorlevel 1 (
  start "" /b py -3 -m http.server 8321 --bind 127.0.0.1 --directory "%~dp0"
  goto open_server
)
echo Python was not found. Opening the local file instead.
wscript.exe //nologo "%~dp0启动菩提.vbs"
exit /b

:open_server
timeout /t 2 /nobreak >nul
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto launch_edge
set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto launch_edge
set "EDGE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto launch_edge
start "" "http://127.0.0.1:8321/"
exit /b

:launch_edge
start "" "%EDGE%" --app="http://127.0.0.1:8321/" --window-size=1380,880
