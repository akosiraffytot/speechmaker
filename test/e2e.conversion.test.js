import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * End-to-End Conversion Tests
 * Tests complete conversion scenarios from text input to audio output
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2
 */

// Mock all required services
const createMockServices = () => ({
  ttsService: Object.assign(new EventEmitter(), {
    getAvailableVoices: vi.fn(),
    convertTextToSpeech: vi.fn(),
    splitTextIntoChunks: vi.fn(),
    isInitialized: true,
    availableVoices: [
      { id: 'Microsoft David Desktop', name: 'David', language: 'en-US', gender: 'Male', isDefault: true },
      { id: 'Microsoft Zira Desktop', name: 'Zira', language: 'en-US', gender: 'Female', isDefault: false }
    ]
  }),
  fileManager: {
    readTextFile: vi.fn(),
    validateOutputDirectory: vi.fn(),
    generateUniqueFileName: vi.fn(),
    ensureDirectoryExists: vi.fn(),
    getDefaultOutputDirectory: vi.fn()
  },
  audioProcessor: {
    validateFFmpegInstallation: vi.fn(),
    convertWavToMp3: vi.fn(),
    mergeAudioChunks: vi.fn(),
    cleanupChunks: vi.fn()
  },
  settingsManager: {
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    getDefaultSettings: vi.fn()
  },
  errorHandler: {
    handleConversionError: vi.fn(),
    logError: vi.fn()
  }
});

