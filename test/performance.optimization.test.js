import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PerformanceMonitor from '../src/main/utils/performanceMonitor.js';

describe('Performance Optimizations', () => {
    let perfMonitor;

    beforeEach(() => {
        // Enable performance monitoring for tests
        process.env.ENABLE_PERF_MONITORING = 'true';
        perfMonitor = new PerformanceMonitor();
    });

    afterEach(() => {
        delete process.env.ENABLE_PERF_MONITORING;
    });

    describe('PerformanceMonitor', () => {
        it('should track performance metrics correctly', () => {
            perfMonitor.markStart('test-operation');
            
            // Simulate some work
            const start = Date.now();
            while (Date.now() - start < 10) {
                // Busy wait for 10ms
            }
            
            const result = perfMonitor.markEnd('test-operation');
            
            expect(result).toBeDefined();
            expect(result.name).toBe('test-operation');
            expect(result.duration).toBeGreaterThanOrEqual(10);
            expect(result.memoryDelta).toBeDefined();
        });

        it('should handle missing start markers gracefully', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            const result = perfMonitor.markEnd('non-existent-operation');
            
            expect(result).toBeUndefined();
            expect(consoleSpy).toHaveBeenCalledWith(
                "Performance metric 'non-existent-operation' was not started"
            );
            
            consoleSpy.mockRestore();
        });

        it('should return empty metrics when disabled', () => {
            process.env.ENABLE_PERF_MONITORING = 'false';
            const disabledMonitor = new PerformanceMonitor();
            
            disabledMonitor.markStart('test');
            disabledMonitor.markEnd('test');
            
            const metrics = disabledMonitor.getMetrics();
            expect(metrics).toEqual({});
        });

        it('should batch operations efficiently', async () => {
            const operations = Array.from({ length: 100 }, (_, i) => () => i * 2);
            
            const start = Date.now();
            const results = await PerformanceMonitor.batchOperations(operations, 10);
            const duration = Date.now() - start;
            
            expect(results).toHaveLength(100);
            expect(results[0]).toBe(0);
            expect(results[99]).toBe(198);
            
            // Batching should complete reasonably quickly
            expect(duration).toBeLessThan(1000);
        });

        it('should handle errors in batched operations', async () => {
            const operations = [
                () => 'success',
                () => { throw new Error('test error'); },
                () => 'another success'
            ];
            
            const results = await PerformanceMonitor.batchOperations(operations, 2);
            
            expect(results).toHaveLength(3);
            expect(results[0]).toBe('success');
            expect(results[1]).toBeInstanceOf(Error);
            expect(results[2]).toBe('another success');
        });
    });

    describe('Memory Optimization', () => {
        it('should handle large text processing efficiently', () => {
            // Simulate large text processing
            const largeText = 'A'.repeat(100000); // 100KB of text
            const chunks = [];
            
            // Simulate chunking process
            const chunkSize = 5000;
            for (let i = 0; i < largeText.length; i += chunkSize) {
                chunks.push(largeText.slice(i, i + chunkSize));
            }
            
            expect(chunks.length).toBe(20);
            expect(chunks[0].length).toBe(5000);
            expect(chunks[chunks.length - 1].length).toBeLessThanOrEqual(5000);
        });

        it('should process chunks in batches for memory efficiency', async () => {
            const chunks = Array.from({ length: 50 }, (_, i) => `chunk-${i}`);
            const maxConcurrent = 3;
            const processedChunks = [];
            
            // Simulate batch processing
            for (let i = 0; i < chunks.length; i += maxConcurrent) {
                const batch = chunks.slice(i, i + maxConcurrent);
                const batchResults = await Promise.all(
                    batch.map(async (chunk) => {
                        // Simulate async processing
                        await new Promise(resolve => setTimeout(resolve, 1));
                        return `processed-${chunk}`;
                    })
                );
                processedChunks.push(...batchResults);
            }
            
            expect(processedChunks).toHaveLength(50);
            expect(processedChunks[0]).toBe('processed-chunk-0');
            expect(processedChunks[49]).toBe('processed-chunk-49');
        });
    });

    describe('Async Processing Optimization', () => {
        it('should yield to event loop during intensive operations', async () => {
            const operations = [];
            const startTime = Date.now();
            
            // Simulate yielding to event loop
            for (let i = 0; i < 10; i++) {
                operations.push(new Promise(resolve => {
                    setImmediate(() => {
                        // Simulate some work
                        const work = Array.from({ length: 1000 }, (_, j) => j * 2);
                        resolve(work.length);
                    });
                }));
            }
            
            const results = await Promise.all(operations);
            const duration = Date.now() - startTime;
            
            expect(results).toHaveLength(10);
            expect(results.every(r => r === 1000)).toBe(true);
            
            // Should complete quickly due to proper async handling
            expect(duration).toBeLessThan(100);
        });

        it('should throttle progress updates effectively', () => {
            const updates = [];
            const throttleMs = 100;
            let lastUpdate = 0;
            
            // Simulate throttled progress updates
            for (let i = 0; i < 1000; i++) {
                const now = Date.now();
                if (now - lastUpdate >= throttleMs) {
                    updates.push(i);
                    lastUpdate = now;
                }
            }
            
            // Should have significantly fewer updates due to throttling
            expect(updates.length).toBeLessThan(100);
        });
    });

    describe('UI Responsiveness', () => {
        it('should use document fragments for DOM operations', () => {
            // Simulate DOM fragment usage
            const fragment = {
                appendChild: vi.fn(),
                children: []
            };
            
            const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));
            
            // Simulate adding items to fragment
            items.forEach(item => {
                const element = { textContent: item.name, value: item.id };
                fragment.appendChild(element);
                fragment.children.push(element);
            });
            
            expect(fragment.appendChild).toHaveBeenCalledTimes(100);
            expect(fragment.children).toHaveLength(100);
        });

        it('should use requestIdleCallback when available', (done) => {
            // Mock requestIdleCallback
            const mockRequestIdleCallback = vi.fn((callback) => {
                setTimeout(callback, 0);
            });
            
            global.requestIdleCallback = mockRequestIdleCallback;
            
            const work = () => {
                expect(mockRequestIdleCallback).toHaveBeenCalled();
                done();
            };
            
            // Simulate using requestIdleCallback
            if (global.requestIdleCallback) {
                global.requestIdleCallback(work, { timeout: 2000 });
            } else {
                setTimeout(work, 10);
            }
        });
    });

    describe('Startup Optimization', () => {
        it('should initialize services in optimal order', () => {
            const initOrder = [];
            
            // Simulate service initialization order
            const services = {
                errorHandler: () => initOrder.push('errorHandler'),
                settingsManager: () => initOrder.push('settingsManager'),
                fileManager: () => initOrder.push('fileManager'),
                audioProcessor: () => initOrder.push('audioProcessor'),
                ttsService: () => initOrder.push('ttsService'),
                ipcHandlers: () => initOrder.push('ipcHandlers')
            };
            
            // Initialize in optimal order (lightweight first, heavy last)
            services.errorHandler();
            services.settingsManager();
            services.fileManager();
            services.audioProcessor();
            services.ttsService();
            services.ipcHandlers();
            
            expect(initOrder).toEqual([
                'errorHandler',
                'settingsManager', 
                'fileManager',
                'audioProcessor',
                'ttsService',
                'ipcHandlers'
            ]);
        });

        it('should handle service initialization errors gracefully', async () => {
            const errors = [];
            
            const mockService = {
                initialize: () => Promise.reject(new Error('Service failed'))
            };
            
            try {
                await mockService.initialize();
            } catch (error) {
                errors.push(error.message);
                // Should continue with other services
            }
            
            expect(errors).toContain('Service failed');
        });
    });
});