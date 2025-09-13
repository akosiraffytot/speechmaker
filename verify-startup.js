/**
 * Startup Verification Script
 * Verifies that all components can be loaded and initialized
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock Electron modules for testing
const mockElectron = {
    app: {
        getPath: (name) => join(__dirname, 'mock-data'),
        whenReady: () => Promise.resolve(),
        on: () => {},
        quit: () => {}
    },
    BrowserWindow: class MockBrowserWindow {
        constructor() {
            this.webContents = { send: () => {}, openDevTools: () => {} };
        }
        loadFile() { return Promise.resolve(); }
        once() {}
        on() {}
        getBounds() { return { width: 800, height: 600, x: 0, y: 0 }; }
        show() {}
    },
    ipcMain: {
        handle: () => {},
        removeAllListeners: () => {}
    },
    dialog: {
        showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
        showMessageBox: () => Promise.resolve({ response: 0 })
    }
};

// Set up global mocks
global.electron = mockElectron;

async function verifyStartup() {
    console.log('🔍 Verifying SpeechMaker startup components...\n');

    try {
        // Test service imports
        console.log('📦 Testing service imports...');
        const services = await Promise.all([
            import('./src/main/services/ttsService.js'),
            import('./src/main/services/fileManager.js'),
            import('./src/main/services/audioProcessor.js'),
            import('./src/main/services/settingsManager.js'),
            import('./src/main/services/errorHandler.js')
        ]);
        console.log('✅ All services imported successfully');

        // Test service instantiation
        console.log('🏗️ Testing service instantiation...');
        const [TTSService, FileManager, AudioProcessor, SettingsManager, ErrorHandler] = services.map(s => s.default);
        
        const ttsService = new TTSService();
        const fileManager = new FileManager();
        const audioProcessor = new AudioProcessor();
        const settingsManager = new SettingsManager();
        const errorHandler = new ErrorHandler();
        
        console.log('✅ All services instantiated successfully');

        // Test service methods
        console.log('🔧 Testing core service methods...');
        
        // Test TTS service
        const chunks = ttsService.splitTextIntoChunks('Test text for chunking.');
        console.log(`  TTS chunking: ${chunks.length} chunks`);
        
        // Test file manager
        const uniquePath = fileManager.generateUniqueFileName('/test', 'speech', '.wav');
        console.log(`  File manager: ${uniquePath}`);
        
        // Test settings manager
        const defaults = settingsManager.getDefaultSettings();
        console.log(`  Settings: ${Object.keys(defaults).length} default settings`);
        
        // Test error handler
        const testError = new Error('Test error');
        const enhanced = errorHandler.handleTTSVoiceError(testError);
        console.log(`  Error handler: Enhanced error with ${enhanced.troubleshooting.length} steps`);
        
        console.log('✅ All service methods working correctly');

        // Test service wiring
        console.log('🔗 Testing service wiring...');
        ttsService.setAudioProcessor(audioProcessor);
        console.log('✅ Services wired successfully');

        console.log('\n🎉 Startup verification completed successfully!');
        console.log('\n📋 Verification Summary:');
        console.log('  ✅ Service imports: Working');
        console.log('  ✅ Service instantiation: Working');
        console.log('  ✅ Core methods: Working');
        console.log('  ✅ Service wiring: Working');
        console.log('\n🚀 Application is ready to start!');

        return true;

    } catch (error) {
        console.error('❌ Startup verification failed:', error.message);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Run verification
verifyStartup().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Verification error:', error);
    process.exit(1);
});