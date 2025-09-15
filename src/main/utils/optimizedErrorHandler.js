
/**
 * Optimized Error Handler
 * Reduces error handling overhead during startup
 */
class OptimizedErrorHandler {
    constructor() {
        this.errorCache = new Map();
        this.suppressedErrors = new Set([
            'ENOENT', // File not found - common during detection
            'EACCES', // Permission denied - handle gracefully
            'ETIMEDOUT' // Timeout errors - expected during detection
        ]);
    }
    
    handleStartupError(error, context = {}) {
        // Quick error classification to avoid expensive processing
        const errorKey = `${error.code || error.name}-${context.operation || 'unknown'}`;
        
        // Return cached error handling if we've seen this before
        if (this.errorCache.has(errorKey)) {
            return this.errorCache.get(errorKey);
        }
        
        let handledError;
        
        // Fast path for common, non-critical errors
        if (this.suppressedErrors.has(error.code)) {
            handledError = {
                severity: 'low',
                userMessage: this.getQuickUserMessage(error.code),
                shouldContinue: true,
                originalError: error
            };
        } else {
            // Full error processing for critical errors
            handledError = this.processComplexError(error, context);
        }
        
        // Cache the result for future occurrences
        this.errorCache.set(errorKey, handledError);
        
        return handledError;
    }
    
    getQuickUserMessage(errorCode) {
        const quickMessages = {
            'ENOENT': 'Resource not found - using fallback',
            'EACCES': 'Permission denied - trying alternative',
            'ETIMEDOUT': 'Operation timed out - continuing with available resources'
        };
        
        return quickMessages[errorCode] || 'Minor issue detected - continuing';
    }
    
    processComplexError(error, context) {
        // More thorough error processing for critical errors
        return {
            severity: 'high',
            userMessage: `Error in ${context.operation || 'startup'}: ${error.message}`,
            shouldContinue: false,
            originalError: error,
            troubleshooting: this.getTroubleshootingSteps(error, context)
        };
    }
    
    getTroubleshootingSteps(error, context) {
        // Provide context-specific troubleshooting
        const steps = [];
        
        if (context.operation === 'ffmpeg') {
            steps.push('Check FFmpeg installation');
            steps.push('Verify file permissions');
        } else if (context.operation === 'voices') {
            steps.push('Check Windows TTS installation');
            steps.push('Verify edge-tts is available');
        }
        
        return steps;
    }
    
    clearCache() {
        this.errorCache.clear();
    }
}

module.exports = OptimizedErrorHandler;
