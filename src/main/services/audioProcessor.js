const ffmpeg = require('fluent-ffmpeg');
const { promises: fs } = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const ErrorHandler = require('./errorHandler.js');

const execAsync = promisify(require('child_process').exec);

/**
 * Audio Processor Service
 * Handles audio format conversion and file operations using FFmpeg
 */
class AudioProcessor {
    constructor() {
        this.ffmpegPath = null;
        this.isFFmpegValidated = false;
        this.errorHandler = new ErrorHandler();
        this.ffmpegStatus = {
            available: false,
            source: 'none',
            path: null,
            version: null,
            validated: false,
            error: null
        };
    }

    /**
     * Gets the path to the bundled FFmpeg executable
     * @returns {string} Path to bundled FFmpeg executable
     */
    getBundledFFmpegPath() {
        const platform = process.platform;
        const arch = process.arch;
        
        // Get the app root directory (where resources are located)
        let appRoot;
        if (process.env.NODE_ENV === 'development') {
            appRoot = path.join(__dirname, '../../..');
        } else if (process.resourcesPath) {
            appRoot = process.resourcesPath;
        } else {
            // Fallback for test environments
            appRoot = path.join(__dirname, '../../..');
        }
            
        return path.join(appRoot, 'resources', 'ffmpeg', platform, arch, 'ffmpeg.exe');
    }

    /**
     * Validates FFmpeg executable functionality
     * @param {string} ffmpegPath - Path to FFmpeg executable to validate
     * @returns {Promise<{valid: boolean, version: string|null, error: string|null}>}
     */
    async validateFFmpeg(ffmpegPath) {
        if (!ffmpegPath) {
            return { valid: false, version: null, error: 'No FFmpeg path provided' };
        }

        try {
            // Check if file exists
            await fs.access(ffmpegPath);
            
            // Test FFmpeg functionality by running version command
            const { stdout, stderr } = await execAsync(`"${ffmpegPath}" -version`);
            
            if (stdout && stdout.includes('ffmpeg version')) {
                // Extract version information
                const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
                const version = versionMatch ? versionMatch[1] : 'unknown';
                
                return { valid: true, version, error: null };
            } else {
                return { valid: false, version: null, error: 'FFmpeg version check failed' };
            }
        } catch (error) {
            return { 
                valid: false, 
                version: null, 
                error: `FFmpeg validation failed: ${error.message}` 
            };
        }
    }

    /**
     * Detects system-installed FFmpeg
     * @returns {Promise<string|null>} Path to system FFmpeg or null if not found
     */
    async detectSystemFFmpeg() {
        try {
            const { stdout } = await execAsync('where ffmpeg', { timeout: 5000 });
            const ffmpegPath = stdout.trim().split('\n')[0];
            return ffmpegPath || null;
        } catch (error) {
            // Try alternative detection methods
            try {
                const { stdout } = await execAsync('ffmpeg -version', { timeout: 5000 });
                if (stdout.includes('ffmpeg version')) {
                    return 'ffmpeg'; // Available in PATH
                }
            } catch (pathError) {
                // FFmpeg not found in system
            }
            return null;
        }
    }

