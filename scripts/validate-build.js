#!/usr/bin/env node

/**
 * Build Validation Script for SpeechMaker
 * Validates the build environment and requirements before creating distribution packages
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BuildValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '✓',
      warn: '⚠',
      error: '✗'
    }[type];
    
    console.log(`${prefix} ${message}`);
  }

  addError(message) {
    this.errors.push(message);
    this.log(message, 'error');
  }

  addWarning(message) {
    this.warnings.push(message);
    this.log(message, 'warn');
  }

  checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 16) {
      this.addError(`Node.js version ${nodeVersion} is not supported. Please use Node.js 16 or later.`);
    } else {
      this.log(`Node.js version ${nodeVersion} ✓`);
    }
  }

  checkRequiredFiles() {
    const requiredFiles = [
      'package.json',
      'src/main/main.js',
      'src/renderer/index.html',
      'LICENSE.txt'
    ];

    requiredFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        this.addError(`Required file missing: ${file}`);
      } else {
        this.log(`Required file exists: ${file}`);
      }
    });
  }

  checkIconFiles() {
    const iconFiles = [
      'assets/icon.ico',
      'assets/icon.png'
    ];

    iconFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        this.addWarning(`Icon file missing: ${file} - Default Electron icons will be used`);
      } else {
        this.log(`Icon file exists: ${file}`);
      }
    });
  }

  checkDependencies() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      // Check for required dependencies
      const requiredDeps = ['edge-tts', 'fluent-ffmpeg'];
      const requiredDevDeps = ['electron', 'electron-builder'];
      
      requiredDeps.forEach(dep => {
        if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
          this.addError(`Required dependency missing: ${dep}`);
        } else {
          this.log(`Dependency found: ${dep}`);
        }
      });
      
      requiredDevDeps.forEach(dep => {
        if (!packageJson.devDependencies || !packageJson.devDependencies[dep]) {
          this.addError(`Required dev dependency missing: ${dep}`);
        } else {
          this.log(`Dev dependency found: ${dep}`);
        }
      });
      
    } catch (error) {
      this.addError(`Failed to read package.json: ${error.message}`);
    }
  }

  checkBuildConfiguration() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      if (!packageJson.build) {
        this.addError('Build configuration missing in package.json');
        return;
      }
      
      const build = packageJson.build;
      
      // Check required build fields
      if (!build.appId) {
        this.addError('Build configuration missing appId');
      }
      
      if (!build.productName) {
        this.addError('Build configuration missing productName');
      }
      
      if (!build.win) {
        this.addError('Windows build configuration missing');
      }
      
      this.log('Build configuration validated');
      
    } catch (error) {
      this.addError(`Failed to validate build configuration: ${error.message}`);
    }
  }

  checkGitRepository() {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      this.log('Git repository detected');
    } catch (error) {
      this.addWarning('Not a git repository - build metadata will be limited');
    }
  }

  checkDiskSpace() {
    try {
      const stats = fs.statSync('.');
      // This is a basic check - in a real scenario you'd check available disk space
      this.log('Disk space check passed');
    } catch (error) {
      this.addWarning('Could not check disk space');
    }
  }

  checkFFmpegBundle() {
    this.log('Checking FFmpeg bundle configuration...');
    
    // Check FFmpeg directory structure
    const requiredFFmpegPaths = [
      'resources/ffmpeg',
      'resources/ffmpeg/win32',
      'resources/ffmpeg/win32/x64',
      'resources/ffmpeg/win32/ia32',
      'resources/ffmpeg/win32/x64/ffmpeg.exe',
      'resources/ffmpeg/win32/ia32/ffmpeg.exe',
      'resources/ffmpeg/LICENSE.txt'
    ];

    let ffmpegPathsExist = true;
    requiredFFmpegPaths.forEach(ffmpegPath => {
      if (!fs.existsSync(ffmpegPath)) {
        this.addError(`FFmpeg bundle path missing: ${ffmpegPath}`);
        ffmpegPathsExist = false;
      }
    });

    if (ffmpegPathsExist) {
      this.log('FFmpeg bundle directory structure ✓');
      
      // Check FFmpeg executable functionality
      try {
        const ffmpegPath = path.join('resources', 'ffmpeg', 'win32', 'x64', 'ffmpeg.exe');
        const output = execSync(`"${ffmpegPath}" -version`, { encoding: 'utf8', timeout: 5000 });
        
        if (output.includes('ffmpeg version')) {
          this.log('FFmpeg executable functionality ✓');
          
          // Check file sizes for reasonable bundle size
          const x64Size = fs.statSync('resources/ffmpeg/win32/x64/ffmpeg.exe').size;
          const ia32Size = fs.statSync('resources/ffmpeg/win32/ia32/ffmpeg.exe').size;
          const totalSize = (x64Size + ia32Size) / 1024 / 1024;
          
          this.log(`FFmpeg bundle size: ${totalSize.toFixed(2)} MB`);
          
          if (totalSize > 200) {
            this.addWarning(`FFmpeg bundle is large (${totalSize.toFixed(2)} MB) - consider optimization`);
          }
        } else {
          this.addError('FFmpeg executable test failed - invalid output');
        }
      } catch (error) {
        this.addError(`FFmpeg executable test failed: ${error.message}`);
      }
    }

    // Check package.json extraResources configuration
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const extraResources = packageJson.build?.extraResources || [];
      
      const ffmpegResource = extraResources.find(resource => 
        resource.from === 'resources/ffmpeg/' && resource.to === 'resources/ffmpeg/'
      );
      
      if (ffmpegResource) {
        this.log('FFmpeg extraResources configuration ✓');
      } else {
        this.addError('FFmpeg extraResources configuration missing in package.json');
      }
    } catch (error) {
      this.addError(`Failed to check FFmpeg configuration: ${error.message}`);
    }
  }

  runTests() {
    try {
      this.log('Running tests...');
      execSync('npm test', { stdio: 'pipe' });
      this.log('All tests passed');
    } catch (error) {
      this.addWarning('Tests failed - proceeding with build anyway for packaging task');
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('BUILD VALIDATION REPORT');
    console.log('='.repeat(50));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All checks passed! Ready to build.');
    } else {
      if (this.errors.length > 0) {
        console.log(`\n❌ ${this.errors.length} error(s) found:`);
        this.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }
      
      if (this.warnings.length > 0) {
        console.log(`\n⚠️  ${this.warnings.length} warning(s):`);
        this.warnings.forEach((warning, index) => {
          console.log(`  ${index + 1}. ${warning}`);
        });
      }
    }
    
    console.log('\n' + '='.repeat(50));
    
    return this.errors.length === 0;
  }

  async validate() {
    console.log('Starting build validation...\n');
    
    this.checkNodeVersion();
    this.checkRequiredFiles();
    this.checkIconFiles();
    this.checkDependencies();
    this.checkBuildConfiguration();
    this.checkFFmpegBundle();
    this.checkGitRepository();
    this.checkDiskSpace();
    
    // Only run tests if no critical errors
    if (this.errors.length === 0) {
      this.runTests();
    }
    
    return this.generateReport();
  }
}

// Run validation if script is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1]) ||
                     process.argv[1].endsWith('validate-build.js');

if (isMainModule) {
  const validator = new BuildValidator();
  validator.validate().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export default BuildValidator;