!macro customInit
  System::Call 'user32::SetWindowText(i $hwndParent, t "CipherVault Installer")'
!macroend

!macro customInstall
  ; Generate SHA-256 hash of installed exe for runtime integrity check
  ; Use PowerShell to get hash, strip whitespace, and write to file
  nsExec::ExecToStack 'cmd /c powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 \"$INSTDIR\CipherVault.exe\").Hash" | set /p HASH='
  Pop $0
  Pop $1

  ; $1 now contains the hash - write it to app.sha256
  FileOpen $2 "$INSTDIR\app.sha256" w
  FileWrite $2 $1
  FileClose $2
!macroend
