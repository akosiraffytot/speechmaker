const { ipcMain, dialog } = require('electron');
const { join } = require('path');
const ErrorHandler = require('../services/errorHandler.js');

/**
 * IPC Handlers Module
 * Centralizes all IPC communication between main and renderer processes
 * Implements secure async communication patterns with proper error handling
 * Requirements: 6.2, 6.3, 5.3
 */
class IPCHandlers {
    constructor(services, mainWindow) {
        this.services = services;
        this.mainWindow = mainWindow;
        this.activeConversions = new Map();
        this.errorHandler = new ErrorHandler();
        
        this.setupHandlers();
    }

    /**
     * Set up all IPC handlers with proper error handling and validation
     */
    setupHandlers() {
        // Settings operations
        this.setupSettingsHandlers();
        
        // TTS operations
        this.setupTTSHandlers();
        
        // File operations
        this.setupFileHandlers();
        
        // System operations
        this.setupSystemHandlers();
    }

    /**
     * Setup settings-related IPC handlers
     */
    setupSettingsHandlers() {
        ipcMain.handle('settings:load', async () => {
            try {
                return await this.services.settingsManager.loadSettings();
            } catch (error) {
                this.handleError('settings:load', error);
                throw this.createSecureError('Failed to load settings', error);
            }
        });

        ipcMain.handle('settings:save', async (event, settings) => {
            try {
                this.validateInput(settings, 'object', 'Settings data is required');
                return await this.services.settingsManager.saveSettings(settings);
            } catch (error) {
                this.handleError('settings:save', error);
                throw this.createSecureError('Failed to save settings', error);
            }
        });

        ipcMain.handle('settings:update', async (event, key, value) => {
            try {
                this.validateInput(key, 'string', 'Setting key is required');
                return await this.services.settingsManager.updateSetting(key, value);
            } catch (error) {
                this.handleError('settings:update', error);
                throw this.createSecureError('Failed to update setting', error);
            }
        });

        ipcMain.handle('settings:reset', async () => {
            try {
                return await this.services.settingsManager.resetSettings();
            } catch (error) {
                this.handleError('settings:reset', error);
                throw this.createSecureError('Failed to reset settings', error);
            }
        });

        ipcMain.handle('settings:getDefaults', () => {
            try {
                return this.services.settingsManager.getDefaultSettings();
            } catch (error) {
                this.handleError('settings:getDefaults', error);
                throw this.createSecureError('Failed to get default settings', error);
            }
        });

        ipcMain.handle('settings:getDefaultOutputFolder', () => {
            try {
                return this.services.settingsManager.getDefaultOutputFolder();
            } catch (error) {
                this.handleError('settings:getDefaultOutputFolder', error);
                throw this.createSecureError('Failed to get default output folder', error);
            }
        });
    }

