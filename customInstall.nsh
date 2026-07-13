!macro customInit
  ; Custom init - set title bar text
  System::Call 'user32::SetWindowText(i $hwndParent, t "CipherVault Installer")'
!macroend
