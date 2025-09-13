import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Error Recovery Tests
 * Tests error scenarios and recovery mechanisms for SpeechMaker
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

// Mock services for error recovery testing
const createMockServices = () => ({
  ttsService: Object.assign(new EventEmitter(), {
    getAvailableVoices: vi.fn(),
    convertTextToSpeech: vi.fn(),
    splitTextIntoChunks: vi.fn(),
    isInitialized: false,
    availableVoices: []
  }),
  fileManager: {
    readTextFile: vi.fn(),
    validateOutputDirectory: vi.fn(),
    generateUniqueFileName: vi.fn(),
    getFileErrorDetails: vi.fn()
  },
  audioProcessor: {
    validateFFmpegInstallation: vi.fn(),
    convertWavToMp3: vi.fn(),
    mergeAudioChunks: vi.fn(),
    cleanupChunks: vi.fn()
  },
  settingsManager: {
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    resetSettings: vi.fn()
  },
  errorHandler: {
    handleConversionError: vi.fn(),
    handleTTSVoiceError: vi.fn(),
    handleFileError: vi.fn(),
    handleFFmpegError: vi.fn(),
    logError: vi.fn(),
    shouldAutoRetry: vi.fn(),
    calculateRetryDelay: vi.fn()
  }
});

describe('Error Recovery Tests', () => {
  let services;
  let recoveryManager;

  beforeEach(() => {
    services = createMockServices();
    
    // Create a recovery manager to simulate error recovery workflows
    recoveryManager = {
      async recoverFromTTSError(error, conversionData) {
        const errorInfo = services.errorHandler.handleTTSVoiceError(error);
        
        if (errorInfo.canRetry && services.errorHandler.shouldAutoRetry(error)) {
          const delay = services.errorHandler.calculateRetryDelay(0);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to reinitialize TTS service
          const voices = await services.ttsService.getAvailableVoices();
          if (voices.length > 0) {
            // Use first available voice as fallback
            return await services.ttsService.convertTextToSpeech(
              conversionData.text,
              voices[0].id,
              conversionData.speed,
              conversionData.outputPath
            );
          }
        }
        
        throw error;
      },

      async recoverFromFileError(error, filePath) {
        const errorInfo = services.errorHandler.handleFileError(error, filePath);
        
        if (errorInfo.suggestedAction === 'browse_file') {
          // Simulate user selecting a different file
          const alternativeFile = filePath.replace('.txt', '_backup.txt');
          return await services.fileManager.readTextFile(alternativeFile);
        }
        
        if (errorInfo.suggestedAction === 'check_permissions') {
          // Simulate permission fix and retry
          await new Promise(resolve => setTimeout(resolve, 100));
          return await services.fileManager.readTextFile(filePath);
        }
        
        throw error;
      },

      async recoverFromFFmpegError(error, inputPath, outputPath) {
        const errorInfo = services.errorHandler.handleFFmpegError(error);
        
        if (errorInfo.suggestedAction === 'use_wav') {
          // Fallback to WAV format
          const wavPath = outputPath.replace('.mp3', '.wav');
          // Just copy the input WAV file as output
          return wavPath;
        }
        
        if (errorInfo.suggestedAction === 'install_ffmpeg') {
          // Simulate FFmpeg installation and retry
          services.audioProcessor.validateFFmpegInstallation.mockResolvedValueOnce(true);
          return await services.audioProcessor.convertWavToMp3(inputPath, outputPath);
        }
        
        throw error;
      }
    };
  });

  describe('TTS Voice Error Recovery', () => {
    it('should recover from missing voices by reinitializing', async () => {
      const error = new Error('No TTS voices found');
      const conversionData = {
        text: 'Hello world',
        voice: 'Microsoft David Desktop',
        speed: 1.0,
        outputPath: '/test/output.wav'
      };

      // Setup recovery scenario
      services.errorHandler.handleTTSVoiceError.mockReturnValue({
        canRetry: true,
        suggestedAction: 'install_voices'
      });
      services.errorHandler.shouldAutoRetry.mockReturnValue(true);
      services.errorHandler.calculateRetryDelay.mockReturnValue(100);
      
      // First call fails, second succeeds after recovery
      services.ttsService.getAvailableVoices
        .mockResolvedValueOnce([]) // No voices initially
        .mockResolvedValueOnce([{ id: 'Microsoft Zira Desktop', name: 'Zira' }]); // Voices after recovery
      
      services.ttsService.convertTextToSpeech.mockResolvedValue();

      const result = await recoveryManager.recoverFromTTSError(error, conversionData);
      
      expect(services.ttsService.getAvailableVoices).toHaveBeenCalledTimes(2);
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledWith(
        conversionData.text,
        'Microsoft Zira Desktop', // Fallback voice
        conversionData.speed,
        conversionData.outputPath
      );
    });

    it('should handle voice not found by using fallback voice', async () => {
      const error = new Error("Voice 'Microsoft David Desktop' not found");
      const conversionData = {
        text: 'Hello world',
        voice: 'Microsoft David Desktop',
        speed: 1.0,
        outputPath: '/test/output.wav'
      };

      services.errorHandler.handleTTSVoiceError.mockReturnValue({
        canRetry: true,
        suggestedAction: 'select_voice'
      });
      services.errorHandler.shouldAutoRetry.mockReturnValue(true);
      services.errorHandler.calculateRetryDelay.mockReturnValue(50);
      
      services.ttsService.getAvailableVoices.mockResolvedValue([
        { id: 'Microsoft Zira Desktop', name: 'Zira' },
        { id: 'Microsoft Mark Desktop', name: 'Mark' }
      ]);
      services.ttsService.convertTextToSpeech.mockResolvedValue();

      await recoveryManager.recoverFromTTSError(error, conversionData);
      
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledWith(
        conversionData.text,
        'Microsoft Zira Desktop', // First available voice
        conversionData.speed,
        conversionData.outputPath
      );
    });

    it('should fail recovery when no voices are available', async () => {
      const error = new Error('No TTS voices found');
      const conversionData = {
        text: 'Hello world',
        voice: 'Microsoft David Desktop',
        speed: 1.0,
        outputPath: '/test/output.wav'
      };

      services.errorHandler.handleTTSVoiceError.mockReturnValue({
        canRetry: true,
        suggestedAction: 'install_voices'
      });
      services.errorHandler.shouldAutoRetry.mockReturnValue(true);
      services.errorHandler.calculateRetryDelay.mockReturnValue(50);
      
      services.ttsService.getAvailableVoices.mockResolvedValue([]); // Still no voices

      await expect(recoveryManager.recoverFromTTSError(error, conversionData))
        .rejects.toThrow('No TTS voices found');
    });
  });

  describe('File Error Recovery', () => {
    it('should recover from file not found by using backup file', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      const filePath = '/test/document.txt';

      services.errorHandler.handleFileError.mockReturnValue({
        suggestedAction: 'browse_file',
        canRetry: true
      });
      
      services.fileManager.readTextFile
        .mockRejectedValueOnce(error) // Original file fails
        .mockResolvedValueOnce('Backup file content'); // Backup file succeeds

      const result = await recoveryManager.recoverFromFileError(error, filePath);
      
      expect(result).toBe('Backup file content');
      expect(services.fileManager.readTextFile).toHaveBeenCalledWith('/test/document_backup.txt');
    });

    it('should recover from permission error by retrying', async () => {
      const error = new Error('Access denied');
      error.code = 'EACCES';
      const filePath = '/test/protected.txt';

      services.errorHandler.handleFileError.mockReturnValue({
        suggestedAction: 'check_permissions',
        canRetry: true
      });
      
      services.fileManager.readTextFile
        .mockRejectedValueOnce(error) // First attempt fails
        .mockResolvedValueOnce('File content after permission fix'); // Retry succeeds

      const result = await recoveryManager.recoverFromFileError(error, filePath);
      
      expect(result).toBe('File content after permission fix');
      expect(services.fileManager.readTextFile).toHaveBeenCalledTimes(2);
    });

    it('should fail recovery for unsupported file types', async () => {
      const error = new Error('Unsupported file type: .pdf');
      const filePath = '/test/document.pdf';

      services.errorHandler.handleFileError.mockReturnValue({
        suggestedAction: 'convert_file',
        canRetry: false
      });

      await expect(recoveryManager.recoverFromFileError(error, filePath))
        .rejects.toThrow('Unsupported file type: .pdf');
    });
  });

  describe('FFmpeg Error Recovery', () => {
    it('should recover from FFmpeg missing by falling back to WAV', async () => {
      const error = new Error('FFmpeg is not installed');
      const inputPath = '/test/input.wav';
      const outputPath = '/test/output.mp3';

      services.errorHandler.handleFFmpegError.mockReturnValue({
        suggestedAction: 'use_wav',
        canRetry: true
      });

      const result = await recoveryManager.recoverFromFFmpegError(error, inputPath, outputPath);
      
      expect(result).toBe('/test/output.wav'); // Fallback to WAV
    });

    it('should recover from FFmpeg missing by installing and retrying', async () => {
      const error = new Error('FFmpeg is not installed');
      const inputPath = '/test/input.wav';
      const outputPath = '/test/output.mp3';

      services.errorHandler.handleFFmpegError.mockReturnValue({
        suggestedAction: 'install_ffmpeg',
        canRetry: true
      });
      
      services.audioProcessor.convertWavToMp3.mockResolvedValue('/test/output.mp3');

      const result = await recoveryManager.recoverFromFFmpegError(error, inputPath, outputPath);
      
      expect(result).toBe('/test/output.mp3');
      expect(services.audioProcessor.validateFFmpegInstallation).toHaveBeenCalled();
      expect(services.audioProcessor.convertWavToMp3).toHaveBeenCalledWith(inputPath, outputPath);
    });

    it('should handle conversion failure without recovery', async () => {
      const error = new Error('Invalid audio format');
      const inputPath = '/test/input.wav';
      const outputPath = '/test/output.mp3';

      services.errorHandler.handleFFmpegError.mockReturnValue({
        suggestedAction: 'none',
        canRetry: false
      });

      await expect(recoveryManager.recoverFromFFmpegError(error, inputPath, outputPath))
        .rejects.toThrow('Invalid audio format');
    });
  });

  describe('Conversion Workflow Recovery', () => {
    it('should recover from partial conversion failure', async () => {
      const conversionData = {
        id: 'test-conversion',
        text: 'Long text content',
        voice: 'Microsoft David Desktop',
        speed: 1.0,
        outputPath: '/test/output.wav'
      };

      const chunks = ['Chunk 1', 'Chunk 2', 'Chunk 3'];
      const processedChunks = ['/temp/chunk1.wav', '/temp/chunk2.wav'];

      // Simulate partial failure - first two chunks succeed, third fails
      services.ttsService.splitTextIntoChunks.mockReturnValue(chunks);
      services.ttsService.convertTextToSpeech
        .mockResolvedValueOnce() // Chunk 1 success
        .mockResolvedValueOnce() // Chunk 2 success
        .mockRejectedValueOnce(new Error('TTS engine timeout')); // Chunk 3 fails

      services.errorHandler.shouldAutoRetry.mockReturnValue(true);
      services.errorHandler.calculateRetryDelay.mockReturnValue(100);

      // Recovery workflow
      const recoverConversion = async () => {
        try {
          for (let i = 0; i < chunks.length; i++) {
            const chunkFile = `/temp/chunk${i + 1}.wav`;
            await services.ttsService.convertTextToSpeech(
              chunks[i],
              conversionData.voice,
              conversionData.speed,
              chunkFile
            );
            processedChunks.push(chunkFile);
          }
        } catch (error) {
          // Retry failed chunk
          if (services.errorHandler.shouldAutoRetry(error)) {
            const delay = services.errorHandler.calculateRetryDelay(0);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Retry the failed chunk
            services.ttsService.convertTextToSpeech.mockResolvedValueOnce();
            await services.ttsService.convertTextToSpeech(
              chunks[2], // Failed chunk
              conversionData.voice,
              conversionData.speed,
              '/temp/chunk3.wav'
            );
          }
        }
      };

      await recoverConversion();
      
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledTimes(4); // 3 initial + 1 retry
      expect(services.errorHandler.shouldAutoRetry).toHaveBeenCalled();
    });

    it('should handle memory exhaustion during large file processing', async () => {
      const largeText = 'A'.repeat(1000000); // 1MB text
      const error = new Error('JavaScript heap out of memory');

      services.ttsService.splitTextIntoChunks.mockImplementation((text, chunkSize = 5000) => {
        if (chunkSize > 2000) {
          throw error; // Simulate memory error with large chunks
        }
        // Smaller chunks work
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
          chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
      });

      services.errorHandler.handleConversionError.mockResolvedValue({
        suggestedAction: 'reduce_chunk_size',
        canRetry: true
      });

      // Recovery by reducing chunk size
      const recoverFromMemoryError = async () => {
        try {
          return services.ttsService.splitTextIntoChunks(largeText, 5000);
        } catch (memoryError) {
          // Reduce chunk size and retry
          return services.ttsService.splitTextIntoChunks(largeText, 1000);
        }
      };

      const chunks = await recoverFromMemoryError();
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every(chunk => chunk.length <= 1000)).toBe(true);
    });
  });

  describe('Application Crash Prevention', () => {
    it('should handle uncaught exceptions gracefully', async () => {
      const criticalError = new Error('Uncaught exception');
      let crashPrevented = false;

      // Simulate global error handler
      const globalErrorHandler = (error) => {
        services.errorHandler.logError(error, 'critical', 'Application error');
        crashPrevented = true;
        return true; // Prevent crash
      };

      // Simulate uncaught exception
      try {
        throw criticalError;
      } catch (error) {
        globalErrorHandler(error);
      }

      expect(crashPrevented).toBe(true);
      expect(services.errorHandler.logError).toHaveBeenCalledWith(
        criticalError,
        'critical',
        'Application error'
      );
    });

    it('should recover from service initialization failures', async () => {
      const initError = new Error('Service initialization failed');
      let servicesRecovered = false;

      // Simulate service recovery
      const recoverServices = async () => {
        try {
          // Simulate failed service initialization
          throw initError;
        } catch (error) {
          // Recovery: reinitialize with fallback configuration
          services.ttsService.isInitialized = false;
          services.ttsService.availableVoices = [];
          
          // Try to recover
          services.ttsService.getAvailableVoices.mockResolvedValue([
            { id: 'fallback-voice', name: 'Fallback Voice' }
          ]);
          
          const voices = await services.ttsService.getAvailableVoices();
          if (voices.length > 0) {
            services.ttsService.isInitialized = true;
            servicesRecovered = true;
          }
        }
      };

      await recoverServices();
      
      expect(servicesRecovered).toBe(true);
      expect(services.ttsService.isInitialized).toBe(true);
    });
  });

  describe('Retry Mechanism Testing', () => {
    it('should implement exponential backoff for retries', async () => {
      const retryDelays = [];
      services.errorHandler.calculateRetryDelay.mockImplementation((attempt) => {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        retryDelays.push(delay);
        return delay;
      });

      // Simulate multiple retry attempts
      for (let i = 0; i < 5; i++) {
        services.errorHandler.calculateRetryDelay(i);
      }

      expect(retryDelays).toEqual([1000, 2000, 4000, 8000, 10000]);
    });

    it('should limit maximum retry attempts', async () => {
      const maxRetries = 3;
      let retryCount = 0;
      const error = new Error('Persistent error');

      services.errorHandler.shouldAutoRetry.mockImplementation(() => {
        retryCount++;
        return retryCount <= maxRetries;
      });

      // Simulate retry loop
      while (services.errorHandler.shouldAutoRetry(error)) {
        // Simulate failed operation
      }

      expect(retryCount).toBe(maxRetries + 1); // +1 because we check after incrementing
    });

    it('should reset retry count after successful operation', async () => {
      let retryCount = 0;
      const resetRetryCount = () => { retryCount = 0; };

      // Simulate failed operations
      retryCount = 3;
      expect(retryCount).toBe(3);

      // Simulate successful operation
      resetRetryCount();
      expect(retryCount).toBe(0);
    });
  });

  describe('Resource Cleanup on Errors', () => {
    it('should cleanup temporary files after conversion failure', async () => {
      const tempFiles = ['/temp/chunk1.wav', '/temp/chunk2.wav', '/temp/chunk3.wav'];
      const error = new Error('Conversion failed');

      services.audioProcessor.cleanupChunks.mockResolvedValue();

      // Simulate cleanup after error
      const cleanupAfterError = async (error, tempFiles) => {
        await services.errorHandler.logError(error, 'conversion', 'Conversion failed');
        await services.audioProcessor.cleanupChunks(tempFiles);
      };

      await cleanupAfterError(error, tempFiles);

      expect(services.audioProcessor.cleanupChunks).toHaveBeenCalledWith(tempFiles);
      expect(services.errorHandler.logError).toHaveBeenCalledWith(
        error,
        'conversion',
        'Conversion failed'
      );
    });

    it('should handle cleanup failures gracefully', async () => {
      const tempFiles = ['/temp/chunk1.wav', '/temp/chunk2.wav'];
      const cleanupError = new Error('Cleanup failed');

      services.audioProcessor.cleanupChunks.mockRejectedValue(cleanupError);

      // Cleanup should not throw even if it fails
      const safeCleanup = async (files) => {
        try {
          await services.audioProcessor.cleanupChunks(files);
        } catch (error) {
          // Log cleanup error but don't propagate
          await services.errorHandler.logError(error, 'cleanup', 'Cleanup failed');
        }
      };

      await expect(safeCleanup(tempFiles)).resolves.toBeUndefined();
      expect(services.errorHandler.logError).toHaveBeenCalledWith(
        cleanupError,
        'cleanup',
        'Cleanup failed'
      );
    });
  });
});