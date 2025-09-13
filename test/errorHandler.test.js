import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ErrorHandler from '../src/main/services/errorHandler.js';
import { app } from 'electron';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
    on: vi.fn(),
    exit: vi.fn(),
    relaunch: vi.fn()
  },
  dialog: {
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 }))
  }
}));

// Mock fs promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  appendFile: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve('[]')),
  access: vi.fn(() => Promise.resolve())
}));

describe('ErrorHandler', () => {
  let errorHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    errorHandler = new ErrorHandler();
    await errorHandler.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TTS Voice Error Handling', () => {
    it('should handle missing TTS voices error', () => {
      const error = new Error('No TTS voices found. Please ensure Windows TTS is properly installed.');
      const result = errorHandler.handleTTSVoiceError(error);

      expect(result.userMessage).toContain('No text-to-speech voices are available');
      expect(result.troubleshooting).toContain('Ensure Windows Speech Platform is installed');
      expect(result.severity).toBe('critical');
      expect(result.suggestedAction).toBe('install_voices');
    });

    it('should handle voice not found error', () => {
      const error = new Error("Voice 'Microsoft David Desktop' not found");
      const result = errorHandler.handleTTSVoiceError(error);

      expect(result.userMessage).toContain('The selected voice "Microsoft David Desktop" is no longer available');
      expect(result.troubleshooting).toContain('Select a different voice from the dropdown');
      expect(result.severity).toBe('warning');
      expect(result.canRetry).toBe(true);
    });

    it('should handle edge-tts execution error', () => {
      const error = new Error('Failed to execute edge-tts: command not found');
      const result = errorHandler.handleTTSVoiceError(error);

      expect(result.userMessage).toContain('The text-to-speech engine is not responding');
      expect(result.troubleshooting).toContain('Restart the application');
      expect(result.severity).toBe('error');
    });
  });

  describe('File Error Handling', () => {
    it('should handle file not found error', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      const result = errorHandler.handleFileError(error, '/path/to/missing.txt');

      expect(result.userMessage).toContain('File not found: missing.txt');
      expect(result.troubleshooting).toContain('Check if the file exists at the specified location');
      expect(result.suggestedAction).toBe('browse_file');
    });

    it('should handle access denied error', () => {
      const error = new Error('Access denied');
      error.code = 'EACCES';
      const result = errorHandler.handleFileError(error, '/path/to/protected.txt');

      expect(result.userMessage).toContain('Access denied: Cannot read protected.txt');
      expect(result.troubleshooting).toContain('Check if the file is open in another application');
      expect(result.suggestedAction).toBe('check_permissions');
    });

    it('should handle directory selected instead of file', () => {
      const error = new Error('Is a directory');
      error.code = 'EISDIR';
      const result = errorHandler.handleFileError(error, '/path/to/directory');

      expect(result.userMessage).toContain('Invalid selection: You selected a folder instead of a file');
      expect(result.troubleshooting).toContain('Please select a .txt file, not a folder');
      expect(result.suggestedAction).toBe('browse_file');
    });

    it('should handle unsupported file type', () => {
      const error = new Error('Unsupported file type: .pdf. Only .txt files are supported.');
      const result = errorHandler.handleFileError(error, '/path/to/document.pdf');

      expect(result.userMessage).toContain('Unsupported file format: document.pdf');
      expect(result.troubleshooting).toContain('Only .txt files are supported');
      expect(result.suggestedAction).toBe('convert_file');
    });

    it('should handle file too large error', () => {
      const error = new Error('File too large: 15.5MB (maximum 10MB)');
      const result = errorHandler.handleFileError(error, '/path/to/large.txt');

      expect(result.userMessage).toContain('File too large: 15.5MB (maximum 10MB)');
      expect(result.troubleshooting).toContain('Split the file into smaller parts');
      expect(result.suggestedAction).toBe('split_file');
    });
  });

  describe('FFmpeg Error Handling', () => {
    it('should handle FFmpeg not installed error', () => {
      const error = new Error('FFmpeg is not installed or not available in PATH. Please install FFmpeg to convert to MP3 format.');
      const result = errorHandler.handleFFmpegError(error);

      expect(result.userMessage).toContain('FFmpeg is required for MP3 conversion but is not installed');
      expect(result.troubleshooting).toContain('Download FFmpeg from https://ffmpeg.org/download.html');
      expect(result.suggestedAction).toBe('install_ffmpeg');
      expect(result.installationGuide).toBeDefined();
      expect(result.installationGuide.steps).toContain('Visit https://ffmpeg.org/download.html');
    });

    it('should handle MP3 conversion failure', () => {
      const error = new Error('MP3 conversion failed: Invalid input format');
      const result = errorHandler.handleFFmpegError(error);

      expect(result.userMessage).toContain('MP3 conversion failed');
      expect(result.troubleshooting).toContain('Try converting to WAV format instead');
      expect(result.suggestedAction).toBe('use_wav');
    });

    it('should handle audio merging failure', () => {
      const error = new Error('Audio merging failed: Insufficient disk space');
      const result = errorHandler.handleFFmpegError(error);

      expect(result.userMessage).toContain('Failed to merge audio chunks');
      expect(result.troubleshooting).toContain('Check if there\'s enough disk space');
      expect(result.suggestedAction).toBe('retry_smaller');
    });
  });

  describe('Conversion Error Handling', () => {
    it('should handle empty text error', async () => {
      const error = new Error('Text cannot be empty');
      const conversionData = { id: 'test-123', text: '', voice: 'test-voice' };
      const result = await errorHandler.handleConversionError(error, conversionData);

      expect(result.userMessage).toContain('No text provided for conversion');
      expect(result.canRetry).toBe(false);
      expect(result.suggestedAction).toBe('add_text');
    });

    it('should handle voice not found during conversion', async () => {
      const error = new Error("Voice 'test-voice' not found");
      const conversionData = { id: 'test-123', text: 'Hello world', voice: 'test-voice' };
      const result = await errorHandler.handleConversionError(error, conversionData);

      expect(result.userMessage).toContain('The selected voice is no longer available');
      expect(result.suggestedAction).toBe('select_voice');
    });

    it('should handle output path error', async () => {
      const error = new Error('Output path is not writable');
      const conversionData = { id: 'test-123', text: 'Hello world', voice: 'test-voice' };
      const result = await errorHandler.handleConversionError(error, conversionData);

      expect(result.userMessage).toContain('Cannot save to the selected output location');
      expect(result.suggestedAction).toBe('select_folder');
    });

    it('should handle conversion cancellation', async () => {
      const error = new Error('Conversion was cancelled');
      const conversionData = { id: 'test-123', text: 'Hello world', voice: 'test-voice' };
      const result = await errorHandler.handleConversionError(error, conversionData);

      expect(result.userMessage).toContain('Conversion was cancelled by user');
      expect(result.canRetry).toBe(false);
      expect(result.suggestedAction).toBe('none');
    });
  });

  describe('Retry Mechanism', () => {
    it('should track retry attempts', async () => {
      const error = new Error('TTS conversion failed');
      const conversionData = { id: 'test-retry', text: 'Hello world', voice: 'test-voice' };
      
      // First attempt
      const result1 = await errorHandler.handleConversionError(error, conversionData);
      expect(result1.retryInfo.attempts).toBe(0);
      
      // Second attempt (would be handled by retry mechanism)
      const result2 = await errorHandler.handleConversionError(error, conversionData);
      expect(result2.retryInfo.attempts).toBe(1);
    });

    it('should calculate exponential backoff delay', () => {
      expect(errorHandler.calculateRetryDelay(0)).toBe(1000);
      expect(errorHandler.calculateRetryDelay(1)).toBe(2000);
      expect(errorHandler.calculateRetryDelay(2)).toBe(4000);
      expect(errorHandler.calculateRetryDelay(3)).toBe(8000);
    });

    it('should identify retryable errors', () => {
      const retryableError = new Error('TTS conversion failed');
      const nonRetryableError = new Error('Text cannot be empty');
      
      expect(errorHandler.shouldAutoRetry(retryableError)).toBe(true);
      expect(errorHandler.shouldAutoRetry(nonRetryableError)).toBe(false);
    });

    it('should reset retry attempts', () => {
      const key = 'test-operation';
      errorHandler.retryAttempts.set(key, 3);
      
      errorHandler.resetRetryAttempts(key);
      expect(errorHandler.retryAttempts.has(key)).toBe(false);
    });
  });

  describe('Error Logging', () => {
    it('should log errors to memory', async () => {
      const error = new Error('Test error');
      await errorHandler.logError(error, 'test_category', 'Test user message');
      
      const recentErrors = errorHandler.getRecentErrors(10);
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0].category).toBe('test_category');
      expect(recentErrors[0].userMessage).toBe('Test user message');
    });

    it('should generate unique error IDs', () => {
      const id1 = errorHandler.generateErrorId();
      const id2 = errorHandler.generateErrorId();
      
      expect(id1).toMatch(/^err_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^err_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should provide error statistics', async () => {
      // Add some test errors
      await errorHandler.logError(new Error('Error 1'), 'tts_voice', 'Message 1');
      await errorHandler.logError(new Error('Error 2'), 'file', 'Message 2');
      await errorHandler.logError(new Error('Error 3'), 'tts_voice', 'Message 3');
      
      const stats = errorHandler.getErrorStatistics();
      expect(stats.total).toBe(3);
      expect(stats.byCategory.tts_voice).toBe(2);
      expect(stats.byCategory.file).toBe(1);
    });

    it('should clear error log', async () => {
      await errorHandler.logError(new Error('Test error'), 'test', 'Test message');
      expect(errorHandler.getRecentErrors()).toHaveLength(1);
      
      await errorHandler.clearErrorLog();
      expect(errorHandler.getRecentErrors()).toHaveLength(0);
    });
  });

  describe('Error Analysis', () => {
    it('should analyze error and extract information', () => {
      const error = new Error('Test error message');
      error.code = 'TEST_CODE';
      
      const analysis = errorHandler.analyzeError(error, 'test_category');
      
      expect(analysis.category).toBe('test_category');
      expect(analysis.message).toBe('Test error message');
      expect(analysis.code).toBe('TEST_CODE');
      expect(analysis.timestamp).toBeDefined();
      expect(analysis.id).toMatch(/^err_\d+_[a-z0-9]+$/);
    });

    it('should extract voice ID from error message', () => {
      const voiceId = errorHandler.extractVoiceIdFromError("Voice 'Microsoft David Desktop' not found");
      expect(voiceId).toBe('Microsoft David Desktop');
      
      const unknownVoice = errorHandler.extractVoiceIdFromError('Generic error message');
      expect(unknownVoice).toBe('Unknown');
    });
  });

  describe('Critical Error Handling', () => {
    it('should handle critical errors without exit', async () => {
      const error = new Error('Critical but non-fatal error');
      
      // Should not throw
      await expect(errorHandler.handleCriticalError('Test Critical', error, false)).resolves.toBeUndefined();
      
      // Should not call app.exit
      expect(app.exit).not.toHaveBeenCalled();
    });

    it('should handle critical errors with exit', async () => {
      const error = new Error('Fatal critical error');
      
      await errorHandler.handleCriticalError('Fatal Error', error, true);
      
      // Should call app.exit
      expect(app.exit).toHaveBeenCalledWith(1);
    });
  });
});