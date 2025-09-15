
/**
 * Optimized Service Initialization Pattern
 * Implements parallel initialization with proper error handling
 */
class OptimizedServiceManager {
    constructor() {
        this.services = new Map();
        this.initializationPromises = new Map();
        this.initializationOrder = ['settings', 'audio', 'tts'];
    }

    async initializeAllServices() {
        const startTime = Date.now();
        
        try {
            // Phase 1: Initialize settings (required by others)
            const settingsManager = new SettingsManager();
            await settingsManager.initialize();
            this.services.set('settings', settingsManager);
            
            // Phase 2: Initialize audio and TTS in parallel
            const parallelPromises = [
                this.initializeAudioProcessor(),
                this.initializeTTSService()
            ];
            
            const [audioProcessor, ttsService] = await Promise.all(parallelPromises);
            
            this.services.set('audio', audioProcessor);
            this.services.set('tts', ttsService);
            
            const totalTime = Date.now() - startTime;
            console.log(`Services initialized in ${totalTime}ms`);
            
            return {
                success: true,
                services: this.services,
                initializationTime: totalTime
            };
            
        } catch (error) {
            console.error('Service initialization failed:', error);
            return {
                success: false,
                error: error.message,
                partialServices: this.services
            };
        }
    }
    
    async initializeAudioProcessor() {
        const audioProcessor = new AudioProcessor();
        
        // Optimize FFmpeg detection with timeout
        const ffmpegPromise = audioProcessor.initializeFFmpeg();
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve({
                available: false,
                source: 'none',
                error: 'Initialization timeout'
            }), 5000);
        });
        
        const ffmpegStatus = await Promise.race([ffmpegPromise, timeoutPromise]);
        return audioProcessor;
    }
    
    async initializeTTSService() {
        const ttsService = new TTSService();
        
        // Optimize voice loading with reduced retry count for startup
        const voiceResult = await ttsService.loadVoicesWithRetry(2);
        return ttsService;
    }
    
    getService(name) {
        return this.services.get(name);
    }
    
    isServiceReady(name) {
        return this.services.has(name);
    }
    
    getAllServices() {
        return Array.from(this.services.values());
    }
}

module.exports = OptimizedServiceManager;
