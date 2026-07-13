Unicode true

!include "MUI2.nsh"
!include "FileFunc.nsh"

; ─── Branding ─────────────────────────────────────────────
Name "CipherVault"
OutFile "${PRODUCT_NAME}-${PRODUCT_VERSION}-setup.exe"
InstallDir "$LOCALAPPDATA\CipherVault"
InstallDirRegKey HKCU "Software\CipherVault" "InstallDir"

; ─── Custom Pages ─────────────────────────────────────────
!define MUI_ICON "resources\icon.ico"
!define MUI_UNICON "resources\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "build\header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEFINISHPAGE_BITMAP "build\sidebar.bmp"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\CipherVault.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch CipherVault"
!define MUI_FINISHPAGE_LINK "Visit GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/vipecoder228/CipherVault"

; ─── Welcome Page ─────────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE "Welcome to CipherVault Setup"
!define MUI_WELCOMEPAGE_TEXT "Secure password manager with AES-256-GCM encryption.$\n$\nClick Next to continue."

; ─── License Page ─────────────────────────────────────────
!define MUI_LICENSEPAGE_CHECKBOX
!define MUI_LICENSEPAGE_CHECKBOX_TEXT "I accept the terms"

; ─── Install Page ─────────────────────────────────────────
!define MUI_INSTFILESPAGE_COLORS "0066CC 000000"

; ─── Finish Page ──────────────────────────────────────────
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "CipherVault has been installed successfully.$\n$\nClick Finish to close this wizard."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ─── Installer Sections ───────────────────────────────────
Section "CipherVault" SecMain
  SetOutPath "$INSTDIR"

  ; Install files
  File "dist\win-unpacked\CipherVault.exe"
  File /r "dist\win-unpacked\resources\*.*"
  File /r "dist\win-unpacked\*.dll"

  ; Store install path
  WriteRegStr HKCU "Software\CipherVault" "InstallDir" "$INSTDIR"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Add to Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "DisplayName" "CipherVault"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "DisplayIcon" '"$INSTDIR\CipherVault.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "Publisher" "CipherVault"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault" \
    "NoRepair" 1

  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\CipherVault.lnk" "$INSTDIR\CipherVault.exe"

  ; Create start menu entry
  CreateDirectory "$SMPROGRAMS\CipherVault"
  CreateShortcut "$SMPROGRAMS\CipherVault\CipherVault.lnk" "$INSTDIR\CipherVault.exe"
  CreateShortcut "$SMPROGRAMS\CipherVault\Uninstall.lnk" "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\CipherVault.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR\resources"
  RMDir "$INSTDIR"

  Delete "$DESKTOP\CipherVault.lnk"
  Delete "$SMPROGRAMS\CipherVault\CipherVault.lnk"
  Delete "$SMPROGRAMS\CipherVault\Uninstall.lnk"
  RMDir "$SMPROGRAMS\CipherVault"

  DeleteRegKey HKCU "Software\CipherVault"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CipherVault"
SectionEnd
