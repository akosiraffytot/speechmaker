
/**
 * Memory Optimization Utilities
 * Reduces memory footprint during startup and operation
 */
class MemoryOptimizer {
    constructor() {
        this.memoryThresholds = {
            warning: 50 * 1024 * 1024,  // 50MB
            critical: 100 * 1024 * 1024  // 100MB
        };
        this.gcInterval = null;
    }
    
    startMemoryMonitoring() {
        // Monitor memory usage and trigger GC when needed
        this.gcInterval = setInterval(() => {
            const usage = process.memoryUsage();
            
            if (usage.heapUsed > this.memoryThresholds.critical) {
                console.warn('High memory usage detected, triggering GC');
                if (global.gc) {
                    global.gc();
                }
            }
        }, 30000); // Check every 30 seconds
    }
    
    stopMemoryMonitoring() {
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
        }
    }
    
    optimizeChunkProcessing(chunks) {
        // Process chunks in smaller batches to reduce memory pressure
        const batchSize = Math.min(chunks.length, 5);
        const batches = [];
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            batches.push(chunks.slice(i, i + batchSize));
        }
        
        return batches;
    }
    
    async processWithMemoryLimit(items, processor, memoryLimit = 50 * 1024 * 1024) {
        const results = [];
        
        for (const item of items) {
            const beforeMemory = process.memoryUsage().heapUsed;
            
            const result = await processor(item);
            results.push(result);
            
            const afterMemory = process.memoryUsage().heapUsed;
            
            // If memory usage is high, trigger GC and wait
            if (afterMemory > memoryLimit && global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }
    
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024),
            rss: Math.round(usage.rss / 1024 / 1024)
        };
    }
}

module.exports = MemoryOptimizer;
