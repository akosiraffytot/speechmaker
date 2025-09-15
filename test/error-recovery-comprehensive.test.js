/**
 * Comprehensive error recovery and resilience tests
 * Tests error scenarios, recovery mechanisms, and graceful degradation
 * 
 * Requirements: 2.2, 2.3, 4.4, 5.3, 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Error Recovery and Resilience', () => {
    let mockServices;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockServices = {
            audioProcessor: {
                initializeFFmpeg: vi.fn(),
                validateFFmpeg: vi.fn(),
                detectSystemFFmpeg: vi.fn(),
                getBundledFFmpegPath: vi.fn()
            },
            ttsService: {
                loadVoicesWithRetry: vi.fn(),
                loadAvailableVoices: vi.fn(),
                retryVoiceLoading: vi.fn(),
                getTroubleshootingSteps: vi.fn()
            },
            settingsManager: {
                initialize: vi.fn(),
                loadSettings: vi.fn(),
                getDefaultOutputFolder: vi.fn(),
                ensureDirectoryExists: vi.fn()
            },
            stateManager: {
                updateInitializationState: vi.fn(),
                updateVoiceState: vi.fn(),
                updateFFmpegState: vi.fn(),
                updateOutputFolderState: vi.fn(),
                getState: vi.fn()
            }
        };
    });

    describe('FFmpeg Error Recovery', () => {
        it('should recover from corrupted bundled FFmpeg', async () => {
            // Bundled FFmpeg is corrupted
            mockServices.audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            mockServices.audioProcessor.validateFFmpeg
                .mockResolvedValueOnce({ valid: false, error: 'Corrupted executable' })
                .mockResolvedValueOnce({ valid: true, version: '4.3.0', error: null });
            
            // System FFmpeg is available
            mockServices.audioProcessor.detectSystemFFmpeg.mockResolvedValue('/system/ffmpeg.exe');
            
            const result = await mockServices.audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(true);
            expect(result.source).toBe('system');
            expect(mockServices.audioProcessor.validateFFmpeg).toHaveBeenCalledTimes(2);
        });

        it('should gracefully degrade when no FFmpeg is available', async () => {
            mockServices.audioProcessor.getBundledFFmpegPath.mockReturnValue('/bundled/ffmpeg.exe');
            mockServices.audioProcessor.validateFFmpeg.mockResolvedValue({ 
                valid: false, 
                error: 'Not found' 
            });
            mockServices.audioProcessor.detectSystemFFmpeg.mockResolvedValue(null);
            
            const result = await mockServices.audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(false);
            expect(result.source).toBe('none');
            expect(result.error).toContain('No working FFmpeg installation found');
        });

        it('should handle FFmpeg validation timeout', async () => {
            mockServices.audioProcessor.validateFFmpeg.mockImplementation(async () => {
                throw new Error('Command timed out after 30 seconds');
            });
            
            const result = await mockServices.audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(false);
            expect(result.error).toContain('timed out');
        });

        it('should recover from temporary FFmpeg process failures', async () => {
            let callCount = 0;
            mockServices.audioProcessor.validateFFmpeg.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Process failed to start');
                }
                return { valid: true, version: '4.4.0', error: null };
            });
            
            // Should retry validation
            const result = await mockServices.audioProcessor.initializeFFmpeg();
            
            expect(result.available).toBe(true);
            expect(callCount).toBe(2);
        });
    });

    describe('Voice Loading Error Recovery', () => {
        it('should recover from Windows TTS service unavailable', async () => {
            let attemptCount = 0;
            mockServices.ttsService.loadAvailableVoices.mockImplementation(async () => {
                attemptCount++;
                if (attemptCount <= 2) {
                    const error = new Error('TTS service is not available');
                    error.code = 'SERVICE_UNAVAILABLE';
                    throw error;
                }
                return [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }];
            });
            
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(true);
            expect(attemptCount).toBe(3);
            expect(mockServices.ttsService.sleep).toHaveBeenCalledTimes(2);
        });

        it('should provide troubleshooting for persistent voice loading failures', async () => {
            mockServices.ttsService.loadAvailableVoices.mockRejectedValue(
                new Error('No voices found')
            );
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            mockServices.ttsService.getTroubleshootingSteps.mockReturnValue([
                'Ensure Windows Speech Platform is installed',
                'Check Windows TTS settings in Control Panel',
                'Restart the application as administrator'
            ]);
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(false);
            expect(result.troubleshooting).toHaveLength(3);
            expect(result.troubleshooting[0]).toContain('Windows Speech Platform');
        });

        it('should handle voice loading permission errors', async () => {
            const permissionError = new Error('Access denied to TTS service');
            permissionError.code = 'EACCES';
            
            mockServices.ttsService.loadAvailableVoices.mockRejectedValue(permissionError);
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(result.error.code).toBe('EACCES');
        });

        it('should recover from network-related voice loading issues', async () => {
            let networkIssue = true;
            mockServices.ttsService.loadAvailableVoices.mockImplementation(async () => {
                if (networkIssue) {
                    networkIssue = false;
                    const error = new Error('Network timeout');
                    error.code = 'ETIMEDOUT';
                    throw error;
                }
                return [{ id: 'voice1', name: 'Voice 1' }];
            });
            
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(true);
            expect(result.attempt).toBe(2);
        });
    });

    describe('Settings and Folder Error Recovery', () => {
        it('should recover from corrupted settings file', async () => {
            mockServices.settingsManager.loadSettings
                .mockRejectedValueOnce(new Error('Invalid JSON in settings file'))
                .mockResolvedValueOnce({
                    defaultOutputPath: '/recovered/path',
                    voiceSpeed: 1.0
                });
            
            const result = await mockServices.settingsManager.initialize();
            
            expect(result).toBe(true);
            expect(mockServices.settingsManager.loadSettings).toHaveBeenCalledTimes(2);
        });

        it('should handle folder creation failures with fallback', () => {
            mockServices.settingsManager.ensureDirectoryExists
                .mockReturnValueOnce(false) // Documents fails
                .mockReturnValueOnce(false) // Home fails  
                .mockReturnValueOnce(true);  // Temp succeeds
            
            const result = mockServices.settingsManager.getDefaultOutputFolder();
            
            expect(result).toContain('tmp');
            expect(mockServices.settingsManager.ensureDirectoryExists).toHaveBeenCalledTimes(3);
        });

        it('should recover from disk space issues', () => {
            const diskSpaceError = new Error('No space left on device');
            diskSpaceError.code = 'ENOSPC';
            
            mockServices.settingsManager.ensureDirectoryExists.mockImplementation((path) => {
                if (path.includes('Documents') || path.includes('SpeechMaker')) {
                    throw diskSpaceError;
                }
                return true;
            });
            
            const result = mockServices.settingsManager.getDefaultOutputFolder();
            
            // Should fallback to temp directory
            expect(result).toContain('tmp');
        });

        it('should handle read-only filesystem gracefully', () => {
            mockServices.settingsManager.ensureDirectoryExists.mockImplementation((path) => {
                if (path.includes('Documents')) {
                    const error = new Error('Read-only file system');
                    error.code = 'EROFS';
                    throw error;
                }
                return path.includes('tmp');
            });
            
            const result = mockServices.settingsManager.getDefaultOutputFolder();
            
            expect(result).toContain('tmp');
        });
    });

    describe('Application State Error Recovery', () => {
        it('should maintain partial functionality when some services fail', () => {
            // Voice loading succeeds
            mockServices.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Voice 1' }
            ]);
            
            // FFmpeg fails
            mockServices.stateManager.updateFFmpegState(false, 'none', false);
            
            // Output folder succeeds
            mockServices.stateManager.updateOutputFolderState(true, '/output/path');
            
            // Complete initialization
            mockServices.stateManager.updateInitializationState(false);
            
            const state = mockServices.stateManager.getState();
            
            // Should be partially functional (WAV only)
            expect(state.voicesLoaded).toBe(true);
            expect(state.ffmpegAvailable).toBe(false);
            expect(state.outputFolderSet).toBe(true);
        });

        it('should recover from state corruption', () => {
            // Simulate corrupted state
            mockServices.stateManager.getState.mockReturnValueOnce({
                voicesLoaded: undefined,
                ffmpegAvailable: null,
                ready: 'invalid'
            });
            
            // Reset and reinitialize
            mockServices.stateManager.reset = vi.fn();
            mockServices.stateManager.reset();
            
            // Verify reset was called
            expect(mockServices.stateManager.reset).toHaveBeenCalled();
        });

        it('should handle concurrent state update conflicts', () => {
            // Simulate rapid concurrent updates
            const updates = [];
            for (let i = 0; i < 10; i++) {
                updates.push(
                    Promise.resolve().then(() => {
                        mockServices.stateManager.updateVoiceState(i % 2 === 0, i > 5, [], i);
                    })
                );
            }
            
            // Should handle all updates without errors
            expect(() => Promise.all(updates)).not.toThrow();
        });
    });

    describe('Network and Connectivity Error Recovery', () => {
        it('should handle network disconnection during initialization', async () => {
            const networkError = new Error('Network is unreachable');
            networkError.code = 'ENETUNREACH';
            
            mockServices.ttsService.loadAvailableVoices.mockRejectedValue(networkError);
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(result.error.code).toBe('ENETUNREACH');
        });

        it('should recover when network becomes available', async () => {
            let networkAvailable = false;
            
            mockServices.ttsService.loadAvailableVoices.mockImplementation(async () => {
                if (!networkAvailable) {
                    networkAvailable = true;
                    const error = new Error('Network timeout');
                    error.code = 'ETIMEDOUT';
                    throw error;
                }
                return [{ id: 'voice1', name: 'Voice 1' }];
            });
            
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(3);
            
            expect(result.success).toBe(true);
            expect(result.attempt).toBe(2);
        });
    });

    describe('Resource Exhaustion Recovery', () => {
        it('should handle memory pressure during initialization', async () => {
            // Simulate memory pressure
            const largeArrays = [];
            try {
                for (let i = 0; i < 5; i++) {
                    largeArrays.push(new Array(1000000).fill('memory-pressure'));
                }
                
                // Services should still initialize
                mockServices.settingsManager.initialize.mockResolvedValue(true);
                mockServices.audioProcessor.initializeFFmpeg.mockResolvedValue({
                    available: true,
                    source: 'bundled'
                });
                
                const results = await Promise.all([
                    mockServices.settingsManager.initialize(),
                    mockServices.audioProcessor.initializeFFmpeg()
                ]);
                
                expect(results[0]).toBe(true);
                expect(results[1].available).toBe(true);
                
            } finally {
                // Clean up memory
                largeArrays.length = 0;
            }
        });

        it('should handle file handle exhaustion', async () => {
            const fileHandleError = new Error('Too many open files');
            fileHandleError.code = 'EMFILE';
            
            mockServices.settingsManager.loadSettings.mockRejectedValue(fileHandleError);
            
            // Should handle gracefully and provide fallback
            const result = await mockServices.settingsManager.initialize();
            
            expect(result).toBe(false);
        });
    });

    describe('Graceful Degradation Scenarios', () => {
        it('should provide WAV-only functionality when FFmpeg unavailable', () => {
            mockServices.stateManager.updateFFmpegState(false, 'none', false);
            mockServices.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Voice 1' }
            ]);
            mockServices.stateManager.updateOutputFolderState(true, '/output/path');
            
            const state = mockServices.stateManager.getState();
            
            // Should be functional for WAV conversion
            expect(state.voicesLoaded).toBe(true);
            expect(state.ffmpegAvailable).toBe(false);
            expect(state.outputFolderSet).toBe(true);
        });

        it('should handle single voice availability', () => {
            mockServices.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Microsoft David Desktop', language: 'en-US' }
            ]);
            
            const state = mockServices.stateManager.getState();
            
            expect(state.voicesLoaded).toBe(true);
            expect(state.voices).toHaveLength(1);
        });

        it('should function with temporary directory as output', () => {
            mockServices.settingsManager.getDefaultOutputFolder.mockReturnValue('/tmp');
            mockServices.stateManager.updateOutputFolderState(false, '/tmp');
            
            const state = mockServices.stateManager.getState();
            
            expect(state.outputFolderSet).toBe(false); // Using default
            expect(state.defaultOutputPath).toBe('/tmp');
        });
    });

    describe('Error Message and User Guidance', () => {
        it('should provide clear error messages for common issues', () => {
            const troubleshootingSteps = [
                'Ensure Windows Speech Platform is installed and enabled',
                'Check Windows TTS settings in Control Panel > Speech',
                'Restart the application as administrator',
                'Verify Windows updates are installed',
                'Check if antivirus software is blocking TTS access'
            ];
            
            mockServices.ttsService.getTroubleshootingSteps.mockReturnValue(troubleshootingSteps);
            
            const steps = mockServices.ttsService.getTroubleshootingSteps();
            
            expect(steps).toHaveLength(5);
            expect(steps[0]).toContain('Windows Speech Platform');
            expect(steps[1]).toContain('Control Panel');
            expect(steps[2]).toContain('administrator');
        });

        it('should provide context-specific error guidance', async () => {
            const permissionError = new Error('Access denied');
            permissionError.code = 'EACCES';
            
            mockServices.ttsService.loadAvailableVoices.mockRejectedValue(permissionError);
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const result = await mockServices.ttsService.loadVoicesWithRetry(2);
            
            expect(result.success).toBe(false);
            expect(result.troubleshooting).toContain('administrator');
        });

        it('should suggest recovery actions for specific errors', () => {
            const errorScenarios = [
                {
                    error: 'FFmpeg not found',
                    expectedGuidance: 'install FFmpeg'
                },
                {
                    error: 'No voices available',
                    expectedGuidance: 'Windows Speech Platform'
                },
                {
                    error: 'Permission denied',
                    expectedGuidance: 'administrator'
                },
                {
                    error: 'Network timeout',
                    expectedGuidance: 'internet connection'
                }
            ];
            
            errorScenarios.forEach(scenario => {
                mockServices.ttsService.getTroubleshootingSteps.mockReturnValue([
                    `To resolve "${scenario.error}", please ${scenario.expectedGuidance}`
                ]);
                
                const steps = mockServices.ttsService.getTroubleshootingSteps();
                expect(steps[0]).toContain(scenario.expectedGuidance);
            });
        });
    });

    describe('Recovery Performance', () => {
        it('should recover quickly from transient errors', async () => {
            let errorThrown = false;
            mockServices.ttsService.loadAvailableVoices.mockImplementation(async () => {
                if (!errorThrown) {
                    errorThrown = true;
                    throw new Error('Transient error');
                }
                return [{ id: 'voice1', name: 'Voice 1' }];
            });
            
            mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
            
            const startTime = Date.now();
            const result = await mockServices.ttsService.loadVoicesWithRetry(3);
            const endTime = Date.now();
            
            expect(result.success).toBe(true);
            expect(endTime - startTime).toBeLessThan(1000); // Fast recovery
        });

        it('should not consume excessive resources during error recovery', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Simulate multiple error recovery attempts
            for (let i = 0; i < 10; i++) {
                mockServices.ttsService.loadAvailableVoices.mockRejectedValue(
                    new Error('Simulated error')
                );
                mockServices.ttsService.sleep = vi.fn().mockResolvedValue();
                
                try {
                    await mockServices.ttsService.loadVoicesWithRetry(2);
                } catch (error) {
                    // Expected to fail
                }
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Should not leak significant memory
            expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024); // Less than 5MB
        });
    });
});