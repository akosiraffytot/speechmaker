/**
 * Error Display Component
 * Provides user-friendly error messages with troubleshooting guidance
 * Requirements: 2.3, 2.4, 6.3, 6.4 - Enhanced error recovery and user guidance
 */
class ErrorDisplay {
    constructor() {
        this.errorContainer = null;
        this.currentError = null;
        this.retryCallback = null;
        this.retryAttempts = new Map();
        this.maxRetryAttempts = 3;
        this.guidanceHistory = [];
        this.activeToasts = new Set();
        
        this.createErrorContainer();
        this.setupEventListeners();
        this.initializeGracefulDegradation();
    }

    /**
     * Create the error display container
     */
    createErrorContainer() {
        // Create error overlay
        this.errorContainer = document.createElement('div');
        this.errorContainer.className = 'error-overlay hidden';
        this.errorContainer.innerHTML = `
            <div class="error-modal">
                <div class="error-header">
                    <span class="error-icon">⚠️</span>
                    <h3 class="error-title">Error</h3>
                    <button class="error-close" aria-label="Close error dialog">×</button>
                </div>
                <div class="error-content">
                    <p class="error-message"></p>
                    <div class="error-details hidden">
                        <h4>Troubleshooting Steps:</h4>
                        <ul class="error-troubleshooting"></ul>
                    </div>
                    <div class="error-technical hidden">
                        <h4>Technical Details:</h4>
                        <pre class="error-technical-info"></pre>
                    </div>
                </div>
                <div class="error-actions">
                    <button class="btn-secondary error-details-toggle">Show Details</button>
                    <button class="btn-secondary error-copy">Copy Error Info</button>
                    <button class="btn-primary error-retry hidden">Retry</button>
                    <button class="btn-primary error-ok">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.errorContainer);
    }

    /**
     * Set up event listeners for error dialog
     */
    setupEventListeners() {
        // Close button
        this.errorContainer.querySelector('.error-close').addEventListener('click', () => {
            this.hideError();
        });

        // OK button
        this.errorContainer.querySelector('.error-ok').addEventListener('click', () => {
            this.hideError();
        });

        // Retry button
        this.errorContainer.querySelector('.error-retry').addEventListener('click', () => {
            this.hideError();
            if (this.retryCallback) {
                this.retryCallback();
            }
        });

        // Details toggle
        this.errorContainer.querySelector('.error-details-toggle').addEventListener('click', (e) => {
            const detailsDiv = this.errorContainer.querySelector('.error-details');
            const technicalDiv = this.errorContainer.querySelector('.error-technical');
            const isHidden = detailsDiv.classList.contains('hidden');
            
            if (isHidden) {
                detailsDiv.classList.remove('hidden');
                technicalDiv.classList.remove('hidden');
                e.target.textContent = 'Hide Details';
            } else {
                detailsDiv.classList.add('hidden');
                technicalDiv.classList.add('hidden');
                e.target.textContent = 'Show Details';
            }
        });

        // Copy error info
        this.errorContainer.querySelector('.error-copy').addEventListener('click', () => {
            this.copyErrorInfo();
        });

        // Close on overlay click
        this.errorContainer.addEventListener('click', (e) => {
            if (e.target === this.errorContainer) {
                this.hideError();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.errorContainer.classList.contains('hidden')) {
                this.hideError();
            }
        });
    }

    /**
     * Display an error with enhanced information
     */
    showError(error, retryCallback = null) {
        this.currentError = error;
        this.retryCallback = retryCallback;

        // Set error icon based on severity
        const iconElement = this.errorContainer.querySelector('.error-icon');
        const titleElement = this.errorContainer.querySelector('.error-title');
        
        switch (error.severity) {
            case 'critical':
                iconElement.textContent = '🚨';
                titleElement.textContent = 'Critical Error';
                break;
            case 'warning':
                iconElement.textContent = '⚠️';
                titleElement.textContent = 'Warning';
                break;
            default:
                iconElement.textContent = '❌';
                titleElement.textContent = 'Error';
        }

        // Set error message
        const messageElement = this.errorContainer.querySelector('.error-message');
        messageElement.textContent = error.userMessage || error.message || 'An unexpected error occurred.';

        // Set troubleshooting steps
        const troubleshootingList = this.errorContainer.querySelector('.error-troubleshooting');
        troubleshootingList.innerHTML = '';
        
        if (error.troubleshooting && error.troubleshooting.length > 0) {
            error.troubleshooting.forEach(step => {
                const li = document.createElement('li');
                li.textContent = step;
                troubleshootingList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'Try restarting the application';
            troubleshootingList.appendChild(li);
        }

        // Set technical details
        const technicalInfo = this.errorContainer.querySelector('.error-technical-info');
        const technicalDetails = {
            timestamp: error.timestamp || new Date().toISOString(),
            category: error.category || 'unknown',
            code: error.code || 'N/A',
            operation: error.context?.operation || 'unknown'
        };
        
        if (process.env.NODE_ENV === 'development' && error.stack) {
            technicalDetails.stack = error.stack;
        }
        
        technicalInfo.textContent = JSON.stringify(technicalDetails, null, 2);

        // Show/hide retry button
        const retryButton = this.errorContainer.querySelector('.error-retry');
        if (error.canRetry && retryCallback) {
            retryButton.classList.remove('hidden');
        } else {
            retryButton.classList.add('hidden');
        }

        // Show installation guide for FFmpeg errors
        if (error.installationGuide) {
            this.showInstallationGuide(error.installationGuide);
        }

        // Show the error dialog
        this.errorContainer.classList.remove('hidden');
        
        // Focus the OK button for accessibility
        setTimeout(() => {
            const okButton = this.errorContainer.querySelector('.error-ok');
            okButton.focus();
        }, 100);
    }

    /**
     * Show installation guide for FFmpeg
     */
    showInstallationGuide(guide) {
        const detailsDiv = this.errorContainer.querySelector('.error-details');
        
        // Add installation guide section
        const guideSection = document.createElement('div');
        guideSection.className = 'installation-guide';
        guideSection.innerHTML = `
            <h4>${guide.title}</h4>
            <ol class="installation-steps">
                ${guide.steps.map(step => `<li>${step}</li>`).join('')}
            </ol>
            <div class="installation-links">
                <button class="btn-link" onclick="window.electronAPI.openExternal('https://ffmpeg.org/download.html')">
                    Download FFmpeg
                </button>
                <button class="btn-link" onclick="window.electronAPI.openExternal('https://www.wikihow.com/Install-FFmpeg-on-Windows')">
                    Installation Guide
                </button>
            </div>
        `;
        
        detailsDiv.appendChild(guideSection);
    }

    /**
     * Hide the error dialog
     */
    hideError() {
        this.errorContainer.classList.add('hidden');
        this.currentError = null;
        this.retryCallback = null;
        
        // Remove any installation guide
        const guideSection = this.errorContainer.querySelector('.installation-guide');
        if (guideSection) {
            guideSection.remove();
        }
        
        // Reset details toggle
        const detailsDiv = this.errorContainer.querySelector('.error-details');
        const technicalDiv = this.errorContainer.querySelector('.error-technical');
        const toggleButton = this.errorContainer.querySelector('.error-details-toggle');
        
        detailsDiv.classList.add('hidden');
        technicalDiv.classList.add('hidden');
        toggleButton.textContent = 'Show Details';
    }

    /**
     * Copy error information to clipboard
     */
    async copyErrorInfo() {
        if (!this.currentError) return;

        const errorInfo = {
            message: this.currentError.userMessage || this.currentError.message,
            timestamp: this.currentError.timestamp || new Date().toISOString(),
            category: this.currentError.category,
            troubleshooting: this.currentError.troubleshooting,
            context: this.currentError.context
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(errorInfo, null, 2));
            
            // Show temporary feedback
            const copyButton = this.errorContainer.querySelector('.error-copy');
            const originalText = copyButton.textContent;
            copyButton.textContent = 'Copied!';
            copyButton.disabled = true;
            
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Failed to copy error info:', error);
        }
    }

    /**
     * Initialize graceful degradation mechanisms
     * Requirement 6.4: Implement graceful degradation when features are unavailable
     */
    initializeGracefulDegradation() {
        this.degradationStrategies = {
            voiceLoadingFailed: {
                fallbackMessage: 'Voice loading failed, but you can still use the application with manual voice selection.',
                actions: ['retry_voice_loading', 'use_system_default', 'manual_voice_entry']
            },
            ffmpegUnavailable: {
                fallbackMessage: 'MP3 conversion unavailable. WAV format will be used instead.',
                actions: ['install_ffmpeg', 'continue_with_wav', 'learn_more']
            },
            outputFolderInaccessible: {
                fallbackMessage: 'Selected output folder is inaccessible. Using default location.',
                actions: ['select_new_folder', 'use_default', 'check_permissions']
            }
        };
    }

    /**
     * Show enhanced error toast with recovery options
     * Requirement 2.4: Add manual retry functionality for failed operations
     */
    showErrorToast(message, duration = 5000, options = {}) {
        const toastId = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create toast with enhanced functionality
        const toast = document.createElement('div');
        toast.className = `error-toast ${options.type || 'error'}`;
        toast.setAttribute('data-toast-id', toastId);
        
        const hasActions = options.actions && options.actions.length > 0;
        
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${this.getToastIcon(options.type)}</span>
                <div class="toast-text">
                    <span class="toast-message">${message}</span>
                    ${options.details ? `<div class="toast-details">${options.details}</div>` : ''}
                </div>
                <div class="toast-controls">
                    ${hasActions ? this.createToastActions(options.actions) : ''}
                    <button class="toast-close" aria-label="Close">×</button>
                </div>
            </div>
            ${options.progress ? '<div class="toast-progress"><div class="toast-progress-bar"></div></div>' : ''}
        `;

        // Position toast to avoid overlap
        this.positionToast(toast);
        document.body.appendChild(toast);
        this.activeToasts.add(toastId);

        // Setup event listeners
        this.setupToastEventListeners(toast, toastId, options);

        // Handle progress updates
        if (options.progress) {
            this.updateToastProgress(toast, 0);
        }

        // Auto-remove after duration (unless it has actions)
        if (!hasActions) {
            setTimeout(() => {
                this.removeToast(toastId);
            }, duration);
        }

        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        return toastId;
    }

