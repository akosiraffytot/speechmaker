# FFmpeg Resources

This directory contains FFmpeg executables bundled with SpeechMaker for MP3 audio conversion.

## Directory Structure

```
ffmpeg/
├── win32/
│   ├── x64/
│   │   └── ffmpeg.exe    # 64-bit Windows executable
│   └── ia32/
│       └── ffmpeg.exe    # 32-bit Windows executable
├── LICENSE.txt           # FFmpeg license
└── README.md            # This file
```

## License

FFmpeg is licensed under the LGPL license. See LICENSE.txt for full details.

## Version

FFmpeg version 8.0 (essentials build)

## Usage

These executables are automatically detected and used by SpeechMaker when MP3 conversion is requested. The application will:

1. First try to use the bundled FFmpeg executable
2. Fall back to system-installed FFmpeg if bundled version fails
3. Disable MP3 functionality if no FFmpeg is available

## Source

FFmpeg executables downloaded from:
- https://www.gyan.dev/ffmpeg/builds/ (Windows builds)

Built on: $(Get-Date -Format "yyyy-MM-dd")