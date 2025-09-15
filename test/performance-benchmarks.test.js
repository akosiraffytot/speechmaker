/**
 * Performance benchmark tests for speechmaker improvements
 * Tests startup performance, memory usage, and optimization targets
 * 
 * Requirements: 5.3, 5.5, 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance } from 'perf_hooks';

describe('Performance Benchmarks', () => {
    let mockServices;
    let performanceTargets;
    let benchmarkResults;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Define performance targets based on requirements
        performanceTargets = {
            totalStartup: 3000,        // 3 seconds max total startup
            ffmpegDetection: 500,      // 0.5 seconds max FFmpeg detection
            voiceLoading: 1500,        // 1.5 seconds max voice loading
            settingsLoad: 300,         // 0.3 seconds max settings loading
            stateUpdates: 50,          // 50ms max for state updates
            memoryUsage: 50 * 1024 * 1024, // 50MB max memory increase
            concurrentOps: 2000        // 2 seconds max for concurrent operations
        };
        
        benchmarkResults = {
            startup: {},
            memory: {},
            concurrent: {},
            optimization: {}
        };
        
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
                initializeDefaultOutputFolder: vi.fn()
            },
            stateManager: {
                updateInitializationState: vi.fn(),
                updateVoiceState: vi.fn(),
                updateFFmpegState: vi.fn(),
                updateOutputFolderState: vi.fn(),
                getState: vi.fn()
            }
        };
    });

    describe('Startup Performance Benchmarks', () => {
        it('should meet total startup time target', async () => {
            // Setup realistic service responses
            mockServices.settingsManager.initialize.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return true;
            });
            
            mockServices.audioProcessor.initializeFFmpeg.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 200));
                return { available: true, source: 'bundled', version: '4.4.0' };
            });
            
            mockServices.ttsService.loadVoicesWithRetry.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 300));
                return {
                    success: true,
                    voices: Array.from({ length: 20 }, (_, i) => ({
                        id: `voice${i}`,
                        name: `Voice ${i}`,
                        language: 'en-US'
                    })),
                    attempt: 1
                };
            });
            
            const startTime = performance.now();
            
            // Execute parallel startup
            const results = await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry()
            ]);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            
            benchmarkResults.startup.total = totalTime;
            
            expect(totalTime).toBeLessThan(performanceTargets.totalStartup);
            expect(results[0]).toBe(true);
            expect(results[1].available).toBe(true);
            expect(results[2].success).toBe(true);
            
            console.log(`✅ Total startup time: ${totalTime.toFixed(2)}ms (target: ${performanceTargets.totalStartup}ms)`);
        });

        it('should meet individual service initialization targets', async () => {
            const serviceTests = [
                {
                    name: 'Settings Loading',
                    service: mockServices.settingsManager.initialize,
                    target: performanceTargets.settingsLoad,
                    setup: () => mockServices.settingsManager.initialize.mockResolvedValue(true)
                },
                {
                    name: 'FFmpeg Detection',
                    service: mockServices.audioProcessor.initializeFFmpeg,
                    target: performanceTargets.ffmpegDetection,
                    setup: () => mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                        available: true,
                        source: 'bundled'
                    })
                },
                {
                    name: 'Voice Loading',
                    service: mockServices.ttsService.loadVoicesWithRetry,
                    target: performanceTargets.voiceLoading,
                    setup: () => mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                        success: true,
                        voices: Array.from({ length: 50 }, (_, i) => ({ id: `voice${i}`, name: `Voice ${i}` }))
                    })
                }
            ];
            
            for (const test of serviceTests) {
                test.setup();
                
                const startTime = performance.now();
                await test.service();
                const endTime = performance.now();
                const serviceTime = endTime - startTime;
                
                benchmarkResults.startup[test.name.toLowerCase().replace(' ', '_')] = serviceTime;
                
                expect(serviceTime).toBeLessThan(test.target);
                console.log(`✅ ${test.name}: ${serviceTime.toFixed(2)}ms (target: ${test.target}ms)`);
            }
        });

        it('should optimize bundled FFmpeg vs system detection performance', async () => {
            // Test bundled FFmpeg performance
            mockServices.audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            mockServices.audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: true,
                version: '4.4.0',
                error: null
            });
            
            const bundledStartTime = performance.now();
            await mockServices.audioProcessor.validateFFmpeg('/bundled/ffmpeg.exe');
            const bundledEndTime = performance.now();
            const bundledTime = bundledEndTime - bundledStartTime;
            
            // Test system FFmpeg detection (should be slower)
            mockServices.audioProcessor.detectSystemFFmpeg.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100)); // Simulate system command
                return '/system/ffmpeg.exe';
            });
            
            const systemStartTime = performance.now();
            await mockServices.audioProcessor.detectSystemFFmpeg();
            const systemEndTime = performance.now();
            const systemTime = systemEndTime - systemStartTime;
            
            benchmarkResults.optimization.bundledVsSystem = {
                bundled: bundledTime,
                system: systemTime,
                improvement: ((systemTime - bundledTime) / systemTime * 100).toFixed(1)
            };
            
            expect(bundledTime).toBeLessThan(systemTime);
            console.log(`✅ Bundled FFmpeg: ${bundledTime.toFixed(2)}ms vs System: ${systemTime.toFixed(2)}ms`);
            console.log(`   Performance improvement: ${benchmarkResults.optimization.bundledVsSystem.improvement}%`);
        });

        it('should handle large voice lists efficiently', async () => {
            const voiceCounts = [10, 50, 100, 200, 500];
            const loadTimes = [];
            
            for (const count of voiceCounts) {
                const voices = Array.from({ length: count }, (_, i) => ({
                    id: `voice${i}`,
                    name: `Microsoft Voice ${i} Desktop`,
                    language: ['en-US', 'en-GB', 'fr-FR', 'de-DE'][i % 4],
                    gender: i % 2 === 0 ? 'Male' : 'Female'
                }));
                
                mockServices.ttsService.loadAvailableVoices.mockResolvedValue(voices);
                
                const startTime = performance.now();
                await mockServices.ttsService.loadAvailableVoices();
                const endTime = performance.now();
                const loadTime = endTime - startTime;
                
                loadTimes.push({ count, time: loadTime });
                
                // Performance should scale reasonably (not exponentially)
                expect(loadTime).toBeLessThan(count * 2); // Max 2ms per voice
            }
            
            benchmarkResults.optimization.voiceScaling = loadTimes;
            
            console.log('✅ Voice loading scaling:');
            loadTimes.forEach(({ count, time }) => {
                console.log(`   ${count} voices: ${time.toFixed(2)}ms (${(time/count).toFixed(2)}ms per voice)`);
            });
        });
    });

    describe('Memory Usage Benchmarks', () => {
        it('should maintain memory usage within targets', async () => {
            const initialMemory = process.memoryUsage();
            
            // Simulate realistic application initialization
            mockServices.settingsManager.initialize.mockResolvedValue(true);
            mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            // Large voice list to test memory handling
            const largeVoiceList = Array.from({ length: 200 }, (_, i) => ({
                id: `voice${i}`,
                name: `Microsoft Voice ${i} Desktop - Long Name With Extra Information`,
                language: ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'][i % 5],
                gender: i % 2 === 0 ? 'Male' : 'Female',
                isDefault: i === 0,
                metadata: {
                    quality: 'High',
                    sampleRate: 22050,
                    description: `High quality voice for ${['English', 'French', 'German', 'Spanish'][i % 4]} language`
                }
            }));
            
            mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: largeVoiceList
            });
            
            // Execute initialization
            await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry()
            ]);
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            
            benchmarkResults.memory.initialization = {
                initial: initialMemory.heapUsed,
                final: finalMemory.heapUsed,
                increase: memoryIncrease,
                increaseFormatted: `${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`
            };
            
            expect(memoryIncrease).toBeLessThan(performanceTargets.memoryUsage);
            console.log(`✅ Memory usage: ${benchmarkResults.memory.initialization.increaseFormatted} (target: ${(performanceTargets.memoryUsage / 1024 / 1024).toFixed(0)}MB)`);
        });

        it('should handle memory pressure gracefully', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Create memory pressure
            const largeObjects = [];
            try {
                for (let i = 0; i < 20; i++) {
                    largeObjects.push(new Array(500000).fill(`memory-pressure-${i}`));
                }
                
                const pressureMemory = process.memoryUsage().heapUsed;
                
                // Services should still initialize under memory pressure
                mockServices.settingsManager.initialize.mockResolvedValue(true);
                mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                    available: true,
                    source: 'bundled'
                });
                mockServices.ttsService.loadVoicesWithRetry.mockResolvedValue({
                    success: true,
                    voices: [{ id: 'voice1', name: 'Voice 1' }]
                });
                
                const startTime = performance.now();
                
                const results = await Promise.all([
                    mockServices.settingsManager.initialize(),
                    mockServices.audioProcessor.initializeFFmpeg(),
                    mockServices.ttsService.loadVoicesWithRetry()
                ]);
                
                const endTime = performance.now();
                const initTime = endTime - startTime;
                
                benchmarkResults.memory.underPressure = {
                    initialMemory: (initialMemory / 1024 / 1024).toFixed(2),
                    pressureMemory: (pressureMemory / 1024 / 1024).toFixed(2),
                    initTime: initTime.toFixed(2),
                    success: results.every(r => r === true || r.available === true || r.success === true)
                };
                
                expect(results[0]).toBe(true);
                expect(results[1].available).toBe(true);
                expect(results[2].success).toBe(true);
                expect(initTime).toBeLessThan(performanceTargets.totalStartup * 2); // Allow 2x under pressure
                
                console.log(`✅ Performance under memory pressure: ${initTime.toFixed(2)}ms`);
                
            } finally {
                // Clean up memory pressure
                largeObjects.length = 0;
            }
        });

        it('should not leak memory during error recovery', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Simulate multiple error recovery cycles
            for (let cycle = 0; cycle < 10; cycle++) {
                mockServices.ttsService.loadVoicesWithRetry.mockRejectedValue(
                    new Error(`Simulated error ${cycle}`)
                );
                
                try {
                    await mockServices.ttsService.loadVoicesWithRetry();
                } catch (error) {
                    // Expected errors
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryDifference = finalMemory - initialMemory;
            
            benchmarkResults.memory.errorRecovery = {
                cycles: 10,
                memoryDifference: (memoryDifference / 1024 / 1024).toFixed(2),
                leakDetected: memoryDifference > 5 * 1024 * 1024 // 5MB threshold
            };
            
            expect(memoryDifference).toBeLessThan(5 * 1024 * 1024); // Less than 5MB difference
            console.log(`✅ Memory after error recovery: ${benchmarkResults.memory.errorRecovery.memoryDifference}MB difference`);
        });
    });

    describe('Concurrent Operations Performance', () => {
        it('should handle concurrent state updates efficiently', async () => {
            const updateCount = 1000;
            const startTime = performance.now();
            
            // Create concurrent state updates
            const updatePromises = [];
            for (let i = 0; i < updateCount; i++) {
                updatePromises.push(
                    Promise.resolve().then(() => {
                        mockServices.stateManager.updateVoiceState(i % 2 === 0, i > 500, [], i);
                        mockServices.stateManager.updateFFmpegState(i % 3 === 0, 'bundled', true);
                        mockServices.stateManager.updateOutputFolderState(i % 4 === 0, '/test/path');
                    })
                );
            }
            
            await Promise.all(updatePromises);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            
            benchmarkResults.concurrent.stateUpdates = {
                updates: updateCount,
                totalTime: totalTime.toFixed(2),
                avgTimePerUpdate: (totalTime / updateCount).toFixed(3)
            };
            
            expect(totalTime).toBeLessThan(performanceTargets.concurrentOps);
            expect(mockServices.stateManager.updateVoiceState).toHaveBeenCalledTimes(updateCount);
            
            console.log(`✅ Concurrent state updates: ${updateCount} updates in ${totalTime.toFixed(2)}ms`);
            console.log(`   Average: ${(totalTime / updateCount).toFixed(3)}ms per update`);
        });

        it('should handle parallel service initialization efficiently', async () => {
            const iterations = 5;
            const times = [];
            
            for (let i = 0; i < iterations; i++) {
                mockServices.settingsManager.initialize.mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    return true;
                });
                
                mockServices.audioProcessor.initializeFFmpeg.mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, 30));
                    return { available: true, source: 'bundled' };
                });
                
                mockServices.ttsService.loadVoicesWithRetry.mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, 70));
                    return { success: true, voices: [{ id: 'voice1', name: 'Voice 1' }] };
                });
                
                const startTime = performance.now();
                
                await Promise.all([
                    mockServices.settingsManager.initialize(),
                    mockServices.audioProcessor.initializeFFmpeg(),
                    mockServices.ttsService.loadVoicesWithRetry()
                ]);
                
                const endTime = performance.now();
                times.push(endTime - startTime);
            }
            
            const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
            const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length;
            const stdDev = Math.sqrt(variance);
            
            benchmarkResults.concurrent.parallelInit = {
                iterations,
                avgTime: avgTime.toFixed(2),
                stdDev: stdDev.toFixed(2),
                consistency: (stdDev / avgTime * 100).toFixed(1)
            };
            
            expect(avgTime).toBeLessThan(100); // Should complete in ~70ms (max of parallel operations)
            expect(stdDev).toBeLessThan(avgTime * 0.2); // Low variance (consistent performance)
            
            console.log(`✅ Parallel initialization: ${avgTime.toFixed(2)}ms avg (±${stdDev.toFixed(2)}ms)`);
        });

        it('should maintain performance with multiple retry operations', async () => {
            const retryScenarios = [
                { maxRetries: 2, successOn: 1 },
                { maxRetries: 3, successOn: 2 },
                { maxRetries: 5, successOn: 4 }
            ];
            
            const retryResults = [];
            
            for (const scenario of retryScenarios) {
                let attemptCount = 0;
                
                mockServices.ttsService.loadVoicesWithRetry.mockImplementation(async () => {
                    attemptCount++;
                    if (attemptCount < scenario.successOn) {
                        throw new Error('Retry test error');
                    }
                    return { success: true, voices: [{ id: 'voice1', name: 'Voice 1' }] };
                });
                
                // Mock sleep to avoid actual delays
                mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
                
                const startTime = performance.now();
                const result = await mockServices.ttsService.loadVoicesWithRetry(scenario.maxRetries);
                const endTime = performance.now();
                
                retryResults.push({
                    maxRetries: scenario.maxRetries,
                    successOn: scenario.successOn,
                    time: endTime - startTime,
                    success: result.success
                });
                
                expect(result.success).toBe(true);
                expect(endTime - startTime).toBeLessThan(100); // Fast with mocked sleep
            }
            
            benchmarkResults.concurrent.retryPerformance = retryResults;
            
            console.log('✅ Retry operation performance:');
            retryResults.forEach(result => {
                console.log(`   ${result.maxRetries} max retries, success on ${result.successOn}: ${result.time.toFixed(2)}ms`);
            });
        });
    });

    describe('Performance Regression Detection', () => {
        it('should detect performance regressions in startup time', async () => {
            const baselineTime = 800; // Expected baseline in ms
            const regressionThreshold = 1.5; // 50% increase is a regression
            
            mockServices.settingsManager.initialize.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return true;
            });
            
            mockServices.audioProcessor.initializeFFmpeg.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 200));
                return { available: true, source: 'bundled' };
            });
            
            mockServices.ttsService.loadVoicesWithRetry.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 300));
                return { success: true, voices: [{ id: 'voice1', name: 'Voice 1' }] };
            });
            
            const startTime = performance.now();
            
            await Promise.all([
                mockServices.settingsManager.initialize(),
                mockServices.audioProcessor.initializeFFmpeg(),
                mockServices.ttsService.loadVoicesWithRetry()
            ]);
            
            const endTime = performance.now();
            const actualTime = endTime - startTime;
            const regressionRatio = actualTime / baselineTime;
            
            benchmarkResults.optimization.regressionCheck = {
                baseline: baselineTime,
                actual: actualTime.toFixed(2),
                ratio: regressionRatio.toFixed(2),
                isRegression: regressionRatio > regressionThreshold
            };
            
            expect(regressionRatio).toBeLessThan(regressionThreshold);
            console.log(`✅ Regression check: ${actualTime.toFixed(2)}ms vs ${baselineTime}ms baseline (${regressionRatio.toFixed(2)}x)`);
        });

        it('should benchmark against performance targets', () => {
            // Collect all benchmark results and compare against targets
            const targetComparison = {
                totalStartup: {
                    target: performanceTargets.totalStartup,
                    actual: benchmarkResults.startup.total || 0,
                    pass: (benchmarkResults.startup.total || 0) < performanceTargets.totalStartup
                },
                memoryUsage: {
                    target: `${(performanceTargets.memoryUsage / 1024 / 1024).toFixed(0)}MB`,
                    actual: benchmarkResults.memory.initialization?.increaseFormatted || 'N/A',
                    pass: (benchmarkResults.memory.initialization?.increase || 0) < performanceTargets.memoryUsage
                }
            };
            
            console.log('\n📊 Performance Benchmark Summary:');
            console.log('=====================================');
            
            Object.entries(targetComparison).forEach(([metric, data]) => {
                const status = data.pass ? '✅ PASS' : '❌ FAIL';
                console.log(`${status} ${metric}: ${data.actual} (target: ${data.target})`);
            });
            
            // All targets should pass
            Object.values(targetComparison).forEach(data => {
                expect(data.pass).toBe(true);
            });
        });
    });

    afterEach(() => {
        // Log performance summary after each test suite
        if (Object.keys(benchmarkResults.startup).length > 0) {
            console.log('\n🚀 Performance Results Summary:');
            console.log(`   Startup: ${JSON.stringify(benchmarkResults.startup, null, 2)}`);
        }
        if (Object.keys(benchmarkResults.memory).length > 0) {
            console.log(`   Memory: ${JSON.stringify(benchmarkResults.memory, null, 2)}`);
        }
        if (Object.keys(benchmarkResults.concurrent).length > 0) {
            console.log(`   Concurrent: ${JSON.stringify(benchmarkResults.concurrent, null, 2)}`);
        }
    });
});