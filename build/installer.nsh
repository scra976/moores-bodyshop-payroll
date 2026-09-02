; Leave %APPDATA%\MooresBodyShop\ (payroll data) on uninstall.
; electron-builder already sets deleteAppDataOnUninstall false for its own userData.
; This extra no-op custom page comment documents the policy for the shop owner.
!macro customUnInstall
  ; Intentionally do not RMDir /r "$APPDATA\MooresBodyShop"
!macroend
