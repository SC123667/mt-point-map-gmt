!macro cwnCloseMtProcesses
  DetailPrint "Closing MT Point Map GMT background processes if present..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "MTPointMapGMT.exe"'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "MT点位图制作工具—GMT.exe"'
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($$_.Name -ieq 'MTPointMapGMT.exe') -or ($$_.Name -ieq 'MT点位图制作工具—GMT.exe') -or ($$_.ExecutablePath -and ($$_.ExecutablePath -match 'MTPointMapGMT|MT点位图制作工具')) -or ($$_.CommandLine -and ($$_.CommandLine -match 'mt-point-map-gmt|MTPointMapGMT|MT点位图制作工具')) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
!macroend

!macro cwnFindMtProcesses _RETURN
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$hit = @(Get-CimInstance Win32_Process | Where-Object { ($$_.Name -ieq 'MTPointMapGMT.exe') -or ($$_.Name -ieq 'MT点位图制作工具—GMT.exe') -or ($$_.ExecutablePath -and ($$_.ExecutablePath -match 'MTPointMapGMT|MT点位图制作工具')) -or ($$_.CommandLine -and ($$_.CommandLine -match 'mt-point-map-gmt|MTPointMapGMT|MT点位图制作工具')) }); if ($$hit.Count -gt 0) { exit 0 } exit 1"'
  Pop ${_RETURN}
  Pop $1

  ${if} ${_RETURN} != 0
    nsExec::ExecToStack '"$CmdPath" /C "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq MTPointMapGMT.exe" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"MTPointMapGMT.exe\""'
    Pop ${_RETURN}
    Pop $1
  ${endif}

  ${if} ${_RETURN} != 0
    nsExec::ExecToStack '"$CmdPath" /C "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq MT点位图制作工具—GMT.exe" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"MT点位图制作工具—GMT.exe\""'
    Pop ${_RETURN}
    Pop $1
  ${endif}
!macroend

!macro customInit
  !insertmacro cwnCloseMtProcesses
  Sleep 800
!macroend

!macro customCheckAppRunning
  DetailPrint "Checking for running MT Point Map GMT processes..."

  retry_close_mt_app:
  !insertmacro cwnCloseMtProcesses
  Sleep 1500

  !insertmacro cwnFindMtProcesses $0
  ${if} $0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "检测到旧版 MT点位图制作工具—GMT 仍有后台进程或旧安装目录占用。安装器已尝试自动关闭；如果仍失败，请点击重试，或重启 Windows 后再次运行安装器。" /SD IDRETRY IDRETRY retry_close_mt_app
    Quit
  ${endif}
!macroend
