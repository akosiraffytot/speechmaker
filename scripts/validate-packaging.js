#!/usr/bin/env node

/**
 * Packaging Validation Script for SpeechMaker
 * Validates packaging configuration and estimates installer sizes with FFmpeg bundling
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PackagingValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.sizeInfo = {
      application: 0,
      ffmpeg: 0,
      assets: 0,
      nodeModules: 0,
      total: 0
    };
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

  formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  calculateDirectorySize(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    
    let totalSize = 0;
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += this.calculateDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }

  calculateApplicationSizes() {
    this.log('Calculating application component sizes...');
    
    // Calculate source code size
    if (fs.existsSync('src')) {
      this.sizeInfo.application = this.calculateDirectorySize('src');
      this.log(`Source code size: ${this.formatSize(this.sizeInfo.application)}`);
    }
    
    // Calculate FFmpeg bundle size
    if (fs.existsSync('resources/ffmpeg')) {
      this.sizeInfo.ffmpeg = this.calculateDirectorySize('resources/ffmpeg');
      this.log(`FFmpeg bundle size: ${this.formatSize(this.sizeInfo.ffmpeg)}`);
      
      // Detailed FFmpeg breakdown
      const x64Path = 'resources/ffmpeg/win32/x64/ffmpeg.exe';
      const ia32Path = 'resources/ffmpeg/win32/ia32/ffmpeg.exe';
      
      if (fs.existsSync(x64Path)) {
        const x64Size = fs.statSync(x64Path).size;
        this.log(`  - x64 FFmpeg: ${this.formatSize(x64Size)}`);
      }
      
      if (fs.existsSync(ia32Path)) {
        const ia32Size = fs.statSync(ia32Path).size;
        this.log(`  - ia32 FFmpeg: ${this.formatSize(ia32Size)}`);
      }
    } else {
      this.addError('FFmpeg bundle directory not found');
    }
    
    // Calculate assets size
    if (fs.existsSync('assets')) {
      this.sizeInfo.assets = this.calculateDirectorySize('assets');
      this.log(`Assets size: ${this.formatSize(this.sizeInfo.assets)}`);
    }
    
    // Calculate essential node_modules size (production dependencies only)
    if (fs.existsSync('node_modules')) {
      try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const prodDeps = Object.keys(packageJson.dependencies || {});
        
        let prodModulesSize = 0;
        for (const dep of prodDeps) {
          const depPath = path.join('node_modules', dep);
          if (fs.existsSync(depPath)) {
            prodModulesSize += this.calculateDirectorySize(depPath);
          }
        }
        
        this.sizeInfo.nodeModules = prodModulesSize;
        this.log(`Production dependencies size: ${this.formatSize(prodModulesSize)}`);
      } catch (error) {
        this.addWarning(`Could not calculate node_modules size: ${error.message}`);
      }
    }
    
    // Calculate total estimated size
    this.sizeInfo.total = this.sizeInfo.application + this.sizeInfo.ffmpeg + 
                         this.sizeInfo.assets + this.sizeInfo.nodeModules;
    
    this.log(`Estimated total application size: ${this.formatSize(this.sizeInfo.total)}`);
  }

  validatePackagingConfiguration() {
    this.log('Validating packaging configuration...');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const build = packageJson.build;
      
      if (!build) {
        this.addError('Build configuration missing in package.json');
        return;
      }
      
      // Check extraResources configuration
      if (!build.extraResources || !Array.isArray(build.extraResources)) {
        this.addError('extraResources configuration missing');
        return;
      }
      
      // Validate FFmpeg resource configuration
      const ffmpegResource = build.extraResources.find(resource => 
        resource.from === 'resources/ffmpeg/' && resource.to === 'resources/ffmpeg/'
      );
      
      if (!ffmpegResource) {
        this.addError('FFmpeg extraResources configuration missing');
      } else {
        this.log('FFmpeg extraResources configuration ✓');
      }
      
      // Check Windows build configuration
      if (!build.win) {
        this.addError('Windows build configuration missing');
      } else {
        this.log('Windows build configuration ✓');
        
        if (build.win.target && Array.isArray(build.win.target)) {
          const targets = build.win.target.map(t => t.target || t).join(', ');
          this.log(`Build targets: ${targets}`);
        }
      }
      
      // Check NSIS configuration
      if (build.nsis) {
        this.log('NSIS installer configuration ✓');
        
        if (build.nsis.oneClick === false) {
          this.log('Multi-step installer configured');
        }
        
        if (build.nsis.allowToChangeInstallationDirectory) {
          this.log('Custom installation directory allowed');
        }
      }
      
      // Check compression settings
      if (build.compression) {
        this.log(`Compression level: ${build.compression}`);
      }
      
    } catch (error) {
      this.addError(`Failed to validate packaging configuration: ${error.message}`);
    }
  }

  estimateInstallerSizes() {
    this.log('Estimating installer sizes...');
    
    const baseSize = this.sizeInfo.total;
    
    // NSIS installer overhead (approximately 2-5% + compression)
    const nsisOverhead = baseSize * 0.03; // 3% overhead
    const compressionRatio = 0.7; // Assume 30% compression
    
    const estimatedNsisSize = (baseSize + nsisOverhead) * compressionRatio;
    const estimatedPortableSize = baseSize * compressionRatio;
    
    this.log(`Estimated NSIS installer size: ${this.formatSize(estimatedNsisSize)}`);
    this.log(`Estimated portable executable size: ${this.formatSize(estimatedPortableSize)}`);
    
    // Size warnings
    if (estimatedNsisSize > 100 * 1024 * 1024) { // 100MB
      this.addWarning(`Large installer size (${this.formatSize(estimatedNsisSize)}) - consider optimization`);
    }
    
    if (this.sizeInfo.ffmpeg > 50 * 1024 * 1024) { // 50MB
      this.addWarning(`FFmpeg bundle is large (${this.formatSize(this.sizeInfo.ffmpeg)}) - consider using smaller builds`);
    }
    
    return {
      nsis: estimatedNsisSize,
      portable: estimatedPortableSize
    };
  }

  validateBuildScripts() {
    this.log('Validating build scripts...');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const scripts = packageJson.scripts || {};
      
      // Check required build scripts
      const requiredScripts = ['build', 'dist', 'dist:win', 'validate'];
      const missingScripts = requiredScripts.filter(script => !scripts[script]);
      
      if (missingScripts.length > 0) {
        this.addError(`Missing build scripts: ${missingScripts.join(', ')}`);
      } else {
        this.log('Required build scripts present ✓');
      }
      
      // Check if validation is included in build process
      if (scripts.prebuild && scripts.prebuild.includes('validate')) {
        this.log('Pre-build validation configured ✓');
      }
      
      if (scripts.predist && scripts.predist.includes('validate')) {
        this.log('Pre-distribution validation configured ✓');
      }
      
    } catch (error) {
      this.addError(`Failed to validate build scripts: ${error.message}`);
    }
  }

  checkElectronBuilderVersion() {
    this.log('Checking Electron Builder version...');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const electronBuilderVersion = packageJson.devDependencies?.['electron-builder'];
      
      if (electronBuilderVersion) {
        this.log(`Electron Builder version: ${electronBuilderVersion}`);
        
        // Check if it's a recent version (basic check)
        const versionNumber = electronBuilderVersion.replace(/[^\d.]/g, '');
        const majorVersion = parseInt(versionNumber.split('.')[0]);
        
        if (majorVersion < 24) {
          this.addWarning(`Electron Builder version ${electronBuilderVersion} may be outdated`);
        }
      } else {
        this.addError('Electron Builder not found in devDependencies');
      }
      
      // Test if electron-builder is functional
      execSync('npx electron-builder --help', { stdio: 'pipe' });
      this.log('Electron Builder is functional ✓');
      
    } catch (error) {
      this.addError(`Electron Builder check failed: ${error.message}`);
    }
  }

  generatePackagingReport() {
    console.log('\n' + '='.repeat(60));
    console.log('PACKAGING VALIDATION REPORT');
    console.log('='.repeat(60));
    
    // Size breakdown
    console.log('\nSize Breakdown:');
    console.log(`  Application Code: ${this.formatSize(this.sizeInfo.application)}`);
    console.log(`  FFmpeg Bundle:    ${this.formatSize(this.sizeInfo.ffmpeg)}`);
    console.log(`  Assets:           ${this.formatSize(this.sizeInfo.assets)}`);
    console.log(`  Dependencies:     ${this.formatSize(this.sizeInfo.nodeModules)}`);
    console.log(`  Total:            ${this.formatSize(this.sizeInfo.total)}`);
    
    // Installer estimates
    const estimates = this.estimateInstallerSizes();
    console.log('\nEstimated Installer Sizes:');
    console.log(`  NSIS Installer:   ${this.formatSize(estimates.nsis)}`);
    console.log(`  Portable Exe:     ${this.formatSize(estimates.portable)}`);
    
    // Validation results
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('\n✅ All packaging checks passed! Ready for distribution.');
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
    console.log('Starting packaging validation...\n');
    
    this.calculateApplicationSizes();
    this.validatePackagingConfiguration();
    this.validateBuildScripts();
    this.checkElectronBuilderVersion();
    
    return this.generatePackagingReport();
  }
}

// Run validation if script is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1]) ||
                     process.argv[1].endsWith('validate-packaging.js');

if (isMainModule) {
  const validator = new PackagingValidator();
  validator.validate().then(success => {
    if (success) {
      console.log('\n🚀 Packaging configuration is ready!');
      console.log('\nRecommended next steps:');
      console.log('1. Run "npm run dist" to create distribution packages');
      console.log('2. Test the generated installer on a clean Windows system');
      console.log('3. Verify FFmpeg functionality in the packaged application');
      console.log('4. Test both NSIS installer and portable executable');
    }
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export default PackagingValidator;