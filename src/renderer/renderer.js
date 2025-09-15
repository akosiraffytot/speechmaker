// Import StateManager
import StateManager from './components/StateManager.js';

// DOM Elements
const textInput = document.getElementById('textInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const selectedFileName = document.getElementById('selectedFileName');
const voiceSelect = document.getElementById('voiceSelect');
const outputFolder = document.getElementById('outputFolder');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const convertBtn = document.getElementById('convertBtn');
const settingsBtn = document.getElementById('settingsBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const statusText = document.getElementById('statusText');

// Application State
let currentSettings = {
    lastSelectedVoice: '',
    defaultOutputFormat: 'wav',
    defaultOutputPath: '',
    voiceSpeed: 1.0,
    maxChunkLength: 5000
};

let currentConversionJob = null;

// Progress Manager Class
class ProgressManager {
    constructor() {
        this.isActive = false;
        this.canCancel = false;
        this.currentPhase = '';
        this.totalPhases = 0;
        this.currentPhaseProgress = 0;
        this.overallProgress = 0;
    }

    start(phases = []) {
        this.isActive = true;
        this.canCancel = true;
        this.totalPhases = phases.length;
        this.currentPhase = phases[0] || 'Starting...';
        this.currentPhaseProgress = 0;
        this.overallProgress = 0;
        this.startTime = Date.now();
        
        this.showProgressSection();
        this.updateDisplay();
        this.enableCancelButton();
        
        // Start performance monitoring
        this.startPerformanceMonitoring();
    }

    startPerformanceMonitoring() {
        this.performanceInterval = setInterval(() => {
            if (!this.isActive) {
                clearInterval(this.performanceInterval);
                return;
            }
            
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            // Update status with elapsed time for long operations
            if (elapsed > 10000) { // Show time after 10 seconds
                const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                const basePhase = this.currentPhase.split(' (')[0]; // Remove existing time info
                this.currentPhase = `${basePhase} (${timeStr})`;
                this.updateDisplay();
            }
        }, 1000);
    }

    updatePhase(phaseName, phaseProgress = 0) {
        if (!this.isActive) return;
        
        this.currentPhase = phaseName;
        this.currentPhaseProgress = Math.max(0, Math.min(100, phaseProgress));
        this.updateDisplay();
    }

    updateOverallProgress(progress) {
        if (!this.isActive) return;
        
        this.overallProgress = Math.max(0, Math.min(100, progress));
        this.updateDisplay();
    }

    complete(message = 'Conversion completed successfully!') {
        this.isActive = false;
        this.canCancel = false;
        this.overallProgress = 100;
        
        // Calculate total time and add to message
        const totalTime = Date.now() - this.startTime;
        const minutes = Math.floor(totalTime / 60000);
        const seconds = Math.floor((totalTime % 60000) / 1000);
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        
        this.currentPhase = `${message} (completed in ${timeStr})`;
        
        this.updateDisplay();
        this.disableCancelButton();
        this.showSuccessNotification(this.currentPhase);
        
        // Clear performance monitoring
        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
        }
        
        // Auto-hide after 4 seconds for better UX
        setTimeout(() => {
            this.hide();
        }, 4000);
    }

    error(errorMessage) {
        this.isActive = false;
        this.canCancel = false;
        this.currentPhase = 'Conversion failed';
        
        this.updateDisplay();
        this.disableCancelButton();
        this.showErrorNotification(errorMessage);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hide();
        }, 5000);
    }

    cancel() {
        if (!this.canCancel) return;
        
        this.isActive = false;
        this.canCancel = false;
        this.currentPhase = 'Cancelling...';
        
        this.updateDisplay();
        this.disableCancelButton();
        
        // Notify main process to cancel
        if (currentConversionJob) {
            window.electronAPI.cancelConversion(currentConversionJob.id);
        }
    }

    hide() {
        progressSection.style.display = 'none';
        statusText.textContent = 'Ready';
        convertBtn.disabled = false;
        this.reset();
    }

    reset() {
        this.isActive = false;
        this.canCancel = false;
        this.currentPhase = '';
        this.totalPhases = 0;
        this.currentPhaseProgress = 0;
        this.overallProgress = 0;
    }

    showProgressSection() {
        progressSection.style.display = 'block';
        convertBtn.disabled = true;
    }

    updateDisplay() {
        progressFill.style.width = `${this.overallProgress}%`;
        progressText.textContent = `${Math.round(this.overallProgress)}%`;
        statusText.textContent = this.currentPhase;
    }

    enableCancelButton() {
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-block';
            cancelBtn.disabled = false;
        }
    }

    disableCancelButton() {
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.disabled = true;
            setTimeout(() => {
                cancelBtn.style.display = 'none';
            }, 1000);
        }
    }

    showSuccessNotification(message) {
        this.showNotification(message, 'success');
    }

    showErrorNotification(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    }
}

