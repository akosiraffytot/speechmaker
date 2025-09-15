import { describe, it, expect, beforeEach } from 'vitest';

// Create a simple test without complex mocking for now
describe('TTSService', () => {
  let TTSService;

  beforeEach(async () => {
    // Dynamically import to avoid module loading issues
    const module = await import('../src/main/services/ttsService.js');
    TTSService = module.default;
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      const ttsService = new TTSService();
      
      expect(ttsService.availableVoices).toEqual([]);
      expect(ttsService.maxChunkLength).toBe(5000);
      expect(ttsService.isInitialized).toBe(false);
    });

    it('should extend EventEmitter', () => {
      const ttsService = new TTSService();
      
      expect(ttsService.on).toBeDefined();
      expect(ttsService.emit).toBeDefined();
      expect(typeof ttsService.on).toBe('function');
      expect(typeof ttsService.emit).toBe('function');
    });
  });

  describe('parseVoiceList', () => {
    it('should parse voice list correctly', () => {
      const ttsService = new TTSService();
      const mockOutput = `Name: Microsoft David Desktop, Gender: Male, Language: en-US
Name: Microsoft Zira Desktop, Gender: Female, Language: en-US
Name: Microsoft Mark Desktop, Gender: Male, Language: en-GB`;

      const voices = ttsService.parseVoiceList(mockOutput);

      expect(voices).toHaveLength(3);
      expect(voices[0]).toEqual({
        id: 'Microsoft David Desktop',
        name: 'Microsoft David Desktop',
        gender: 'Male',
        language: 'en-US',
        isDefault: true // First English voice should be default
      });
      expect(voices[1]).toEqual({
        id: 'Microsoft Zira Desktop',
        name: 'Microsoft Zira Desktop',
        gender: 'Female',
        language: 'en-US',
        isDefault: false
      });
      expect(voices[2]).toEqual({
        id: 'Microsoft Mark Desktop',
        name: 'Microsoft Mark Desktop',
        gender: 'Male',
        language: 'en-GB',
        isDefault: false
      });
    });

    it('should handle malformed voice lines gracefully', () => {
      const ttsService = new TTSService();
      const mockOutput = `Name: Microsoft David Desktop, Gender: Male, Language: en-US
Invalid line without proper format
Name: Microsoft Zira Desktop, Gender: Female, Language: en-US`;

      const voices = ttsService.parseVoiceList(mockOutput);

      expect(voices).toHaveLength(2);
      expect(voices[0].name).toBe('Microsoft David Desktop');
      expect(voices[1].name).toBe('Microsoft Zira Desktop');
    });

    it('should throw error when no voices found', () => {
      const ttsService = new TTSService();
      const mockOutput = 'No valid voice lines';

      expect(() => ttsService.parseVoiceList(mockOutput)).toThrow('No TTS voices found');
    });

    it('should handle empty output', () => {
      const ttsService = new TTSService();
      const mockOutput = '';

      expect(() => ttsService.parseVoiceList(mockOutput)).toThrow('No TTS voices found');
    });
  });

  describe('splitTextIntoChunks', () => {
    it('should return single chunk for short text', () => {
      const ttsService = new TTSService();
      const text = 'Short text';
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks).toEqual([text]);
    });

    it('should split long text into multiple chunks', () => {
      const ttsService = new TTSService();
      const longText = 'A'.repeat(10000);
      const chunks = ttsService.splitTextIntoChunks(longText, 3000);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every(chunk => chunk.length <= 3000)).toBe(true);
    });

    it('should prefer sentence boundaries for splitting', () => {
      const ttsService = new TTSService();
      const text = 'First sentence. Second sentence. Third sentence. ' + 'A'.repeat(5000);
      const chunks = ttsService.splitTextIntoChunks(text, 3000);

      expect(chunks.length).toBeGreaterThan(1);
      // First chunk should end with a sentence
      expect(chunks[0]).toMatch(/\.\s*$/);
    });

    it('should fall back to word boundaries if no sentence boundaries', () => {
      const ttsService = new TTSService();
      const text = 'word '.repeat(2000); // No sentence endings
      const chunks = ttsService.splitTextIntoChunks(text, 3000);

      expect(chunks.length).toBeGreaterThan(1);
      // Should not break in the middle of words
      expect(chunks.every(chunk => !chunk.endsWith('wor'))).toBe(true);
    });

    it('should filter out empty chunks', () => {
      const ttsService = new TTSService();
      const text = 'Text with   multiple   spaces.   ';
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks.every(chunk => chunk.length > 0)).toBe(true);
    });

    it('should handle text exactly at chunk boundary', () => {
      const ttsService = new TTSService();
      const text = 'A'.repeat(5000); // Exactly max chunk length
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should handle very small chunks', () => {
      const ttsService = new TTSService();
      const text = 'This is a test sentence with multiple words.';
      const chunks = ttsService.splitTextIntoChunks(text, 10);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every(chunk => chunk.length > 0)).toBe(true);
    });
  });

  describe('setMaxChunkLength', () => {
    it('should set valid chunk length', () => {
      const ttsService = new TTSService();
      ttsService.setMaxChunkLength(3000);
      expect(ttsService.maxChunkLength).toBe(3000);
    });

    it('should reject invalid chunk lengths', () => {
      const ttsService = new TTSService();
      
      expect(() => ttsService.setMaxChunkLength(500)).toThrow('Chunk length must be between 1000 and 10000 characters');
      expect(() => ttsService.setMaxChunkLength(15000)).toThrow('Chunk length must be between 1000 and 10000 characters');
    });

    it('should accept boundary values', () => {
      const ttsService = new TTSService();
      
      ttsService.setMaxChunkLength(1000);
      expect(ttsService.maxChunkLength).toBe(1000);
      
      ttsService.setMaxChunkLength(10000);
      expect(ttsService.maxChunkLength).toBe(10000);
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      const ttsService = new TTSService();
      ttsService.isInitialized = true;
      ttsService.availableVoices = [{ id: 'voice1' }, { id: 'voice2' }];
      ttsService.maxChunkLength = 4000;

      const status = ttsService.getStatus();

      expect(status).toEqual({
        isInitialized: true,
        voiceCount: 2,
        maxChunkLength: 4000,
        voiceLoadingState: expect.any(Object)
      });
    });

    it('should return correct status for uninitialized service', () => {
      const ttsService = new TTSService();

      const status = ttsService.getStatus();

      expect(status).toEqual({
        isInitialized: false,
        voiceCount: 0,
        maxChunkLength: 5000,
        voiceLoadingState: expect.any(Object)
      });
    });
  });

  describe('Voice Loading Retry Mechanism', () => {
    it('should initialize voice loading state correctly', () => {
      const ttsService = new TTSService();
      
      expect(ttsService.voiceLoadingState).toEqual({
        isLoading: false,
        currentAttempt: 0,
        maxAttempts: 3,
        lastError: null,
        retryDelay: 0
      });
    });

    it('should return troubleshooting steps', () => {
      const ttsService = new TTSService();
      const steps = ttsService.getTroubleshootingSteps();
      
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps).toContain('Ensure Windows Speech Platform is installed and enabled');
      expect(steps).toContain('Check Windows TTS settings in Control Panel > Speech');
      expect(steps).toContain('Verify that edge-tts is properly installed (npm install -g edge-tts)');
    });

    it('should get voice loading state with troubleshooting steps', () => {
      const ttsService = new TTSService();
      const state = ttsService.getVoiceLoadingState();
      
      expect(state).toHaveProperty('isLoading', false);
      expect(state).toHaveProperty('currentAttempt', 0);
      expect(state).toHaveProperty('maxAttempts', 3);
      expect(state).toHaveProperty('lastError', null);
      expect(state).toHaveProperty('retryDelay', 0);
      expect(state).toHaveProperty('troubleshootingSteps');
      expect(Array.isArray(state.troubleshootingSteps)).toBe(true);
    });

    it('should handle successful voice loading on first attempt', async () => {
      const ttsService = new TTSService();
      
      // Mock successful voice loading
      const mockVoices = [
        { id: 'voice1', name: 'Voice 1', gender: 'Male', language: 'en-US', isDefault: true }
      ];
      
      ttsService.loadAvailableVoices = async () => mockVoices;
      
      const result = await ttsService.loadVoicesWithRetry(3);
      
      expect(result.success).toBe(true);
      expect(result.voices).toEqual(mockVoices);
      expect(result.attempt).toBe(1);
      expect(result.totalAttempts).toBe(3);
      expect(ttsService.voiceLoadingState.isLoading).toBe(false);
      expect(ttsService.voiceLoadingState.lastError).toBe(null);
    });

    it('should handle voice loading failure after retries', async () => {
      const ttsService = new TTSService();
      
      // Mock failing voice loading
      const mockError = new Error('Failed to load voices');
      ttsService.loadAvailableVoices = async () => {
        throw mockError;
      };
      
      // Mock sleep to avoid actual delays in tests
      ttsService.sleep = async () => Promise.resolve();
      
      const result = await ttsService.loadVoicesWithRetry(2);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(mockError);
      expect(result.attempts).toBe(2);
      expect(Array.isArray(result.troubleshooting)).toBe(true);
      expect(ttsService.voiceLoadingState.isLoading).toBe(false);
      expect(ttsService.voiceLoadingState.lastError).toBe(mockError);
    });

    it('should handle success after retries', async () => {
      const ttsService = new TTSService();
      let attemptCount = 0;
      
      const mockVoices = [
        { id: 'voice1', name: 'Voice 1', gender: 'Male', language: 'en-US', isDefault: true }
      ];
      
      // Mock voice loading that fails twice then succeeds
      ttsService.loadAvailableVoices = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return mockVoices;
      };
      
      // Mock sleep to avoid actual delays in tests
      ttsService.sleep = async () => Promise.resolve();
      
      const result = await ttsService.loadVoicesWithRetry(3);
      
      expect(result.success).toBe(true);
      expect(result.voices).toEqual(mockVoices);
      expect(result.attempt).toBe(3);
      expect(attemptCount).toBe(3);
    });

    it('should emit correct events during retry process', async () => {
      const ttsService = new TTSService();
      const events = [];
      
      // Capture all events
      ttsService.on('voiceLoadingStarted', (data) => events.push({ type: 'started', data }));
      ttsService.on('voiceLoadingAttempt', (data) => events.push({ type: 'attempt', data }));
      ttsService.on('voiceLoadRetry', (data) => events.push({ type: 'retry', data }));
      ttsService.on('voiceLoadingFailed', (data) => events.push({ type: 'failed', data }));
      
      // Mock failing voice loading
      ttsService.loadAvailableVoices = async () => {
        throw new Error('Test error');
      };
      
      // Mock sleep to avoid actual delays in tests
      ttsService.sleep = async () => Promise.resolve();
      
      await ttsService.loadVoicesWithRetry(2);
      
      expect(events).toHaveLength(5); // started, attempt1, retry, attempt2, failed
      expect(events[0].type).toBe('started');
      expect(events[1].type).toBe('attempt');
      expect(events[2].type).toBe('retry');
      expect(events[3].type).toBe('attempt');
      expect(events[4].type).toBe('failed');
    });

    it('should emit success event on successful loading', async () => {
      const ttsService = new TTSService();
      const events = [];
      
      ttsService.on('voiceLoadingSuccess', (data) => events.push({ type: 'success', data }));
      
      const mockVoices = [{ id: 'voice1', name: 'Voice 1' }];
      ttsService.loadAvailableVoices = async () => mockVoices;
      
      await ttsService.loadVoicesWithRetry(3);
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('success');
      expect(events[0].data.voiceCount).toBe(1);
      expect(events[0].data.attempt).toBe(1);
    });

    it('should handle manual retry correctly', async () => {
      const ttsService = new TTSService();
      
      // Set up initial state
      ttsService.isInitialized = true;
      ttsService.availableVoices = [{ id: 'old-voice' }];
      
      const mockVoices = [{ id: 'new-voice', name: 'New Voice' }];
      ttsService.loadAvailableVoices = async () => mockVoices;
      
      await ttsService.retryVoiceLoading();
      
      expect(ttsService.isInitialized).toBe(true);
      expect(ttsService.availableVoices).toEqual(mockVoices);
    });
  });

  describe('Sleep Utility Function', () => {
    it('should resolve after specified delay', async () => {
      const ttsService = new TTSService();
      const startTime = Date.now();
      
      await ttsService.sleep(100);
      
      const endTime = Date.now();
      const elapsed = endTime - startTime;
      
      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });

    it('should handle zero delay', async () => {
      const ttsService = new TTSService();
      
      const startTime = Date.now();
      await ttsService.sleep(0);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate correct retry delays', async () => {
      const ttsService = new TTSService();
      const delays = [];
      
      // Mock sleep to capture delays
      ttsService.sleep = async (ms) => {
        delays.push(ms);
        return Promise.resolve();
      };
      
      // Mock failing voice loading
      ttsService.loadAvailableVoices = async () => {
        throw new Error('Test error');
      };
      
      await ttsService.loadVoicesWithRetry(3);
      
      expect(delays).toHaveLength(2); // 2 retries for 3 attempts
      expect(delays[0]).toBe(2000); // 2^1 * 1000
      expect(delays[1]).toBe(4000); // 2^2 * 1000
    });

    it('should not delay after last attempt', async () => {
      const ttsService = new TTSService();
      let sleepCalled = false;
      
      // Mock sleep to detect if called
      ttsService.sleep = async () => {
        sleepCalled = true;
        return Promise.resolve();
      };
      
      // Mock failing voice loading
      ttsService.loadAvailableVoices = async () => {
        throw new Error('Test error');
      };
      
      await ttsService.loadVoicesWithRetry(1); // Only 1 attempt
      
      expect(sleepCalled).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('should validate convertTextToSpeech parameters', async () => {
      const ttsService = new TTSService();
      ttsService.isInitialized = true;
      ttsService.availableVoices = [
        { id: 'Microsoft David Desktop', name: 'David', gender: 'Male', language: 'en-US', isDefault: true }
      ];

      const voiceId = 'Microsoft David Desktop';
      const outputPath = '/path/to/output.wav';

      // Test empty text
      await expect(ttsService.convertTextToSpeech('', voiceId, 1.0, outputPath))
        .rejects.toThrow('Text cannot be empty');

      // Test whitespace-only text
      await expect(ttsService.convertTextToSpeech('   ', voiceId, 1.0, outputPath))
        .rejects.toThrow('Text cannot be empty');

      // Test missing voice ID
      await expect(ttsService.convertTextToSpeech('Hello', '', 1.0, outputPath))
        .rejects.toThrow('Voice ID is required');

      // Test missing output path
      await expect(ttsService.convertTextToSpeech('Hello', voiceId, 1.0, ''))
        .rejects.toThrow('Output path is required');

      // Test invalid voice
      await expect(ttsService.convertTextToSpeech('Hello', 'invalid-voice', 1.0, outputPath))
        .rejects.toThrow('Voice \'invalid-voice\' not found');

      // Test invalid speed - too low
      await expect(ttsService.convertTextToSpeech('Hello', voiceId, 0.3, outputPath))
        .rejects.toThrow('Speed must be between 0.5 and 2.0');

      // Test invalid speed - too high
      await expect(ttsService.convertTextToSpeech('Hello', voiceId, 2.5, outputPath))
        .rejects.toThrow('Speed must be between 0.5 and 2.0');
    });

    it('should accept valid speed values', async () => {
      const ttsService = new TTSService();
      ttsService.isInitialized = true;
      ttsService.availableVoices = [
        { id: 'Microsoft David Desktop', name: 'David', gender: 'Male', language: 'en-US', isDefault: true }
      ];

      // These should not throw validation errors (though they may fail due to missing edge-tts)
      const validSpeeds = [0.5, 1.0, 1.5, 2.0];
      
      for (const speed of validSpeeds) {
        try {
          await ttsService.convertTextToSpeech('Hello', 'Microsoft David Desktop', speed, '/path/output.wav');
        } catch (error) {
          // We expect this to fail due to missing edge-tts, but not due to validation
          expect(error.message).not.toContain('Speed must be between');
        }
      }
    });
  });

  describe('Event Emission', () => {
    it('should emit events correctly', () => {
      const ttsService = new TTSService();
      
      return new Promise((resolve) => {
        ttsService.on('test-event', (data) => {
          expect(data).toBe('test-data');
          resolve();
        });

        ttsService.emit('test-event', 'test-data');
      });
    });

    it('should support multiple event listeners', () => {
      const ttsService = new TTSService();
      let count = 0;

      ttsService.on('test-event', () => count++);
      ttsService.on('test-event', () => count++);

      ttsService.emit('test-event');

      expect(count).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle text with special characters', () => {
      const ttsService = new TTSService();
      const text = 'Hello! How are you? I\'m fine. "Great!" said John. Cost: $5.99.';
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should handle text with unicode characters', () => {
      const ttsService = new TTSService();
      const text = 'Hello 世界! Café résumé naïve 🎉';
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should handle text with only punctuation', () => {
      const ttsService = new TTSService();
      const text = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should handle text with multiple consecutive spaces', () => {
      const ttsService = new TTSService();
      const text = 'Word1     Word2          Word3';
      const chunks = ttsService.splitTextIntoChunks(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });
  });
});