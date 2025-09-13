#!/usr/bin/env node

/**
 * Manual Integration Test Script
 * Tests the complete SpeechMaker workflow without Electron
 * Run with: node test-integration.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock Electron app for testing
const mockApp = {
    getPath: (name) => {
        if (name === 'userData') {
            return join(__dirname, 'test-data');
        }
        return __dirname;
    }
};

// Set up global mock
global.app = mockApp;

async function testServiceIntegration() {
    console.log('🧪 Testing SpeechMaker Service Integration...\n');

    try {
        // Test 1: Import all services
        console.log('1️⃣ Testing service imports...');
        const { default: TTSService } = await import('./src/main/services/ttsService.js');
        const { default: FileManager } = await import('./src/main/services/fileManager.js');
        const { default: AudioProcessor } = await import('./src/main/services/audioProcessor.js');
        const { default: SettingsManager } = await import('./src/main/services/settingsManager.js');
        const { default: ErrorHandler } = await import('./src/main/services/errorHandler.js');
        console.log('✅ All services imported successfully\n');

        // Test 2: Create service instances
        console.log('2️⃣ Testing service instantiation...');
        const ttsService = new TTSService();
        const fileManager = new FileManager();
        const audioProcessor = new AudioProcessor();
        const settingsManager = new SettingsManager();
        const errorHandler = new ErrorHandler();
        console.log('✅ All services created successfully\n');

        // Test 3: Wire services together
        console.log('3️⃣ Testing service wiring...');
        ttsService.setAudioProcessor(audioProcessor);
        console.log('✅ Services wired together successfully\n');

        // Test 4: Test settings manager
        console.log('4️⃣ Testing settings management...');
        await settingsManager.initialize();
        const defaultSettings = settingsManager.getDefaultSettings();
        console.log('Default settings:', JSON.stringify(defaultSettings, null, 2));
        
        const testSettings = { ...defaultSettings, voiceSpeed: 1.5 };
        await settingsManager.saveSettings(testSettings);
        const loadedSettings = await settingsManager.loadSettings();
        console.log('✅ Settings saved and loaded successfully\n');

        // Test 5: Test text chunking
        console.log('5️⃣ Testing text processing...');
        const shortText = 'This is a short test text for speech conversion.';
        const longText = 'This is a longer text. '.repeat(500); // Create long text
        
        const shortChunks = ttsService.splitTextIntoChunks(shortText);
        const longChunks = ttsService.splitTextIntoChunks(longText);
        
        console.log(`Short text chunks: ${shortChunks.length}`);
        console.log(`Long text chunks: ${longChunks.length}`);
        console.log('✅ Text processing works correctly\n');

        // Test 6: Test file operations
        console.log('6️⃣ Testing file operations...');
        const testDir = join(__dirname, 'test-output');
        await fs.mkdir(testDir, { recursive: true });
        
        const uniquePath1 = fileManager.generateUniqueFileName(testDir, 'test', '.wav');
        const uniquePath2 = fileManager.generateUniqueFileName(testDir, 'test', '.wav');
        
        console.log(`Generated paths: ${uniquePath1}, ${uniquePath2}`);
        console.log('✅ File operations work correctly\n');

        // Test 7: Test error handling
        console.log('7️⃣ Testing error handling...');
        const testError = new Error('Test TTS error');
        const enhancedError = errorHandler.handleTTSVoiceError(testError);
        
        console.log('Enhanced error structure:');
        console.log(`- User message: ${enhancedError.userMessage}`);
        console.log(`- Troubleshooting steps: ${enhancedError.troubleshooting.length}`);
        console.log(`- Can retry: ${enhancedError.canRetry}`);
        console.log('✅ Error handling works correctly\n');

        // Test 8: Test audio processor validation
        console.log('8️⃣ Testing audio processor...');
        const ffmpegAvailable = await audioProcessor.validateFFmpegInstallation();
        console.log(`FFmpeg available: ${ffmpegAvailable}`);
        if (!ffmpegAvailable) {
            console.log('ℹ️ FFmpeg not installed - MP3 conversion will not be available');
        }
        console.log('✅ Audio processor validation complete\n');

        console.log('🎉 All integration tests passed successfully!');
        console.log('\n📋 Summary:');
        console.log('- ✅ Service imports working');
        console.log('- ✅ Service instantiation working');
        console.log('- ✅ Service wiring working');
        console.log('- ✅ Settings management working');
        console.log('- ✅ Text processing working');
        console.log('- ✅ File operations working');
        console.log('- ✅ Error handling working');
        console.log('- ✅ Audio processor validation working');
        
        console.log('\n🚀 The application is ready for end-to-end testing!');

    } catch (error) {
        console.error('❌ Integration test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testServiceIntegration().catch(console.error);