// Initialize progress manager
const progressManager = new ProgressManager();

// Initialize error display
let errorDisplay;

// Initialize state manager
let stateManager;

// Initialize Application with optimized loading
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize state manager first
    stateManager = new StateManager();
    
    // Initialize error display
    errorDisplay = new ErrorDisplay();
    
    // Setup state manager event listeners
    setupStateManagerListeners();
    
    // Load components asynchronously for better performance
    try {
        // Load settings first (fastest)
        await loadSettings();
        
        // Setup event listeners early
        setupEventListeners();
        
        // Listen for service initialization (main process handles voice loading and FFmpeg detection)
        setupServiceListeners();
        
        // Initialize output folder management
        initializeOutputFolderManagement();
        
        console.log('Renderer initialization complete, waiting for main process...');
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        if (stateManager) {
            stateManager.updateInitializationState(false);
        }
        if (statusText) {
            statusText.textContent = 'Failed to initialize application';
        }
    }
});

// Setup state manager event listeners
function setupStateManagerListeners() {
    // Listen for state changes
    stateManager.addEventListener('stateChange', (event, currentState, previousState) => {
        console.log(`State changed: ${event}`, currentState);
    });
    
    // Listen for user actions
    stateManager.addEventListener('action', (action, data) => {
        if (action === 'retryVoiceLoading') {
            retryVoiceLoading();
        }
    });
    
    // Listen for format availability changes
    stateManager.addEventListener('formatAvailability', (eventData) => {
        console.log('Format availability changed:', eventData);
        
        // Update UI elements based on format availability
        updateFormatDependentUI(eventData.mp3Available);
        
        // Update settings if needed
        if (!eventData.mp3Available && currentSettings.defaultOutputFormat === 'mp3') {
            currentSettings.defaultOutputFormat = 'wav';
            saveSettings().catch(error => {
                console.error('Failed to save format change:', error);
            });
        }
    });
    
    // Listen for automatic format changes
    stateManager.addEventListener('automaticFormatChange', (eventData) => {
        console.log('Automatic format change:', eventData);
        
        // Update current settings to reflect the change
        currentSettings.defaultOutputFormat = eventData.newFormat;
        saveSettings().catch(error => {
            console.error('Failed to save automatic format change:', error);
        });
        
        // Show user feedback about the change
        showFormatChangeUserFeedback(eventData);
    });
}

// Update UI elements that depend on format availability
function updateFormatDependentUI(mp3Available) {
    // Update convert button tooltip
    const convertBtn = document.getElementById('convertBtn');
    if (convertBtn) {
        if (mp3Available) {
            convertBtn.title = 'Convert text to speech (WAV and MP3 formats available)';
        } else {
            convertBtn.title = 'Convert text to speech (WAV format only - MP3 requires FFmpeg)';
        }
    }
    
    // Update settings modal format options
    updateSettingsModalFormatOptions(mp3Available);
}

// Update format options in settings modal
function updateSettingsModalFormatOptions(mp3Available) {
    const defaultFormatMp3 = document.getElementById('defaultFormatMp3');
    const defaultFormatMp3Label = document.querySelector('label[for="defaultFormatMp3"]');
    
    if (defaultFormatMp3 && defaultFormatMp3Label) {
        defaultFormatMp3.disabled = !mp3Available;
        
        if (mp3Available) {
            defaultFormatMp3Label.classList.remove('disabled');
            defaultFormatMp3Label.title = 'MP3 format available';
        } else {
            defaultFormatMp3Label.classList.add('disabled');
            defaultFormatMp3Label.title = 'MP3 format requires FFmpeg';
            
            // Auto-select WAV if MP3 was selected
            if (defaultFormatMp3.checked) {
                defaultFormatMp3.checked = false;
                const defaultFormatWav = document.getElementById('defaultFormatWav');
                if (defaultFormatWav) {
                    defaultFormatWav.checked = true;
                }
            }
        }
    }
}

