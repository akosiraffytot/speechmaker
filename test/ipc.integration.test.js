import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Integration tests for IPC communication
 * Tests the secure communication patterns between main and renderer processes
 * Requirements: 6.2, 6.3, 5.3
 */

// Mock Electron modules globally before importing IPCHandlers
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeAllListeners: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn()
  }
}));

// Now import IPCHandlers after mocking
const { default: IPCHandlers } = await import('../src/main/ipc/ipcHandlers.js');

// Mock services
const createMockServices = () => ({
  settingsManager: {
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    updateSetting: vi.fn(),
    resetSettings: vi.fn(),
    getDefaultSettings: vi.fn()
  },
  ttsService: new EventEmitter(),
  fileManager: {
    readTextFile: vi.fn(),
    validateOutputDirectory: vi.fn(),
    getTempDirectory: vi.fn(),
    deleteFile: vi.fn(),
    validateFile: vi.fn()
  },
  audioProcessor: {
    validateFFmpegInstallation: vi.fn(),
    convertWavToMp3: vi.fn(),
    playAudioFile: vi.fn()
  }
});

const mockMainWindow = {
  webContents: {
    send: vi.fn()
  },
  isDestroyed: vi.fn(() => false)
};

describe('IPC Handlers Integration Tests', () => {
  let ipcHandlers;
  let mockServices;
  let mockIpcMain;
  let mockDialog;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get mocked modules
    const electron = await import('electron');
    mockIpcMain = electron.ipcMain;
    mockDialog = electron.dialog;
    
    mockServices = createMockServices();
    
    // Add TTS service methods
    mockServices.ttsService.getAvailableVoices = vi.fn();
    mockServices.ttsService.convertTextToSpeech = vi.fn();
    mockServices.ttsService.on = vi.fn();
    mockServices.ttsService.removeListener = vi.fn();
    
    ipcHandlers = new IPCHandlers(mockServices, mockMainWindow);
  });

  afterEach(() => {
    if (ipcHandlers) {
      ipcHandlers.cleanup();
    }
  });

  describe('Settings Operations', () => {
    it('should handle settings:load with proper error handling', async () => {
      const mockSettings = { voiceSpeed: 1.0, defaultOutputFormat: 'wav' };
      mockServices.settingsManager.loadSettings.mockResolvedValue(mockSettings);

      // Get the handler function that was registered
      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'settings:load');
      expect(handlerCall).toBeDefined();
      
      const handler = handlerCall[1];
      const result = await handler();
      
      expect(result).toEqual(mockSettings);
      expect(mockServices.settingsManager.loadSettings).toHaveBeenCalledOnce();
    });

    it('should handle settings:save with validation', async () => {
      const mockSettings = { voiceSpeed: 1.5 };
      mockServices.settingsManager.saveSettings.mockResolvedValue(true);

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'settings:save');
      const handler = handlerCall[1];
      
      const result = await handler(null, mockSettings);
      
      expect(result).toBe(true);
      expect(mockServices.settingsManager.saveSettings).toHaveBeenCalledWith(mockSettings);
    });

    it('should reject invalid settings data', async () => {
      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'settings:save');
      const handler = handlerCall[1];
      
      await expect(handler(null, null)).rejects.toThrow('Settings data is required');
      await expect(handler(null, 'invalid')).rejects.toThrow('Settings data is required');
    });

    it('should handle settings errors securely', async () => {
      const error = new Error('Database connection failed');
      mockServices.settingsManager.loadSettings.mockRejectedValue(error);

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'settings:load');
      const handler = handlerCall[1];
      
      await expect(handler()).rejects.toThrow('Failed to load settings');
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ipc:error', expect.objectContaining({
        operation: 'settings:load',
        message: 'Database connection failed'
      }));
    });
  });

  describe('TTS Operations', () => {
    it('should handle tts:getVoices successfully', async () => {
      const mockVoices = [
        { id: 'voice1', name: 'Voice 1', language: 'en-US' },
        { id: 'voice2', name: 'Voice 2', language: 'en-GB' }
      ];
      mockServices.ttsService.getAvailableVoices.mockResolvedValue(mockVoices);

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:getVoices');
      const handler = handlerCall[1];
      
      const result = await handler();
      
      expect(result).toEqual(mockVoices);
      expect(mockServices.ttsService.getAvailableVoices).toHaveBeenCalledOnce();
    });

    it('should validate conversion data properly', async () => {
      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:convert');
      const handler = handlerCall[1];
      
      // Test missing required fields
      await expect(handler(null, {})).rejects.toThrow('id is required');
      
      await expect(handler(null, { 
        id: 'test', 
        text: '', 
        voice: 'voice1', 
        outputFormat: 'wav', 
        outputPath: '/path' 
      })).rejects.toThrow('Text content is required');
      
      await expect(handler(null, { 
        id: 'test', 
        text: 'Hello world', 
        voice: 'voice1', 
        outputFormat: 'invalid', 
        outputPath: '/path' 
      })).rejects.toThrow('Output format must be wav or mp3');
      
      await expect(handler(null, { 
        id: 'test', 
        text: 'Hello world', 
        voice: 'voice1', 
        outputFormat: 'wav', 
        outputPath: '/path',
        speed: 5.0 
      })).rejects.toThrow('Speed must be between 0.1 and 3.0');
    });

    it('should handle conversion with progress tracking', async () => {
      const conversionData = {
        id: 'test-job',
        text: 'Hello world',
        voice: 'voice1',
        outputFormat: 'wav',
        outputPath: '/output',
        speed: 1.0
      };

      mockServices.ttsService.convertTextToSpeech.mockResolvedValue();
      mockServices.ttsService.on.mockImplementation((event, callback) => {
        if (event === 'progress') {
          // Simulate progress updates
          setTimeout(() => callback({ phase: 'converting', current: 1, total: 2 }), 10);
        }
      });

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:convert');
      const handler = handlerCall[1];
      
      const result = await handler(null, conversionData);
      
      expect(result.success).toBe(true);
      expect(result.outputFile).toContain('/output/speech_');
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('tts:progress', expect.objectContaining({
        jobId: 'test-job',
        progress: 5,
        phase: 'Initializing conversion...'
      }));
    });

    it('should handle conversion cancellation', async () => {
      const jobId = 'test-job';
      
      // First start a conversion to have something to cancel
      ipcHandlers.activeConversions.set(jobId, { 
        cancelled: false, 
        process: null,
        startTime: Date.now()
      });

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:cancel');
      const handler = handlerCall[1];
      
      const result = await handler(null, jobId);
      
      expect(result.success).toBe(true);
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('tts:cancelled', { jobId });
    });

    it('should validate preview data', async () => {
      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:preview');
      const handler = handlerCall[1];
      
      await expect(handler(null, {})).rejects.toThrow('Preview text is required');
      await expect(handler(null, { text: 'Hello' })).rejects.toThrow('Voice selection is required');
      await expect(handler(null, { 
        text: 'Hello', 
        voice: 'voice1', 
        speed: 5.0 
      })).rejects.toThrow('Speed must be between 0.1 and 3.0');
    });
  });

  describe('File Operations', () => {
    it('should handle file selection successfully', async () => {
      const mockFileData = {
        canceled: false,
        filePaths: ['/path/to/file.txt']
      };
      const mockContent = 'File content here';
      
      mockDialog.showOpenDialog.mockResolvedValue(mockFileData);
      mockServices.fileManager.readTextFile.mockResolvedValue(mockContent);

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'file:select');
      const handler = handlerCall[1];
      
      const result = await handler();
      
      expect(result).toEqual({
        content: mockContent,
        fileName: 'file.txt',
        filePath: '/path/to/file.txt'
      });
    });

    it('should handle cancelled file selection', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'file:select');
      const handler = handlerCall[1];
      
      const result = await handler();
      
      expect(result).toBeNull();
    });

    it('should handle folder selection with validation', async () => {
      const mockFolderData = {
        canceled: false,
        filePaths: ['/path/to/folder']
      };
      
      mockDialog.showOpenDialog.mockResolvedValue(mockFolderData);
      mockServices.fileManager.validateOutputDirectory.mockResolvedValue(true);

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'file:selectFolder');
      const handler = handlerCall[1];
      
      const result = await handler();
      
      expect(result).toEqual({ folderPath: '/path/to/folder' });
      expect(mockServices.fileManager.validateOutputDirectory).toHaveBeenCalledWith('/path/to/folder');
    });

    it('should validate file paths', async () => {
      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'file:validate');
      const handler = handlerCall[1];
      
      await expect(handler(null, '')).rejects.toThrow('File path is required');
      await expect(handler(null, null)).rejects.toThrow('File path is required');
    });
  });

  describe('System Operations', () => {
    it('should check FFmpeg availability', async () => {
      mockServices.audioProcessor.validateFFmpegInstallation.mockResolvedValue(true);

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'system:checkFFmpeg');
      const handler = handlerCall[1];
      
      const result = await handler();
      
      expect(result).toBe(true);
      expect(mockServices.audioProcessor.validateFFmpegInstallation).toHaveBeenCalledOnce();
    });

    it('should get version information', async () => {
      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'system:getVersion');
      const handler = handlerCall[1];
      
      const result = await handler();
      
      expect(result).toHaveProperty('app');
      expect(result).toHaveProperty('electron');
      expect(result).toHaveProperty('node');
    });
  });

  describe('Error Handling and Security', () => {
    it('should create secure error objects', () => {
      const originalError = new Error('Internal database error');
      originalError.stack = 'Stack trace here';
      
      const secureError = ipcHandlers.createSecureError('User-friendly message', originalError);
      
      expect(secureError.message).toBe('User-friendly message');
      expect(secureError.originalStack).toBeUndefined(); // Should not expose stack in production
    });

    it('should handle renderer communication errors gracefully', () => {
      mockMainWindow.webContents.send.mockImplementation(() => {
        throw new Error('Renderer communication failed');
      });
      
      // Should not throw when sending to renderer fails
      expect(() => {
        ipcHandlers.sendToRenderer('test:channel', { data: 'test' });
      }).not.toThrow();
    });

    it('should validate input parameters correctly', () => {
      expect(() => {
        ipcHandlers.validateInput('valid string', 'string', 'Error message');
      }).not.toThrow();
      
      expect(() => {
        ipcHandlers.validateInput('', 'string', 'Error message');
      }).toThrow('Error message');
      
      expect(() => {
        ipcHandlers.validateInput({ valid: 'object' }, 'object', 'Error message');
      }).not.toThrow();
      
      expect(() => {
        ipcHandlers.validateInput(null, 'object', 'Error message');
      }).toThrow('Error message');
    });

    it('should handle destroyed window gracefully', () => {
      mockMainWindow.isDestroyed.mockReturnValue(true);
      
      expect(() => {
        ipcHandlers.sendToRenderer('test:channel', { data: 'test' });
      }).not.toThrow();
      
      expect(mockMainWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should clean up active conversions on cleanup', () => {
      const jobId1 = 'job1';
      const jobId2 = 'job2';
      
      ipcHandlers.activeConversions.set(jobId1, { cancelled: false });
      ipcHandlers.activeConversions.set(jobId2, { cancelled: false });
      
      expect(ipcHandlers.activeConversions.size).toBe(2);
      
      ipcHandlers.cleanup();
      
      expect(ipcHandlers.activeConversions.size).toBe(0);
      expect(mockIpcMain.removeAllListeners).toHaveBeenCalledTimes(14); // All IPC channels
    });

    it('should remove all IPC listeners on cleanup', () => {
      ipcHandlers.cleanup();
      
      const expectedChannels = [
        'settings:load', 'settings:save', 'settings:update', 'settings:reset', 'settings:getDefaults',
        'tts:getVoices', 'tts:convert', 'tts:cancel', 'tts:preview',
        'file:select', 'file:selectFolder', 'file:validate',
        'system:checkFFmpeg', 'system:getVersion'
      ];
      
      expectedChannels.forEach(channel => {
        expect(mockIpcMain.removeAllListeners).toHaveBeenCalledWith(channel);
      });
    });
  });

  describe('Async Communication Patterns', () => {
    it('should maintain UI responsiveness during long operations', async () => {
      const conversionData = {
        id: 'long-job',
        text: 'Very long text content that would take time to process',
        voice: 'voice1',
        outputFormat: 'wav',
        outputPath: '/output',
        speed: 1.0
      };

      // Mock a long-running operation
      mockServices.ttsService.convertTextToSpeech.mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 100));
      });

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:convert');
      const handler = handlerCall[1];
      
      const startTime = Date.now();
      const result = await handler(null, conversionData);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
      
      // Verify progress updates were sent to keep UI informed
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('tts:progress', expect.any(Object));
    });

    it('should handle concurrent operations without interference', async () => {
      const job1Data = {
        id: 'job1',
        text: 'First job',
        voice: 'voice1',
        outputFormat: 'wav',
        outputPath: '/output',
        speed: 1.0
      };

      const job2Data = {
        id: 'job2',
        text: 'Second job',
        voice: 'voice2',
        outputFormat: 'mp3',
        outputPath: '/output',
        speed: 1.5
      };

      mockServices.ttsService.convertTextToSpeech.mockResolvedValue();

      const handlerCall = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:convert');
      const handler = handlerCall[1];
      
      // Start both jobs concurrently
      const [result1, result2] = await Promise.all([
        handler(null, job1Data),
        handler(null, job2Data)
      ]);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.outputFile).not.toBe(result2.outputFile);
    });
  });
});