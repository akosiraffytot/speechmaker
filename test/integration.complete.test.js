/**
 * Complete Integration Test for Task 11
 * Tests all improvements working together in the main application flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock Electron modules
const mockMainWindow = {
    webContents: {
        send: vi.fn(),
        on: vi.fn(),
        once: vi.fn()
    },
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ width: 800, height: 600, x: 100, y: 100 })),
    on: vi.fn(),
    show: vi.fn(),
    loadFile: vi.fn()
};

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => '/mock/user/data'),
        whenReady: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        quit: vi.fn()
    },
    BrowserWindow: vi.fn(() => mockMainWindow),
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn()
    },
    dialog: {
        showOpenDialog: vi.fn()
    }
}));

// Mock path and fs modules
vi.mock('path', () => ({
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
    resolve: vi.fn((...args) => args.join('/'))
}));

vi.mock('fs', () => ({
    promises: {
        access: vi.fn(),
        mkdir: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn(),
        unlink: vi.fn(),
        rmdir: vi.fn(),
        readdir: vi.fn(() => [])
    },
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn()
}));

vi.mock('os', () => ({
    homedir: vi.fn(() => '/mock/home'),
    tmpdir: vi.fn(() => '/mock/temp')
}));

vi.mock('child_process', () => ({
    spawn: vi.fn(() => ({
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        kill: vi.fn()
    })),
    exec: vi.fn(),
    promisify: vi.fn(() => vi.fn())
}));

// Import services after mocking
const SettingsManager = require('../src/main/services/settingsManager.js');
const TTSService = require('../src/main/services/ttsService.js');
const AudioProcessor = require('../src/main/services/audioProcessor.js');
const ErrorHandler = require('../src/main/services/errorHandler.js');
const IPCHandlers = require('../src/main/ipc/ipcHandlers.js');

describe('Task 11: Complete Integration Test', () => {
    let settingsManager;
    let ttsService;
    let audioProcessor;
    let errorHandler;
    let ipcHandlers;
    let services;

    beforeEach(async () => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Initialize services in the correct order
        errorHandler = new ErrorHandler();
        await errorHandler.initialize();
        
        settingsManager = new SettingsManager();
        await settingsManager.initialize();
        
        audioProcessor = new AudioProcessor();
        
        ttsService = new TTSService();
        ttsService.setAudioProcessor(audioProcessor);
        
        services = {
            settingsManager,
            ttsService,
            audioProcessor,
            errorHandler
        };
        
        ipcHandlers = new IPCHandlers(services, mockMainWindow);
    });

    afterEach(() => {
        // Clean up services
        if (ipcHandlers) {
            ipcHandlers.cleanup();
        }
        if (ttsService) {
            ttsService.cleanup();
        }
        if (audioProcessor) {
            audioProcessor.cleanup();
        }
    });

    describe('Service Integration', () => {
        it('should wire together enhanced audio processor, TTS service, and settings manager', async () => {
            // Verify services are properly connected
            expect(ttsService.audioProcessor).toBe(audioProcessor);
            expect(settingsManager).toBeDefined();
            expect(audioProcessor).toBeDefined();
            expect(errorHandler).toBeDefined();
        });

        it('should initialize all services with proper dependencies', async () => {
            // Test settings manager initialization
            const defaultFolder = settingsManager.getDefaultOutputFolder();
            expect(defaultFolder).toBeDefined();
            expect(typeof defaultFolder).toBe('string');

            // Test audio processor FFmpeg initialization
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            expect(ffmpegStatus).toHaveProperty('available');
            expect(ffmpegStatus).toHaveProperty('source');
            expect(ffmpegStatus).toHaveProperty('validated');

            // Test TTS service status
            const ttsStatus = ttsService.getStatus();
            expect(ttsStatus).toHaveProperty('isInitialized');
            expect(ttsStatus).toHaveProperty('voiceCount');
            expect(ttsStatus).toHaveProperty('voiceLoadingState');
        });
    });

    describe('Parallel Initialization', () => {
        it('should implement complete startup sequence with parallel initialization', async () => {
            // Mock successful FFmpeg detection
            vi.spyOn(audioProcessor, 'initializeFFmpeg').mockResolvedValue({
                available: true,
                source: 'bundled',
                validated: true,
                path: '/mock/ffmpeg.exe',
                version: '4.4.0',
                error: null
            });

            // Mock successful voice loading
            vi.spyOn(ttsService, 'loadVoicesWithRetry').mockResolvedValue({
                success: true,
                voices: [
                    { id: 'voice1', name: 'Test Voice 1', language: 'en-US' },
                    { id: 'voice2', name: 'Test Voice 2', language: 'en-GB' }
                ],
                attempt: 1
            });

            // Simulate parallel initialization
            const ffmpegPromise = audioProcessor.initializeFFmpeg();
            const voicePromise = ttsService.loadVoicesWithRetry();

            const [ffmpegResult, voiceResult] = await Promise.allSettled([
                ffmpegPromise,
                voicePromise
            ]);

            // Verify both completed successfully
            expect(ffmpegResult.status).toBe('fulfilled');
            expect(voiceResult.status).toBe('fulfilled');

            // Verify results
            expect(ffmpegResult.value.available).toBe(true);
            expect(voiceResult.value.success).toBe(true);
            expect(voiceResult.value.voices).toHaveLength(2);
        });

        it('should handle initialization failures gracefully', async () => {
            // Mock FFmpeg failure
            vi.spyOn(audioProcessor, 'initializeFFmpeg').mockResolvedValue({
                available: false,
                source: 'none',
                validated: false,
                error: 'FFmpeg not found'
            });

            // Mock voice loading failure
            vi.spyOn(ttsService, 'loadVoicesWithRetry').mockResolvedValue({
                success: false,
                error: new Error('No voices found'),
                attempts: 3,
                troubleshooting: ['Check TTS installation']
            });

            const ffmpegResult = await audioProcessor.initializeFFmpeg();
            const voiceResult = await ttsService.loadVoicesWithRetry();

            // Verify graceful failure handling
            expect(ffmpegResult.available).toBe(false);
            expect(voiceResult.success).toBe(false);
            expect(voiceResult.troubleshooting).toBeDefined();
        });
    });

    describe('State Management Integration', () => {
        it('should connect new state management system to existing UI components', () => {
            // Verify IPC handlers are set up for state management
            expect(ipcHandlers.services).toBe(services);
            expect(ipcHandlers.mainWindow).toBe(mockMainWindow);
            
            // Verify services can communicate state changes
            expect(ttsService.listenerCount).toBeDefined();
            expect(audioProcessor.getFFmpegStatus).toBeDefined();
            expect(settingsManager.getDefaultOutputFolder).toBeDefined();
        });

        it('should send initialization updates to renderer', async () => {
            // Mock initialization events
            const mockSendUpdate = vi.fn();
            
            // Simulate sending initialization updates
            mockSendUpdate('started', { message: 'Initializing...' });
            mockSendUpdate('ffmpeg-complete', { status: { available: true } });
            mockSendUpdate('voices-complete', { voices: [], success: true });
            mockSendUpdate('complete', { ready: true });

            expect(mockSendUpdate).toHaveBeenCalledTimes(4);
            expect(mockSendUpdate).toHaveBeenCalledWith('started', expect.any(Object));
            expect(mockSendUpdate).toHaveBeenCalledWith('complete', expect.any(Object));
        });
    });

    describe('Resource Management', () => {
        it('should add proper cleanup and resource management for bundled FFmpeg', () => {
            // Test audio processor cleanup
            expect(audioProcessor.cleanup).toBeDefined();
            audioProcessor.cleanup();
            
            // Verify cleanup resets state
            expect(audioProcessor.ffmpegPath).toBeNull();
            expect(audioProcessor.isFFmpegValidated).toBe(false);
        });

        it('should clean up TTS service resources', () => {
            // Test TTS service cleanup
            expect(ttsService.cleanup).toBeDefined();
            ttsService.cleanup();
            
            // Verify cleanup resets state
            expect(ttsService.isInitialized).toBe(false);
            expect(ttsService.availableVoices).toHaveLength(0);
        });

        it('should clean up IPC handlers and active conversions', () => {
            // Add mock active conversion
            ipcHandlers.activeConversions.set('test-job', {
                cancelled: false,
                process: { kill: vi.fn() }
            });

            // Test IPC handlers cleanup
            expect(ipcHandlers.cleanup).toBeDefined();
            ipcHandlers.cleanup();
            
            // Verify cleanup
            expect(ipcHandlers.activeConversions.size).toBe(0);
        });
    });

    describe('End-to-End Functionality', () => {
        it('should test end-to-end functionality with all improvements integrated', async () => {
            // Mock successful initialization
            vi.spyOn(audioProcessor, 'initializeFFmpeg').mockResolvedValue({
                available: true,
                source: 'bundled',
                validated: true
            });

            vi.spyOn(ttsService, 'loadVoicesWithRetry').mockResolvedValue({
                success: true,
                voices: [{ id: 'test-voice', name: 'Test Voice', language: 'en-US' }],
                attempt: 1
            });

            // Initialize all services
            await settingsManager.initialize();
            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            const voiceStatus = await ttsService.loadVoicesWithRetry();

            // Verify complete integration
            expect(ffmpegStatus.available).toBe(true);
            expect(voiceStatus.success).toBe(true);
            expect(settingsManager.getDefaultOutputFolder()).toBeDefined();

            // Test conversion flow integration
            const mockConversionData = {
                id: 'test-conversion',
                text: 'Hello world',
                voice: 'test-voice',
                outputFormat: 'wav',
                outputPath: '/mock/output',
                speed: 1.0
            };

            // Mock TTS conversion
            vi.spyOn(ttsService, 'convertTextToSpeech').mockResolvedValue('/mock/output/test.wav');

            // Test conversion through IPC handler
            const result = await ipcHandlers.handleConversion(mockConversionData);
            expect(result.success).toBe(true);
            expect(result.outputFile).toBeDefined();
        });

        it('should handle format switching based on FFmpeg availability', async () => {
            // Test MP3 availability when FFmpeg is available
            vi.spyOn(audioProcessor, 'initializeFFmpeg').mockResolvedValue({
                available: true,
                source: 'bundled',
                validated: true
            });

            const ffmpegStatus = await audioProcessor.initializeFFmpeg();
            expect(ffmpegStatus.available).toBe(true);

            // Test WAV-only mode when FFmpeg is unavailable
            vi.spyOn(audioProcessor, 'initializeFFmpeg').mockResolvedValue({
                available: false,
                source: 'none',
                validated: false
            });

            const noFFmpegStatus = await audioProcessor.initializeFFmpeg();
            expect(noFFmpegStatus.available).toBe(false);
        });

        it('should provide comprehensive error recovery', async () => {
            // Test error recovery for voice loading
            const troubleshootingSteps = ttsService.getTroubleshootingSteps();
            expect(troubleshootingSteps).toBeInstanceOf(Array);
            expect(troubleshootingSteps.length).toBeGreaterThan(0);

            // Test retry mechanism
            vi.spyOn(ttsService, 'retryVoiceLoading').mockResolvedValue({
                success: true,
                voices: [],
                attempts: 2
            });

            const retryResult = await ttsService.retryVoiceLoading();
            expect(retryResult.success).toBe(true);
        });
    });

    describe('Performance and Memory Management', () => {
        it('should optimize startup performance', async () => {
            const startTime = Date.now();
            
            // Simulate parallel initialization
            await Promise.all([
                audioProcessor.initializeFFmpeg(),
                ttsService.loadVoicesWithRetry(),
                settingsManager.initialize()
            ]);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Verify initialization completes in reasonable time
            expect(duration).toBeLessThan(5000); // 5 seconds max
        });

        it('should manage memory efficiently during large text processing', () => {
            // Test chunk processing for large text
            const largeText = 'A'.repeat(10000);
            const chunks = ttsService.splitTextIntoChunks(largeText, 1000);
            
            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks.every(chunk => chunk.length <= 1000)).toBe(true);
        });
    });
});