@echo off
setlocal
cd /d "%~dp0"

echo Closing old MT Point Map GMT processes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'MTPointMapGMT.exe' -or (($_.Name -like '*GMT*.exe') -and ($_.ExecutablePath -like '*MT*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

timeout /t 2 /nobreak >nul

set "SETUP="
for %%F in ("%~dp0*win-x64-setup.exe") do set "SETUP=%%~fF"

if not defined SETUP (
  echo Could not find the Windows x64 setup file in this folder.
  pause
  exit /b 1
)

echo Starting installer:
echo %SETUP%
start "" "%SETUP%"
endlocal
