!macro customCheckAppRunning
  DetailPrint "Checking for running MTPointMapGMT processes..."

  retry_close_mt_app:
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "MTPointMapGMT.exe"'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "MT点位图制作工具—GMT.exe"'
  Sleep 1500

  nsExec::ExecToStack '"$CmdPath" /C "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq MTPointMapGMT.exe" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"MTPointMapGMT.exe\""'
  Pop $0
  Pop $1
  ${if} $0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "旧版 MT点位图制作工具—GMT 仍在运行，安装器无法覆盖更新。请手动关闭软件后点击重试。" /SD IDRETRY IDRETRY retry_close_mt_app
    Quit
  ${endif}

  nsExec::ExecToStack '"$CmdPath" /C "$SYSDIR\tasklist.exe" /FI "IMAGENAME eq MT点位图制作工具—GMT.exe" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"MT点位图制作工具—GMT.exe\""'
  Pop $0
  Pop $1
  ${if} $0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "旧版 MT点位图制作工具—GMT 仍在运行，安装器无法覆盖更新。请手动关闭软件后点击重试。" /SD IDRETRY IDRETRY retry_close_mt_app
    Quit
  ${endif}
!macroend
