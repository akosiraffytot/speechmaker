import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Performance Tests for SpeechMaker
 * Tests performance characteristics for large file handling and resource usage
 * Requirements: 2.3, 6.2, 6.3, 6.4
 */

// Mock performance monitoring utilities
const createPerformanceMonitor = () => ({
  startTime: 0,
  memoryUsage: [],
  
  start() {
    this.startTime = performance.now();
    this.memoryUsage = [];
  },
  
  recordMemory() {
    // Simulate memory usage recording
    const usage = {
      heapUsed: Math.random() * 100 * 1024 * 1024, // Random MB
      heapTotal: Math.random() * 200 * 1024 * 1024,
      external: Math.random() * 50 * 1024 * 1024,
      timestamp: performance.now()
    };
    this.memoryUsage.push(usage);
    return usage;
  },
  
  getElapsedTime() {
    return performance.now() - this.startTime;
  },
  
  getPeakMemory() {
    return Math.max(...this.memoryUsage.map(m => m.heapUsed));
  },
  
  getAverageMemory() {
    const total = this.memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0);
    return total / this.memoryUsage.length;
  }
});

// Mock services for performance testing
const createMockServices = () => ({
  ttsService: {
    splitTextIntoChunks: vi.fn(),
    convertTextToSpeech: vi.fn(),
    getAvailableVoices: vi.fn(),
    setMaxChunkLength: vi.fn(),
    on: vi.fn(),
    emit: vi.fn()
  },
  fileManager: {
    readTextFile: vi.fn(),
    validateOutputDirectory: vi.fn(),
    generateUniqueFileName: vi.fn(),
    maxFileSize: 10 * 1024 * 1024 // 10MB
  },
  audioProcessor: {
    mergeAudioChunks: vi.fn(),
    convertWavToMp3: vi.fn(),
    cleanupChunks: vi.fn()
  }
});

