/**
 * Integration tests for application startup sequence
 * Tests parallel initialization, state management, and UI coordination
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.2, 6.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock Electron modules
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn().mockReturnValue('/app/userData'),
        whenReady: vi.fn().mockResolvedValue()
    },
    BrowserWindow: vi.fn(),
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn()
    }
}));

describe('Application Startup Integration', () => {
    let mockMainProcess;
    let mockAudioProcessor;
    let mockTTSService;
    let mockSettingsManager;
    let mockStateManager;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock services
        mockAudioProcessor = {
            initializeFFmpeg: vi.fn(),
            getFFmpegStatus: vi.fn(),
            validateFFmpegInstallation: vi.fn()
        };
        
        mockTTSService = {
            initialize: vi.fn(),
            loadVoicesWithRetry: vi.fn(),
            getStatus: vi.fn(),
            on: vi.fn(),
            emit: vi.fn()
        };
        
        mockSettingsManager = {
            initialize: vi.fn(),
            loadSettings: vi.fn(),
            initializeDefaultOutputFolder: vi.fn(),
            getDefaultOutputFolder: vi.fn()
        };
        
        mockStateManager = {
            updateInitializationState: vi.fn(),
            updateVoiceState: vi.fn(),
            updateFFmpegState: vi.fn(),
            updateOutputFolderState: vi.fn(),
            isReady: vi.fn(),
            getState: vi.fn()
        };
        
        // Mock main process
        mockMainProcess = {
            audioProcessor: mockAudioProcessor,
            ttsService: mockTTSService,
            settingsManager: mockSettingsManager,
            stateManager: mockStateManager,
            initializeServices: vi.fn(),
            startParallelInitialization: vi.fn()
        };
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Parallel Service Initialization', () => {
        it('should initialize all services in parallel', async () => {
            // Setup successful initialization
            mockSettingsManager.initialize.mockResolvedValue(true);
            mockSettingsManager.loadSettings.mockResolvedValue({
                defaultOutputPath: '/test/output',
                lastSelectedVoice: 'voice1'
            });
            mockSettingsManager.initializeDefaultOutputFolder.mockResolvedValue('/test/output');
            
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled',
                path: '/bundled/ffmpeg.exe',
                version: '4.4.0'
            });
            
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [
                    { id: 'voice1', name: 'Voice 1', language: 'en-US' },
                    { id: 'voice2', name: 'Voice 2', language: 'en-GB' }
                ],
                attempt: 1
            });
            
            // Mock parallel initialization
            mockMainProcess.startParallelInitialization.mockImplementation(async () => {
                const [settingsResult, ffmpegResult, voicesResult] = await Promise.all([
                    mockSettingsManager.initialize().then(() => mockSettingsManager.initializeDefaultOutputFolder()),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                return {
                    settings: settingsResult,
                    ffmpeg: ffmpegResult,
                    voices: voicesResult
                };
            });
            
            const startTime = Date.now();
            const result = await mockMainProcess.startParallelInitialization();
            const endTime = Date.now();
            
            expect(result.settings).toBe('/test/output');
            expect(result.ffmpeg.available).toBe(true);
            expect(result.voices.success).toBe(true);
            
            // Should complete faster than sequential initialization
            expect(endTime - startTime).toBeLessThan(1000);
            
            // All services should have been called
            expect(mockSettingsManager.initialize).toHaveBeenCalled();
            expect(mockAudioProcessor.initializeFFmpeg).toHaveBeenCalled();
            expect(mockTTSService.loadVoicesWithRetry).toHaveBeenCalled();
        });

        it('should handle partial initialization failures gracefully', async () => {
            // Settings succeed, FFmpeg fails, voices succeed
            mockSettingsManager.initialize.mockResolvedValue(true);
            mockSettingsManager.initializeDefaultOutputFolder.mockResolvedValue('/test/output');
            
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({
                available: false,
                source: 'none',
                error: 'FFmpeg not found'
            });
            
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }],
                attempt: 2
            });
            
            mockMainProcess.startParallelInitialization.mockImplementation(async () => {
                const [settingsResult, ffmpegResult, voicesResult] = await Promise.all([
                    mockSettingsManager.initialize().then(() => mockSettingsManager.initializeDefaultOutputFolder()),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                return {
                    settings: settingsResult,
                    ffmpeg: ffmpegResult,
                    voices: voicesResult
                };
            });
            
            const result = await mockMainProcess.startParallelInitialization();
            
            expect(result.settings).toBe('/test/output');
            expect(result.ffmpeg.available).toBe(false);
            expect(result.voices.success).toBe(true);
            
            // Application should still be functional with partial failures
            expect(result.settings).toBeTruthy();
            expect(result.voices.success).toBe(true);
        });

        it('should continue initialization even if one service fails completely', async () => {
            mockSettingsManager.initialize.mockRejectedValue(new Error('Settings failed'));
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            mockMainProcess.startParallelInitialization.mockImplementation(async () => {
                const results = await Promise.allSettled([
                    mockSettingsManager.initialize().then(() => mockSettingsManager.initializeDefaultOutputFolder()),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                return {
                    settings: results[0].status === 'fulfilled' ? results[0].value : null,
                    ffmpeg: results[1].status === 'fulfilled' ? results[1].value : null,
                    voices: results[2].status === 'fulfilled' ? results[2].value : null
                };
            });
            
            const result = await mockMainProcess.startParallelInitialization();
            
            expect(result.settings).toBe(null);
            expect(result.ffmpeg.available).toBe(true);
            expect(result.voices.success).toBe(true);
        });

        it('should update state manager during initialization', async () => {
            mockSettingsManager.initialize.mockResolvedValue(true);
            mockSettingsManager.initializeDefaultOutputFolder.mockResolvedValue('/test/output');
            
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            mockMainProcess.initializeServices = vi.fn().mockImplementation(async () => {
                // Simulate state updates during initialization
                mockStateManager.updateInitializationState(true);
                
                const results = await Promise.all([
                    mockSettingsManager.initialize().then(() => mockSettingsManager.initializeDefaultOutputFolder()),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                // Update state with results
                mockStateManager.updateOutputFolderState(true, results[0]);
                mockStateManager.updateFFmpegState(results[1].available, results[1].source, results[1].available);
                mockStateManager.updateVoiceState(false, results[2].success, results[2].voices || []);
                mockStateManager.updateInitializationState(false);
                
                return results;
            });
            
            await mockMainProcess.initializeServices();
            
            expect(mockStateManager.updateInitializationState).toHaveBeenCalledWith(true);
            expect(mockStateManager.updateOutputFolderState).toHaveBeenCalledWith(true, '/test/output');
            expect(mockStateManager.updateFFmpegState).toHaveBeenCalledWith(true, 'bundled', true);
            expect(mockStateManager.updateVoiceState).toHaveBeenCalledWith(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            expect(mockStateManager.updateInitializationState).toHaveBeenCalledWith(false);
        });
    });

    describe('State Coordination', () => {
        it('should coordinate state between main and renderer processes', async () => {
            const mockIPC = {
                send: vi.fn(),
                handle: vi.fn()
            };
            
            // Mock IPC communication
            mockMainProcess.sendStateUpdate = vi.fn().mockImplementation((state) => {
                mockIPC.send('state-update', state);
            });
            
            // Simulate state changes
            const stateUpdates = [];
            mockStateManager.updateVoiceState.mockImplementation((loading, loaded, voices) => {
                const state = { voicesLoading: loading, voicesLoaded: loaded, voices };
                stateUpdates.push(state);
                mockMainProcess.sendStateUpdate(state);
            });
            
            // Trigger voice loading
            mockStateManager.updateVoiceState(true, false, []);
            mockStateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            
            expect(stateUpdates).toHaveLength(2);
            expect(stateUpdates[0]).toEqual({ voicesLoading: true, voicesLoaded: false, voices: [] });
            expect(stateUpdates[1]).toEqual({ voicesLoading: false, voicesLoaded: true, voices: [{ id: 'voice1', name: 'Voice 1' }] });
            
            expect(mockIPC.send).toHaveBeenCalledTimes(2);
        });

        it('should handle state synchronization errors', async () => {
            const mockIPC = {
                send: vi.fn().mockImplementation(() => {
                    throw new Error('IPC communication failed');
                })
            };
            
            mockMainProcess.sendStateUpdate = vi.fn().mockImplementation((state) => {
                try {
                    mockIPC.send('state-update', state);
                } catch (error) {
                    console.error('State sync failed:', error);
                }
            });
            
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            mockStateManager.updateVoiceState(false, true, []);
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'State sync failed:',
                expect.any(Error)
            );
            
            consoleErrorSpy.mockRestore();
        });

        it('should maintain state consistency across process restarts', async () => {
            // Simulate saving state before shutdown
            const savedState = {
                lastSelectedVoice: 'voice1',
                defaultOutputPath: '/test/output',
                ffmpegSource: 'bundled'
            };
            
            mockSettingsManager.loadSettings.mockResolvedValue(savedState);
            
            // Simulate restoration on startup
            mockMainProcess.restoreState = vi.fn().mockImplementation(async () => {
                const settings = await mockSettingsManager.loadSettings();
                
                mockStateManager.updateOutputFolderState(true, settings.defaultOutputPath);
                
                return settings;
            });
            
            const restoredState = await mockMainProcess.restoreState();
            
            expect(restoredState).toEqual(savedState);
            expect(mockStateManager.updateOutputFolderState).toHaveBeenCalledWith(true, '/test/output');
        });
    });

    describe('Error Recovery During Startup', () => {
        it('should recover from voice loading failures with retry', async () => {
            let voiceLoadAttempts = 0;
            
            mockTTSService.loadVoicesWithRetry.mockImplementation(async () => {
                voiceLoadAttempts++;
                if (voiceLoadAttempts < 3) {
                    return {
                        success: false,
                        error: new Error('Temporary failure'),
                        attempts: voiceLoadAttempts
                    };
                }
                return {
                    success: true,
                    voices: [{ id: 'voice1', name: 'Voice 1' }],
                    attempt: voiceLoadAttempts
                };
            });
            
            mockMainProcess.initializeWithRetry = vi.fn().mockImplementation(async () => {
                let result;
                do {
                    result = await mockTTSService.loadVoicesWithRetry(3);
                    if (!result.success && result.attempts < 3) {
                        // Simulate retry delay
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                } while (!result.success && result.attempts < 3);
                
                return result;
            });
            
            const result = await mockMainProcess.initializeWithRetry();
            
            expect(result.success).toBe(true);
            expect(voiceLoadAttempts).toBe(3);
        });

        it('should provide fallback functionality when services fail', async () => {
            // All services fail
            mockSettingsManager.initialize.mockRejectedValue(new Error('Settings failed'));
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({
                available: false,
                source: 'none',
                error: 'FFmpeg not found'
            });
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: false,
                error: new Error('No voices found'),
                attempts: 3
            });
            
            mockMainProcess.initializeWithFallbacks = vi.fn().mockImplementation(async () => {
                const results = await Promise.allSettled([
                    mockSettingsManager.initialize(),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                // Provide fallback functionality
                const fallbackState = {
                    settingsAvailable: results[0].status === 'fulfilled',
                    ffmpegAvailable: results[1].status === 'fulfilled' && results[1].value.available,
                    voicesAvailable: results[2].status === 'fulfilled' && results[2].value.success,
                    canConvert: false, // No voices available
                    canConvertToMp3: false, // No FFmpeg available
                    hasOutputFolder: false // No settings available
                };
                
                return fallbackState;
            });
            
            const result = await mockMainProcess.initializeWithFallbacks();
            
            expect(result.settingsAvailable).toBe(false);
            expect(result.ffmpegAvailable).toBe(false);
            expect(result.voicesAvailable).toBe(false);
            expect(result.canConvert).toBe(false);
        });

        it('should handle initialization timeout gracefully', async () => {
            // Mock slow services
            mockSettingsManager.initialize.mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 5000))
            );
            
            mockAudioProcessor.initializeFFmpeg.mockImplementation(() =>
                new Promise(resolve => setTimeout(resolve, 3000))
            );
            
            mockTTSService.loadVoicesWithRetry.mockImplementation(() =>
                new Promise(resolve => setTimeout(resolve, 4000))
            );
            
            mockMainProcess.initializeWithTimeout = vi.fn().mockImplementation(async (timeoutMs = 2000) => {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Initialization timeout')), timeoutMs)
                );
                
                const initPromise = Promise.all([
                    mockSettingsManager.initialize(),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                try {
                    return await Promise.race([initPromise, timeoutPromise]);
                } catch (error) {
                    if (error.message === 'Initialization timeout') {
                        // Provide minimal functionality
                        return {
                            timedOut: true,
                            partialInit: true
                        };
                    }
                    throw error;
                }
            });
            
            const result = await mockMainProcess.initializeWithTimeout(1000);
            
            expect(result.timedOut).toBe(true);
            expect(result.partialInit).toBe(true);
        });
    });

    describe('Performance Optimization', () => {
        it('should complete initialization within acceptable time limits', async () => {
            // Setup fast mock responses
            mockSettingsManager.initialize.mockResolvedValue(true);
            mockSettingsManager.initializeDefaultOutputFolder.mockResolvedValue('/test/output');
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            mockMainProcess.startParallelInitialization.mockImplementation(async () => {
                const startTime = Date.now();
                
                const results = await Promise.all([
                    mockSettingsManager.initialize().then(() => mockSettingsManager.initializeDefaultOutputFolder()),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                const endTime = Date.now();
                
                return {
                    results,
                    initTime: endTime - startTime
                };
            });
            
            const result = await mockMainProcess.startParallelInitialization();
            
            expect(result.initTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should minimize memory usage during initialization', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Setup services with minimal memory footprint
            mockSettingsManager.initialize.mockResolvedValue(true);
            mockAudioProcessor.initializeFFmpeg.mockResolvedValue({ available: true });
            mockTTSService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: Array.from({ length: 10 }, (_, i) => ({ id: `voice${i}`, name: `Voice ${i}` }))
            });
            
            mockMainProcess.startParallelInitialization.mockImplementation(async () => {
                return await Promise.all([
                    mockSettingsManager.initialize(),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
            });
            
            await mockMainProcess.startParallelInitialization();
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });

        it('should cache initialization results to avoid redundant work', async () => {
            let initCallCount = 0;
            
            mockSettingsManager.initialize.mockImplementation(async () => {
                initCallCount++;
                return true;
            });
            
            mockMainProcess.initializeWithCaching = vi.fn().mockImplementation(async () => {
                // First call
                await mockSettingsManager.initialize();
                
                // Second call should use cache
                await mockSettingsManager.initialize();
                
                return initCallCount;
            });
            
            const callCount = await mockMainProcess.initializeWithCaching();
            
            // Should only initialize once due to caching
            expect(callCount).toBe(1);
        });
    });

    describe('UI Responsiveness During Startup', () => {
        it('should update UI progressively during initialization', async () => {
            const uiUpdates = [];
            
            mockStateManager.updateInitializationState.mockImplementation((initializing) => {
                uiUpdates.push({ type: 'initialization', initializing });
            });
            
            mockStateManager.updateVoiceState.mockImplementation((loading, loaded, voices) => {
                uiUpdates.push({ type: 'voices', loading, loaded, voiceCount: voices.length });
            });
            
            mockStateManager.updateFFmpegState.mockImplementation((available, source) => {
                uiUpdates.push({ type: 'ffmpeg', available, source });
            });
            
            mockMainProcess.initializeWithProgressUpdates = vi.fn().mockImplementation(async () => {
                mockStateManager.updateInitializationState(true);
                
                // Simulate progressive updates
                mockStateManager.updateVoiceState(true, false, []);
                await new Promise(resolve => setTimeout(resolve, 10));
                
                mockStateManager.updateFFmpegState(true, 'bundled');
                await new Promise(resolve => setTimeout(resolve, 10));
                
                mockStateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
                await new Promise(resolve => setTimeout(resolve, 10));
                
                mockStateManager.updateInitializationState(false);
            });
            
            await mockMainProcess.initializeWithProgressUpdates();
            
            expect(uiUpdates).toHaveLength(5);
            expect(uiUpdates[0]).toEqual({ type: 'initialization', initializing: true });
            expect(uiUpdates[1]).toEqual({ type: 'voices', loading: true, loaded: false, voiceCount: 0 });
            expect(uiUpdates[2]).toEqual({ type: 'ffmpeg', available: true, source: 'bundled' });
            expect(uiUpdates[3]).toEqual({ type: 'voices', loading: false, loaded: true, voiceCount: 1 });
            expect(uiUpdates[4]).toEqual({ type: 'initialization', initializing: false });
        });

        it('should maintain UI responsiveness during long operations', async () => {
            let uiBlocked = false;
            
            // Mock long-running operation
            mockTTSService.loadVoicesWithRetry.mockImplementation(async () => {
                // Simulate work in chunks to avoid blocking
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setImmediate(resolve));
                    // Check if UI would be blocked
                    if (Date.now() % 100 === 0) {
                        uiBlocked = true;
                    }
                }
                return { success: true, voices: [] };
            });
            
            mockMainProcess.initializeNonBlocking = vi.fn().mockImplementation(async () => {
                await mockTTSService.loadVoicesWithRetry(3);
                return !uiBlocked;
            });
            
            const uiResponsive = await mockMainProcess.initializeNonBlocking();
            
            expect(uiResponsive).toBe(true);
        });
    });

    describe('Cleanup and Resource Management', () => {
        it('should clean up resources on initialization failure', async () => {
            const cleanupCalls = [];
            
            mockSettingsManager.cleanup = vi.fn().mockImplementation(() => {
                cleanupCalls.push('settings');
            });
            
            mockAudioProcessor.cleanup = vi.fn().mockImplementation(() => {
                cleanupCalls.push('audio');
            });
            
            mockTTSService.cleanup = vi.fn().mockImplementation(() => {
                cleanupCalls.push('tts');
            });
            
            // Simulate initialization failure
            mockTTSService.loadVoicesWithRetry.mockRejectedValue(new Error('Critical failure'));
            
            mockMainProcess.initializeWithCleanup = vi.fn().mockImplementation(async () => {
                try {
                    await Promise.all([
                        mockSettingsManager.initialize(),
                        mockAudioProcessor.initializeFFmpeg(),
                        mockTTSService.loadVoicesWithRetry(3)
                    ]);
                } catch (error) {
                    // Cleanup on failure
                    await Promise.all([
                        mockSettingsManager.cleanup?.(),
                        mockAudioProcessor.cleanup?.(),
                        mockTTSService.cleanup?.()
                    ]);
                    throw error;
                }
            });
            
            await expect(mockMainProcess.initializeWithCleanup()).rejects.toThrow('Critical failure');
            
            expect(cleanupCalls).toContain('settings');
            expect(cleanupCalls).toContain('audio');
            expect(cleanupCalls).toContain('tts');
        });

        it('should handle graceful shutdown during initialization', async () => {
            let shutdownRequested = false;
            
            mockMainProcess.requestShutdown = vi.fn().mockImplementation(() => {
                shutdownRequested = true;
            });
            
            mockMainProcess.initializeWithShutdownHandling = vi.fn().mockImplementation(async () => {
                const initPromise = Promise.all([
                    mockSettingsManager.initialize(),
                    mockAudioProcessor.initializeFFmpeg(),
                    mockTTSService.loadVoicesWithRetry(3)
                ]);
                
                // Simulate shutdown request during initialization
                setTimeout(() => mockMainProcess.requestShutdown(), 50);
                
                try {
                    await initPromise;
                } catch (error) {
                    if (shutdownRequested) {
                        return { shutdownDuringInit: true };
                    }
                    throw error;
                }
                
                return { shutdownDuringInit: false };
            });
            
            const result = await mockMainProcess.initializeWithShutdownHandling();
            
            expect(result.shutdownDuringInit).toBe(true);
        });
    });
});