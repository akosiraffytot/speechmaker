/**
 * StateManager - Manages application state and UI synchronization
 * 
 * This class coordinates the state of various application components including:
 * - Voice loading status and retry mechanisms
 * - FFmpeg availability and source detection
 * - Application readiness indicators
 * - UI element states and visual feedback
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
class StateManager {
    constructor() {
        this.state = {
            // Voice loading state
            voicesLoaded: false,
            voicesLoading: false,
            voiceLoadAttempts: 0,
            voiceLoadError: null,
            voices: [],
            
            // FFmpeg state
            ffmpegAvailable: false,
            ffmpegSource: 'none', // 'bundled', 'system', 'none'
            ffmpegValidated: false,
            
            // Output folder state
            outputFolderSet: false,
            defaultOutputFolder: null,
            
            // Application readiness
            ready: false,
            initializing: true,
            
            // UI state
            showRetryButton: false,
            showTroubleshooting: false,
            loadingMessage: 'Initializing application...',
            readyIndicator: false
        };
        
        // DOM element references
        this.elements = {};
        this.initializeElements();
        
        // Event listeners for state changes
        this.listeners = new Map();
        
        // Initialize UI state
        this.updateUI();
    }
    
    /**
     * Initialize DOM element references
     */
    initializeElements() {
        this.elements = {
            // Voice elements
            voiceSelect: document.getElementById('voiceSelect'),
            
            // Format elements
            formatWav: document.getElementById('formatWav'),
            formatMp3: document.getElementById('formatMp3'),
            formatMp3Label: document.querySelector('label[for="formatMp3"]'),
            
            // Output folder elements
            outputFolder: document.getElementById('outputFolder'),
            selectFolderBtn: document.getElementById('selectFolderBtn'),
            
            // Action elements
            convertBtn: document.getElementById('convertBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            
            // Status elements
            statusText: document.getElementById('statusText'),
            progressSection: document.getElementById('progressSection'),
            
            // Ready indicator (will be created if needed)
            readyIndicator: null
        };
    }
    
    /**
     * Update voice loading state
     * @param {boolean} loading - Whether voices are currently loading
     * @param {boolean} loaded - Whether voices have been successfully loaded
     * @param {Array} voices - Array of available voices
     * @param {number} attempts - Number of load attempts made
     * @param {Error} error - Any error that occurred during loading
     */
    updateVoiceState(loading, loaded, voices = [], attempts = 0, error = null) {
        const previousState = { ...this.state };
        
        this.state.voicesLoading = loading;
        this.state.voicesLoaded = loaded;
        this.state.voices = voices;
        this.state.voiceLoadAttempts = attempts;
        this.state.voiceLoadError = error;
        
        // Update retry button visibility
        this.state.showRetryButton = !loading && !loaded && attempts > 0;
        this.state.showTroubleshooting = !loading && !loaded && attempts >= 3;
        
        // Update loading message
        if (loading) {
            if (attempts > 0) {
                this.state.loadingMessage = `Loading voices... (attempt ${attempts})`;
            } else {
                this.state.loadingMessage = 'Loading voices...';
            }
        } else if (!loaded && error) {
            this.state.loadingMessage = 'Failed to load voices';
        }
        
        this.updateReadyState();
        this.updateUI();
        this.notifyStateChange('voice', previousState, this.state);
    }
    
    /**
     * Update FFmpeg availability state with real-time format management
     * @param {boolean} available - Whether FFmpeg is available
     * @param {string} source - Source of FFmpeg ('bundled', 'system', 'none')
     * @param {boolean} validated - Whether FFmpeg has been validated
     */
    updateFFmpegState(available, source = 'none', validated = false) {
        const previousState = { ...this.state };
        const previousMp3Available = this.canConvertToMp3();
        
        this.state.ffmpegAvailable = available;
        this.state.ffmpegSource = source;
        this.state.ffmpegValidated = validated;
        
        // Check if MP3 availability changed
        const currentMp3Available = this.canConvertToMp3();
        const mp3AvailabilityChanged = previousMp3Available !== currentMp3Available;
        
        // Update UI with format option changes
        this.updateReadyState();
        this.updateUI();
        
        // Handle real-time format option updates
        if (mp3AvailabilityChanged) {
            this.handleMp3AvailabilityChange(currentMp3Available, previousMp3Available);
        }
        
        this.notifyStateChange('ffmpeg', previousState, this.state);
    }
    
    /**
     * Handle changes in MP3 format availability
     * @param {boolean} currentAvailable - Current MP3 availability
     * @param {boolean} previousAvailable - Previous MP3 availability
     */
    handleMp3AvailabilityChange(currentAvailable, previousAvailable) {
        if (currentAvailable && !previousAvailable) {
            // MP3 became available
            this.handleMp3BecameAvailable();
        } else if (!currentAvailable && previousAvailable) {
            // MP3 became unavailable
            this.handleMp3BecameUnavailable();
        }
    }
    
    /**
     * Handle MP3 format becoming available
     */
    handleMp3BecameAvailable() {
        console.log('MP3 format became available');
        
        // Show success notification
        this.showFormatStatusNotification(
            'MP3 format is now available!',
            'success',
            `FFmpeg is ready via ${this.getFFmpegSourceDescription()}`
        );
        
        // Notify listeners
        this.notifyFormatAvailabilityChange(true);
    }
    
    /**
     * Handle MP3 format becoming unavailable
     */
    handleMp3BecameUnavailable() {
        console.log('MP3 format became unavailable');
        
        // Check if MP3 is currently selected and auto-switch to WAV
        const mp3Option = this.elements.formatMp3;
        const wavOption = this.elements.formatWav;
        
        if (mp3Option && mp3Option.checked && wavOption) {
            mp3Option.checked = false;
            wavOption.checked = true;
            
            // Show notification about automatic switch
            this.showFormatStatusNotification(
                'Switched to WAV format',
                'warning',
                'MP3 format is no longer available - FFmpeg connection lost'
            );
            
            // Notify about automatic format change
            this.notifyAutomaticFormatChange('wav');
        } else {
            // Show general unavailability notification
            this.showFormatStatusNotification(
                'MP3 format is no longer available',
                'warning',
                'FFmpeg connection lost - only WAV format is supported'
            );
        }
        
        // Notify listeners
        this.notifyFormatAvailabilityChange(false);
    }
    
    /**
     * Show format status notification
     * @param {string} message - Main notification message
     * @param {string} type - Notification type ('success', 'warning', 'info')
     * @param {string} details - Additional details
     */
    showFormatStatusNotification(message, type = 'info', details = '') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `format-status-notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${this.getNotificationIcon(type)}</span>
                <div class="notification-text">
                    <div class="notification-message">${message}</div>
                    ${details ? `<div class="notification-details">${details}</div>` : ''}
                </div>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }
        }, 4000);
    }
    
    /**
     * Get notification icon based on type
     * @param {string} type - Notification type
     * @returns {string} Icon character
     */
    getNotificationIcon(type) {
        switch (type) {
            case 'success': return '✓';
            case 'warning': return '⚠️';
            case 'error': return '✗';
            default: return 'ℹ️';
        }
    }
    
    /**
     * Update output folder state
     * @param {boolean} folderSet - Whether an output folder is set
     * @param {string} defaultFolder - Default output folder path
     */
    updateOutputFolderState(folderSet, defaultFolder = null) {
        const previousState = { ...this.state };
        
        this.state.outputFolderSet = folderSet;
        this.state.defaultOutputFolder = defaultFolder;
        
        this.updateReadyState();
        this.updateUI();
        this.notifyStateChange('outputFolder', previousState, this.state);
    }
    
    /**
     * Update initialization state
     * @param {boolean} initializing - Whether the application is still initializing
     */
    updateInitializationState(initializing) {
        const previousState = { ...this.state };
        
        this.state.initializing = initializing;
        
        if (!initializing) {
            this.state.loadingMessage = this.state.ready ? 'Ready' : 'Initialization complete';
        }
        
        this.updateReadyState();
        this.updateUI();
        this.notifyStateChange('initialization', previousState, this.state);
    }
    
    /**
     * Update overall application readiness state
     */
    updateReadyState() {
        const wasReady = this.state.ready;
        
        // Application is ready when:
        // - Not initializing
        // - Voices are loaded
        // - Output folder is available (either set or default exists)
        this.state.ready = !this.state.initializing && 
                          this.state.voicesLoaded && 
                          (this.state.outputFolderSet || this.state.defaultOutputFolder);
        
        this.state.readyIndicator = this.state.ready;
        
        // Update loading message based on readiness
        if (this.state.ready && !wasReady) {
            this.state.loadingMessage = 'Ready';
        }
    }
    
    /**
     * Synchronize UI elements with current application state
     * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
     */
    updateUI() {
        this.updateVoiceUI();
        this.updateFormatUI();
        this.updateOutputFolderUI();
        this.updateActionButtonsUI();
        this.updateStatusUI();
        this.updateReadyIndicatorUI();
        this.updateInitializationIndicators();
    }
    
    /**
     * Update voice-related UI elements
     */
    updateVoiceUI() {
        const voiceSelect = this.elements.voiceSelect;
        if (!voiceSelect) return;
        
        if (this.state.voicesLoading) {
            // Show loading state with attempt information
            let loadingText = 'Loading voices...';
            if (this.state.voiceLoadAttempts > 0) {
                loadingText = `Loading voices... (attempt ${this.state.voiceLoadAttempts})`;
            }
            voiceSelect.innerHTML = `<option>${loadingText}</option>`;
            voiceSelect.disabled = true;
            voiceSelect.classList.add('loading');
            voiceSelect.classList.remove('error');
            
        } else if (this.state.voicesLoaded && this.state.voices.length > 0) {
            // Show available voices
            voiceSelect.innerHTML = '';
            voiceSelect.disabled = false;
            voiceSelect.classList.remove('loading', 'error');
            
            // Use document fragment for better performance
            const fragment = document.createDocumentFragment();
            this.state.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = `${voice.name} (${voice.language})`;
                fragment.appendChild(option);
            });
            voiceSelect.appendChild(fragment);
            
        } else {
            // Show error state with detailed message
            let errorMessage = 'No voices available';
            if (this.state.voiceLoadError) {
                if (this.state.voiceLoadAttempts > 0) {
                    errorMessage = `Failed to load voices (${this.state.voiceLoadAttempts} attempts)`;
                } else {
                    errorMessage = 'Failed to load voices';
                }
            }
            voiceSelect.innerHTML = `<option>${errorMessage}</option>`;
            voiceSelect.disabled = true;
            voiceSelect.classList.remove('loading');
            voiceSelect.classList.add('error');
        }
        
        // Add retry button and troubleshooting if needed
        this.updateVoiceRetryButton();
        this.updateVoiceLoadingIndicator();
    }
    
    /**
     * Update or create voice retry button
     */
    updateVoiceRetryButton() {
        const voiceContainer = this.elements.voiceSelect?.parentElement;
        if (!voiceContainer) return;
        
        let retryButton = voiceContainer.querySelector('.voice-retry-btn');
        
        if (this.state.showRetryButton) {
            if (!retryButton) {
                retryButton = document.createElement('button');
                retryButton.className = 'voice-retry-btn';
                retryButton.innerHTML = '<span class="retry-icon">🔄</span> Retry Loading Voices';
                retryButton.addEventListener('click', () => {
                    // Disable button during retry
                    retryButton.disabled = true;
                    retryButton.innerHTML = '<span class="loading-spinner"></span> Retrying...';
                    
                    // Re-enable after a short delay (will be updated by state change)
                    setTimeout(() => {
                        retryButton.disabled = false;
                        retryButton.innerHTML = '<span class="retry-icon">🔄</span> Retry Loading Voices';
                    }, 2000);
                    
                    this.notifyAction('retryVoiceLoading');
                });
                voiceContainer.appendChild(retryButton);
            }
            retryButton.style.display = 'inline-block';
            retryButton.disabled = this.state.voicesLoading;
        } else if (retryButton) {
            retryButton.style.display = 'none';
        }
        
        // Add troubleshooting info if needed
        this.updateVoiceTroubleshooting();
    }
    
    /**
     * Update or create voice troubleshooting information
     */
    updateVoiceTroubleshooting() {
        const voiceContainer = this.elements.voiceSelect?.parentElement;
        if (!voiceContainer) return;
        
        let troubleshootingDiv = voiceContainer.querySelector('.voice-troubleshooting');
        
        if (this.state.showTroubleshooting && this.state.voiceLoadError) {
            if (!troubleshootingDiv) {
                troubleshootingDiv = document.createElement('div');
                troubleshootingDiv.className = 'voice-troubleshooting';
                voiceContainer.appendChild(troubleshootingDiv);
            }
            
            troubleshootingDiv.innerHTML = `
                <div class="troubleshooting-content">
                    <h4>Voice Loading Issues</h4>
                    <p>Try these troubleshooting steps:</p>
                    <ul>
                        <li>Ensure Windows Speech Platform is installed</li>
                        <li>Check Windows TTS settings in Control Panel</li>
                        <li>Restart the application as administrator</li>
                        <li>Verify Windows updates are installed</li>
                    </ul>
                </div>
            `;
            troubleshootingDiv.style.display = 'block';
        } else if (troubleshootingDiv) {
            troubleshootingDiv.style.display = 'none';
        }
    }
    
    /**
     * Update format-related UI elements with intelligent management
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
     */
    updateFormatUI() {
        const mp3Option = this.elements.formatMp3;
        const mp3Label = this.elements.formatMp3Label;
        const wavOption = this.elements.formatWav;
        
        if (!mp3Option || !mp3Label) return;
        
        // Check if MP3 format should be available
        const canConvertToMp3 = this.state.ffmpegAvailable && this.state.ffmpegValidated;
        
        if (canConvertToMp3) {
            // Enable MP3 option with detailed status
            this.enableMp3Format();
        } else {
            // Disable MP3 option with automatic WAV selection
            this.disableMp3Format();
        }
        
        // Update format option container styling
        this.updateFormatContainerStyling(canConvertToMp3);
        
        // Add real-time format availability indicators
        this.updateFormatAvailabilityIndicators(canConvertToMp3);
    }
    
    /**
     * Enable MP3 format option with enhanced visual feedback
     */
    enableMp3Format() {
        const mp3Option = this.elements.formatMp3;
        const mp3Label = this.elements.formatMp3Label;
        
        // Enable the option
        mp3Option.disabled = false;
        mp3Label.classList.remove('disabled');
        mp3Label.classList.add('enabled');
        
        // Set detailed tooltip with FFmpeg source information
        const sourceInfo = this.getFFmpegSourceDescription();
        mp3Label.title = `MP3 format available (${sourceInfo})`;
        
        // Add success visual indicator
        this.updateFFmpegStatusIndicator(true, `MP3 conversion ready via ${sourceInfo}`);
        
        // Trigger format availability change event
        this.notifyFormatAvailabilityChange(true);
    }
    
    /**
     * Disable MP3 format option with automatic WAV selection
     */
    disableMp3Format() {
        const mp3Option = this.elements.formatMp3;
        const mp3Label = this.elements.formatMp3Label;
        const wavOption = this.elements.formatWav;
        
        // Disable the option
        mp3Option.disabled = true;
        mp3Label.classList.add('disabled');
        mp3Label.classList.remove('enabled');
        
        // Automatically select WAV if MP3 was selected
        if (mp3Option.checked && wavOption) {
            mp3Option.checked = false;
            wavOption.checked = true;
            
            // Notify about automatic format change
            this.notifyAutomaticFormatChange('wav');
        }
        
        // Set detailed tooltip based on FFmpeg status
        const { tooltipMessage, helpText } = this.getFFmpegUnavailableInfo();
        mp3Label.title = tooltipMessage;
        
        // Add warning visual indicator
        this.updateFFmpegStatusIndicator(false, helpText);
        
        // Trigger format availability change event
        this.notifyFormatAvailabilityChange(false);
    }
    
    /**
     * Get FFmpeg source description for user display
     */
    getFFmpegSourceDescription() {
        switch (this.state.ffmpegSource) {
            case 'bundled':
                return 'bundled FFmpeg';
            case 'system':
                return 'system FFmpeg';
            default:
                return 'FFmpeg';
        }
    }
    
    /**
     * Get detailed information about FFmpeg unavailability
     */
    getFFmpegUnavailableInfo() {
        let tooltipMessage = 'MP3 format unavailable';
        let helpText = '';
        
        if (this.state.ffmpegSource === 'none') {
            tooltipMessage += ' - FFmpeg not found';
            helpText = 'FFmpeg is required for MP3 conversion. Only WAV format is available.';
        } else if (!this.state.ffmpegValidated) {
            tooltipMessage += ' - FFmpeg validation failed';
            helpText = 'FFmpeg was found but failed validation. Please check your FFmpeg installation.';
        } else if (!this.state.ffmpegAvailable) {
            tooltipMessage += ' - FFmpeg not available';
            helpText = 'FFmpeg is not currently available. Only WAV format is supported.';
        }
        
        return { tooltipMessage, helpText };
    }
    
    /**
     * Update format container styling based on availability
     */
    updateFormatContainerStyling(mp3Available) {
        const formatContainer = this.elements.formatMp3?.closest('.radio-group');
        if (!formatContainer) return;
        
        // Add/remove availability classes
        formatContainer.classList.toggle('mp3-available', mp3Available);
        formatContainer.classList.toggle('mp3-unavailable', !mp3Available);
        
        // Update container attributes for CSS styling
        formatContainer.setAttribute('data-mp3-available', mp3Available.toString());
    }
    
    /**
     * Update format availability indicators with real-time feedback
     */
    updateFormatAvailabilityIndicators(mp3Available) {
        const formatContainer = this.elements.formatMp3?.closest('.radio-group');
        if (!formatContainer) return;
        
        // Update or create availability indicator
        let availabilityIndicator = formatContainer.querySelector('.format-availability-indicator');
        
        if (!availabilityIndicator) {
            availabilityIndicator = document.createElement('div');
            availabilityIndicator.className = 'format-availability-indicator';
            formatContainer.appendChild(availabilityIndicator);
        }
        
        if (mp3Available) {
            availabilityIndicator.innerHTML = `
                <div class="availability-content availability-success">
                    <span class="availability-icon">✓</span>
                    <span class="availability-text">Both WAV and MP3 formats available</span>
                </div>
            `;
            availabilityIndicator.className = 'format-availability-indicator success';
        } else {
            availabilityIndicator.innerHTML = `
                <div class="availability-content availability-warning">
                    <span class="availability-icon">⚠️</span>
                    <span class="availability-text">Only WAV format available - MP3 requires FFmpeg</span>
                </div>
            `;
            availabilityIndicator.className = 'format-availability-indicator warning';
        }
        
        // Show the indicator
        availabilityIndicator.style.display = 'block';
    }
    
    /**
     * Notify listeners about format availability changes
     */
    notifyFormatAvailabilityChange(mp3Available) {
        const eventData = {
            mp3Available,
            ffmpegSource: this.state.ffmpegSource,
            ffmpegValidated: this.state.ffmpegValidated,
            timestamp: Date.now()
        };
        
        // Notify format availability listeners
        const formatListeners = this.listeners.get('formatAvailability');
        if (formatListeners) {
            formatListeners.forEach(callback => {
                try {
                    callback(eventData);
                } catch (error) {
                    console.error('Error in format availability listener:', error);
                }
            });
        }
        
        // Also notify general state change listeners
        this.notifyStateChange('formatAvailability', { mp3Available: !mp3Available }, { mp3Available });
    }
    
    /**
     * Notify about automatic format changes
     */
    notifyAutomaticFormatChange(newFormat) {
        const eventData = {
            newFormat,
            reason: 'mp3_unavailable',
            timestamp: Date.now()
        };
        
        // Notify automatic format change listeners
        const autoChangeListeners = this.listeners.get('automaticFormatChange');
        if (autoChangeListeners) {
            autoChangeListeners.forEach(callback => {
                try {
                    callback(eventData);
                } catch (error) {
                    console.error('Error in automatic format change listener:', error);
                }
            });
        }
        
        // Show user notification about automatic change
        this.showFormatChangeNotification(newFormat);
    }
    
    /**
     * Show notification about automatic format change
     */
    showFormatChangeNotification(newFormat) {
        // Create a temporary notification element
        const notification = document.createElement('div');
        notification.className = 'format-change-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">ℹ️</span>
                <span class="notification-message">
                    Automatically switched to ${newFormat.toUpperCase()} format (MP3 unavailable)
                </span>
            </div>
        `;
        
        // Add to format container
        const formatContainer = this.elements.formatMp3?.closest('.radio-group');
        if (formatContainer) {
            formatContainer.appendChild(notification);
            
            // Animate in
            setTimeout(() => notification.classList.add('show'), 100);
            
            // Remove after 3 seconds
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 300);
            }, 3000);
        }
    }
    
    /**
     * Update output folder UI elements
     */
    updateOutputFolderUI() {
        const outputFolder = this.elements.outputFolder;
        if (!outputFolder) return;
        
        // Update placeholder text based on default folder availability
        if (this.state.defaultOutputFolder && !outputFolder.value) {
            outputFolder.placeholder = `Default: ${this.state.defaultOutputFolder}`;
        } else if (!this.state.outputFolderSet && !this.state.defaultOutputFolder) {
            outputFolder.placeholder = 'Select output folder...';
        }
    }
    
    /**
     * Update action buttons UI state
     */
    updateActionButtonsUI() {
        const convertBtn = this.elements.convertBtn;
        const settingsBtn = this.elements.settingsBtn;
        
        if (convertBtn) {
            // Convert button is enabled when application is ready
            convertBtn.disabled = !this.state.ready;
            
            // Update button text based on state
            if (this.state.initializing) {
                convertBtn.innerHTML = '<span class="loading-spinner"></span> Loading...';
            } else if (!this.state.ready) {
                convertBtn.textContent = 'Convert to Speech';
                convertBtn.title = 'Please wait for initialization to complete';
            } else {
                convertBtn.textContent = 'Convert to Speech';
                convertBtn.title = '';
            }
        }
        
        if (settingsBtn) {
            // Settings button is always available
            settingsBtn.disabled = false;
        }
    }
    
    /**
     * Update status text and loading indicators
     */
    updateStatusUI() {
        const statusText = this.elements.statusText;
        if (!statusText) return;
        
        statusText.textContent = this.state.loadingMessage;
        
        // Add appropriate CSS classes for styling
        statusText.classList.remove('loading', 'error', 'ready');
        
        if (this.state.initializing || this.state.voicesLoading) {
            statusText.classList.add('loading');
        } else if (this.state.ready) {
            statusText.classList.add('ready');
        } else if (this.state.voiceLoadError) {
            statusText.classList.add('error');
        }
    }
    
    /**
     * Update or create ready indicator
     */
    updateReadyIndicatorUI() {
        let readyIndicator = this.elements.readyIndicator;
        
        if (this.state.readyIndicator && this.state.ready) {
            if (!readyIndicator) {
                // Create ready indicator
                readyIndicator = document.createElement('div');
                readyIndicator.className = 'ready-indicator';
                readyIndicator.innerHTML = `
                    <span class="ready-icon">✓</span>
                    <span class="ready-text">Ready</span>
                `;
                
                // Add to header or appropriate location
                const header = document.querySelector('header');
                if (header) {
                    header.appendChild(readyIndicator);
                    this.elements.readyIndicator = readyIndicator;
                }
            }
            
            if (readyIndicator) {
                readyIndicator.style.display = 'flex';
                readyIndicator.classList.add('show');
            }
            
        } else if (readyIndicator) {
            readyIndicator.style.display = 'none';
            readyIndicator.classList.remove('show');
        }
    }
    
    /**
     * Get current application state
     * @returns {Object} Current state object
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Check if application is ready for conversion
     * @returns {boolean} True if ready for conversion
     */
    isReady() {
        return this.state.ready;
    }
    
    /**
     * Check if voices are available
     * @returns {boolean} True if voices are loaded and available
     */
    hasVoices() {
        return this.state.voicesLoaded && this.state.voices.length > 0;
    }
    
    /**
     * Check if MP3 format is available
     * @returns {boolean} True if FFmpeg is available for MP3 conversion
     */
    canConvertToMp3() {
        return this.state.ffmpegAvailable && this.state.ffmpegValidated;
    }
    
    /**
     * Get currently selected output format
     * @returns {string} Currently selected format ('wav' or 'mp3')
     */
    getSelectedFormat() {
        const mp3Option = this.elements.formatMp3;
        const wavOption = this.elements.formatWav;
        
        if (mp3Option && mp3Option.checked) {
            return 'mp3';
        } else if (wavOption && wavOption.checked) {
            return 'wav';
        }
        
        // Default to WAV if nothing is selected
        return 'wav';
    }
    
    /**
     * Set the selected output format with validation
     * @param {string} format - Format to select ('wav' or 'mp3')
     * @param {boolean} force - Force selection even if format is unavailable
     * @returns {boolean} True if format was successfully selected
     */
    setSelectedFormat(format, force = false) {
        const mp3Option = this.elements.formatMp3;
        const wavOption = this.elements.formatWav;
        
        if (!mp3Option || !wavOption) {
            console.warn('Format options not found');
            return false;
        }
        
        if (format === 'mp3') {
            // Check if MP3 is available
            if (!this.canConvertToMp3() && !force) {
                console.warn('Cannot select MP3 format - FFmpeg not available');
                
                // Show notification about unavailability
                this.showFormatStatusNotification(
                    'MP3 format not available',
                    'warning',
                    'FFmpeg is required for MP3 conversion'
                );
                
                // Auto-select WAV instead
                wavOption.checked = true;
                mp3Option.checked = false;
                return false;
            }
            
            mp3Option.checked = true;
            wavOption.checked = false;
            return true;
            
        } else if (format === 'wav') {
            wavOption.checked = true;
            mp3Option.checked = false;
            return true;
        }
        
        console.warn(`Invalid format: ${format}`);
        return false;
    }
    
    /**
     * Get available output formats
     * @returns {Array<{value: string, label: string, available: boolean}>} Available formats
     */
    getAvailableFormats() {
        const mp3Available = this.canConvertToMp3();
        
        return [
            {
                value: 'wav',
                label: 'WAV (Uncompressed)',
                available: true,
                description: 'High quality uncompressed audio format'
            },
            {
                value: 'mp3',
                label: 'MP3 (Compressed)',
                available: mp3Available,
                description: mp3Available 
                    ? 'Compressed audio format with smaller file size'
                    : 'Requires FFmpeg for conversion',
                requiresFFmpeg: true
            }
        ];
    }
    
    /**
     * Validate format selection against current availability
     * @param {string} format - Format to validate
     * @returns {{valid: boolean, reason?: string, suggestedFormat?: string}}
     */
    validateFormatSelection(format) {
        if (format === 'wav') {
            return { valid: true };
        }
        
        if (format === 'mp3') {
            if (this.canConvertToMp3()) {
                return { valid: true };
            } else {
                return {
                    valid: false,
                    reason: 'FFmpeg is required for MP3 conversion but is not available',
                    suggestedFormat: 'wav'
                };
            }
        }
        
        return {
            valid: false,
            reason: `Invalid format: ${format}`,
            suggestedFormat: 'wav'
        };
    }
    
    /**
     * Get format selection recommendations based on current state
     * @returns {Object} Format recommendations
     */
    getFormatRecommendations() {
        const mp3Available = this.canConvertToMp3();
        
        return {
            recommended: mp3Available ? 'mp3' : 'wav',
            reasons: {
                mp3: mp3Available 
                    ? 'Smaller file size, good quality'
                    : 'Not available - FFmpeg required',
                wav: 'Always available, highest quality, larger file size'
            },
            ffmpegStatus: {
                available: this.state.ffmpegAvailable,
                source: this.state.ffmpegSource,
                validated: this.state.ffmpegValidated
            }
        };
    }
    
    /**
     * Add event listener for state changes
     * @param {string} event - Event type ('voice', 'ffmpeg', 'outputFolder', 'initialization', 'ready')
     * @param {Function} callback - Callback function
     */
    addEventListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }
    
    /**
     * Remove event listener
     * @param {string} event - Event type
     * @param {Function} callback - Callback function to remove
     */
    removeEventListener(event, callback) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.delete(callback);
        }
    }
    
    /**
     * Notify listeners of state changes
     * @param {string} event - Event type
     * @param {Object} previousState - Previous state
     * @param {Object} currentState - Current state
     */
    notifyStateChange(event, previousState, currentState) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => {
                try {
                    callback(currentState, previousState);
                } catch (error) {
                    console.error(`Error in state change listener for ${event}:`, error);
                }
            });
        }
        
        // Also notify general 'stateChange' listeners
        const generalListeners = this.listeners.get('stateChange');
        if (generalListeners) {
            generalListeners.forEach(callback => {
                try {
                    callback(event, currentState, previousState);
                } catch (error) {
                    console.error('Error in general state change listener:', error);
                }
            });
        }
    }
    
    /**
     * Notify action listeners (for user interactions)
     * @param {string} action - Action type
     * @param {Object} data - Action data
     */
    notifyAction(action, data = null) {
        const actionListeners = this.listeners.get('action');
        if (actionListeners) {
            actionListeners.forEach(callback => {
                try {
                    callback(action, data);
                } catch (error) {
                    console.error(`Error in action listener for ${action}:`, error);
                }
            });
        }
    }
    
    /**
     * Update or create voice loading indicator
     */
    updateVoiceLoadingIndicator() {
        const voiceContainer = this.elements.voiceSelect?.parentElement;
        if (!voiceContainer) return;
        
        let loadingIndicator = voiceContainer.querySelector('.voice-loading-indicator');
        
        if (this.state.voicesLoading) {
            if (!loadingIndicator) {
                loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'voice-loading-indicator';
                voiceContainer.appendChild(loadingIndicator);
            }
            
            let indicatorText = 'Detecting available voices...';
            if (this.state.voiceLoadAttempts > 0) {
                indicatorText = `Retrying voice detection... (attempt ${this.state.voiceLoadAttempts})`;
            }
            
            loadingIndicator.innerHTML = `
                <div class="loading-content">
                    <span class="loading-spinner"></span>
                    <span class="loading-text">${indicatorText}</span>
                </div>
            `;
            loadingIndicator.style.display = 'block';
        } else if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
    
    /**
     * Update or create FFmpeg status indicator
     */
    updateFFmpegStatusIndicator(available, helpText = '') {
        const formatContainer = this.elements.formatMp3?.closest('.radio-group');
        if (!formatContainer) return;
        
        let statusIndicator = formatContainer.querySelector('.ffmpeg-status-indicator');
        
        if (!available || helpText) {
            if (!statusIndicator) {
                statusIndicator = document.createElement('div');
                statusIndicator.className = 'ffmpeg-status-indicator';
                formatContainer.appendChild(statusIndicator);
            }
            
            if (available) {
                // Show positive status
                statusIndicator.innerHTML = `
                    <div class="status-content status-success">
                        <span class="status-icon">✓</span>
                        <span class="status-text">FFmpeg available (${this.state.ffmpegSource})</span>
                    </div>
                `;
            } else {
                // Show warning/error status
                statusIndicator.innerHTML = `
                    <div class="status-content status-warning">
                        <span class="status-icon">⚠️</span>
                        <span class="status-text">${helpText || 'MP3 format unavailable'}</span>
                    </div>
                `;
            }
            statusIndicator.style.display = 'block';
        } else if (statusIndicator) {
            statusIndicator.style.display = 'none';
        }
    }
    
    /**
     * Update initialization loading indicators
     */
    updateInitializationIndicators() {
        const statusText = this.elements.statusText;
        if (!statusText) return;
        
        if (this.state.initializing) {
            // Show detailed initialization status
            let initStatus = [];
            
            if (this.state.voicesLoading) {
                initStatus.push('Loading voices');
            } else if (this.state.voicesLoaded) {
                initStatus.push('✓ Voices loaded');
            } else if (this.state.voiceLoadError) {
                initStatus.push('⚠️ Voice loading failed');
            }
            
            if (this.state.ffmpegAvailable) {
                initStatus.push(`✓ FFmpeg ready (${this.state.ffmpegSource})`);
            } else {
                initStatus.push('⚠️ FFmpeg unavailable');
            }
            
            if (this.state.defaultOutputFolder) {
                initStatus.push('✓ Output folder ready');
            }
            
            if (initStatus.length > 0) {
                statusText.textContent = `Initializing: ${initStatus.join(', ')}`;
            } else {
                statusText.textContent = 'Initializing application...';
            }
        }
    }
    
    /**
     * Reset state to initial values
     */
    reset() {
        this.state = {
            voicesLoaded: false,
            voicesLoading: false,
            voiceLoadAttempts: 0,
            voiceLoadError: null,
            voices: [],
            ffmpegAvailable: false,
            ffmpegSource: 'none',
            ffmpegValidated: false,
            outputFolderSet: false,
            defaultOutputFolder: null,
            ready: false,
            initializing: true,
            showRetryButton: false,
            showTroubleshooting: false,
            loadingMessage: 'Initializing application...',
            readyIndicator: false
        };
        
        this.updateUI();
    }

    /**
     * Implement graceful degradation when features are unavailable
     * Requirement 6.4: Implement graceful degradation when features are unavailable
     */
    handleFeatureDegradation(feature, reason, fallbackOptions = {}) {
        const degradationStrategies = {
            mp3_conversion: {
                fallbackMessage: 'MP3 conversion unavailable. Using WAV format instead.',
                fallbackAction: () => {
                    const wavOption = document.querySelector('input[name="outputFormat"][value="wav"]');
                    if (wavOption) {
                        wavOption.checked = true;
                        wavOption.dispatchEvent(new Event('change'));
                    }
                },
                userGuidance: [
                    'WAV format provides excellent audio quality',
                    'Install FFmpeg to enable MP3 conversion',
                    'WAV files work on all audio players'
                ]
            },
            
            voice_loading: {
                fallbackMessage: 'Voice loading failed. Using system default voice.',
                fallbackAction: () => {
                    const voiceSelect = document.getElementById('voiceSelect');
                    if (voiceSelect && voiceSelect.options.length > 0) {
                        voiceSelect.selectedIndex = 0;
                        voiceSelect.dispatchEvent(new Event('change'));
                    }
                },
                userGuidance: [
                    'System default voice will be used for conversion',
                    'Check Windows Speech settings to install more voices',
                    'Restart the application to retry voice detection'
                ]
            },
            
            output_folder: {
                fallbackMessage: 'Selected output folder unavailable. Using default location.',
                fallbackAction: () => {
                    const outputFolder = document.getElementById('outputFolder');
                    if (outputFolder) {
                        outputFolder.value = '';
                        outputFolder.placeholder = `Default: ${this.state.defaultOutputFolder || 'Documents'}`;
                    }
                },
                userGuidance: [
                    'Files will be saved to the default Documents folder',
                    'Select a different output folder if needed',
                    'Check folder permissions if access is denied'
                ]
            },
            
            large_text_processing: {
                fallbackMessage: 'Text too large for optimal processing. Consider splitting into smaller sections.',
                fallbackAction: () => {
                    // Show text splitting guidance
                    this.showTextSplittingGuidance();
                },
                userGuidance: [
                    'Split large text into smaller sections (under 5000 characters)',
                    'Process each section separately for better performance',
                    'Use WAV format for large files to avoid conversion overhead'
                ]
            }
        };

        const strategy = degradationStrategies[feature];
        if (!strategy) {
            console.warn(`No degradation strategy found for feature: ${feature}`);
            return;
        }

        // Execute fallback action
        if (strategy.fallbackAction) {
            try {
                strategy.fallbackAction();
            } catch (error) {
                console.error(`Fallback action failed for ${feature}:`, error);
            }
        }

        // Show user notification with guidance
        this.showDegradationNotification(
            strategy.fallbackMessage,
            strategy.userGuidance,
            reason,
            fallbackOptions
        );

        // Log degradation event
        this.logDegradationEvent(feature, reason, strategy);
    }

    /**
     * Show degradation notification with user guidance
     */
    showDegradationNotification(message, guidance, reason, options = {}) {
        // Create degradation notification
        const notification = document.createElement('div');
        notification.className = 'degradation-notification';
        notification.innerHTML = `
            <div class="degradation-content">
                <div class="degradation-header">
                    <span class="degradation-icon">ℹ️</span>
                    <span class="degradation-title">Feature Unavailable</span>
                    <button class="degradation-close">×</button>
                </div>
                <div class="degradation-message">${message}</div>
                <div class="degradation-reason">Reason: ${reason}</div>
                <div class="degradation-guidance">
                    <h4>What you can do:</h4>
                    <ul>
                        ${guidance.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
                <div class="degradation-actions">
                    ${options.showRetry ? '<button class="btn-secondary degradation-retry">Retry</button>' : ''}
                    ${options.showSettings ? '<button class="btn-secondary degradation-settings">Settings</button>' : ''}
                    <button class="btn-primary degradation-continue">Continue</button>
                </div>
            </div>
        `;

        // Position and show notification
        document.body.appendChild(notification);
        
        // Setup event listeners
        notification.querySelector('.degradation-close').addEventListener('click', () => {
            notification.remove();
        });
        
        notification.querySelector('.degradation-continue').addEventListener('click', () => {
            notification.remove();
        });
        
        if (options.showRetry) {
            notification.querySelector('.degradation-retry').addEventListener('click', () => {
                notification.remove();
                if (options.retryCallback) {
                    options.retryCallback();
                }
            });
        }
        
        if (options.showSettings) {
            notification.querySelector('.degradation-settings').addEventListener('click', () => {
                notification.remove();
                if (options.settingsCallback) {
                    options.settingsCallback();
                }
            });
        }

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 10000);

        // Animate in
        setTimeout(() => notification.classList.add('show'), 100);
    }

    /**
     * Show text splitting guidance
     */
    showTextSplittingGuidance() {
        const guidance = document.createElement('div');
        guidance.className = 'text-splitting-guidance';
        guidance.innerHTML = `
            <div class="guidance-content">
                <h4>Text Splitting Tips</h4>
                <ul>
                    <li>Split at natural breaks (paragraphs, sentences)</li>
                    <li>Keep each section under 5000 characters</li>
                    <li>Process sections individually for better performance</li>
                    <li>Use WAV format for large files to reduce processing time</li>
                </ul>
                <button class="btn-primary guidance-close">Got it</button>
            </div>
        `;

        document.body.appendChild(guidance);
        
        guidance.querySelector('.guidance-close').addEventListener('click', () => {
            guidance.remove();
        });

        setTimeout(() => guidance.classList.add('show'), 100);
    }

    /**
     * Log degradation event for analytics
     */
    logDegradationEvent(feature, reason, strategy) {
        const event = {
            timestamp: new Date().toISOString(),
            feature,
            reason,
            strategy: strategy.fallbackMessage,
            userAgent: navigator.userAgent,
            appState: {
                voicesLoaded: this.state.voicesLoaded,
                ffmpegAvailable: this.state.ffmpegAvailable,
                ready: this.state.ready
            }
        };

        // Log to console for development
        console.log('Feature degradation event:', event);

        // Could be sent to analytics service in production
        if (window.electronAPI && window.electronAPI.logAnalytics) {
            window.electronAPI.logAnalytics('feature_degradation', event);
        }
    }

    /**
     * Check if graceful degradation is needed for current state
     */
    checkForDegradationNeeds() {
        // Check MP3 conversion availability
        if (!this.canConvertToMp3()) {
            const mp3Option = document.querySelector('input[name="outputFormat"][value="mp3"]');
            if (mp3Option && mp3Option.checked) {
                this.handleFeatureDegradation(
                    'mp3_conversion',
                    'FFmpeg not available',
                    { showRetry: false, showSettings: true }
                );
            }
        }

        // Check voice availability
        if (!this.state.voicesLoaded && !this.state.voicesLoading) {
            this.handleFeatureDegradation(
                'voice_loading',
                'No TTS voices detected',
                { 
                    showRetry: true, 
                    retryCallback: () => this.notifyAction('retryVoiceLoading')
                }
            );
        }

        // Check output folder availability
        if (!this.state.outputFolderSet && !this.state.defaultOutputFolder) {
            this.handleFeatureDegradation(
                'output_folder',
                'No writable output location found',
                { 
                    showSettings: true,
                    settingsCallback: () => {
                        const selectFolderBtn = document.getElementById('selectFolderBtn');
                        if (selectFolderBtn) selectFolderBtn.click();
                    }
                }
            );
        }
    }
}

// Export for use in other modules
export default StateManager;