    /**
     * Get appropriate icon for toast type
     */
    getToastIcon(type) {
        const icons = {
            error: '❌',
            warning: '⚠️',
            success: '✅',
            info: 'ℹ️',
            retry: '🔄',
            loading: '⏳'
        };
        return icons[type] || icons.error;
    }

    /**
     * Create action buttons for toast
     */
    createToastActions(actions) {
        return actions.map(action => {
            const actionConfig = this.getActionConfig(action);
            return `<button class="toast-action" data-action="${action.id || action}" title="${actionConfig.tooltip || ''}">
                ${actionConfig.label}
            </button>`;
        }).join('');
    }

    /**
     * Get configuration for action buttons
     */
    getActionConfig(action) {
        const actionId = action.id || action;
        const configs = {
            retry: { label: 'Retry', tooltip: 'Try the operation again' },
            retry_voice_loading: { label: 'Retry Voices', tooltip: 'Reload voice list' },
            use_system_default: { label: 'Use Default', tooltip: 'Use system default voice' },
            install_ffmpeg: { label: 'Install FFmpeg', tooltip: 'Get installation instructions' },
            continue_with_wav: { label: 'Use WAV', tooltip: 'Continue with WAV format' },
            select_new_folder: { label: 'Select Folder', tooltip: 'Choose a different output folder' },
            use_default: { label: 'Use Default', tooltip: 'Use default output location' },
            learn_more: { label: 'Learn More', tooltip: 'Get more information' },
            dismiss: { label: 'Dismiss', tooltip: 'Close this notification' }
        };
        
        return configs[actionId] || { label: actionId, tooltip: '' };
    }

