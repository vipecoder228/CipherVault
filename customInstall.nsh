!macro customInit
  System::Call 'user32::SetWindowText(i $hwndParent, t "CipherVault Installer")'
  ; Kill CipherVault if running (may be in tray or background)
  nsExec::ExecToStack 'cmd /c taskkill /F /IM CipherVault.exe 2>nul'
  Pop $0
  Pop $1
  ; Also kill any elevate helper
  nsExec::ExecToStack 'cmd /c taskkill /F /IM elevate.exe 2>nul'
  Pop $0
  Pop $1
  ; Wait for files to be fully released
  Sleep 2000
!macroend

!macro customInstall
  ; Generate SHA-256 hash of installed exe for runtime integrity check
  nsExec::ExecToStack 'cmd /c powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 \"$INSTDIR\CipherVault.exe\").Hash" | set /p HASH='
  Pop $0
  Pop $1

  ; Write hash to app.sha256
  FileOpen $2 "$INSTDIR\app.sha256" w
  FileWrite $2 $1
  FileClose $2
!macroend
