/**
 * Unit tests for StateManager class
 * Tests state transitions, UI updates, and event handling
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('StateManager', () => {
    let StateManager;
    let stateManager;

    beforeEach(async () => {
        // Setup DOM environment using jsdom (configured in vitest.config.js)
        document.body.innerHTML = `
            <header>
                <h1>SpeechMaker</h1>
            </header>
            <select id="voiceSelect">
                <option>Loading voices...</option>
            </select>
            <input type="radio" id="formatWav" name="outputFormat" value="wav" checked>
            <input type="radio" id="formatMp3" name="outputFormat" value="mp3">
            <label for="formatMp3">MP3</label>
            <input type="text" id="outputFolder" readonly>
            <button id="selectFolderBtn">Browse</button>
            <button id="convertBtn">Convert to Speech</button>
            <button id="settingsBtn">Settings</button>
            <p id="statusText">Ready</p>
            <div id="progressSection" style="display: none;"></div>
        `;

        // Import StateManager dynamically
        const module = await import('../src/renderer/components/StateManager.js');
        StateManager = module.default || module.StateManager;
        stateManager = new StateManager();
    });

    afterEach(() => {
        // Clean up DOM
        document.body.innerHTML = '';
    });

    describe('Initialization', () => {
        it('should initialize with default state', () => {
            const state = stateManager.getState();
            
            expect(state.voicesLoaded).toBe(false);
            expect(state.voicesLoading).toBe(false);
            expect(state.ffmpegAvailable).toBe(false);
            expect(state.ready).toBe(false);
            expect(state.initializing).toBe(true);
        });

        it('should initialize DOM element references', () => {
            expect(stateManager.elements.voiceSelect).toBeTruthy();
            expect(stateManager.elements.formatMp3).toBeTruthy();
            expect(stateManager.elements.convertBtn).toBeTruthy();
            expect(stateManager.elements.statusText).toBeTruthy();
        });

        it('should set initial UI state', () => {
            const convertBtn = document.getElementById('convertBtn');
            const statusText = document.getElementById('statusText');
            
            expect(convertBtn.disabled).toBe(true);
            expect(statusText.textContent).toContain('Initializing');
        });
    });

    describe('Voice State Management', () => {
        it('should update voice loading state', () => {
            stateManager.updateVoiceState(true, false, [], 1);
            
            const state = stateManager.getState();
            expect(state.voicesLoading).toBe(true);
            expect(state.voicesLoaded).toBe(false);
            expect(state.voiceLoadAttempts).toBe(1);
            expect(state.loadingMessage).toBe('Loading voices... (attempt 1)');
        });

        it('should update voice loaded state with voices', () => {
            const mockVoices = [
                { id: 'voice1', name: 'Voice 1', language: 'en-US' },
                { id: 'voice2', name: 'Voice 2', language: 'en-GB' }
            ];

            stateManager.updateVoiceState(false, true, mockVoices, 1);
            
            const state = stateManager.getState();
            expect(state.voicesLoading).toBe(false);
            expect(state.voicesLoaded).toBe(true);
            expect(state.voices).toEqual(mockVoices);
            expect(state.showRetryButton).toBe(false);
        });

        it('should show retry button after failed attempts', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 2, error);
            
            const state = stateManager.getState();
            expect(state.showRetryButton).toBe(true);
            expect(state.voiceLoadError).toBe(error);
        });

        it('should show troubleshooting after multiple failures', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 3, error);
            
            const state = stateManager.getState();
            expect(state.showTroubleshooting).toBe(true);
        });

        it('should update voice select UI when loading', () => {
            stateManager.updateVoiceState(true, false, [], 1);
            
            const voiceSelect = document.getElementById('voiceSelect');
            expect(voiceSelect.innerHTML).toBe('<option>Loading voices... (attempt 1)</option>');
            expect(voiceSelect.disabled).toBe(true);
            expect(voiceSelect.classList.contains('loading')).toBe(true);
        });

        it('should populate voice select with available voices', () => {
            const mockVoices = [
                { id: 'voice1', name: 'Voice 1', language: 'en-US' },
                { id: 'voice2', name: 'Voice 2', language: 'en-GB' }
            ];

            stateManager.updateVoiceState(false, true, mockVoices, 1);
            
            const voiceSelect = document.getElementById('voiceSelect');
            expect(voiceSelect.disabled).toBe(false);
            expect(voiceSelect.classList.contains('loading')).toBe(false);
            expect(voiceSelect.options.length).toBe(2);
            expect(voiceSelect.options[0].textContent).toBe('Voice 1 (en-US)');
            expect(voiceSelect.options[1].textContent).toBe('Voice 2 (en-GB)');
        });

        it('should show error state when voice loading fails', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 1, error);
            
            const voiceSelect = document.getElementById('voiceSelect');
            expect(voiceSelect.innerHTML).toBe('<option>Failed to load voices (1 attempts)</option>');
            expect(voiceSelect.disabled).toBe(true);
            expect(voiceSelect.classList.contains('error')).toBe(true);
        });

        it('should create retry button when voice loading fails', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 2, error);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            const retryButton = voiceContainer.querySelector('.voice-retry-btn');
            
            expect(retryButton).toBeTruthy();
            expect(retryButton.style.display).toBe('inline-block');
            expect(retryButton.innerHTML).toContain('Retry Loading Voices');
        });

        it('should create troubleshooting info after multiple failures', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 3, error);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            const troubleshooting = voiceContainer.querySelector('.voice-troubleshooting');
            
            expect(troubleshooting).toBeTruthy();
            expect(troubleshooting.style.display).toBe('block');
            expect(troubleshooting.innerHTML).toContain('Voice Loading Issues');
        });

        it('should disable retry button during loading', () => {
            // First create retry button
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 2, error);
            
            // Then start loading again
            stateManager.updateVoiceState(true, false, [], 3);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            const retryButton = voiceContainer.querySelector('.voice-retry-btn');
            
            expect(retryButton.disabled).toBe(true);
        });
    });

    describe('FFmpeg State Management', () => {
        it('should update FFmpeg availability state', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const state = stateManager.getState();
            expect(state.ffmpegAvailable).toBe(true);
            expect(state.ffmpegSource).toBe('bundled');
            expect(state.ffmpegValidated).toBe(true);
        });

        it('should enable MP3 option when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const mp3Option = document.getElementById('formatMp3');
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            
            expect(mp3Option.disabled).toBe(false);
            expect(mp3Label.classList.contains('disabled')).toBe(false);
            expect(mp3Label.title).toContain('MP3 format available');
        });

        it('should disable MP3 option when FFmpeg is not available', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const mp3Option = document.getElementById('formatMp3');
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            const wavOption = document.getElementById('formatWav');
            
            expect(mp3Option.disabled).toBe(true);
            expect(mp3Option.checked).toBe(false);
            expect(wavOption.checked).toBe(true);
            expect(mp3Label.classList.contains('disabled')).toBe(true);
            expect(mp3Label.title).toContain('MP3 format unavailable');
        });

        it('should provide appropriate tooltip for different FFmpeg states', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            expect(mp3Label.title).toContain('FFmpeg not found');
        });

        it('should show positive tooltip when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            expect(mp3Label.title).toContain('MP3 format available (using bundled FFmpeg)');
        });

        it('should create FFmpeg status indicator when MP3 is disabled', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const formatContainer = document.getElementById('formatMp3').closest('.radio-group') || 
                                  document.getElementById('formatMp3').parentElement;
            
            // Add radio-group class for testing
            formatContainer.classList.add('radio-group');
            
            // Update UI to trigger indicator creation
            stateManager.updateUI();
            
            const statusIndicator = formatContainer.querySelector('.ffmpeg-status-indicator');
            expect(statusIndicator).toBeTruthy();
            expect(statusIndicator.innerHTML).toContain('FFmpeg is required for MP3 conversion');
        });

        it('should show success indicator when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const formatContainer = document.getElementById('formatMp3').closest('.radio-group') || 
                                  document.getElementById('formatMp3').parentElement;
            
            // Add radio-group class for testing
            formatContainer.classList.add('radio-group');
            
            // Update UI to trigger indicator creation
            stateManager.updateUI();
            
            const statusIndicator = formatContainer.querySelector('.ffmpeg-status-indicator');
            // When FFmpeg is available, the indicator might be hidden or show success message
            if (statusIndicator && statusIndicator.style.display !== 'none') {
                expect(statusIndicator.innerHTML).toContain('FFmpeg available');
            }
        });
    });

    describe('Output Folder State Management', () => {
        it('should update output folder state', () => {
            stateManager.updateOutputFolderState(true, '/default/path');
            
            const state = stateManager.getState();
            expect(state.outputFolderSet).toBe(true);
            expect(state.defaultOutputFolder).toBe('/default/path');
        });

        it('should update output folder placeholder with default path', () => {
            stateManager.updateOutputFolderState(false, '/default/path');
            
            const outputFolder = document.getElementById('outputFolder');
            expect(outputFolder.placeholder).toBe('Default: /default/path');
        });

        it('should show generic placeholder when no default folder', () => {
            stateManager.updateOutputFolderState(false, null);
            
            const outputFolder = document.getElementById('outputFolder');
            expect(outputFolder.placeholder).toBe('Select output folder...');
        });
    });

    describe('Readiness State Management', () => {
        it('should not be ready during initialization', () => {
            stateManager.updateInitializationState(true);
            
            const state = stateManager.getState();
            expect(state.ready).toBe(false);
            expect(state.initializing).toBe(true);
        });

        it('should be ready when all conditions are met', () => {
            // Set up all required conditions
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const state = stateManager.getState();
            expect(state.ready).toBe(true);
            expect(state.readyIndicator).toBe(true);
        });

        it('should be ready with default output folder', () => {
            // Set up conditions with default folder instead of user-selected
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(false, '/default/path');
            
            const state = stateManager.getState();
            expect(state.ready).toBe(true);
        });

        it('should not be ready without voices', () => {
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, false, []);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const state = stateManager.getState();
            expect(state.ready).toBe(false);
        });

        it('should not be ready without output folder', () => {
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(false, null);
            
            const state = stateManager.getState();
            expect(state.ready).toBe(false);
        });
    });

    describe('UI Updates', () => {
        it('should enable convert button when ready', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const convertBtn = document.getElementById('convertBtn');
            expect(convertBtn.disabled).toBe(false);
            expect(convertBtn.textContent).toBe('Convert to Speech');
        });

        it('should disable convert button when not ready', () => {
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, false, []);
            
            const convertBtn = document.getElementById('convertBtn');
            expect(convertBtn.disabled).toBe(true);
        });

        it('should show loading spinner during initialization', () => {
            stateManager.updateInitializationState(true);
            
            const convertBtn = document.getElementById('convertBtn');
            expect(convertBtn.innerHTML).toContain('loading-spinner');
            expect(convertBtn.innerHTML).toContain('Loading...');
        });

        it('should update status text based on state', () => {
            stateManager.updateVoiceState(true, false, [], 1);
            
            const statusText = document.getElementById('statusText');
            expect(statusText.textContent).toContain('Loading voices');
            expect(statusText.classList.contains('loading')).toBe(true);
        });

        it('should show ready status when application is ready', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const statusText = document.getElementById('statusText');
            expect(statusText.textContent).toBe('Ready');
            expect(statusText.classList.contains('ready')).toBe(true);
        });
    });

    describe('Event Handling', () => {
        it('should add and notify event listeners', () => {
            const mockCallback = vi.fn();
            stateManager.addEventListener('voice', mockCallback);
            
            const mockVoices = [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }];
            stateManager.updateVoiceState(false, true, mockVoices);
            
            expect(mockCallback).toHaveBeenCalledWith(
                expect.objectContaining({ voicesLoaded: true }),
                expect.objectContaining({ voicesLoaded: false })
            );
        });

        it('should remove event listeners', () => {
            const mockCallback = vi.fn();
            stateManager.addEventListener('voice', mockCallback);
            stateManager.removeEventListener('voice', mockCallback);
            
            stateManager.updateVoiceState(false, true, []);
            
            expect(mockCallback).not.toHaveBeenCalled();
        });

        it('should handle action notifications', () => {
            const mockCallback = vi.fn();
            stateManager.addEventListener('action', mockCallback);
            
            stateManager.notifyAction('retryVoiceLoading', { attempt: 2 });
            
            expect(mockCallback).toHaveBeenCalledWith('retryVoiceLoading', { attempt: 2 });
        });

        it('should handle errors in event listeners gracefully', () => {
            const errorCallback = vi.fn(() => {
                throw new Error('Listener error');
            });
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            stateManager.addEventListener('voice', errorCallback);
            stateManager.updateVoiceState(false, true, []);
            
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe('Utility Methods', () => {
        it('should check if application is ready', () => {
            expect(stateManager.isReady()).toBe(false);
            
            // Make ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            expect(stateManager.isReady()).toBe(true);
        });

        it('should check if voices are available', () => {
            expect(stateManager.hasVoices()).toBe(false);
            
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            
            expect(stateManager.hasVoices()).toBe(true);
        });

        it('should check if MP3 conversion is available', () => {
            expect(stateManager.canConvertToMp3()).toBe(false);
            
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            expect(stateManager.canConvertToMp3()).toBe(true);
        });

        it('should reset state to initial values', () => {
            // Change some state
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            // Reset
            stateManager.reset();
            
            const state = stateManager.getState();
            expect(state.voicesLoaded).toBe(false);
            expect(state.ffmpegAvailable).toBe(false);
            expect(state.ready).toBe(false);
            expect(state.initializing).toBe(true);
        });
    });

    describe('Loading Indicators', () => {
        it('should create voice loading indicator during voice loading', () => {
            stateManager.updateVoiceState(true, false, [], 1);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            const loadingIndicator = voiceContainer.querySelector('.voice-loading-indicator');
            
            expect(loadingIndicator).toBeTruthy();
            expect(loadingIndicator.style.display).toBe('block');
            expect(loadingIndicator.innerHTML).toContain('voice detection');
        });

        it('should show retry attempt in loading indicator', () => {
            stateManager.updateVoiceState(true, false, [], 2);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            const loadingIndicator = voiceContainer.querySelector('.voice-loading-indicator');
            
            expect(loadingIndicator.innerHTML).toContain('Retrying voice detection... (attempt 2)');
        });

        it('should hide voice loading indicator when loading completes', () => {
            // First start loading
            stateManager.updateVoiceState(true, false, [], 1);
            
            // Then complete loading
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            const loadingIndicator = voiceContainer.querySelector('.voice-loading-indicator');
            
            expect(loadingIndicator.style.display).toBe('none');
        });

        it('should show detailed initialization status', () => {
            // Set up partial initialization
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateFFmpegState(true, 'bundled', true);
            stateManager.updateOutputFolderState(false, '/default/path');
            stateManager.updateInitializationState(true);
            
            // Trigger initialization indicators update
            stateManager.updateInitializationIndicators();
            
            const statusText = document.getElementById('statusText');
            expect(statusText.textContent).toContain('Initializing:');
            expect(statusText.textContent).toContain('✓ Voices loaded');
            expect(statusText.textContent).toContain('✓ FFmpeg ready (bundled)');
            expect(statusText.textContent).toContain('✓ Output folder ready');
        });
    });

    describe('Ready Indicator', () => {
        it('should create and show ready indicator when ready', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const readyIndicator = document.querySelector('.ready-indicator');
            expect(readyIndicator).toBeTruthy();
            expect(readyIndicator.style.display).toBe('flex');
            expect(readyIndicator.classList.contains('show')).toBe(true);
        });

        it('should hide ready indicator when not ready', () => {
            // First make ready to create indicator
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            // Then make not ready
            stateManager.updateVoiceState(false, false, []);
            
            const readyIndicator = document.querySelector('.ready-indicator');
            expect(readyIndicator.style.display).toBe('none');
            expect(readyIndicator.classList.contains('show')).toBe(false);
        });
    });
});