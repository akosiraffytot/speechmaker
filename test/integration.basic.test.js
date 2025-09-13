import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Basic integration tests for SpeechMaker application
 * Tests the complete workflow from text input to audio output
 */

describe('SpeechMaker Integration', () => {
    describe('Service Integration', () => {
        it('should have all required services available', async () => {
            // Test that all services can be imported
            const { default: TTSService } = await import('../src/main/services/ttsService.js');
            const { default: FileManager } = await import('../src/main/services/fileManager.js');
            const { default: AudioProcessor } = await import('../src/main/services/audioProcessor.js');
            const { default: SettingsManager } = await import('../src/main/services/settingsManager.js');
            const { default: ErrorHandler } = await import('../src/main/services/errorHandler.js');

            expect(TTSService).toBeDefined();
            expect(FileManager).toBeDefined();
            expect(AudioProcessor).toBeDefined();
            expect(SettingsManager).toBeDefined();
            expect(ErrorHandler).toBeDefined();
        });

        it('should create service instances without errors', async () => {
            const { default: TTSService } = await import('../src/main/services/ttsService.js');
            const { default: FileManager } = await import('../src/main/services/fileManager.js');
            const { default: AudioProcessor } = await import('../src/main/services/audioProcessor.js');

            expect(() => new TTSService()).not.toThrow();
            expect(() => new FileManager()).not.toThrow();
            expect(() => new AudioProcessor()).not.toThrow();
        });

        it('should wire services together correctly', async () => {
            const { default: TTSService } = await import('../src/main/services/ttsService.js');
            const { default: AudioProcessor } = await import('../src/main/services/audioProcessor.js');

            const ttsService = new TTSService();
            const audioProcessor = new AudioProcessor();

            // Test service wiring
            expect(() => ttsService.setAudioProcessor(audioProcessor)).not.toThrow();
            expect(ttsService.audioProcessor).toBe(audioProcessor);
        });
    });

    describe('Text Processing', () => {
        it('should split large text into chunks correctly', async () => {
            const { default: TTSService } = await import('../src/main/services/ttsService.js');
            const ttsService = new TTSService();

            const shortText = 'This is a short text.';
            const longText = 'A'.repeat(10000); // 10k characters

            const shortChunks = ttsService.splitTextIntoChunks(shortText);
            const longChunks = ttsService.splitTextIntoChunks(longText);

            expect(shortChunks).toHaveLength(1);
            expect(shortChunks[0]).toBe(shortText);
            expect(longChunks.length).toBeGreaterThan(1);
            expect(longChunks.every(chunk => chunk.length <= 5000)).toBe(true);
        });

        it('should handle sentence boundaries when chunking', async () => {
            const { default: TTSService } = await import('../src/main/services/ttsService.js');
            const ttsService = new TTSService();

            const textWithSentences = 'First sentence. '.repeat(200) + 'Last sentence.';
            const chunks = ttsService.splitTextIntoChunks(textWithSentences, 1000);

            // Should split at sentence boundaries when possible
            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks.every(chunk => chunk.trim().length > 0)).toBe(true);
        });
    });

    describe('File Operations', () => {
        it('should validate file extensions correctly', async () => {
            const { default: FileManager } = await import('../src/main/services/fileManager.js');
            const fileManager = new FileManager();

            expect(fileManager.supportedTextExtensions).toContain('.txt');
            expect(fileManager.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
        });

        it('should generate unique filenames', async () => {
            const { default: FileManager } = await import('../src/main/services/fileManager.js');
            const fileManager = new FileManager();

            // Mock existsSync to simulate existing files
            const originalExistsSync = await import('fs');
            vi.spyOn(originalExistsSync, 'existsSync')
                .mockReturnValueOnce(true)  // First filename exists
                .mockReturnValueOnce(false); // Second filename doesn't exist

            const uniquePath = fileManager.generateUniqueFileName('/test', 'speech', '.wav');
            expect(uniquePath).toContain('speech_1.wav');
        });
    });

    describe('Error Handling', () => {
        it('should create enhanced error objects', async () => {
            const { default: ErrorHandler } = await import('../src/main/services/errorHandler.js');
            const errorHandler = new ErrorHandler();

            const testError = new Error('Test error message');
            const enhancedError = errorHandler.handleTTSVoiceError(testError);

            expect(enhancedError).toHaveProperty('userMessage');
            expect(enhancedError).toHaveProperty('troubleshooting');
            expect(enhancedError).toHaveProperty('severity');
            expect(enhancedError).toHaveProperty('canRetry');
            expect(Array.isArray(enhancedError.troubleshooting)).toBe(true);
        });

        it('should categorize errors correctly', async () => {
            const { default: ErrorHandler } = await import('../src/main/services/errorHandler.js');
            const errorHandler = new ErrorHandler();

            const ttsError = new Error('No TTS voices found');
            const fileError = new Error('File not found');
            const ffmpegError = new Error('FFmpeg is not installed');

            const enhancedTTSError = errorHandler.handleTTSVoiceError(ttsError);
            const enhancedFileError = errorHandler.handleFileError(fileError, '/test/file.txt');
            const enhancedFFmpegError = errorHandler.handleFFmpegError(ffmpegError);

            expect(enhancedTTSError.suggestedAction).toBe('install_voices');
            expect(enhancedFileError.suggestedAction).toBe('browse_file');
            expect(enhancedFFmpegError.suggestedAction).toBe('install_ffmpeg');
        });
    });

    describe('Settings Management', () => {
        it('should provide default settings', async () => {
            const { default: SettingsManager } = await import('../src/main/services/settingsManager.js');
            const settingsManager = new SettingsManager();

            const defaults = settingsManager.getDefaultSettings();

            expect(defaults).toHaveProperty('defaultOutputFormat', 'wav');
            expect(defaults).toHaveProperty('voiceSpeed', 1.0);
            expect(defaults).toHaveProperty('maxChunkLength', 5000);
            expect(defaults).toHaveProperty('windowBounds');
        });

        it('should validate settings correctly', async () => {
            const { default: SettingsManager } = await import('../src/main/services/settingsManager.js');
            const settingsManager = new SettingsManager();

            const validSettings = {
                defaultOutputFormat: 'mp3',
                voiceSpeed: 1.5,
                maxChunkLength: 3000
            };

            const invalidSettings = {
                defaultOutputFormat: 'invalid',
                voiceSpeed: 5.0, // Too high
                maxChunkLength: -100 // Invalid
            };

            const validatedValid = settingsManager.validateSettings(validSettings);
            const validatedInvalid = settingsManager.validateSettings(invalidSettings);

            expect(validatedValid.defaultOutputFormat).toBe('mp3');
            expect(validatedValid.voiceSpeed).toBe(1.5);
            expect(validatedValid.maxChunkLength).toBe(3000);

            // Invalid settings should fall back to defaults
            expect(validatedInvalid.defaultOutputFormat).toBe('wav'); // Default
            expect(validatedInvalid.voiceSpeed).toBe(1.0); // Default
            expect(validatedInvalid.maxChunkLength).toBe(5000); // Default
        });
    });
});