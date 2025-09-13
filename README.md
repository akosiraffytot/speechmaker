# SpeechMaker

A Windows desktop application that converts text to speech using built-in Windows TTS voices. Built with Electron and Node.js, SpeechMaker provides an offline solution for text-to-speech conversion with support for both manual text input and file uploads.

## Features

- Convert text to speech using Windows TTS voices
- Support for manual text input and .txt file uploads
- Output in WAV or MP3 formats
- Offline operation (no internet required)
- Simple and intuitive user interface
- Customizable voice speed settings
- Progress tracking for conversions

## Requirements

- Windows 10 or later
- Node.js 16 or later
- FFmpeg (required for MP3 output format)

## Installation

### Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

### Building for Distribution

1. Build the application:
   ```bash
   npm run build
   ```

2. Create installer:
   ```bash
   npm run dist
   ```

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build application for current platform
- `npm run dist` - Create distributable installer
- `npm run pack` - Package application without installer

## Dependencies

### Runtime Dependencies
- `electron` - Cross-platform desktop app framework
- `edge-tts` - Microsoft Edge TTS engine interface
- `fluent-ffmpeg` - FFmpeg wrapper for audio processing

### Development Dependencies
- `electron-builder` - Application packaging and distribution

## License

MIT License - see LICENSE file for details