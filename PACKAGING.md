# SpeechMaker Packaging and Distribution

This document explains the packaging and distribution setup for SpeechMaker.

## Overview

SpeechMaker uses Electron Builder to create Windows distribution packages. The configuration supports:

- **NSIS Installer**: Full Windows installer with shortcuts and file associations
- **Portable Executable**: Standalone .exe that runs without installation
- **Unpacked Build**: Development build for testing

## Build Configuration

### Package.json Configuration

The main build configuration is in `package.json` under the `build` section:

```json
{
  "build": {
    "appId": "com.speechmaker.app",
    "productName": "SpeechMaker",
    "win": {
      "target": ["nsis", "portable"],
      "icon": "assets/icon.ico"
    }
  }
}
```

### Key Features

1. **Dual Target Build**: Creates both installer and portable versions
2. **File Exclusions**: Automatically excludes test files and documentation
3. **Custom NSIS Script**: Advanced installer features via `build/installer.nsh`
4. **Build Validation**: Pre-build checks ensure all requirements are met

## Build Scripts

### Available Commands

```bash
# Development
npm run dev              # Run in development mode
npm test                 # Run test suite
npm run validate         # Run build validation

# Building
npm run build            # Create unpacked build
npm run dist             # Create all distribution packages
npm run dist:nsis        # Create only NSIS installer
npm run dist:portable    # Create only portable executable

# Utilities
npm run clean            # Clean build directories
npm run release          # Full release build (clean + test + dist)
```

### Automated Scripts

- **Windows Batch**: `scripts/build-windows.bat` - Simple automated build
- **PowerShell**: `scripts/build-windows.ps1` - Advanced build with options
- **Validation**: `scripts/validate-build.js` - Pre-build validation

## Build Outputs

### NSIS Installer Features

- Custom installation directory selection
- Desktop and Start Menu shortcuts
- File associations for .txt files (optional)
- FFmpeg detection and user guidance
- Proper uninstaller with data retention options

### Portable Executable Features

- No installation required
- Runs from any location
- No registry modifications
- Ideal for USB drives or temporary use

## Icon Requirements

### Required Files

Before building for production:

1. **assets/icon.ico** - Windows ICO format (multiple sizes)
2. **assets/icon.png** - PNG format (256x256 recommended)

### Creating Icons

1. Design a 256x256 icon representing text-to-speech functionality
2. Use tools like GIMP, Paint.NET, or online converters
3. Ensure clarity at small sizes (16x16, 32x32)

## Build Validation

### Automatic Checks

The build process validates:

- Node.js version compatibility (16+)
- Required source files exist
- Dependencies are installed
- Build configuration is valid
- Tests pass (unless skipped)

### Manual Validation

```bash
npm run validate
```

## Distribution Testing

### Testing Checklist

- [ ] Install on clean Windows system
- [ ] Test all application features
- [ ] Verify shortcuts work correctly
- [ ] Test portable version
- [ ] Check FFmpeg detection
- [ ] Verify uninstaller works

### System Requirements

- **Minimum**: Windows 10
- **Architecture**: x64 (primary target)
- **Dependencies**: Microsoft Edge TTS (included with Windows)
- **Optional**: FFmpeg (for MP3 conversion)

## Advanced Configuration

### Custom NSIS Features

The `build/installer.nsh` file provides:

- Registry integration
- File associations
- FFmpeg detection
- Custom uninstall behavior

### Build Optimization

- Maximum compression for distribution
- File exclusions to reduce size
- Dependency bundling optimization

## Troubleshooting

### Common Issues

1. **Missing Icons**: Build succeeds but uses default Electron icons
2. **Large File Size**: Check file exclusions in package.json
3. **Build Failures**: Run validation script to identify issues

### Performance Tips

- Use `npm run clean` before major builds
- Exclude unnecessary files via build configuration
- Consider code signing for production releases

## Security Considerations

### Code Signing

For production releases, consider:

- Windows code signing certificate
- Automated signing in CI/CD pipeline
- SmartScreen compatibility

### Build Security

- Validate all dependencies
- Use official Electron Builder releases
- Scan final executables with antivirus

## Continuous Integration

### GitHub Actions Example

```yaml
name: Build Windows
on: [push, pull_request]
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run release
```

## Support

For build issues:

1. Check build validation output
2. Review Electron Builder documentation
3. Verify system requirements
4. Test on clean Windows installation

## References

- [Electron Builder Documentation](https://www.electron.build/)
- [NSIS Documentation](https://nsis.sourceforge.io/Docs/)
- [Electron Security Guidelines](https://www.electronjs.org/docs/tutorial/security)