// Show user feedback about format changes
function showFormatChangeUserFeedback(eventData) {
    // This could be enhanced with more detailed user feedback
    console.log(`Format automatically changed to ${eventData.newFormat.toUpperCase()} due to ${eventData.reason}`);
}

// Show initial loading state (deprecated - now handled by StateManager)
function showLoadingState() {
    // Legacy function - StateManager handles this now
    if (stateManager) {
        stateManager.updateInitializationState(true);
    } else {
        statusText.textContent = 'Initializing application...';
        convertBtn.disabled = true;
        voiceSelect.disabled = true;
        convertBtn.innerHTML = '<span class="loading-spinner"></span> Loading...';
    }
}

// Hide loading state (deprecated - now handled by StateManager)
function hideLoadingState() {
    // Legacy function - StateManager handles this now
    if (stateManager) {
        stateManager.updateInitializationState(false);
    } else {
        convertBtn.disabled = false;
        voiceSelect.disabled = false;
        convertBtn.innerHTML = 'Convert to Speech';
    }
}

// Load voices asynchronously without blocking UI
// Note: This function is now primarily used for manual retries
// Initial voice loading is handled by the main process during startup
async function loadVoicesAsync() {
    let attempt = 0;
    const maxRetries = 3;
    
    while (attempt < maxRetries) {
        attempt++;
        
        try {
            // Update state manager with loading state
            if (stateManager) {
                stateManager.updateVoiceState(true, false, [], attempt);
            }
            
            // Use setTimeout to yield control to UI thread
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const voices = await loadVoices();
            
            // Update state manager with success
            if (stateManager) {
                stateManager.updateVoiceState(false, true, voices || [], attempt);
            }
            
            hideLoadingState();
            return; // Success, exit retry loop
            
        } catch (error) {
            console.error(`Failed to load voices (attempt ${attempt}):`, error);
            
            if (attempt >= maxRetries) {
                // Final failure
                if (stateManager) {
                    stateManager.updateVoiceState(false, false, [], attempt, error);
                } else {
                    statusText.textContent = 'Error loading voices - some features may not work';
                }
                hideLoadingState();
            } else {
                // Wait before retry (exponential backoff)
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Manual retry function for voice loading
async function retryVoiceLoading() {
    try {
        console.log('Manually retrying voice loading...');
        
        if (stateManager) {
            stateManager.updateVoiceState(true, false, [], 1);
        }
        
        // Use the TTS service retry mechanism from main process
        const result = await window.electronAPI.retryVoiceLoading();
        
        if (result && result.success) {
            if (stateManager) {
                stateManager.updateVoiceState(false, true, result.voices || [], result.attempts || 1);
            }
        } else {
            if (stateManager) {
                stateManager.updateVoiceState(false, false, [], result?.attempts || 1, new Error(result?.error || 'Retry failed'));
            }
        }
        
    } catch (error) {
        console.error('Manual voice loading retry failed:', error);
        
        if (stateManager) {
            stateManager.updateVoiceState(false, false, [], 1, error);
        }
        
        progressManager.showErrorNotification('Voice loading retry failed: ' + error.message);
    }
}

// Setup listeners for service initialization events
function setupServiceListeners() {
    // Listen for initialization updates (real-time progress)
    window.electronAPI.onInitializationUpdate && window.electronAPI.onInitializationUpdate((_, data) => {
        console.log('Initialization update:', data);
        
        if (stateManager) {
            // Handle different types of initialization updates
            switch (data.type) {
                case 'started':
                    stateManager.updateInitializationState(true);
                    break;
                case 'ffmpeg-complete':
                    stateManager.updateFFmpegState(
                        data.data.status.available || false,
                        data.data.status.source || 'none',
                        data.data.status.validated || false
                    );
                    break;
                case 'voices-complete':
                    stateManager.updateVoiceState(
                        false, // not loading anymore
                        data.data.success || false,
                        data.data.voices || [],
                        data.data.attempts || 1,
                        null // no error
                    );
                    break;
                case 'ffmpeg-error':
                    stateManager.updateFFmpegState(false, 'none', false);
                    break;
                case 'voices-error':
                    stateManager.updateVoiceState(
                        false, // not loading anymore
                        false, // failed
                        [],
                        data.data.attempts || 1,
                        new Error(data.data.error || 'Voice loading failed')
                    );
                    break;
                case 'finalizing':
                    // Show finalizing message
                    if (statusText) {
                        statusText.textContent = data.data.message || 'Finalizing initialization...';
                    }
                    break;
                case 'complete':
                    stateManager.updateInitializationState(false);
                    break;
            }
        }
    });

    // Listen for initialization completion
    window.electronAPI.onInitializationComplete && window.electronAPI.onInitializationComplete((_, data) => {
        console.log('Initialization complete:', data);
        
        if (stateManager) {
            // Update FFmpeg state
            if (data.ffmpeg) {
                stateManager.updateFFmpegState(
                    data.ffmpeg.available || false,
                    data.ffmpeg.source || 'none',
                    data.ffmpeg.validated || false
                );
            }
            
            // Update voice state
            if (data.voices) {
                stateManager.updateVoiceState(
                    false, // not loading anymore
                    data.voices.success || false,
                    data.voices.voices || [],
                    data.voices.attempts || 1,
                    data.voices.error ? new Error(data.voices.error) : null
                );
            }
            
            // Update overall initialization state
            stateManager.updateInitializationState(false);
            
            // Show performance metrics if available
            if (data.performanceMetrics && process.env.NODE_ENV === 'development') {
                console.log('Startup Performance:', data.performanceMetrics);
            }
        } else {
            hideLoadingState();
        }
    });
    
    // Listen for initialization errors
    window.electronAPI.onInitializationError && window.electronAPI.onInitializationError((_, error) => {
        console.error('Initialization error:', error);
        
        if (stateManager) {
            stateManager.updateInitializationState(false);
        } else {
            hideLoadingState();
        }
        
        progressManager.showErrorNotification(`Initialization failed: ${error.message || error}`);
    });
    
    // Listen for FFmpeg status updates (real-time updates during initialization)
    window.electronAPI.onFFmpegStatusUpdate && window.electronAPI.onFFmpegStatusUpdate((_, status) => {
        console.log('FFmpeg status update:', status);
        
        if (stateManager) {
            stateManager.updateFFmpegState(
                status.available || false,
                status.source || 'none',
                status.validated || false
            );
        }
    });
    
    // Listen for voice loading updates (real-time updates during initialization)
    window.electronAPI.onVoicesLoaded && window.electronAPI.onVoicesLoaded((_, data) => {
        console.log('Voices loaded:', data);
        
        if (stateManager) {
            stateManager.updateVoiceState(
                false, // not loading anymore
                true, // successfully loaded
                data.voices || [],
                data.attempts || 1,
                null // no error
            );
        }
    });
    
    // Listen for voice loading failures (real-time updates during initialization)
    window.electronAPI.onVoicesLoadFailed && window.electronAPI.onVoicesLoadFailed((_, data) => {
        console.warn('Voice loading failed:', data);
        
        if (stateManager) {
            stateManager.updateVoiceState(
                false, // not loading anymore
                false, // failed to load
                [],
                data.attempts || 1,
                new Error(data.error || 'Voice loading failed')
            );
        }
    });
    
    // Legacy listeners for backward compatibility
    // Listen for service ready event
    window.electronAPI.onServiceReady && window.electronAPI.onServiceReady(() => {
        console.log('Services are ready (legacy event)');
        if (stateManager) {
            stateManager.updateInitializationState(false);
        } else {
            hideLoadingState();
        }
    });
    
    // Listen for service errors
    window.electronAPI.onServiceError && window.electronAPI.onServiceError((_, error) => {
        console.error('Service error:', error);
        progressManager.showErrorNotification('Service initialization error: ' + error.message);
    });
    
    // Listen for TTS initialization errors
    window.electronAPI.onTTSInitError && window.electronAPI.onTTSInitError((_, error) => {
        console.warn('TTS initialization error:', error);
        progressManager.showErrorNotification('TTS service may not work properly: ' + error.message);
    });
}

// Load user settings
async function loadSettings() {
    try {
        const settings = await window.electronAPI.settings.load();
        if (settings) {
            currentSettings = { ...currentSettings, ...settings };
            
            // Apply settings to UI
            if (currentSettings.defaultOutputPath) {
                outputFolder.value = currentSettings.defaultOutputPath;
                outputFolder.title = currentSettings.defaultOutputPath; // Show full path in tooltip
            } else {
                // Clear the output folder if no default is set
                outputFolder.value = '';
                outputFolder.placeholder = 'Select output folder or use default...';
            }
            
            // Set output format
            const formatRadio = document.querySelector(`input[name="outputFormat"][value="${currentSettings.defaultOutputFormat}"]`);
            if (formatRadio) {
                formatRadio.checked = true;
            }
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Load available TTS voices with optimized performance
async function loadVoices() {
    const voices = await window.electronAPI.getAvailableVoices();
    
    if (!voices || voices.length === 0) {
        throw new Error('No TTS voices found');
    }
    
    // StateManager will handle UI updates, but we still need to populate the select
    // for backward compatibility with existing code
    voiceSelect.innerHTML = '';
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = `${voice.name} (${voice.language})`;
        fragment.appendChild(option);
    });
    
    voiceSelect.appendChild(fragment);
    
    // Select previously used voice or first available
    if (currentSettings.lastSelectedVoice) {
        voiceSelect.value = currentSettings.lastSelectedVoice;
    }
    
    return voices;
}

// FFmpeg detection is now handled by the main process during startup
// This function is kept for backward compatibility but is no longer used
async function initializeFFmpegDetection() {
    console.log('FFmpeg detection is now handled by main process during startup');
    // No longer needed - main process handles FFmpeg detection during parallel initialization
}

// Initialize output folder management
async function initializeOutputFolderManagement() {
    try {
        // Get default output folder from main process
        const defaultFolder = await window.electronAPI.getDefaultOutputFolder();
        
        // Check if user has already set an output folder
        const hasUserFolder = outputFolder.value && outputFolder.value.trim() !== '';
        
        if (stateManager) {
            stateManager.updateOutputFolderState(hasUserFolder, defaultFolder);
        }
        
        // Set placeholder if no user folder is set
        if (!hasUserFolder && defaultFolder) {
            outputFolder.placeholder = `Default: ${defaultFolder}`;
        }
        
    } catch (error) {
        console.error('Failed to initialize output folder management:', error);
        if (stateManager) {
            stateManager.updateOutputFolderState(false, null);
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // File selection
    selectFileBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.selectFile();
            if (result && result.content) {
                textInput.value = result.content;
                selectedFileName.textContent = result.fileName;
            }
        } catch (error) {
            console.error('File selection error:', error);
            if (errorDisplay) {
                errorDisplay.handleFileError(error, () => selectFileBtn.click());
            } else {
                alert('Failed to load file: ' + error.message);
            }
        }
    });
    
    // Output folder selection
    selectFolderBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.selectOutputFolder();
            if (result && result.folderPath) {
                outputFolder.value = result.folderPath;
                
                // Update state manager
                if (stateManager) {
                    stateManager.updateOutputFolderState(true, stateManager.getState().defaultOutputFolder);
                }
            }
        } catch (error) {
            console.error('Folder selection error:', error);
            if (errorDisplay) {
                errorDisplay.handleFileError(error, () => selectFolderBtn.click());
            } else {
                alert('Failed to select folder: ' + error.message);
            }
        }
    });
    
    // Convert button
    convertBtn.addEventListener('click', async () => {
        await startConversion();
    });
    
    // Cancel button
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            progressManager.cancel();
        });
    }
    
    // Settings button
    settingsBtn.addEventListener('click', () => {
        openSettingsModal();
    });
    
    // Voice selection change
    voiceSelect.addEventListener('change', async () => {
        currentSettings.lastSelectedVoice = voiceSelect.value;
        await saveSettings();
    });
    
    // Enhanced output format change with intelligent management
    document.querySelectorAll('input[name="outputFormat"]').forEach(radio => {
        radio.addEventListener('change', async (event) => {
            const selectedFormat = radio.value;
            
            // Validate format selection with StateManager
            if (stateManager) {
                const validation = stateManager.validateFormatSelection(selectedFormat);
                
                if (!validation.valid) {
                    // Prevent invalid selection
                    event.preventDefault();
                    
                    // Show error notification
                    stateManager.showFormatStatusNotification(
                        `Cannot select ${selectedFormat.toUpperCase()} format`,
                        'warning',
                        validation.reason
                    );
                    
                    // Auto-select suggested format
                    if (validation.suggestedFormat) {
                        stateManager.setSelectedFormat(validation.suggestedFormat);
                        currentSettings.defaultOutputFormat = validation.suggestedFormat;
                    }
                } else {
                    // Valid selection
                    currentSettings.defaultOutputFormat = selectedFormat;
                }
            } else {
                // Fallback for when StateManager is not available
                currentSettings.defaultOutputFormat = selectedFormat;
            }
            
            await saveSettings();
        });
    });
    
    // Progress updates from main process
    window.electronAPI.onProgressUpdate((_, data) => {
        if (data.phase) {
            progressManager.updatePhase(data.phase, data.phaseProgress || 0);
        }
        if (typeof data.progress === 'number') {
            progressManager.updateOverallProgress(data.progress);
        }
    });
    
    window.electronAPI.onConversionComplete((_, data) => {
        onConversionComplete(data);
    });
    
    window.electronAPI.onConversionError((_, error) => {
        onConversionError(error);
    });
    
    // Enhanced error handling
    window.electronAPI.onRetryAttempt && window.electronAPI.onRetryAttempt((_, data) => {
        if (errorDisplay) {
            errorDisplay.showRetryNotification(data.attempt, data.maxRetries, data.delay);
        }
    });
    
    // Conversion cancelled
    window.electronAPI.onConversionCancelled && window.electronAPI.onConversionCancelled((_, data) => {
        progressManager.error('Conversion was cancelled');
        currentConversionJob = null;
    });
}