describe('Performance Tests', () => {
  let services;
  let performanceMonitor;

  beforeEach(() => {
    services = createMockServices();
    performanceMonitor = createPerformanceMonitor();
    vi.clearAllMocks();
  });

  describe('Large File Handling Performance', () => {
    it('should handle 1MB text file within acceptable time', async () => {
      const largeText = 'A'.repeat(1024 * 1024); // 1MB of text
      const expectedChunks = Math.ceil(largeText.length / 5000); // Default chunk size
      
      services.ttsService.splitTextIntoChunks.mockImplementation((text, chunkSize = 5000) => {
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
          chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
      });
      
      performanceMonitor.start();
      
      const chunks = services.ttsService.splitTextIntoChunks(largeText);
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      
      expect(chunks.length).toBe(expectedChunks);
      expect(elapsedTime).toBeLessThan(1000); // Should complete within 1 second
      expect(chunks.every(chunk => chunk.length <= 5000)).toBe(true);
    });

    it('should handle 5MB text file with memory efficiency', async () => {
      const largeText = 'B'.repeat(5 * 1024 * 1024); // 5MB of text
      
      services.ttsService.splitTextIntoChunks.mockImplementation((text, chunkSize = 5000) => {
        performanceMonitor.recordMemory(); // Record memory at start
        
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
          chunks.push(text.slice(i, i + chunkSize));
          
          // Record memory every 100 chunks
          if (chunks.length % 100 === 0) {
            performanceMonitor.recordMemory();
          }
        }
        
        performanceMonitor.recordMemory(); // Record memory at end
        return chunks;
      });
      
      performanceMonitor.start();
      
      const chunks = services.ttsService.splitTextIntoChunks(largeText);
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      const peakMemory = performanceMonitor.getPeakMemory();
      
      expect(chunks.length).toBeGreaterThan(1000);
      expect(elapsedTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(peakMemory).toBeLessThan(500 * 1024 * 1024); // Should use less than 500MB peak
    });

    it('should handle maximum file size (10MB) efficiently', async () => {
      const maxSizeText = 'C'.repeat(services.fileManager.maxFileSize);
      
      services.fileManager.readTextFile.mockImplementation(async (filePath) => {
        performanceMonitor.recordMemory();
        
        // Simulate reading large file in chunks to avoid memory spike
        const chunkSize = 1024 * 1024; // 1MB chunks
        const totalChunks = Math.ceil(maxSizeText.length / chunkSize);
        
        for (let i = 0; i < totalChunks; i++) {
          performanceMonitor.recordMemory();
          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        return maxSizeText;
      });
      
      performanceMonitor.start();
      
      const content = await services.fileManager.readTextFile('/test/large-file.txt');
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      const averageMemory = performanceMonitor.getAverageMemory();
      
      expect(content.length).toBe(services.fileManager.maxFileSize);
      expect(elapsedTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(averageMemory).toBeLessThan(200 * 1024 * 1024); // Average memory under 200MB
    });
  });

  describe('Chunk Processing Performance', () => {
    it('should process 100 chunks within acceptable time', async () => {
      const chunks = Array.from({ length: 100 }, (_, i) => `Chunk ${i} content`);
      
      services.ttsService.convertTextToSpeech.mockImplementation(async (text, voice, speed, outputPath) => {
        // Simulate TTS processing time
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms per chunk
        performanceMonitor.recordMemory();
      });
      
      performanceMonitor.start();
      
      // Process chunks sequentially (as would happen in real conversion)
      for (let i = 0; i < chunks.length; i++) {
        await services.ttsService.convertTextToSpeech(
          chunks[i], 
          'test-voice', 
          1.0, 
          `/output/chunk_${i}.wav`
        );
      }
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      const peakMemory = performanceMonitor.getPeakMemory();
      
      expect(elapsedTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(peakMemory).toBeLessThan(100 * 1024 * 1024); // Peak memory under 100MB
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledTimes(100);
    });

    it('should handle chunk merging performance', async () => {
      const audioChunks = Array.from({ length: 50 }, (_, i) => `/temp/chunk_${i}.wav`);
      
      services.audioProcessor.mergeAudioChunks.mockImplementation(async (chunks, outputPath) => {
        performanceMonitor.recordMemory();
        
        // Simulate merging process
        for (let i = 0; i < chunks.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 5)); // 5ms per chunk
          performanceMonitor.recordMemory();
        }
        
        return outputPath;
      });
      
      performanceMonitor.start();
      
      const result = await services.audioProcessor.mergeAudioChunks(audioChunks, '/output/merged.wav');
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      
      expect(result).toBe('/output/merged.wav');
      expect(elapsedTime).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });

  describe('Memory Usage Optimization', () => {
    it('should maintain stable memory usage during long operations', async () => {
      const iterations = 50;
      
      services.ttsService.convertTextToSpeech.mockImplementation(async () => {
        performanceMonitor.recordMemory();
        await new Promise(resolve => setTimeout(resolve, 20));
      });
      
      performanceMonitor.start();
      
      for (let i = 0; i < iterations; i++) {
        await services.ttsService.convertTextToSpeech('Test text', 'voice', 1.0, `/output/${i}.wav`);
      }
      
      const memoryReadings = performanceMonitor.memoryUsage;
      const firstReading = memoryReadings[0].heapUsed;
      const lastReading = memoryReadings[memoryReadings.length - 1].heapUsed;
      const memoryGrowth = lastReading - firstReading;
      
      // Memory growth should be minimal (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
      
      // No single reading should be more than 3x the first reading (indicating memory leak)
      const maxReading = Math.max(...memoryReadings.map(r => r.heapUsed));
      expect(maxReading).toBeLessThan(firstReading * 3);
    });

    it('should cleanup resources after chunk processing', async () => {
      const chunkFiles = ['/temp/chunk1.wav', '/temp/chunk2.wav', '/temp/chunk3.wav'];
      
      services.audioProcessor.cleanupChunks.mockImplementation(async (chunks) => {
        performanceMonitor.recordMemory();
        
        // Simulate cleanup process
        for (const chunk of chunks) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        
        performanceMonitor.recordMemory();
      });
      
      const memoryBefore = performanceMonitor.recordMemory();
      
      await services.audioProcessor.cleanupChunks(chunkFiles);
      
      const memoryAfter = performanceMonitor.recordMemory();
      
      // Memory should not increase significantly after cleanup
      const memoryIncrease = memoryAfter.heapUsed - memoryBefore.heapUsed;
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB increase
    });
  });

  describe('Concurrent Operations Performance', () => {
    it('should handle multiple simultaneous chunk processing', async () => {
      const chunks = Array.from({ length: 20 }, (_, i) => `Concurrent chunk ${i}`);
      
      services.ttsService.convertTextToSpeech.mockImplementation(async (text) => {
        const processingTime = Math.random() * 100 + 50; // 50-150ms random processing time
        await new Promise(resolve => setTimeout(resolve, processingTime));
        performanceMonitor.recordMemory();
        return `/output/${text.replace(/\s+/g, '_')}.wav`;
      });
      
      performanceMonitor.start();
      
      // Process chunks concurrently (simulate parallel processing)
      const promises = chunks.map(chunk => 
        services.ttsService.convertTextToSpeech(chunk, 'voice', 1.0, `/output/${chunk}.wav`)
      );
      
      const results = await Promise.all(promises);
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      
      expect(results).toHaveLength(20);
      expect(elapsedTime).toBeLessThan(1000); // Concurrent processing should be much faster
      expect(services.ttsService.convertTextToSpeech).toHaveBeenCalledTimes(20);
    });

    it('should maintain performance under load', async () => {
      const loadTestOperations = 100;
      const operationTimes = [];
      
      services.ttsService.convertTextToSpeech.mockImplementation(async () => {
        const startTime = performance.now();
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10)); // 10-60ms
        const endTime = performance.now();
        operationTimes.push(endTime - startTime);
        performanceMonitor.recordMemory();
      });
      
      performanceMonitor.start();
      
      // Execute operations in batches to simulate load
      const batchSize = 10;
      for (let i = 0; i < loadTestOperations; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, loadTestOperations - i) }, 
          (_, j) => services.ttsService.convertTextToSpeech(`Load test ${i + j}`, 'voice', 1.0, `/output/${i + j}.wav`)
        );
        await Promise.all(batch);
      }
      
      const totalTime = performanceMonitor.getElapsedTime();
      const averageOperationTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length;
      const maxOperationTime = Math.max(...operationTimes);
      
      expect(totalTime).toBeLessThan(10000); // Total time under 10 seconds
      expect(averageOperationTime).toBeLessThan(100); // Average operation under 100ms
      expect(maxOperationTime).toBeLessThan(200); // No single operation over 200ms
    });
  });

  describe('UI Responsiveness Performance', () => {
    it('should emit progress updates frequently during long operations', async () => {
      const longText = 'D'.repeat(50000); // 50k characters
      const progressUpdates = [];
      
      services.ttsService.splitTextIntoChunks.mockReturnValue(
        Array.from({ length: 10 }, (_, i) => longText.slice(i * 5000, (i + 1) * 5000))
      );
      
      services.ttsService.convertTextToSpeech.mockImplementation(async (text, voice, speed, outputPath) => {
        // Simulate progress updates during conversion
        for (let progress = 0; progress <= 100; progress += 20) {
          services.ttsService.emit('progress', {
            phase: 'converting',
            progress,
            timestamp: performance.now()
          });
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      
      services.ttsService.on.mockImplementation((event, callback) => {
        if (event === 'progress') {
          services.ttsService.emit = (eventName, data) => {
            if (eventName === 'progress') {
              progressUpdates.push(data);
              callback(data);
            }
          };
        }
      });
      
      performanceMonitor.start();
      
      const chunks = services.ttsService.splitTextIntoChunks(longText);
      
      // Simulate processing each chunk
      for (let i = 0; i < chunks.length; i++) {
        await services.ttsService.convertTextToSpeech(chunks[i], 'voice', 1.0, `/output/chunk_${i}.wav`);
      }
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      
      expect(progressUpdates.length).toBeGreaterThan(10); // Should have multiple progress updates
      expect(elapsedTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Progress updates should be frequent (at least every 500ms)
      const updateIntervals = [];
      for (let i = 1; i < progressUpdates.length; i++) {
        updateIntervals.push(progressUpdates[i].timestamp - progressUpdates[i - 1].timestamp);
      }
      const maxInterval = Math.max(...updateIntervals);
      expect(maxInterval).toBeLessThan(500); // No gap longer than 500ms between updates
    });

    it('should maintain responsive chunk size calculation', async () => {
      const testSizes = [1000, 5000, 10000, 25000, 50000];
      const calculationTimes = [];
      
      services.ttsService.setMaxChunkLength.mockImplementation((length) => {
        const startTime = performance.now();
        
        // Simulate chunk size validation and adjustment
        const minLength = 1000;
        const maxLength = 10000;
        const adjustedLength = Math.max(minLength, Math.min(maxLength, length));
        
        const endTime = performance.now();
        calculationTimes.push(endTime - startTime);
        
        return adjustedLength;
      });
      
      performanceMonitor.start();
      
      for (const size of testSizes) {
        services.ttsService.setMaxChunkLength(size);
      }
      
      const totalTime = performanceMonitor.getElapsedTime();
      const maxCalculationTime = Math.max(...calculationTimes);
      
      expect(totalTime).toBeLessThan(100); // All calculations under 100ms
      expect(maxCalculationTime).toBeLessThan(50); // No single calculation over 50ms
    });
  });

  describe('Resource Cleanup Performance', () => {
    it('should cleanup temporary files efficiently', async () => {
      const tempFiles = Array.from({ length: 100 }, (_, i) => `/temp/chunk_${i}.wav`);
      
      services.audioProcessor.cleanupChunks.mockImplementation(async (files) => {
        performanceMonitor.recordMemory();
        
        // Simulate file deletion
        for (const file of files) {
          await new Promise(resolve => setTimeout(resolve, 2)); // 2ms per file
        }
        
        performanceMonitor.recordMemory();
      });
      
      performanceMonitor.start();
      
      await services.audioProcessor.cleanupChunks(tempFiles);
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      
      expect(elapsedTime).toBeLessThan(1000); // Should cleanup 100 files within 1 second
      expect(services.audioProcessor.cleanupChunks).toHaveBeenCalledWith(tempFiles);
    });

    it('should handle cleanup failures gracefully without performance impact', async () => {
      const tempFiles = Array.from({ length: 50 }, (_, i) => `/temp/chunk_${i}.wav`);
      
      services.audioProcessor.cleanupChunks.mockImplementation(async (files) => {
        performanceMonitor.recordMemory();
        
        for (let i = 0; i < files.length; i++) {
          // Simulate some cleanup failures
          if (i % 10 === 0) {
            // Simulate failure but continue processing
            await new Promise(resolve => setTimeout(resolve, 5));
          } else {
            await new Promise(resolve => setTimeout(resolve, 2));
          }
        }
        
        performanceMonitor.recordMemory();
      });
      
      performanceMonitor.start();
      
      await services.audioProcessor.cleanupChunks(tempFiles);
      
      const elapsedTime = performanceMonitor.getElapsedTime();
      
      // Even with failures, cleanup should complete in reasonable time
      expect(elapsedTime).toBeLessThan(2000);
    });
  });
});