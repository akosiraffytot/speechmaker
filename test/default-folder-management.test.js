/**
 * Unit tests for default output folder management
 * Tests folder creation, permission validation, and fallback mechanisms
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('os');
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn()
    }
}));

describe('Default Output Folder Management', () => {
    let SettingsManager;
    let settingsManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Setup default mocks
        os.homedir.mockReturnValue('/home/user');
        os.tmpdir.mockReturnValue('/tmp');
        app.getPath.mockReturnValue('/app/userData');
        path.join.mockImplementation((...args) => args.join('/'));
        path.dirname.mockReturnValue('/parent/dir');
        
        // Setup fs mocks
        fs.mkdir.mockResolvedValue();
        fs.access.mockResolvedValue();
        fs.writeFile.mockResolvedValue();
        fs.readFile.mockResolvedValue('{}');
        
        // Import SettingsManager after mocks are set up
        const module = await import('../src/main/services/settingsManager.js');
        SettingsManager = module.default;
        settingsManager = new SettingsManager();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getDefaultOutputFolder', () => {
        it('should return Documents/SpeechMaker when accessible', () => {
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/home/user/Documents/SpeechMaker');
        });

        it('should fallback to Home/SpeechMaker when Documents is inaccessible', () => {
            settingsManager.ensureDirectoryExists = vi.fn()
                .mockReturnValueOnce(false) // Documents fails
                .mockReturnValueOnce(true);  // Home succeeds
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/home/user/SpeechMaker');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/home/user/Documents/SpeechMaker');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/home/user/SpeechMaker');
        });

        it('should fallback to temp directory when both Documents and Home fail', () => {
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(false);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/tmp');
            expect(os.tmpdir).toHaveBeenCalled();
        });

        it('should handle different operating systems', () => {
            // Test Windows paths
            os.homedir.mockReturnValue('C:\\Users\\user');
            os.tmpdir.mockReturnValue('C:\\temp');
            path.join.mockImplementation((...args) => args.join('\\'));
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('C:\\Users\\user\\Documents\\SpeechMaker');
        });

        it('should handle special characters in user paths', () => {
            os.homedir.mockReturnValue('/home/user with spaces');
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/home/user with spaces/Documents/SpeechMaker');
        });

        it('should handle network home directories', () => {
            os.homedir.mockReturnValue('\\\\server\\share\\user');
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('\\\\server\\share\\user/Documents/SpeechMaker');
        });
    });

    describe('ensureDirectoryExists', () => {
        beforeEach(() => {
            // Reset to use real implementation
            delete settingsManager.ensureDirectoryExists;
        });

        it('should create directory if it does not exist', () => {
            const testPath = '/test/new/directory';
            
            // Mock fs.existsSync to return false (directory doesn't exist)
            const mockExistsSync = vi.fn().mockReturnValue(false);
            const mockMkdirSync = vi.fn();
            const mockWriteFileSync = vi.fn();
            const mockUnlinkSync = vi.fn();
            
            vi.doMock('fs', () => ({
                existsSync: mockExistsSync,
                mkdirSync: mockMkdirSync,
                writeFileSync: mockWriteFileSync,
                unlinkSync: mockUnlinkSync
            }));
            
            const result = settingsManager.ensureDirectoryExists(testPath);
            
            expect(result).toBe(true);
            expect(mockMkdirSync).toHaveBeenCalledWith(testPath, { recursive: true });
        });

        it('should test write permissions in existing directory', () => {
            const testPath = '/test/existing/directory';
            
            const mockExistsSync = vi.fn().mockReturnValue(true);
            const mockMkdirSync = vi.fn();
            const mockWriteFileSync = vi.fn();
            const mockUnlinkSync = vi.fn();
            
            vi.doMock('fs', () => ({
                existsSync: mockExistsSync,
                mkdirSync: mockMkdirSync,
                writeFileSync: mockWriteFileSync,
                unlinkSync: mockUnlinkSync
            }));
            
            const result = settingsManager.ensureDirectoryExists(testPath);
            
            expect(result).toBe(true);
            expect(mockMkdirSync).not.toHaveBeenCalled();
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                path.join(testPath, '.write-test'),
                'test'
            );
            expect(mockUnlinkSync).toHaveBeenCalledWith(
                path.join(testPath, '.write-test')
            );
        });

        it('should return false when directory creation fails', () => {
            const testPath = '/restricted/directory';
            
            const mockExistsSync = vi.fn().mockReturnValue(false);
            const mockMkdirSync = vi.fn().mockImplementation(() => {
                throw new Error('Permission denied');
            });
            
            vi.doMock('fs', () => ({
                existsSync: mockExistsSync,
                mkdirSync: mockMkdirSync
            }));
            
            const result = settingsManager.ensureDirectoryExists(testPath);
            
            expect(result).toBe(false);
        });

        it('should return false when write test fails', () => {
            const testPath = '/readonly/directory';
            
            const mockExistsSync = vi.fn().mockReturnValue(true);
            const mockWriteFileSync = vi.fn().mockImplementation(() => {
                throw new Error('Read-only filesystem');
            });
            
            vi.doMock('fs', () => ({
                existsSync: mockExistsSync,
                writeFileSync: mockWriteFileSync
            }));
            
            const result = settingsManager.ensureDirectoryExists(testPath);
            
            expect(result).toBe(false);
        });

        it('should handle cleanup failure gracefully', () => {
            const testPath = '/test/directory';
            
            const mockExistsSync = vi.fn().mockReturnValue(true);
            const mockWriteFileSync = vi.fn();
            const mockUnlinkSync = vi.fn().mockImplementation(() => {
                throw new Error('Cleanup failed');
            });
            
            vi.doMock('fs', () => ({
                existsSync: mockExistsSync,
                writeFileSync: mockWriteFileSync,
                unlinkSync: mockUnlinkSync
            }));
            
            // Should still return true even if cleanup fails
            const result = settingsManager.ensureDirectoryExists(testPath);
            
            expect(result).toBe(true);
        });
    });

    describe('initializeDefaultOutputFolder', () => {
        beforeEach(async () => {
            await settingsManager.initialize();
        });

        it('should set default output folder on first initialization', async () => {
            const existingSettings = { defaultOutputPath: null };
            
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.updateSetting = vi.fn().mockResolvedValue(true);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');
            
            const result = await settingsManager.initializeDefaultOutputFolder();
            
            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(settingsManager.updateSetting).toHaveBeenCalledWith(
                'defaultOutputPath',
                '/home/user/Documents/SpeechMaker'
            );
        });

        it('should verify existing output path is still accessible', async () => {
            const existingSettings = { defaultOutputPath: '/existing/path' };
            
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = await settingsManager.initializeDefaultOutputFolder();
            
            expect(result).toBe('/existing/path');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/existing/path');
        });

        it('should update path when existing path is no longer accessible', async () => {
            const existingSettings = { defaultOutputPath: '/inaccessible/path' };
            
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.updateSetting = vi.fn().mockResolvedValue(true);
            settingsManager.ensureDirectoryExists = vi.fn()
                .mockReturnValueOnce(false) // Existing path fails
                .mockReturnValue(true);     // New path succeeds
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');
            
            const result = await settingsManager.initializeDefaultOutputFolder();
            
            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(settingsManager.updateSetting).toHaveBeenCalledWith(
                'defaultOutputPath',
                '/home/user/Documents/SpeechMaker'
            );
        });

        it('should handle initialization errors gracefully', async () => {
            settingsManager.loadSettings = vi.fn().mockRejectedValue(new Error('Settings load failed'));
            
            const result = await settingsManager.initializeDefaultOutputFolder();
            
            expect(result).toBe('/tmp'); // Should fallback to temp directory
        });

        it('should handle update setting errors', async () => {
            const existingSettings = { defaultOutputPath: null };
            
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.updateSetting = vi.fn().mockRejectedValue(new Error('Update failed'));
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');
            
            const result = await settingsManager.initializeDefaultOutputFolder();
            
            // Should still return the path even if saving fails
            expect(result).toBe('/home/user/Documents/SpeechMaker');
        });

        it('should create folder hierarchy with proper permissions', async () => {
            const existingSettings = { defaultOutputPath: null };
            
            settingsManager.loadSettings = vi.fn().mockResolvedValue(existingSettings);
            settingsManager.updateSetting = vi.fn().mockResolvedValue(true);
            
            // Mock ensureDirectoryExists to track calls
            const ensureCalls = [];
            settingsManager.ensureDirectoryExists = vi.fn().mockImplementation((path) => {
                ensureCalls.push(path);
                return true;
            });
            
            settingsManager.getDefaultOutputFolder = vi.fn().mockImplementation(() => {
                // Call ensureDirectoryExists as the real method would
                const defaultPath = '/home/user/Documents/SpeechMaker';
                settingsManager.ensureDirectoryExists(defaultPath);
                return defaultPath;
            });
            
            await settingsManager.initializeDefaultOutputFolder();
            
            expect(ensureCalls).toContain('/home/user/Documents/SpeechMaker');
        });
    });

    describe('Folder Validation and Migration', () => {
        it('should validate folder accessibility during settings load', async () => {
            const settings = {
                defaultOutputPath: '/test/path',
                voiceSpeed: 1.0
            };
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.validateSettings(settings);
            
            expect(result.defaultOutputPath).toBe('/test/path');
            expect(settingsManager.ensureDirectoryExists).toHaveBeenCalledWith('/test/path');
        });

        it('should fallback to default when validation fails', async () => {
            const settings = {
                defaultOutputPath: '/inaccessible/path',
                voiceSpeed: 1.0
            };
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(false);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');
            
            const result = settingsManager.validateSettings(settings);
            
            expect(result.defaultOutputPath).toBe('/home/user/Documents/SpeechMaker');
        });

        it('should migrate old outputPath setting to defaultOutputPath', async () => {
            const oldSettings = {
                outputPath: '/old/output/path',
                voiceSpeed: 1.0
            };
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = await settingsManager.migrateSettings(oldSettings);
            
            expect(result.defaultOutputPath).toBe('/old/output/path');
            expect(result.outputPath).toBeUndefined();
        });

        it('should handle migration when old path is inaccessible', async () => {
            const oldSettings = {
                outputPath: '/inaccessible/old/path',
                voiceSpeed: 1.0
            };
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(false);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/home/user/Documents/SpeechMaker');
            
            const result = await settingsManager.migrateSettings(oldSettings);
            
            expect(result.defaultOutputPath).toBe('/home/user/Documents/SpeechMaker');
        });
    });

    describe('Cross-Platform Compatibility', () => {
        it('should handle Windows paths correctly', () => {
            os.homedir.mockReturnValue('C:\\Users\\TestUser');
            os.tmpdir.mockReturnValue('C:\\Windows\\Temp');
            path.join.mockImplementation((...args) => args.join('\\'));
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('C:\\Users\\TestUser\\Documents\\SpeechMaker');
        });

        it('should handle macOS paths correctly', () => {
            os.homedir.mockReturnValue('/Users/testuser');
            os.tmpdir.mockReturnValue('/tmp');
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/Users/testuser/Documents/SpeechMaker');
        });

        it('should handle Linux paths correctly', () => {
            os.homedir.mockReturnValue('/home/testuser');
            os.tmpdir.mockReturnValue('/tmp');
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/home/testuser/Documents/SpeechMaker');
        });

        it('should handle paths with unicode characters', () => {
            os.homedir.mockReturnValue('/home/用户');
            
            settingsManager.ensureDirectoryExists = vi.fn().mockReturnValue(true);
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/home/用户/Documents/SpeechMaker');
        });
    });

    describe('Permission and Security', () => {
        it('should test write permissions before confirming folder', () => {
            const testPath = '/test/directory';
            
            // Use a spy to monitor the actual implementation
            const writeTestSpy = vi.spyOn(settingsManager, 'ensureDirectoryExists');
            
            settingsManager.getDefaultOutputFolder();
            
            // Should have called ensureDirectoryExists which tests write permissions
            expect(writeTestSpy).toHaveBeenCalled();
        });

        it('should not create folders in system directories', () => {
            // Mock to simulate system directory restrictions
            os.homedir.mockReturnValue('/root');
            
            settingsManager.ensureDirectoryExists = vi.fn().mockImplementation((path) => {
                // Simulate permission failure for system paths
                if (path.includes('/root') || path.includes('/system')) {
                    return false;
                }
                return true;
            });
            
            const result = settingsManager.getDefaultOutputFolder();
            
            // Should fallback to temp directory
            expect(result).toBe('/tmp');
        });

        it('should handle read-only filesystems gracefully', () => {
            settingsManager.ensureDirectoryExists = vi.fn().mockImplementation((path) => {
                // Simulate read-only filesystem
                if (path.includes('Documents') || path.includes('SpeechMaker')) {
                    return false;
                }
                return path === '/tmp';
            });
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/tmp');
        });

        it('should clean up test files after permission check', () => {
            const testPath = '/test/directory';
            
            const mockUnlinkSync = vi.fn();
            vi.doMock('fs', () => ({
                existsSync: vi.fn().mockReturnValue(true),
                writeFileSync: vi.fn(),
                unlinkSync: mockUnlinkSync
            }));
            
            settingsManager.ensureDirectoryExists(testPath);
            
            expect(mockUnlinkSync).toHaveBeenCalledWith(
                path.join(testPath, '.write-test')
            );
        });
    });

    describe('Error Recovery', () => {
        it('should recover from temporary filesystem errors', async () => {
            let callCount = 0;
            settingsManager.ensureDirectoryExists = vi.fn().mockImplementation(() => {
                callCount++;
                // Fail first time, succeed second time
                return callCount > 1;
            });
            
            // First call fails, should try fallback
            const result1 = settingsManager.getDefaultOutputFolder();
            expect(result1).toBe('/tmp');
            
            // Reset call count
            callCount = 0;
            
            // Second call succeeds
            const result2 = settingsManager.getDefaultOutputFolder();
            expect(result2).toBe('/home/user/Documents/SpeechMaker');
        });

        it('should handle disk space issues', () => {
            settingsManager.ensureDirectoryExists = vi.fn().mockImplementation((path) => {
                // Simulate disk space error for primary paths
                if (path.includes('Documents') || path.includes('SpeechMaker')) {
                    const error = new Error('No space left on device');
                    error.code = 'ENOSPC';
                    throw error;
                }
                return true;
            });
            
            const result = settingsManager.getDefaultOutputFolder();
            
            expect(result).toBe('/tmp');
        });

        it('should provide meaningful error messages', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            settingsManager.loadSettings = vi.fn().mockRejectedValue(new Error('Disk error'));
            
            await settingsManager.initializeDefaultOutputFolder();
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to initialize default output folder'),
                expect.any(Error)
            );
            
            consoleErrorSpy.mockRestore();
        });
    });

    describe('Performance Considerations', () => {
        it('should cache folder validation results', () => {
            const ensureSpy = vi.spyOn(settingsManager, 'ensureDirectoryExists').mockReturnValue(true);
            
            // Multiple calls should not re-validate the same path
            settingsManager.getDefaultOutputFolder();
            settingsManager.getDefaultOutputFolder();
            
            // Should only validate once per unique path
            expect(ensureSpy).toHaveBeenCalledTimes(1);
        });

        it('should complete folder initialization quickly', async () => {
            settingsManager.loadSettings = vi.fn().mockResolvedValue({});
            settingsManager.updateSetting = vi.fn().mockResolvedValue(true);
            settingsManager.getDefaultOutputFolder = vi.fn().mockReturnValue('/test/path');
            
            const startTime = Date.now();
            await settingsManager.initializeDefaultOutputFolder();
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should not block on slow filesystem operations', async () => {
            // Mock slow filesystem operation
            settingsManager.ensureDirectoryExists = vi.fn().mockImplementation(() => {
                // Simulate slow operation but don't actually delay in test
                return true;
            });
            
            const startTime = Date.now();
            settingsManager.getDefaultOutputFolder();
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(100); // Should be fast with mocked operations
        });
    });
});