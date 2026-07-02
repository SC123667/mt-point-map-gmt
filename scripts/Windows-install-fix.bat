@echo off
setlocal
cd /d "%~dp0"

echo Closing old MT Point Map GMT processes...
taskkill /F /T /IM "MTPointMapGMT.exe" >nul 2>nul
taskkill /F /T /IM "MT点位图制作工具—GMT.exe" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -ieq 'MTPointMapGMT.exe') -or ($_.Name -ieq 'MT点位图制作工具—GMT.exe') -or ($_.ExecutablePath -and ($_.ExecutablePath -match 'MTPointMapGMT|MT点位图制作工具')) -or ($_.CommandLine -and ($_.CommandLine -match 'mt-point-map-gmt|MTPointMapGMT|MT点位图制作工具')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

timeout /t 2 /nobreak >nul

set "SETUP="
for %%F in ("%~dp0*win-x64-setup.exe") do set "SETUP=%%~fF"

if not defined SETUP for %%F in ("%~dp0*win-setup.exe") do set "SETUP=%%~fF"
if not defined SETUP (
  echo Could not find the Windows setup file in this folder.
  pause
  exit /b 1
)

echo Starting installer:
echo %SETUP%
start "" "%SETUP%"
endlocal
