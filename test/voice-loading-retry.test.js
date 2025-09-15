/**
 * Unit tests for voice loading retry mechanism
 * Tests retry logic, exponential backoff, and error recovery
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

describe('Voice Loading Retry Mechanism', () => {
    let TTSService;
    let ttsService;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Import TTSService after mocks are set up
        const module = await import('../src/main/services/ttsService.js');
        TTSService = module.default;
        ttsService = new TTSService();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('loadVoicesWithRetry', () => {
        it('should succeed on first attempt when voices load successfully', async () => {
            const mockVoices = [
                { id: 'voice1', name: 'Voice 1', gender: 'Male', language: 'en-US', isDefault: true },
                { id: 'voice2', name: 'Voice 2', gender: 'Female', language: 'en-US', isDefault: false }
            ];
            
            ttsService.loadAvailableVoices = vi.fn().mockResolvedValue(mockVoices);
            
            const result = await ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(true);
            expect(result.voices).toEqual(mockVoices);
            expect(result.attempt).toBe(1);
            expect(result.totalAttempts).toBe(3);
            expect(ttsService.loadAvailableVoices).toHaveBeenCalledTimes(1);
        });

        it('should retry with exponential backoff on failure', async () => {
            const mockError = new Error('Voice loading failed');
            const delays = [];
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockImplementation((ms) => {
                delays.push(ms);
                return Promise.resolve();
            });
            
            const result = await ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe(mockError);
            expect(result.attempts).toBe(3);
            expect(ttsService.loadAvailableVoices).toHaveBeenCalledTimes(3);
            
            // Check exponential backoff delays
            expect(delays).toEqual([2000, 4000]); // 2^1 * 1000, 2^2 * 1000
        });

        it('should succeed after retries', async () => {
            const mockVoices = [{ id: 'voice1', name: 'Voice 1', gender: 'Male', language: 'en-US', isDefault: true }];
            let attemptCount = 0;
            
            ttsService.loadAvailableVoices = vi.fn().mockImplementation(() => {
                attemptCount++;
                if (attemptCount < 3) {
                    throw new Error('Temporary failure');
                }
                return Promise.resolve(mockVoices);
            });
            
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(true);
            expect(result.voices).toEqual(mockVoices);
            expect(result.attempt).toBe(3);
            expect(attemptCount).toBe(3);
        });

        it('should emit correct events during retry process', async () => {
            const events = [];
            const mockError = new Error('Voice loading failed');
            
            ttsService.on('voiceLoadingStarted', (data) => events.push({ type: 'started', data }));
            ttsService.on('voiceLoadingAttempt', (data) => events.push({ type: 'attempt', data }));
            ttsService.on('voiceLoadRetry', (data) => events.push({ type: 'retry', data }));
            ttsService.on('voiceLoadingFailed', (data) => events.push({ type: 'failed', data }));
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            await ttsService.loadVoicesWithRetry(2);
            
            expect(events).toHaveLength(5); // started, attempt1, retry, attempt2, failed
            expect(events[0].type).toBe('started');
            expect(events[1].type).toBe('attempt');
            expect(events[1].data.attempt).toBe(1);
            expect(events[2].type).toBe('retry');
            expect(events[2].data.nextAttempt).toBe(2);
            expect(events[3].type).toBe('attempt');
            expect(events[3].data.attempt).toBe(2);
            expect(events[4].type).toBe('failed');
        });

        it('should emit success event on successful loading', async () => {
            const events = [];
            const mockVoices = [{ id: 'voice1', name: 'Voice 1' }];
            
            ttsService.on('voiceLoadingSuccess', (data) => events.push({ type: 'success', data }));
            
            ttsService.loadAvailableVoices = vi.fn().mockResolvedValue(mockVoices);
            
            await ttsService.loadVoicesWithRetry(3);
            
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('success');
            expect(events[0].data.voiceCount).toBe(1);
            expect(events[0].data.attempt).toBe(1);
        });

        it('should update voice loading state during process', async () => {
            const mockError = new Error('Voice loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            // Check initial state
            expect(ttsService.voiceLoadingState.isLoading).toBe(false);
            expect(ttsService.voiceLoadingState.currentAttempt).toBe(0);
            
            const loadingPromise = ttsService.loadVoicesWithRetry(2);
            
            // State should be updated during loading
            expect(ttsService.voiceLoadingState.isLoading).toBe(true);
            
            await loadingPromise;
            
            // State should be updated after completion
            expect(ttsService.voiceLoadingState.isLoading).toBe(false);
            expect(ttsService.voiceLoadingState.lastError).toBe(mockError);
        });

        it('should provide troubleshooting steps on failure', async () => {
            const mockError = new Error('Voice loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(Array.isArray(result.troubleshooting)).toBe(true);
            expect(result.troubleshooting.length).toBeGreaterThan(0);
            expect(result.troubleshooting).toContain('Ensure Windows Speech Platform is installed and enabled');
        });

        it('should handle empty voice list as failure', async () => {
            ttsService.loadAvailableVoices = vi.fn().mockResolvedValue([]);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(result.error.message).toContain('No voices found');
        });

        it('should respect maximum retry attempts', async () => {
            const mockError = new Error('Voice loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            await ttsService.loadVoicesWithRetry(5);
            
            expect(ttsService.loadAvailableVoices).toHaveBeenCalledTimes(5);
        });

        it('should not delay after final attempt', async () => {
            const mockError = new Error('Voice loading failed');
            let sleepCalled = false;
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockImplementation(() => {
                sleepCalled = true;
                return Promise.resolve();
            });
            
            await ttsService.loadVoicesWithRetry(1); // Only 1 attempt
            
            expect(sleepCalled).toBe(false);
        });
    });

    describe('getTroubleshootingSteps', () => {
        it('should return comprehensive troubleshooting steps', () => {
            const steps = ttsService.getTroubleshootingSteps();
            
            expect(Array.isArray(steps)).toBe(true);
            expect(steps.length).toBeGreaterThan(3);
            
            // Check for key troubleshooting steps
            const stepText = steps.join(' ');
            expect(stepText).toContain('Windows Speech Platform');
            expect(stepText).toContain('Control Panel');
            expect(stepText).toContain('administrator');
            expect(stepText).toContain('Windows updates');
        });

        it('should provide actionable steps', () => {
            const steps = ttsService.getTroubleshootingSteps();
            
            // Each step should be a non-empty string
            steps.forEach(step => {
                expect(typeof step).toBe('string');
                expect(step.length).toBeGreaterThan(10);
            });
        });
    });

    describe('retryVoiceLoading', () => {
        it('should manually retry voice loading', async () => {
            const mockVoices = [{ id: 'voice1', name: 'Voice 1' }];
            
            ttsService.loadVoicesWithRetry = vi.fn().mockResolvedValue({
                success: true,
                voices: mockVoices,
                attempt: 1
            });
            
            await ttsService.retryVoiceLoading();
            
            expect(ttsService.loadVoicesWithRetry).toHaveBeenCalledWith(3);
            expect(ttsService.availableVoices).toEqual(mockVoices);
            expect(ttsService.isInitialized).toBe(true);
        });

        it('should handle manual retry failure', async () => {
            const mockError = new Error('Retry failed');
            
            ttsService.loadVoicesWithRetry = vi.fn().mockResolvedValue({
                success: false,
                error: mockError,
                attempts: 3
            });
            
            await expect(ttsService.retryVoiceLoading()).rejects.toThrow('Retry failed');
        });

        it('should emit retry events', async () => {
            const events = [];
            
            ttsService.on('voiceRetryStarted', (data) => events.push({ type: 'retryStarted', data }));
            ttsService.on('voiceRetryCompleted', (data) => events.push({ type: 'retryCompleted', data }));
            
            ttsService.loadVoicesWithRetry = vi.fn().mockResolvedValue({
                success: true,
                voices: [],
                attempt: 2
            });
            
            await ttsService.retryVoiceLoading();
            
            expect(events).toHaveLength(2);
            expect(events[0].type).toBe('retryStarted');
            expect(events[1].type).toBe('retryCompleted');
        });
    });

    describe('sleep utility', () => {
        it('should resolve after specified delay', async () => {
            const startTime = Date.now();
            
            await ttsService.sleep(100);
            
            const endTime = Date.now();
            const elapsed = endTime - startTime;
            
            // Allow some tolerance for timing
            expect(elapsed).toBeGreaterThanOrEqual(90);
            expect(elapsed).toBeLessThan(200);
        });

        it('should handle zero delay', async () => {
            const startTime = Date.now();
            
            await ttsService.sleep(0);
            
            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(50);
        });

        it('should handle negative delay as zero', async () => {
            const startTime = Date.now();
            
            await ttsService.sleep(-100);
            
            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(50);
        });
    });

    describe('Voice Loading State Management', () => {
        it('should initialize with correct default state', () => {
            expect(ttsService.voiceLoadingState).toEqual({
                isLoading: false,
                currentAttempt: 0,
                maxAttempts: 3,
                lastError: null,
                retryDelay: 0
            });
        });

        it('should update state during loading process', async () => {
            const mockError = new Error('Loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const loadingPromise = ttsService.loadVoicesWithRetry(2);
            
            // Check state during loading
            expect(ttsService.voiceLoadingState.isLoading).toBe(true);
            expect(ttsService.voiceLoadingState.currentAttempt).toBeGreaterThan(0);
            
            await loadingPromise;
            
            // Check final state
            expect(ttsService.voiceLoadingState.isLoading).toBe(false);
            expect(ttsService.voiceLoadingState.lastError).toBe(mockError);
        });

        it('should provide voice loading state with troubleshooting', () => {
            const state = ttsService.getVoiceLoadingState();
            
            expect(state).toHaveProperty('isLoading');
            expect(state).toHaveProperty('currentAttempt');
            expect(state).toHaveProperty('maxAttempts');
            expect(state).toHaveProperty('lastError');
            expect(state).toHaveProperty('retryDelay');
            expect(state).toHaveProperty('troubleshootingSteps');
            expect(Array.isArray(state.troubleshootingSteps)).toBe(true);
        });

        it('should reset state on successful loading', async () => {
            const mockVoices = [{ id: 'voice1', name: 'Voice 1' }];
            
            // First set error state
            ttsService.voiceLoadingState.lastError = new Error('Previous error');
            ttsService.voiceLoadingState.currentAttempt = 2;
            
            ttsService.loadAvailableVoices = vi.fn().mockResolvedValue(mockVoices);
            
            await ttsService.loadVoicesWithRetry(3);
            
            expect(ttsService.voiceLoadingState.lastError).toBe(null);
            expect(ttsService.voiceLoadingState.currentAttempt).toBe(0);
        });
    });

    describe('Error Recovery Scenarios', () => {
        it('should handle network connectivity issues', async () => {
            const networkError = new Error('Network is unreachable');
            networkError.code = 'ENETUNREACH';
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(networkError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe(networkError);
            expect(result.troubleshooting).toContain('Check your internet connection');
        });

        it('should handle permission errors', async () => {
            const permissionError = new Error('Access denied');
            permissionError.code = 'EACCES';
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(permissionError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(result.troubleshooting).toContain('administrator');
        });

        it('should handle service unavailable errors', async () => {
            const serviceError = new Error('Service temporarily unavailable');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(serviceError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(false);
            expect(result.troubleshooting).toContain('Windows TTS service');
        });

        it('should handle timeout errors with appropriate retry delay', async () => {
            const timeoutError = new Error('Request timeout');
            timeoutError.code = 'ETIMEDOUT';
            
            const delays = [];
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(timeoutError);
            ttsService.sleep = vi.fn().mockImplementation((ms) => {
                delays.push(ms);
                return Promise.resolve();
            });
            
            await ttsService.loadVoicesWithRetry(3);
            
            // Should use exponential backoff for timeout errors
            expect(delays).toEqual([2000, 4000]);
        });
    });

    describe('Performance and Resource Management', () => {
        it('should complete retry process within reasonable time', async () => {
            const mockError = new Error('Loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue(); // Mock sleep to avoid actual delays
            
            const startTime = Date.now();
            await ttsService.loadVoicesWithRetry(3);
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly with mocked sleep
        });

        it('should not consume excessive memory during retries', async () => {
            const mockError = new Error('Loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            // Monitor memory usage (basic check)
            const initialMemory = process.memoryUsage().heapUsed;
            
            await ttsService.loadVoicesWithRetry(10); // Many retries
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory increase should be reasonable (less than 10MB)
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        });

        it('should clean up resources after failed retries', async () => {
            const mockError = new Error('Loading failed');
            
            ttsService.loadAvailableVoices = vi.fn().mockRejectedValue(mockError);
            ttsService.sleep = vi.fn().mockResolvedValue();
            
            await ttsService.loadVoicesWithRetry(3);
            
            // Voice loading state should be properly cleaned up
            expect(ttsService.voiceLoadingState.isLoading).toBe(false);
            expect(ttsService.voiceLoadingState.currentAttempt).toBe(0);
        });
    });
});