// Start text-to-speech conversion
async function startConversion() {
    const text = textInput.value.trim();
    const voice = voiceSelect.value;
    const outputFormat = document.querySelector('input[name="outputFormat"]:checked').value;
    const outputPath = outputFolder.value;
    
    // Validation using StateManager
    if (!text) {
        progressManager.showErrorNotification('Please enter text to convert.');
        textInput.focus();
        return;
    }
    
    if (!stateManager.hasVoices()) {
        progressManager.showErrorNotification('No voices available. Please wait for voices to load or try refreshing.');
        return;
    }
    
    if (!voice) {
        progressManager.showErrorNotification('Please select a voice.');
        voiceSelect.focus();
        return;
    }
    
    if (!outputPath && !stateManager.getState().defaultOutputFolder) {
        progressManager.showErrorNotification('Please select an output folder.');
        selectFolderBtn.focus();
        return;
    }
    
    // Check MP3 format availability
    if (outputFormat === 'mp3' && !stateManager.canConvertToMp3()) {
        progressManager.showErrorNotification('MP3 format is not available. FFmpeg is required for MP3 conversion.');
        return;
    }
    
    try {
        // Define conversion phases
        const phases = [
            'Initializing conversion...',
            'Processing text...',
            'Generating speech...',
            'Converting audio format...',
            'Finalizing output...'
        ];
        
        // Start progress tracking
        progressManager.start(phases);
        
        // Create conversion job
        currentConversionJob = {
            id: Date.now().toString(),
            text: text,
            voice: voice,
            outputFormat: outputFormat,
            outputPath: outputPath,
            speed: currentSettings.voiceSpeed
        };
        
        // Start conversion
        const result = await window.electronAPI.convertTextToSpeech(currentConversionJob);
        
        // Handle immediate errors (validation, etc.)
        if (result && result.error) {
            throw new Error(result.error);
        }
        
    } catch (error) {
        onConversionError(error);
        currentConversionJob = null;
    }
}

