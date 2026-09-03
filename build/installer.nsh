; Leave %APPDATA%\MooresBodyShop\ (payroll data) on uninstall.
; First-time Setup shows the wizard. In-app updates (--updated / isUpdated) stay silent.

!macro customInit
  ${if} ${isUpdated}
    SetSilent silent
  ${endif}
!macroend

!macro customUnInstall
  ; Intentionally do not RMDir /r "$APPDATA\MooresBodyShop"
!macroend
