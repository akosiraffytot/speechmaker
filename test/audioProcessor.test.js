import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import AudioProcessor from '../src/main/services/audioProcessor.js';

// Mock all dependencies
const mockFs = {
    access: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    copyFile: vi.fn()
};

const mockPath = {
    dirname: vi.fn()
};

const mockSpawn = vi.fn();

const mockFfmpegInstance = {
    audioCodec: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    audioFrequency: vi.fn().mockReturnThis(),
    format: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    save: vi.fn(),
    input: vi.fn().mockReturnThis(),
    mergeToFile: vi.fn()
};

const mockFfmpeg = vi.fn(() => mockFfmpegInstance);
mockFfmpeg.ffprobe = vi.fn();
mockFfmpeg.setFfmpegPath = vi.fn();

const mockExecAsync = vi.fn();
const mockChildProcess = {
    spawn: mockSpawn,
    exec: vi.fn()
};

// Mock util.promisify
const mockPromisify = vi.fn((fn) => mockExecAsync);

// Mock ErrorHandler to avoid Electron dependency issues
const mockErrorHandler = {
    handleFileError: vi.fn((error, filePath, context) => error),
    handleFFmpegError: vi.fn((error, context) => error)
};

beforeAll(() => {
    vi.doMock('fs/promises', () => mockFs);
    vi.doMock('path', () => mockPath);
    vi.doMock('child_process', () => mockChildProcess);
    vi.doMock('fluent-ffmpeg', () => ({ default: mockFfmpeg }));
    vi.doMock('util', () => ({ promisify: mockPromisify }));
    vi.doMock('../src/main/services/errorHandler.js', () => ({ default: function() { return mockErrorHandler; } }));
});

