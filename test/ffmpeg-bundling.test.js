/**
 * Unit tests for FFmpeg bundling functionality
 * Tests bundled FFmpeg detection, validation, and fallback mechanisms
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('child_process');
vi.mock('util');

const mockExecAsync = vi.fn();
vi.mock('util', () => ({
    promisify: vi.fn(() => mockExecAsync)
}));

describe('FFmpeg Bundling', () => {
    let AudioProcessor;
    let audioProcessor;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Setup path mocks
        path.join.mockImplementation((...args) => args.join('/'));
        path.dirname.mockReturnValue('/test/dir');
        
        // Setup fs mocks
        fs.access.mockResolvedValue();
        fs.mkdir.mockResolvedValue();
        
        // Import AudioProcessor after mocks are set up
        const module = await import('../src/main/services/audioProcessor.js');
        AudioProcessor = module.default;
        audioProcessor = new AudioProcessor();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('getBundledFFmpegPath', () => {
        it('should return correct path for development environment', () => {
            const originalEnv = process.env.NODE_ENV;
            const originalDirname = __dirname;
            
            process.env.NODE_ENV = 'development';
            
            const result = audioProcessor.getBundledFFmpegPath();
            
            expect(path.join).toHaveBeenCalledWith(
                expect.stringContaining('__dirname'),
                '../../..',
                'resources',
                'ffmpeg',
                process.platform,
                process.arch,
                'ffmpeg.exe'
            );
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should return correct path for production environment', () => {
            const originalEnv = process.env.NODE_ENV;
            const originalResourcesPath = process.resourcesPath;
            
            process.env.NODE_ENV = 'production';
            process.resourcesPath = '/app/resources';
            
            const result = audioProcessor.getBundledFFmpegPath();
            
            expect(path.join).toHaveBeenCalledWith(
                '/app/resources',
                'resources',
                'ffmpeg',
                process.platform,
                process.arch,
                'ffmpeg.exe'
            );
            
            process.env.NODE_ENV = originalEnv;
            process.resourcesPath = originalResourcesPath;
        });

        it('should handle different platforms and architectures', () => {
            const originalPlatform = process.platform;
            const originalArch = process.arch;
            
            // Test Windows x64
            Object.defineProperty(process, 'platform', { value: 'win32' });
            Object.defineProperty(process, 'arch', { value: 'x64' });
            
            audioProcessor.getBundledFFmpegPath();
            
            expect(path.join).toHaveBeenCalledWith(
                expect.any(String),
                'resources',
                'ffmpeg',
                'win32',
                'x64',
                'ffmpeg.exe'
            );
            
            // Test Windows x86
            Object.defineProperty(process, 'arch', { value: 'ia32' });
            
            audioProcessor.getBundledFFmpegPath();
            
            expect(path.join).toHaveBeenCalledWith(
                expect.any(String),
                'resources',
                'ffmpeg',
                'win32',
                'ia32',
                'ffmpeg.exe'
            );
            
            // Restore original values
            Object.defineProperty(process, 'platform', { value: originalPlatform });
            Object.defineProperty(process, 'arch', { value: originalArch });
        });
    });

    describe('validateFFmpeg', () => {
        it('should validate bundled FFmpeg executable', async () => {
            fs.access.mockResolvedValue();
            mockExecAsync.mockResolvedValue({
                stdout: 'ffmpeg version 4.4.0-0ubuntu1 Copyright (c) 2000-2021',
                stderr: ''
            });
            
            const result = await audioProcessor.validateFFmpeg('/bundled/ffmpeg.exe');
            
            expect(result.valid).toBe(true);
            expect(result.version).toBe('4.4.0-0ubuntu1');
            expect(result.error).toBe(null);
            expect(fs.access).toHaveBeenCalledWith('/bundled/ffmpeg.exe');
        });

        it('should handle missing bundled FFmpeg', async () => {
            fs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));
            
            const result = await audioProcessor.validateFFmpeg('/missing/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('FFmpeg validation failed');
        });

        it('should handle corrupted FFmpeg executable', async () => {
            fs.access.mockResolvedValue();
            mockExecAsync.mockResolvedValue({
                stdout: 'invalid output',
                stderr: 'not a valid executable'
            });
            
            const result = await audioProcessor.validateFFmpeg('/corrupted/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toBe('FFmpeg version check failed');
        });

        it('should extract version from different FFmpeg output formats', async () => {
            const testCases = [
                {
                    output: 'ffmpeg version 4.4.0-0ubuntu1 Copyright (c) 2000-2021',
                    expectedVersion: '4.4.0-0ubuntu1'
                },
                {
                    output: 'ffmpeg version N-104274-g19c0fea4d9 Copyright (c) 2000-2021',
                    expectedVersion: 'N-104274-g19c0fea4d9'
                },
                {
                    output: 'ffmpeg version 5.1.2 Copyright (c) 2000-2022',
                    expectedVersion: '5.1.2'
                }
            ];
            
            for (const testCase of testCases) {
                fs.access.mockResolvedValue();
                mockExecAsync.mockResolvedValue({
                    stdout: testCase.output,
                    stderr: ''
                });
                
                const result = await audioProcessor.validateFFmpeg('/test/ffmpeg.exe');
                
                expect(result.valid).toBe(true);
                expect(result.version).toBe(testCase.expectedVersion);
            }
        });

        it('should handle FFmpeg execution timeout', async () => {
            fs.access.mockResolvedValue();
            mockExecAsync.mockRejectedValue(new Error('Command timed out'));
            
            const result = await audioProcessor.validateFFmpeg('/slow/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('FFmpeg validation failed: Command timed out');
        });
    });

    describe('initializeFFmpeg', () => {
        beforeEach(() => {
            vi.spyOn(audioProcessor, 'getBundledFFmpegPath');
            vi.spyOn(audioProcessor, 'detectSystemFFmpeg');
            vi.spyOn(audioProcessor, 'validateFFmpeg');
        });

        it('should prioritize bundled FFmpeg when available', async () => {
            audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: true,
                version: '4.4.0',
                error: null
            });
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(true);
            expect(result.source).toBe('bundled');
            expect(result.path).toBe('/bundled/ffmpeg.exe');
            expect(result.version).toBe('4.4.0');
            expect(audioProcessor.ffmpegPath).toBe('/bundled/ffmpeg.exe');
            expect(audioProcessor.ffmpegStatus.available).toBe(true);
            expect(audioProcessor.ffmpegStatus.source).toBe('bundled');
        });

        it('should fallback to system FFmpeg when bundled fails', async () => {
            audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            audioProcessor.detectSystemFFmpeg.mockResolvedValue('/system/ffmpeg.exe');
            audioProcessor.validateFFmpeg
                .mockResolvedValueOnce({ valid: false, version: null, error: 'Bundled failed' })
                .mockResolvedValueOnce({ valid: true, version: '4.3.0', error: null });
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(true);
            expect(result.source).toBe('system');
            expect(result.path).toBe('/system/ffmpeg.exe');
            expect(result.version).toBe('4.3.0');
            expect(audioProcessor.ffmpegPath).toBe('/system/ffmpeg.exe');
        });

        it('should return unavailable when no FFmpeg found', async () => {
            audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            audioProcessor.detectSystemFFmpeg.mockResolvedValue(null);
            audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: false,
                version: null,
                error: 'Not found'
            });
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(false);
            expect(result.source).toBe('none');
            expect(result.error).toBe('No working FFmpeg installation found');
            expect(audioProcessor.ffmpegStatus.available).toBe(false);
        });

        it('should handle initialization errors gracefully', async () => {
            audioProcessor.getBundledFFmpegPath.mockImplementation(() => {
                throw new Error('Path resolution failed');
            });
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(false);
            expect(result.error).toContain('FFmpeg initialization failed: Path resolution failed');
        });

        it('should update FFmpeg status correctly', async () => {
            audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: true,
                version: '4.4.0',
                error: null
            });
            
            await audioProcessor.initializeFFmpeg();
            
            expect(audioProcessor.ffmpegStatus).toEqual({
                available: true,
                source: 'bundled',
                path: '/bundled/ffmpeg.exe',
                version: '4.4.0',
                validated: true,
                error: null
            });
        });

        it('should set FFmpeg path in fluent-ffmpeg', async () => {
            const mockSetFfmpegPath = vi.fn();
            vi.doMock('fluent-ffmpeg', () => ({
                setFfmpegPath: mockSetFfmpegPath
            }));
            
            audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            audioProcessor.validateFFmpeg.mockResolvedValue({
                valid: true,
                version: '4.4.0',
                error: null
            });
            
            await audioProcessor.initializeFFmpeg();
            
            expect(mockSetFfmpegPath).toHaveBeenCalledWith('/bundled/ffmpeg.exe');
        });
    });

    describe('FFmpeg Status Management', () => {
        it('should return copy of FFmpeg status', () => {
            audioProcessor.ffmpegStatus = {
                available: true,
                source: 'bundled',
                path: '/test/ffmpeg.exe',
                version: '4.4.0',
                validated: true,
                error: null
            };
            
            const status = audioProcessor.getFFmpegStatus();
            
            expect(status).toEqual(audioProcessor.ffmpegStatus);
            expect(status).not.toBe(audioProcessor.ffmpegStatus); // Should be a copy
        });

        it('should validate FFmpeg installation with caching', async () => {
            vi.spyOn(audioProcessor, 'initializeFFmpeg');
            
            // First call should initialize
            audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            let result = await audioProcessor.validateFFmpegInstallation();
            expect(result).toBe(true);
            expect(audioProcessor.initializeFFmpeg).toHaveBeenCalledTimes(1);
            
            // Second call should use cached result
            result = await audioProcessor.validateFFmpegInstallation();
            expect(result).toBe(true);
            expect(audioProcessor.initializeFFmpeg).toHaveBeenCalledTimes(1); // Not called again
        });

        it('should re-initialize when validation state is reset', async () => {
            vi.spyOn(audioProcessor, 'initializeFFmpeg');
            
            audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            // First validation
            await audioProcessor.validateFFmpegInstallation();
            
            // Reset validation state
            audioProcessor.isFFmpegValidated = false;
            
            // Second validation should re-initialize
            await audioProcessor.validateFFmpegInstallation();
            
            expect(audioProcessor.initializeFFmpeg).toHaveBeenCalledTimes(2);
        });
    });

    describe('System FFmpeg Detection', () => {
        it('should detect system FFmpeg using where command', async () => {
            mockExecAsync.mockResolvedValue({
                stdout: 'C:\\ffmpeg\\bin\\ffmpeg.exe\n',
                stderr: ''
            });
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe');
            expect(mockExecAsync).toHaveBeenCalledWith('where ffmpeg');
        });

        it('should fallback to PATH detection when where command fails', async () => {
            mockExecAsync
                .mockRejectedValueOnce(new Error('where command not found'))
                .mockResolvedValueOnce({
                    stdout: 'ffmpeg version 4.4.0',
                    stderr: ''
                });
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe('ffmpeg');
            expect(mockExecAsync).toHaveBeenCalledWith('where ffmpeg');
            expect(mockExecAsync).toHaveBeenCalledWith('ffmpeg -version');
        });

        it('should return null when no system FFmpeg found', async () => {
            mockExecAsync
                .mockRejectedValueOnce(new Error('where command failed'))
                .mockRejectedValueOnce(new Error('ffmpeg command failed'));
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe(null);
        });

        it('should handle multiple FFmpeg paths from where command', async () => {
            mockExecAsync.mockResolvedValue({
                stdout: 'C:\\ffmpeg\\bin\\ffmpeg.exe\nC:\\other\\ffmpeg.exe\n',
                stderr: ''
            });
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe'); // Should return first valid path
        });
    });

    describe('Error Handling', () => {
        it('should handle file system errors gracefully', async () => {
            fs.access.mockRejectedValue(new Error('Permission denied'));
            
            const result = await audioProcessor.validateFFmpeg('/restricted/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('FFmpeg validation failed');
        });

        it('should handle network-related errors during detection', async () => {
            mockExecAsync.mockRejectedValue(new Error('Network is unreachable'));
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe(null);
        });

        it('should provide detailed error information', async () => {
            const specificError = new Error('Specific validation error');
            mockExecAsync.mockRejectedValue(specificError);
            
            const result = await audioProcessor.validateFFmpeg('/test/ffmpeg.exe');
            
            expect(result.error).toContain('Specific validation error');
        });
    });

    describe('Performance Considerations', () => {
        it('should validate FFmpeg within reasonable time', async () => {
            fs.access.mockResolvedValue();
            mockExecAsync.mockResolvedValue({
                stdout: 'ffmpeg version 4.4.0',
                stderr: ''
            });
            
            const startTime = Date.now();
            await audioProcessor.validateFFmpeg('/test/ffmpeg.exe');
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        });

        it('should cache validation results to avoid repeated checks', async () => {
            vi.spyOn(audioProcessor, 'initializeFFmpeg');
            
            audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            // Multiple calls should only initialize once
            await audioProcessor.validateFFmpegInstallation();
            await audioProcessor.validateFFmpegInstallation();
            await audioProcessor.validateFFmpegInstallation();
            
            expect(audioProcessor.initializeFFmpeg).toHaveBeenCalledTimes(1);
        });
    });
});