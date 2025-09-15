import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import os from 'os';
import SettingsManager from '../src/main/services/settingsManager.js';

describe('Settings Integration Tests', () => {
    let settingsManager;
    let testDir;
    let originalGetPath;

    beforeEach(async () => {
        // Create a temporary directory for testing
        testDir = join(os.tmpdir(), 'speechmaker-test-' + Date.now());
        await fs.mkdir(testDir, { recursive: true });

        // Mock electron app.getPath to use our test directory
        const { app } = await import('electron');
        originalGetPath = app.getPath;
        app.getPath = () => testDir;

        settingsManager = new SettingsManager();
    });

    afterEach(async () => {
        // Cleanup test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }

        // Restore original getPath
        if (originalGetPath) {
            const { app } = await import('electron');
            app.getPath = originalGetPath;
        }
    });

    describe('Settings Migration and Initialization', () => {
        it('should migrate old settings format to new format', async () => {
            // Create old format settings file
            const oldSettings = {
                outputPath: '/old/output/path',
                selectedVoice: 'Old Voice',
                voiceSpeed: 1.5,
                defaultOutputFormat: 'mp3'
            };

            await settingsManager.initialize();
            const settingsPath = settingsManager.getSettingsPath();
            await fs.writeFile(settingsPath, JSON.stringify(oldSettings), 'utf8');

            // Load settings - should trigger migration
            const loadedSettings = await settingsManager.loadSettings();

            // Verify migration occurred
            expect(loadedSettings.defaultOutputPath).toBeDefined();
            expect(loadedSettings.lastSelectedVoice).toBe('Old Voice');
            expect(loadedSettings.outputPath).toBeUndefined();
            expect(loadedSettings.selectedVoice).toBeUndefined();
            expect(loadedSettings.voiceSpeed).toBe(1.5);
            expect(loadedSettings.defaultOutputFormat).toBe('mp3');
        });

        it('should initialize default output folder on first run', async () => {
            await settingsManager.initialize();
            
            const settings = await settingsManager.loadSettings();
            
            // Should have a default output path set
            expect(settings.defaultOutputPath).toBeDefined();
            expect(typeof settings.defaultOutputPath).toBe('string');
            expect(settings.defaultOutputPath.length).toBeGreaterThan(0);
        });

        it('should validate and fix invalid settings', async () => {
            const invalidSettings = {
                voiceSpeed: 10.0, // Invalid - too high
                maxChunkLength: 100, // Invalid - too low
                defaultOutputFormat: 'invalid', // Invalid format
                windowBounds: 'not an object' // Invalid type
            };

            await settingsManager.initialize();
            const settingsPath = settingsManager.getSettingsPath();
            await fs.writeFile(settingsPath, JSON.stringify(invalidSettings), 'utf8');

            const loadedSettings = await settingsManager.loadSettings();

            // Should have been corrected to defaults
            expect(loadedSettings.voiceSpeed).toBe(1.0);
            expect(loadedSettings.maxChunkLength).toBe(5000);
            expect(loadedSettings.defaultOutputFormat).toBe('wav');
            expect(loadedSettings.windowBounds).toEqual({
                width: 800,
                height: 600,
                x: undefined,
                y: undefined
            });
        });

        it('should handle corrupted settings file gracefully', async () => {
            await settingsManager.initialize();
            const settingsPath = settingsManager.getSettingsPath();
            
            // Write corrupted JSON
            await fs.writeFile(settingsPath, '{ invalid json }', 'utf8');

            const loadedSettings = await settingsManager.loadSettings();

            // Should return defaults with output folder set
            expect(loadedSettings).toEqual(expect.objectContaining({
                lastSelectedVoice: null,
                defaultOutputFormat: 'wav',
                voiceSpeed: 1.0,
                maxChunkLength: 5000
            }));
            expect(loadedSettings.defaultOutputPath).toBeDefined();
        });

        it('should persist migrated settings', async () => {
            const oldSettings = {
                outputPath: '/test/path',
                selectedVoice: 'Test Voice'
            };

            await settingsManager.initialize();
            const settingsPath = settingsManager.getSettingsPath();
            await fs.writeFile(settingsPath, JSON.stringify(oldSettings), 'utf8');

            // Load settings (triggers migration)
            await settingsManager.loadSettings();

            // Read the file again to verify migration was saved
            const savedData = await fs.readFile(settingsPath, 'utf8');
            const savedSettings = JSON.parse(savedData);

            expect(savedSettings.defaultOutputPath).toBeDefined();
            expect(savedSettings.lastSelectedVoice).toBe('Test Voice');
            expect(savedSettings.outputPath).toBeUndefined();
            expect(savedSettings.selectedVoice).toBeUndefined();
        });
    });

    describe('Default Output Folder Management', () => {
        it('should create and validate default output folder', async () => {
            await settingsManager.initialize();
            
            const defaultFolder = await settingsManager.initializeDefaultOutputFolder();
            
            expect(defaultFolder).toBeDefined();
            expect(typeof defaultFolder).toBe('string');
            
            // Verify the folder was actually created and is accessible
            const folderExists = settingsManager.ensureDirectoryExists(defaultFolder);
            expect(folderExists).toBe(true);
        });

        it('should update inaccessible output folder to default', async () => {
            const inaccessiblePath = '/completely/invalid/path/that/does/not/exist';
            
            await settingsManager.initialize();
            await settingsManager.updateSetting('defaultOutputPath', inaccessiblePath);
            
            // Initialize default output folder - should detect inaccessible path
            const newFolder = await settingsManager.initializeDefaultOutputFolder();
            
            expect(newFolder).not.toBe(inaccessiblePath);
            expect(settingsManager.ensureDirectoryExists(newFolder)).toBe(true);
        });
    });
});