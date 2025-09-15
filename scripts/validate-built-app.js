#!/usr/bin/env node

/**
 * Built Application Validation Script
 * Validates that the built application includes all required resources, especially FFmpeg
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

class BuiltAppValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.buildDir = 'dist/win-unpacked';
    this.resourcesDir = path.join(this.buildDir, 'resources');
  }

  log(message, type = 'info') {
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

  checkBuildExists() {
    if (!fs.existsSync(this.buildDir)) {
      this.addError(`Build directory not found: ${this.buildDir}`);
      this.addError('Run "npm run build" first to create the build');
      return false;
    }
    
    this.log(`Build directory found: ${this.buildDir}`);
    return true;
  }

  checkMainExecutable() {
    const exePath = path.join(this.buildDir, 'SpeechMaker.exe');
    
    if (!fs.existsSync(exePath)) {
      this.addError('Main executable not found: SpeechMaker.exe');
      return false;
    }
    
    const stats = fs.statSync(exePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    this.log(`Main executable found (${sizeMB} MB)`);
    
    return true;
  }

  checkApplicationResources() {
    this.log('Checking application resources...');
    
    // Check if resources directory exists
    if (!fs.existsSync(this.resourcesDir)) {
      this.addError('Resources directory not found in build');
      return false;
    }
    
    // Check for app.asar or app directory
    const appAsarPath = path.join(this.resourcesDir, 'app.asar');
    const appDirPath = path.join(this.resourcesDir, 'app');
    
    if (fs.existsSync(appAsarPath)) {
      const stats = fs.statSync(appAsarPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      this.log(`Application archive found: app.asar (${sizeMB} MB)`);
    } else if (fs.existsSync(appDirPath)) {
      this.log('Application directory found: app/');
    } else {
      this.addError('Application files not found (no app.asar or app directory)');
      return false;
    }
    
    return true;
  }

  checkFFmpegBundle() {
    this.log('Checking FFmpeg bundle in built application...');
    
    const ffmpegBasePath = path.join(this.resourcesDir, 'resources', 'ffmpeg');
    
    if (!fs.existsSync(ffmpegBasePath)) {
      this.addError('FFmpeg bundle not found in built application');
      return false;
    }
    
    // Check FFmpeg executables
    const requiredFFmpegPaths = [
      path.join(ffmpegBasePath, 'win32', 'x64', 'ffmpeg.exe'),
      path.join(ffmpegBasePath, 'win32', 'ia32', 'ffmpeg.exe'),
      path.join(ffmpegBasePath, 'LICENSE.txt')
    ];
    
    let allFFmpegFilesExist = true;
    
    for (const ffmpegPath of requiredFFmpegPaths) {
      if (fs.existsSync(ffmpegPath)) {
        if (ffmpegPath.endsWith('.exe')) {
          const stats = fs.statSync(ffmpegPath);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          const arch = ffmpegPath.includes('x64') ? 'x64' : 'ia32';
          this.log(`FFmpeg ${arch} executable found (${sizeMB} MB)`);
        } else {
          this.log(`FFmpeg ${path.basename(ffmpegPath)} found`);
        }
      } else {
        this.addError(`FFmpeg file missing: ${path.relative(this.buildDir, ffmpegPath)}`);
        allFFmpegFilesExist = false;
      }
    }
    
    // Test FFmpeg functionality if executables exist
    if (allFFmpegFilesExist) {
      try {
        const ffmpegPath = path.join(ffmpegBasePath, 'win32', 'x64', 'ffmpeg.exe');
        const output = execSync(`"${ffmpegPath}" -version`, { 
          encoding: 'utf8', 
          timeout: 5000,
          stdio: 'pipe'
        });
        
        if (output.includes('ffmpeg version')) {
          this.log('Built FFmpeg executable is functional ✓');
          
          // Extract version info
          const versionLine = output.split('\n')[0];
          const versionMatch = versionLine.match(/ffmpeg version ([^\s]+)/);
          if (versionMatch) {
            this.log(`FFmpeg version: ${versionMatch[1]}`);
          }
        } else {
          this.addError('Built FFmpeg executable test failed - invalid output');
        }
      } catch (error) {
        this.addError(`Built FFmpeg executable test failed: ${error.message}`);
      }
    }
    
    return allFFmpegFilesExist;
  }

  checkOtherResources() {
    this.log('Checking other bundled resources...');
    
    // Check for assets
    const assetsPath = path.join(this.resourcesDir, 'resources', 'assets');
    if (fs.existsSync(assetsPath)) {
      this.log('Assets directory found in build');
      
      // Check for icon files
      const iconPath = path.join(assetsPath, 'icon.ico');
      if (fs.existsSync(iconPath)) {
        this.log('Application icon found');
      }
    } else {
      this.addWarning('Assets directory not found in build');
    }
    
    return true;
  }

  calculateBuildSize() {
    this.log('Calculating build size...');
    
    try {
      const calculateDirSize = (dirPath) => {
        if (!fs.existsSync(dirPath)) return 0;
        
        let totalSize = 0;
        const items = fs.readdirSync(dirPath);
        
        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          const stats = fs.statSync(itemPath);
          
          if (stats.isDirectory()) {
            totalSize += calculateDirSize(itemPath);
          } else {
            totalSize += stats.size;
          }
        }
        
        return totalSize;
      };
      
      const totalSize = calculateDirSize(this.buildDir);
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      
      this.log(`Total build size: ${sizeMB} MB`);
      
      // Size warnings
      if (totalSize > 200 * 1024 * 1024) { // 200MB
        this.addWarning(`Large build size (${sizeMB} MB) - consider optimization`);
      }
      
      return totalSize;
      
    } catch (error) {
      this.addWarning(`Could not calculate build size: ${error.message}`);
      return 0;
    }
  }

  checkDistributionFiles() {
    this.log('Checking distribution files...');
    
    const distDir = 'dist';
    if (!fs.existsSync(distDir)) {
      this.addWarning('Distribution directory not found - run "npm run dist" to create installers');
      return false;
    }
    
    // Look for installer files
    const installerPattern = /SpeechMaker.*Setup.*\.exe$/i;
    const portablePattern = /SpeechMaker.*portable.*\.exe$/i;
    
    const distFiles = fs.readdirSync(distDir);
    const installerFiles = distFiles.filter(file => installerPattern.test(file));
    const portableFiles = distFiles.filter(file => portablePattern.test(file));
    
    if (installerFiles.length > 0) {
      installerFiles.forEach(file => {
        const filePath = path.join(distDir, file);
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        this.log(`NSIS installer found: ${file} (${sizeMB} MB)`);
      });
    } else {
      this.addWarning('NSIS installer not found in dist directory');
    }
    
    if (portableFiles.length > 0) {
      portableFiles.forEach(file => {
        const filePath = path.join(distDir, file);
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        this.log(`Portable executable found: ${file} (${sizeMB} MB)`);
      });
    } else {
      this.addWarning('Portable executable not found in dist directory');
    }
    
    return installerFiles.length > 0 || portableFiles.length > 0;
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('BUILT APPLICATION VALIDATION REPORT');
    console.log('='.repeat(60));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ Built application validation passed! All components are properly bundled.');
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
    
    console.log('\n' + '='.repeat(60));
    
    return this.errors.length === 0;
  }

  async validate() {
    console.log('Validating built application...\n');
    
    if (!this.checkBuildExists()) {
      return this.generateReport();
    }
    
    this.checkMainExecutable();
    this.checkApplicationResources();
    this.checkFFmpegBundle();
    this.checkOtherResources();
    this.calculateBuildSize();
    this.checkDistributionFiles();
    
    return this.generateReport();
  }
}

// Run validation if script is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1]) ||
                     process.argv[1].endsWith('validate-built-app.js');

if (isMainModule) {
  const validator = new BuiltAppValidator();
  validator.validate().then(success => {
    if (success) {
      console.log('\n🎉 Built application is ready for distribution!');
      console.log('\nRecommended testing steps:');
      console.log('1. Test the application on a clean Windows system');
      console.log('2. Verify FFmpeg functionality for MP3 conversion');
      console.log('3. Test both installer and portable versions');
      console.log('4. Verify all TTS voices load correctly');
    }
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export default BuiltAppValidator;