    /**
     * Position toast to avoid overlapping with existing toasts
     */
    positionToast(toast) {
        const existingToasts = document.querySelectorAll('.error-toast.show');
        let topOffset = 20; // Base offset from top
        
        existingToasts.forEach(existingToast => {
            const rect = existingToast.getBoundingClientRect();
            topOffset = Math.max(topOffset, rect.bottom + 10);
        });
        
        toast.style.top = `${topOffset}px`;
    }

    /**
     * Setup event listeners for toast
     */
    setupToastEventListeners(toast, toastId, options) {
        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.removeToast(toastId);
        });

        // Action buttons
        toast.querySelectorAll('.toast-action').forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.target.getAttribute('data-action');
                this.handleToastAction(action, options, toastId);
            });
        });

        // Auto-dismiss on click (for simple toasts)
        if (!options.actions || options.actions.length === 0) {
            toast.addEventListener('click', () => {
                this.removeToast(toastId);
            });
        }
    }

    /**
     * Handle toast action button clicks
     * Requirement 2.4: Add manual retry functionality for failed operations
     */
    async handleToastAction(action, options, toastId) {
        try {
            switch (action) {
                case 'retry':
                case 'retry_voice_loading':
                    await this.handleRetryAction(options.retryCallback, toastId);
                    break;
                    
                case 'use_system_default':
                    this.handleUseSystemDefault();
                    this.removeToast(toastId);
                    break;
                    
                case 'install_ffmpeg':
                    this.handleInstallFFmpeg();
                    break;
                    
                case 'continue_with_wav':
                    this.handleContinueWithWav();
                    this.removeToast(toastId);
                    break;
                    
                case 'select_new_folder':
                    await this.handleSelectNewFolder();
                    this.removeToast(toastId);
                    break;
                    
                case 'use_default':
                    this.handleUseDefaultFolder();
                    this.removeToast(toastId);
                    break;
                    
                case 'learn_more':
                    this.handleLearnMore(options.learnMoreUrl);
                    break;
                    
                case 'dismiss':
                    this.removeToast(toastId);
                    break;
                    
                default:
                    if (options.customActionHandler) {
                        await options.customActionHandler(action);
                        this.removeToast(toastId);
                    }
            }
        } catch (error) {
            console.error('Error handling toast action:', error);
            this.showErrorToast('Action failed: ' + error.message, 3000);
        }
    }

    /**
     * Handle retry action with attempt tracking
     */
    async handleRetryAction(retryCallback, toastId) {
        if (!retryCallback) return;
        
        const retryKey = retryCallback.name || 'unknown_operation';
        const attempts = this.retryAttempts.get(retryKey) || 0;
        
        if (attempts >= this.maxRetryAttempts) {
            this.showErrorToast(
                `Maximum retry attempts (${this.maxRetryAttempts}) reached for this operation.`,
                5000,
                {
                    type: 'warning',
                    actions: [{ id: 'dismiss', label: 'OK' }]
                }
            );
            this.removeToast(toastId);
            return;
        }
        
        // Update retry count
        this.retryAttempts.set(retryKey, attempts + 1);
        
        // Show retry progress
        this.updateToastForRetry(toastId, attempts + 1);
        
        try {
            await retryCallback();
            // Success - reset retry count
            this.retryAttempts.delete(retryKey);
            this.removeToast(toastId);
            
            this.showErrorToast(
                'Operation completed successfully!',
                3000,
                { type: 'success' }
            );
        } catch (error) {
            // Retry failed
            this.showErrorToast(
                `Retry ${attempts + 1} failed: ${error.message}`,
                4000,
                {
                    type: 'error',
                    actions: attempts + 1 < this.maxRetryAttempts ? 
                        [{ id: 'retry', label: `Retry (${this.maxRetryAttempts - attempts - 1} left)` }] : 
                        [{ id: 'dismiss', label: 'Give Up' }],
                    retryCallback
                }
            );
            this.removeToast(toastId);
        }
    }

    /**
     * Update toast to show retry progress
     */
    updateToastForRetry(toastId, attempt) {
        const toast = document.querySelector(`[data-toast-id="${toastId}"]`);
        if (!toast) return;
        
        const messageElement = toast.querySelector('.toast-message');
        if (messageElement) {
            messageElement.textContent = `Retrying operation... (attempt ${attempt}/${this.maxRetryAttempts})`;
        }
        
        // Add loading indicator
        const icon = toast.querySelector('.toast-icon');
        if (icon) {
            icon.textContent = '⏳';
        }
        
        // Disable action buttons temporarily
        toast.querySelectorAll('.toast-action').forEach(button => {
            button.disabled = true;
        });
        
        // Re-enable after a short delay
        setTimeout(() => {
            toast.querySelectorAll('.toast-action').forEach(button => {
                button.disabled = false;
            });
        }, 2000);
    }

    /**
     * Handle use system default voice action
     */
    handleUseSystemDefault() {
        const voiceSelect = document.getElementById('voiceSelect');
        if (voiceSelect && voiceSelect.options.length > 0) {
            voiceSelect.selectedIndex = 0;
            voiceSelect.dispatchEvent(new Event('change'));
            
            this.showErrorToast(
                'Using system default voice',
                3000,
                { type: 'success' }
            );
        }
    }

    /**
     * Handle install FFmpeg action
     */
    handleInstallFFmpeg() {
        const installationGuide = {
            title: 'FFmpeg Installation Guide',
            message: 'FFmpeg is required for MP3 conversion. Follow these steps to install it:',
            steps: [
                'Visit https://ffmpeg.org/download.html',
                'Download the Windows build (static version recommended)',
                'Extract to C:\\ffmpeg (or your preferred location)',
                'Add C:\\ffmpeg\\bin to your system PATH',
                'Restart SpeechMaker application',
                'Test MP3 conversion'
            ],
            links: [
                { label: 'Download FFmpeg', url: 'https://ffmpeg.org/download.html' },
                { label: 'Installation Tutorial', url: 'https://www.wikihow.com/Install-FFmpeg-on-Windows' }
            ]
        };
        
        this.showInstallationModal(installationGuide);
    }

    /**
     * Handle continue with WAV action
     */
    handleContinueWithWav() {
        const wavRadio = document.querySelector('input[name="outputFormat"][value="wav"]');
        if (wavRadio) {
            wavRadio.checked = true;
            wavRadio.dispatchEvent(new Event('change'));
            
            this.showErrorToast(
                'Switched to WAV format - no FFmpeg required',
                3000,
                { type: 'success' }
            );
        }
    }

    /**
     * Handle select new folder action
     */
    async handleSelectNewFolder() {
        try {
            const result = await window.electronAPI.selectOutputFolder();
            if (result && result.folderPath) {
                const outputFolder = document.getElementById('outputFolder');
                if (outputFolder) {
                    outputFolder.value = result.folderPath;
                    outputFolder.dispatchEvent(new Event('change'));
                }
                
                this.showErrorToast(
                    'Output folder updated successfully',
                    3000,
                    { type: 'success' }
                );
            }
        } catch (error) {
            this.showErrorToast(
                'Failed to select folder: ' + error.message,
                4000,
                { type: 'error' }
            );
        }
    }

    /**
     * Handle use default folder action
     */
    handleUseDefaultFolder() {
        const outputFolder = document.getElementById('outputFolder');
        if (outputFolder) {
            outputFolder.value = '';
            outputFolder.dispatchEvent(new Event('change'));
            
            this.showErrorToast(
                'Using default output folder',
                3000,
                { type: 'success' }
            );
        }
    }

    /**
     * Handle learn more action
     */
    handleLearnMore(url) {
        if (url) {
            window.electronAPI.openExternal(url);
        } else {
            // Show general help
            this.showHelpModal();
        }
    }

    /**
     * Update toast progress bar
     */
    updateToastProgress(toast, progress) {
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        }
    }

    /**
     * Remove toast by ID
     */
    removeToast(toastId) {
        const toast = document.querySelector(`[data-toast-id="${toastId}"]`);
        if (toast) {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
                this.activeToasts.delete(toastId);
                this.repositionToasts();
            }, 300);
        }
    }

    /**
     * Reposition remaining toasts after one is removed
     */
    repositionToasts() {
        const toasts = document.querySelectorAll('.error-toast.show');
        let topOffset = 20;
        
        toasts.forEach(toast => {
            toast.style.top = `${topOffset}px`;
            const rect = toast.getBoundingClientRect();
            topOffset = rect.bottom + 10;
        });
    }

    /**
     * Show installation modal for detailed guidance
     */
    showInstallationModal(guide) {
        const modal = document.createElement('div');
        modal.className = 'installation-modal-overlay';
        modal.innerHTML = `
            <div class="installation-modal">
                <div class="installation-header">
                    <h3>${guide.title}</h3>
                    <button class="installation-close">×</button>
                </div>
                <div class="installation-content">
                    <p>${guide.message}</p>
                    <ol class="installation-steps">
                        ${guide.steps.map(step => `<li>${step}</li>`).join('')}
                    </ol>
                    <div class="installation-links">
                        ${guide.links.map(link => 
                            `<button class="btn-link" data-url="${link.url}">${link.label}</button>`
                        ).join('')}
                    </div>
                </div>
                <div class="installation-actions">
                    <button class="btn-secondary installation-later">Maybe Later</button>
                    <button class="btn-primary installation-done">I've Installed FFmpeg</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event listeners
        modal.querySelector('.installation-close').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.querySelector('.installation-later').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.querySelector('.installation-done').addEventListener('click', async () => {
            modal.remove();
            // Test FFmpeg availability
            try {
                await window.electronAPI.testFFmpegAvailability();
                this.showErrorToast(
                    'FFmpeg installation verified! MP3 conversion is now available.',
                    5000,
                    { type: 'success' }
                );
            } catch (error) {
                this.showErrorToast(
                    'FFmpeg not detected. Please check your installation and PATH configuration.',
                    5000,
                    {
                        type: 'warning',
                        actions: [{ id: 'learn_more', label: 'Installation Help' }],
                        learnMoreUrl: 'https://www.wikihow.com/Install-FFmpeg-on-Windows'
                    }
                );
            }
        });
        
        // Handle link clicks
        modal.querySelectorAll('.btn-link').forEach(button => {
            button.addEventListener('click', (e) => {
                const url = e.target.getAttribute('data-url');
                window.electronAPI.openExternal(url);
            });
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * Show general help modal
     */
    showHelpModal() {
        const helpContent = {
            title: 'SpeechMaker Help',
            sections: [
                {
                    title: 'Voice Issues',
                    content: 'If voices are not loading, check Windows Speech settings and ensure TTS is enabled.'
                },
                {
                    title: 'File Format Support',
                    content: 'WAV format is always available. MP3 requires FFmpeg installation.'
                },
                {
                    title: 'Output Folder',
                    content: 'Select a writable folder for output files. Default location is Documents/SpeechMaker.'
                }
            ]
        };
        
        // Implementation would show a help modal with the content
        console.log('Help modal would show:', helpContent);
    }

    /**
     * Show retry notification
     */
    showRetryNotification(attempt, maxRetries, delay) {
        const message = `Retrying... (${attempt}/${maxRetries}) - Next attempt in ${Math.ceil(delay/1000)}s`;
        this.showErrorToast(message, delay);
    }

    /**
     * Handle TTS voice errors specifically with enhanced guidance
     * Requirement 2.3, 2.4: Enhanced error recovery and user guidance
     */
    handleTTSVoiceError(error, retryCallback) {
        // Enhanced error handling with comprehensive recovery options
        const enhancedError = {
            ...error,
            category: 'tts_voice',
            timestamp: new Date().toISOString()
        };

        // Add specific actions for TTS voice errors
        if (error.suggestedAction === 'install_voices') {
            const enhancedRetryCallback = () => {
                // Open Windows Speech settings
                window.electronAPI.openExternal('ms-settings:speech');
                if (retryCallback) retryCallback();
            };
            this.showError(enhancedError, enhancedRetryCallback);
            
            // Show additional guidance toast
            this.showErrorToast(
                'Voice installation required',
                8000,
                {
                    type: 'warning',
                    actions: [
                        { id: 'install_voices', label: 'Open Speech Settings' },
                        { id: 'learn_more', label: 'Installation Guide' }
                    ],
                    customActionHandler: async (action) => {
                        if (action === 'install_voices') {
                            window.electronAPI.openExternal('ms-settings:speech');
                        } else if (action === 'learn_more') {
                            this.showVoiceInstallationGuide();
                        }
                    },
                    details: 'Windows TTS voices are required for speech synthesis'
                }
            );
        } else if (error.suggestedAction === 'retry') {
            // Show retry guidance with attempt tracking
            this.showError(enhancedError, retryCallback);
            
            const attempts = error.context?.attempts || 1;
            const maxAttempts = error.context?.maxAttempts || 3;
            
            if (attempts < maxAttempts) {
                this.showErrorToast(
                    `Voice loading failed (attempt ${attempts}/${maxAttempts})`,
                    5000,
                    {
                        type: 'error',
                        actions: [
                            { id: 'retry_voice_loading', label: `Retry (${maxAttempts - attempts} left)` },
                            { id: 'use_system_default', label: 'Use Default Voice' }
                        ],
                        retryCallback,
                        details: 'Retrying with exponential backoff delay'
                    }
                );
            } else {
                this.showErrorToast(
                    'Voice loading failed after multiple attempts',
                    7000,
                    {
                        type: 'warning',
                        actions: [
                            { id: 'use_system_default', label: 'Use Default Voice' },
                            { id: 'install_voices', label: 'Check Voice Settings' }
                        ],
                        customActionHandler: async (action) => {
                            if (action === 'install_voices') {
                                window.electronAPI.openExternal('ms-settings:speech');
                            }
                        },
                        details: 'Consider checking Windows Speech settings'
                    }
                );
            }
        } else {
            this.showError(enhancedError, retryCallback);
        }
    }

    /**
     * Handle file errors specifically with enhanced guidance
     * Requirement 2.3, 2.4: Enhanced error recovery and user guidance
     */
    handleFileError(error, retryCallback) {
        const enhancedError = {
            ...error,
            category: 'file',
            timestamp: new Date().toISOString()
        };

        let enhancedRetryCallback = retryCallback;
        let toastActions = [];

        // Add specific actions based on suggested action
        switch (error.suggestedAction) {
            case 'browse_file':
                enhancedRetryCallback = () => {
                    // Trigger file selection
                    const selectFileBtn = document.getElementById('selectFileBtn');
                    if (selectFileBtn) {
                        selectFileBtn.click();
                    }
                };
                toastActions = [
                    { id: 'browse_file', label: 'Select Different File' },
                    { id: 'dismiss', label: 'Cancel' }
                ];
                break;
                
            case 'select_folder':
                enhancedRetryCallback = () => {
                    // Trigger folder selection
                    const selectFolderBtn = document.getElementById('selectFolderBtn');
                    if (selectFolderBtn) {
                        selectFolderBtn.click();
                    }
                };
                toastActions = [
                    { id: 'select_new_folder', label: 'Select Different Folder' },
                    { id: 'use_default', label: 'Use Default Location' }
                ];
                break;
                
            case 'check_permissions':
                toastActions = [
                    { id: 'retry', label: 'Retry Access' },
                    { id: 'browse_file', label: 'Select Different File' }
                ];
                break;
                
            case 'convert_file':
                toastActions = [
                    { id: 'browse_file', label: 'Select TXT File' },
                    { id: 'learn_more', label: 'File Format Help' }
                ];
                break;
                
            case 'split_file':
                toastActions = [
                    { id: 'browse_file', label: 'Select Smaller File' },
                    { id: 'learn_more', label: 'File Size Help' }
                ];
                break;
                
            default:
                toastActions = [
                    { id: 'retry', label: 'Retry' },
                    { id: 'dismiss', label: 'Cancel' }
                ];
        }

        this.showError(enhancedError, enhancedRetryCallback);
        
        // Show contextual toast with recovery actions
        this.showErrorToast(
            error.userMessage || 'File operation failed',
            6000,
            {
                type: error.severity === 'warning' ? 'warning' : 'error',
                actions: toastActions,
                customActionHandler: async (action) => {
                    switch (action) {
                        case 'browse_file':
                            const selectFileBtn = document.getElementById('selectFileBtn');
                            if (selectFileBtn) selectFileBtn.click();
                            break;
                        case 'select_new_folder':
                            const selectFolderBtn = document.getElementById('selectFolderBtn');
                            if (selectFolderBtn) selectFolderBtn.click();
                            break;
                        case 'use_default':
                            this.handleUseDefaultFolder();
                            break;
                        case 'learn_more':
                            this.showFileFormatHelp(error.suggestedAction);
                            break;
                        case 'retry':
                            if (retryCallback) retryCallback();
                            break;
                    }
                },
                details: this.getFileErrorDetails(error)
            }
        );
    }

    /**
     * Handle FFmpeg errors specifically with enhanced guidance
     * Requirement 2.3, 2.4: Enhanced error recovery and user guidance
     */
    handleFFmpegError(error, retryCallback) {
        const enhancedError = {
            ...error,
            category: 'ffmpeg',
            timestamp: new Date().toISOString()
        };

        let enhancedRetryCallback = retryCallback;
        let toastActions = [];

        // For FFmpeg errors, offer comprehensive recovery options
        if (error.suggestedAction === 'use_wav') {
            enhancedRetryCallback = () => {
                // Switch to WAV format
                const wavRadio = document.querySelector('input[name="outputFormat"][value="wav"]');
                if (wavRadio) {
                    wavRadio.checked = true;
                    wavRadio.dispatchEvent(new Event('change'));
                }
                if (retryCallback) retryCallback();
            };
            
            toastActions = [
                { id: 'continue_with_wav', label: 'Use WAV Format' },
                { id: 'install_ffmpeg', label: 'Install FFmpeg' },
                { id: 'learn_more', label: 'About MP3 Support' }
            ];
            
            this.showError(enhancedError, enhancedRetryCallback);
            
        } else if (error.suggestedAction === 'install_ffmpeg') {
            toastActions = [
                { id: 'install_ffmpeg', label: 'Installation Guide' },
                { id: 'continue_with_wav', label: 'Use WAV Instead' },
                { id: 'dismiss', label: 'Maybe Later' }
            ];
            
            this.showError(enhancedError, retryCallback);
            
        } else if (error.suggestedAction === 'retry_smaller') {
            toastActions = [
                { id: 'retry', label: 'Retry Conversion' },
                { id: 'continue_with_wav', label: 'Try WAV Format' },
                { id: 'dismiss', label: 'Split Text' }
            ];
            
            this.showError(enhancedError, retryCallback);
            
        } else {
            toastActions = [
                { id: 'retry', label: 'Retry' },
                { id: 'continue_with_wav', label: 'Use WAV' }
            ];
            
            this.showError(enhancedError, retryCallback);
        }
        
        // Show contextual guidance toast
        this.showErrorToast(
            this.getFFmpegErrorMessage(error),
            8000,
            {
                type: error.severity === 'critical' ? 'error' : 'warning',
                actions: toastActions,
                customActionHandler: async (action) => {
                    switch (action) {
                        case 'continue_with_wav':
                            this.handleContinueWithWav();
                            break;
                        case 'install_ffmpeg':
                            this.handleInstallFFmpeg();
                            break;
                        case 'learn_more':
                            this.showFFmpegHelp();
                            break;
                        case 'retry':
                            if (retryCallback) retryCallback();
                            break;
                    }
                },
                details: this.getFFmpegErrorDetails(error)
            }
        );
    }
    /**
     * Show voice installation guide
     */
    showVoiceInstallationGuide() {
        const guide = {
            title: 'Windows TTS Voice Installation',
            message: 'Follow these steps to install additional TTS voices:',
            steps: [
                'Open Windows Settings (Windows key + I)',
                'Navigate to Time & Language > Speech',
                'Click "Add voices" under "Manage voices"',
                'Select and install desired language voices',
                'Restart SpeechMaker after installation',
                'Test voice availability in the application'
            ],
            links: [
                { label: 'Open Speech Settings', url: 'ms-settings:speech' },
                { label: 'Voice Installation Help', url: 'https://support.microsoft.com/en-us/windows/appendix-a-supported-languages-and-voices-4486e345-7730-53da-fcfe-55cc64300f01' }
            ]
        };
        
        this.showInstallationModal(guide);
    }

    /**
     * Show file format help based on error type
     */
    showFileFormatHelp(suggestedAction) {
        let helpContent = {
            title: 'File Format Help',
            message: 'SpeechMaker supports text files for conversion.',
            steps: []
        };

        switch (suggestedAction) {
            case 'convert_file':
                helpContent.steps = [
                    'Only .txt (plain text) files are supported',
                    'Convert your document to .txt format using any text editor',
                    'Copy and paste text directly into the application',
                    'Save Word documents as "Plain Text (*.txt)" format',
                    'Ensure the file uses UTF-8 encoding for best results'
                ];
                break;
            case 'split_file':
                helpContent.steps = [
                    'Maximum file size is 10MB for optimal performance',
                    'Split large files into smaller sections',
                    'Use a text editor to divide content into multiple files',
                    'Process each section separately',
                    'Consider using shorter text samples for faster processing'
                ];
                break;
            default:
                helpContent.steps = [
                    'Ensure the file exists and is accessible',
                    'Check file permissions and try running as administrator',
                    'Verify the file is not corrupted or in use by another application',
                    'Try copying the file to a different location'
                ];
        }

        this.showInstallationModal(helpContent);
    }

    /**
     * Show FFmpeg help information
     */
    showFFmpegHelp() {
        const helpContent = {
            title: 'About MP3 Support',
            message: 'MP3 conversion requires FFmpeg, a free audio processing tool.',
            steps: [
                'FFmpeg enables high-quality MP3 audio conversion',
                'WAV format is always available without additional software',
                'MP3 files are smaller and more widely compatible',
                'FFmpeg is safe, open-source, and widely used',
                'Installation is optional - WAV format works great too'
            ],
            links: [
                { label: 'Install FFmpeg', url: 'https://ffmpeg.org/download.html' },
                { label: 'Installation Tutorial', url: 'https://www.wikihow.com/Install-FFmpeg-on-Windows' }
            ]
        };
        
        this.showInstallationModal(helpContent);
    }

    /**
     * Get file error details for display
     */
    getFileErrorDetails(error) {
        const details = [];
        
        if (error.code) {
            details.push(`Error code: ${error.code}`);
        }
        
        if (error.context?.filePath) {
            const fileName = error.context.filePath.split(/[/\\]/).pop();
            details.push(`File: ${fileName}`);
        }
        
        if (error.context?.fileSize) {
            details.push(`Size: ${error.context.fileSize}`);
        }
        
        return details.join(' • ');
    }

    /**
     * Get FFmpeg error message based on error type
     */
    getFFmpegErrorMessage(error) {
        if (error.userMessage) {
            return error.userMessage;
        }
        
        if (error.message.includes('not installed')) {
            return 'MP3 conversion requires FFmpeg installation';
        } else if (error.message.includes('conversion failed')) {
            return 'MP3 conversion failed - try WAV format';
        } else if (error.message.includes('merging failed')) {
            return 'Audio merging failed - file may be too large';
        } else {
            return 'Audio processing error occurred';
        }
    }

    /**
     * Get FFmpeg error details for display
     */
    getFFmpegErrorDetails(error) {
        const details = [];
        
        if (error.context?.ffmpegSource) {
            details.push(`FFmpeg source: ${error.context.ffmpegSource}`);
        }
        
        if (error.context?.outputFormat) {
            details.push(`Target format: ${error.context.outputFormat}`);
        }
        
        if (error.context?.fileSize) {
            details.push(`File size: ${error.context.fileSize}`);
        }
        
        return details.join(' • ');
    }

    /**
     * Enhanced conversion error handler
     * Requirement 2.3, 2.4: Enhanced error recovery and user guidance
     */
    handleConversionError(error, retryCallback = null) {
        const enhancedError = {
            ...error,
            category: 'conversion',
            timestamp: new Date().toISOString()
        };

        // Show detailed error dialog
        this.showError(enhancedError, retryCallback);
        
        // Show recovery guidance based on error type
        const recoveryActions = this.getConversionRecoveryActions(error);
        
        if (recoveryActions.length > 0) {
            this.showErrorToast(
                error.userMessage || 'Conversion failed',
                7000,
                {
                    type: error.severity === 'critical' ? 'error' : 'warning',
                    actions: recoveryActions,
                    customActionHandler: async (action) => {
                        await this.handleConversionRecoveryAction(action, error, retryCallback);
                    },
                    details: this.getConversionErrorDetails(error)
                }
            );
        }
    }

    /**
     * Get conversion recovery actions based on error
     */
    getConversionRecoveryActions(error) {
        const actions = [];
        
        if (error.canRetry) {
            const attempts = error.context?.attempts || 0;
            const maxAttempts = error.context?.maxAttempts || 3;
            
            if (attempts < maxAttempts) {
                actions.push({ 
                    id: 'retry', 
                    label: `Retry (${maxAttempts - attempts} left)` 
                });
            }
        }
        
        switch (error.suggestedAction) {
            case 'add_text':
                actions.push({ id: 'add_text', label: 'Add Text' });
                break;
            case 'select_voice':
                actions.push({ id: 'select_voice', label: 'Choose Voice' });
                actions.push({ id: 'retry_voice_loading', label: 'Refresh Voices' });
                break;
            case 'select_folder':
                actions.push({ id: 'select_new_folder', label: 'Select Folder' });
                actions.push({ id: 'use_default', label: 'Use Default' });
                break;
            case 'retry_smaller':
                actions.push({ id: 'retry_smaller', label: 'Split Text' });
                actions.push({ id: 'continue_with_wav', label: 'Try WAV' });
                break;
            default:
                if (error.canRetry) {
                    actions.push({ id: 'retry', label: 'Retry' });
                }
        }
        
        actions.push({ id: 'dismiss', label: 'Cancel' });
        return actions;
    }

    /**
     * Handle conversion recovery actions
     */
    async handleConversionRecoveryAction(action, error, retryCallback) {
        switch (action) {
            case 'retry':
                if (retryCallback) {
                    await retryCallback();
                }
                break;
                
            case 'add_text':
                const textInput = document.getElementById('textInput');
                if (textInput) {
                    textInput.focus();
                }
                break;
                
            case 'select_voice':
                const voiceSelect = document.getElementById('voiceSelect');
                if (voiceSelect) {
                    voiceSelect.focus();
                }
                break;
                
            case 'retry_voice_loading':
                // Trigger voice loading retry through state manager
                if (window.stateManager && window.stateManager.notifyAction) {
                    window.stateManager.notifyAction('retryVoiceLoading');
                }
                break;
                
            case 'select_new_folder':
                await this.handleSelectNewFolder();
                break;
                
            case 'use_default':
                this.handleUseDefaultFolder();
                break;
                
            case 'retry_smaller':
                this.showErrorToast(
                    'Try converting smaller portions of text',
                    4000,
                    { type: 'info' }
                );
                break;
                
            case 'continue_with_wav':
                this.handleContinueWithWav();
                break;
        }
    }

    /**
     * Get conversion error details for display
     */
    getConversionErrorDetails(error) {
        const details = [];
        
        if (error.context?.textLength) {
            details.push(`Text length: ${error.context.textLength} chars`);
        }
        
        if (error.context?.voice) {
            details.push(`Voice: ${error.context.voice}`);
        }
        
        if (error.context?.outputFormat) {
            details.push(`Format: ${error.context.outputFormat}`);
        }
        
        if (error.context?.attempts) {
            details.push(`Attempts: ${error.context.attempts}`);
        }
        
        return details.join(' • ');
    }

    /**
     * Show comprehensive help modal
     */
    showHelpModal() {
        const helpContent = {
            title: 'SpeechMaker Help & Troubleshooting',
            message: 'Common solutions for SpeechMaker issues:',
            steps: [
                'Voice Issues: Check Windows Speech settings and install additional voices',
                'File Issues: Use .txt files under 10MB with UTF-8 encoding',
                'MP3 Issues: Install FFmpeg or use WAV format instead',
                'Performance: Try shorter text samples for faster processing',
                'Permissions: Run as administrator if file access is denied',
                'Updates: Keep Windows and SpeechMaker updated for best results'
            ],
            links: [
                { label: 'Windows Speech Settings', url: 'ms-settings:speech' },
                { label: 'FFmpeg Download', url: 'https://ffmpeg.org/download.html' },
                { label: 'Support Documentation', url: 'https://github.com/speechmaker/docs' }
            ]
        };
        
        this.showInstallationModal(helpContent);
    }
}

// Export for use in other modules
window.ErrorDisplay = ErrorDisplay;