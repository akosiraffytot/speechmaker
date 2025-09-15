const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const ErrorHandler = require('./errorHandler.js');

// Import edge-tts library functions (ES module)
let edgeTTS;
let edgeTTSImportPromise;

/**
 * TTS Service for converting text to speech using Microsoft Edge TTS
 * Implements requirements 1.1, 1.2, 1.3, and 2.3
 */
class TTSService extends EventEmitter {
    constructor() {
        super();
        this.availableVoices = [];
        this.maxChunkLength = 5000; // Maximum characters per chunk to prevent memory issues
        this.isInitialized = false;
        this.errorHandler = new ErrorHandler();

        // Voice loading state management
        this.voiceLoadingState = {
            isLoading: false,
            currentAttempt: 0,
            maxAttempts: 3,
            lastError: null,
            retryDelay: 0
        };

        // Initialize edge-tts library
        this.initializeEdgeTTS();
    }

    /**
     * Initialize the edge-tts ES module
     */
    async initializeEdgeTTS() {
        if (!edgeTTSImportPromise) {
            edgeTTSImportPromise = this.importEdgeTTS();
        }
        return edgeTTSImportPromise;
    }

    /**
     * Import edge-tts library using dynamic import for ES modules
     */
    async importEdgeTTS() {
        try {
            // Try to import the compiled JavaScript version first
            edgeTTS = await import('edge-tts/out/index.js');
            console.log('edge-tts library loaded successfully');
            return edgeTTS;
        } catch (error) {
            console.warn('Failed to load edge-tts library:', error.message);
            throw new Error(`edge-tts library not available: ${error.message}`);
        }
    }

