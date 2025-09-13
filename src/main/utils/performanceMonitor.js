/**
 * Performance Monitor Utility
 * Tracks application performance metrics and startup time
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.startTime = Date.now();
        this.isEnabled = process.env.NODE_ENV === 'development' || process.env.ENABLE_PERF_MONITORING;
    }

    /**
     * Mark the start of a performance measurement
     */
    markStart(name) {
        if (!this.isEnabled) return;
        
        this.metrics.set(name, {
            startTime: Date.now(),
            startMemory: process.memoryUsage()
        });
    }

    /**
     * Mark the end of a performance measurement
     */
    markEnd(name) {
        if (!this.isEnabled) return;
        
        const metric = this.metrics.get(name);
        if (!metric) {
            console.warn(`Performance metric '${name}' was not started`);
            return;
        }

        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        
        const result = {
            name,
            duration: endTime - metric.startTime,
            memoryDelta: {
                rss: endMemory.rss - metric.startMemory.rss,
                heapUsed: endMemory.heapUsed - metric.startMemory.heapUsed,
                heapTotal: endMemory.heapTotal - metric.startMemory.heapTotal,
                external: endMemory.external - metric.startMemory.external
            },
            timestamp: endTime
        };

        this.metrics.set(name, result);
        
        // Log performance metrics in development
        if (process.env.NODE_ENV === 'development') {
            console.log(`Performance: ${name} took ${result.duration}ms`);
            if (result.memoryDelta.heapUsed > 1024 * 1024) { // > 1MB
                console.log(`Memory: ${name} used ${Math.round(result.memoryDelta.heapUsed / 1024 / 1024)}MB heap`);
            }
        }

        return result;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        if (!this.isEnabled) return {};
        
        const results = {};
        for (const [name, metric] of this.metrics) {
            if (metric.duration !== undefined) {
                results[name] = metric;
            }
        }
        return results;
    }

    /**
     * Get application startup time
     */
    getStartupTime() {
        return Date.now() - this.startTime;
    }

    /**
     * Log startup performance summary
     */
    logStartupSummary() {
        if (!this.isEnabled) return;
        
        const startupTime = this.getStartupTime();
        const metrics = this.getMetrics();
        
        console.log('\n=== Startup Performance Summary ===');
        console.log(`Total startup time: ${startupTime}ms`);
        
        // Sort metrics by duration
        const sortedMetrics = Object.entries(metrics)
            .sort(([,a], [,b]) => b.duration - a.duration);
        
        console.log('\nSlowest operations:');
        sortedMetrics.slice(0, 5).forEach(([name, metric]) => {
            console.log(`  ${name}: ${metric.duration}ms`);
        });
        
        // Memory usage
        const currentMemory = process.memoryUsage();
        console.log(`\nCurrent memory usage:`);
        console.log(`  RSS: ${Math.round(currentMemory.rss / 1024 / 1024)}MB`);
        console.log(`  Heap Used: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB`);
        console.log(`  Heap Total: ${Math.round(currentMemory.heapTotal / 1024 / 1024)}MB`);
        console.log('=====================================\n');
    }

    /**
     * Monitor memory usage continuously
     */
    startMemoryMonitoring(intervalMs = 30000) {
        if (!this.isEnabled) return;
        
        setInterval(() => {
            const memory = process.memoryUsage();
            const heapUsedMB = Math.round(memory.heapUsed / 1024 / 1024);
            
            // Warn if memory usage is high
            if (heapUsedMB > 200) {
                console.warn(`High memory usage detected: ${heapUsedMB}MB heap used`);
            }
            
            // Suggest garbage collection if memory is very high
            if (heapUsedMB > 500 && global.gc) {
                console.log('Triggering garbage collection due to high memory usage');
                global.gc();
            }
        }, intervalMs);
    }

    /**
     * Create a performance-aware timeout that yields to the event loop
     */
    static createOptimizedTimeout(callback, delay = 0) {
        return setTimeout(() => {
            // Use setImmediate to yield to event loop
            setImmediate(callback);
        }, delay);
    }

    /**
     * Create a performance-aware interval
     */
    static createOptimizedInterval(callback, interval) {
        return setInterval(() => {
            // Use setImmediate to yield to event loop
            setImmediate(callback);
        }, interval);
    }

    /**
     * Batch multiple operations for better performance
     */
    static batchOperations(operations, batchSize = 10) {
        return new Promise((resolve) => {
            let index = 0;
            const results = [];

            function processBatch() {
                const batch = operations.slice(index, index + batchSize);
                
                batch.forEach((operation, i) => {
                    try {
                        results[index + i] = operation();
                    } catch (error) {
                        results[index + i] = error;
                    }
                });

                index += batchSize;

                if (index < operations.length) {
                    // Yield to event loop before processing next batch
                    setImmediate(processBatch);
                } else {
                    resolve(results);
                }
            }

            processBatch();
        });
    }
}

export default PerformanceMonitor;