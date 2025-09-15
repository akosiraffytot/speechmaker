/**
 * Integration tests for UI state management and user experience flows
 * Tests state coordination, visual feedback, and user interactions
 * 
 * Requirements: 4.4, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Setup DOM environment for UI tests
const setupDOM = () => {
    document.body.innerHTML = `
        <div id="app">
            <header>
                <h1>SpeechMaker</h1>
                <div class="status-indicator">
                    <span id="statusText">Initializing...</span>
                </div>
            </header>
            
            <main>
                <div class="voice-section">
                    <label for="voiceSelect">Voice:</label>
                    <select id="voiceSelect">
                        <option>Loading voices...</option>
                    </select>
                    <button id="retryVoicesBtn" style="display: none;">Retry</button>
                </div>
                
                <div class="format-section">
                    <div class="radio-group">
                        <input type="radio" id="formatWav" name="outputFormat" value="wav" checked>
                        <label for="formatWav">WAV</label>
                        
                        <input type="radio" id="formatMp3" name="outputFormat" value="mp3">
                        <label for="formatMp3">MP3</label>
                    </div>
                </div>
                
                <div class="output-section">
                    <label for="outputFolder">Output Folder:</label>
                    <input type="text" id="outputFolder" readonly placeholder="Select output folder...">
                    <button id="selectFolderBtn">Browse</button>
                </div>
                
                <div class="text-section">
                    <label for="textInput">Text to Convert:</label>
                    <textarea id="textInput" placeholder="Enter text here..."></textarea>
                </div>
                
                <div class="controls-section">
                    <button id="convertBtn" disabled>Convert to Speech</button>
                    <button id="settingsBtn">Settings</button>
                </div>
                
                <div id="progressSection" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <span class="progress-text">Converting...</span>
                </div>
            </main>
        </div>
    `;
};

describe('UI State Management Integration', () => {
    let StateManager;
    let stateManager;

    beforeEach(async () => {
        vi.clearAllMocks();
        setupDOM();
        
        // Import StateManager after DOM is set up
        const module = await import('../src/renderer/components/StateManager.js');
        StateManager = module.default || module.StateManager;
        stateManager = new StateManager();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('Application Initialization Flow', () => {
        it('should show initialization state correctly', () => {
            stateManager.updateInitializationState(true);
            
            const statusText = document.getElementById('statusText');
            const convertBtn = document.getElementById('convertBtn');
            
            expect(statusText.textContent).toContain('Initializing');
            expect(convertBtn.disabled).toBe(true);
            expect(convertBtn.innerHTML).toContain('Loading...');
        });

        it('should transition from initialization to ready state', () => {
            // Start with initialization
            stateManager.updateInitializationState(true);
            
            // Complete voice loading
            const mockVoices = [
                { id: 'voice1', name: 'Voice 1', language: 'en-US' },
                { id: 'voice2', name: 'Voice 2', language: 'en-GB' }
            ];
            stateManager.updateVoiceState(false, true, mockVoices);
            
            // Complete FFmpeg detection
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            // Set output folder
            stateManager.updateOutputFolderState(true, '/test/output');
            
            // Complete initialization
            stateManager.updateInitializationState(false);
            
            const statusText = document.getElementById('statusText');
            const convertBtn = document.getElementById('convertBtn');
            
            expect(statusText.textContent).toBe('Ready');
            expect(convertBtn.disabled).toBe(false);
            expect(convertBtn.textContent).toBe('Convert to Speech');
        });

        it('should show progressive initialization status', () => {
            stateManager.updateInitializationState(true);
            
            // Voice loading starts
            stateManager.updateVoiceState(true, false, [], 1);
            
            let statusText = document.getElementById('statusText');
            expect(statusText.textContent).toContain('Loading voices');
            
            // Voice loading completes
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            
            // FFmpeg detection
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            // Output folder ready
            stateManager.updateOutputFolderState(false, '/default/path');
            
            statusText = document.getElementById('statusText');
            expect(statusText.classList.contains('loading')).toBe(false);
        });
    });

    describe('Voice Loading State Management', () => {
        it('should show voice loading progress', () => {
            stateManager.updateVoiceState(true, false, [], 1);
            
            const voiceSelect = document.getElementById('voiceSelect');
            
            expect(voiceSelect.innerHTML).toBe('<option>Loading voices... (attempt 1)</option>');
            expect(voiceSelect.disabled).toBe(true);
            expect(voiceSelect.classList.contains('loading')).toBe(true);
        });

        it('should populate voice dropdown when loading succeeds', () => {
            const mockVoices = [
                { id: 'voice1', name: 'Microsoft David Desktop', language: 'en-US' },
                { id: 'voice2', name: 'Microsoft Zira Desktop', language: 'en-US' },
                { id: 'voice3', name: 'Microsoft Mark Desktop', language: 'en-GB' }
            ];
            
            stateManager.updateVoiceState(false, true, mockVoices);
            
            const voiceSelect = document.getElementById('voiceSelect');
            
            expect(voiceSelect.disabled).toBe(false);
            expect(voiceSelect.classList.contains('loading')).toBe(false);
            expect(voiceSelect.options.length).toBe(3);
            expect(voiceSelect.options[0].textContent).toBe('Microsoft David Desktop (en-US)');
            expect(voiceSelect.options[1].textContent).toBe('Microsoft Zira Desktop (en-US)');
            expect(voiceSelect.options[2].textContent).toBe('Microsoft Mark Desktop (en-GB)');
        });

        it('should show retry button after voice loading failure', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 2, error);
            
            const voiceSelect = document.getElementById('voiceSelect');
            const retryBtn = document.getElementById('retryVoicesBtn');
            
            expect(voiceSelect.innerHTML).toBe('<option>Failed to load voices (2 attempts)</option>');
            expect(voiceSelect.disabled).toBe(true);
            expect(voiceSelect.classList.contains('error')).toBe(true);
            expect(retryBtn.style.display).toBe('inline-block');
        });

        it('should show troubleshooting after multiple failures', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 3, error);
            
            const voiceContainer = document.getElementById('voiceSelect').parentElement;
            
            // Check if troubleshooting section is created
            setTimeout(() => {
                const troubleshooting = voiceContainer.querySelector('.voice-troubleshooting');
                expect(troubleshooting).toBeTruthy();
                expect(troubleshooting.style.display).toBe('block');
                expect(troubleshooting.innerHTML).toContain('Voice Loading Issues');
            }, 0);
        });

        it('should handle retry button interaction', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 2, error);
            
            const retryBtn = document.getElementById('retryVoicesBtn');
            const mockRetryCallback = vi.fn();
            
            // Simulate retry button click
            stateManager.addEventListener('action', mockRetryCallback);
            retryBtn.click();
            
            expect(mockRetryCallback).toHaveBeenCalledWith('retryVoiceLoading', expect.any(Object));
        });
    });

    describe('FFmpeg State Management', () => {
        it('should enable MP3 option when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const mp3Option = document.getElementById('formatMp3');
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            
            expect(mp3Option.disabled).toBe(false);
            expect(mp3Label.classList.contains('disabled')).toBe(false);
            expect(mp3Label.title).toContain('MP3 format available (using bundled FFmpeg)');
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
            expect(mp3Label.title).toContain('MP3 format unavailable - FFmpeg not found');
        });

        it('should show FFmpeg status indicator', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const formatContainer = document.querySelector('.radio-group');
            
            // Trigger UI update to create indicator
            stateManager.updateUI();
            
            setTimeout(() => {
                const statusIndicator = formatContainer.querySelector('.ffmpeg-status-indicator');
                expect(statusIndicator).toBeTruthy();
                expect(statusIndicator.innerHTML).toContain('FFmpeg is required for MP3 conversion');
                expect(statusIndicator.classList.contains('warning')).toBe(true);
            }, 0);
        });

        it('should update MP3 availability dynamically', () => {
            // Start with MP3 disabled
            stateManager.updateFFmpegState(false, 'none', false);
            
            const mp3Option = document.getElementById('formatMp3');
            expect(mp3Option.disabled).toBe(true);
            
            // FFmpeg becomes available
            stateManager.updateFFmpegState(true, 'system', true);
            
            expect(mp3Option.disabled).toBe(false);
            
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            expect(mp3Label.title).toContain('MP3 format available (using system FFmpeg)');
        });
    });

    describe('Output Folder State Management', () => {
        it('should show default output folder placeholder', () => {
            stateManager.updateOutputFolderState(false, '/default/path');
            
            const outputFolder = document.getElementById('outputFolder');
            
            expect(outputFolder.placeholder).toBe('Default: /default/path');
            expect(outputFolder.value).toBe('');
        });

        it('should show selected output folder', () => {
            stateManager.updateOutputFolderState(true, '/selected/path');
            
            const outputFolder = document.getElementById('outputFolder');
            
            expect(outputFolder.value).toBe('/selected/path');
            expect(outputFolder.placeholder).toBe('');
        });

        it('should handle missing default folder gracefully', () => {
            stateManager.updateOutputFolderState(false, null);
            
            const outputFolder = document.getElementById('outputFolder');
            
            expect(outputFolder.placeholder).toBe('Select output folder...');
        });
    });

    describe('Application Readiness Management', () => {
        it('should determine readiness based on all conditions', () => {
            // Not ready initially
            expect(stateManager.isReady()).toBe(false);
            
            // Add voices
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            expect(stateManager.isReady()).toBe(false); // Still need output folder
            
            // Add output folder
            stateManager.updateOutputFolderState(true, '/output/path');
            expect(stateManager.isReady()).toBe(false); // Still initializing
            
            // Complete initialization
            stateManager.updateInitializationState(false);
            expect(stateManager.isReady()).toBe(true);
        });

        it('should be ready with default output folder', () => {
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateOutputFolderState(false, '/default/path');
            
            expect(stateManager.isReady()).toBe(true);
        });

        it('should show ready indicator when ready', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            setTimeout(() => {
                const readyIndicator = document.querySelector('.ready-indicator');
                expect(readyIndicator).toBeTruthy();
                expect(readyIndicator.style.display).toBe('flex');
                expect(readyIndicator.classList.contains('show')).toBe(true);
            }, 0);
        });

        it('should enable convert button when ready', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const convertBtn = document.getElementById('convertBtn');
            
            expect(convertBtn.disabled).toBe(false);
            expect(convertBtn.textContent).toBe('Convert to Speech');
        });
    });

    describe('User Interaction Flows', () => {
        it('should handle format selection changes', () => {
            // Enable MP3
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const mp3Option = document.getElementById('formatMp3');
            const wavOption = document.getElementById('formatWav');
            
            // User selects MP3
            mp3Option.checked = true;
            wavOption.checked = false;
            mp3Option.dispatchEvent(new Event('change'));
            
            expect(mp3Option.checked).toBe(true);
            expect(wavOption.checked).toBe(false);
        });

        it('should prevent MP3 selection when FFmpeg unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const mp3Option = document.getElementById('formatMp3');
            const wavOption = document.getElementById('formatWav');
            
            // Attempt to select MP3 (should be prevented by disabled state)
            expect(mp3Option.disabled).toBe(true);
            expect(wavOption.checked).toBe(true);
        });

        it('should handle voice selection changes', () => {
            const mockVoices = [
                { id: 'voice1', name: 'Voice 1', language: 'en-US' },
                { id: 'voice2', name: 'Voice 2', language: 'en-GB' }
            ];
            
            stateManager.updateVoiceState(false, true, mockVoices);
            
            const voiceSelect = document.getElementById('voiceSelect');
            
            // User selects different voice
            voiceSelect.value = 'voice2';
            voiceSelect.dispatchEvent(new Event('change'));
            
            expect(voiceSelect.value).toBe('voice2');
        });

        it('should handle text input validation', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const textInput = document.getElementById('textInput');
            const convertBtn = document.getElementById('convertBtn');
            
            // Empty text should keep button enabled (validation happens on click)
            textInput.value = '';
            expect(convertBtn.disabled).toBe(false);
            
            // Text input should work normally
            textInput.value = 'Hello, world!';
            expect(textInput.value).toBe('Hello, world!');
        });
    });

    describe('Error State Handling', () => {
        it('should show error states clearly', () => {
            const error = new Error('Critical error');
            stateManager.updateVoiceState(false, false, [], 3, error);
            
            const voiceSelect = document.getElementById('voiceSelect');
            const statusText = document.getElementById('statusText');
            
            expect(voiceSelect.classList.contains('error')).toBe(true);
            expect(statusText.classList.contains('error')).toBe(true);
        });

        it('should provide recovery options', () => {
            const error = new Error('Voice loading failed');
            stateManager.updateVoiceState(false, false, [], 2, error);
            
            const retryBtn = document.getElementById('retryVoicesBtn');
            
            expect(retryBtn.style.display).toBe('inline-block');
            expect(retryBtn.textContent).toContain('Retry');
        });

        it('should handle partial functionality gracefully', () => {
            // Voices loaded but FFmpeg failed
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateFFmpegState(false, 'none', false);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const convertBtn = document.getElementById('convertBtn');
            const mp3Option = document.getElementById('formatMp3');
            const wavOption = document.getElementById('formatWav');
            
            // Should still be able to convert to WAV
            expect(convertBtn.disabled).toBe(false);
            expect(mp3Option.disabled).toBe(true);
            expect(wavOption.disabled).toBe(false);
        });
    });

    describe('Accessibility and Usability', () => {
        it('should provide appropriate ARIA labels and states', () => {
            stateManager.updateVoiceState(true, false, [], 1);
            
            const voiceSelect = document.getElementById('voiceSelect');
            
            expect(voiceSelect.getAttribute('aria-busy')).toBe('true');
            expect(voiceSelect.getAttribute('aria-label')).toContain('Loading');
        });

        it('should show loading indicators for screen readers', () => {
            stateManager.updateInitializationState(true);
            
            const statusText = document.getElementById('statusText');
            
            expect(statusText.getAttribute('aria-live')).toBe('polite');
            expect(statusText.textContent).toContain('Initializing');
        });

        it('should provide helpful tooltips and descriptions', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const mp3Label = document.querySelector('label[for="formatMp3"]');
            
            expect(mp3Label.title).toContain('FFmpeg');
            expect(mp3Label.title).toContain('required');
        });

        it('should maintain keyboard navigation', () => {
            // Make application ready
            stateManager.updateInitializationState(false);
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const voiceSelect = document.getElementById('voiceSelect');
            const convertBtn = document.getElementById('convertBtn');
            
            expect(voiceSelect.tabIndex).not.toBe(-1);
            expect(convertBtn.tabIndex).not.toBe(-1);
        });
    });

    describe('Performance and Responsiveness', () => {
        it('should update UI efficiently', () => {
            const startTime = Date.now();
            
            // Perform multiple state updates
            stateManager.updateVoiceState(true, false, [], 1);
            stateManager.updateFFmpegState(true, 'bundled', true);
            stateManager.updateOutputFolderState(true, '/output/path');
            stateManager.updateInitializationState(false);
            
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(100); // Should be very fast
        });

        it('should handle rapid state changes gracefully', () => {
            // Simulate rapid voice loading updates
            for (let i = 1; i <= 5; i++) {
                stateManager.updateVoiceState(true, false, [], i);
            }
            
            const voiceSelect = document.getElementById('voiceSelect');
            
            // Should show the latest state
            expect(voiceSelect.innerHTML).toBe('<option>Loading voices... (attempt 5)</option>');
        });

        it('should not cause memory leaks with event listeners', () => {
            const initialListeners = stateManager.listeners.size;
            
            // Add and remove listeners
            const callback = vi.fn();
            stateManager.addEventListener('voice', callback);
            stateManager.removeEventListener('voice', callback);
            
            expect(stateManager.listeners.size).toBe(initialListeners);
        });
    });

    describe('State Persistence and Recovery', () => {
        it('should maintain state consistency across updates', () => {
            // Set initial state
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const state1 = stateManager.getState();
            
            // Update other parts of state
            stateManager.updateOutputFolderState(true, '/output/path');
            
            const state2 = stateManager.getState();
            
            // Previous state should be preserved
            expect(state2.voicesLoaded).toBe(state1.voicesLoaded);
            expect(state2.ffmpegAvailable).toBe(state1.ffmpegAvailable);
            expect(state2.outputFolderSet).toBe(true);
        });

        it('should handle state reset correctly', () => {
            // Set some state
            stateManager.updateVoiceState(false, true, [{ id: 'voice1', name: 'Voice 1' }]);
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            // Reset state
            stateManager.reset();
            
            const state = stateManager.getState();
            
            expect(state.voicesLoaded).toBe(false);
            expect(state.ffmpegAvailable).toBe(false);
            expect(state.ready).toBe(false);
            expect(state.initializing).toBe(true);
        });
    });
});