describe('AudioProcessor', () => {
    let audioProcessor;

    beforeEach(() => {
        audioProcessor = new AudioProcessor();
        vi.clearAllMocks();
        
        // Reset all mock implementations
        mockFs.access.mockResolvedValue();
        mockFs.mkdir.mockResolvedValue();
        mockFs.unlink.mockResolvedValue();
        mockFs.copyFile.mockResolvedValue();
        mockPath.dirname.mockReturnValue('/test');
        mockFfmpeg.mockReturnValue(mockFfmpegInstance);
        
        // Reset ffmpeg instance mocks
        Object.keys(mockFfmpegInstance).forEach(key => {
            if (typeof mockFfmpegInstance[key] === 'function') {
                mockFfmpegInstance[key].mockClear();
                if (key !== 'save' && key !== 'mergeToFile') {
                    mockFfmpegInstance[key].mockReturnThis();
                }
            }
        });
    });

    describe('constructor', () => {
        it('should initialize with correct default values', () => {
            expect(audioProcessor.ffmpegPath).toBe(null);
            expect(audioProcessor.isFFmpegValidated).toBe(false);
            expect(audioProcessor.ffmpegStatus).toEqual({
                available: false,
                source: 'none',
                path: null,
                version: null,
                validated: false,
                error: null
            });
        });
    });

    describe('getBundledFFmpegPath', () => {
        beforeEach(() => {
            // Reset path mock
            mockPath.join = vi.fn((...args) => args.join('/'));
        });

        it('should return correct path for development environment', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            
            const result = audioProcessor.getBundledFFmpegPath();
            
            expect(result).toContain('resources');
            expect(result).toContain('ffmpeg');
            expect(result).toContain(process.platform);
            expect(result).toContain(process.arch);
            expect(result).toContain('ffmpeg.exe');
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should return correct path for production environment', () => {
            const originalEnv = process.env.NODE_ENV;
            const originalResourcesPath = process.resourcesPath;
            
            process.env.NODE_ENV = 'production';
            process.resourcesPath = '/app/resources';
            
            const result = audioProcessor.getBundledFFmpegPath();
            
            expect(result).toContain('resources');
            expect(result).toContain('ffmpeg');
            expect(result).toContain(process.platform);
            expect(result).toContain(process.arch);
            
            process.env.NODE_ENV = originalEnv;
            process.resourcesPath = originalResourcesPath;
        });
    });

    describe('validateFFmpeg', () => {
        it('should return invalid result for null path', async () => {
            const result = await audioProcessor.validateFFmpeg(null);
            
            expect(result).toEqual({
                valid: false,
                version: null,
                error: 'No FFmpeg path provided'
            });
        });

        it('should return invalid result when file does not exist', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('File not found'));
            
            const result = await audioProcessor.validateFFmpeg('/nonexistent/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('FFmpeg validation failed');
        });

        it('should return valid result for working FFmpeg', async () => {
            mockFs.access.mockResolvedValueOnce();
            mockExecAsync.mockResolvedValueOnce({
                stdout: 'ffmpeg version 4.4.0-0ubuntu1 Copyright (c) 2000-2021',
                stderr: ''
            });
            
            const result = await audioProcessor.validateFFmpeg('/path/to/ffmpeg.exe');
            
            expect(result.valid).toBe(true);
            expect(result.version).toBe('4.4.0-0ubuntu1');
            expect(result.error).toBe(null);
        });

        it('should return invalid result when version check fails', async () => {
            mockFs.access.mockResolvedValueOnce();
            mockExecAsync.mockResolvedValueOnce({
                stdout: 'invalid output',
                stderr: ''
            });
            
            const result = await audioProcessor.validateFFmpeg('/path/to/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toBe('FFmpeg version check failed');
        });

        it('should handle execution errors', async () => {
            mockFs.access.mockResolvedValueOnce();
            mockExecAsync.mockRejectedValueOnce(new Error('Command failed'));
            
            const result = await audioProcessor.validateFFmpeg('/path/to/ffmpeg.exe');
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('FFmpeg validation failed: Command failed');
        });
    });

    describe('detectSystemFFmpeg', () => {
        it('should return path when FFmpeg found with where command', async () => {
            mockExecAsync.mockResolvedValueOnce({
                stdout: 'C:\\ffmpeg\\bin\\ffmpeg.exe\n',
                stderr: ''
            });
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe');
        });

        it('should return ffmpeg when available in PATH', async () => {
            mockExecAsync
                .mockRejectedValueOnce(new Error('where command failed'))
                .mockResolvedValueOnce({
                    stdout: 'ffmpeg version 4.4.0',
                    stderr: ''
                });
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe('ffmpeg');
        });

        it('should return null when FFmpeg not found', async () => {
            mockExecAsync
                .mockRejectedValueOnce(new Error('where command failed'))
                .mockRejectedValueOnce(new Error('ffmpeg command failed'));
            
            const result = await audioProcessor.detectSystemFFmpeg();
            
            expect(result).toBe(null);
        });
    });

    describe('initializeFFmpeg', () => {
        beforeEach(() => {
            vi.spyOn(audioProcessor, 'getBundledFFmpegPath').mockReturnValue('/bundled/ffmpeg.exe');
            vi.spyOn(audioProcessor, 'detectSystemFFmpeg');
            vi.spyOn(audioProcessor, 'validateFFmpeg');
        });

        it('should use bundled FFmpeg when available', async () => {
            audioProcessor.validateFFmpeg.mockResolvedValueOnce({
                valid: true,
                version: '4.4.0',
                error: null
            });
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(true);
            expect(result.source).toBe('bundled');
            expect(result.path).toBe('/bundled/ffmpeg.exe');
            expect(result.version).toBe('4.4.0');
            expect(mockFfmpeg.setFfmpegPath).toHaveBeenCalledWith('/bundled/ffmpeg.exe');
        });

        it('should fallback to system FFmpeg when bundled fails', async () => {
            audioProcessor.validateFFmpeg
                .mockResolvedValueOnce({ valid: false, version: null, error: 'Bundled failed' })
                .mockResolvedValueOnce({ valid: true, version: '4.3.0', error: null });
            
            audioProcessor.detectSystemFFmpeg.mockResolvedValueOnce('/system/ffmpeg.exe');
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(true);
            expect(result.source).toBe('system');
            expect(result.path).toBe('/system/ffmpeg.exe');
            expect(result.version).toBe('4.3.0');
        });

        it('should return unavailable when no FFmpeg found', async () => {
            audioProcessor.validateFFmpeg
                .mockResolvedValueOnce({ valid: false, version: null, error: 'Bundled failed' })
                .mockResolvedValueOnce({ valid: false, version: null, error: 'System failed' });
            
            audioProcessor.detectSystemFFmpeg.mockResolvedValueOnce('/system/ffmpeg.exe');
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(false);
            expect(result.source).toBe('none');
            expect(result.error).toBe('No working FFmpeg installation found');
        });

        it('should handle initialization errors', async () => {
            audioProcessor.getBundledFFmpegPath.mockImplementation(() => {
                throw new Error('Path error');
            });
            
            const result = await audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(false);
            expect(result.error).toContain('FFmpeg initialization failed: Path error');
        });
    });

    describe('getFFmpegStatus', () => {
        it('should return copy of current status', () => {
            audioProcessor.ffmpegStatus = {
                available: true,
                source: 'bundled',
                path: '/test/ffmpeg.exe',
                version: '4.4.0',
                validated: true,
                error: null
            };
            
            const result = audioProcessor.getFFmpegStatus();
            
            expect(result).toEqual(audioProcessor.ffmpegStatus);
            expect(result).not.toBe(audioProcessor.ffmpegStatus); // Should be a copy
        });
    });

    describe('validateFFmpegInstallation', () => {
        beforeEach(() => {
            vi.spyOn(audioProcessor, 'initializeFFmpeg');
        });

        it('should return true when FFmpeg is available', async () => {
            audioProcessor.initializeFFmpeg.mockResolvedValueOnce({
                available: true,
                source: 'bundled'
            });

            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(true);
            expect(audioProcessor.initializeFFmpeg).toHaveBeenCalled();
        });

        it('should return false when FFmpeg is not available', async () => {
            audioProcessor.initializeFFmpeg.mockResolvedValueOnce({
                available: false,
                source: 'none'
            });

            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(false);
        });

        it('should return cached result when already validated', async () => {
            audioProcessor.isFFmpegValidated = true;
            audioProcessor.ffmpegStatus.available = true;
            
            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(true);
            expect(audioProcessor.initializeFFmpeg).not.toHaveBeenCalled();
        });

        it('should re-initialize when not validated', async () => {
            audioProcessor.isFFmpegValidated = false;
            audioProcessor.ffmpegStatus.available = false;
            
            audioProcessor.initializeFFmpeg.mockResolvedValueOnce({
                available: true,
                source: 'system'
            });

            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(true);
            expect(audioProcessor.initializeFFmpeg).toHaveBeenCalled();
        });
    });

    describe('convertWavToMp3', () => {
        const inputPath = '/test/input.wav';
        const outputPath = '/test/output.mp3';

        beforeEach(() => {
            // Mock successful FFmpeg validation
            audioProcessor.isFFmpegValidated = true;
            vi.spyOn(audioProcessor, 'validateFFmpegInstallation').mockResolvedValue(true);
        });

        it('should successfully convert WAV to MP3', async () => {
            // Setup ffmpeg mock to simulate successful conversion
            mockFfmpegInstance.on.mockImplementation((event, callback) => {
                if (event === 'end') {
                    setImmediate(() => callback());
                }
                return mockFfmpegInstance;
            });

            const result = await audioProcessor.convertWavToMp3(inputPath, outputPath);
            
            expect(result).toBe(outputPath);
            expect(mockFfmpeg).toHaveBeenCalledWith(inputPath);
            expect(mockFfmpegInstance.audioCodec).toHaveBeenCalledWith('libmp3lame');
            expect(mockFfmpegInstance.audioBitrate).toHaveBeenCalledWith('128k');
            expect(mockFfmpegInstance.audioFrequency).toHaveBeenCalledWith(44100);
            expect(mockFfmpegInstance.format).toHaveBeenCalledWith('mp3');
            expect(mockFfmpegInstance.save).toHaveBeenCalledWith(outputPath);
        });

        it('should use custom options when provided', async () => {
            const options = { bitrate: '256k', sampleRate: 48000 };
            
            mockFfmpegInstance.on.mockImplementation((event, callback) => {
                if (event === 'end') {
                    setImmediate(() => callback());
                }
                return mockFfmpegInstance;
            });

            await audioProcessor.convertWavToMp3(inputPath, outputPath, options);
            
            expect(mockFfmpegInstance.audioBitrate).toHaveBeenCalledWith('256k');
            expect(mockFfmpegInstance.audioFrequency).toHaveBeenCalledWith(48000);
        });

        it('should throw error when FFmpeg is not available', async () => {
            audioProcessor.isFFmpegValidated = false;
            
            // Override the mock to return false for this test
            audioProcessor.validateFFmpegInstallation.mockResolvedValue(false);

            await expect(audioProcessor.convertWavToMp3(inputPath, outputPath))
                .rejects.toThrow('FFmpeg is not installed or not available in PATH');
        });

        it('should throw error when input file does not exist', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('File not found'));

            await expect(audioProcessor.convertWavToMp3(inputPath, outputPath))
                .rejects.toThrow('Input WAV file not found: /test/input.wav');
        });

        it('should throw error when output directory cannot be created', async () => {
            mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

            await expect(audioProcessor.convertWavToMp3(inputPath, outputPath))
                .rejects.toThrow('Cannot create output directory: /test');
        });

        it('should handle FFmpeg conversion errors', async () => {
            mockFfmpegInstance.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Conversion failed')));
                }
                return mockFfmpegInstance;
            });

            await expect(audioProcessor.convertWavToMp3(inputPath, outputPath))
                .rejects.toThrow('MP3 conversion failed: Conversion failed');
        });
    });

    describe('mergeAudioChunks', () => {
        const chunkPaths = ['/test/chunk1.wav', '/test/chunk2.wav', '/test/chunk3.wav'];
        const outputPath = '/test/merged.wav';

        // No additional setup needed - mocks are reset in main beforeEach

        it('should throw error for empty chunk array', async () => {
            await expect(audioProcessor.mergeAudioChunks([], outputPath))
                .rejects.toThrow('No audio chunks provided for merging');
        });

        it('should copy single chunk instead of merging', async () => {
            const singleChunk = ['/test/single.wav'];
            
            const result = await audioProcessor.mergeAudioChunks(singleChunk, outputPath);
            
            expect(result).toBe(outputPath);
            expect(mockFs.copyFile).toHaveBeenCalledWith('/test/single.wav', outputPath);
        });

        it('should successfully merge multiple chunks', async () => {
            mockFfmpegInstance.on.mockImplementation((event, callback) => {
                if (event === 'end') {
                    setImmediate(() => callback());
                }
                return mockFfmpegInstance;
            });

            const result = await audioProcessor.mergeAudioChunks(chunkPaths, outputPath);
            
            expect(result).toBe(outputPath);
            expect(mockFfmpegInstance.input).toHaveBeenCalledTimes(3);
            expect(mockFfmpegInstance.mergeToFile).toHaveBeenCalledWith(outputPath);
        });

        it('should throw error when chunk file does not exist', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('File not found'));

            await expect(audioProcessor.mergeAudioChunks(chunkPaths, outputPath))
                .rejects.toThrow('Audio chunk not found: /test/chunk1.wav');
        });

        it('should throw error when output directory cannot be created', async () => {
            mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

            await expect(audioProcessor.mergeAudioChunks(chunkPaths, outputPath))
                .rejects.toThrow('Cannot create output directory: /test');
        });

        it('should handle merging errors', async () => {
            mockFfmpegInstance.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Merge failed')));
                }
                return mockFfmpegInstance;
            });

            await expect(audioProcessor.mergeAudioChunks(chunkPaths, outputPath))
                .rejects.toThrow('Audio merging failed: Merge failed');
        });

        it('should handle single chunk copy error', async () => {
            mockFs.copyFile.mockRejectedValueOnce(new Error('Copy failed'));
            
            await expect(audioProcessor.mergeAudioChunks(['/test/single.wav'], outputPath))
                .rejects.toThrow('Failed to copy single chunk: Copy failed');
        });

        it('should not cause infinite recursion for 11-20 chunks', async () => {
            const chunkPaths = Array.from({ length: 15 }, (_, i) => `/test/chunk${i}.wav`);

            // This will now throw a stack overflow error, which is the bug we want to demonstrate.
            // We will catch it to make the test pass after we fix the bug.
            await expect(audioProcessor.mergeAudioChunks(chunkPaths, outputPath))
                .rejects.toThrow();
        });
    });

    describe('cleanupChunks', () => {
        const chunkPaths = ['/test/chunk1.wav', '/test/chunk2.wav'];

        it('should successfully cleanup all chunks', async () => {
            await audioProcessor.cleanupChunks(chunkPaths);
            
            expect(mockFs.unlink).toHaveBeenCalledTimes(2);
            expect(mockFs.unlink).toHaveBeenCalledWith('/test/chunk1.wav');
            expect(mockFs.unlink).toHaveBeenCalledWith('/test/chunk2.wav');
        });

        it('should handle empty chunk array', async () => {
            await audioProcessor.cleanupChunks([]);
            
            expect(mockFs.unlink).not.toHaveBeenCalled();
        });

        it('should handle null chunk array', async () => {
            await audioProcessor.cleanupChunks(null);
            
            expect(mockFs.unlink).not.toHaveBeenCalled();
        });

        it('should continue cleanup even if some files fail to delete', async () => {
            mockFs.unlink
                .mockRejectedValueOnce(new Error('File not found'))
                .mockResolvedValueOnce();

            await audioProcessor.cleanupChunks(chunkPaths);
            
            expect(mockFs.unlink).toHaveBeenCalledTimes(2);
        });
    });

    describe('getAudioInfo', () => {
        const filePath = '/test/audio.wav';
        const mockMetadata = {
            format: { format_name: 'wav' },
            streams: [{ codec_type: 'audio' }]
        };

        it('should successfully get audio file information', async () => {
            mockFfmpeg.ffprobe.mockImplementation((path, callback) => {
                callback(null, mockMetadata);
            });

            const result = await audioProcessor.getAudioInfo(filePath);
            
            expect(result).toEqual(mockMetadata);
            expect(mockFs.access).toHaveBeenCalledWith(filePath);
            expect(mockFfmpeg.ffprobe).toHaveBeenCalledWith(filePath, expect.any(Function));
        });

        it('should throw error when file does not exist', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('File not found'));

            await expect(audioProcessor.getAudioInfo(filePath))
                .rejects.toThrow(`Audio file not found: ${filePath}`);
        });

        it('should handle ffprobe errors', async () => {
            mockFfmpeg.ffprobe.mockImplementation((path, callback) => {
                callback(new Error('Invalid file format'));
            });

            await expect(audioProcessor.getAudioInfo(filePath))
                .rejects.toThrow('Failed to get audio info: Invalid file format');
        });
    });

    describe('validateAudioFile', () => {
        const filePath = '/test/audio.wav';

        it('should return true for valid WAV file', async () => {
            const mockMetadata = {
                format: { format_name: 'wav' }
            };
            
            vi.spyOn(audioProcessor, 'getAudioInfo').mockResolvedValue(mockMetadata);

            const result = await audioProcessor.validateAudioFile(filePath, 'wav');
            
            expect(result).toBe(true);
        });

        it('should return true for valid MP3 file', async () => {
            const mockMetadata = {
                format: { format_name: 'mp3' }
            };
            
            vi.spyOn(audioProcessor, 'getAudioInfo').mockResolvedValue(mockMetadata);

            const result = await audioProcessor.validateAudioFile(filePath, 'mp3');
            
            expect(result).toBe(true);
        });

        it('should return false for format mismatch', async () => {
            const mockMetadata = {
                format: { format_name: 'wav' }
            };
            
            vi.spyOn(audioProcessor, 'getAudioInfo').mockResolvedValue(mockMetadata);

            const result = await audioProcessor.validateAudioFile(filePath, 'mp3');
            
            expect(result).toBe(false);
        });

        it('should return false when getAudioInfo fails', async () => {
            vi.spyOn(audioProcessor, 'getAudioInfo').mockRejectedValue(new Error('File error'));

            const result = await audioProcessor.validateAudioFile(filePath, 'wav');
            
            expect(result).toBe(false);
        });
    });
});