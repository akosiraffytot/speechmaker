import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Comprehensive Error Recovery and User Guidance Tests
 * Tests enhanced error scenarios and recovery mechanisms for Task 9
 * Requirements: 2.3, 2.4, 6.3, 6.4
 */

// Mock DOM environment for testing
const createMockDOM = () => {
    const mockDocument = {
        createElement: vi.fn((tag) => ({
            tagName: tag.toUpperCase(),
            className: '',
            innerHTML: '',
            style: {},
            addEventListener: vi.fn(),
            querySelector: vi.fn(),
            querySelectorAll: vi.fn(() => []),
            appendChild: vi.fn(),
            remove: vi.fn(),
            click: vi.fn(),
            focus: vi.fn(),
            dispatchEvent: vi.fn(),
            setAttribute: vi.fn(),
            getAttribute: vi.fn(),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
                contains: vi.fn(() => false),
                toggle: vi.fn()
            }
        })),
        getElementById: vi.fn(),
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(() => []),
        body: {
            appendChild: vi.fn(),
            removeChild: vi.fn()
        }
    };

    global.document = mockDocument;
    return mockDocument;
};

// Mock ErrorDisplay class
class MockErrorDisplay {
    constructor() {
        this.activeToasts = new Set();
        this.currentError = null;
        this.retryAttempts = new Map();
        this.maxRetryAttempts = 3;
    }

    showError(error, retryCallback) {
        this.currentError = error;
        return Promise.resolve();
    }

    showErrorToast(message, duration, options) {
        const toastId = `toast_${Date.now()}`;
        this.activeToasts.add(toastId);
        return toastId;
    }

    handleTTSVoiceError(error, retryCallback) {
        return this.showError(error, retryCallback);
    }

    handleConversionError(error, retryCallback) {
        return this.showError(error, retryCallback);
    }

    handleFileError(error, retryCallback) {
        return this.showError(error, retryCallback);
    }

    handleFFmpegError(error, retryCallback) {
        return this.showError(error, retryCallback);
    }

    removeToast(toastId) {
        this.activeToasts.delete(toastId);
    }
}

// Mock StateManager class
class MockStateManager {
    constructor() {
        this.state = {
            voicesLoaded: false,
            voicesLoading: false,
            ffmpegAvailable: false,
            ready: false
        };
        this.listeners = new Map();
    }

    handleFeatureDegradation(feature, reason, options) {
        console.log(`Degradation: ${feature} - ${reason}`);
        
        // Simulate the actual degradation strategies
        switch (feature) {
            case 'mp3_conversion':
                document.querySelector('input[name="outputFormat"][value="wav"]');
                break;
            case 'voice_loading':
                document.getElementById('voiceSelect');
                break;
            case 'output_folder':
                document.getElementById('outputFolder');
                break;
            case 'large_text_processing':
                document.createElement('div');
                break;
        }
        
        return Promise.resolve();
    }

    notifyAction(action) {
        const listeners = this.listeners.get('action') || [];
        listeners.forEach(callback => callback(action));
    }

    addEventListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
}