    /**
     * Initializes FFmpeg with bundled-first, system-fallback logic
     * @returns {Promise<{available: boolean, source: string, path: string|null, version: string|null, error: string|null}>}
     */
    async initializeFFmpeg() {
        try {
            // Reset status
            this.ffmpegStatus = {
                available: false,
                source: 'none',
                path: null,
                version: null,
                validated: false,
                error: null
            };

            // Try bundled FFmpeg first
            const bundledPath = this.getBundledFFmpegPath();
            const bundledValidation = await this.validateFFmpeg(bundledPath);
            
            if (bundledValidation.valid) {
                this.ffmpegPath = bundledPath;
                this.isFFmpegValidated = true;
                this.ffmpegStatus = {
                    available: true,
                    source: 'bundled',
                    path: bundledPath,
                    version: bundledValidation.version,
                    validated: true,
                    error: null
                };
                
                // Set FFmpeg path for fluent-ffmpeg
                ffmpeg.setFfmpegPath(bundledPath);
                
                return this.ffmpegStatus;
            }

            // Fallback to system FFmpeg
            const systemPath = await this.detectSystemFFmpeg();
            if (systemPath) {
                const systemValidation = await this.validateFFmpeg(systemPath);
                
                if (systemValidation.valid) {
                    this.ffmpegPath = systemPath;
                    this.isFFmpegValidated = true;
                    this.ffmpegStatus = {
                        available: true,
                        source: 'system',
                        path: systemPath,
                        version: systemValidation.version,
                        validated: true,
                        error: null
                    };
                    
                    // Set FFmpeg path for fluent-ffmpeg
                    ffmpeg.setFfmpegPath(systemPath);
                    
                    return this.ffmpegStatus;
                }
            }

            // No FFmpeg available
            this.ffmpegPath = null;
            this.isFFmpegValidated = false;
            this.ffmpegStatus = {
                available: false,
                source: 'none',
                path: null,
                version: null,
                validated: false,
                error: 'No working FFmpeg installation found'
            };

            return this.ffmpegStatus;

        } catch (error) {
            this.ffmpegStatus = {
                available: false,
                source: 'none',
                path: null,
                version: null,
                validated: false,
                error: `FFmpeg initialization failed: ${error.message}`
            };

            return this.ffmpegStatus;
        }
    }

    /**
     * Gets current FFmpeg status
     * @returns {Object} Current FFmpeg status object
     */
    getFFmpegStatus() {
        return { ...this.ffmpegStatus };
    }

    /**
     * Validates FFmpeg installation and availability
     * @returns {Promise<boolean>} True if FFmpeg is available, false otherwise
     */
    async validateFFmpegInstallation() {
        if (this.isFFmpegValidated && this.ffmpegStatus.available) {
            return true;
        }

        // Use the new initialization logic
        const status = await this.initializeFFmpeg();
        return status.available;
    }