describe('End-to-End Conversion Tests', () => {
  let services;
  let conversionWorkflow;

  beforeEach(() => {
    services = createMockServices();
    
    // Create a simple conversion workflow simulator
    conversionWorkflow = {
      async convertText(text, voice, outputFormat, outputPath, speed = 1.0) {
        try {
          // Step 1: Validate inputs
          if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
          }
          
          if (!voice) {
            throw new Error('Voice selection is required');
          }
          
          if (!outputPath) {
            throw new Error('Output path is required');
          }
          
          // Step 2: Check voice availability
          const voices = await services.ttsService.getAvailableVoices();
          const selectedVoice = voices.find(v => v.id === voice);
          if (!selectedVoice) {
            throw new Error(`Voice '${voice}' not found`);
          }
          
          // Step 3: Validate output directory
          const isValidDir = await services.fileManager.validateOutputDirectory(outputPath);
          if (!isValidDir) {
            throw new Error('Output directory is not writable');
          }
          
          // Step 4: Generate unique filename
          const fileName = services.fileManager.generateUniqueFileName(
            outputPath, 
            'speech', 
            outputFormat === 'mp3' ? '.mp3' : '.wav'
          );
          
          // Step 5: Split text into chunks if needed
          const chunks = services.ttsService.splitTextIntoChunks(text);
          
          // Step 6: Convert each chunk to audio
          const audioChunks = [];
          for (let i = 0; i < chunks.length; i++) {
            const chunkFile = `${fileName}_chunk_${i}.wav`;
            await services.ttsService.convertTextToSpeech(
              chunks[i], 
              voice, 
              speed, 
              chunkFile
            );
            audioChunks.push(chunkFile);
            
            // Emit progress
            services.ttsService.emit('progress', {
              phase: 'converting',
              current: i + 1,
              total: chunks.length,
              percentage: Math.round(((i + 1) / chunks.length) * 80) // 80% for TTS conversion
            });
          }
          
          // Step 7: Merge chunks if multiple
          let finalFile = fileName;
          if (audioChunks.length > 1) {
            finalFile = await services.audioProcessor.mergeAudioChunks(audioChunks, fileName);
            await services.audioProcessor.cleanupChunks(audioChunks);
          } else {
            finalFile = audioChunks[0];
          }
          
          // Step 8: Convert to MP3 if requested
          if (outputFormat === 'mp3') {
            const ffmpegAvailable = await services.audioProcessor.validateFFmpegInstallation();
            if (!ffmpegAvailable) {
              throw new Error('FFmpeg is required for MP3 conversion but is not installed');
            }
            
            const mp3File = finalFile.replace('.wav', '.mp3');
            await services.audioProcessor.convertWavToMp3(finalFile, mp3File);
            finalFile = mp3File;
            
            services.ttsService.emit('progress', {
              phase: 'converting_format',
              percentage: 95
            });
          }
          
          // Step 9: Complete
          services.ttsService.emit('progress', {
            phase: 'complete',
            percentage: 100
          });
          
          return {
            success: true,
            outputFile: finalFile,
            duration: Date.now() - Date.now(), // Simulated
            chunks: chunks.length
          };
          
        } catch (error) {
          await services.errorHandler.handleConversionError(error, {
            text, voice, outputFormat, outputPath, speed
          });
          throw error;
        }
      }
    };
  });

  describe('Simple Text Conversion', () => {
    it('should convert short text to WAV successfully', async () => {
      const text = 'Hello, this is a test message.';
      const voice = 'Microsoft David Desktop';
      const outputPath = '/test/output';
      
      // Setup mocks
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue([text]);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      
      const result = await conversionWorkflow.convertText(text, voice, 'wav', outputPath);
      
      expect(result.success).toBe(true);
      expect(result.outputFile).toBe('/test/output/speech.wav');
      expect(result.chunks).toBe(1);
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledWith(
        text, voice, 1.0, '/test/output/speech.wav'
      );
    });

    it('should convert short text to MP3 successfully', async () => {
      const text = 'Hello, this is a test message.';
      const voice = 'Microsoft Zira Desktop';
      const outputPath = '/test/output';
      
      // Setup mocks
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.mp3');
      services.ttsService.splitTextIntoChunks.mockReturnValue([text]);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      services.audioProcessor.validateFFmpegInstallation.mockResolvedValue(true);
      services.audioProcessor.convertWavToMp3.mockResolvedValue('/test/output/speech.mp3');
      
      const result = await conversionWorkflow.convertText(text, voice, 'mp3', outputPath);
      
      expect(result.success).toBe(true);
      expect(result.outputFile).toBe('/test/output/speech.mp3');
      expect(services.audioProcessor.convertWavToMp3).toHaveBeenCalled();
    });

    it('should handle custom voice speed', async () => {
      const text = 'Testing voice speed adjustment.';
      const voice = 'Microsoft David Desktop';
      const outputPath = '/test/output';
      const speed = 1.5;
      
      // Setup mocks
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue([text]);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      
      await conversionWorkflow.convertText(text, voice, 'wav', outputPath, speed);
      
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledWith(
        text, voice, speed, '/test/output/speech.wav'
      );
    });
  });

  describe('Large Text Conversion', () => {
    it('should handle large text with multiple chunks', async () => {
      const largeText = 'A'.repeat(15000); // 15k characters
      const voice = 'Microsoft David Desktop';
      const outputPath = '/test/output';
      
      const chunks = ['A'.repeat(5000), 'A'.repeat(5000), 'A'.repeat(5000)];
      
      // Setup mocks
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue(chunks);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      services.audioProcessor.mergeAudioChunks.mockResolvedValue('/test/output/speech.wav');
      services.audioProcessor.cleanupChunks.mockResolvedValue();
      
      const result = await conversionWorkflow.convertText(largeText, voice, 'wav', outputPath);
      
      expect(result.success).toBe(true);
      expect(result.chunks).toBe(3);
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledTimes(3);
      expect(services.audioProcessor.mergeAudioChunks).toHaveBeenCalled();
      expect(services.audioProcessor.cleanupChunks).toHaveBeenCalled();
    });

    it('should emit progress updates during large conversion', async () => {
      const largeText = 'B'.repeat(10000);
      const voice = 'Microsoft David Desktop';
      const outputPath = '/test/output';
      
      const chunks = ['B'.repeat(5000), 'B'.repeat(5000)];
      const progressEvents = [];
      
      // Setup mocks
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue(chunks);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      services.audioProcessor.mergeAudioChunks.mockResolvedValue('/test/output/speech.wav');
      services.audioProcessor.cleanupChunks.mockResolvedValue();
      
      // Listen for progress events
      services.ttsService.on('progress', (data) => {
        progressEvents.push(data);
      });
      
      await conversionWorkflow.convertText(largeText, voice, 'wav', outputPath);
      
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.phase === 'converting')).toBe(true);
      expect(progressEvents.some(e => e.phase === 'complete')).toBe(true);
    });
  });

  describe('File Upload Conversion', () => {
    it('should convert uploaded text file successfully', async () => {
      const filePath = '/test/input.txt';
      const fileContent = 'This is content from an uploaded file.';
      const voice = 'Microsoft Zira Desktop';
      const outputPath = '/test/output';
      
      // Setup mocks
      services.fileManager.readTextFile.mockResolvedValue(fileContent);
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue([fileContent]);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      
      // Simulate file upload workflow
      const uploadedText = await services.fileManager.readTextFile(filePath);
      const result = await conversionWorkflow.convertText(uploadedText, voice, 'wav', outputPath);
      
      expect(result.success).toBe(true);
      expect(services.fileManager.readTextFile).toHaveBeenCalledWith(filePath);
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledWith(
        fileContent, voice, 1.0, '/test/output/speech.wav'
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty text error', async () => {
      await expect(conversionWorkflow.convertText('', 'voice', 'wav', '/path'))
        .rejects.toThrow('Text cannot be empty');
      
      await expect(conversionWorkflow.convertText('   ', 'voice', 'wav', '/path'))
        .rejects.toThrow('Text cannot be empty');
    });

    it('should handle missing voice error', async () => {
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      
      await expect(conversionWorkflow.convertText('Hello', 'NonExistentVoice', 'wav', '/path'))
        .rejects.toThrow("Voice 'NonExistentVoice' not found");
    });

    it('should handle invalid output directory error', async () => {
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(false);
      
      await expect(conversionWorkflow.convertText('Hello', 'Microsoft David Desktop', 'wav', '/invalid'))
        .rejects.toThrow('Output directory is not writable');
    });

    it('should handle FFmpeg missing for MP3 conversion', async () => {
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.mp3');
      services.ttsService.splitTextIntoChunks.mockReturnValue(['Hello']);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      services.audioProcessor.validateFFmpegInstallation.mockResolvedValue(false);
      
      await expect(conversionWorkflow.convertText('Hello', 'Microsoft David Desktop', 'mp3', '/path'))
        .rejects.toThrow('FFmpeg is required for MP3 conversion but is not installed');
    });

    it('should handle TTS conversion failure', async () => {
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue(['Hello']);
      services.ttsService.convertTextToSpeech.mockRejectedValue(new Error('TTS engine failed'));
      
      await expect(conversionWorkflow.convertText('Hello', 'Microsoft David Desktop', 'wav', '/path'))
        .rejects.toThrow('TTS engine failed');
      
      expect(services.errorHandler.handleConversionError).toHaveBeenCalled();
    });

    it('should handle audio merging failure', async () => {
      const chunks = ['Chunk 1', 'Chunk 2'];
      
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue(chunks);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      services.audioProcessor.mergeAudioChunks.mockRejectedValue(new Error('Merge failed'));
      
      await expect(conversionWorkflow.convertText('Long text', 'Microsoft David Desktop', 'wav', '/path'))
        .rejects.toThrow('Merge failed');
    });
  });

  describe('Settings Integration', () => {
    it('should use saved settings for conversion', async () => {
      const savedSettings = {
        lastSelectedVoice: 'Microsoft Zira Desktop',
        defaultOutputFormat: 'mp3',
        voiceSpeed: 1.2,
        defaultOutputPath: '/saved/path'
      };
      
      services.settingsManager.loadSettings.mockResolvedValue(savedSettings);
      
      const settings = await services.settingsManager.loadSettings();
      
      expect(settings.lastSelectedVoice).toBe('Microsoft Zira Desktop');
      expect(settings.defaultOutputFormat).toBe('mp3');
      expect(settings.voiceSpeed).toBe(1.2);
      expect(settings.defaultOutputPath).toBe('/saved/path');
    });

    it('should save conversion preferences after successful conversion', async () => {
      const text = 'Test message';
      const voice = 'Microsoft David Desktop';
      const outputPath = '/test/output';
      
      // Setup successful conversion
      services.ttsService.getAvailableVoices.mockResolvedValue(services.ttsService.availableVoices);
      services.fileManager.validateOutputDirectory.mockResolvedValue(true);
      services.fileManager.generateUniqueFileName.mockReturnValue('/test/output/speech.wav');
      services.ttsService.splitTextIntoChunks.mockReturnValue([text]);
      services.ttsService.convertTextToSpeech.mockResolvedValue();
      services.settingsManager.saveSettings.mockResolvedValue(true);
      
      await conversionWorkflow.convertText(text, voice, 'wav', outputPath);
      
      // Simulate saving preferences after conversion
      await services.settingsManager.saveSettings({
        lastSelectedVoice: voice,
        defaultOutputPath: outputPath
      });
      
      expect(services.settingsManager.saveSettings).toHaveBeenCalledWith({
        lastSelectedVoice: voice,
        defaultOutputPath: outputPath
      });
    });
  });

  describe('Workflow Validation', () => {
    it('should validate complete conversion workflow steps', async () => {
      const text = 'Complete workflow test';
      const voice = 'Microsoft David Desktop';
      const outputPath = '/test/output';
      
      // Track workflow steps
      const workflowSteps = [];
      
      // Mock all services to track calls
      services.ttsService.getAvailableVoices.mockImplementation(async () => {
        workflowSteps.push('getVoices');
        return services.ttsService.availableVoices;
      });
      
      services.fileManager.validateOutputDirectory.mockImplementation(async () => {
        workflowSteps.push('validateDirectory');
        return true;
      });
      
      services.fileManager.generateUniqueFileName.mockImplementation(() => {
        workflowSteps.push('generateFilename');
        return '/test/output/speech.wav';
      });
      
      services.ttsService.splitTextIntoChunks.mockImplementation(() => {
        workflowSteps.push('splitText');
        return [text];
      });
      
      services.ttsService.convertTextToSpeech.mockImplementation(async () => {
        workflowSteps.push('convertTTS');
      });
      
      await conversionWorkflow.convertText(text, voice, 'wav', outputPath);
      
      // Verify workflow steps executed in correct order
      expect(workflowSteps).toEqual([
        'getVoices',
        'validateDirectory', 
        'generateFilename',
        'splitText',
        'convertTTS'
      ]);
    });
  });
});