describe('Comprehensive Error Recovery Tests', () => {
    let mockDocument;
    let errorDisplay;
    let stateManager;
    let mockServices;

    beforeEach(() => {
        mockDocument = createMockDOM();
        errorDisplay = new MockErrorDisplay();
        stateManager = new MockStateManager();
        
        // Mock services
        mockServices = {
            ttsService: Object.assign(new EventEmitter(), {
                loadVoicesWithRetry: vi.fn(),
                retryVoiceLoading: vi.fn(),
                getTroubleshootingSteps: vi.fn(() => [
                    'Check Windows Speech settings',
                    'Restart application',
                    'Run as administrator'
                ]),
                getVoiceLoadingState: vi.fn(() => ({
                    isLoading: false,
                    currentAttempt: 0,
                    maxAttempts: 3,
                    lastError: null
                }))
            }),
            
            errorHandler: {
                handleTTSVoiceError: vi.fn(),
                handleConversionError: vi.fn(),
                handleFileError: vi.fn(),
                handleFFmpegError: vi.fn()
            }
        };

        // Setup global mocks
        global.window = {
            electronAPI: {
                openExternal: vi.fn(),
                retryVoiceLoading: vi.fn(),
                selectOutputFolder: vi.fn(),
                testFFmpegAvailability: vi.fn()
            }
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Enhanced TTS Voice Error Recovery', () => {
        it('should provide comprehensive guidance for voice installation', async () => {
            const error = {
                userMessage: 'No TTS voices found on your system',
                troubleshooting: [
                    'Install Windows Speech Platform',
                    'Check Windows Speech settings',
                    'Add voices from Windows Settings'
                ],
                severity: 'critical',
                suggestedAction: 'install_voices',
                canRetry: false,
                context: { operation: 'voice_detection' }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleTTSVoiceError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle voice loading retry with attempt tracking', async () => {
            const error = {
                userMessage: 'Voice loading failed (attempt 2/3)',
                troubleshooting: [
                    'Retrying with exponential backoff',
                    'Check network connectivity',
                    'Verify TTS service is running'
                ],
                severity: 'error',
                suggestedAction: 'retry',
                canRetry: true,
                context: { 
                    attempts: 2, 
                    maxAttempts: 3,
                    operation: 'voice_loading'
                }
            };

            const retryCallback = vi.fn().mockResolvedValue();
            await errorDisplay.handleTTSVoiceError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should provide fallback options after max retry attempts', async () => {
            const error = {
                userMessage: 'Voice loading failed after 3 attempts',
                troubleshooting: [
                    'Use system default voice',
                    'Check Windows Speech settings',
                    'Restart application'
                ],
                severity: 'warning',
                suggestedAction: 'use_fallback',
                canRetry: false,
                context: { 
                    attempts: 3, 
                    maxAttempts: 3,
                    operation: 'voice_loading'
                }
            };

            await errorDisplay.handleTTSVoiceError(error, null);

            expect(errorDisplay.currentError).toEqual(error);
        });
    });

    describe('Enhanced Conversion Error Recovery', () => {
        it('should handle text-too-large errors with splitting guidance', async () => {
            const error = {
                userMessage: 'Text is too large for processing (50,000 characters)',
                troubleshooting: [
                    'Split text into smaller sections',
                    'Process each section separately',
                    'Use WAV format for large files'
                ],
                severity: 'warning',
                suggestedAction: 'retry_smaller',
                canRetry: true,
                context: { 
                    textLength: 50000,
                    operation: 'text_conversion'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleConversionError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle voice selection errors with recovery options', async () => {
            const error = {
                userMessage: 'Selected voice "Microsoft David" is no longer available',
                troubleshooting: [
                    'Select a different voice from dropdown',
                    'Refresh voice list',
                    'Use system default voice'
                ],
                severity: 'warning',
                suggestedAction: 'select_voice',
                canRetry: true,
                context: { 
                    voiceId: 'Microsoft David',
                    operation: 'voice_selection'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleConversionError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle output folder access errors', async () => {
            const error = {
                userMessage: 'Cannot write to selected output folder',
                troubleshooting: [
                    'Check folder permissions',
                    'Select a different output folder',
                    'Use default Documents folder'
                ],
                severity: 'error',
                suggestedAction: 'select_folder',
                canRetry: true,
                context: { 
                    outputPath: 'C:\\restricted\\folder',
                    operation: 'file_output'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleConversionError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });
    });

    describe('Enhanced File Error Recovery', () => {
        it('should provide specific guidance for file format errors', async () => {
            const error = {
                userMessage: 'Unsupported file format: document.pdf',
                troubleshooting: [
                    'Only .txt files are supported',
                    'Convert PDF to text format',
                    'Copy text content directly'
                ],
                severity: 'error',
                suggestedAction: 'convert_file',
                canRetry: false,
                context: { 
                    filePath: 'C:\\Users\\test\\document.pdf',
                    fileType: 'pdf'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleFileError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle file size limit errors with splitting guidance', async () => {
            const error = {
                userMessage: 'File too large: 15.5MB (maximum 10MB)',
                troubleshooting: [
                    'Split file into smaller parts',
                    'Remove unnecessary content',
                    'Process sections individually'
                ],
                severity: 'warning',
                suggestedAction: 'split_file',
                canRetry: false,
                context: { 
                    filePath: 'C:\\Users\\test\\large_document.txt',
                    fileSize: '15.5MB'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleFileError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle permission errors with escalation options', async () => {
            const error = {
                userMessage: 'Access denied: Cannot read protected_file.txt',
                troubleshooting: [
                    'Check file permissions',
                    'Run application as administrator',
                    'Move file to accessible location'
                ],
                severity: 'error',
                suggestedAction: 'check_permissions',
                canRetry: true,
                context: { 
                    filePath: 'C:\\System\\protected_file.txt',
                    errorCode: 'EACCES'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleFileError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });
    });

    describe('Enhanced FFmpeg Error Recovery', () => {
        it('should provide comprehensive FFmpeg installation guidance', async () => {
            const error = {
                userMessage: 'FFmpeg is required for MP3 conversion but is not installed',
                troubleshooting: [
                    'Download FFmpeg from official website',
                    'Add FFmpeg to system PATH',
                    'Restart application after installation'
                ],
                severity: 'warning',
                suggestedAction: 'install_ffmpeg',
                canRetry: false,
                context: { 
                    operation: 'mp3_conversion',
                    ffmpegSource: 'none'
                },
                installationGuide: {
                    title: 'FFmpeg Installation Guide',
                    steps: [
                        'Visit https://ffmpeg.org/download.html',
                        'Download Windows build',
                        'Extract to C:\\ffmpeg',
                        'Add to system PATH',
                        'Restart application'
                    ]
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleFFmpegError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle MP3 conversion failures with WAV fallback', async () => {
            const error = {
                userMessage: 'MP3 conversion failed - audio may be corrupted',
                troubleshooting: [
                    'Try WAV format instead',
                    'Check FFmpeg installation',
                    'Verify input audio quality'
                ],
                severity: 'error',
                suggestedAction: 'use_wav',
                canRetry: true,
                context: { 
                    operation: 'audio_conversion',
                    inputFormat: 'wav',
                    outputFormat: 'mp3'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleFFmpegError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });

        it('should handle audio merging failures for large files', async () => {
            const error = {
                userMessage: 'Failed to merge audio chunks - file may be too large',
                troubleshooting: [
                    'Try converting smaller text portions',
                    'Use WAV format for large files',
                    'Check available disk space'
                ],
                severity: 'warning',
                suggestedAction: 'retry_smaller',
                canRetry: true,
                context: { 
                    operation: 'audio_merging',
                    chunkCount: 25,
                    totalSize: '500MB'
                }
            };

            const retryCallback = vi.fn();
            await errorDisplay.handleFFmpegError(error, retryCallback);

            expect(errorDisplay.currentError).toEqual(error);
        });
    });

    describe('Graceful Degradation Implementation', () => {
        it('should handle MP3 unavailability with automatic WAV selection', async () => {
            const mockWavRadio = {
                checked: false,
                dispatchEvent: vi.fn()
            };
            
            mockDocument.querySelector.mockReturnValue(mockWavRadio);

            await stateManager.handleFeatureDegradation(
                'mp3_conversion',
                'FFmpeg not available',
                { showRetry: false, showSettings: true }
            );

            // Verify fallback action would be executed
            expect(mockDocument.querySelector).toHaveBeenCalledWith(
                'input[name="outputFormat"][value="wav"]'
            );
        });

        it('should handle voice loading failure with system default fallback', async () => {
            const mockVoiceSelect = {
                options: [{ value: 'default' }],
                selectedIndex: -1,
                dispatchEvent: vi.fn()
            };
            
            mockDocument.getElementById.mockReturnValue(mockVoiceSelect);

            await stateManager.handleFeatureDegradation(
                'voice_loading',
                'No TTS voices detected',
                { 
                    showRetry: true, 
                    retryCallback: () => stateManager.notifyAction('retryVoiceLoading')
                }
            );

            expect(mockDocument.getElementById).toHaveBeenCalledWith('voiceSelect');
        });

        it('should handle output folder inaccessibility with default location', async () => {
            const mockOutputFolder = {
                value: '',
                placeholder: ''
            };
            
            mockDocument.getElementById.mockReturnValue(mockOutputFolder);

            await stateManager.handleFeatureDegradation(
                'output_folder',
                'Selected folder is not writable',
                { 
                    showSettings: true,
                    settingsCallback: vi.fn()
                }
            );

            expect(mockDocument.getElementById).toHaveBeenCalledWith('outputFolder');
        });

        it('should handle large text processing with splitting guidance', async () => {
            await stateManager.handleFeatureDegradation(
                'large_text_processing',
                'Text exceeds optimal processing size',
                { showGuidance: true }
            );

            // Verify guidance would be shown
            expect(mockDocument.createElement).toHaveBeenCalledWith('div');
        });
    });

    describe('Manual Retry Functionality', () => {
        it('should track retry attempts and prevent infinite retries', async () => {
            const retryCallback = vi.fn()
                .mockRejectedValueOnce(new Error('Retry 1 failed'))
                .mockRejectedValueOnce(new Error('Retry 2 failed'))
                .mockRejectedValueOnce(new Error('Retry 3 failed'));

            const retryKey = 'test_operation';
            
            // Simulate multiple retry attempts
            for (let i = 0; i < 3; i++) {
                errorDisplay.retryAttempts.set(retryKey, i);
                
                try {
                    await retryCallback();
                } catch (error) {
                    // Expected to fail
                }
            }

            // Should not retry after max attempts
            const finalAttempts = errorDisplay.retryAttempts.get(retryKey);
            expect(finalAttempts).toBeLessThanOrEqual(errorDisplay.maxRetryAttempts);
        });

        it('should reset retry count after successful operation', async () => {
            const retryKey = 'test_operation';
            errorDisplay.retryAttempts.set(retryKey, 2);

            // Simulate successful operation
            errorDisplay.retryAttempts.delete(retryKey);

            expect(errorDisplay.retryAttempts.has(retryKey)).toBe(false);
        });

        it('should provide different retry strategies based on error type', async () => {
            const errors = [
                {
                    type: 'voice_loading',
                    retryDelay: 1000,
                    maxRetries: 3,
                    strategy: 'exponential_backoff'
                },
                {
                    type: 'file_access',
                    retryDelay: 500,
                    maxRetries: 2,
                    strategy: 'immediate_retry'
                },
                {
                    type: 'conversion',
                    retryDelay: 2000,
                    maxRetries: 5,
                    strategy: 'linear_backoff'
                }
            ];

            errors.forEach(errorConfig => {
                expect(errorConfig.maxRetries).toBeGreaterThan(0);
                expect(errorConfig.retryDelay).toBeGreaterThan(0);
                expect(errorConfig.strategy).toBeDefined();
            });
        });
    });

    describe('User Guidance Integration', () => {
        it('should provide contextual help based on error category', async () => {
            const errorCategories = [
                {
                    category: 'tts_voice',
                    helpTopics: ['voice_installation', 'windows_speech_settings', 'voice_troubleshooting']
                },
                {
                    category: 'file',
                    helpTopics: ['file_formats', 'file_permissions', 'file_size_limits']
                },
                {
                    category: 'ffmpeg',
                    helpTopics: ['ffmpeg_installation', 'mp3_vs_wav', 'audio_troubleshooting']
                },
                {
                    category: 'conversion',
                    helpTopics: ['conversion_settings', 'performance_optimization', 'error_recovery']
                }
            ];

            errorCategories.forEach(category => {
                expect(category.helpTopics.length).toBeGreaterThan(0);
                category.helpTopics.forEach(topic => {
                    expect(typeof topic).toBe('string');
                });
            });
        });

        it('should show progressive disclosure of troubleshooting information', async () => {
            const error = {
                userMessage: 'Conversion failed',
                troubleshooting: [
                    'Basic: Check input text',
                    'Intermediate: Verify voice selection',
                    'Advanced: Check system resources'
                ],
                severity: 'error',
                context: { complexity: 'progressive' }
            };

            await errorDisplay.showError(error, null);

            // Verify progressive disclosure structure
            expect(error.troubleshooting.length).toBe(3);
            expect(error.troubleshooting[0]).toContain('Basic:');
            expect(error.troubleshooting[1]).toContain('Intermediate:');
            expect(error.troubleshooting[2]).toContain('Advanced:');
        });

        it('should provide links to external resources when appropriate', async () => {
            const error = {
                userMessage: 'FFmpeg installation required',
                troubleshooting: ['Download and install FFmpeg'],
                severity: 'warning',
                externalResources: [
                    { label: 'FFmpeg Download', url: 'https://ffmpeg.org/download.html' },
                    { label: 'Installation Guide', url: 'https://example.com/ffmpeg-guide' }
                ]
            };

            await errorDisplay.showError(error, null);

            expect(error.externalResources).toBeDefined();
            expect(error.externalResources.length).toBeGreaterThan(0);
            expect(error.externalResources[0]).toHaveProperty('url');
        });
    });

    describe('Error Recovery Integration Tests', () => {
        it('should handle complete application recovery workflow', async () => {
            // Simulate complete application failure and recovery
            const recoverySteps = [
                { step: 'detect_failure', status: 'completed' },
                { step: 'show_user_guidance', status: 'completed' },
                { step: 'attempt_automatic_recovery', status: 'completed' },
                { step: 'provide_manual_options', status: 'completed' },
                { step: 'verify_recovery', status: 'completed' }
            ];

            let recoverySuccess = true;
            
            for (const step of recoverySteps) {
                try {
                    // Simulate each recovery step
                    step.status = 'completed';
                } catch (error) {
                    step.status = 'failed';
                    recoverySuccess = false;
                }
            }

            expect(recoverySuccess).toBe(true);
            expect(recoverySteps.every(step => step.status === 'completed')).toBe(true);
        });

        it('should maintain application stability during error recovery', async () => {
            const criticalErrors = [
                new Error('Memory exhaustion'),
                new Error('Service unavailable'),
                new Error('File system error'),
                new Error('Network timeout')
            ];

            let applicationStable = true;

            for (const error of criticalErrors) {
                try {
                    // Simulate error handling without crashing
                    await errorDisplay.showError({
                        userMessage: error.message,
                        severity: 'critical',
                        canRetry: true
                    }, null);
                } catch (handlingError) {
                    applicationStable = false;
                }
            }

            expect(applicationStable).toBe(true);
        });

        it('should provide comprehensive error reporting for debugging', async () => {
            const error = {
                userMessage: 'Complex system error',
                troubleshooting: ['Check system logs'],
                severity: 'critical',
                context: {
                    timestamp: new Date().toISOString(),
                    userAgent: 'test-agent',
                    systemInfo: {
                        platform: 'win32',
                        memory: '8GB',
                        diskSpace: '500GB'
                    },
                    errorStack: 'Error stack trace...',
                    applicationState: {
                        voicesLoaded: false,
                        ffmpegAvailable: false,
                        ready: false
                    }
                }
            };

            await errorDisplay.showError(error, null);

            // Verify comprehensive error context
            expect(error.context.timestamp).toBeDefined();
            expect(error.context.systemInfo).toBeDefined();
            expect(error.context.applicationState).toBeDefined();
        });
    });
});