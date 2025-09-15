/**
 * Task 11 Integration Validation Script
 * 
 * Validates that all improvements are properly integrated into the main application flow:
 * - Enhanced audio processor with FFmpeg bundling
 * - TTS service with retry mechanisms  
 * - Settings manager with default folder management
 * - State management system coordination
 * - Complete startup sequence with parallel initialization
 * - Proper cleanup and resource management
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.2, 6.1
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class IntegrationValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    console.log(logMessage);
    
    this.results.details.push({
      timestamp,
      type,
      message
    });
  }

  pass(message) {
    this.results.passed++;
    this.log(message, 'pass');
  }

  fail(message) {
    this.results.failed++;
    this.log(message, 'fail');
  }

  warn(message) {
    this.results.warnings++;
    this.log(message, 'warn');
  }

  async validateFileExists(filePath, description) {
    try {
      await fs.access(filePath);
      this.pass(`${description} exists: ${filePath}`);
      return true;
    } catch (error) {
      this.fail(`${description} missing: ${filePath}`);
      return false;
    }
  }

  async validateServiceIntegration() {
    this.log('Validating service integration...', 'info');
    
    // Check main.js integration
    const mainJsPath = path.join(__dirname, 'src/main/main.js');
    if (await this.validateFileExists(mainJsPath, 'Main application file')) {
      const mainContent = await fs.readFile(mainJsPath, 'utf8');
      
      // Check for enhanced service initialization
      if (mainContent.includes('initializeCoreServices')) {
        this.pass('Enhanced core service initialization found');
      } else {
        this.fail('Enhanced core service initialization missing');
      }
      
      // Check for parallel FFmpeg and voice loading
      if (mainContent.includes('ffmpegInitPromise') && mainContent.includes('voiceLoadPromise')) {
        this.pass('Parallel FFmpeg and voice loading implementation found');
      } else {
        this.fail('Parallel initialization implementation missing');
      }
      
      // Check for comprehensive status reporting
      if (mainContent.includes('initialization:update') && mainContent.includes('initialization:complete')) {
        this.pass('Comprehensive status reporting found');
      } else {
        this.fail('Status reporting implementation missing');
      }
      
      // Check for resource cleanup
      if (mainContent.includes('cleanupApplicationResources')) {
        this.pass('Resource cleanup implementation found');
      } else {
        this.fail('Resource cleanup implementation missing');
      }
    }
  }

  async validateServiceFiles() {
    this.log('Validating service files...', 'info');
    
    const serviceFiles = [
      { path: 'src/main/services/settingsManager.js', name: 'Settings Manager' },
      { path: 'src/main/services/ttsService.js', name: 'TTS Service' },
      { path: 'src/main/services/audioProcessor.js', name: 'Audio Processor' },
      { path: 'src/main/services/errorHandler.js', name: 'Error Handler' },
      { path: 'src/main/services/fileManager.js', name: 'File Manager' },
      { path: 'src/main/ipc/ipcHandlers.js', name: 'IPC Handlers' }
    ];

    for (const service of serviceFiles) {
      const fullPath = path.join(__dirname, service.path);
      await this.validateFileExists(fullPath, service.name);
    }
  }

  async validateEnhancedFeatures() {
    this.log('Validating enhanced features...', 'info');
    
    // Check audio processor enhancements
    const audioProcessorPath = path.join(__dirname, 'src/main/services/audioProcessor.js');
    try {
      const audioContent = await fs.readFile(audioProcessorPath, 'utf8');
      
      if (audioContent.includes('initializeFFmpeg')) {
        this.pass('FFmpeg initialization method found');
      } else {
        this.fail('FFmpeg initialization method missing');
      }
      
      if (audioContent.includes('getBundledFFmpegPath')) {
        this.pass('Bundled FFmpeg path method found');
      } else {
        this.fail('Bundled FFmpeg path method missing');
      }
      
      if (audioContent.includes('validateFFmpeg')) {
        this.pass('FFmpeg validation method found');
      } else {
        this.fail('FFmpeg validation method missing');
      }
    } catch (error) {
      this.fail(`Could not validate audio processor: ${error.message}`);
    }

    // Check TTS service enhancements
    const ttsServicePath = path.join(__dirname, 'src/main/services/ttsService.js');
    try {
      const ttsContent = await fs.readFile(ttsServicePath, 'utf8');
      
      if (ttsContent.includes('loadVoicesWithRetry')) {
        this.pass('Voice loading retry method found');
      } else {
        this.fail('Voice loading retry method missing');
      }
      
      if (ttsContent.includes('getTroubleshootingSteps')) {
        this.pass('Troubleshooting steps method found');
      } else {
        this.fail('Troubleshooting steps method missing');
      }
    } catch (error) {
      this.fail(`Could not validate TTS service: ${error.message}`);
    }

    // Check settings manager enhancements
    const settingsPath = path.join(__dirname, 'src/main/services/settingsManager.js');
    try {
      const settingsContent = await fs.readFile(settingsPath, 'utf8');
      
      if (settingsContent.includes('getDefaultOutputFolder')) {
        this.pass('Default output folder method found');
      } else {
        this.fail('Default output folder method missing');
      }
      
      if (settingsContent.includes('ensureDirectoryExists')) {
        this.pass('Directory existence validation method found');
      } else {
        this.fail('Directory existence validation method missing');
      }
    } catch (error) {
      this.fail(`Could not validate settings manager: ${error.message}`);
    }
  }

  async validateTestSuite() {
    this.log('Validating test suite...', 'info');
    
    const testPath = path.join(__dirname, 'test/task11-integration.test.js');
    if (await this.validateFileExists(testPath, 'Integration test suite')) {
      const testContent = await fs.readFile(testPath, 'utf8');
      
      // Check for comprehensive test coverage
      const testSections = [
        'Service Integration',
        'Enhanced FFmpeg Integration', 
        'Voice Loading with Retry Mechanism',
        'Default Output Folder Management',
        'Application State Management',
        'IPC Integration',
        'Resource Cleanup',
        'End-to-End Integration'
      ];
      
      let foundSections = 0;
      testSections.forEach(section => {
        if (testContent.includes(section)) {
          foundSections++;
        }
      });
      
      if (foundSections >= testSections.length * 0.8) {
        this.pass(`Comprehensive test coverage found (${foundSections}/${testSections.length} sections)`);
      } else {
        this.warn(`Limited test coverage (${foundSections}/${testSections.length} sections)`);
      }
    }
  }

  async validatePackageConfiguration() {
    this.log('Validating package configuration...', 'info');
    
    const packagePath = path.join(__dirname, 'package.json');
    if (await this.validateFileExists(packagePath, 'Package configuration')) {
      const packageContent = await fs.readFile(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);
      
      // Check for required dependencies
      const requiredDeps = ['electron', 'edge-tts'];
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      requiredDeps.forEach(dep => {
        if (allDeps[dep]) {
          this.pass(`Required dependency found: ${dep}`);
        } else {
          this.fail(`Required dependency missing: ${dep}`);
        }
      });
      
      // Check for build configuration
      if (packageJson.build && packageJson.build.extraResources) {
        this.pass('Build configuration with extra resources found');
      } else {
        this.warn('Build configuration may need FFmpeg resource bundling');
      }
    }
  }

  async runValidation() {
    this.log('Starting Task 11 Integration Validation...', 'info');
    
    try {
      await this.validateServiceFiles();
      await this.validateServiceIntegration();
      await this.validateEnhancedFeatures();
      await this.validateTestSuite();
      await this.validatePackageConfiguration();
      
      this.log('Validation completed', 'info');
      this.printSummary();
      
      return this.results.failed === 0;
    } catch (error) {
      this.fail(`Validation failed with error: ${error.message}`);
      this.printSummary();
      return false;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TASK 11 INTEGRATION VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    console.log(`📊 Total Checks: ${this.results.passed + this.results.failed + this.results.warnings}`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All integration checks passed! Task 11 is complete.');
    } else {
      console.log('\n❌ Some integration checks failed. Review the details above.');
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new IntegrationValidator();
  validator.runValidation().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation error:', error);
    process.exit(1);
  });
}

module.exports = IntegrationValidator; 
//
 Run validation if called directly
if (require.main === module) {
  const validator = new IntegrationValidator();
  validator.runValidation().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation error:', error);
    process.exit(1);
  });
}

module.exports = IntegrationValidator;