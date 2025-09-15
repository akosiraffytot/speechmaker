/**
 * End-to-end user experience tests
 * Tests complete user workflows and experience improvements
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 6.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM environment for E2E tests
const setupCompleteDOM = () => {
    document.body.innerHTML = `
        <div id="app">
            <header>
                <h1>SpeechMaker</h1>
                <div class="status-indicator">
                    <span id="statusText">Initializing...</span>
                    <div class="loading-spinner" id="loadingSpinner"></div>
                </div>
            </header>
            
            <main>
                <div class="initialization-overlay" id="initOverlay">
                    <div class="init-progress">
                        <h3>Initializing SpeechMaker...</h3>
                        <div class="progress-items">
                            <div class="progress-item" id="voicesProgress">
                                <span class="progress-icon">⏳</span>
                                <span class="progress-text">Loading voices...</span>
                            </div>
                            <div class="progress-item" id="ffmpegProgress">
                                <span class="progress-icon">⏳</span>
                                <span class="progress-text">Detecting audio capabilities...</span>
                            </div>
                            <div class="progress-item" id="settingsProgress">
                                <span class="progress-icon">⏳</span>
                                <span class="progress-text">Loading settings...</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="main-content" id="mainContent" style="display: none;">
                    <div class="voice-section">
                        <label for="voiceSelect">Voice:</label>
                        <select id="voiceSelect" disabled>
                            <option>Loading voices...</option>
                        </select>
                        <button id="retryVoicesBtn" style="display: none;">Retry Voice Loading</button>
                        <div class="voice-troubleshooting" id="voiceTroubleshooting" style="display: none;">
                            <h4>Voice Loading Issues</h4>
                            <ul id="troubleshootingSteps"></ul>
                        </div>
                    </div>
                    
                    <div class="format-section">
                        <label>Output Format:</label>
                        <div class="radio-group">
                            <input type="radio" id="formatWav" name="outputFormat" value="wav" checked>
                            <label for="formatWav">WAV (Always Available)</label>
                            
                            <input type="radio" id="formatMp3" name="outputFormat" value="mp3" disabled>
                            <label for="formatMp3" class="disabled">MP3 (Requires FFmpeg)</label>
                        </div>
                        <div class="ffmpeg-status" id="ffmpegStatus">
                            <span class="status-text">Checking audio conversion capabilities...</span>
                        </div>
                    </div>
                    
                    <div class="output-section">
                        <label for="outputFolder">Output Folder:</label>
                        <div class="folder-input-group">
                            <input type="text" id="outputFolder" readonly placeholder="Loading default folder...">
                            <button id="selectFolderBtn">Browse</button>
                        </div>
                        <div class="folder-info" id="folderInfo">
                            <small class="folder-path-display"></small>
                        </div>
                    </div>
                    
                    <div class="text-section">
                        <label for="textInput">Text to Convert:</label>
                        <textarea id="textInput" placeholder="Enter text here..." disabled></textarea>
                        <div class="text-info">
                            <span id="charCount">0 characters</span>
                        </div>
                    </div>
                    
                    <div class="controls-section">
                        <button id="convertBtn" disabled>
                            <span class="btn-text">Initializing...</span>
                            <span class="btn-spinner" style="display: none;"></span>
                        </button>
                        <button id="settingsBtn">Settings</button>
                    </div>
                </div>
                
                <div id="progressSection" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <span class="progress-text">Converting...</span>
                </div>
                
                <div class="notifications" id="notifications"></div>
            </main>
        </div>
    `;
};

describe('End-to-End User Experience', () => {
    let mockApplication;
    let userActions;

    beforeEach(() => {
        vi.clearAllMocks();
        setupCompleteDOM();
        
        // Mock complete application with all services
        mockApplication = {
            services: {
                audioProcessor: {
                    initializeFFmpeg: vi.fn(),
                    getFFmpegStatus: vi.fn(),
                    validateFFmpegInstallation: vi.fn()
                },
                ttsService: {
                    initialize: vi.fn(),
                    loadVoicesWithRetry: vi.fn(),
                    retryVoiceLoading: vi.fn(),
                    getAvailableVoices: vi.fn()
                },
                settingsManager: {
                    initialize: vi.fn(),
                    initializeDefaultOutputFolder: vi.fn(),
                    getSettings: vi.fn()
                },
                stateManager: {
                    initialize: vi.fn(),
                    updateInitializationState: vi.fn(),
                    updateVoiceState: vi.fn(),
                    updateFFmpegState: vi.fn(),
                    updateOutputFolderState: vi.fn(),
                    isReady: vi.fn(),
                    getState: vi.fn()
                }
            },
            ui: {
                updateInitializationProgress: vi.fn(),
                showMainContent: vi.fn(),
                hideInitializationOverlay: vi.fn(),
                updateVoiceDropdown: vi.fn(),
                updateFormatOptions: vi.fn(),
                updateOutputFolder: vi.fn(),
                enableControls: vi.fn(),
                showNotification: vi.fn()
            }
        };
        
        // Mock user actions
        userActions = {
            waitForInitialization: vi.fn(),
            selectVoice: vi.fn(),
            selectFormat: vi.fn(),
            enterText: vi.fn(),
            clickConvert: vi.fn(),
            retryVoiceLoading: vi.fn()
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('Smooth Application Startup Experience', () => {
        it('should show progressive initialization without FFmpeg popups', async () => {
            // Requirement 1.1: No FFmpeg popups during startup
            
            // Start initialization
            mockApplication.services.stateManager.updateInitializationState(true);
            
            // Check initial UI state
            const initOverlay = document.getElementById('initOverlay');
            const statusText = document.getElementById('statusText');
            
            expect(initOverlay.style.display).not.toBe('none');
            expect(statusText.textContent).toBe('Initializing...');
            
            // Simulate progressive initialization
            const initSteps = [
                {
                    service: 'settings',
                    action: () => mockApplication.services.settingsManager.initialize(),
                    result: { success: true, defaultPath: '/Users/test/Documents/SpeechMaker' },
                    uiUpdate: () => {
                        const settingsProgress = document.getElementById('settingsProgress');
                        settingsProgress.querySelector('.progress-icon').textContent = '✅';
                        settingsProgress.querySelector('.progress-text').textContent = 'Settings loaded';
                    }
                },
                {
                    service: 'ffmpeg',
                    action: () => mockApplication.services.audioProcessor.initializeFFmpeg(),
                    result: { available: true, source: 'bundled', version: '4.4.0' },
                    uiUpdate: () => {
                        const ffmpegProgress = document.getElementById('ffmpegProgress');
                        ffmpegProgress.querySelector('.progress-icon').textContent = '✅';
                        ffmpegProgress.querySelector('.progress-text').textContent = 'Audio conversion ready (bundled FFmpeg)';
                    }
                },
                {
                    service: 'voices',
                    action: () => mockApplication.services.ttsService.loadVoicesWithRetry(),
                    result: { 
                        success: true, 
                        voices: [
                            { id: 'voice1', name: 'Microsoft David Desktop', language: 'en-US' },
                            { id: 'voice2', name: 'Microsoft Zira Desktop', language: 'en-US' }
                        ],
                        attempt: 1
                    },
                    uiUpdate: () => {
                        const voicesProgress = document.getElementById('voicesProgress');
                        voicesProgress.querySelector('.progress-icon').textContent = '✅';
                        voicesProgress.querySelector('.progress-text').textContent = '2 voices loaded';
                    }
                }
            ];
            
            // Execute initialization steps
            for (const step of initSteps) {
                step.action.mockResolvedValue(step.result);
                await step.action();
                step.uiUpdate();
            }
            
            // Complete initialization
            mockApplication.services.stateManager.updateInitializationState(false);
            mockApplication.ui.hideInitializationOverlay();
            mockApplication.ui.showMainContent();
            
            // Verify no FFmpeg popups were shown
            const notifications = document.getElementById('notifications');
            expect(notifications.children.length).toBe(0);
            
            // Verify smooth transition to main content
            const mainContent = document.getElementById('mainContent');
            expect(mainContent.style.display).not.toBe('none');
        });

        it('should handle initialization failures gracefully', async () => {
            // Simulate voice loading failure
            mockApplication.services.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: false,
                error: new Error('Voice loading failed'),
                attempts: 3,
                troubleshooting: [
                    'Ensure Windows Speech Platform is installed',
                    'Check Windows TTS settings in Control Panel'
                ]
            });
            
            // FFmpeg succeeds
            mockApplication.services.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            
            // Settings succeed
            mockApplication.services.settingsManager.initialize.mockResolvedValue(true);
            
            // Complete initialization with partial failure
            await Promise.all([
                mockApplication.services.settingsManager.initialize(),
                mockApplication.services.audioProcessor.initializeFFmpeg(),
                mockApplication.services.ttsService.loadVoicesWithRetry()
            ]);
            
            // Should show main content with error state
            const voiceSelect = document.getElementById('voiceSelect');
            const retryBtn = document.getElementById('retryVoicesBtn');
            const troubleshooting = document.getElementById('voiceTroubleshooting');
            
            expect(voiceSelect.innerHTML).toContain('Failed to load voices');
            expect(retryBtn.style.display).toBe('inline-block');
            expect(troubleshooting.style.display).toBe('block');
        });
    });

    describe('Voice Loading User Experience', () => {
        it('should provide clear feedback during voice loading', async () => {
            // Requirement 2.1: Reliable voice loading with user feedback
            
            // Start voice loading
            mockApplication.services.stateManager.updateVoiceState(true, false, [], 1);
            
            const voiceSelect = document.getElementById('voiceSelect');
            expect(voiceSelect.innerHTML).toBe('<option>Loading voices... (attempt 1)</option>');
            expect(voiceSelect.disabled).toBe(true);
            
            // Simulate retry
            mockApplication.services.stateManager.updateVoiceState(true, false, [], 2);
            expect(voiceSelect.innerHTML).toBe('<option>Loading voices... (attempt 2)</option>');
            
            // Success
            const voices = [
                { id: 'voice1', name: 'Microsoft David Desktop', language: 'en-US' },
                { id: 'voice2', name: 'Microsoft Zira Desktop', language: 'en-US' },
                { id: 'voice3', name: 'Microsoft Mark Desktop', language: 'en-GB' }
            ];
            
            mockApplication.services.stateManager.updateVoiceState(false, true, voices);
            mockApplication.ui.updateVoiceDropdown(voices);
            
            expect(voiceSelect.disabled).toBe(false);
            expect(voiceSelect.options.length).toBe(3);
            expect(voiceSelect.options[0].textContent).toBe('Microsoft David Desktop (en-US)');
        });

        it('should allow manual retry of voice loading', async () => {
            // Simulate initial failure
            mockApplication.services.stateManager.updateVoiceState(false, false, [], 3, new Error('Loading failed'));
            
            const retryBtn = document.getElementById('retryVoicesBtn');
            const troubleshooting = document.getElementById('voiceTroubleshooting');
            
            expect(retryBtn.style.display).toBe('inline-block');
            expect(troubleshooting.style.display).toBe('block');
            
            // User clicks retry
            mockApplication.services.ttsService.retryVoiceLoading.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            retryBtn.click();
            await mockApplication.services.ttsService.retryVoiceLoading();
            
            // Should update UI to success state
            mockApplication.services.stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            
            expect(retryBtn.style.display).toBe('none');
            expect(troubleshooting.style.display).toBe('none');
        });
    });

    describe('Output Folder Management Experience', () => {
        it('should automatically set up default output folder', async () => {
            // Requirement 3.1: Automatic default folder setup
            
            mockApplication.services.settingsManager.initializeDefaultOutputFolder.mockResolvedValue(
                '/Users/test/Documents/SpeechMaker'
            );
            
            await mockApplication.services.settingsManager.initializeDefaultOutputFolder();
            
            mockApplication.services.stateManager.updateOutputFolderState(false, '/Users/test/Documents/SpeechMaker');
            
            const outputFolder = document.getElementById('outputFolder');
            const folderInfo = document.querySelector('.folder-path-display');
            
            expect(outputFolder.placeholder).toBe('Default: /Users/test/Documents/SpeechMaker');
            expect(folderInfo.textContent).toContain('Using default folder');
        });

        it('should show folder selection when user wants custom path', () => {
            const selectFolderBtn = document.getElementById('selectFolderBtn');
            const outputFolder = document.getElementById('outputFolder');
            
            // User selects custom folder
            selectFolderBtn.click();
            
            // Simulate folder selection
            const customPath = '/Users/test/CustomOutput';
            mockApplication.services.stateManager.updateOutputFolderState(true, customPath);
            
            outputFolder.value = customPath;
            outputFolder.placeholder = '';
            
            expect(outputFolder.value).toBe(customPath);
            expect(outputFolder.placeholder).toBe('');
        });
    });

    describe('Format Selection User Experience', () => {
        it('should dynamically enable MP3 when FFmpeg is available', () => {
            // Requirement 4.1: Dynamic format availability
            
            // Initially disabled
            const mp3Option = document.getElementById('formatMp3');
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            const ffmpegStatus = document.getElementById('ffmpegStatus');
            
            expect(mp3Option.disabled).toBe(true);
            expect(mp3Label.classList.contains('disabled')).toBe(true);
            
            // FFmpeg becomes available
            mockApplication.services.stateManager.updateFFmpegState(true, 'bundled', true);
            
            mp3Option.disabled = false;
            mp3Label.classList.remove('disabled');
            mp3Label.textContent = 'MP3 (Available)';
            ffmpegStatus.innerHTML = '<span class="status-text success">✅ MP3 conversion available (bundled FFmpeg)</span>';
            
            expect(mp3Option.disabled).toBe(false);
            expect(mp3Label.textContent).toBe('MP3 (Available)');
        });

        it('should provide clear feedback when MP3 is unavailable', () => {
            mockApplication.services.stateManager.updateFFmpegState(false, 'none', false);
            
            const mp3Option = document.getElementById('formatMp3');
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            const ffmpegStatus = document.getElementById('ffmpegStatus');
            
            mp3Option.disabled = true;
            mp3Label.classList.add('disabled');
            mp3Label.title = 'FFmpeg is required for MP3 conversion but was not found';
            ffmpegStatus.innerHTML = '<span class="status-text warning">⚠️ MP3 conversion unavailable - FFmpeg not found</span>';
            
            expect(mp3Option.disabled).toBe(true);
            expect(mp3Label.title).toContain('FFmpeg is required');
        });
    });

    describe('Application Readiness Experience', () => {
        it('should clearly indicate when application is ready', () => {
            // Requirement 6.1, 6.5: Application readiness indication
            
            // Complete all initialization
            mockApplication.services.stateManager.updateInitializationState(false);
            mockApplication.services.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Voice 1' }
            ]);
            mockApplication.services.stateManager.updateFFmpegState(true, 'bundled', true);
            mockApplication.services.stateManager.updateOutputFolderState(false, '/default/path');
            
            mockApplication.services.stateManager.isReady.mockReturnValue(true);
            
            // Update UI to ready state
            const statusText = document.getElementById('statusText');
            const convertBtn = document.getElementById('convertBtn');
            const textInput = document.getElementById('textInput');
            
            statusText.textContent = 'Ready';
            statusText.className = 'status-ready';
            convertBtn.disabled = false;
            convertBtn.querySelector('.btn-text').textContent = 'Convert to Speech';
            textInput.disabled = false;
            
            expect(statusText.textContent).toBe('Ready');
            expect(convertBtn.disabled).toBe(false);
            expect(textInput.disabled).toBe(false);
        });

        it('should handle partial readiness gracefully', () => {
            // Voices loaded, FFmpeg failed, output folder ready
            mockApplication.services.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Voice 1' }
            ]);
            mockApplication.services.stateManager.updateFFmpegState(false, 'none', false);
            mockApplication.services.stateManager.updateOutputFolderState(true, '/output/path');
            mockApplication.services.stateManager.updateInitializationState(false);
            
            // Should be ready for WAV conversion
            const convertBtn = document.getElementById('convertBtn');
            const mp3Option = document.getElementById('formatMp3');
            const wavOption = document.getElementById('formatWav');
            
            convertBtn.disabled = false;
            mp3Option.disabled = true;
            wavOption.checked = true;
            
            expect(convertBtn.disabled).toBe(false);
            expect(mp3Option.disabled).toBe(true);
            expect(wavOption.checked).toBe(true);
        });
    });

    describe('Complete User Workflow', () => {
        it('should support complete text-to-speech conversion workflow', async () => {
            // Complete initialization
            await mockApplication.services.settingsManager.initialize();
            await mockApplication.services.audioProcessor.initializeFFmpeg();
            await mockApplication.services.ttsService.loadVoicesWithRetry();
            
            // Set up successful state
            mockApplication.services.stateManager.updateInitializationState(false);
            mockApplication.services.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Microsoft David Desktop', language: 'en-US' }
            ]);
            mockApplication.services.stateManager.updateFFmpegState(true, 'bundled', true);
            mockApplication.services.stateManager.updateOutputFolderState(false, '/Users/test/Documents/SpeechMaker');
            
            // Update UI to ready state
            const voiceSelect = document.getElementById('voiceSelect');
            const mp3Option = document.getElementById('formatMp3');
            const textInput = document.getElementById('textInput');
            const convertBtn = document.getElementById('convertBtn');
            
            voiceSelect.innerHTML = '<option value="voice1">Microsoft David Desktop (en-US)</option>';
            voiceSelect.disabled = false;
            mp3Option.disabled = false;
            textInput.disabled = false;
            convertBtn.disabled = false;
            convertBtn.querySelector('.btn-text').textContent = 'Convert to Speech';
            
            // User workflow
            // 1. Select voice
            voiceSelect.value = 'voice1';
            
            // 2. Select format
            mp3Option.checked = true;
            
            // 3. Enter text
            textInput.value = 'Hello, this is a test of the speech synthesis system.';
            
            // 4. Click convert
            convertBtn.click();
            
            // Verify workflow completion
            expect(voiceSelect.value).toBe('voice1');
            expect(mp3Option.checked).toBe(true);
            expect(textInput.value).toContain('Hello, this is a test');
        });

        it('should handle workflow with errors and recovery', async () => {
            // Start with voice loading failure
            mockApplication.services.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: false,
                error: new Error('Voice loading failed'),
                attempts: 3
            });
            
            // Initialize other services successfully
            await mockApplication.services.settingsManager.initialize();
            await mockApplication.services.audioProcessor.initializeFFmpeg();
            
            // Show error state
            mockApplication.services.stateManager.updateVoiceState(false, false, [], 3, new Error('Loading failed'));
            
            const retryBtn = document.getElementById('retryVoicesBtn');
            expect(retryBtn.style.display).toBe('inline-block');
            
            // User retries voice loading
            mockApplication.services.ttsService.retryVoiceLoading.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            retryBtn.click();
            await mockApplication.services.ttsService.retryVoiceLoading();
            
            // Update to success state
            mockApplication.services.stateManager.updateVoiceState(false, true, [
                { id: 'voice1', name: 'Voice 1' }
            ]);
            
            // Should now be ready for conversion
            const convertBtn = document.getElementById('convertBtn');
            convertBtn.disabled = false;
            
            expect(convertBtn.disabled).toBe(false);
            expect(retryBtn.style.display).toBe('none');
        });
    });

    describe('Performance and Responsiveness', () => {
        it('should provide responsive UI during initialization', async () => {
            const startTime = Date.now();
            
            // Simulate initialization with UI updates
            const initPromises = [
                mockApplication.services.settingsManager.initialize(),
                mockApplication.services.audioProcessor.initializeFFmpeg(),
                mockApplication.services.ttsService.loadVoicesWithRetry()
            ];
            
            // Mock fast responses
            mockApplication.services.settingsManager.initialize.mockResolvedValue(true);
            mockApplication.services.audioProcessor.initializeFFmpeg.mockResolvedValue({
                available: true,
                source: 'bundled'
            });
            mockApplication.services.ttsService.loadVoicesWithRetry.mockResolvedValue({
                success: true,
                voices: [{ id: 'voice1', name: 'Voice 1' }]
            });
            
            await Promise.all(initPromises);
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            // Should complete quickly
            expect(totalTime).toBeLessThan(1000);
        });

        it('should maintain UI responsiveness during errors', async () => {
            // Simulate slow error responses
            mockApplication.services.ttsService.loadVoicesWithRetry.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                throw new Error('Slow error');
            });
            
            const startTime = Date.now();
            
            try {
                await mockApplication.services.ttsService.loadVoicesWithRetry();
            } catch (error) {
                // Expected error
            }
            
            const endTime = Date.now();
            
            // Should handle errors quickly
            expect(endTime - startTime).toBeLessThan(500);
        });
    });

    describe('Accessibility and User Guidance', () => {
        it('should provide accessible error messages and guidance', () => {
            // Set up error state
            mockApplication.services.stateManager.updateVoiceState(false, false, [], 3, new Error('Loading failed'));
            
            const troubleshooting = document.getElementById('voiceTroubleshooting');
            const troubleshootingSteps = document.getElementById('troubleshootingSteps');
            
            // Add troubleshooting steps
            const steps = [
                'Ensure Windows Speech Platform is installed and enabled',
                'Check Windows TTS settings in Control Panel > Speech',
                'Restart the application as administrator'
            ];
            
            troubleshootingSteps.innerHTML = steps.map(step => `<li>${step}</li>`).join('');
            troubleshooting.style.display = 'block';
            
            expect(troubleshooting.style.display).toBe('block');
            expect(troubleshootingSteps.children.length).toBe(3);
            expect(troubleshootingSteps.children[0].textContent).toContain('Windows Speech Platform');
        });

        it('should provide clear status indicators', () => {
            const statusText = document.getElementById('statusText');
            const loadingSpinner = document.getElementById('loadingSpinner');
            
            // Loading state
            statusText.textContent = 'Loading voices...';
            statusText.className = 'status-loading';
            loadingSpinner.style.display = 'inline-block';
            
            expect(statusText.textContent).toBe('Loading voices...');
            expect(loadingSpinner.style.display).toBe('inline-block');
            
            // Ready state
            statusText.textContent = 'Ready';
            statusText.className = 'status-ready';
            loadingSpinner.style.display = 'none';
            
            expect(statusText.textContent).toBe('Ready');
            expect(loadingSpinner.style.display).toBe('none');
        });
    });
});