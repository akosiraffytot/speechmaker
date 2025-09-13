#!/usr/bin/env node

/**
 * Packaging Build Script for SpeechMaker
 * Focused on testing the packaging and distribution setup without running tests
 */

import fs from 'fs';
import { execSync } from 'child_process';

class PackagingValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
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
      } else {
        this.log('Windows build configuration found');
        if (build.win.target) {
          this.log(`Build targets: ${build.win.target.map(t => t.target).join(', ')}`);
        }
      }
      
      if (build.nsis) {
        this.log('NSIS installer configuration found');
      }
      
      this.log('Build configuration validated');
      
    } catch (error) {
      this.addError(`Failed to validate build configuration: ${error.message}`);
    }
  }

  checkElectronBuilder() {
    try {
      // Check if electron-builder is available
      execSync('npx electron-builder --help', { stdio: 'pipe' });
      this.log('Electron Builder is available');
    } catch (error) {
      this.addError('Electron Builder is not available or not working');
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('PACKAGING VALIDATION REPORT');
    console.log('='.repeat(50));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All checks passed! Ready for packaging.');
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
    console.log('Starting packaging validation...\n');
    
    this.checkNodeVersion();
    this.checkRequiredFiles();
    this.checkIconFiles();
    this.checkBuildConfiguration();
    this.checkElectronBuilder();
    
    return this.generateReport();
  }
}

// Run validation
const validator = new PackagingValidator();
validator.validate().then(success => {
  if (success) {
    console.log('\n🚀 Packaging configuration is ready!');
    console.log('\nNext steps:');
    console.log('1. Run "npm run dist" to create distribution packages');
    console.log('2. Test the generated installer on a clean Windows system');
    console.log('3. Verify all application features work in the packaged version');
  }
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});