    /**
     * Initialize the TTS service and load available voices with retry mechanism
     * Requirement 1.1: Detect and list all available Windows TTS voices
     * Requirement 2.1, 2.2: Use retry mechanism for reliable voice loading
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            const result = await this.loadVoicesWithRetry();

            if (result.success) {
                this.availableVoices = result.voices;
                this.isInitialized = true;
                this.emit('initialized', {
                    voiceCount: result.voices.length,
                    attempts: result.attempt
                });
            } else {
                const enhancedError = this.errorHandler.handleTTSVoiceError(result.error, {
                    operation: 'initialize',
                    attempts: result.attempts,
                    troubleshooting: result.troubleshooting
                });
                this.emit('error', enhancedError);
                throw enhancedError;
            }
        } catch (error) {
            const enhancedError = this.errorHandler.handleTTSVoiceError(error, { operation: 'initialize' });
            this.emit('error', enhancedError);
            throw enhancedError;
        }
    }

    /**
     * Get all available Windows TTS voices
     * Requirement 1.1: System SHALL detect and list all available Windows TTS voices
     */
    async getAvailableVoices() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return this.availableVoices;
    }

    /**
     * Load available voices with retry mechanism and exponential backoff
     * Requirement 2.1, 2.2: Retry voice loading with exponential backoff
     */
    async loadVoicesWithRetry(maxRetries = 3) {
        // Update state management
        this.voiceLoadingState.isLoading = true;
        this.voiceLoadingState.maxAttempts = maxRetries;
        this.voiceLoadingState.currentAttempt = 0;
        this.voiceLoadingState.lastError = null;

        this.emit('voiceLoadingStarted', {
            maxAttempts: maxRetries
        });

        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.voiceLoadingState.currentAttempt = attempt;

            try {
                this.emit('voiceLoadingAttempt', {
                    attempt,
                    maxAttempts: maxRetries
                });

                const voices = await this.loadAvailableVoices();
                if (voices && voices.length > 0) {
                    // Success - reset state
                    this.voiceLoadingState.isLoading = false;
                    this.voiceLoadingState.lastError = null;

                    this.emit('voiceLoadingSuccess', {
                        voiceCount: voices.length,
                        attempt,
                        totalAttempts: maxRetries
                    });

                    return {
                        success: true,
                        voices,
                        attempt,
                        totalAttempts: maxRetries
                    };
                }
            } catch (error) {
                lastError = error;
                this.voiceLoadingState.lastError = error;

                // If this isn't the last attempt, wait before retrying
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                    this.voiceLoadingState.retryDelay = delay;

                    this.emit('voiceLoadRetry', {
                        attempt,
                        maxRetries,
                        delay,
                        error: error.message,
                        nextRetryIn: delay / 1000
                    });

                    await this.sleep(delay);
                }
            }
        }

        // All retries failed - update state
        this.voiceLoadingState.isLoading = false;

        this.emit('voiceLoadingFailed', {
            attempts: maxRetries,
            error: lastError?.message,
            troubleshooting: this.getTroubleshootingSteps()
        });

        return {
            success: false,
            error: lastError,
            attempts: maxRetries,
            troubleshooting: this.getTroubleshootingSteps()
        };
    }

    /**
     * Utility function to sleep for a specified number of milliseconds
     * Used for retry delays with exponential backoff
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get troubleshooting steps for voice loading failures
     * Requirement 2.3, 2.4: Provide user guidance for voice loading issues
     */
    getTroubleshootingSteps() {
        return [
            'Check your internet connection (edge-tts requires online access)',
            'Verify that the edge-tts package is properly installed in node_modules',
            'Restart the application to refresh the TTS service',
            'Check if your firewall or antivirus is blocking network requests',
            'Try running the application as administrator if network issues persist',
            'Ensure you have a stable internet connection to Microsoft\'s TTS service',
            'Check Windows updates and install any pending updates'
        ];
    }

    /**
     * Load available voices from edge-tts library
     * Uses the JavaScript API instead of command line
     */
    async loadAvailableVoices() {
        try {
            // Ensure edge-tts is loaded
            await this.initializeEdgeTTS();

            if (!edgeTTS || !edgeTTS.getVoices) {
                throw new Error('edge-tts library not available or not properly imported');
            }

            const voices = await edgeTTS.getVoices();

            if (!voices || voices.length === 0) {
                throw new Error('No voices returned from edge-tts service');
            }

            this.availableVoices = this.parseVoiceListFromAPI(voices);
            return this.availableVoices;
        } catch (error) {
            const enhancedError = this.errorHandler.handleTTSVoiceError(error, { operation: 'loadVoices' });
            throw enhancedError;
        }
    }

    /**
     * Parse the voice list from edge-tts API response
     */
    parseVoiceListFromAPI(apiVoices) {
        const voices = [];

        for (const apiVoice of apiVoices) {
            try {
                const voice = {
                    id: apiVoice.ShortName || apiVoice.Name,
                    name: apiVoice.FriendlyName || apiVoice.Name,
                    gender: apiVoice.Gender || 'Unknown',
                    language: apiVoice.Locale || 'Unknown',
                    isDefault: false,
                    shortName: apiVoice.ShortName,
                    fullName: apiVoice.Name,
                    categories: apiVoice.VoiceTag?.ContentCategories || [],
                    personalities: apiVoice.VoiceTag?.VoicePersonalities || []
                };

                // Mark first English voice as default
                if (voices.length === 0 && voice.language.startsWith('en')) {
                    voice.isDefault = true;
                }

                voices.push(voice);
            } catch (error) {
                // Skip malformed voice entries
                console.warn('Skipping malformed voice entry:', apiVoice, error);
                continue;
            }
        }

        if (voices.length === 0) {
            const error = new Error('No TTS voices found from edge-tts service.');
            throw this.errorHandler.handleTTSVoiceError(error, { operation: 'parseVoiceList' });
        }

        return voices;
    }

    /**
     * Legacy method for backward compatibility
     * Parse the voice list output from edge-tts CLI (no longer used)
     */
    parseVoiceList(output) {
        // This method is kept for backward compatibility but is no longer used
        // since we're using the JavaScript API instead of CLI
        console.warn('parseVoiceList called - this method is deprecated, use parseVoiceListFromAPI instead');
        return [];
    }

    /**
     * Convert text to speech with specified voice and speed
     * Requirements 1.2, 1.3: Voice selection and Edge TTS usage
     */
    async convertTextToSpeech(text, voiceId, speed = 1.0, outputPath) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }

        if (!voiceId) {
            throw new Error('Voice ID is required');
        }

        if (!outputPath) {
            throw new Error('Output path is required');
        }

        // Validate voice exists
        const voice = this.availableVoices.find(v => v.id === voiceId);
        if (!voice) {
            const error = new Error(`Voice '${voiceId}' not found`);
            throw this.errorHandler.handleTTSVoiceError(error, { operation: 'convertTextToSpeech', voiceId });
        }

        // Validate speed parameter
        if (speed < 0.5 || speed > 2.0) {
            throw new Error('Speed must be between 0.5 and 2.0');
        }

        try {
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.promises.mkdir(outputDir, { recursive: true });

            // Check if text needs chunking for large files
            // Requirement 2.3: Split large files into manageable chunks
            if (text.length > this.maxChunkLength) {
                return await this.convertLargeTextToSpeech(text, voiceId, speed, outputPath);
            } else {
                return await this.convertSingleChunk(text, voiceId, speed, outputPath);
            }
        } catch (error) {
            // If it's already an enhanced error, just re-throw
            if (error.userMessage) {
                this.emit('error', error);
                throw error;
            }

            // Otherwise, enhance the error
            const enhancedError = this.errorHandler.handleTTSVoiceError(error, {
                operation: 'convertTextToSpeech',
                voiceId,
                speed,
                outputPath
            });
            this.emit('error', enhancedError);
            throw enhancedError;
        }
    }

    /**
     * Convert a single chunk of text to speech using edge-tts library
     */
    async convertSingleChunk(text, voiceId, speed, outputPath) {
        try {
            // Ensure edge-tts is loaded
            await this.initializeEdgeTTS();

            if (!edgeTTS || !edgeTTS.ttsSave) {
                throw new Error('edge-tts library not available or not properly imported');
            }

            // Calculate rate parameter for edge-tts (percentage change from normal speed)
            const ratePercent = Math.round((speed - 1.0) * 100);
            const rateParam = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

            const options = {
                voice: voiceId,
                rate: rateParam,
                volume: '+0%',
                pitch: '+0Hz'
            };

            // Use the edge-tts library to save audio directly to file
            await edgeTTS.ttsSave(text, outputPath, options);

            this.emit('conversionComplete', { outputPath, text: text.substring(0, 50) + '...' });
            return outputPath;
        } catch (error) {
            const enhancedError = this.errorHandler.handleTTSVoiceError(error, {
                operation: 'convertSingleChunk',
                voiceId,
                speed,
                outputPath
            });
            throw enhancedError;
        }
    }

    /**
     * Convert large text by splitting into chunks with memory optimization
     * Requirement 2.3: Handle large files by splitting into manageable chunks
     */
    async convertLargeTextToSpeech(text, voiceId, speed, outputPath) {
        const chunks = this.splitTextIntoChunks(text);
        const tempDir = path.join(path.dirname(outputPath), 'temp_chunks');

        try {
            // Create temporary directory for chunks
            await fs.promises.mkdir(tempDir, { recursive: true });

            const chunkPaths = [];
            const totalChunks = chunks.length;
            const maxConcurrentChunks = 3; // Limit concurrent processing for memory optimization

            // Process chunks in batches to optimize memory usage
            for (let batchStart = 0; batchStart < chunks.length; batchStart += maxConcurrentChunks) {
                const batchEnd = Math.min(batchStart + maxConcurrentChunks, chunks.length);
                const batchPromises = [];

                // Process batch of chunks concurrently
                for (let i = batchStart; i < batchEnd; i++) {
                    const chunkPath = path.join(tempDir, `chunk_${i}.wav`);

                    this.emit('progress', {
                        current: i + 1,
                        total: totalChunks,
                        phase: 'converting',
                        message: `Converting chunk ${i + 1} of ${totalChunks}`,
                        memoryOptimized: true
                    });

                    const chunkPromise = this.convertSingleChunk(chunks[i], voiceId, speed, chunkPath)
                        .then(() => {
                            chunkPaths[i] = chunkPath;
                            // Force garbage collection hint for large text processing
                            if (global.gc && chunks[i].length > 2000) {
                                global.gc();
                            }
                        });

                    batchPromises.push(chunkPromise);
                }

                // Wait for current batch to complete before starting next batch
                await Promise.all(batchPromises);

                // Small delay between batches to prevent system overload
                if (batchEnd < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Filter out any undefined paths and sort
            const validChunkPaths = chunkPaths.filter(path => path).sort();

            // Merge chunks into final output with streaming approach
            this.emit('progress', {
                current: totalChunks,
                total: totalChunks,
                phase: 'merging',
                message: 'Merging audio chunks...'
            });

            await this.mergeAudioChunksOptimized(validChunkPaths, outputPath);

            // Clean up temporary files
            await this.cleanupTempFiles(tempDir);

            return outputPath;
        } catch (error) {
            // Clean up on error
            try {
                await this.cleanupTempFiles(tempDir);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Split text into manageable chunks for processing
     * Requirement 2.3: Implement text chunking for large files to prevent memory issues
     */
    splitTextIntoChunks(text, maxLength = this.maxChunkLength) {
        if (text.length <= maxLength) {
            return [text];
        }

        const chunks = [];
        let currentIndex = 0;

        while (currentIndex < text.length) {
            let endIndex = currentIndex + maxLength;

            // If we're not at the end of the text, try to break at a sentence or word boundary
            if (endIndex < text.length) {
                // Look for sentence endings within the last 500 characters of the chunk
                const searchStart = Math.max(currentIndex + maxLength - 500, currentIndex);
                const searchText = text.substring(searchStart, endIndex);

                // Try to find sentence boundary (. ! ?)
                const sentenceMatch = searchText.match(/[.!?]\s+/g);
                if (sentenceMatch) {
                    const lastSentenceEnd = searchText.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
                    if (lastSentenceEnd > 0) {
                        endIndex = searchStart + lastSentenceEnd + sentenceMatch[sentenceMatch.length - 1].length;
                    }
                } else {
                    // Fall back to word boundary
                    const wordBoundary = text.lastIndexOf(' ', endIndex);
                    if (wordBoundary > currentIndex) {
                        endIndex = wordBoundary;
                    }
                }
            }

            chunks.push(text.substring(currentIndex, endIndex).trim());
            currentIndex = endIndex;
        }

        return chunks.filter(chunk => chunk.length > 0);
    }

    /**
     * Merge multiple audio chunks into a single file with memory optimization
     * Uses the audio processor service for proper merging
     */
    async mergeAudioChunks(chunkPaths, outputPath) {
        if (chunkPaths.length === 1) {
            // If only one chunk, just copy it
            await fs.promises.copyFile(chunkPaths[0], outputPath);
            return;
        }

        // Use audio processor for proper merging
        if (this.audioProcessor) {
            await this.audioProcessor.mergeAudioChunks(chunkPaths, outputPath, 'wav');
        } else {
            // Fallback: simple concatenation (basic implementation)
            await fs.promises.copyFile(chunkPaths[0], outputPath);
            this.emit('warning', 'Audio processor not available. Using first chunk only.');
        }
    }

    /**
     * Optimized audio chunk merging for large files
     */
    async mergeAudioChunksOptimized(chunkPaths, outputPath) {
        if (chunkPaths.length === 1) {
            await fs.promises.copyFile(chunkPaths[0], outputPath);
            return;
        }

        if (this.audioProcessor) {
            // Use optimized merging with streaming for large files
            await this.audioProcessor.mergeAudioChunksOptimized(chunkPaths, outputPath, 'wav');
        } else {
            // Fallback to regular merging
            await this.mergeAudioChunks(chunkPaths, outputPath);
        }
    }

    /**
     * Set audio processor reference for chunk merging
     */
    setAudioProcessor(audioProcessor) {
        this.audioProcessor = audioProcessor;
    }

    /**
     * Clean up temporary files and directories
     */
    async cleanupTempFiles(tempDir) {
        try {
            const files = await fs.promises.readdir(tempDir);
            for (const file of files) {
                await fs.promises.unlink(path.join(tempDir, file));
            }
            await fs.promises.rmdir(tempDir);
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Set maximum chunk length for text processing
     */
    setMaxChunkLength(length) {
        if (length < 1000 || length > 10000) {
            throw new Error('Chunk length must be between 1000 and 10000 characters');
        }
        this.maxChunkLength = length;
    }

    /**
     * Get current voice loading state
     * Used for UI state management and user feedback
     */
    getVoiceLoadingState() {
        return {
            ...this.voiceLoadingState,
            troubleshootingSteps: this.getTroubleshootingSteps()
        };
    }

    /**
     * Manually retry voice loading
     * Allows users to retry after initial failure
     */
    async retryVoiceLoading(maxRetries = 3) {
        // Reset initialization state to allow retry
        this.isInitialized = false;
        this.availableVoices = [];

        return await this.initialize();
    }

    /**
     * Get service status and statistics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            voiceCount: this.availableVoices.length,
            maxChunkLength: this.maxChunkLength,
            voiceLoadingState: this.voiceLoadingState
        };
    }

    /**
     * Clean up TTS service resources
     * Called during application shutdown
     */
    cleanup() {
        try {
            // Remove all event listeners
            this.removeAllListeners();

            // Reset initialization state
            this.isInitialized = false;
            this.availableVoices = [];

            // Reset voice loading state
            this.voiceLoadingState = {
                isLoading: false,
                currentAttempt: 0,
                maxAttempts: 3,
                lastError: null,
                retryDelay: 0
            };

            // Clear audio processor reference
            this.audioProcessor = null;

            console.log('TTSService cleanup completed');
        } catch (error) {
            console.error('Error during TTSService cleanup:', error);
        }
    }
}

module.exports = TTSService;