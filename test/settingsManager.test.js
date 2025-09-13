import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { app } from 'electron';
import SettingsManager from '../src/main/services/settingsManager.js';

// Mock the dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn()
    }
}));

describe('SettingsManager', () => {
    let settingsManager;
    const mockUserDataPath = '/mock/user/data';
    const mockSettingsPath = '/mock/user/data/settings.json';

    beforeEach(() => {
        settingsManager = new SettingsManager();
        vi.clearAllMocks();
        
        // Setup default mocks
        app.getPath.mockReturnValue(mockUserDataPath);
        join.mockReturnValue(mockSettingsPath);
        dirname.mockReturnValue(mockUserDataPath);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with default settings', () => {
            expect(settingsManager.settingsPath).toBeNull();
            expect(settingsManager.defaultSettings).toEqual({
                lastSelectedVoice: null,
                defaultOutputFormat: 'wav',
                defaultOutputPath: null,
                voiceSpeed: 1.0,
                maxChunkLength: 5000,
                windowBounds: {
                    width: 800,
                    height: 600,
                    x: undefined,
                    y: undefined
                }
            });
        });
    });

    describe('initialize', () => {
        it('should initialize settings path and create directory', async () => {
            fs.mkdir.mockResolvedValue();

            const result = await settingsManager.initialize();

            expect(app.getPath).toHaveBeenCalledWith('userData');
            expect(join).toHaveBeenCalledWith(mockUserDataPath, 'settings.json');
            expect(fs.mkdir).toHaveBeenCalledWith(mockUserDataPath, { recursive: true });
            expect(settingsManager.settingsPath).toBe(mockSettingsPath);
            expect(result).toBe(true);
        });

        it('should throw error if initialization fails', async () => {
            const error = new Error('Directory creation failed');
            fs.mkdir.mockRejectedValue(error);

            await expect(settingsManager.initialize()).rejects.toThrow('Settings initialization failed: Directory creation failed');
        });
    });

    describe('getDefaultSettings', () => {
        it('should return a copy of default settings', () => {
            const defaults = settingsManager.getDefaultSettings();
            
            expect(defaults).toEqual(settingsManager.defaultSettings);
            expect(defaults).not.toBe(settingsManager.defaultSettings); // Should be a copy
        });
    });

    describe('saveSettings', () => {
        beforeEach(async () => {
            fs.mkdir.mockResolvedValue();
            await settingsManager.initialize();
        });

        it('should save valid settings to file', async () => {
            const settings = {
                lastSelectedVoice: 'voice-1',
                defaultOutputFormat: 'mp3',
                voiceSpeed: 1.5
            };
            
            fs.writeFile.mockResolvedValue();

            const result = await settingsManager.saveSettings(settings);

            expect(fs.writeFile).toHaveBeenCalledWith(
                mockSettingsPath,
                expect.stringContaining('"lastSelectedVoice": "voice-1"'),
                'utf8'
            );
            expect(result).toBe(true);
        });

        it('should initialize if not already initialized', async () => {
            settingsManager.settingsPath = null;
            fs.mkdir.mockResolvedValue();
            fs.writeFile.mockResolvedValue();

            await settingsManager.saveSettings({});

            expect(app.getPath).toHaveBeenCalledWith('userData');
            expect(fs.mkdir).toHaveBeenCalled();
        });

        it('should throw error if save fails', async () => {
            const error = new Error('Write failed');
            fs.writeFile.mockRejectedValue(error);

            await expect(settingsManager.saveSettings({})).rejects.toThrow('Settings save failed: Write failed');
        });
    });

    describe('loadSettings', () => {
        beforeEach(async () => {
            fs.mkdir.mockResolvedValue();
            await settingsManager.initialize();
        });

        it('should load existing settings from file', async () => {
            const savedSettings = {
                lastSelectedVoice: 'voice-1',
                defaultOutputFormat: 'mp3',
                voiceSpeed: 1.5
            };
            
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(savedSettings));

            const result = await settingsManager.loadSettings();

            expect(fs.access).toHaveBeenCalledWith(mockSettingsPath);
            expect(fs.readFile).toHaveBeenCalledWith(mockSettingsPath, 'utf8');
            expect(result.lastSelectedVoice).toBe('voice-1');
            expect(result.defaultOutputFormat).toBe('mp3');
            expect(result.voiceSpeed).toBe(1.5);
        });

        it('should return default settings if file does not exist', async () => {
            fs.access.mockRejectedValue(new Error('File not found'));

            const result = await settingsManager.loadSettings();

            expect(result).toEqual(settingsManager.defaultSettings);
        });

        it('should return default settings if file is corrupted', async () => {
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue('invalid json');

            const result = await settingsManager.loadSettings();

            expect(result).toEqual(settingsManager.defaultSettings);
        });

        it('should merge loaded settings with defaults', async () => {
            const partialSettings = {
                lastSelectedVoice: 'voice-1'
            };
            
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(partialSettings));

            const result = await settingsManager.loadSettings();

            expect(result.lastSelectedVoice).toBe('voice-1');
            expect(result.defaultOutputFormat).toBe('wav'); // From defaults
            expect(result.voiceSpeed).toBe(1.0); // From defaults
        });
    });

    describe('updateSetting', () => {
        beforeEach(async () => {
            fs.mkdir.mockResolvedValue();
            await settingsManager.initialize();
        });

        it('should update a specific setting', async () => {
            const existingSettings = { voiceSpeed: 1.0 };
            
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(existingSettings));
            fs.writeFile.mockResolvedValue();

            const result = await settingsManager.updateSetting('voiceSpeed', 1.5);

            expect(result).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith(
                mockSettingsPath,
                expect.stringContaining('"voiceSpeed": 1.5'),
                'utf8'
            );
        });

        it('should throw error if update fails', async () => {
            fs.access.mockRejectedValue(new Error('Access denied'));
            fs.writeFile.mockRejectedValue(new Error('Write failed'));

            await expect(settingsManager.updateSetting('voiceSpeed', 1.5))
                .rejects.toThrow('Setting update failed');
        });
    });

    describe('resetSettings', () => {
        beforeEach(async () => {
            fs.mkdir.mockResolvedValue();
            await settingsManager.initialize();
        });

        it('should reset settings to defaults', async () => {
            fs.writeFile.mockResolvedValue();

            const result = await settingsManager.resetSettings();

            expect(result).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith(
                mockSettingsPath,
                expect.stringContaining('"defaultOutputFormat": "wav"'),
                'utf8'
            );
        });
    });

    describe('validateSettings', () => {
        it('should validate and return correct settings structure', () => {
            const input = {
                lastSelectedVoice: 'voice-1',
                defaultOutputFormat: 'mp3',
                voiceSpeed: 1.5,
                maxChunkLength: 3000,
                windowBounds: { width: 1000, height: 700 }
            };

            const result = settingsManager.validateSettings(input);

            expect(result.lastSelectedVoice).toBe('voice-1');
            expect(result.defaultOutputFormat).toBe('mp3');
            expect(result.voiceSpeed).toBe(1.5);
            expect(result.maxChunkLength).toBe(3000);
            expect(result.windowBounds.width).toBe(1000);
            expect(result.windowBounds.height).toBe(700);
        });

        it('should reject invalid output format', () => {
            const input = { defaultOutputFormat: 'invalid' };
            const result = settingsManager.validateSettings(input);
            expect(result.defaultOutputFormat).toBe('wav'); // Should use default
        });

        it('should reject invalid voice speed', () => {
            const input = { voiceSpeed: 5.0 }; // Out of range
            const result = settingsManager.validateSettings(input);
            expect(result.voiceSpeed).toBe(1.0); // Should use default
        });

        it('should reject invalid chunk length', () => {
            const input = { maxChunkLength: -100 };
            const result = settingsManager.validateSettings(input);
            expect(result.maxChunkLength).toBe(5000); // Should use default
        });

        it('should handle invalid window bounds', () => {
            const input = { 
                windowBounds: { 
                    width: -100, 
                    height: 'invalid',
                    x: 50,
                    y: 100
                } 
            };
            const result = settingsManager.validateSettings(input);
            
            expect(result.windowBounds.width).toBe(800); // Should use default
            expect(result.windowBounds.height).toBe(600); // Should use default
            expect(result.windowBounds.x).toBe(50); // Should keep valid value
            expect(result.windowBounds.y).toBe(100); // Should keep valid value
        });
    });

    describe('getSettingsPath', () => {
        it('should return the settings path', async () => {
            fs.mkdir.mockResolvedValue();
            await settingsManager.initialize();
            
            expect(settingsManager.getSettingsPath()).toBe(mockSettingsPath);
        });

        it('should return null if not initialized', () => {
            expect(settingsManager.getSettingsPath()).toBeNull();
        });
    });
});