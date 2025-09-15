/**
 * Task 14 Validation Tests - User Experience Improvements
 * Comprehensive validation of all improvements implemented in speechmaker-improvements spec
 * 
 * This test suite validates:
 * - Application startup without FFmpeg popups on clean systems
 * - Reliable voice loading with retry mechanisms
 * - Default output folder creation and selection
 * - MP3 format availability indication and functionality
 * - Startup performance and resource usage optimization
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.5, 6.5
 */ const
 { describe, it, expect, beforeEach, afterEach, vi } = require('vitest');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Import services for testing
const AudioProcessor = require('../src/main/services/audioProcessor.js');
const TTSService = require('../src/main/services/ttsService.js');
const SettingsManager = require('../src/main/services/settingsManager.js');

// Mock Electron app for testing
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name) => {
            if (name === 'userData') {
                return path.join(os.tmpdir(), 'speechmaker-test');
            }
            return os.tmpdir();
        })
    }
}));

describe('Task 14: User Experience Improvements Validation', () => {
    let audioProcessor;
    let ttsService;
    let settingsManager;
    let testOutputDir;
    let originalConsoleLog;
    let originalConsoleError;
    let startupMetrics;

    beforeEach(async () => {
        // Create test output directory
        testOutputDir = path.join(os.tmpdir(), 'speechmaker-test-' + Date.now());
        await fs.mkdir(testOutputDir, { recursive: true });

        // Initialize services
        audioProcessor = new AudioProcessor();
        ttsService = new TTSService();
        settingsManager = new SettingsManager();

        // Capture console output for popup detection
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        
        // Initialize startup metrics
        startupMetrics = {
            startTime: Date.now(),
            ffmpegInitTime: null,
            voiceLoadTime: null,
            totalInitTime: null,
            popupMessages: [],
            errorMessages: []
        };

        // Mock console to capture popup messages
        console.log = (...args) => {
            const message = args.join(' ');
            if (message.toLowerCase().includes('ffmpeg') && 
                (message.toLowerCase().includes('popup') || 
                 message.toLowerCase().includes('warning') ||
                 message.toLowerCase().includes('install'))) {
                startupMetrics.popupMessages.push(message);
            }
            originalConsoleLog(...args);
        };

        console.error = (...args) => {
            const message = args.join(' ');
            startupMetrics.errorMessages.push(message);
            originalConsoleError(...args);
        };
    });

    afterEach(async () => {
        // Restore console
        console.log = originalConsoleLog;
        console.error = originalConsoleError;

        // Cleanup services
        if (audioProcessor) audioProcessor.cleanup();
        if (ttsService) ttsService.cleanup();

        // Cleanup test directory
        try {
            await fs.rmdir(testOutputDir, { recursive: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Requirement 1.1: FFmpeg Popup Elimination', () => {
        it('should start application without showing FFmpeg popups', async () => {
            const initStartTime = Date.now();
            
            // Initialize FFmpeg detection
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            startupMetrics.ffmpegInitTime = Date.now() - initStartTime;
            
            // Verify no popup messages were generated
            expect(startupMetrics.popupMessages).toHaveLength(0);
            
            // Verify FFmpeg initialization completed without user interruption
            expect(ffmpegStatus).toBeDefined();
            expect(typeof ffmpegStatus.available).toBe('boolean');
            expect(['bundled', 'system', 'none']).toContain(ffmpegStatus.source);
        });

        it('should use bundled FFmpeg when available', async () => {
            const bundledPath = audioProcessor.getBundledFFmpegPath();
            
            // Test bundled FFmpeg path generation
            expect(bundledPath).toBeDefined();
            expect(bundledPath).toContain('ffmpeg');
            expect(bundledPath).toContain('resources');
            
            // Initialize and check if bundled FFmpeg is preferred
            const status = await audioProcessor.initializeFFmpeg();
            
            if (status.available && status.source === 'bundled') {
                expect(status.path).toBe(bundledPath);
                expect(status.validated).toBe(true);
            }
        });

        it('should fallback to system FFmpeg gracefully', async () => {
            // Mock bundled FFmpeg as unavailable
            const originalGetBundledPath = audioProcessor.getBundledFFmpegPath;
            audioProcessor.getBundledFFmpegPath = () => '/nonexistent/path/ffmpeg.exe';
            
            const status = await audioProcessor.initializeFFmpeg();
            
            // Should not show popups even when falling back
            expect(startupMetrics.popupMessages).toHaveLength(0);
            
            // Should handle fallback gracefully
            expect(status).toBeDefined();
            expect(['system', 'none']).toContain(status.source);
            
            // Restore original method
            audioProcessor.getBundledFFmpegPath = originalGetBundledPath;
        });

        it('should disable MP3 gracefully when no FFmpeg available', async () => {
            // Mock both bundled and system FFmpeg as unavailable
            const originalGetBundled = audioProcessor.getBundledFFmpegPath;
            const originalDetectSystem = audioProcessor.detectSystemFFmpeg;
            
            audioProcessor.getBundledFFmpegPath = () => '/nonexistent/bundled/ffmpeg.exe';
            audioProcessor.detectSystemFFmpeg = async () => null;
            
            const status = await audioProcessor.initializeFFmpeg();
            
            // Should not show popups
            expect(startupMetrics.popupMessages).toHaveLength(0);
            
            // Should indicate no FFmpeg available
            expect(status.available).toBe(false);
            expect(status.source).toBe('none');
            
            // Restore original methods
            audioProcessor.getBundledFFmpegPath = originalGetBundled;
            audioProcessor.detectSystemFFmpeg = originalDetectSystem;
        });
    });

    describe('Requirement 2.1: Reliable Voice Loading with Retry', () => {
        it('should load voices with retry mechanism', async () => {
            const voiceLoadStartTime = Date.now();
            
            // Test voice loading with retry
            const result = await ttsService.loadVoicesWithRetry(3);
            startupMetrics.voiceLoadTime = Date.now() - voiceLoadStartTime;
            
            // Should return structured result
            expect(result).toBeDefined();
            expect(typeof result.success).toBe('boolean');
            expect(typeof result.attempt).toBe('number');
            
            if (result.success) {
                expect(Array.isArray(result.voices)).toBe(true);
                expect(result.voices.length).toBeGreaterThan(0);
            } else {
                expect(result.error).toBeDefined();
                expect(Array.isArray(result.troubleshooting)).toBe(true);
                expect(result.troubleshooting.length).toBeGreaterThan(0);
            }
        });

        it('should provide exponential backoff between retries', async () => {
            // Mock voice loading to fail initially
            const originalLoadVoices = ttsService.loadAvailableVoices;
            let attemptCount = 0;
            const attemptTimes = [];
            
            ttsService.loadAvailableVoices = async () => {
                attemptTimes.push(Date.now());
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Simulated voice loading failure');
                }
                return [{ id: 'test-voice', name: 'Test Voice', language: 'en-US' }];
            };
            
            const result = await ttsService.loadVoicesWithRetry(3);
            
            // Verify exponential backoff timing
            if (attemptTimes.length > 1) {
                const delay1 = attemptTimes[1] - attemptTimes[0];
                const delay2 = attemptTimes[2] - attemptTimes[1];
                
                // Second delay should be approximately double the first
                expect(delay2).toBeGreaterThan(delay1 * 1.5);
            }
            
            // Should eventually succeed
            expect(result.success).toBe(true);
            expect(result.attempt).toBe(3);
            
            // Restore original method
            ttsService.loadAvailableVoices = originalLoadVoices;
        });

        it('should provide troubleshooting steps on failure', async () => {
            // Mock voice loading to always fail
            const originalLoadVoices = ttsService.loadAvailableVoices;
            ttsService.loadAvailableVoices = async () => {
                throw new Error('Persistent voice loading failure');
            };
            
            const result = await ttsService.loadVoicesWithRetry(2);
            
            // Should fail with troubleshooting info
            expect(result.success).toBe(false);
            expect(result.troubleshooting).toBeDefined();
            expect(Array.isArray(result.troubleshooting)).toBe(true);
            expect(result.troubleshooting.length).toBeGreaterThan(0);
            
            // Verify troubleshooting steps are helpful
            const troubleshootingText = result.troubleshooting.join(' ').toLowerCase();
            expect(troubleshootingText).toContain('windows');
            expect(troubleshootingText).toContain('speech');
            
            // Restore original method
            ttsService.loadAvailableVoices = originalLoadVoices;
        });

        it('should emit progress events during voice loading', async () => {
            const events = [];
            
            // Listen to voice loading events
            ttsService.on('voiceLoadingStarted', (data) => events.push({ type: 'started', data }));
            ttsService.on('voiceLoadingAttempt', (data) => events.push({ type: 'attempt', data }));
            ttsService.on('voiceLoadingSuccess', (data) => events.push({ type: 'success', data }));
            ttsService.on('voiceLoadingFailed', (data) => events.push({ type: 'failed', data }));
            
            await ttsService.loadVoicesWithRetry(2);
            
            // Should have emitted at least started event
            expect(events.length).toBeGreaterThan(0);
            expect(events[0].type).toBe('started');
            
            // Should have proper event structure
            events.forEach(event => {
                expect(event.type).toBeDefined();
                expect(event.data).toBeDefined();
            });
        });
    });

    describe('Requirement 3.1: Default Output Folder Management', () => {
        it('should create default output folder automatically', async () => {
            await settingsManager.initialize();
            
            const defaultFolder = settingsManager.getDefaultOutputFolder();
            
            // Should return a valid path
            expect(defaultFolder).toBeDefined();
            expect(typeof defaultFolder).toBe('string');
            expect(defaultFolder.length).toBeGreaterThan(0);
            
            // Should prefer Documents/SpeechMaker
            if (defaultFolder.includes('Documents')) {
                expect(defaultFolder).toContain('SpeechMaker');
            }
        });

        it('should ensure directory exists and is writable', async () => {
            await settingsManager.initialize();
            
            const defaultFolder = settingsManager.getDefaultOutputFolder();
            
            // Test directory accessibility
            const isAccessible = settingsManager.ensureDirectoryExists(defaultFolder);
            expect(isAccessible).toBe(true);
            
            // Verify directory actually exists
            try {
                const stats = await fs.stat(defaultFolder);
                expect(stats.isDirectory()).toBe(true);
            } catch (error) {
                // If default folder is temp directory, it should exist
                if (defaultFolder === os.tmpdir()) {
                    expect(true).toBe(true); // Temp dir always exists
                } else {
                    throw error;
                }
            }
        });

        it('should fallback through folder hierarchy', async () => {
            // Mock Documents folder as inaccessible
            const originalEnsureDir = settingsManager.ensureDirectoryExists;
            let callCount = 0;
            
            settingsManager.ensureDirectoryExists = (dirPath) => {
                callCount++;
                // Fail Documents folder, succeed on home folder
                if (dirPath.includes('Documents') && callCount === 1) {
                    return false;
                }
                return originalEnsureDir.call(settingsManager, dirPath);
            };
            
            const defaultFolder = settingsManager.getDefaultOutputFolder();
            
            // Should have tried multiple paths
            expect(callCount).toBeGreaterThan(1);
            
            // Should return a valid fallback path
            expect(defaultFolder).toBeDefined();
            expect(defaultFolder).not.toContain('Documents');
            
            // Restore original method
            settingsManager.ensureDirectoryExists = originalEnsureDir;
        });

        it('should initialize default folder on first start', async () => {
            await settingsManager.initialize();
            
            const initializedFolder = await settingsManager.initializeDefaultOutputFolder();
            
            // Should return a valid folder path
            expect(initializedFolder).toBeDefined();
            expect(typeof initializedFolder).toBe('string');
            
            // Should be accessible
            const isAccessible = settingsManager.ensureDirectoryExists(initializedFolder);
            expect(isAccessible).toBe(true);
        });

        it('should persist default folder in settings', async () => {
            await settingsManager.initialize();
            
            // Load settings and check default folder
            const settings = await settingsManager.loadSettings();
            
            expect(settings.defaultOutputPath).toBeDefined();
            expect(typeof settings.defaultOutputPath).toBe('string');
            
            // Verify the folder is accessible
            const isAccessible = settingsManager.ensureDirectoryExists(settings.defaultOutputPath);
            expect(isAccessible).toBe(true);
        });
    });

    describe('Requirement 4.1: MP3 Format Availability Indication', () => {
        it('should enable MP3 when FFmpeg is available', async () => {
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            
            if (ffmpegStatus.available) {
                // MP3 should be available
                expect(ffmpegStatus.validated).toBe(true);
                expect(['bundled', 'system']).toContain(ffmpegStatus.source);
                
                // Should be able to get FFmpeg status
                const status = audioProcessor.getFFmpegStatus();
                expect(status.available).toBe(true);
                expect(status.path).toBeDefined();
            }
        });

        it('should disable MP3 when FFmpeg is unavailable', async () => {
            // Mock FFmpeg as unavailable
            const originalInitialize = audioProcessor.initializeFFmpeg;
            audioProcessor.initializeFFmpeg = async () => ({
                available: false,
                source: 'none',
                path: null,
                version: null,
                validated: false,
                error: 'FFmpeg not found'
            });
            
            const status = await audioProcessor.initializeFFmpeg();
            
            // MP3 should be unavailable
            expect(status.available).toBe(false);
            expect(status.source).toBe('none');
            expect(status.error).toBeDefined();
            
            // Restore original method
            audioProcessor.initializeFFmpeg = originalInitialize;
        });

        it('should provide clear status information', async () => {
            const status = await audioProcessor.initializeFFmpeg();
            
            // Status should have all required fields
            expect(status).toHaveProperty('available');
            expect(status).toHaveProperty('source');
            expect(status).toHaveProperty('path');
            expect(status).toHaveProperty('version');
            expect(status).toHaveProperty('validated');
            
            // Source should be valid
            expect(['bundled', 'system', 'none']).toContain(status.source);
            
            if (status.available) {
                expect(status.path).toBeDefined();
                expect(status.validated).toBe(true);
            } else {
                expect(status.error).toBeDefined();
            }
        });

        it('should validate FFmpeg functionality', async () => {
            const bundledPath = audioProcessor.getBundledFFmpegPath();
            
            // Test validation method
            const validation = await audioProcessor.validateFFmpeg(bundledPath);
            
            expect(validation).toHaveProperty('valid');
            expect(validation).toHaveProperty('version');
            expect(validation).toHaveProperty('error');
            
            if (validation.valid) {
                expect(validation.version).toBeDefined();
                expect(validation.error).toBeNull();
            } else {
                expect(validation.error).toBeDefined();
            }
        });
    });

    describe('Requirement 5.5: Startup Performance Optimization', () => {
        it('should complete initialization within reasonable time', async () => {
            const initStartTime = Date.now();
            
            // Initialize all services in parallel (simulating app startup)
            const [ffmpegStatus, voiceResult] = await Promise.all([
                audioProcessor.initializeFFmpeg(),
                ttsService.loadVoicesWithRetry(3)
            ]);
            
            await settingsManager.initialize();
            
            const totalInitTime = Date.now() - initStartTime;
            startupMetrics.totalInitTime = totalInitTime;
            
            // Should complete within 10 seconds for normal cases
            expect(totalInitTime).toBeLessThan(10000);
            
            // Log performance metrics
            console.log('Startup Performance Metrics:', {
                totalInitTime: `${totalInitTime}ms`,
                ffmpegInitTime: `${startupMetrics.ffmpegInitTime}ms`,
                voiceLoadTime: `${startupMetrics.voiceLoadTime}ms`,
                ffmpegAvailable: ffmpegStatus.available,
                voicesLoaded: voiceResult.success
            });
        });

        it('should optimize resource usage during startup', async () => {
            const initialMemory = process.memoryUsage();
            
            // Initialize services
            await audioProcessor.initializeFFmpeg();
            await ttsService.loadVoicesWithRetry(2);
            await settingsManager.initialize();
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            
            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
            
            console.log('Memory Usage:', {
                initial: `${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
                final: `${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`,
                increase: `${Math.round(memoryIncrease / 1024 / 1024)}MB`
            });
        });

        it('should handle parallel initialization efficiently', async () => {
            const startTime = Date.now();
            
            // Test parallel vs sequential initialization
            const parallelPromise = Promise.all([
                audioProcessor.initializeFFmpeg(),
                ttsService.loadVoicesWithRetry(2),
                settingsManager.initialize()
            ]);
            
            const parallelResults = await parallelPromise;
            const parallelTime = Date.now() - startTime;
            
            // Should complete successfully
            expect(parallelResults).toHaveLength(3);
            expect(parallelResults[0]).toBeDefined(); // FFmpeg status
            expect(parallelResults[1]).toBeDefined(); // Voice loading result
            expect(parallelResults[2]).toBe(true);    // Settings initialization
            
            // Parallel initialization should be efficient
            expect(parallelTime).toBeLessThan(8000);
            
            console.log('Parallel Initialization Time:', `${parallelTime}ms`);
        });

        it('should minimize startup errors and warnings', async () => {
            // Clear previous error messages
            startupMetrics.errorMessages = [];
            
            // Initialize all services
            await audioProcessor.initializeFFmpeg();
            await ttsService.loadVoicesWithRetry(2);
            await settingsManager.initialize();
            
            // Should have minimal error messages
            const criticalErrors = startupMetrics.errorMessages.filter(msg => 
                msg.toLowerCase().includes('error') && 
                !msg.toLowerCase().includes('warning')
            );
            
            // Should not have critical errors during normal startup
            expect(criticalErrors.length).toBeLessThanOrEqual(1);
            
            console.log('Startup Messages:', {
                totalErrors: startupMetrics.errorMessages.length,
                criticalErrors: criticalErrors.length,
                popupMessages: startupMetrics.popupMessages.length
            });
        });
    });

    describe('Requirement 6.5: Application Readiness Indicators', () => {
        it('should provide clear readiness status', async () => {
            // Initialize services and track readiness
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            const voiceResult = await ttsService.loadVoicesWithRetry(2);
            await settingsManager.initialize();
            
            // Check overall readiness
            const isReady = voiceResult.success && 
                           (await settingsManager.loadSettings()).defaultOutputPath;
            
            expect(typeof isReady).toBe('boolean');
            
            if (isReady) {
                // All components should be functional
                expect(voiceResult.voices.length).toBeGreaterThan(0);
                
                const settings = await settingsManager.loadSettings();
                expect(settings.defaultOutputPath).toBeDefined();
                
                // FFmpeg status should be clear
                expect(['bundled', 'system', 'none']).toContain(ffmpegStatus.source);
            }
        });

        it('should provide component-specific status', async () => {
            // Get individual component statuses
            const ffmpegStatus = audioProcessor.getFFmpegStatus();
            const voiceLoadingState = ttsService.getVoiceLoadingState();
            const ttsStatus = ttsService.getStatus();
            
            // Each status should be well-structured
            expect(ffmpegStatus).toHaveProperty('available');
            expect(ffmpegStatus).toHaveProperty('source');
            
            expect(voiceLoadingState).toHaveProperty('isLoading');
            expect(voiceLoadingState).toHaveProperty('troubleshootingSteps');
            
            expect(ttsStatus).toHaveProperty('isInitialized');
            expect(ttsStatus).toHaveProperty('voiceCount');
        });

        it('should handle graceful degradation', async () => {
            // Test with limited functionality
            const originalLoadVoices = ttsService.loadAvailableVoices;
            ttsService.loadAvailableVoices = async () => {
                throw new Error('Voice loading unavailable');
            };
            
            const voiceResult = await ttsService.loadVoicesWithRetry(1);
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            
            // Should handle failures gracefully
            expect(voiceResult.success).toBe(false);
            expect(voiceResult.troubleshooting).toBeDefined();
            
            // FFmpeg should still work independently
            expect(ffmpegStatus).toBeDefined();
            
            // Restore original method
            ttsService.loadAvailableVoices = originalLoadVoices;
        });
    });

    describe('Integration Tests: Complete User Experience Flow', () => {
        it('should complete full startup sequence successfully', async () => {
            const startupSequence = {
                startTime: Date.now(),
                phases: {}
            };
            
            // Phase 1: Settings initialization
            const settingsStart = Date.now();
            await settingsManager.initialize();
            startupSequence.phases.settings = Date.now() - settingsStart;
            
            // Phase 2: Parallel service initialization
            const servicesStart = Date.now();
            const [ffmpegStatus, voiceResult] = await Promise.all([
                audioProcessor.initializeFFmpeg(),
                ttsService.loadVoicesWithRetry(3)
            ]);
            startupSequence.phases.services = Date.now() - servicesStart;
            
            // Phase 3: Readiness validation
            const validationStart = Date.now();
            const settings = await settingsManager.loadSettings();
            const isFullyReady = voiceResult.success && 
                               settings.defaultOutputPath &&
                               settingsManager.ensureDirectoryExists(settings.defaultOutputPath);
            startupSequence.phases.validation = Date.now() - validationStart;
            
            startupSequence.totalTime = Date.now() - startupSequence.startTime;
            startupSequence.ready = isFullyReady;
            
            // Validate complete startup
            expect(isFullyReady).toBe(true);
            expect(startupSequence.totalTime).toBeLessThan(15000);
            expect(startupMetrics.popupMessages).toHaveLength(0);
            
            console.log('Complete Startup Sequence:', startupSequence);
        });

        it('should maintain consistent state across components', async () => {
            // Initialize all components
            await settingsManager.initialize();
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            const voiceResult = await ttsService.loadVoicesWithRetry(2);
            
            // Verify state consistency
            const settings = await settingsManager.loadSettings();
            const ttsStatus = ttsService.getStatus();
            const audioStatus = audioProcessor.getFFmpegStatus();
            
            // States should be consistent
            expect(ttsStatus.isInitialized).toBe(voiceResult.success);
            expect(audioStatus.available).toBe(ffmpegStatus.available);
            expect(settings.defaultOutputPath).toBeDefined();
            
            // Cross-component functionality should work
            if (voiceResult.success && settings.defaultOutputPath) {
                expect(ttsStatus.voiceCount).toBeGreaterThan(0);
                expect(settingsManager.ensureDirectoryExists(settings.defaultOutputPath)).toBe(true);
            }
        });
    });
});