const { promises: fs } = require('fs');
const { join, dirname } = require('path');
const { app } = require('electron');
const os = require('os');

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
            
            // Initialize default output folder on first start
            await this.initializeDefaultOutputFolder();
            
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
                // File doesn't exist, return default settings with initialized output folder
                console.log('Settings file not found, using defaults');
                const defaultSettings = this.getDefaultSettings();
                defaultSettings.defaultOutputPath = this.getDefaultOutputFolder();
                return defaultSettings;
            }

            // Read and parse settings file
            const settingsData = await fs.readFile(this.settingsPath, 'utf8');
            const parsedSettings = JSON.parse(settingsData);
            
            // Perform settings migration if needed
            const migratedSettings = await this.migrateSettings(parsedSettings);
            
            // Merge with defaults to ensure all properties exist
            const mergedSettings = { ...this.defaultSettings, ...migratedSettings };
            
            // Validate and ensure default output folder is set
            const validatedSettings = this.validateSettings(mergedSettings);
            if (!validatedSettings.defaultOutputPath) {
                validatedSettings.defaultOutputPath = this.getDefaultOutputFolder();
            }
            
            return validatedSettings;
        } catch (error) {
            console.error('Failed to load settings:', error);
            console.log('Falling back to default settings');
            const defaultSettings = this.getDefaultSettings();
            defaultSettings.defaultOutputPath = this.getDefaultOutputFolder();
            return defaultSettings;
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

        // Validate defaultOutputPath with accessibility check
        if (settings.defaultOutputPath && typeof settings.defaultOutputPath === 'string') {
            // Check if the path is accessible, if not, use default
            if (this.ensureDirectoryExists(settings.defaultOutputPath)) {
                validated.defaultOutputPath = settings.defaultOutputPath;
            } else {
                console.warn(`Saved output path ${settings.defaultOutputPath} is not accessible, using default`);
                validated.defaultOutputPath = this.getDefaultOutputFolder();
            }
        } else if (!validated.defaultOutputPath) {
            // Ensure we always have a default output path
            validated.defaultOutputPath = this.getDefaultOutputFolder();
        }

        // Validate voiceSpeed
        if (typeof settings.voiceSpeed === 'number' && 
            settings.voiceSpeed >= 0.5 && 
            settings.voiceSpeed <= 2.0) {
            validated.voiceSpeed = settings.voiceSpeed;
        }

        // Validate maxChunkLength
        if (typeof settings.maxChunkLength === 'number' && 
            settings.maxChunkLength >= 1000 && 
            settings.maxChunkLength <= 50000) {
            validated.maxChunkLength = settings.maxChunkLength;
        }

        // Validate windowBounds
        if (settings.windowBounds && typeof settings.windowBounds === 'object') {
            validated.windowBounds = { ...this.defaultSettings.windowBounds };
            
            if (typeof settings.windowBounds.width === 'number' && 
                settings.windowBounds.width >= 400 && 
                settings.windowBounds.width <= 3840) {
                validated.windowBounds.width = settings.windowBounds.width;
            }
            if (typeof settings.windowBounds.height === 'number' && 
                settings.windowBounds.height >= 300 && 
                settings.windowBounds.height <= 2160) {
                validated.windowBounds.height = settings.windowBounds.height;
            }
            if (typeof settings.windowBounds.x === 'number' && 
                settings.windowBounds.x >= -1920 && 
                settings.windowBounds.x <= 3840) {
                validated.windowBounds.x = settings.windowBounds.x;
            }
            if (typeof settings.windowBounds.y === 'number' && 
                settings.windowBounds.y >= -1080 && 
                settings.windowBounds.y <= 2160) {
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

    /**
     * Get default output folder with fallback hierarchy
     * Tries Documents/SpeechMaker -> Home/SpeechMaker -> Temp directory
     * @returns {string} Path to default output folder
     */
    getDefaultOutputFolder() {
        const documentsPath = join(os.homedir(), 'Documents');
        const speechMakerPath = join(documentsPath, 'SpeechMaker');
        
        // Try Documents/SpeechMaker first
        if (this.ensureDirectoryExists(speechMakerPath)) {
            return speechMakerPath;
        }
        
        // Fallback to user home directory
        const homePath = join(os.homedir(), 'SpeechMaker');
        if (this.ensureDirectoryExists(homePath)) {
            return homePath;
        }
        
        // Last resort: temp directory
        return os.tmpdir();
    }

    /**
     * Ensure directory exists and is writable
     * @param {string} dirPath - Directory path to check/create
     * @returns {boolean} True if directory exists and is writable
     */
    ensureDirectoryExists(dirPath) {
        try {
            // Check if directory exists, create if it doesn't
            if (!require('fs').existsSync(dirPath)) {
                require('fs').mkdirSync(dirPath, { recursive: true });
            }
            
            // Test write access by creating and deleting a test file
            const testFile = join(dirPath, '.write-test');
            require('fs').writeFileSync(testFile, 'test');
            require('fs').unlinkSync(testFile);
            
            return true;
        } catch (error) {
            console.warn(`Cannot create or write to directory ${dirPath}:`, error.message);
            return false;
        }
    }

    /**
     * Initialize default output folder on first application start
     * @returns {Promise<string>} Path to the default output folder
     */
    async initializeDefaultOutputFolder() {
        try {
            const settings = await this.loadSettings();
            
            // If no output path is set, set the default
            if (!settings.defaultOutputPath) {
                const defaultFolder = this.getDefaultOutputFolder();
                await this.updateSetting('defaultOutputPath', defaultFolder);
                console.log(`Default output folder set to: ${defaultFolder}`);
                return defaultFolder;
            }
            
            // Verify existing path is still accessible
            if (!this.ensureDirectoryExists(settings.defaultOutputPath)) {
                console.warn(`Existing output path ${settings.defaultOutputPath} is no longer accessible`);
                const defaultFolder = this.getDefaultOutputFolder();
                await this.updateSetting('defaultOutputPath', defaultFolder);
                console.log(`Default output folder updated to: ${defaultFolder}`);
                return defaultFolder;
            }
            
            return settings.defaultOutputPath;
        } catch (error) {
            console.error('Failed to initialize default output folder:', error);
            // Fallback to temp directory if all else fails
            return os.tmpdir();
        }
    }

    /**
     * Migrate settings from older versions to current format
     * @param {Object} settings - Raw settings loaded from file
     * @returns {Promise<Object>} Migrated settings object
     */
    async migrateSettings(settings) {
        try {
            const migrated = { ...settings };
            let migrationPerformed = false;

            // Migration 1: Convert old outputPath to defaultOutputPath (v1.0 -> v1.1)
            if (settings.outputPath && !settings.defaultOutputPath) {
                migrated.defaultOutputPath = settings.outputPath;
                delete migrated.outputPath;
                migrationPerformed = true;
                console.log('Migrated outputPath to defaultOutputPath');
            }

            // Migration 2: Ensure defaultOutputPath is set and accessible
            if (!migrated.defaultOutputPath || !this.ensureDirectoryExists(migrated.defaultOutputPath)) {
                migrated.defaultOutputPath = this.getDefaultOutputFolder();
                migrationPerformed = true;
                console.log('Set default output folder during migration');
            }

            // Migration 3: Convert old voice settings format (if any future changes needed)
            if (settings.selectedVoice && !settings.lastSelectedVoice) {
                migrated.lastSelectedVoice = settings.selectedVoice;
                delete migrated.selectedVoice;
                migrationPerformed = true;
                console.log('Migrated selectedVoice to lastSelectedVoice');
            }

            // Migration 4: Ensure windowBounds has proper structure
            if (!migrated.windowBounds || typeof migrated.windowBounds !== 'object') {
                migrated.windowBounds = this.defaultSettings.windowBounds;
                migrationPerformed = true;
                console.log('Reset windowBounds to default structure');
            }

            // Migration 5: Validate and fix voice speed range
            if (typeof migrated.voiceSpeed !== 'number' || 
                migrated.voiceSpeed < 0.5 || 
                migrated.voiceSpeed > 2.0) {
                migrated.voiceSpeed = 1.0;
                migrationPerformed = true;
                console.log('Reset voice speed to default value');
            }

            // Save migrated settings if any changes were made
            if (migrationPerformed) {
                console.log('Settings migration completed, saving updated settings');
                // Don't call saveSettings here to avoid recursion, just return migrated settings
                // The caller will handle saving if needed
            }

            return migrated;
        } catch (error) {
            console.error('Settings migration failed:', error);
            // Return original settings if migration fails
            return settings;
        }
    }
}

module.exports = SettingsManager;