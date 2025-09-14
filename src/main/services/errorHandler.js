const { app, dialog } = require('electron');
const { promises: fs } = require('fs');
const { join } = require('path');

/**
 * Centralized Error Handler Service
 * Provides comprehensive error handling, user guidance, and recovery mechanisms
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogEntries = 1000;
        this.logFilePath = null;
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second base delay
        
        this.errorCategories = {
            TTS_VOICE_ERROR: 'tts_voice',
            FILE_ERROR: 'file',
            FFMPEG_ERROR: 'ffmpeg',
            CONVERSION_ERROR: 'conversion',
            SYSTEM_ERROR: 'system',
            NETWORK_ERROR: 'network',
            PERMISSION_ERROR: 'permission'
        };

        this.initialize();
    }

    /**
     * Initialize error handler and set up logging
     */
    async initialize() {
        try {
            // Set up error log file path
            const userDataPath = app.getPath('userData');
            this.logFilePath = join(userDataPath, 'error.log');
            
            // Set up global error handlers
            this.setupGlobalErrorHandlers();
            
            // Load existing error log
            await this.loadErrorLog();
        } catch (error) {
            console.error('Failed to initialize error handler:', error);
        }
    }

    /**
     * Set up global error handlers for crash prevention
     * Requirement 5.4: Add application crash prevention and graceful error recovery
     */
    setupGlobalErrorHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.handleCriticalError('Uncaught Exception', error, true);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            this.handleCriticalError('Unhandled Promise Rejection', error, false);
        });

        // Handle Electron renderer process crashes
        app.on('render-process-gone', (event, webContents, details) => {
            const error = new Error(`Renderer process crashed: ${details.reason}`);
            this.handleCriticalError('Renderer Process Crash', error, true);
        });

        // Handle child process errors
        app.on('child-process-gone', (event, details) => {
            const error = new Error(`Child process crashed: ${details.type} - ${details.reason}`);
            this.logError(error, this.errorCategories.SYSTEM_ERROR, 'Child process failure');
        });
    }

    /**
     * Handle TTS voice errors with user guidance
     * Requirement 5.1: Implement error detection for missing TTS voices with user guidance
     */
    handleTTSVoiceError(error, context = {}) {
        const errorInfo = this.analyzeError(error, this.errorCategories.TTS_VOICE_ERROR);
        
        let userMessage = '';
        let troubleshooting = [];
        let severity = 'error';

        if (error.message.includes('No TTS voices found') || error.message.includes('edge-tts')) {
            userMessage = 'No text-to-speech voices are available on your system.';
            troubleshooting = [
                'Ensure Windows Speech Platform is installed',
                'Check Windows Settings > Time & Language > Speech',
                'Install additional voices from Windows Settings > Apps > Optional Features',
                'Restart the application after installing voices',
                'Try running the application as administrator'
            ];
            severity = 'critical';
        } else if (error.message.includes('Voice') && error.message.includes('not found')) {
            const voiceId = this.extractVoiceIdFromError(error.message);
            userMessage = `The selected voice "${voiceId}" is no longer available.`;
            troubleshooting = [
                'The voice may have been uninstalled from your system',
                'Select a different voice from the dropdown',
                'Check Windows Settings > Time & Language > Speech for available voices',
                'Reset voice settings to default in the application settings'
            ];
            severity = 'warning';
        } else if (error.message.includes('Failed to execute edge-tts')) {
            userMessage = 'The text-to-speech engine is not responding.';
            troubleshooting = [
                'Restart the application',
                'Check if Windows Speech service is running',
                'Ensure no other applications are using the TTS engine',
                'Try running the application as administrator',
                'Reinstall the application if the problem persists'
            ];
            severity = 'error';
        } else {
            userMessage = 'An unexpected error occurred with the text-to-speech system.';
            troubleshooting = [
                'Try restarting the application',
                'Check Windows Speech settings',
                'Contact support if the problem persists'
            ];
        }

        const enhancedError = {
            ...errorInfo,
            userMessage,
            troubleshooting,
            severity,
            context,
            canRetry: severity !== 'critical',
            suggestedAction: severity === 'critical' ? 'install_voices' : 'retry'
        };

        this.logError(error, this.errorCategories.TTS_VOICE_ERROR, userMessage, enhancedError);
        return enhancedError;
    }

    /**
     * Handle file validation errors with specific troubleshooting
     * Requirement 5.2: Add file validation errors with specific troubleshooting messages
     */
    handleFileError(error, filePath = '', context = {}) {
        const errorInfo = this.analyzeError(error, this.errorCategories.FILE_ERROR);
        
        let userMessage = '';
        let troubleshooting = [];
        let severity = 'error';
        let suggestedAction = 'retry';

        const errorCode = error.code || '';
        const fileName = filePath ? filePath.split(/[/\\]/).pop() : 'the file';

        switch (errorCode) {
            case 'ENOENT':
                userMessage = `File not found: ${fileName}`;
                troubleshooting = [
                    'Check if the file exists at the specified location',
                    'Verify the file path is correct',
                    'Make sure the file hasn\'t been moved or deleted',
                    'Try browsing for the file again'
                ];
                suggestedAction = 'browse_file';
                break;

            case 'EACCES':
                userMessage = `Access denied: Cannot read ${fileName}`;
                troubleshooting = [
                    'Check if the file is open in another application',
                    'Verify you have permission to read the file',
                    'Try running the application as administrator',
                    'Check if the file is on a network drive with restricted access',
                    'Make sure the file is not corrupted'
                ];
                suggestedAction = 'check_permissions';
                break;

            case 'EISDIR':
                userMessage = 'Invalid selection: You selected a folder instead of a file';
                troubleshooting = [
                    'Please select a .txt file, not a folder',
                    'Navigate into the folder and select a text file',
                    'Use the file browser to select individual files'
                ];
                suggestedAction = 'browse_file';
                break;

            case 'EMFILE':
            case 'ENFILE':
                userMessage = 'Too many files are currently open';
                troubleshooting = [
                    'Close some applications and try again',
                    'Restart the application if the problem persists',
                    'Free up system resources'
                ];
                suggestedAction = 'restart_app';
                break;

            default:
                if (error.message.includes('Unsupported file type')) {
                    userMessage = `Unsupported file format: ${fileName}`;
                    troubleshooting = [
                        'Only .txt files are supported',
                        'Convert your file to .txt format using a text editor',
                        'Copy and paste the text directly into the application',
                        'Save your document as plain text (.txt) format'
                    ];
                    suggestedAction = 'convert_file';
                } else if (error.message.includes('File too large')) {
                    const sizeMatch = error.message.match(/(\d+\.?\d*)\s*MB/);
                    const fileSize = sizeMatch ? sizeMatch[1] : 'unknown';
                    userMessage = `File too large: ${fileSize}MB (maximum 10MB)`;
                    troubleshooting = [
                        'Split the file into smaller parts (under 10MB each)',
                        'Use a text editor to reduce the file size',
                        'Copy and paste smaller portions of text directly',
                        'Remove unnecessary content from the file'
                    ];
                    suggestedAction = 'split_file';
                } else if (error.message.includes('empty')) {
                    userMessage = `File is empty: ${fileName}`;
                    troubleshooting = [
                        'Check if the file contains text content',
                        'Open the file in a text editor to verify content',
                        'Make sure the file is not corrupted',
                        'Try selecting a different file'
                    ];
                    suggestedAction = 'check_content';
                } else {
                    userMessage = `File error: ${error.message}`;
                    troubleshooting = [
                        'Try selecting a different file',
                        'Check if the file is corrupted',
                        'Restart the application',
                        'Contact support if the problem persists'
                    ];
                }
        }

        const enhancedError = {
            ...errorInfo,
            userMessage,
            troubleshooting,
            severity,
            context: { ...context, filePath, fileName },
            canRetry: true,
            suggestedAction
        };

        this.logError(error, this.errorCategories.FILE_ERROR, userMessage, enhancedError);
        return enhancedError;
    }

    /**
     * Handle FFmpeg missing error with installation instructions
     * Requirement 5.3: Create FFmpeg missing error handling with installation instructions
     */
    handleFFmpegError(error, context = {}) {
        const errorInfo = this.analyzeError(error, this.errorCategories.FFMPEG_ERROR);
        
        let userMessage = '';
        let troubleshooting = [];
        let severity = 'warning';
        let suggestedAction = 'install_ffmpeg';

        if (error.message.includes('FFmpeg is not installed') || 
            error.message.includes('ffmpeg') && error.message.includes('not found')) {
            userMessage = 'FFmpeg is required for MP3 conversion but is not installed.';
            troubleshooting = [
                'Download FFmpeg from https://ffmpeg.org/download.html',
                'Extract FFmpeg to a folder (e.g., C:\\ffmpeg)',
                'Add FFmpeg to your system PATH environment variable:',
                '  • Open System Properties > Environment Variables',
                '  • Edit the PATH variable and add the FFmpeg bin folder',
                '  • Restart the application after installation',
                'Alternative: Use WAV format which doesn\'t require FFmpeg',
                'For detailed instructions, visit: https://www.wikihow.com/Install-FFmpeg-on-Windows'
            ];
        } else if (error.message.includes('MP3 conversion failed')) {
            userMessage = 'MP3 conversion failed. The audio file may be corrupted.';
            troubleshooting = [
                'Try converting to WAV format instead',
                'Check if FFmpeg is properly installed and in PATH',
                'Restart the application and try again',
                'Check if there\'s enough disk space',
                'Verify the input audio file is not corrupted'
            ];
            suggestedAction = 'use_wav';
        } else if (error.message.includes('Audio merging failed')) {
            userMessage = 'Failed to merge audio chunks. The conversion may be incomplete.';
            troubleshooting = [
                'Try converting smaller portions of text',
                'Check if there\'s enough disk space',
                'Restart the application and try again',
                'Use WAV format which is more reliable for large files'
            ];
            suggestedAction = 'retry_smaller';
        } else {
            userMessage = 'Audio processing error occurred.';
            troubleshooting = [
                'Check if FFmpeg is properly installed',
                'Try using WAV format instead of MP3',
                'Restart the application',
                'Contact support if the problem persists'
            ];
        }

        const enhancedError = {
            ...errorInfo,
            userMessage,
            troubleshooting,
            severity,
            context,
            canRetry: suggestedAction !== 'install_ffmpeg',
            suggestedAction,
            installationGuide: {
                title: 'FFmpeg Installation Guide',
                steps: [
                    'Visit https://ffmpeg.org/download.html',
                    'Download the Windows build (static version recommended)',
                    'Extract to C:\\ffmpeg (or your preferred location)',
                    'Add C:\\ffmpeg\\bin to your system PATH',
                    'Restart SpeechMaker application',
                    'Test MP3 conversion'
                ]
            }
        };

        this.logError(error, this.errorCategories.FFMPEG_ERROR, userMessage, enhancedError);
        return enhancedError;
    }

    /**
     * Handle conversion failures with retry mechanisms
     * Requirement 5.3: Implement conversion failure recovery and retry mechanisms
     */
    async handleConversionError(error, conversionData, context = {}) {
        const errorInfo = this.analyzeError(error, this.errorCategories.CONVERSION_ERROR);
        const jobId = conversionData?.id || 'unknown';
        
        // Check retry attempts
        const retryKey = `conversion_${jobId}`;
        const attempts = this.retryAttempts.get(retryKey) || 0;
        
        let userMessage = '';
        let troubleshooting = [];
        let severity = 'error';
        let canRetry = attempts < this.maxRetries;
        let suggestedAction = canRetry ? 'retry' : 'manual_intervention';

        if (error.message.includes('Text cannot be empty')) {
            userMessage = 'No text provided for conversion.';
            troubleshooting = [
                'Enter text in the input area or select a text file',
                'Make sure the selected file contains readable text',
                'Check if the file encoding is supported (UTF-8 recommended)'
            ];
            canRetry = false;
            suggestedAction = 'add_text';
        } else if (error.message.includes('Voice') && error.message.includes('not found')) {
            userMessage = 'The selected voice is no longer available.';
            troubleshooting = [
                'Select a different voice from the dropdown',
                'Refresh the voice list',
                'Check Windows Speech settings for available voices'
            ];
            suggestedAction = 'select_voice';
        } else if (error.message.includes('TTS conversion failed')) {
            userMessage = 'Text-to-speech conversion failed.';
            troubleshooting = [
                'Try with a shorter text sample',
                'Check if the selected voice is working properly',
                'Restart the application and try again',
                'Try a different voice if available'
            ];
        } else if (error.message.includes('Output path')) {
            userMessage = 'Cannot save to the selected output location.';
            troubleshooting = [
                'Check if the output folder exists and is writable',
                'Select a different output folder',
                'Make sure you have permission to write to the location',
                'Check if there\'s enough disk space'
            ];
            suggestedAction = 'select_folder';
        } else if (error.message.includes('Conversion was cancelled')) {
            userMessage = 'Conversion was cancelled by user.';
            troubleshooting = ['Start a new conversion when ready'];
            canRetry = false;
            suggestedAction = 'none';
        } else {
            userMessage = 'Conversion failed due to an unexpected error.';
            troubleshooting = [
                'Try with a shorter text sample',
                'Check system resources (memory, disk space)',
                'Restart the application',
                'Try a different output format'
            ];
        }

        const enhancedError = {
            ...errorInfo,
            userMessage,
            troubleshooting,
            severity,
            context: { ...context, conversionData, attempts },
            canRetry,
            suggestedAction,
            retryInfo: {
                attempts,
                maxRetries: this.maxRetries,
                nextRetryDelay: this.calculateRetryDelay(attempts)
            }
        };

        this.logError(error, this.errorCategories.CONVERSION_ERROR, userMessage, enhancedError);

        // Implement automatic retry for certain errors
        if (canRetry && this.shouldAutoRetry(error)) {
            return await this.attemptRetry(retryKey, conversionData, enhancedError);
        }

        return enhancedError;
    }

    /**
     * Attempt automatic retry with exponential backoff
     */
    async attemptRetry(retryKey, conversionData, errorInfo) {
        const attempts = this.retryAttempts.get(retryKey) || 0;
        this.retryAttempts.set(retryKey, attempts + 1);

        const delay = this.calculateRetryDelay(attempts);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        return {
            ...errorInfo,
            isRetrying: true,
            retryDelay: delay,
            retryAttempt: attempts + 1
        };
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    calculateRetryDelay(attempts) {
        return this.retryDelay * Math.pow(2, attempts);
    }

    /**
     * Determine if error should trigger automatic retry
     */
    shouldAutoRetry(error) {
        const retryableErrors = [
            'TTS conversion failed',
            'Audio processing failed',
            'Temporary file error',
            'Network timeout'
        ];

        return retryableErrors.some(pattern => 
            error.message.includes(pattern)
        );
    }

    /**
     * Handle critical errors that could crash the application
     */
    async handleCriticalError(type, error, shouldExit = false) {
        const errorInfo = {
            type,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            shouldExit
        };

        // Log to console and file
        console.error('CRITICAL ERROR:', errorInfo);
        await this.logCriticalError(errorInfo);

        // Show user dialog for critical errors
        if (shouldExit) {
            const response = await dialog.showMessageBox(null, {
                type: 'error',
                title: 'Critical Error',
                message: 'A critical error has occurred and the application needs to restart.',
                detail: `Error: ${error.message}\n\nThe application will now close. Please restart it to continue.`,
                buttons: ['Restart Application', 'Close'],
                defaultId: 0
            });

            if (response.response === 0) {
                // Restart application
                app.relaunch();
            }
            
            app.exit(1);
        } else {
            // Non-fatal critical error - log and continue
            this.logError(error, this.errorCategories.SYSTEM_ERROR, 'Critical system error occurred');
        }
    }

    /**
     * Analyze error and extract useful information
     */
    analyzeError(error, category) {
        return {
            id: this.generateErrorId(),
            timestamp: new Date().toISOString(),
            category,
            message: error.message,
            code: error.code || null,
            stack: process.env.NODE_ENV === 'development' ? error.stack : null,
            platform: process.platform,
            nodeVersion: process.version,
            electronVersion: process.versions.electron
        };
    }

    /**
     * Extract voice ID from error message
     */
    extractVoiceIdFromError(message) {
        const match = message.match(/Voice '([^']+)' not found/);
        return match ? match[1] : 'Unknown';
    }

    /**
     * Log error to memory and file
     */
    async logError(error, category, userMessage, additionalInfo = {}) {
        const logEntry = {
            id: this.generateErrorId(),
            timestamp: new Date().toISOString(),
            category,
            error: {
                message: error.message,
                code: error.code || null,
                stack: error.stack
            },
            userMessage,
            additionalInfo
        };

        // Add to memory log
        this.errorLog.push(logEntry);
        
        // Trim log if too large
        if (this.errorLog.length > this.maxLogEntries) {
            this.errorLog = this.errorLog.slice(-this.maxLogEntries);
        }

        // Write to file
        await this.writeToLogFile(logEntry);
    }

    /**
     * Log critical errors to file
     */
    async logCriticalError(errorInfo) {
        const logEntry = {
            id: this.generateErrorId(),
            timestamp: errorInfo.timestamp,
            category: 'CRITICAL',
            type: errorInfo.type,
            error: {
                message: errorInfo.message,
                stack: errorInfo.stack
            },
            shouldExit: errorInfo.shouldExit
        };

        await this.writeToLogFile(logEntry);
    }

    /**
     * Write log entry to file
     */
    async writeToLogFile(logEntry) {
        if (!this.logFilePath) return;

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.logFilePath, logLine, 'utf8');
        } catch (error) {
            console.error('Failed to write to error log:', error);
        }
    }

    /**
     * Load existing error log from file
     */
    async loadErrorLog() {
        if (!this.logFilePath) return;

        try {
            const logContent = await fs.readFile(this.logFilePath, 'utf8');
            const lines = logContent.trim().split('\n').filter(line => line);
            
            this.errorLog = lines.slice(-this.maxLogEntries).map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(entry => entry !== null);
        } catch (error) {
            // Log file doesn't exist or is corrupted - start fresh
            this.errorLog = [];
        }
    }

    /**
     * Generate unique error ID
     */
    generateErrorId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get recent errors for debugging
     */
    getRecentErrors(limit = 50) {
        return this.errorLog.slice(-limit);
    }

    /**
     * Clear error log
     */
    async clearErrorLog() {
        this.errorLog = [];
        if (this.logFilePath) {
            try {
                await fs.writeFile(this.logFilePath, '', 'utf8');
            } catch (error) {
                console.error('Failed to clear error log file:', error);
            }
        }
    }

    /**
     * Reset retry attempts for a specific operation
     */
    resetRetryAttempts(key) {
        this.retryAttempts.delete(key);
    }

    /**
     * Get error statistics
     */
    getErrorStatistics() {
        const stats = {
            total: this.errorLog.length,
            byCategory: {},
            recent24h: 0,
            criticalErrors: 0
        };

        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        this.errorLog.forEach(entry => {
            // Count by category
            stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
            
            // Count recent errors
            if (new Date(entry.timestamp).getTime() > oneDayAgo) {
                stats.recent24h++;
            }
            
            // Count critical errors
            if (entry.category === 'CRITICAL') {
                stats.criticalErrors++;
            }
        });

        return stats;
    }
}

module.exports = ErrorHandler;