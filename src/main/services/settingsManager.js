const { promises: fs } = require('fs');
const { join, dirname } = require('path');
const { app } = require('electron');

/**
 * Settings Manager Service
 * Handles persistent storage and retrieval of user preferences
 */
class SettingsManager {
    constructor() {
        this.settingsPath = null;
        this.defaultSettings = {
            lastSelectedVoice: null,
            defaultOutputFormat: 'wav',
            defaultOutputPath: null,
            voiceSpeed: 1.0,
            maxChunkLength: 5000,
            windowBounds: {
                width: 800,
                height: 600,
                x: undefined,
                y: undefined
            }
        };
    }

    /**
     * Initialize settings manager and ensure settings directory exists
     */
    async initialize() {
        try {
            // Get user data directory from Electron
            const userDataPath = app.getPath('userData');
            this.settingsPath = join(userDataPath, 'settings.json');
            
            // Ensure the directory exists
            await fs.mkdir(dirname(this.settingsPath), { recursive: true });
            
            return true;
        } catch (error) {
            console.error('Failed to initialize settings manager:', error);
            throw new Error(`Settings initialization failed: ${error.message}`);
        }
    }

    /**
     * Get default settings configuration
     * @returns {Object} Default settings object
     */
    getDefaultSettings() {
        return { ...this.defaultSettings };
    }

    /**
     * Save user settings to persistent storage
     * @param {Object} settings - Settings object to save
     * @returns {Promise<boolean>} Success status
     */
    async saveSettings(settings) {
        try {
            if (!this.settingsPath) {
                await this.initialize();
            }

            // Validate settings structure
            const validatedSettings = this.validateSettings(settings);
            
            // Write settings to file with pretty formatting
            await fs.writeFile(
                this.settingsPath, 
                JSON.stringify(validatedSettings, null, 2), 
                'utf8'
            );
            
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            throw new Error(`Settings save failed: ${error.message}`);
        }
    }

    /**
     * Load user settings from persistent storage
     * @returns {Promise<Object>} Settings object or default settings if none exist
     */
    async loadSettings() {
        try {
            if (!this.settingsPath) {
                await this.initialize();
            }

            // Check if settings file exists
            try {
                await fs.access(this.settingsPath);
            } catch (accessError) {
                // File doesn't exist, return default settings
                console.log('Settings file not found, using defaults');
                return this.getDefaultSettings();
            }

            // Read and parse settings file
            const settingsData = await fs.readFile(this.settingsPath, 'utf8');
            const parsedSettings = JSON.parse(settingsData);
            
            // Merge with defaults to ensure all properties exist
            const mergedSettings = { ...this.defaultSettings, ...parsedSettings };
            
            return this.validateSettings(mergedSettings);
        } catch (error) {
            console.error('Failed to load settings:', error);
            console.log('Falling back to default settings');
            return this.getDefaultSettings();
        }
    }

    /**
     * Update specific setting value
     * @param {string} key - Setting key to update
     * @param {*} value - New value for the setting
     * @returns {Promise<boolean>} Success status
     */
    async updateSetting(key, value) {
        try {
            const currentSettings = await this.loadSettings();
            currentSettings[key] = value;
            return await this.saveSettings(currentSettings);
        } catch (error) {
            console.error(`Failed to update setting ${key}:`, error);
            throw new Error(`Setting update failed: ${error.message}`);
        }
    }

    /**
     * Reset settings to default values
     * @returns {Promise<boolean>} Success status
     */
    async resetSettings() {
        try {
            return await this.saveSettings(this.getDefaultSettings());
        } catch (error) {
            console.error('Failed to reset settings:', error);
            throw new Error(`Settings reset failed: ${error.message}`);
        }
    }

    /**
     * Validate settings object structure and values
     * @param {Object} settings - Settings to validate
     * @returns {Object} Validated settings object
     */
    validateSettings(settings) {
        const validated = { ...this.defaultSettings };

        // Validate lastSelectedVoice
        if (settings.lastSelectedVoice && typeof settings.lastSelectedVoice === 'string') {
            validated.lastSelectedVoice = settings.lastSelectedVoice;
        }

        // Validate defaultOutputFormat
        if (settings.defaultOutputFormat && ['wav', 'mp3'].includes(settings.defaultOutputFormat)) {
            validated.defaultOutputFormat = settings.defaultOutputFormat;
        }

        // Validate defaultOutputPath
        if (settings.defaultOutputPath && typeof settings.defaultOutputPath === 'string') {
            validated.defaultOutputPath = settings.defaultOutputPath;
        }

        // Validate voiceSpeed
        if (typeof settings.voiceSpeed === 'number' && 
            settings.voiceSpeed >= 0.5 && 
            settings.voiceSpeed <= 2.0) {
            validated.voiceSpeed = settings.voiceSpeed;
        }

        // Validate maxChunkLength
        if (typeof settings.maxChunkLength === 'number' && 
            settings.maxChunkLength > 0 && 
            settings.maxChunkLength <= 50000) {
            validated.maxChunkLength = settings.maxChunkLength;
        }

        // Validate windowBounds
        if (settings.windowBounds && typeof settings.windowBounds === 'object') {
            validated.windowBounds = { ...this.defaultSettings.windowBounds };
            
            if (typeof settings.windowBounds.width === 'number' && settings.windowBounds.width > 0) {
                validated.windowBounds.width = settings.windowBounds.width;
            }
            if (typeof settings.windowBounds.height === 'number' && settings.windowBounds.height > 0) {
                validated.windowBounds.height = settings.windowBounds.height;
            }
            if (typeof settings.windowBounds.x === 'number') {
                validated.windowBounds.x = settings.windowBounds.x;
            }
            if (typeof settings.windowBounds.y === 'number') {
                validated.windowBounds.y = settings.windowBounds.y;
            }
        }

        return validated;
    }

    /**
     * Get the path where settings are stored
     * @returns {string|null} Settings file path
     */
    getSettingsPath() {
        return this.settingsPath;
    }
}

module.exports = SettingsManager;