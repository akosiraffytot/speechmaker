import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Basic IPC functionality test
 * Verifies that the IPC handlers are properly set up and working
 */

// Mock Electron modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeAllListeners: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn()
  }
}));

const { default: IPCHandlers } = await import('../src/main/ipc/ipcHandlers.js');

describe('IPC Basic Functionality', () => {
  let ipcHandlers;
  let mockServices;
  let mockMainWindow;
  let mockIpcMain;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const electron = await import('electron');
    mockIpcMain = electron.ipcMain;
    
    mockServices = {
      settingsManager: {
        loadSettings: vi.fn().mockResolvedValue({ voiceSpeed: 1.0 }),
        saveSettings: vi.fn().mockResolvedValue(true),
        updateSetting: vi.fn().mockResolvedValue(true),
        resetSettings: vi.fn().mockResolvedValue(true),
        getDefaultSettings: vi.fn().mockReturnValue({ voiceSpeed: 1.0 })
      },
      ttsService: {
        getAvailableVoices: vi.fn().mockResolvedValue([]),
        convertTextToSpeech: vi.fn().mockResolvedValue(),
        on: vi.fn(),
        removeListener: vi.fn()
      },
      fileManager: {
        readTextFile: vi.fn().mockResolvedValue('test content'),
        validateOutputDirectory: vi.fn().mockResolvedValue(true),
        getTempDirectory: vi.fn().mockResolvedValue('/tmp'),
        deleteFile: vi.fn().mockResolvedValue(),
        validateFile: vi.fn().mockResolvedValue(true)
      },
      audioProcessor: {
        validateFFmpegInstallation: vi.fn().mockResolvedValue(true),
        convertWavToMp3: vi.fn().mockResolvedValue(),
        playAudioFile: vi.fn().mockResolvedValue()
      }
    };

    mockMainWindow = {
      webContents: {
        send: vi.fn()
      },
      isDestroyed: vi.fn(() => false)
    };
    
    ipcHandlers = new IPCHandlers(mockServices, mockMainWindow);
  });

  it('should register all required IPC handlers', () => {
    const expectedChannels = [
      'settings:load', 'settings:save', 'settings:update', 'settings:reset', 'settings:getDefaults',
      'tts:getVoices', 'tts:convert', 'tts:cancel', 'tts:preview',
      'file:select', 'file:selectFolder', 'file:validate',
      'system:checkFFmpeg', 'system:getVersion'
    ];

    expect(mockIpcMain.handle).toHaveBeenCalledTimes(expectedChannels.length);
    
    expectedChannels.forEach(channel => {
      expect(mockIpcMain.handle).toHaveBeenCalledWith(channel, expect.any(Function));
    });
  });

  it('should handle settings operations successfully', async () => {
    const settingsLoadHandler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'settings:load')[1];
    const result = await settingsLoadHandler();
    
    expect(result).toEqual({ voiceSpeed: 1.0 });
    expect(mockServices.settingsManager.loadSettings).toHaveBeenCalledOnce();
  });

  it('should handle TTS operations successfully', async () => {
    const ttsVoicesHandler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'tts:getVoices')[1];
    const result = await ttsVoicesHandler();
    
    expect(result).toEqual([]);
    expect(mockServices.ttsService.getAvailableVoices).toHaveBeenCalledOnce();
  });

  it('should handle system operations successfully', async () => {
    const ffmpegHandler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'system:checkFFmpeg')[1];
    const result = await ffmpegHandler();
    
    expect(result).toBe(true);
    expect(mockServices.audioProcessor.validateFFmpegInstallation).toHaveBeenCalledOnce();
  });

  it('should provide secure error handling', async () => {
    mockServices.settingsManager.loadSettings.mockRejectedValue(new Error('Test error'));
    
    const settingsLoadHandler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'settings:load')[1];
    
    await expect(settingsLoadHandler()).rejects.toThrow('Failed to load settings');
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ipc:error', expect.objectContaining({
      operation: 'settings:load',
      message: 'Test error'
    }));
  });

  it('should clean up resources properly', () => {
    ipcHandlers.cleanup();
    
    expect(mockIpcMain.removeAllListeners).toHaveBeenCalledTimes(14);
  });

  it('should validate input parameters', () => {
    expect(() => {
      ipcHandlers.validateInput('valid', 'string', 'Error');
    }).not.toThrow();
    
    expect(() => {
      ipcHandlers.validateInput('', 'string', 'Error');
    }).toThrow('Error');
  });

  it('should send messages to renderer safely', () => {
    ipcHandlers.sendToRenderer('test:channel', { data: 'test' });
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('test:channel', { data: 'test' });
  });
});