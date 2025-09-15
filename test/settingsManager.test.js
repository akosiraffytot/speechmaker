import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { app } from 'electron';
import os from 'os';
import SettingsManager from '../src/main/services/settingsManager.js';

// Mock the dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('os');
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

    describe('getDefaultOutputFolder', () => {
        beforeEach(() => {
            // Mock os module functions
            os.homedir.mockReturnValue('/home/user');
            os.tmpdir.mockReturnValue('/tmp');
            
            // Mock path.join calls
            join.mockImplementation((...args) => args.join('/'));
        });

        it('should return Documents/SpeechMaker if accessible', () => {
            // Mock ensureDirectoryExists to return true for Documents path
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);

            const result = settingsManager.getDefaultOutputFolder();

            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/home/user/Documents/SpeechMaker');
        });

        it('should fallback to Home/SpeechMaker if Documents is not accessible', () => {
            // Mock ensureDirectoryExists to return false for Documents, true for Home
            settingsManager.ensureDirectoryExists = vi.fn()
                .mockReturnValueOnce(false) // Documents fails
                .mockReturnValueOnce(true); // Home succeeds

            const result = settingsManager.getDefaultOutputFolder();

            expect(result).toBe('/home/user/SpeechMaker');
        });

        it('should fallback to temp directory if both Documents and Home are not accessible', () => {
            // Mock ensureDirectoryExists to return false for both paths
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(false);

            const result = settingsManager.getDefaultOutputFolder();

            expect(result).toBe('/tmp');
            expect(os.tmpdir).toHaveBeenCalled();
        });
    });

    describe('ensureDirectoryExists', () => {
        beforeEach(() => {
            join.mockImplementation((...args) => args.join('/'));
        });

        it('should return true if directory exists and is writable', () => {
            // Test the actual implementation with a valid path
            const result = settingsManager.ensureDirectoryExists(os.tmpdir());
            expect(result).toBe(true);
        });

        it('should return false if directory creation fails', () => {
            // Test with an invalid path that should fail
            const result = settingsManager.ensureDirectoryExists('/invalid/path/that/cannot/be/created');
            expect(result).toBe(false);
        });
    });

    describe('initializeDefaultOutputFolder', () => {
        beforeEach(() => {
            os.homedir.mockReturnValue('/home/user');
            os.tmpdir.mockReturnValue('/tmp');
            fs.mkdir.mockResolvedValue();
            join.mockImplementation((...args) => args.join('/'));
        });

        it('should set default output folder if none exists', async () => {
            const existingSettings = { defaultOutputPath: null };
            
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(existingSettings));
            fs.writeFile.mockResolvedValue();

            // Mock the methods to avoid calling initialize
            settingsManager.settingsPath = '/mock/settings.json';
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.updateSetting = vi.fn().mockResolvedValue(true);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = await settingsManager.initializeDefaultOutputFolder();

            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(settingsManager.getDefaultOutputFolder).toHaveBeenCalled();
            expect(settingsManager.updateSetting).toHaveBeenCalledWith('defaultOutputPath', '/home/user/Documents/SpeechMaker');
        });

        it('should verify existing output path is still accessible', async () => {
            const existingSettings = { defaultOutputPath: '/existing/path' };
            
            settingsManager.settingsPath = '/mock/settings.json';
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);

            const result = await settingsManager.initializeDefaultOutputFolder();

            expect(result).toBe('/existing/path');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/existing/path');
        });

        it('should update path if existing path is no longer accessible', async () => {
            const existingSettings = { defaultOutputPath: '/inaccessible/path' };
            
            settingsManager.settingsPath = '/mock/settings.json';
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.updateSetting = vi.fn().mockResolvedValue(true);
            settingsManager.ensureDirectoryExists = vi.fn()
                .mockReturnValueOnce(false) // Existing path fails
                .mockReturnValue(true); // New path succeeds
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = await settingsManager.initializeDefaultOutputFolder();

            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(settingsManager.getDefaultOutputFolder).toHaveBeenCalled();
            expect(settingsManager.updateSetting).toHaveBeenCalledWith('defaultOutputPath', '/home/user/Documents/SpeechMaker');
        });

        it('should fallback to temp directory if initialization fails', async () => {
            settingsManager.settingsPath = '/mock/settings.json';
            settingsManager.loadSettings = vi.fn().mockRejectedValue(new Error('Settings load failed'));

            const result = await settingsManager.initializeDefaultOutputFolder();

            expect(result).toBe('/tmp');
        });
    });

    describe('migrateSettings', () => {
        beforeEach(() => {
            os.homedir.mockReturnValue('/home/user');
            join.mockImplementation((...args) => args.join('/'));
        });

        it('should migrate outputPath to defaultOutputPath', async () => {
            const oldSettings = {
                outputPath: '/old/output/path',
                voiceSpeed: 1.0
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);

            const result = await settingsManager.migrateSettings(oldSettings);

            expect(result.defaultOutputPath).toBe('/old/output/path');
            expect(result.outputPath).toBeUndefined();
            expect(result.voiceSpeed).toBe(1.0);
        });

        it('should migrate selectedVoice to lastSelectedVoice', async () => {
            const oldSettings = {
                selectedVoice: 'Microsoft David Desktop',
                voiceSpeed: 1.0
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = await settingsManager.migrateSettings(oldSettings);

            expect(result.lastSelectedVoice).toBe('Microsoft David Desktop');
            expect(result.selectedVoice).toBeUndefined();
        });

        it('should set default output folder if none exists or is inaccessible', async () => {
            const oldSettings = {
                defaultOutputPath: '/inaccessible/path',
                voiceSpeed: 1.0
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(false);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = await settingsManager.migrateSettings(oldSettings);

            expect(result.defaultOutputPath).toBe('/home/user/Documents/SpeechMaker');
        });

        it('should reset invalid windowBounds', async () => {
            const oldSettings = {
                windowBounds: 'invalid',
                voiceSpeed: 1.0
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = await settingsManager.migrateSettings(oldSettings);

            expect(result.windowBounds).toEqual({
                width: 800,
                height: 600,
                x: undefined,
                y: undefined
            });
        });

        it('should reset invalid voice speed', async () => {
            const oldSettings = {
                voiceSpeed: 5.0, // Out of range
                defaultOutputPath: '/valid/path'
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);

            const result = await settingsManager.migrateSettings(oldSettings);

            expect(result.voiceSpeed).toBe(1.0);
        });

        it('should handle migration errors gracefully', async () => {
            const oldSettings = { voiceSpeed: 1.0 };

            // Mock getDefaultOutputFolder to throw an error
            settingsManager.getDefaultOutputFolder = vi.fn().mockImplementation(() => {
                throw new Error('Folder access error');
            });

            const result = await settingsManager.migrateSettings(oldSettings);

            // Should return original settings if migration fails
            expect(result).toEqual(oldSettings);
        });

        it('should not perform migration if no changes needed', async () => {
            const currentSettings = {
                lastSelectedVoice: 'Microsoft David Desktop',
                defaultOutputPath: '/valid/path',
                voiceSpeed: 1.0,
                windowBounds: { width: 800, height: 600, x: undefined, y: undefined }
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);

            const result = await settingsManager.migrateSettings(currentSettings);

            expect(result).toEqual(currentSettings);
        });
    });

    describe('enhanced validateSettings', () => {
        beforeEach(() => {
            os.homedir.mockReturnValue('/home/user');
            join.mockImplementation((...args) => args.join('/'));
        });

        it('should validate defaultOutputPath accessibility', () => {
            const settings = {
                defaultOutputPath: '/valid/path',
                voiceSpeed: 1.0
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);

            const result = settingsManager.validateSettings(settings);

            expect(result.defaultOutputPath).toBe('/valid/path');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/valid/path');
        });

        it('should fallback to default folder if path is inaccessible', () => {
            const settings = {
                defaultOutputPath: '/inaccessible/path',
                voiceSpeed: 1.0
            };

            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(false);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = settingsManager.validateSettings(settings);

            expect(result.defaultOutputPath).toBe('/home/user/Documents/SpeechMaker');
        });

        it('should ensure default output path is always set', () => {
            const settings = {
                voiceSpeed: 1.0
                // No defaultOutputPath
            };

            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = settingsManager.validateSettings(settings);

            expect(result.defaultOutputPath).toBe('/home/user/Documents/SpeechMaker');
        });

        it('should validate window bounds with proper ranges', () => {
            const settings = {
                windowBounds: {
                    width: 5000, // Too large
                    height: 100, // Too small
                    x: -5000, // Too far left
                    y: 5000 // Too far down
                }
            };

            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = settingsManager.validateSettings(settings);

            expect(result.windowBounds.width).toBe(800); // Should use default
            expect(result.windowBounds.height).toBe(600); // Should use default
            expect(result.windowBounds.x).toBeUndefined(); // Should use default
            expect(result.windowBounds.y).toBeUndefined(); // Should use default
        });

        it('should validate maxChunkLength with proper minimum', () => {
            const settings = {
                maxChunkLength: 500 // Below minimum
            };

            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');

            const result = settingsManager.validateSettings(settings);

            expect(result.maxChunkLength).toBe(5000); // Should use default
        });
    });
});