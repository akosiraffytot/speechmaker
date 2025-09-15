# FFmpeg Attribution and Licensing

## About FFmpeg

SpeechMaker includes FFmpeg executables to provide MP3 audio conversion functionality. FFmpeg is a free and open-source software project consisting of a large suite of libraries and programs for handling video, audio, and other multimedia files and streams.

## License Information

FFmpeg is licensed under the GNU Lesser General Public License (LGPL) version 2.1 or later. The full license text is available in the `resources/ffmpeg/LICENSE.txt` file.

## FFmpeg Version

- **Version**: 8.0 (essentials build)
- **Build Date**: 2025
- **Source**: https://www.gyan.dev/ffmpeg/builds/
- **Configuration**: GPL build with essential codecs

## Usage in SpeechMaker

FFmpeg is used exclusively for:
- Converting WAV audio files to MP3 format
- Audio format validation and processing

## Compliance Notes

1. **Distribution**: FFmpeg executables are distributed as separate files in the `resources/ffmpeg/` directory
2. **Source Code**: FFmpeg source code is available at https://ffmpeg.org/download.html
3. **Modifications**: No modifications have been made to the FFmpeg executables
4. **License Compatibility**: LGPL allows distribution with proprietary software when dynamically linked or distributed separately

## Copyright Notice

FFmpeg developers retain all rights to the FFmpeg software. This distribution includes unmodified FFmpeg executables for user convenience.

For more information about FFmpeg, visit: https://ffmpeg.org/

## Third-Party Libraries

The bundled FFmpeg build includes various third-party libraries. See the FFmpeg documentation and LICENSE.txt for complete attribution information.