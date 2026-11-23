# Exe portable de Twin Pics : remplace le modèle d'electron-builder (scripts/portable-nsi.mjs), pour deux raisons :
# - une BARRE DE PROGRESSION pendant la décompression (le modèle n'affiche rien, 10 à 35 s) ;
# - l'appli décompressée est GARDÉE (%LOCALAPPDATA%\Twin Pics Portable\<construction>) : les lancements suivants
#   s'ouvrent tout de suite. Les anciennes constructions y sont effacées. Le modèle recommençait à chaque lancement.
Unicode true
!include "common.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

CRCCheck off
AutoCloseWindow true
RequestExecutionLevel ${REQUEST_EXECUTION_LEVEL}
XPStyle on
BrandingText " "
Caption "Twin Pics"
SubCaption 3 " "

Page instfiles "" showProgress

Var Text
Var Root

Function .onInit
  !insertmacro check64BitAndSetRegView
  StrCpy $Root "$LOCALAPPDATA\Twin Pics Portable"
  StrCpy $INSTDIR "$Root\${UNPACK_DIR_NAME}"
  # Déjà décompressée : aucune fenêtre, l'appli s'ouvre.
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    SetSilent silent
  ${EndIf}

  # Langue de Windows : les six langues de l'appli, sinon l'anglais.
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  IntOp $0 $0 & 0x3FF
  StrCpy $Text "Opening Twin Pics for the first time…"
  ${Switch} $0
    ${Case} 12
      StrCpy $Text "Première ouverture de Twin Pics…"
      ${Break}
    ${Case} 10
      StrCpy $Text "Abriendo Twin Pics por primera vez…"
      ${Break}
    ${Case} 7
      StrCpy $Text "Twin Pics wird zum ersten Mal geöffnet…"
      ${Break}
    ${Case} 16
      StrCpy $Text "Prima apertura di Twin Pics…"
      ${Break}
    ${Case} 22
      StrCpy $Text "Abrindo o Twin Pics pela primeira vez…"
      ${Break}
  ${EndSwitch}
FunctionEnd

# La fenêtre standard, réduite à l'essentiel : un texte et la barre.
Function showProgress
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1006
  SendMessage $1 ${WM_SETTEXT} 0 "STR:$Text"
  GetDlgItem $1 $0 1027
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 2
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 3
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1028
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1256
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $HWNDPARENT 1035
  ShowWindow $1 ${SW_HIDE}
  # Moins haute (le bas ne montrait plus rien), recentrée : largeur gardée, hauteur fixée à 45 %.
  System::Call '*(i, i, i, i) p .r2'
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p r2)'
  System::Call '*$2(i .r3, i .r4, i .r5, i .r6)'
  System::Free $2
  IntOp $5 $5 - $3
  IntOp $7 $6 - $4
  IntOp $8 $7 * 45
  IntOp $8 $8 / 100
  IntOp $7 $7 - $8
  IntOp $7 $7 / 2
  IntOp $4 $4 + $7
  System::Call 'user32::MoveWindow(p $HWNDPARENT, i r3, i r4, i r5, i r8, i 1)'
FunctionEnd

Section
  ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    SetDetailsPrint textonly
    DetailPrint "$Text"
    SetDetailsPrint none
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    SetCompress off
    File /oname=$PLUGINSDIR\app-64.7z "${APP_64}"
    SetCompress auto
    # Dans un dossier d'attente, renommé à la fin : une ouverture interrompue ne laisse pas une appli à moitié faite.
    RMDir /r "$INSTDIR.tmp"
    SetOutPath "$INSTDIR.tmp"
    Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
    SetOutPath "$TEMP"
    Delete "$PLUGINSDIR\app-64.7z"
    ClearErrors
    RMDir /r "$INSTDIR"
    Rename "$INSTDIR.tmp" "$INSTDIR"
  ${EndIf}

  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_FILE", "$EXEPATH").r0'
  ${StdUtils.GetAllParameters} $R0 0
  SetOutPath "$EXEDIR"
  HideWindow
  Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0'

  # Constructions précédentes : effacées (une appli encore ouverte garde ses fichiers, effacée la fois suivante).
  FindFirst $0 $1 "$Root\*"
  ${DoUntil} $1 == ""
    ${If} $1 != "."
    ${AndIf} $1 != ".."
    ${AndIf} $1 != "${UNPACK_DIR_NAME}"
      RMDir /r "$Root\$1"
    ${EndIf}
    FindNext $0 $1
  ${Loop}
  FindClose $0
SectionEnd
