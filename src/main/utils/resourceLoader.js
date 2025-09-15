
/**
 * Resource Loading Optimizer
 * Optimizes loading of FFmpeg, voices, and other resources
 */
class ResourceLoader {
    constructor() {
        this.cache = new Map();
        this.loadingPromises = new Map();
    }
    
    async loadFFmpegOptimized() {
        const cacheKey = 'ffmpeg-status';
        
        // Return cached result if available
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        // Return existing promise if already loading
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }
        
        // Start new loading process
        const loadingPromise = this.performFFmpegDetection();
        this.loadingPromises.set(cacheKey, loadingPromise);
        
        try {
            const result = await loadingPromise;
            this.cache.set(cacheKey, result);
            return result;
        } finally {
            this.loadingPromises.delete(cacheKey);
        }
    }
    
    async performFFmpegDetection() {
        const startTime = Date.now();
        
        // Try bundled FFmpeg first (fastest)
        const bundledPath = this.getBundledFFmpegPath();
        const bundledCheck = this.quickValidateFFmpeg(bundledPath);
        
        if (await bundledCheck) {
            return {
                available: true,
                source: 'bundled',
                path: bundledPath,
                detectionTime: Date.now() - startTime
            };
        }
        
        // Try system FFmpeg with timeout
        const systemCheck = Promise.race([
            this.detectSystemFFmpeg(),
            new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ]);
        
        const systemPath = await systemCheck;
        if (systemPath && await this.quickValidateFFmpeg(systemPath)) {
            return {
                available: true,
                source: 'system',
                path: systemPath,
                detectionTime: Date.now() - startTime
            };
        }
        
        return {
            available: false,
            source: 'none',
            path: null,
            detectionTime: Date.now() - startTime
        };
    }
    
    async quickValidateFFmpeg(ffmpegPath) {
        // Quick validation without full version check
        try {
            const fs = require('fs').promises;
            await fs.access(ffmpegPath);
            return true;
        } catch {
            return false;
        }
    }
    
    async loadVoicesOptimized() {
        const cacheKey = 'voices-list';
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }
        
        const loadingPromise = this.performVoiceDetection();
        this.loadingPromises.set(cacheKey, loadingPromise);
        
        try {
            const result = await loadingPromise;
            this.cache.set(cacheKey, result);
            return result;
        } finally {
            this.loadingPromises.delete(cacheKey);
        }
    }
    
    async performVoiceDetection() {
        // Implement optimized voice detection with reduced timeout
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Voice detection timeout'));
            }, 5000); // Reduced from default timeout
            
            const process = spawn('edge-tts', ['--list-voices'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            
            process.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            process.on('close', (code) => {
                clearTimeout(timeout);
                
                if (code === 0) {
                    try {
                        const voices = this.parseVoiceList(output);
                        resolve({ success: true, voices });
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error('Voice detection failed'));
                }
            });
            
            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    
    clearCache() {
        this.cache.clear();
        this.loadingPromises.clear();
    }
}

module.exports = ResourceLoader;