    /**
     * Setup TTS-related IPC handlers
     */
    setupTTSHandlers() {
        ipcMain.handle('tts:getVoices', async () => {
            try {
                return await this.services.ttsService.getAvailableVoices();
            } catch (error) {
                this.handleError('tts:getVoices', error);
                throw this.createSecureError('Failed to get available voices', error);
            }
        });

        ipcMain.handle('tts:convert', async (event, conversionData) => {
            try {
                this.validateConversionData(conversionData);
                return await this.handleConversionWithRetry(conversionData);
            } catch (error) {
                this.handleError('tts:convert', error);
                
                // If it's already an enhanced error, pass it through
                if (error.userMessage) {
                    throw error;
                }
                
                // Otherwise enhance it
                const enhancedError = await this.errorHandler.handleConversionError(error, conversionData);
                throw enhancedError;
            }
        });

        ipcMain.handle('tts:cancel', async (event, jobId) => {
            try {
                this.validateInput(jobId, 'string', 'Job ID is required');
                return await this.cancelConversion(jobId);
            } catch (error) {
                this.handleError('tts:cancel', error);
                throw this.createSecureError('Failed to cancel conversion', error);
            }
        });

        ipcMain.handle('tts:preview', async (event, previewData) => {
            try {
                this.validatePreviewData(previewData);
                return await this.handleVoicePreview(previewData);
            } catch (error) {
                this.handleError('tts:preview', error);
                throw this.createSecureError('Preview failed', error);
            }
        });

        ipcMain.handle('tts:retryVoiceLoading', async () => {
            try {
                const result = await this.services.ttsService.retryVoiceLoading();
                
                // Send updated voice status to renderer
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    if (result.success) {
                        this.mainWindow.webContents.send('voices:loaded', {
                            voices: result.voices,
                            attempts: result.attempts || 1,
                            success: true
                        });
                    } else {
                        this.mainWindow.webContents.send('voices:load-failed', {
                            error: result.error?.message || 'Retry failed',
                            attempts: result.attempts || 1,
                            troubleshooting: result.troubleshooting || this.services.ttsService.getTroubleshootingSteps(),
                            success: false
                        });
                    }
                }
                
                return result;
            } catch (error) {
                this.handleError('tts:retryVoiceLoading', error);
                
                // Send error to renderer
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('voices:load-failed', {
                        error: error.message,
                        attempts: 1,
                        troubleshooting: this.services.ttsService.getTroubleshootingSteps(),
                        success: false
                    });
                }
                
                throw this.createSecureError('Voice loading retry failed', error);
            }
        });

        ipcMain.handle('tts:getVoiceLoadingState', () => {
            try {
                return this.services.ttsService.getVoiceLoadingState();
            } catch (error) {
                this.handleError('tts:getVoiceLoadingState', error);
                throw this.createSecureError('Failed to get voice loading state', error);
            }
        });

        ipcMain.handle('tts:getTroubleshootingSteps', () => {
            try {
                return this.services.ttsService.getTroubleshootingSteps();
            } catch (error) {
                this.handleError('tts:getTroubleshootingSteps', error);
                throw this.createSecureError('Failed to get troubleshooting steps', error);
            }
        });
    }

    /**
     * Setup file operation IPC handlers
     */
    setupFileHandlers() {
        ipcMain.handle('file:select', async () => {
            try {
                const result = await dialog.showOpenDialog(this.mainWindow, {
                    properties: ['openFile'],
                    filters: [
                        { name: 'Text Files', extensions: ['txt'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (result.canceled || result.filePaths.length === 0) {
                    return null;
                }

                const filePath = result.filePaths[0];
                const content = await this.services.fileManager.readTextFile(filePath);
                const fileName = filePath.split(/[/\\]/).pop();

                return {
                    content,
                    fileName,
                    filePath
                };
            } catch (error) {
                this.handleError('file:select', error);
                throw this.createSecureError('File selection failed', error);
            }
        });

        ipcMain.handle('file:selectFolder', async () => {
            try {
                const result = await dialog.showOpenDialog(this.mainWindow, {
                    properties: ['openDirectory']
                });

                if (result.canceled || result.filePaths.length === 0) {
                    return null;
                }

                const folderPath = result.filePaths[0];
                
                // Validate that the folder is writable
                await this.services.fileManager.validateOutputDirectory(folderPath);

                return { folderPath };
            } catch (error) {
                this.handleError('file:selectFolder', error);
                throw this.createSecureError('Folder selection failed', error);
            }
        });

        ipcMain.handle('file:validate', async (event, filePath) => {
            try {
                this.validateInput(filePath, 'string', 'File path is required');
                return await this.services.fileManager.validateFile(filePath);
            } catch (error) {
                this.handleError('file:validate', error);
                throw this.createSecureError('File validation failed', error);
            }
        });
    }

    /**
     * Setup system operation IPC handlers
     */
    setupSystemHandlers() {
        ipcMain.handle('system:checkFFmpeg', async () => {
            try {
                return await this.services.audioProcessor.validateFFmpegInstallation();
            } catch (error) {
                this.handleError('system:checkFFmpeg', error);
                throw this.createSecureError('FFmpeg check failed', error);
            }
        });

        ipcMain.handle('system:getFFmpegStatus', async () => {
            try {
                return this.services.audioProcessor.getFFmpegStatus();
            } catch (error) {
                this.handleError('system:getFFmpegStatus', error);
                throw this.createSecureError('Failed to get FFmpeg status', error);
            }
        });

        ipcMain.handle('system:initializeFFmpeg', async () => {
            try {
                return await this.services.audioProcessor.initializeFFmpeg();
            } catch (error) {
                this.handleError('system:initializeFFmpeg', error);
                throw this.createSecureError('FFmpeg initialization failed', error);
            }
        });

        ipcMain.handle('system:getInitializationStatus', async () => {
            try {
                // Get current status from all services
                const ffmpegStatus = this.services.audioProcessor.getFFmpegStatus();
                const voiceStatus = this.services.ttsService.getStatus();
                const isReady = voiceStatus.isInitialized && voiceStatus.voiceCount > 0;
                
                return {
                    ffmpeg: ffmpegStatus,
                    voices: {
                        success: voiceStatus.isInitialized,
                        voices: voiceStatus.voiceCount > 0 ? [] : [], // Don't send full voice list here
                        count: voiceStatus.voiceCount,
                        isInitialized: voiceStatus.isInitialized,
                        loadingState: voiceStatus.voiceLoadingState
                    },
                    ready: isReady,
                    timestamp: Date.now()
                };
            } catch (error) {
                this.handleError('system:getInitializationStatus', error);
                throw this.createSecureError('Failed to get initialization status', error);
            }
        });

        ipcMain.handle('system:reinitialize', async () => {
            try {
                // Reinitialize both FFmpeg and voices
                const ffmpegPromise = this.services.audioProcessor.initializeFFmpeg();
                const voicePromise = this.services.ttsService.retryVoiceLoading();
                
                const [ffmpegResult, voiceResult] = await Promise.allSettled([
                    ffmpegPromise,
                    voicePromise
                ]);
                
                const ffmpegStatus = ffmpegResult.status === 'fulfilled' 
                    ? ffmpegResult.value 
                    : { available: false, error: ffmpegResult.reason?.message };
                    
                const voiceStatus = voiceResult.status === 'fulfilled' 
                    ? voiceResult.value 
                    : { success: false, error: voiceResult.reason?.message };
                
                // Send updates to renderer
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('initialization:update', {
                        type: 'reinitialize-complete',
                        data: {
                            ffmpeg: ffmpegStatus,
                            voices: voiceStatus,
                            message: 'Reinitialization complete'
                        },
                        timestamp: Date.now()
                    });
                }
                
                return {
                    success: true,
                    ffmpeg: ffmpegStatus,
                    voices: voiceStatus
                };
            } catch (error) {
                this.handleError('system:reinitialize', error);
                throw this.createSecureError('System reinitialization failed', error);
            }
        });

        ipcMain.handle('system:getVersion', () => {
            try {
                return {
                    app: process.env.npm_package_version || '1.0.0',
                    electron: process.versions.electron,
                    node: process.versions.node
                };
            } catch (error) {
                this.handleError('system:getVersion', error);
                throw this.createSecureError('Failed to get version info', error);
            }
        });

        // Error management handlers
        ipcMain.handle('error:getRecent', async (event, limit = 50) => {
            try {
                return this.errorHandler.getRecentErrors(limit);
            } catch (error) {
                this.handleError('error:getRecent', error);
                throw this.createSecureError('Failed to get recent errors', error);
            }
        });

        ipcMain.handle('error:getStatistics', async () => {
            try {
                return this.errorHandler.getErrorStatistics();
            } catch (error) {
                this.handleError('error:getStatistics', error);
                throw this.createSecureError('Failed to get error statistics', error);
            }
        });

        ipcMain.handle('error:clear', async () => {
            try {
                await this.errorHandler.clearErrorLog();
                return { success: true };
            } catch (error) {
                this.handleError('error:clear', error);
                throw this.createSecureError('Failed to clear error log', error);
            }
        });

        ipcMain.handle('error:resetRetries', async (event, key) => {
            try {
                this.errorHandler.resetRetryAttempts(key);
                return { success: true };
            } catch (error) {
                this.handleError('error:resetRetries', error);
                throw this.createSecureError('Failed to reset retry attempts', error);
            }
        });
    }

    /**
     * Handle text-to-speech conversion with retry mechanism
     */
    async handleConversionWithRetry(conversionData) {
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.handleConversion(conversionData);
            } catch (error) {
                lastError = error;
                
                // If it's a user error (not system error), don't retry
                if (error.suggestedAction === 'add_text' || 
                    error.suggestedAction === 'select_voice' || 
                    error.suggestedAction === 'select_folder') {
                    throw error;
                }
                
                // If we've reached max retries, throw the error
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Wait before retry with exponential backoff
                const delay = 1000 * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Notify UI of retry attempt
                this.sendToRenderer('tts:retry', {
                    jobId: conversionData.id,
                    attempt,
                    maxRetries,
                    delay,
                    error: error.userMessage || error.message
                });
            }
        }
        
        throw lastError;
    }

    /**
     * Handle text-to-speech conversion with optimized progress tracking
     */
    async handleConversion(conversionData) {
        const { id, text, voice, outputFormat, outputPath, speed } = conversionData;
        
        // Store active conversion
        const conversionInfo = { 
            cancelled: false, 
            process: null,
            startTime: Date.now(),
            textLength: text.length
        };
        this.activeConversions.set(id, conversionInfo);

        try {
            // Generate unique output filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `speech_${timestamp}.${outputFormat}`;
            const fullOutputPath = join(outputPath, filename);

            // Set up optimized progress tracking with throttling
            let lastProgressUpdate = 0;
            const progressThrottleMs = 100; // Limit progress updates to 10 per second
            
            const progressHandler = (data) => {
                if (this.activeConversions.get(id)?.cancelled) return;
                
                const now = Date.now();
                if (now - lastProgressUpdate < progressThrottleMs) return;
                lastProgressUpdate = now;
                
                // Calculate overall progress based on phase
                let overallProgress = 10; // Base progress
                if (data.phase === 'converting') {
                    overallProgress = 20 + (data.current / data.total) * 60; // 20-80%
                } else if (data.phase === 'merging') {
                    overallProgress = 85; // 85%
                }
                
                // Use setImmediate for non-blocking progress updates
                setImmediate(() => {
                    this.sendToRenderer('tts:progress', {
                        jobId: id,
                        progress: Math.round(overallProgress),
                        phase: data.message || data.phase || 'Processing...',
                        phaseProgress: data.current && data.total ? Math.round((data.current / data.total) * 100) : 0,
                        memoryOptimized: data.memoryOptimized || false
                    });
                });
            };

            const errorHandler = (error) => {
                this.activeConversions.delete(id);
                setImmediate(() => {
                    this.sendToRenderer('tts:error', {
                        jobId: id,
                        error: error.userMessage || error.message
                    });
                });
            };

            // Attach event listeners
            this.services.ttsService.on('progress', progressHandler);
            this.services.ttsService.on('error', errorHandler);

            // Send initial progress
            this.sendToRenderer('tts:progress', {
                jobId: id,
                progress: 5,
                phase: 'Initializing conversion...'
            });

            // Check if conversion was cancelled before starting
            if (this.activeConversions.get(id)?.cancelled) {
                throw new Error('Conversion was cancelled');
            }

            // Start TTS conversion with async processing
            await this.processConversionAsync(id, text, voice, speed, outputFormat, fullOutputPath);

            // Clean up
            this.activeConversions.delete(id);
            this.services.ttsService.removeListener('progress', progressHandler);
            this.services.ttsService.removeListener('error', errorHandler);

            return { success: true, outputFile: fullOutputPath };

        } catch (error) {
            // Clean up on error
            this.activeConversions.delete(id);
            throw error;
        }
    }

    /**
     * Process conversion asynchronously with optimized performance
     */
    async processConversionAsync(id, text, voice, speed, outputFormat, fullOutputPath) {
        // Yield to event loop before starting intensive work
        await new Promise(resolve => setImmediate(resolve));
        
        this.sendToRenderer('tts:progress', {
            jobId: id,
            progress: 15,
            phase: 'Processing text...'
        });

        let finalOutputPath = fullOutputPath;

        // Convert to WAV first
        const wavPath = fullOutputPath.replace(/\.[^.]+$/, '.wav');
        
        // Update progress for TTS conversion start
        this.sendToRenderer('tts:progress', {
            jobId: id,
            progress: 20,
            phase: 'Generating speech...'
        });
        
        // Check cancellation before intensive operation
        if (this.activeConversions.get(id)?.cancelled) {
            throw new Error('Conversion was cancelled');
        }
        
        await this.services.ttsService.convertTextToSpeech(text, voice, speed, wavPath);

        // Check if conversion was cancelled
        if (this.activeConversions.get(id)?.cancelled) {
            throw new Error('Conversion was cancelled');
        }

        // Convert to MP3 if requested
        if (outputFormat === 'mp3') {
            // Yield to event loop before MP3 conversion
            await new Promise(resolve => setImmediate(resolve));
            
            this.sendToRenderer('tts:progress', {
                jobId: id,
                progress: 85,
                phase: 'Converting to MP3...'
            });

            const mp3Path = fullOutputPath;
            await this.services.audioProcessor.convertWavToMp3(wavPath, mp3Path);

            // Remove temporary WAV file asynchronously
            setImmediate(async () => {
                try {
                    await this.services.fileManager.deleteFile(wavPath);
                } catch (error) {
                    console.warn('Failed to delete temporary WAV file:', error);
                }
            });

            finalOutputPath = mp3Path;
        } else {
            finalOutputPath = wavPath;
        }

        // Final progress update
        this.sendToRenderer('tts:progress', {
            jobId: id,
            progress: 100,
            phase: 'Finalizing output...'
        });

        // Send completion event
        const conversionInfo = this.activeConversions.get(id);
        this.sendToRenderer('tts:complete', {
            jobId: id,
            outputFile: finalOutputPath,
            duration: Date.now() - (conversionInfo?.startTime || 0),
            textLength: conversionInfo?.textLength || 0
        });

        return finalOutputPath;
    }

    /**
     * Cancel an active conversion
     */
    async cancelConversion(jobId) {
        const conversion = this.activeConversions.get(jobId);
        if (conversion) {
            conversion.cancelled = true;

            // If there's an active process, kill it
            if (conversion.process) {
                conversion.process.kill();
            }

            this.activeConversions.delete(jobId);

            this.sendToRenderer('tts:cancelled', { jobId });
            return { success: true };
        }

        return { success: false, error: 'Conversion not found' };
    }

    /**
     * Handle voice speed preview
     */
    async handleVoicePreview(previewData) {
        const { text, voice, speed } = previewData;

        // Create a temporary preview file
        const tempDir = await this.services.fileManager.getTempDirectory();
        const previewPath = join(tempDir, `preview_${Date.now()}.wav`);

        // Convert text to speech with specified speed
        await this.services.ttsService.convertTextToSpeech(text, voice, speed, previewPath);

        // Play the audio file
        await this.services.audioProcessor.playAudioFile(previewPath);

        // Clean up the temporary file after a delay
        setTimeout(async () => {
            try {
                await this.services.fileManager.deleteFile(previewPath);
            } catch (error) {
                console.warn('Failed to delete preview file:', error);
            }
        }, 10000); // Delete after 10 seconds

        return { success: true };
    }

    /**
     * Validate conversion data input
     */
    validateConversionData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Conversion data is required');
        }

        const required = ['id', 'text', 'voice', 'outputFormat', 'outputPath'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`${field} is required`);
            }
        }

        if (typeof data.text !== 'string' || data.text.trim().length === 0) {
            throw new Error('Text content is required');
        }

        if (!['wav', 'mp3'].includes(data.outputFormat)) {
            throw new Error('Output format must be wav or mp3');
        }

        if (data.speed && (data.speed < 0.1 || data.speed > 3.0)) {
            throw new Error('Speed must be between 0.1 and 3.0');
        }
    }

    /**
     * Validate preview data input
     */
    validatePreviewData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Preview data is required');
        }

        if (!data.text || typeof data.text !== 'string') {
            throw new Error('Preview text is required');
        }

        if (!data.voice || typeof data.voice !== 'string') {
            throw new Error('Voice selection is required');
        }

        if (data.speed && (data.speed < 0.1 || data.speed > 3.0)) {
            throw new Error('Speed must be between 0.1 and 3.0');
        }
    }

    /**
     * Validate input parameters
     */
    validateInput(value, expectedType, errorMessage) {
        if (expectedType === 'string' && (!value || typeof value !== 'string')) {
            throw new Error(errorMessage);
        }
        if (expectedType === 'object' && (!value || typeof value !== 'object')) {
            throw new Error(errorMessage);
        }
        if (expectedType === 'number' && (value === undefined || typeof value !== 'number')) {
            throw new Error(errorMessage);
        }
    }

    /**
     * Send message to renderer process with error handling
     */
    sendToRenderer(channel, data) {
        try {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send(channel, data);
            }
        } catch (error) {
            console.error(`Failed to send message to renderer on channel ${channel}:`, error);
        }
    }

    /**
     * Clean up IPC handlers and active conversions
     * Called during application shutdown
     */
    cleanup() {
        try {
            // Cancel all active conversions
            for (const [jobId, conversion] of this.activeConversions) {
                if (conversion.process) {
                    conversion.process.kill();
                }
                conversion.cancelled = true;
            }
            this.activeConversions.clear();
            
            // Remove all IPC handlers
            ipcMain.removeAllListeners();
            
            console.log('IPCHandlers cleanup completed');
        } catch (error) {
            console.error('Error during IPCHandlers cleanup:', error);
        }
    }

    /**
     * Handle and log errors securely
     */
    handleError(operation, error) {
        const errorInfo = {
            operation,
            message: error.message,
            timestamp: new Date().toISOString(),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
        
        console.error('IPC Error:', errorInfo);
        
        // Send error to renderer for user feedback
        this.sendToRenderer('ipc:error', {
            operation,
            message: error.message,
            timestamp: errorInfo.timestamp
        });
    }

    /**
     * Create secure error object for renderer
     */
    createSecureError(message, originalError) {
        const error = new Error(message);
        
        // Only include stack trace in development
        if (process.env.NODE_ENV === 'development') {
            error.originalStack = originalError.stack;
        }
        
        return error;
    }

    /**
     * Clean up resources and remove listeners
     */
    cleanup() {
        // Cancel all active conversions
        for (const [jobId] of this.activeConversions) {
            this.cancelConversion(jobId);
        }

        // Remove all IPC listeners
        ipcMain.removeAllListeners('settings:load');
        ipcMain.removeAllListeners('settings:save');
        ipcMain.removeAllListeners('settings:update');
        ipcMain.removeAllListeners('settings:reset');
        ipcMain.removeAllListeners('settings:getDefaults');
        
        ipcMain.removeAllListeners('tts:getVoices');
        ipcMain.removeAllListeners('tts:convert');
        ipcMain.removeAllListeners('tts:cancel');
        ipcMain.removeAllListeners('tts:preview');
        ipcMain.removeAllListeners('tts:retryVoiceLoading');
        ipcMain.removeAllListeners('tts:getVoiceLoadingState');
        ipcMain.removeAllListeners('tts:getTroubleshootingSteps');
        
        ipcMain.removeAllListeners('file:select');
        ipcMain.removeAllListeners('file:selectFolder');
        ipcMain.removeAllListeners('file:validate');
        
        ipcMain.removeAllListeners('system:checkFFmpeg');
        ipcMain.removeAllListeners('system:getFFmpegStatus');
        ipcMain.removeAllListeners('system:initializeFFmpeg');
        ipcMain.removeAllListeners('system:getInitializationStatus');
        ipcMain.removeAllListeners('system:reinitialize');
        ipcMain.removeAllListeners('system:getVersion');
        
        ipcMain.removeAllListeners('error:getRecent');
        ipcMain.removeAllListeners('error:getStatistics');
        ipcMain.removeAllListeners('error:clear');
        ipcMain.removeAllListeners('error:resetRetries');
    }
}

module.exports = IPCHandlers;