// Handle conversion completion
function onConversionComplete(data) {
    const message = `Conversion completed! File saved to: ${data.outputFile}`;
    progressManager.complete(message);
    currentConversionJob = null;
}

// Handle conversion error
function onConversionError(error) {
    progressManager.hide();
    currentConversionJob = null;
    
    // Use enhanced error display if available
    if (errorDisplay && error.userMessage) {
        // Enhanced error from main process
        if (error.category === 'tts_voice') {
            errorDisplay.handleTTSVoiceError(error, () => startConversion());
        } else if (error.category === 'file') {
            errorDisplay.handleFileError(error, () => startConversion());
        } else if (error.category === 'ffmpeg') {
            errorDisplay.handleFFmpegError(error, () => startConversion());
        } else {
            errorDisplay.showError(error, () => startConversion());
        }
    } else {
        // Fallback for simple errors
        const errorMessage = typeof error === 'string' ? error : error.message || 'Conversion failed';
        progressManager.error(errorMessage);
    }
}

// Save current settings
async function saveSettings() {
    try {
        await window.electronAPI.settings.save(currentSettings);
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

// Settings Modal Management
class SettingsModal {
    constructor() {
        this.modal = document.getElementById('settingsModal');
        this.closeBtn = document.getElementById('closeSettingsBtn');
        this.cancelBtn = document.getElementById('cancelSettingsBtn');
        this.saveBtn = document.getElementById('saveSettingsBtn');
        this.resetBtn = document.getElementById('resetSettingsBtn');
        
        // Settings controls
        this.speedSlider = document.getElementById('speedSlider');
        this.speedValue = document.getElementById('speedValue');
        this.previewBtn = document.getElementById('previewSpeedBtn');
        this.defaultFormatWav = document.getElementById('defaultFormatWav');
        this.defaultFormatMp3 = document.getElementById('defaultFormatMp3');
        this.defaultOutputPath = document.getElementById('defaultOutputPath');
        this.browseDefaultPathBtn = document.getElementById('browseDefaultPathBtn');
        this.clearDefaultPathBtn = document.getElementById('clearDefaultPathBtn');
        this.maxChunkLength = document.getElementById('maxChunkLength');
        
        this.tempSettings = {};
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Modal close events
        this.closeBtn.addEventListener('click', () => this.close());
        this.cancelBtn.addEventListener('click', () => this.close());
        
        // Click outside modal to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.close();
            }
        });
        
        // Speed slider
        this.speedSlider.addEventListener('input', () => {
            const speed = parseFloat(this.speedSlider.value);
            this.speedValue.textContent = `${speed.toFixed(1)}x`;
            this.tempSettings.voiceSpeed = speed;
        });
        
        // Speed preview
        this.previewBtn.addEventListener('click', () => this.previewSpeed());
        
        // Default format radio buttons
        this.defaultFormatWav.addEventListener('change', () => {
            if (this.defaultFormatWav.checked) {
                this.tempSettings.defaultOutputFormat = 'wav';
            }
        });
        
        this.defaultFormatMp3.addEventListener('change', () => {
            if (this.defaultFormatMp3.checked) {
                this.tempSettings.defaultOutputFormat = 'mp3';
            }
        });
        
        // Default output path
        this.browseDefaultPathBtn.addEventListener('click', () => this.browseDefaultPath());
        this.clearDefaultPathBtn.addEventListener('click', () => this.clearDefaultPath());
        
        // Max chunk length
        this.maxChunkLength.addEventListener('change', () => {
            const value = parseInt(this.maxChunkLength.value);
            if (value >= 1000 && value <= 50000) {
                this.tempSettings.maxChunkLength = value;
            }
        });
        
        // Save and reset buttons
        this.saveBtn.addEventListener('click', () => this.saveSettings());
        this.resetBtn.addEventListener('click', () => this.resetToDefaults());
    }
    
    open() {
        // Copy current settings to temp settings
        this.tempSettings = { ...currentSettings };
        
        // Populate form with current settings
        this.populateForm();
        
        // Show modal
        this.modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    
    close() {
        this.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Reset temp settings
        this.tempSettings = {};
    }
    
    populateForm() {
        // Voice speed
        this.speedSlider.value = this.tempSettings.voiceSpeed;
        this.speedValue.textContent = `${this.tempSettings.voiceSpeed.toFixed(1)}x`;
        
        // Default output format
        if (this.tempSettings.defaultOutputFormat === 'wav') {
            this.defaultFormatWav.checked = true;
        } else {
            this.defaultFormatMp3.checked = true;
        }
        
        // Default output path - show current path or indicate if none set
        const outputPath = this.tempSettings.defaultOutputPath || '';
        this.defaultOutputPath.value = outputPath;
        this.defaultOutputPath.title = outputPath; // Show full path in tooltip
        
        // Update placeholder text based on whether path is set
        if (outputPath) {
            this.defaultOutputPath.placeholder = 'Default output directory is set';
        } else {
            this.defaultOutputPath.placeholder = 'No default directory set - will use system default';
        }
        
        // Max chunk length
        this.maxChunkLength.value = this.tempSettings.maxChunkLength || 5000;
    }
    
    async previewSpeed() {
        const previewText = "This is a preview of the voice speed setting.";
        const selectedVoice = voiceSelect.value;
        
        if (!selectedVoice) {
            this.showNotification('Please select a voice first.', 'error');
            return;
        }
        
        try {
            this.previewBtn.disabled = true;
            this.previewBtn.textContent = 'Playing...';
            
            // Request preview from main process
            await window.electronAPI.previewVoiceSpeed({
                text: previewText,
                voice: selectedVoice,
                speed: this.tempSettings.voiceSpeed
            });
            
        } catch (error) {
            console.error('Preview failed:', error);
            this.showNotification('Preview failed: ' + error.message, 'error');
        } finally {
            this.previewBtn.disabled = false;
            this.previewBtn.textContent = 'Preview Speed';
        }
    }
    
    async browseDefaultPath() {
        try {
            const result = await window.electronAPI.selectOutputFolder();
            if (result && result.folderPath) {
                this.defaultOutputPath.value = result.folderPath;
                this.tempSettings.defaultOutputPath = result.folderPath;
            }
        } catch (error) {
            console.error('Folder selection error:', error);
            this.showNotification('Failed to select folder: ' + error.message, 'error');
        }
    }
    
    clearDefaultPath() {
        this.defaultOutputPath.value = '';
        this.defaultOutputPath.placeholder = 'No default directory set - will use system default';
        this.defaultOutputPath.title = '';
        this.tempSettings.defaultOutputPath = null;
    }
    
    async saveSettings() {
        try {
            // Validate settings
            if (this.tempSettings.maxChunkLength < 1000 || this.tempSettings.maxChunkLength > 50000) {
                this.showNotification('Max chunk length must be between 1,000 and 50,000 characters.', 'error');
                return;
            }
            
            // Update current settings
            Object.assign(currentSettings, this.tempSettings);
            
            // Save to persistent storage
            await saveSettings();
            
            // Apply settings to main UI
            this.applySettingsToUI();
            
            // Show success message
            this.showNotification('Settings saved successfully!', 'success');
            
            // Close modal after short delay
            setTimeout(() => {
                this.close();
            }, 1000);
            
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings: ' + error.message, 'error');
        }
    }
    
    applySettingsToUI() {
        // Update output format in main UI
        const formatRadio = document.querySelector(`input[name="outputFormat"][value="${currentSettings.defaultOutputFormat}"]`);
        if (formatRadio) {
            formatRadio.checked = true;
        }
        
        // Update output folder in main UI
        if (currentSettings.defaultOutputPath) {
            // Always update to show the current default path
            outputFolder.value = currentSettings.defaultOutputPath;
            outputFolder.title = currentSettings.defaultOutputPath; // Show full path in tooltip
        } else {
            // Clear if no default path is set
            outputFolder.value = '';
            outputFolder.title = '';
        }
    }
    
    async resetToDefaults() {
        const confirmed = confirm('Are you sure you want to reset all settings to their default values?');
        if (!confirmed) return;
        
        try {
            // Get default settings
            const defaultSettings = {
                lastSelectedVoice: '',
                defaultOutputFormat: 'wav',
                defaultOutputPath: '',
                voiceSpeed: 1.0,
                maxChunkLength: 5000
            };
            
            // Update temp settings
            this.tempSettings = { ...defaultSettings };
            
            // Repopulate form
            this.populateForm();
            
            this.showNotification('Settings reset to defaults. Click "Save Settings" to apply.', 'success');
            
        } catch (error) {
            console.error('Failed to reset settings:', error);
            this.showNotification('Failed to reset settings: ' + error.message, 'error');
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 4000);

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    }
}

// Initialize settings modal
const settingsModal = new SettingsModal();

// Function to open settings modal (called by settings button)
function openSettingsModal() {
    settingsModal.open();
}