    /**
     * Converts WAV file to MP3 format using FFmpeg
     * @param {string} inputPath - Path to input WAV file
     * @param {string} outputPath - Path for output MP3 file
     * @param {Object} options - Conversion options
     * @param {number} options.bitrate - Audio bitrate (default: 128k)
     * @param {number} options.sampleRate - Sample rate (default: 44100)
     * @returns {Promise<string>} Path to converted MP3 file
     */
    async convertWavToMp3(inputPath, outputPath, options = {}) {
        // Validate FFmpeg installation first
        const isFFmpegAvailable = await this.validateFFmpegInstallation();
        if (!isFFmpegAvailable) {
            const error = new Error('FFmpeg is not installed or not available in PATH. Please install FFmpeg to convert to MP3 format.');
            throw this.errorHandler.handleFFmpegError(error, { operation: 'convertWavToMp3', inputPath, outputPath });
        }

        // Validate input file exists
        try {
            await fs.access(inputPath);
        } catch (error) {
            const enhancedError = this.errorHandler.handleFileError(error, inputPath, { operation: 'convertWavToMp3' });
            throw enhancedError;
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        try {
            await fs.mkdir(outputDir, { recursive: true });
        } catch (error) {
            const enhancedError = this.errorHandler.handleFileError(error, outputDir, { operation: 'createOutputDirectory' });
            throw enhancedError;
        }

        const { bitrate = '128k', sampleRate = 44100 } = options;

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('libmp3lame')
                .audioBitrate(bitrate)
                .audioFrequency(sampleRate)
                .format('mp3')
                .on('start', (commandLine) => {
                    console.log('FFmpeg conversion started:', commandLine);
                })
                .on('progress', (progress) => {
                    console.log(`Conversion progress: ${progress.percent}%`);
                })
                .on('end', () => {
                    console.log('MP3 conversion completed successfully');
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('FFmpeg conversion error:', err);
                    const enhancedError = this.errorHandler.handleFFmpegError(err, { 
                        operation: 'mp3Conversion', 
                        inputPath, 
                        outputPath 
                    });
                    reject(enhancedError);
                })
                .save(outputPath);
        });
    }

    /**
     * Merges multiple audio chunks into a single file
     * @param {string[]} chunkPaths - Array of paths to audio chunk files
     * @param {string} outputPath - Path for merged output file
     * @param {string} format - Output format ('wav' or 'mp3')
     * @returns {Promise<string>} Path to merged audio file
     */
    async mergeAudioChunks(chunkPaths, outputPath, format = 'wav') {
        if (!chunkPaths || chunkPaths.length === 0) {
            throw new Error('No audio chunks provided for merging');
        }

        if (chunkPaths.length === 1) {
            // If only one chunk, just copy it to the output path
            try {
                await fs.copyFile(chunkPaths[0], outputPath);
                return outputPath;
            } catch (error) {
                throw new Error(`Failed to copy single chunk: ${error.message}`);
            }
        }

        // Use optimized merging for large numbers of chunks
        if (chunkPaths.length > 10) {
            return this.mergeAudioChunksOptimized(chunkPaths, outputPath, format);
        }

        // Validate all chunk files exist
        for (const chunkPath of chunkPaths) {
            try {
                await fs.access(chunkPath);
            } catch (error) {
                const enhancedError = this.errorHandler.handleFileError(error, chunkPath, { operation: 'mergeAudioChunks' });
                throw enhancedError;
            }
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        try {
            await fs.mkdir(outputDir, { recursive: true });
        } catch (error) {
            const enhancedError = this.errorHandler.handleFileError(error, outputDir, { operation: 'createMergeOutputDirectory' });
            throw enhancedError;
        }

        return new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg();

            // Add all input files
            chunkPaths.forEach(chunkPath => {
                ffmpegCommand.input(chunkPath);
            });

            ffmpegCommand
                .on('start', (commandLine) => {
                    console.log('Audio merging started:', commandLine);
                })
                .on('progress', (progress) => {
                    console.log(`Merging progress: ${progress.percent}%`);
                })
                .on('end', () => {
                    console.log('Audio merging completed successfully');
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('Audio merging error:', err);
                    const enhancedError = this.errorHandler.handleFFmpegError(err, { 
                        operation: 'audioMerging', 
                        chunkPaths, 
                        outputPath 
                    });
                    reject(enhancedError);
                })
                .mergeToFile(outputPath);
        });
    }

    /**
     * Optimized merging for large numbers of audio chunks using batch processing
     * @param {string[]} chunkPaths - Array of paths to audio chunk files
     * @param {string} outputPath - Path for merged output file
     * @param {string} format - Output format ('wav' or 'mp3')
     * @returns {Promise<string>} Path to merged audio file
     */
    async mergeAudioChunksOptimized(chunkPaths, outputPath, format = 'wav') {
        const batchSize = 20; // Process chunks in batches to avoid command line length limits
        const tempDir = path.join(path.dirname(outputPath), 'merge_temp');
        
        try {
            await fs.mkdir(tempDir, { recursive: true });
            
            // Process in batches
            const batchFiles = [];
            for (let i = 0; i < chunkPaths.length; i += batchSize) {
                const batch = chunkPaths.slice(i, i + batchSize);
                const batchOutputPath = path.join(tempDir, `batch_${Math.floor(i / batchSize)}.wav`);
                
                await this.mergeBatch(batch, batchOutputPath);
                batchFiles.push(batchOutputPath);
            }

            // Merge all batch files into final output
            await this.mergeBatch(batchFiles, outputPath);

            // Clean up temporary files
            await this.cleanupTempDirectory(tempDir);

            return outputPath;
        } catch (error) {
            // Clean up on error
            try {
                await this.cleanupTempDirectory(tempDir);
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp directory:', cleanupError);
            }
            throw error;
        }
    }

    /**
     * Merge a batch of audio files
     */
    async mergeBatch(filePaths, outputPath) {
        return new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg();

            filePaths.forEach(filePath => {
                ffmpegCommand.input(filePath);
            });

            ffmpegCommand
                .on('end', () => resolve(outputPath))
                .on('error', reject)
                .mergeToFile(outputPath);
        });
    }

    /**
     * Clean up temporary directory and all files within it
     */
    async cleanupTempDirectory(tempDir) {
        try {
            const files = await fs.readdir(tempDir);
            await Promise.all(files.map(file => 
                fs.unlink(path.join(tempDir, file)).catch(() => {})
            ));
            await fs.rmdir(tempDir);
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Cleans up temporary audio chunk files
     * @param {string[]} chunkPaths - Array of paths to temporary chunk files
     * @returns {Promise<void>}
     */
    async cleanupChunks(chunkPaths) {
        if (!chunkPaths || chunkPaths.length === 0) {
            return;
        }

        const cleanupPromises = chunkPaths.map(async (chunkPath) => {
            try {
                await fs.unlink(chunkPath);
                console.log(`Cleaned up chunk: ${chunkPath}`);
            } catch (error) {
                console.warn(`Failed to cleanup chunk ${chunkPath}:`, error.message);
            }
        });

        await Promise.allSettled(cleanupPromises);
    }

    /**
     * Gets audio file information using FFprobe
     * @param {string} filePath - Path to audio file
     * @returns {Promise<Object>} Audio file metadata
     */
    async getAudioInfo(filePath) {
        try {
            await fs.access(filePath);
        } catch (error) {
            const enhancedError = this.errorHandler.handleFileError(error, filePath, { operation: 'getAudioInfo' });
            throw enhancedError;
        }

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    reject(new Error(`Failed to get audio info: ${err.message}`));
                } else {
                    resolve(metadata);
                }
            });
        });
    }

    /**
     * Validates audio file format and integrity
     * @param {string} filePath - Path to audio file
     * @param {string} expectedFormat - Expected format ('wav' or 'mp3')
     * @returns {Promise<boolean>} True if file is valid
     */
    async validateAudioFile(filePath, expectedFormat) {
        try {
            const metadata = await this.getAudioInfo(filePath);
            const actualFormat = metadata.format.format_name.toLowerCase();
            
            if (expectedFormat === 'wav' && actualFormat.includes('wav')) {
                return true;
            }
            if (expectedFormat === 'mp3' && actualFormat.includes('mp3')) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Audio validation error:', error);
            return false;
        }
    }

    /**
     * Plays an audio file using the system's default audio player
     * @param {string} filePath - Path to audio file to play
     * @returns {Promise<void>}
     */
    async playAudioFile(filePath) {
        try {
            await fs.access(filePath);
        } catch (error) {
            const enhancedError = this.errorHandler.handleFileError(error, filePath, { operation: 'playAudioFile' });
            throw enhancedError;
        }

        return new Promise((resolve, reject) => {
            let command;
            let args;

            // Determine the appropriate command based on the platform
            if (process.platform === 'win32') {
                // Windows: use start command
                command = 'cmd';
                args = ['/c', 'start', '""', `"${filePath}"`];
            } else if (process.platform === 'darwin') {
                // macOS: use afplay
                command = 'afplay';
                args = [filePath];
            } else {
                // Linux: try common audio players
                command = 'aplay';
                args = [filePath];
            }

            const playProcess = spawn(command, args, { 
                stdio: 'pipe',
                shell: process.platform === 'win32'
            });

            playProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Audio playback failed with code ${code}`));
                }
            });

            playProcess.on('error', (error) => {
                reject(new Error(`Failed to play audio: ${error.message}`));
            });

            // Timeout after 10 seconds (for preview purposes)
            setTimeout(() => {
                playProcess.kill();
                resolve(); // Don't reject on timeout for preview
            }, 10000);
        });
    }

    /**
     * Clean up audio processor resources and active processes
     * Called during application shutdown
     */
    cleanup() {
        try {
            // Reset FFmpeg status
            this.ffmpegPath = null;
            this.isFFmpegValidated = false;
            this.ffmpegStatus = {
                available: false,
                source: 'none',
                path: null,
                version: null,
                validated: false,
                error: null
            };
            
            console.log('AudioProcessor cleanup completed');
        } catch (error) {
            console.error('Error during AudioProcessor cleanup:', error);
        }
    }
}

module.exports = AudioProcessor;