!macro customInit
  ; Get path to the installer executable
  ${GetParameters} $R0
  StrCpy $R1 "$EXEPATH"

  ; Calculate SHA-256 hash of installer using certutil
  nsExec::ExecToStack 'cmd /c certutil -hashfile "$R1" SHA256 | findstr /v ":\|CertUtil"'
  Pop $0
  Pop $1

  ; Clean up the hash (remove spaces, newlines, carriage returns)
  ${TrimNewLines} $1 $1
  ${WordReplace} "$1" " " "" 1 $1

  ; Read expected hash from embedded constant
  StrCpy $2 "${INSTALLER_HASH}"

  ; Compare
  ${If} "$1" != "$2"
    MessageBox MB_ICONSTOP|MB_OK "Installation aborted.$\n$\nThe installer has been tampered with or corrupted.$\n$\nExpected hash does not match.$\n$\nPlease download the installer from the official source."
    Abort
  ${EndIf}
!macroend
