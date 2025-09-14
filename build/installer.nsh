# Custom NSIS installer script for SpeechMaker

# Add custom pages and functionality
!include "MUI2.nsh"

# Custom installer messages
LangString DESC_SpeechMaker 1033 "SpeechMaker - Convert text to speech using Windows TTS voices"

# Registry keys for Windows integration
!define REGISTRY_KEY "Software\SpeechMaker"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SpeechMaker"

# Custom install section
Section "SpeechMaker" SecMain
  # Write registry information
  WriteRegStr HKCU "${REGISTRY_KEY}" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "${REGISTRY_KEY}" "Version" "${VERSION}"
  
  # Create file associations for .txt files (optional)
  WriteRegStr HKCU "Software\Classes\.txt\shell\SpeechMaker" "" "Convert to Speech"
  WriteRegStr HKCU "Software\Classes\.txt\shell\SpeechMaker\command" "" '"$INSTDIR\SpeechMaker.exe" "%1"'
  
  # Add to Windows "Open With" menu
  WriteRegStr HKCU "Software\Classes\Applications\SpeechMaker.exe\shell\open\command" "" '"$INSTDIR\SpeechMaker.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\SpeechMaker.exe" "FriendlyAppName" "SpeechMaker"
SectionEnd

# Custom uninstall section
Section "Uninstall"
  # Remove registry keys
  DeleteRegKey HKCU "${REGISTRY_KEY}"
  DeleteRegKey HKCU "Software\Classes\.txt\shell\SpeechMaker"
  DeleteRegKey HKCU "Software\Classes\Applications\SpeechMaker.exe"
  
  # Remove application data (optional - user choice)
  MessageBox MB_YESNO "Do you want to remove all application data and settings?" IDNO +3
  RMDir /r "$APPDATA\SpeechMaker"
  RMDir /r "$LOCALAPPDATA\SpeechMaker"
SectionEnd

# Custom function to check for FFmpeg
Function CheckFFmpeg
  # Check if FFmpeg is available in PATH
  nsExec::ExecToStack 'ffmpeg -version'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONINFORMATION "FFmpeg not detected. SpeechMaker can still convert to WAV format, but MP3 conversion requires FFmpeg.$\n$\nTo enable MP3 support, please install FFmpeg from https://ffmpeg.org/download.html"
  ${EndIf}
FunctionEnd

# Call FFmpeg check after installation
Function .onInstSuccess
  Call CheckFFmpeg
FunctionEnd