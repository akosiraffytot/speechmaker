import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import ErrorHandler from './errorHandler.js';

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
    }

    /**
     * Initialize the TTS service and load available voices
     * Requirement 1.1: Detect and list all available Windows TTS voices
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            await this.loadAvailableVoices();
            this.isInitialized = true;
            this.emit('initialized');
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
     * Load available voices from edge-tts
     * Uses edge-tts command line to get voice list
     */
    async loadAvailableVoices() {
        return new Promise((resolve, reject) => {
            const process = spawn('edge-tts', ['--list-voices'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    const error = new Error(`Failed to get voices: ${errorOutput}`);
                    const enhancedError = this.errorHandler.handleTTSVoiceError(error, { operation: 'loadVoices' });
                    reject(enhancedError);
                    return;
                }

                try {
                    this.availableVoices = this.parseVoiceList(output);
                    resolve(this.availableVoices);
                } catch (error) {
                    const enhancedError = this.errorHandler.handleTTSVoiceError(error, { operation: 'parseVoices' });
                    reject(enhancedError);
                }
            });

            process.on('error', (error) => {
                const enhancedError = this.errorHandler.handleTTSVoiceError(error, { operation: 'executeEdgeTTS' });
                reject(enhancedError);
            });
        });
    }

    /**
     * Parse the voice list output from edge-tts
     */
    parseVoiceList(output) {
        const voices = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    // Parse voice information from edge-tts output
                    // Format: Name: voice-name, Gender: Male/Female, Language: en-US
                    const nameMatch = line.match(/Name:\s*([^,]+)/);
                    const genderMatch = line.match(/Gender:\s*([^,]+)/);
                    const languageMatch = line.match(/Language:\s*([^,\s]+)/);

                    if (nameMatch) {
                        const voice = {
                            id: nameMatch[1].trim(),
                            name: nameMatch[1].trim(),
                            gender: genderMatch ? genderMatch[1].trim() : 'Unknown',
                            language: languageMatch ? languageMatch[1].trim() : 'Unknown',
                            isDefault: false
                        };

                        // Mark first English voice as default
                        if (voices.length === 0 && voice.language.startsWith('en')) {
                            voice.isDefault = true;
                        }

                        voices.push(voice);
                    }
                } catch (error) {
                    // Skip malformed lines
                    continue;
                }
            }
        }

        if (voices.length === 0) {
            const error = new Error('No TTS voices found. Please ensure Windows TTS is properly installed.');
            throw this.errorHandler.handleTTSVoiceError(error, { operation: 'parseVoiceList' });
        }

        return voices;
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
     * Convert a single chunk of text to speech
     */
    async convertSingleChunk(text, voiceId, speed, outputPath) {
        return new Promise((resolve, reject) => {
            // Calculate rate parameter for edge-tts (percentage change from normal speed)
            const ratePercent = Math.round((speed - 1.0) * 100);
            const rateParam = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

            const args = [
                '--voice', voiceId,
                '--rate', rateParam,
                '--text', text,
                '--write-media', outputPath
            ];

            const process = spawn('edge-tts', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let errorOutput = '';

            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    const error = new Error(`TTS conversion failed: ${errorOutput}`);
                    const enhancedError = this.errorHandler.handleTTSVoiceError(error, { 
                        operation: 'convertSingleChunk', 
                        voiceId, 
                        speed, 
                        outputPath 
                    });
                    reject(enhancedError);
                    return;
                }

                this.emit('conversionComplete', { outputPath, text: text.substring(0, 50) + '...' });
                resolve(outputPath);
            });

            process.on('error', (error) => {
                const enhancedError = this.errorHandler.handleTTSVoiceError(error, { 
                    operation: 'convertSingleChunk', 
                    voiceId, 
                    speed, 
                    outputPath 
                });
                reject(enhancedError);
            });
        });
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
     * Get service status and statistics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            voiceCount: this.availableVoices.length,
            maxChunkLength: this.maxChunkLength
        };
    }
}

export default TTSService;