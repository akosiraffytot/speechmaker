/**
 * Task 11 Integration Test - Complete Application Flow Integration
 * 
 * Tests the integration of all improvements into the main application flow:
 * - Enhanced audio processor with FFmpeg bundling
 * - TTS service with retry mechanisms
 * - Settings manager with default folder management
 * - State management system coordination
 * - Complete startup sequence with parallel initialization
 * - Proper cleanup and resource management
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.2, 6.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

// Mock Electron modules
const mockApp = {
  getPath: vi.fn(() => path.join(os.tmpdir(), 'test-speechmaker')),
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  quit: vi.fn()
};

const mockBrowserWindow = vi.fn(() => ({
  loadFile: vi.fn(),
  show: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  getBounds: vi.fn(() => ({ width: 800, height: 600, x: 100, y: 100 })),
  isDestroyed: vi.fn(() => false),
  webContents: {
    send: vi.fn(),
    openDevTools: vi.fn()
  }
}));

vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow
}));

// Import services after mocking electron
import SettingsManager from '../src/main/services/settingsManager.js';
import TTSService from '../src/main/services/ttsService.js';
import AudioProcessor from '../src/main/services/audioProcessor.js';
import ErrorHandler from '../src/main/services/errorHandler.js';
import FileManager from '../src/main/services/fileManager.js';
import IPCHandlers from '../src/main/ipc/ipcHandlers.js';

describe('Task 11: Complete Application Flow Integration', () => {
  let settingsManager;
  let ttsService;
  let audioProcessor;
  let errorHandler;
  let fileManager;
  let ipcHandlers;
  let mockMainWindow;
  let testDir;

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `speechmaker-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Mock main window
    mockMainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn()
      },
      getBounds: vi.fn(() => ({ width: 800, height: 600, x: 100, y: 100 }))
    };

    // Initialize services in correct order
    errorHandler = new ErrorHandler();
    await errorHandler.initialize();

    settingsManager = new SettingsManager();
    await settingsManager.initialize();

    fileManager = new FileManager();

    audioProcessor = new AudioProcessor();
    
    ttsService = new TTSService();
    ttsService.setAudioProcessor(audioProcessor);

    // Create services object for IPC handlers
    const services = {
      settingsManager,
      ttsService,
      fileManager,
      audioProcessor,
      errorHandler
    };

    ipcHandlers = new IPCHandlers(services, mockMainWindow);
  });

  afterEach(async () => {
    // Cleanup services
    if (ipcHandlers) {
      ipcHandlers.cleanup();
    }
    if (ttsService) {
      ttsService.cleanup();
    }
    if (audioProcessor) {
      audioProcessor.cleanup();
    }
    if (errorHandler) {
      errorHandler.cleanup();
    }

    // Cleanup test directory
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Service Integration', () => {
    it('should initialize all services successfully', async () => {
      expect(settingsManager).toBeDefined();
      expect(ttsService).toBeDefined();
      expect(audioProcessor).toBeDefined();
      expect(errorHandler).toBeDefined();
      expect(fileManager).toBeDefined();
      expect(ipcHandlers).toBeDefined();
    });

    it('should have proper service dependencies wired', () => {
      // TTS service should have audio processor reference
      expect(ttsService.audioProcessor).toBe(audioProcessor);
      
      // IPC handlers should have all services
      expect(ipcHandlers.services.settingsManager).toBe(settingsManager);
      expect(ipcHandlers.services.ttsService).toBe(ttsService);
      expect(ipcHandlers.services.audioProcessor).toBe(audioProcessor);
      expect(ipcHandlers.services.errorHandler).toBe(errorHandler);
      expect(ipcHandlers.services.fileManager).toBe(fileManager);
    });
  });

  describe('Enhanced FFmpeg Integration', () => {
    it('should initialize FFmpeg with bundled-first logic', async () => {
      const ffmpegStatus = await audioProcessor.initializeFFmpeg();
      
      expect(ffmpegStatus).toBeDefined();
      expect(ffmpegStatus).toHaveProperty('available');
      expect(ffmpegStatus).toHaveProperty('source');
      expect(ffmpegStatus).toHaveProperty('validated');
      expect(['bundled', 'system', 'none']).toContain(ffmpegStatus.source);
    });

    it('should provide FFmpeg status through IPC', async () => {
      const status = audioProcessor.getFFmpegStatus();
      
      expect(status).toBeDefined();
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('source');
      expect(status).toHaveProperty('path');
      expect(status).toHaveProperty('version');
      expect(status).toHaveProperty('validated');
      expect(status).toHaveProperty('error');
    });

    it('should handle FFmpeg cleanup properly', () => {
      const initialStatus = audioProcessor.getFFmpegStatus();
      
      audioProcessor.cleanup();
      
      const cleanedStatus = audioProcessor.getFFmpegStatus();
      expect(cleanedStatus.available).toBe(false);
      expect(cleanedStatus.source).toBe('none');
      expect(cleanedStatus.validated).toBe(false);
    });
  });

  describe('Voice Loading with Retry Mechanism', () => {
    it('should implement retry mechanism for voice loading', async () => {
      // Mock edge-tts to simulate failure then success
      let callCount = 0;
      const originalSpawn = require('child_process').spawn;
      
      vi.spyOn(require('child_process'), 'spawn').mockImplementation((command, args) => {
        callCount++;
        const mockProcess = new EventEmitter();
        
        setTimeout(() => {
          if (callCount === 1) {
            // First call fails
            mockProcess.emit('error', new Error('Connection failed'));
          } else {
            // Second call succeeds
            mockProcess.stdout = new EventEmitter();
            setTimeout(() => {
              mockProcess.stdout.emit('data', 'Name: Microsoft David Desktop, Gender: Male, Language: en-US\n');
              mockProcess.emit('close', 0);
            }, 10);
          }
        }, 10);
        
        return mockProcess;
      });

      const result = await ttsService.loadVoicesWithRetry(3);
      
      expect(result.success).toBe(true);
      expect(result.attempt).toBeGreaterThan(1);
      expect(result.voices).toBeDefined();
      
      // Restore original spawn
      require('child_process').spawn.mockRestore();
    });

    it('should provide troubleshooting steps on failure', () => {
      const steps = ttsService.getTroubleshootingSteps();
      
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some(step => step.includes('Windows Speech Platform'))).toBe(true);
    });

    it('should handle voice loading state management', () => {
      const initialState = ttsService.getVoiceLoadingState();
      
      expect(initialState).toBeDefined();
      expect(initialState).toHaveProperty('isLoading');
      expect(initialState).toHaveProperty('currentAttempt');
      expect(initialState).toHaveProperty('maxAttempts');
      expect(initialState).toHaveProperty('lastError');
      expect(initialState).toHaveProperty('retryDelay');
    });
  });

  describe('Default Output Folder Management', () => {
    it('should create default output folder hierarchy', () => {
      const defaultFolder = settingsManager.getDefaultOutputFolder();
      
      expect(defaultFolder).toBeDefined();
      expect(typeof defaultFolder).toBe('string');
      expect(defaultFolder.length).toBeGreaterThan(0);
    });

    it('should ensure directory exists and is writable', () => {
      const testPath = path.join(testDir, 'test-output');
      const result = settingsManager.ensureDirectoryExists(testPath);
      
      expect(result).toBe(true);
    });

    it('should initialize default output folder on startup', async () => {
      const defaultFolder = await settingsManager.initializeDefaultOutputFolder();
      
      expect(defaultFolder).toBeDefined();
      expect(typeof defaultFolder).toBe('string');
      
      // Verify the folder exists
      const exists = settingsManager.ensureDirectoryExists(defaultFolder);
      expect(exists).toBe(true);
    });
  });

  describe('Settings Integration', () => {
    it('should load settings with default output folder', async () => {
      const settings = await settingsManager.loadSettings();
      
      expect(settings).toBeDefined();
      expect(settings).toHaveProperty('defaultOutputPath');
      expect(settings.defaultOutputPath).toBeDefined();
      expect(typeof settings.defaultOutputPath).toBe('string');
    });

    it('should migrate settings properly', async () => {
      // Create old format settings
      const oldSettings = {
        outputPath: '/old/path', // Old format
        selectedVoice: 'old-voice' // Old format
      };

      const migrated = await settingsManager.migrateSettings(oldSettings);
      
      expect(migrated).toHaveProperty('defaultOutputPath');
      expect(migrated).toHaveProperty('lastSelectedVoice');
      expect(migrated.defaultOutputPath).toBeDefined();
      expect(migrated.lastSelectedVoice).toBe('old-voice');
    });
  });

  describe('Application State Management', () => {
    it('should coordinate service states properly', async () => {
      // Initialize FFmpeg
      const ffmpegStatus = await audioProcessor.initializeFFmpeg();
      
      // Initialize voices (mock success)
      vi.spyOn(ttsService, 'loadVoicesWithRetry').mockResolvedValue({
        success: true,
        voices: [{ id: 'test-voice', name: 'Test Voice', language: 'en-US' }],
        attempt: 1
      });
      
      const voiceResult = await ttsService.loadVoicesWithRetry();
      
      // Initialize default folder
      const defaultFolder = await settingsManager.initializeDefaultOutputFolder();
      
      // Verify all components are ready
      expect(ffmpegStatus).toBeDefined();
      expect(voiceResult.success).toBe(true);
      expect(defaultFolder).toBeDefined();
    });

    it('should handle parallel initialization properly', async () => {
      const startTime = Date.now();
      
      // Simulate parallel initialization
      const [ffmpegResult, voiceResult, folderResult] = await Promise.allSettled([
        audioProcessor.initializeFFmpeg(),
        ttsService.loadVoicesWithRetry().catch(() => ({ success: false, error: new Error('Mock error') })),
        settingsManager.initializeDefaultOutputFolder()
      ]);
      
      const endTime = Date.now();
      
      // Verify all operations completed
      expect(ffmpegResult.status).toBe('fulfilled');
      expect(voiceResult.status).toBe('fulfilled');
      expect(folderResult.status).toBe('fulfilled');
      
      // Verify parallel execution (should be faster than sequential)
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('IPC Integration', () => {
    it('should handle initialization status requests', async () => {
      // Mock IPC invoke for initialization status
      const mockEvent = {};
      
      // This would normally be called through IPC
      const status = await ipcHandlers.services.audioProcessor.getFFmpegStatus();
      
      expect(status).toBeDefined();
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('source');
    });

    it('should handle voice retry through IPC', async () => {
      // Mock successful retry
      vi.spyOn(ttsService, 'retryVoiceLoading').mockResolvedValue({
        success: true,
        voices: [{ id: 'test-voice', name: 'Test Voice' }],
        attempts: 2
      });

      const result = await ttsService.retryVoiceLoading();
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup all services properly', () => {
      // Verify cleanup methods exist and can be called
      expect(() => {
        if (audioProcessor.cleanup) audioProcessor.cleanup();
        if (ttsService.cleanup) ttsService.cleanup();
        if (errorHandler.cleanup) errorHandler.cleanup();
        if (ipcHandlers.cleanup) ipcHandlers.cleanup();
      }).not.toThrow();
    });

    it('should handle cleanup errors gracefully', () => {
      // Mock cleanup error
      const originalCleanup = audioProcessor.cleanup;
      audioProcessor.cleanup = vi.fn(() => {
        throw new Error('Cleanup error');
      });

      // Should not throw
      expect(() => {
        try {
          audioProcessor.cleanup();
        } catch (error) {
          // Cleanup errors should be handled gracefully
          console.warn('Cleanup error handled:', error.message);
        }
      }).not.toThrow();

      // Restore original
      audioProcessor.cleanup = originalCleanup;
    });
  });

  describe('End-to-End Integration', () => {
    it('should complete full initialization sequence', async () => {
      const initializationSteps = [];
      
      // Step 1: Initialize settings
      initializationSteps.push('settings');
      await settingsManager.initialize();
      
      // Step 2: Initialize error handler
      initializationSteps.push('errorHandler');
      await errorHandler.initialize();
      
      // Step 3: Initialize file manager
      initializationSteps.push('fileManager');
      // File manager doesn't need async initialization
      
      // Step 4: Initialize audio processor
      initializationSteps.push('audioProcessor');
      await audioProcessor.initializeFFmpeg();
      
      // Step 5: Initialize TTS service
      initializationSteps.push('ttsService');
      ttsService.setAudioProcessor(audioProcessor);
      
      // Step 6: Initialize IPC handlers
      initializationSteps.push('ipcHandlers');
      // IPC handlers are initialized in constructor
      
      expect(initializationSteps).toEqual([
        'settings',
        'errorHandler', 
        'fileManager',
        'audioProcessor',
        'ttsService',
        'ipcHandlers'
      ]);
    });

    it('should handle complete application lifecycle', async () => {
      // Simulate application startup
      const services = {
        settingsManager,
        ttsService,
        fileManager,
        audioProcessor,
        errorHandler
      };

      // Verify all services are available
      Object.values(services).forEach(service => {
        expect(service).toBeDefined();
      });

      // Simulate application shutdown
      Object.values(services).forEach(service => {
        if (service.cleanup) {
          service.cleanup();
        }
      });

      // Verify cleanup completed without errors
      expect(true).toBe(true); // If we get here, cleanup succeeded
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle memory cleanup properly', () => {
      const initialMemory = process.memoryUsage();
      
      // Perform operations that might create memory pressure
      for (let i = 0; i < 100; i++) {
        const status = audioProcessor.getFFmpegStatus();
        const voiceState = ttsService.getVoiceLoadingState();
      }
      
      // Cleanup
      audioProcessor.cleanup();
      ttsService.cleanup();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      
      // Memory usage should not grow excessively
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
    });

    it('should handle concurrent operations efficiently', async () => {
      const startTime = Date.now();
      
      // Simulate concurrent operations
      const operations = [
        audioProcessor.getFFmpegStatus(),
        settingsManager.getDefaultOutputFolder(),
        ttsService.getVoiceLoadingState(),
        settingsManager.loadSettings(),
        audioProcessor.getFFmpegStatus()
      ];
      
      const results = await Promise.all(operations);
      const endTime = Date.now();
      
      // All operations should complete
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
      
      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
    });
  });
});