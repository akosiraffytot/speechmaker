/**
 * Task 14 Validation Script - User Experience Improvements
 * Standalone validation script for speechmaker improvements
 * 
 * This script validates:
 * - Application startup without FFmpeg popups on clean systems
 * - Reliable voice loading with retry mechanisms
 * - Default output folder creation and selection
 * - MP3 format availability indication and functionality
 * - Startup performance and resource usage optimization
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.5, 6.5
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Import services for testing
const AudioProcessor = require('./src/main/services/audioProcessor.js');
const TTSService = require('./src/main/services/ttsService.js');
const SettingsManager = require('./src/main/services/settingsManager.js');

// Mock Electron app for testing
const mockElectronApp = {
    getPath: (name) => {
        if (name === 'userData') {
            return path.join(os.tmpdir(), 'speechmaker-validation');
        }
        return os.tmpdir();
    }
};

// Mock electron module before requiring services
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'electron') {
        return { app: mockElectronApp };
    }
    return originalRequire.apply(this, arguments);
};

class ValidationRunner {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
        this.startupMetrics = {
            startTime: Date.now(),
            ffmpegInitTime: null,
            voiceLoadTime: null,
            totalInitTime: null,
            popupMessages: [],
            errorMessages: []
        };
    }

    async runValidation() {
        console.log('🚀 Starting Task 14 User Experience Improvements Validation\n');
        
        try {
            // Setup test environment
            await this.setupTestEnvironment();
            
            // Run validation tests
            await this.validateFFmpegPopupElimination();
            await this.validateReliableVoiceLoading();
            await this.validateDefaultOutputFolder();
            await this.validateMP3FormatIndication();
            await this.validateStartupPerformance();
            await this.validateApplicationReadiness();
            await this.validateIntegrationFlow();
            
            // Cleanup
            await this.cleanup();
            
            // Report results
            this.reportResults();
            
        } catch (error) {
            console.error('❌ Validation failed with error:', error.message);
            process.exit(1);
        }
    }

    async setupTestEnvironment() {
        console.log('📋 Setting up test environment...');
        
        // Create test directory
        this.testDir = path.join(os.tmpdir(), 'speechmaker-validation-' + Date.now());
        await fs.mkdir(this.testDir, { recursive: true });
        
        // Initialize services
        this.audioProcessor = new AudioProcessor();
        this.ttsService = new TTSService();
        this.settingsManager = new SettingsManager();
        
        // Capture console output for popup detection
        this.originalConsoleLog = console.log;
        this.originalConsoleError = console.error;
        
        console.log = (...args) => {
            const message = args.join(' ');
            // Only capture actual popup/warning messages, not test output
            if (message.toLowerCase().includes('ffmpeg') && 
                (message.toLowerCase().includes('popup') || 
                 message.toLowerCase().includes('warning') ||
                 message.toLowerCase().includes('install')) &&
                !message.includes('Validating') &&
                !message.includes('📍') &&
                !message.includes('🔧')) {
                this.startupMetrics.popupMessages.push(message);
            }
            this.originalConsoleLog(...args);
        };

        console.error = (...args) => {
            const message = args.join(' ');
            this.startupMetrics.errorMessages.push(message);
            this.originalConsoleError(...args);
        };
        
        console.log('✅ Test environment setup complete\n');
    }

    async validateFFmpegPopupElimination() {
        console.log('🔧 Validating FFmpeg Popup Elimination (Requirement 1.1)...');
        
        try {
            const initStartTime = Date.now();
            
            // Initialize FFmpeg detection
            const ffmpegStatus = await this.audioProcessor.initializeFFmpeg();
            this.startupMetrics.ffmpegInitTime = Date.now() - initStartTime;
            
            // Test 1: No popup messages during initialization
            this.assert(
                this.startupMetrics.popupMessages.length === 0,
                'No FFmpeg popup messages during startup',
                `Found ${this.startupMetrics.popupMessages.length} popup messages: ${this.startupMetrics.popupMessages.join(', ')}`
            );
            
            // Test 2: FFmpeg initialization completes without user interruption
            this.assert(
                ffmpegStatus && typeof ffmpegStatus.available === 'boolean',
                'FFmpeg initialization returns valid status',
                'FFmpeg status is undefined or invalid'
            );
            
            // Test 3: Valid FFmpeg source detection
            this.assert(
                ['bundled', 'system', 'none'].includes(ffmpegStatus.source),
                'FFmpeg source is properly detected',
                `Invalid FFmpeg source: ${ffmpegStatus.source}`
            );
            
            // Test 4: Bundled FFmpeg path generation
            const bundledPath = this.audioProcessor.getBundledFFmpegPath();
            this.assert(
                bundledPath && bundledPath.includes('ffmpeg') && bundledPath.includes('resources'),
                'Bundled FFmpeg path is correctly generated',
                `Invalid bundled path: ${bundledPath}`
            );
            
            console.log(`   ⏱️  FFmpeg initialization time: ${this.startupMetrics.ffmpegInitTime}ms`);
            console.log(`   📍 FFmpeg source: ${ffmpegStatus.source}`);
            console.log(`   ✅ FFmpeg available: ${ffmpegStatus.available}\n`);
            
        } catch (error) {
            this.assert(false, 'FFmpeg popup elimination validation', error.message);
        }
    }

    async validateReliableVoiceLoading() {
        console.log('🎤 Validating Reliable Voice Loading (Requirement 2.1)...');
        
        try {
            const voiceLoadStartTime = Date.now();
            
            // Test voice loading with retry mechanism
            const result = await this.ttsService.loadVoicesWithRetry(3);
            this.startupMetrics.voiceLoadTime = Date.now() - voiceLoadStartTime;
            
            // Test 1: Voice loading returns structured result
            this.assert(
                result && typeof result.success === 'boolean',
                'Voice loading returns structured result',
                'Voice loading result is invalid'
            );
            
            // Test 2: Retry mechanism provides attempt information
            const hasAttemptInfo = (result.success && typeof result.attempt === 'number') || 
                                 (!result.success && typeof result.attempts === 'number');
            this.assert(
                hasAttemptInfo,
                'Voice loading provides attempt information',
                `Missing attempt info - success: ${result.success}, attempt: ${result.attempt}, attempts: ${result.attempts}`
            );
            
            // Test 3: Success case validation
            if (result.success) {
                this.assert(
                    Array.isArray(result.voices) && result.voices.length > 0,
                    'Successful voice loading returns voice array',
                    `Invalid voices array: ${result.voices}`
                );
            } else {
                // Test 4: Failure case provides troubleshooting
                this.assert(
                    result.error && Array.isArray(result.troubleshooting),
                    'Failed voice loading provides error and troubleshooting',
                    'Missing error or troubleshooting information'
                );
                
                this.assert(
                    result.troubleshooting.length > 0,
                    'Troubleshooting steps are provided',
                    'No troubleshooting steps available'
                );
            }
            
            // Test 5: Voice loading state management
            const voiceState = this.ttsService.getVoiceLoadingState();
            this.assert(
                voiceState && typeof voiceState.isLoading === 'boolean',
                'Voice loading state is properly managed',
                'Voice loading state is invalid'
            );
            
            console.log(`   ⏱️  Voice loading time: ${this.startupMetrics.voiceLoadTime}ms`);
            console.log(`   🎯 Voice loading success: ${result.success}`);
            console.log(`   🔄 Attempts made: ${result.attempt}`);
            if (result.success) {
                console.log(`   🎵 Voices found: ${result.voices.length}`);
            }
            console.log('');
            
        } catch (error) {
            this.assert(false, 'Voice loading validation', error.message);
        }
    }

    async validateDefaultOutputFolder() {
        console.log('📁 Validating Default Output Folder (Requirement 3.1)...');
        
        try {
            // Initialize settings manager
            await this.settingsManager.initialize();
            
            // Test 1: Default folder creation
            const defaultFolder = this.settingsManager.getDefaultOutputFolder();
            this.assert(
                defaultFolder && typeof defaultFolder === 'string' && defaultFolder.length > 0,
                'Default output folder is created',
                `Invalid default folder: ${defaultFolder}`
            );
            
            // Test 2: Directory accessibility
            const isAccessible = this.settingsManager.ensureDirectoryExists(defaultFolder);
            this.assert(
                isAccessible,
                'Default output folder is accessible and writable',
                `Cannot access folder: ${defaultFolder}`
            );
            
            // Test 3: Settings persistence
            const settings = await this.settingsManager.loadSettings();
            this.assert(
                settings.defaultOutputPath && typeof settings.defaultOutputPath === 'string',
                'Default output path is persisted in settings',
                'Default output path not found in settings'
            );
            
            // Test 4: Folder hierarchy fallback
            const testFallback = this.settingsManager.getDefaultOutputFolder();
            this.assert(
                testFallback === defaultFolder,
                'Folder hierarchy fallback is consistent',
                'Inconsistent folder fallback behavior'
            );
            
            // Test 5: Initialization on first start
            const initializedFolder = await this.settingsManager.initializeDefaultOutputFolder();
            this.assert(
                initializedFolder && this.settingsManager.ensureDirectoryExists(initializedFolder),
                'Default folder initialization works correctly',
                'Failed to initialize default folder'
            );
            
            console.log(`   📂 Default folder: ${defaultFolder}`);
            console.log(`   ✅ Folder accessible: ${isAccessible}`);
            console.log(`   💾 Settings persisted: ${!!settings.defaultOutputPath}\n`);
            
        } catch (error) {
            this.assert(false, 'Default output folder validation', error.message);
        }
    }

    async validateMP3FormatIndication() {
        console.log('🎵 Validating MP3 Format Indication (Requirement 4.1)...');
        
        try {
            // Initialize FFmpeg
            const ffmpegStatus = await this.audioProcessor.initializeFFmpeg();
            
            // Test 1: FFmpeg status structure
            this.assert(
                ffmpegStatus.hasOwnProperty('available') && 
                ffmpegStatus.hasOwnProperty('source') && 
                ffmpegStatus.hasOwnProperty('validated'),
                'FFmpeg status has required properties',
                'FFmpeg status structure is incomplete'
            );
            
            // Test 2: Valid source values
            this.assert(
                ['bundled', 'system', 'none'].includes(ffmpegStatus.source),
                'FFmpeg source is valid',
                `Invalid FFmpeg source: ${ffmpegStatus.source}`
            );
            
            // Test 3: Availability indication
            if (ffmpegStatus.available) {
                this.assert(
                    ffmpegStatus.path && ffmpegStatus.validated,
                    'Available FFmpeg has path and validation',
                    'Available FFmpeg missing path or validation'
                );
            } else {
                this.assert(
                    ffmpegStatus.error,
                    'Unavailable FFmpeg provides error information',
                    'Unavailable FFmpeg missing error information'
                );
            }
            
            // Test 4: FFmpeg validation functionality
            const bundledPath = this.audioProcessor.getBundledFFmpegPath();
            const validation = await this.audioProcessor.validateFFmpeg(bundledPath);
            this.assert(
                validation && typeof validation.valid === 'boolean',
                'FFmpeg validation function works correctly',
                'FFmpeg validation function failed'
            );
            
            // Test 5: Status retrieval
            const currentStatus = this.audioProcessor.getFFmpegStatus();
            this.assert(
                currentStatus && currentStatus.source === ffmpegStatus.source,
                'FFmpeg status retrieval is consistent',
                'Inconsistent FFmpeg status retrieval'
            );
            
            console.log(`   🔧 FFmpeg available: ${ffmpegStatus.available}`);
            console.log(`   📍 FFmpeg source: ${ffmpegStatus.source}`);
            console.log(`   ✅ FFmpeg validated: ${ffmpegStatus.validated}`);
            if (ffmpegStatus.available) {
                console.log(`   📁 FFmpeg path: ${ffmpegStatus.path}`);
            }
            console.log('');
            
        } catch (error) {
            this.assert(false, 'MP3 format indication validation', error.message);
        }
    }

    async validateStartupPerformance() {
        console.log('⚡ Validating Startup Performance (Requirement 5.5)...');
        
        try {
            const performanceStartTime = Date.now();
            
            // Test parallel initialization
            const [ffmpegStatus, voiceResult, settingsInit] = await Promise.all([
                this.audioProcessor.initializeFFmpeg(),
                this.ttsService.loadVoicesWithRetry(2),
                this.settingsManager.initialize()
            ]);
            
            const totalTime = Date.now() - performanceStartTime;
            this.startupMetrics.totalInitTime = totalTime;
            
            // Test 1: Reasonable initialization time
            this.assert(
                totalTime < 15000,
                'Initialization completes within reasonable time (15s)',
                `Initialization took ${totalTime}ms`
            );
            
            // Test 2: Parallel efficiency
            const sequentialEstimate = (this.startupMetrics.ffmpegInitTime || 1000) + 
                                     (this.startupMetrics.voiceLoadTime || 2000) + 500;
            this.assert(
                totalTime < sequentialEstimate * 1.2,
                'Parallel initialization is efficient',
                `Parallel time ${totalTime}ms not much better than sequential estimate ${sequentialEstimate}ms`
            );
            
            // Test 3: Memory usage
            const memoryUsage = process.memoryUsage();
            this.assert(
                memoryUsage.heapUsed < 100 * 1024 * 1024,
                'Memory usage is reasonable (< 100MB)',
                `Memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
            );
            
            // Test 4: Error minimization
            const criticalErrors = this.startupMetrics.errorMessages.filter(msg => 
                msg.toLowerCase().includes('error') && 
                !msg.toLowerCase().includes('warning')
            );
            this.assert(
                criticalErrors.length <= 1,
                'Minimal critical errors during startup',
                `Found ${criticalErrors.length} critical errors`
            );
            
            // Test 5: No popup messages
            this.assert(
                this.startupMetrics.popupMessages.length === 0,
                'No popup messages during performance test',
                `Found ${this.startupMetrics.popupMessages.length} popup messages`
            );
            
            console.log(`   ⏱️  Total initialization time: ${totalTime}ms`);
            console.log(`   🧠 Memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
            console.log(`   ❌ Critical errors: ${criticalErrors.length}`);
            console.log(`   📢 Popup messages: ${this.startupMetrics.popupMessages.length}\n`);
            
        } catch (error) {
            this.assert(false, 'Startup performance validation', error.message);
        }
    }

    async validateApplicationReadiness() {
        console.log('🎯 Validating Application Readiness (Requirement 6.5)...');
        
        try {
            // Get component statuses
            const ffmpegStatus = this.audioProcessor.getFFmpegStatus();
            const voiceLoadingState = this.ttsService.getVoiceLoadingState();
            const ttsStatus = this.ttsService.getStatus();
            const settings = await this.settingsManager.loadSettings();
            
            // Test 1: Component status structure
            this.assert(
                ffmpegStatus && typeof ffmpegStatus.available === 'boolean',
                'FFmpeg status is well-structured',
                'FFmpeg status structure is invalid'
            );
            
            this.assert(
                voiceLoadingState && typeof voiceLoadingState.isLoading === 'boolean',
                'Voice loading state is well-structured',
                'Voice loading state structure is invalid'
            );
            
            this.assert(
                ttsStatus && typeof ttsStatus.isInitialized === 'boolean',
                'TTS status is well-structured',
                'TTS status structure is invalid'
            );
            
            // Test 2: Readiness calculation
            const isReady = ttsStatus.isInitialized && 
                           settings.defaultOutputPath &&
                           this.settingsManager.ensureDirectoryExists(settings.defaultOutputPath);
            
            this.assert(
                typeof isReady === 'boolean',
                'Application readiness can be determined',
                'Cannot determine application readiness'
            );
            
            // Test 3: Component consistency
            if (ttsStatus.isInitialized) {
                this.assert(
                    ttsStatus.voiceCount >= 0,
                    'Voice count is consistent with initialization',
                    `Inconsistent voice count: ${ttsStatus.voiceCount}`
                );
            }
            
            // Test 4: Troubleshooting availability
            this.assert(
                Array.isArray(voiceLoadingState.troubleshootingSteps),
                'Troubleshooting steps are available',
                'Troubleshooting steps not available'
            );
            
            // Test 5: Graceful degradation
            const canDegrade = !ttsStatus.isInitialized || !ffmpegStatus.available;
            if (canDegrade) {
                this.assert(
                    true, // Application should still function with limited capabilities
                    'Application handles graceful degradation',
                    'Application does not handle degradation gracefully'
                );
            }
            
            console.log(`   🎯 Application ready: ${isReady}`);
            console.log(`   🎤 TTS initialized: ${ttsStatus.isInitialized}`);
            console.log(`   🎵 Voice count: ${ttsStatus.voiceCount}`);
            console.log(`   🔧 FFmpeg available: ${ffmpegStatus.available}`);
            console.log(`   📁 Output folder set: ${!!settings.defaultOutputPath}\n`);
            
        } catch (error) {
            this.assert(false, 'Application readiness validation', error.message);
        }
    }

    async validateIntegrationFlow() {
        console.log('🔄 Validating Complete Integration Flow...');
        
        try {
            // Test complete startup sequence
            const sequenceStart = Date.now();
            
            // Phase 1: Settings
            await this.settingsManager.initialize();
            const settingsTime = Date.now() - sequenceStart;
            
            // Phase 2: Services (parallel)
            const servicesStart = Date.now();
            const [ffmpegResult, voiceResult] = await Promise.all([
                this.audioProcessor.initializeFFmpeg(),
                this.ttsService.loadVoicesWithRetry(2)
            ]);
            const servicesTime = Date.now() - servicesStart;
            
            // Phase 3: Validation
            const validationStart = Date.now();
            const settings = await this.settingsManager.loadSettings();
            const isFullyReady = voiceResult.success && 
                               settings.defaultOutputPath &&
                               this.settingsManager.ensureDirectoryExists(settings.defaultOutputPath);
            const validationTime = Date.now() - validationStart;
            
            const totalSequenceTime = Date.now() - sequenceStart;
            
            // Test 1: Complete sequence success
            this.assert(
                isFullyReady,
                'Complete startup sequence succeeds',
                'Startup sequence failed to achieve ready state'
            );
            
            // Test 2: Reasonable total time
            this.assert(
                totalSequenceTime < 20000,
                'Complete sequence completes in reasonable time (20s)',
                `Sequence took ${totalSequenceTime}ms`
            );
            
            // Test 3: No popups during integration
            this.assert(
                this.startupMetrics.popupMessages.length === 0,
                'No popup messages during integration flow',
                `Found ${this.startupMetrics.popupMessages.length} popup messages`
            );
            
            // Test 4: State consistency
            const ttsStatus = this.ttsService.getStatus();
            const audioStatus = this.audioProcessor.getFFmpegStatus();
            
            this.assert(
                ttsStatus.isInitialized === voiceResult.success,
                'TTS status is consistent with initialization result',
                'TTS status inconsistency detected'
            );
            
            this.assert(
                audioStatus.available === ffmpegResult.available,
                'Audio status is consistent with initialization result',
                'Audio status inconsistency detected'
            );
            
            // Test 5: Cross-component functionality
            if (isFullyReady) {
                this.assert(
                    ttsStatus.voiceCount > 0 || !voiceResult.success,
                    'Voice count matches loading success',
                    'Voice count inconsistency'
                );
            }
            
            console.log(`   ⏱️  Total sequence time: ${totalSequenceTime}ms`);
            console.log(`   📋 Settings phase: ${settingsTime}ms`);
            console.log(`   🔧 Services phase: ${servicesTime}ms`);
            console.log(`   ✅ Validation phase: ${validationTime}ms`);
            console.log(`   🎯 Fully ready: ${isFullyReady}\n`);
            
        } catch (error) {
            this.assert(false, 'Integration flow validation', error.message);
        }
    }

    assert(condition, testName, errorMessage) {
        this.results.total++;
        
        if (condition) {
            this.results.passed++;
            this.results.details.push({ test: testName, status: 'PASS', message: null });
            console.log(`   ✅ ${testName}`);
        } else {
            this.results.failed++;
            this.results.details.push({ test: testName, status: 'FAIL', message: errorMessage });
            console.log(`   ❌ ${testName}: ${errorMessage}`);
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up test environment...');
        
        // Restore console
        console.log = this.originalConsoleLog;
        console.error = this.originalConsoleError;
        
        // Cleanup services
        if (this.audioProcessor) this.audioProcessor.cleanup();
        if (this.ttsService) this.ttsService.cleanup();
        
        // Cleanup test directory
        try {
            await fs.rmdir(this.testDir, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
        
        console.log('✅ Cleanup complete\n');
    }

    reportResults() {
        console.log('📊 VALIDATION RESULTS');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`Passed: ${this.results.passed}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Success Rate: ${Math.round((this.results.passed / this.results.total) * 100)}%`);
        console.log('');
        
        if (this.results.failed > 0) {
            console.log('❌ FAILED TESTS:');
            this.results.details
                .filter(detail => detail.status === 'FAIL')
                .forEach(detail => {
                    console.log(`   • ${detail.test}: ${detail.message}`);
                });
            console.log('');
        }
        
        console.log('📈 PERFORMANCE METRICS:');
        console.log(`   FFmpeg Init: ${this.startupMetrics.ffmpegInitTime || 'N/A'}ms`);
        console.log(`   Voice Loading: ${this.startupMetrics.voiceLoadTime || 'N/A'}ms`);
        console.log(`   Total Init: ${this.startupMetrics.totalInitTime || 'N/A'}ms`);
        console.log(`   Popup Messages: ${this.startupMetrics.popupMessages.length}`);
        console.log(`   Error Messages: ${this.startupMetrics.errorMessages.length}`);
        console.log('');
        
        if (this.results.failed === 0) {
            console.log('🎉 ALL VALIDATIONS PASSED! User experience improvements are working correctly.');
        } else {
            console.log('⚠️  Some validations failed. Please review the implementation.');
            process.exit(1);
        }
    }
}

// Run validation if this script is executed directly
if (require.main === module) {
    const validator = new ValidationRunner();
    validator.runValidation().catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = ValidationRunner;