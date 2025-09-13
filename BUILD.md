# SpeechMaker Build Guide

This document provides comprehensive instructions for building and distributing the SpeechMaker application.

## Prerequisites

### System Requirements
- **Operating System**: Windows 10 or later (for development and testing)
- **Node.js**: Version 16.0.0 or later
- **npm**: Version 7.0.0 or later (comes with Node.js)
- **Git**: For version control and build metadata

### Development Dependencies
All development dependencies are automatically installed via `npm install`:
- Electron 27.0.0+
- Electron Builder 24.6.4+
- Vitest (for testing)
- Rimraf (for cleaning build directories)

## Build Scripts

### Development Build
```bash
# Run the application in development mode
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Production Build
```bash
# Clean previous builds
npm run clean

# Build application (unpacked)
npm run build

# Create Windows installer and portable executable
npm run dist

# Create only Windows installer (NSIS)
npm run dist:nsis

# Create only portable executable
npm run dist:portable

# Full release build (clean + test + dist)
npm run release
```

## Build Outputs

The build process creates the following files in the `dist/` directory:

### NSIS Installer
- **File**: `SpeechMaker Setup 1.0.0.exe`
- **Type**: Windows installer with installation wizard
- **Features**:
  - Custom installation directory selection
  - Desktop and Start Menu shortcuts
  - File associations for .txt files
  - Uninstaller with option to keep user data
  - FFmpeg detection and guidance

### Portable Executable
- **File**: `SpeechMaker-1.0.0-portable.exe`
- **Type**: Standalone executable (no installation required)
- **Features**:
  - Run from any location
  - No registry modifications
  - Ideal for USB drives or temporary use

### Unpacked Application
- **Directory**: `dist/win-unpacked/`
- **Type**: Unpacked application files
- **Use**: Development testing and debugging

## Build Configuration

### Electron Builder Settings
The build configuration is defined in `package.json` under the `build` section:

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

### Custom NSIS Configuration
Advanced installer features are configured in `build/installer.nsh`:
- File associations
- Registry entries
- FFmpeg detection
- Custom uninstall options

## Icon Requirements

### Required Files
Before building for distribution, ensure these icon files exist:

1. **assets/icon.ico** - Windows ICO format
   - Multiple sizes: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16
   - Used for: Application executable, installer, shortcuts

2. **assets/icon.png** - PNG format
   - Size: 256x256 pixels
   - Used for: Application window, taskbar

### Creating Icons
1. Design a 256x256 PNG icon representing text-to-speech (microphone, speech bubble)
2. Convert to ICO format using tools like:
   - Online: https://convertio.co/png-ico/
   - Software: GIMP, Paint.NET, Adobe Photoshop

## Build Validation

### Pre-build Checks
The build process automatically validates:
- Required source files exist
- Node.js version compatibility
- Icon files presence (warns if missing)

### Manual Validation
```bash
# Run validation script
node build/build-config.js

# Run tests before building
npm test
```

## Distribution Testing

### Testing the Installer
1. **Clean System Test**:
   - Test on a Windows system without Node.js or development tools
   - Verify all features work correctly
   - Test installation and uninstallation process

2. **Compatibility Test**:
   - Test on Windows 10 and Windows 11
   - Test on systems with and without FFmpeg
   - Verify TTS voices are detected correctly

3. **Security Test**:
   - Run installer as standard user (not administrator)
   - Verify no unnecessary permissions are requested
   - Test application sandboxing

### Testing the Portable Version
1. **Portability Test**:
   - Run from different directories
   - Test on systems without installation privileges
   - Verify no registry modifications

2. **Functionality Test**:
   - All features work identically to installed version
   - Settings are saved in application directory
   - No conflicts with installed version

## Troubleshooting

### Common Build Issues

#### Missing Icon Files
```
Warning: Icon file missing: assets/icon.ico
```
**Solution**: Create icon files or use placeholder icons for testing

#### Node.js Version Error
```
Node.js version v14.x.x is not supported
```
**Solution**: Upgrade to Node.js 16 or later

#### Build Directory Permissions
```
Error: EACCES: permission denied
```
**Solution**: Run `npm run clean` and try again, or check directory permissions

#### FFmpeg Not Found (Runtime)
```
FFmpeg not detected during installation
```
**Solution**: This is expected behavior. Users can install FFmpeg separately for MP3 support.

### Build Performance

#### Optimization Tips
1. **Exclude unnecessary files**:
   - Test files are automatically excluded
   - Documentation files are filtered out
   - Source maps are excluded in production

2. **Compression settings**:
   - Maximum compression is used for distribution builds
   - Store compression for development builds (faster)

3. **Parallel builds**:
   - Use `--parallel` flag for faster builds on multi-core systems

## Release Process

### Version Management
1. Update version in `package.json`
2. Update changelog/release notes
3. Commit changes and create git tag
4. Run full release build: `npm run release`

### Distribution Checklist
- [ ] All tests pass
- [ ] Icons are properly created and included
- [ ] Build validation passes
- [ ] Installer tested on clean system
- [ ] Portable version tested
- [ ] FFmpeg detection works correctly
- [ ] File associations work (optional)
- [ ] Uninstaller works properly
- [ ] Application starts and functions correctly

### Security Considerations
- Code signing (optional but recommended for production)
- Virus scanner testing
- Windows SmartScreen compatibility
- User Account Control (UAC) behavior

## Support and Maintenance

### Build Environment
- Keep Node.js and npm updated
- Update Electron and Electron Builder regularly
- Test builds on target Windows versions

### Monitoring
- Track installer download and usage statistics
- Monitor crash reports and error logs
- Collect user feedback on installation experience

For additional help, refer to:
- [Electron Builder Documentation](https://www.electron.build/)
- [Electron Documentation](https://www.electronjs.org/docs)
- [NSIS Documentation](https://nsis.sourceforge.io/Docs/)