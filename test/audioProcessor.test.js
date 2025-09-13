import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Mock modules
vi.mock('fs/promises', () => mockFs);
vi.mock('path', () => mockPath);
vi.mock('child_process', () => ({ spawn: mockSpawn }));
vi.mock('fluent-ffmpeg', () => ({ default: mockFfmpeg }));

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
        });
    });

    describe('validateFFmpegInstallation', () => {
        let mockProcess;

        beforeEach(() => {
            mockProcess = {
                on: vi.fn(),
                kill: vi.fn()
            };
            mockSpawn.mockReturnValue(mockProcess);
        });

        it('should return true when FFmpeg is available', async () => {
            // Setup process to emit close with code 0
            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    // Use setImmediate for proper async handling
                    setImmediate(() => callback(0));
                }
                return mockProcess;
            });

            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(true);
            expect(audioProcessor.isFFmpegValidated).toBe(true);
            expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', ['-version'], { 
                stdio: 'pipe',
                shell: true 
            });
        });

        it('should return false when FFmpeg is not available', async () => {
            // Setup process to emit close with non-zero code
            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    setImmediate(() => callback(1));
                }
                return mockProcess;
            });

            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(false);
            expect(audioProcessor.isFFmpegValidated).toBe(false);
        });

        it('should return false when process errors', async () => {
            // Setup process to emit error
            mockProcess.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Command not found')));
                }
                return mockProcess;
            });

            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(false);
            expect(audioProcessor.isFFmpegValidated).toBe(false);
        });

        it('should return cached result on subsequent calls', async () => {
            audioProcessor.isFFmpegValidated = true;
            
            const result = await audioProcessor.validateFFmpegInstallation();
            
            expect(result).toBe(true);
            expect(mockSpawn).not.toHaveBeenCalled();
        });

        it('should handle timeout', async () => {
            // Don't emit any events to simulate timeout
            mockProcess.on.mockReturnValue(mockProcess);
            
            // Use fake timers to control timeout
            vi.useFakeTimers();
            
            const promise = audioProcessor.validateFFmpegInstallation();
            
            // Fast-forward time to trigger timeout
            vi.advanceTimersByTime(6000);
            
            const result = await promise;
            
            expect(result).toBe(false);
            expect(mockProcess.kill).toHaveBeenCalled();
            
            vi.useRealTimers();
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
                .rejects.toThrow(`Input WAV file not found: ${inputPath}`);
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
            expect(fs.copyFile).toHaveBeenCalledWith('/test/single.wav', outputPath);
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
            
            expect(fs.unlink).not.toHaveBeenCalled();
        });

        it('should handle null chunk array', async () => {
            await audioProcessor.cleanupChunks(null);
            
            expect(fs.unlink).not.toHaveBeenCalled();
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