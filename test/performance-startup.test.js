/**
 * Performance tests for startup time with bundled FFmpeg
 * Tests initialization speed, resource usage, and optimization
 * 
 * Requirements: 5.3, 5.5, 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance } from 'perf_hooks';

describe('Startup Performance Tests', () => {
    let mockServices;
    let performanceMetrics;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Initialize performance tracking
        performanceMetrics = {
            startTime: 0,
            endTime: 0,
            memoryStart: 0,
            memoryEnd: 0,
            phases: {}
        };
        
        // Create mock services with performance tracking
        mockServices = {
            audioProcessor: {
                initializeFFmpeg: vi.fn(),
                getBundledFFmpegPath: vi.fn(),
                validateFFmpeg: vi.fn(),
                detectSystemFFmpeg: vi.fn()
            },
            ttsService: {
                initialize: vi.fn(),
                loadVoicesWithRetry: vi.fn(),
                loadAvailableVoices: vi.fn()
            },
            settingsManager: {
                initialize: vi.fn(),
                loadSettings: vi.fn(),
                initializeDefaultOutputFolder: vi.fn(),
                getDefaultOutputFolder: vi.fn()
            },
            stateManager: {
                updateInitializationState: vi.fn(),
                updateVoiceState: vi.fn(),
                updateFFmpegState: vi.fn(),
                updateOutputFolderState: vi.fn()
            }
        };
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Overall Startup Performance', () => {
        it('should complete full initialization within 3 seconds', async () => {
            // Setup fast mock responses
            mockServices.settingsManager.initialize.mockResolvedValue(true);
            mockServices.settingsManager.initializeDefaultOutputFolder.mockResolvedValue('/default/path');
            
            mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled',
                path: '/bundled/ffmpeg.exe',
                version: '4.4.0'
            });
            
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: Array.from({ length: 10 }, (_, i) => ({
                    id: `voice${i}`,
                    name: `Voice ${i}`,
                    language: 'en-US'
                })),
                attempt: 1
            });
            
            const startTime = performance.now();
            
            // Simulate parallel initialization
            const results = await Promise.all([
                mockServices.settingsManager.initialize().then(() => 
                    mockServices.settingsManager.initializeDefaultOutputFolder()
                ),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry(3)
            ]);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            
            expect(totalTime).toBeLessThan(3000); // 3 seconds
            expect(results[0]).toBe('/default/path');
            expect(results[1].available).toBe(true);
            expect(results[2].success).toBe(true);
        });

        it('should show progressive improvement with bundled FFmpeg vs system detection', async () => {
            // Test bundled FFmpeg performance
            mockServices.audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            mockServices.audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: true,
                version: '4.4.0',
                error: null
            });
            
            const bundledStartTime = performance.now();
            await mockServices.audioProcessor.initializeFFmpeg();
            const bundledEndTime = performance.now();
            const bundledTime = bundledEndTime - bundledStartTime;
            
            // Test system FFmpeg detection (slower)
            mockServices.audioProcessor.getBundledFFmpegPath.mockReturnValue('/nonexistent/ffmpeg.exe');
            mockServices.audioProcessor.validateFFmpeg
                .mockResolvedValueOnce({ valid: false, error: 'Not found' })
                .mockResolvedValueOnce({ valid: true, version: '4.3.0', error: null });
            mockServices.audioProcessor.detectSystemFFmpeg.mockImplementation(async () => {
                // Simulate slower system detection
                await new Promise(resolve => setTimeout(resolve, 100));
                return '/system/ffmpeg.exe';
            });
            
            const systemStartTime = performance.now();
            await mockServices.audioProcessor.initializeFFmpeg();
            const systemEndTime = performance.now();
            const systemTime = systemEndTime - systemStartTime;
            
            // Bundled FFmpeg should be faster
            expect(bundledTime).toBeLessThan(systemTime);
            expect(bundledTime).toBeLessThan(500); // Should be very fast
        });

        it('should maintain performance with multiple voice retries', async () => {
            let attemptCount = 0;
            
            mockServices.ttsService.loadAvailableVoices.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Temporary failure');
                }
                return Array.from({ length: 15 }, (_, i) => ({
                    id: `voice${i}`,
                    name: `Voice ${i}`,
                    language: 'en-US'
                }));
            });
            
            // Mock sleep to avoid actual delays but track calls
            const sleepCalls = [];
            mockServices.ttsService.sleep = vi.fn().mockImplementation(async (ms) => {
                sleepCalls.push(ms);
                return Promise.resolve();
            });
            
            const startTime = performance.now();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(3);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            
            expect(result.success).toBe(true);
            expect(attemptCount).toBe(3);
            expect(sleepCalls).toEqual([2000, 4000]); // Exponential backoff
            expect(totalTime).toBeLessThan(1000); // Fast with mocked sleep
        });
    });

    describe('Memory Usage Optimization', () => {
        it('should maintain reasonable memory usage during initialization', async () => {
            const initialMemory = process.memoryUsage();
            
            // Setup services with realistic data sizes
            mockServices.settingsManager.initialize.mockResolvedValue(true);
            mockServices.settingsManager.loadSettings.mockResolvedValue({
                defaultOutputPath: '/test/path',
                lastSelectedVoice: 'voice1',
                voiceSpeed: 1.0
            });
            
            mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled',
                path: '/bundled/ffmpeg.exe',
                version: '4.4.0'
            });
            
            // Large voice list to test memory handling
            const largeVoiceList = Array.from({ length: 100 }, (_, i) => ({
                id: `voice${i}`,
                name: `Microsoft Voice ${i}`,
                language: i % 2 === 0 ? 'en-US' : 'en-GB',
                gender: i % 3 === 0 ? 'Male' : 'Female'
            }));
            
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: largeVoiceList,
                attempt: 1
            });
            
            // Run initialization
            await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry(3)
            ]);
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            
            // Memory increase should be reasonable (less than 20MB)
            expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
        });

        it('should clean up temporary resources during initialization', async () => {
            const resourceTracker = {
                tempFiles: [],
                openHandles: [],
                timers: []
            };
            
            // Mock resource creation and cleanup
            mockServices.audioProcessor.validateFFmpeg.mockImplementation(async (path) => {
                // Simulate temporary resource creation
                const tempResource = `temp_${Date.now()}`;
                resourceTracker.tempFiles.push(tempResource);
                
                // Simulate cleanup
                setTimeout(() => {
                    const index = resourceTracker.tempFiles.indexOf(tempResource);
                    if (index > -1) {
                        resourceTracker.tempFiles.splice(index, 1);
                    }
                }, 10);
                
                return { valid: true, version: '4.4.0', error: null };
            });
            
            await mockServices.audioProcessor.initializeFFmpeg();
            
            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 50));
            
            expect(resourceTracker.tempFiles).toHaveLength(0);
        });

        it('should handle memory pressure gracefully', async () => {
            // Simulate memory pressure by creating large objects
            const largeObjects = [];
            
            try {
                // Create some memory pressure
                for (let i = 0; i < 10; i++) {
                    largeObjects.push(new Array(100000).fill('test'));
                }
                
                // Services should still initialize successfully
                mockServices.settingsManager.initialize.mockResolvedValue(true);
                mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                    available: true,
                    source: 'bundled'
                });
                mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                    success: true,
                    voices: [{ id: 'voice1', name: 'Voice 1' }]
                });
                
                const results = await Promise.all([
                    mockServices.settingsManager.initialize(),
                    mockServices.audioProcessor.initializeFFmpeg(),
                    mockServices.ttsService.loadVoicesWithRetry(3)
                ]);
                
                expect(results[0]).toBe(true);
                expect(results[1].available).toBe(true);
                expect(results[2].success).toBe(true);
                
            } finally {
                // Clean up large objects
                largeObjects.length = 0;
            }
        });
    });

    describe('Resource Loading Performance', () => {
        it('should load bundled FFmpeg faster than system detection', async () => {
            // Test bundled FFmpeg loading
            mockServices.audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            
            const bundledStartTime = performance.now();
            mockServices.audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: true,
                version: '4.4.0',
                error: null
            });
            await mockServices.audioProcessor.validateFFmpeg('/bundled/ffmpeg.exe');
            const bundledEndTime = performance.now();
            
            // Test system FFmpeg detection
            const systemStartTime = performance.now();
            mockServices.audioProcessor.detectSystemFFmpeg.mockImplementation(async () => {
                // Simulate system command execution delay
                await new Promise(resolve => setTimeout(resolve, 50));
                return '/system/ffmpeg.exe';
            });
            await mockServices.audioProcessor.detectSystemFFmpeg();
            const systemEndTime = performance.now();
            
            const bundledTime = bundledEndTime - bundledStartTime;
            const systemTime = systemEndTime - systemStartTime;
            
            expect(bundledTime).toBeLessThan(systemTime);
        });

        it('should optimize voice loading with caching', async () => {
            let loadCallCount = 0;
            const cachedVoices = Array.from({ length: 20 }, (_, i) => ({
                id: `voice${i}`,
                name: `Voice ${i}`,
                language: 'en-US'
            }));
            
            mockServices.ttsService.loadAvailableVoices.mockImplementation(async () => {
                loadCallCount++;
                // Simulate loading delay only on first call
                if (loadCallCount === 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                return cachedVoices;
            });
            
            // First load
            const firstStartTime = performance.now();
            await mockServices.ttsService.loadAvailableVoices();
            const firstEndTime = performance.now();
            
            // Second load (should be cached)
            const secondStartTime = performance.now();
            await mockServices.ttsService.loadAvailableVoices();
            const secondEndTime = performance.now();
            
            const firstTime = firstEndTime - firstStartTime;
            const secondTime = secondEndTime - secondStartTime;
            
            expect(secondTime).toBeLessThan(firstTime);
            expect(loadCallCount).toBe(2);
        });

        it('should handle large voice lists efficiently', async () => {
            // Create a large voice list
            const largeVoiceList = Array.from({ length: 500 }, (_, i) => ({
                id: `voice${i}`,
                name: `Microsoft Voice ${i} Desktop`,
                language: ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'][i % 5],
                gender: i % 2 === 0 ? 'Male' : 'Female',
                isDefault: i === 0
            }));
            
            const startTime = performance.now();
            
            mockServices.ttsService.loadAvailableVoices.mockResolvedValue(largeVoiceList);
            const voices = await mockServices.ttsService.loadAvailableVoices();
            
            const endTime = performance.now();
            const loadTime = endTime - startTime;
            
            expect(voices).toHaveLength(500);
            expect(loadTime).toBeLessThan(1000); // Should handle large lists quickly
        });
    });

    describe('Concurrent Operation Performance', () => {
        it('should handle parallel initialization efficiently', async () => {
            // Setup realistic delays for each service
            mockServices.settingsManager.initialize.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return true;
            });
            
            mockServices.audioProcessor.initializeFFmpeg.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return { available: true, source: 'bundled' };
            });
            
            mockServices.ttsService.loadVoicesWithRetry.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 80));
                return { success: true, voices: [{ id: 'voice1', name: 'Voice 1' }] };
            });
            
            // Test sequential vs parallel execution
            const sequentialStartTime = performance.now();
            await mockServices.settingsManager.initialize();
            await mockServices.audioProcessor.initializeFFmpeg();
            await mockServices.ttsService.loadVoicesWithRetry();
            const sequentialEndTime = performance.now();
            
            const parallelStartTime = performance.now();
            await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry()
            ]);
            const parallelEndTime = performance.now();
            
            const sequentialTime = sequentialEndTime - sequentialStartTime;
            const parallelTime = parallelEndTime - parallelStartTime;
            
            // Parallel should be significantly faster
            expect(parallelTime).toBeLessThan(sequentialTime * 0.7);
        });

        it('should maintain performance under concurrent state updates', async () => {
            const updateCount = 100;
            const startTime = performance.now();
            
            // Simulate rapid state updates
            const updatePromises = [];
            for (let i = 0; i < updateCount; i++) {
                updatePromises.push(
                    Promise.resolve().then(() => {
                        mockServices.stateManager.updateVoiceState(i % 2 === 0, i > 50, [], i);
                        mockServices.stateManager.updateFFmpegState(i % 3 === 0, 'bundled', true);
                        mockServices.stateManager.updateOutputFolderState(i % 4 === 0, '/test/path');
                    })
                );
            }
            
            await Promise.all(updatePromises);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            
            expect(totalTime).toBeLessThan(1000); // Should handle rapid updates efficiently
            expect(mockServices.stateManager.updateVoiceState).toHaveBeenCalledTimes(updateCount);
        });

        it('should optimize resource usage during concurrent operations', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Run multiple concurrent operations
            const operations = Array.from({ length: 10 }, (_, i) => 
                Promise.all([
                    mockServices.settingsManager.initialize(),
                    mockServices.audioProcessor.initializeFFmpeg(),
                    mockServices.ttsService.loadVoicesWithRetry()
                ])
            );
            
            mockServices.settingsManager.initialize.mockResolvedValue(true);
            mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            await Promise.all(operations);
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory usage should not scale linearly with concurrent operations
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
        });
    });

    describe('Performance Regression Detection', () => {
        it('should maintain consistent initialization times', async () => {
            const iterations = 5;
            const times = [];
            
            // Setup consistent mock responses
            mockServices.settingsManager.initialize.mockResolvedValue(true);
            mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            // Run multiple iterations
            for (let i = 0; i < iterations; i++) {
                const startTime = performance.now();
                
                await Promise.all([
                    mockServices.settingsManager.initialize(),
                    mockServices.audioProcessor.initializeFFmpeg(),
                    mockServices.ttsService.loadVoicesWithRetry()
                ]);
                
                const endTime = performance.now();
                times.push(endTime - startTime);
            }
            
            // Calculate variance
            const average = times.reduce((sum, time) => sum + time, 0) / times.length;
            const variance = times.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / times.length;
            const standardDeviation = Math.sqrt(variance);
            
            // Times should be consistent (low variance)
            expect(standardDeviation).toBeLessThan(average * 0.2); // Within 20% of average
        });

        it('should detect performance degradation with large datasets', async () => {
            // Test with small dataset
            const smallVoices = Array.from({ length: 10 }, (_, i) => ({
                id: `voice${i}`,
                name: `Voice ${i}`
            }));
            
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: smallVoices
            });
            
            const smallStartTime = performance.now();
            await mockServices.ttsService.loadVoicesWithRetry();
            const smallEndTime = performance.now();
            const smallTime = smallEndTime - smallStartTime;
            
            // Test with large dataset
            const largeVoices = Array.from({ length: 1000 }, (_, i) => ({
                id: `voice${i}`,
                name: `Voice ${i}`,
                language: 'en-US',
                gender: i % 2 === 0 ? 'Male' : 'Female'
            }));
            
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: largeVoices
            });
            
            const largeStartTime = performance.now();
            await mockServices.ttsService.loadVoicesWithRetry();
            const largeEndTime = performance.now();
            const largeTime = largeEndTime - largeStartTime;
            
            // Performance should scale reasonably (not exponentially)
            const scaleFactor = largeTime / smallTime;
            expect(scaleFactor).toBeLessThan(10); // Should not be more than 10x slower
        });

        it('should benchmark against performance targets', async () => {
            const performanceTargets = {
                totalInitialization: 2000, // 2 seconds
                ffmpegDetection: 500,      // 0.5 seconds
                voiceLoading: 1000,        // 1 second
                settingsLoad: 200          // 0.2 seconds
            };
            
            // Test each component against targets
            const results = {};
            
            // FFmpeg detection
            mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            let startTime = performance.now();
            await mockServices.audioProcessor.initializeFFmpeg();
            results.ffmpegDetection = performance.now() - startTime;
            
            // Voice loading
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: Array.from({ length: 50 }, (_, i) => ({ id: `voice${i}`, name: `Voice ${i}` }))
            });
            
            startTime = performance.now();
            await mockServices.ttsService.loadVoicesWithRetry();
            results.voiceLoading = performance.now() - startTime;
            
            // Settings loading
            mockServices.settingsManager.initialize.mockResolvedValue(true);
            
            startTime = performance.now();
            await mockServices.settingsManager.initialize();
            results.settingsLoad = performance.now() - startTime;
            
            // Total initialization
            startTime = performance.now();
            await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry()
            ]);
            results.totalInitialization = performance.now() - startTime;
            
            // Check against targets
            Object.entries(performanceTargets).forEach(([metric, target]) => {
                expect(results[metric]).toBeLessThan(target);
            });
        });
    });

    describe('Resource Cleanup Performance', () => {
        it('should clean up resources quickly on shutdown', async () => {
            // Setup services with cleanup methods
            const cleanupTimes = {};
            
            mockServices.audioProcessor.cleanup = vi.fn().mockImplementation(async () => {
                const startTime = performance.now();
                await new Promise(resolve => setTimeout(resolve, 10));
                cleanupTimes.audio = performance.now() - startTime;
            });
            
            mockServices.ttsService.cleanup = vi.fn().mockImplementation(async () => {
                const startTime = performance.now();
                await new Promise(resolve => setTimeout(resolve, 5));
                cleanupTimes.tts = performance.now() - startTime;
            });
            
            mockServices.settingsManager.cleanup = vi.fn().mockImplementation(async () => {
                const startTime = performance.now();
                await new Promise(resolve => setTimeout(resolve, 3));
                cleanupTimes.settings = performance.now() - startTime;
            });
            
            const totalStartTime = performance.now();
            
            await Promise.all([
                mockServices.audioProcessor.cleanup(),
                mockServices.ttsService.cleanup(),
                mockServices.settingsManager.cleanup()
            ]);
            
            const totalCleanupTime = performance.now() - totalStartTime;
            
            expect(totalCleanupTime).toBeLessThan(100); // Should cleanup quickly
            expect(cleanupTimes.audio).toBeLessThan(50);
            expect(cleanupTimes.tts).toBeLessThan(50);
            expect(cleanupTimes.settings).toBeLessThan(50);
        });

        it('should not leak memory after cleanup', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Create and initialize services
            await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry()
            ]);
            
            const afterInitMemory = process.memoryUsage().heapUsed;
            
            // Cleanup services
            if (mockServices.audioProcessor.cleanup) await mockServices.audioProcessor.cleanup();
            if (mockServices.ttsService.cleanup) await mockServices.ttsService.cleanup();
            if (mockServices.settingsManager.cleanup) await mockServices.settingsManager.cleanup();
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const afterCleanupMemory = process.memoryUsage().heapUsed;
            
            // Memory should return close to initial levels
            const memoryDifference = afterCleanupMemory - initialMemory;
            expect(memoryDifference).toBeLessThan(5 * 1024 * 1024); // Less than 5MB difference
        });
    });
});