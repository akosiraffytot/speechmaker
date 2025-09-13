/**
 * Error Display Component
 * Provides user-friendly error messages with troubleshooting guidance
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
class ErrorDisplay {
    constructor() {
        this.errorContainer = null;
        this.currentError = null;
        this.retryCallback = null;
        
        this.createErrorContainer();
        this.setupEventListeners();
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
     * Show a simple error toast for non-critical errors
     */
    showErrorToast(message, duration = 5000) {
        // Remove existing toast
        const existingToast = document.querySelector('.error-toast');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <span class="toast-icon">⚠️</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close">×</button>
        `;

        document.body.appendChild(toast);

        // Add event listeners
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });

        // Auto-remove after duration
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, duration);

        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
    }

    /**
     * Show retry notification
     */
    showRetryNotification(attempt, maxRetries, delay) {
        const message = `Retrying... (${attempt}/${maxRetries}) - Next attempt in ${Math.ceil(delay/1000)}s`;
        this.showErrorToast(message, delay);
    }

    /**
     * Handle TTS voice errors specifically
     */
    handleTTSVoiceError(error, retryCallback) {
        // Add specific actions for TTS voice errors
        if (error.suggestedAction === 'install_voices') {
            const enhancedRetryCallback = () => {
                // Open Windows Speech settings
                window.electronAPI.openExternal('ms-settings:speech');
                if (retryCallback) retryCallback();
            };
            this.showError(error, enhancedRetryCallback);
        } else {
            this.showError(error, retryCallback);
        }
    }

    /**
     * Handle file errors specifically
     */
    handleFileError(error, retryCallback) {
        let enhancedRetryCallback = retryCallback;

        // Add specific actions based on suggested action
        switch (error.suggestedAction) {
            case 'browse_file':
                enhancedRetryCallback = () => {
                    // Trigger file selection
                    document.querySelector('#file-input')?.click();
                };
                break;
            case 'select_folder':
                enhancedRetryCallback = () => {
                    // Trigger folder selection
                    document.querySelector('#folder-select')?.click();
                };
                break;
        }

        this.showError(error, enhancedRetryCallback);
    }

    /**
     * Handle FFmpeg errors specifically
     */
    handleFFmpegError(error, retryCallback) {
        // For FFmpeg errors, offer to switch to WAV format
        if (error.suggestedAction === 'use_wav') {
            const enhancedRetryCallback = () => {
                // Switch to WAV format
                const wavRadio = document.querySelector('input[name="format"][value="wav"]');
                if (wavRadio) {
                    wavRadio.checked = true;
                    wavRadio.dispatchEvent(new Event('change'));
                }
                if (retryCallback) retryCallback();
            };
            this.showError(error, enhancedRetryCallback);
        } else {
            this.showError(error, retryCallback);
        }
    }
}

// Export for use in other modules
window.ErrorDisplay = ErrorDisplay;