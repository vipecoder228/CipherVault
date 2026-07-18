!macro customInit
  ; Custom init - set title bar text
  System::Call 'user32::SetWindowText(i $hwndParent, t "CipherVault Installer")'
!macroend

!macro customInstall
  ; Generate SHA-256 hash of installed exe for runtime integrity check
  nsExec::ExecToStack 'cmd /c certutil -hashfile "$INSTDIR\CipherVault.exe" SHA256 | findstr /v "CertUtil"'
  Pop $0
  Pop $1

  ; Clean up hash
  ${TrimNewLines} $1 $1
  ${WordReplace} "$1" " " "" 1 $1

  ; Write hash file next to exe
  FileOpen $2 "$INSTDIR\app.sha256" w
  FileWrite $2 $1
  FileClose $2
!macroend
