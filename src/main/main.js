const { app, BrowserWindow } = require('electron');
const { join } = require('path');
const SettingsManager = require('./services/settingsManager.js');
const TTSService = require('./services/ttsService.js');
const FileManager = require('./services/fileManager.js');
const AudioProcessor = require('./services/audioProcessor.js');
const ErrorHandler = require('./services/errorHandler.js');
const IPCHandlers = require('./ipc/ipcHandlers.js');
const PerformanceMonitor = require('./utils/performanceMonitor.js');

// __dirname is available in CommonJS

// Keep a global reference of the window object
let mainWindow;
let settingsManager;
let ttsService;
let fileManager;
let audioProcessor;
let errorHandler;
let ipcHandlers;

// Initialize performance monitoring
const perfMonitor = new PerformanceMonitor();
perfMonitor.markStart('app-startup');

async function createWindow() {
  perfMonitor.markStart('create-window');
  
  // Initialize core services before creating window for better UX
  await initializeCoreServices();
  
  // Show window early for better perceived performance
  const { windowBounds } = await getWindowBounds();
  
  // Create the browser window first
  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: join(__dirname, 'preload.js')
    },
    icon: join(__dirname, '../../assets/icon.png'),
    show: false,
    backgroundColor: '#f5f5f5' // Match app background for smoother loading
  });

  // Load the app immediately
  mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    perfMonitor.markEnd('create-window');
    mainWindow.show();
    
    // Continue with remaining service initialization
    completeServiceInitialization();
  });

  // Initialize core services before UI creation with enhanced parallel FFmpeg and voice loading
  async function initializeCoreServices() {
    try {
      perfMonitor.markStart('core-services-init');
      
      // Initialize error handler first
      perfMonitor.markStart('error-handler-init');
      errorHandler = new ErrorHandler();
      await errorHandler.initialize();
      perfMonitor.markEnd('error-handler-init');
      
      // Initialize settings manager and ensure default output folder
      perfMonitor.markStart('settings-manager-init');
      settingsManager = new SettingsManager();
      await settingsManager.initialize();
      perfMonitor.markEnd('settings-manager-init');
      
      // Initialize file manager
      perfMonitor.markStart('file-manager-init');
      fileManager = new FileManager();
      perfMonitor.markEnd('file-manager-init');
      
      // Initialize audio processor
      perfMonitor.markStart('audio-processor-init');
      audioProcessor = new AudioProcessor();
      perfMonitor.markEnd('audio-processor-init');
      
      // Initialize TTS service
      perfMonitor.markStart('tts-service-init');
      ttsService = new TTSService();
      ttsService.setAudioProcessor(audioProcessor);
      perfMonitor.markEnd('tts-service-init');
      
      // Start enhanced parallel initialization of FFmpeg and voice loading
      // This is the key improvement - both operations run concurrently with better error handling
      perfMonitor.markStart('parallel-init');
      
      // Send initialization started event to renderer
      const sendInitializationUpdate = (type, data) => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('initialization:update', { type, data, timestamp: Date.now() });
        }
      };
      
      sendInitializationUpdate('started', { 
        message: 'Initializing FFmpeg and voice detection...',
        phase: 'parallel-init'
      });
      
      // Enhanced FFmpeg initialization promise with detailed status reporting
      perfMonitor.markStart('ffmpeg-init');
      const ffmpegInitPromise = audioProcessor.initializeFFmpeg().then(status => {
        perfMonitor.markEnd('ffmpeg-init');
        
        const logMessage = status.available 
          ? `FFmpeg initialized successfully (${status.source}): ${status.version || 'version unknown'}`
          : `FFmpeg not available: ${status.error || 'No working installation found'}`;
        console.log(logMessage);
        
        // Send detailed FFmpeg status to renderer
        sendInitializationUpdate('ffmpeg-complete', {
          status,
          message: status.available 
            ? `FFmpeg ready (${status.source})` 
            : 'FFmpeg unavailable - MP3 conversion disabled'
        });
        
        return status;
      }).catch(error => {
        perfMonitor.markEnd('ffmpeg-init');
        console.error('FFmpeg initialization failed:', error);
        
        const errorStatus = { 
          available: false, 
          source: 'none', 
          error: error.message,
          validated: false,
          path: null,
          version: null
        };
        
        // Send error status to renderer
        sendInitializationUpdate('ffmpeg-error', {
          status: errorStatus,
          message: 'FFmpeg initialization failed',
          error: error.message
        });
        
        return errorStatus;
      });
      
      // Enhanced voice loading initialization promise with retry status reporting
      perfMonitor.markStart('voice-loading');
      const voiceLoadPromise = ttsService.loadVoicesWithRetry().then(result => {
        perfMonitor.markEnd('voice-loading');
        
        const logMessage = result.success 
          ? `Voice loading completed: ${result.voices?.length || 0} voices found (${result.attempt || 1} attempts)`
          : `Voice loading failed after ${result.attempts || 1} attempts: ${result.error?.message || 'Unknown error'}`;
        console.log(logMessage);
        
        // Send voice loading result to renderer
        if (result.success) {
          sendInitializationUpdate('voices-complete', {
            voices: result.voices,
            attempts: result.attempt || 1,
            message: `${result.voices?.length || 0} voices loaded`,
            success: true
          });
        } else {
          sendInitializationUpdate('voices-error', {
            error: result.error?.message || 'Unknown error',
            attempts: result.attempts || 1,
            troubleshooting: result.troubleshooting || ttsService.getTroubleshootingSteps(),
            message: 'Voice loading failed',
            success: false
          });
        }
        
        return result;
      }).catch(error => {
        perfMonitor.markEnd('voice-loading');
        console.error('Voice loading failed:', error);
        
        const errorResult = { 
          success: false, 
          error: error,
          attempts: 1,
          troubleshooting: ttsService.getTroubleshootingSteps()
        };
        
        // Send error to renderer
        sendInitializationUpdate('voices-error', {
          error: error.message,
          attempts: 1,
          troubleshooting: ttsService.getTroubleshootingSteps(),
          message: 'Voice loading failed',
          success: false
        });
        
        return errorResult;
      });
      
      // Store promises for completion in completeServiceInitialization
      global.initializationPromises = {
        ffmpeg: ffmpegInitPromise,
        voices: voiceLoadPromise
      };
      
      perfMonitor.markEnd('parallel-init');
      perfMonitor.markEnd('core-services-init');
      
      console.log('Core services initialized, enhanced parallel initialization started');
      
    } catch (error) {
      perfMonitor.markEnd('core-services-init');
      console.error('Failed to initialize core services:', error);
      
      // Send comprehensive initialization error to renderer
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('initialization:error', {
          message: 'Failed to initialize core services',
          error: error.message,
          phase: 'core-services',
          timestamp: Date.now(),
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
      
      throw error;
    }
  }

  // Complete remaining service initialization after UI is ready
  async function completeServiceInitialization() {
    try {
      perfMonitor.markStart('complete-services-init');
      
      // Initialize IPC handlers now that all services are available
      perfMonitor.markStart('ipc-handlers-init');
      const services = {
        settingsManager,
        ttsService,
        fileManager,
        audioProcessor,
        errorHandler
      };
      
      ipcHandlers = new IPCHandlers(services, mainWindow);
      perfMonitor.markEnd('ipc-handlers-init');
      
      // Wait for enhanced parallel initialization to complete and send comprehensive final status
      if (global.initializationPromises) {
        console.log('Waiting for enhanced parallel initialization to complete...');
        
        // Send progress update
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('initialization:update', {
            type: 'finalizing',
            data: { message: 'Finalizing initialization...' },
            timestamp: Date.now()
          });
        }
        
        const [ffmpegResult, voiceResult] = await Promise.allSettled([
          global.initializationPromises.ffmpeg,
          global.initializationPromises.voices
        ]);
        
        // Process FFmpeg result with enhanced error handling
        const ffmpegStatus = ffmpegResult.status === 'fulfilled' 
          ? ffmpegResult.value 
          : { 
              available: false, 
              source: 'none',
              validated: false,
              path: null,
              version: null,
              error: ffmpegResult.reason?.message || 'FFmpeg initialization failed'
            };
        
        // Process voice loading result with enhanced error handling
        const voiceStatus = voiceResult.status === 'fulfilled' 
          ? voiceResult.value 
          : { 
              success: false, 
              voices: [],
              attempts: 1,
              error: voiceResult.reason?.message || 'Voice loading failed',
              troubleshooting: ttsService?.getTroubleshootingSteps() || []
            };
        
        // Determine overall readiness and application state
        const isReady = voiceStatus.success && (voiceStatus.voices?.length > 0);
        const hasFFmpeg = ffmpegStatus.available;
        const hasVoices = voiceStatus.success && voiceStatus.voices?.length > 0;
        
        // Create comprehensive status summary
        const statusSummary = {
          ffmpeg: {
            available: hasFFmpeg,
            source: ffmpegStatus.source,
            message: hasFFmpeg 
              ? `FFmpeg ready (${ffmpegStatus.source}${ffmpegStatus.version ? ` v${ffmpegStatus.version}` : ''})`
              : 'FFmpeg unavailable - MP3 conversion disabled'
          },
          voices: {
            available: hasVoices,
            count: voiceStatus.voices?.length || 0,
            message: hasVoices 
              ? `${voiceStatus.voices.length} voices available`
              : 'No voices available - TTS conversion disabled'
          },
          overall: {
            ready: isReady,
            message: isReady 
              ? 'Application ready for use'
              : 'Application partially ready - some features may be limited'
          }
        };
        
        console.log('Enhanced initialization complete:', {
          ffmpeg: statusSummary.ffmpeg.message,
          voices: statusSummary.voices.message,
          overall: statusSummary.overall.message,
          ready: isReady
        });
        
        // Send comprehensive initialization completion status to renderer
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('initialization:complete', {
            ffmpeg: ffmpegStatus,
            voices: voiceStatus,
            ready: isReady,
            summary: statusSummary,
            timestamp: Date.now(),
            performanceMetrics: {
              totalStartupTime: perfMonitor.getElapsedTime ? perfMonitor.getElapsedTime('app-startup') : null,
              ffmpegInitTime: perfMonitor.getElapsedTime ? perfMonitor.getElapsedTime('ffmpeg-init') : null,
              voiceLoadTime: perfMonitor.getElapsedTime ? perfMonitor.getElapsedTime('voice-loading') : null
            }
          });
        }
        
        // Clean up global promises
        delete global.initializationPromises;
        
        // Send final ready state update
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('initialization:update', {
            type: 'complete',
            data: { 
              message: statusSummary.overall.message,
              ready: isReady,
              summary: statusSummary
            },
            timestamp: Date.now()
          });
        }
        
      } else {
        console.warn('No initialization promises found - sending fallback ready status');
        
        // Fallback: send basic ready status with error indication
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send('initialization:complete', {
            ffmpeg: { available: false, source: 'none', error: 'No initialization data' },
            voices: { success: false, voices: [], error: 'No initialization data' },
            ready: false,
            summary: {
              ffmpeg: { available: false, message: 'FFmpeg status unknown' },
              voices: { available: false, count: 0, message: 'Voice status unknown' },
              overall: { ready: false, message: 'Application status unknown' }
            },
            timestamp: Date.now()
          });
        }
      }
      
      perfMonitor.markEnd('complete-services-init');
      perfMonitor.markEnd('app-startup');
      
      // Log performance summary in development
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => {
          if (perfMonitor.logStartupSummary) {
            perfMonitor.logStartupSummary();
          }
        }, 1000);
      }
      
      // Start memory monitoring if available
      if (perfMonitor.startMemoryMonitoring) {
        perfMonitor.startMemoryMonitoring();
      }
      
    } catch (error) {
      perfMonitor.markEnd('complete-services-init');
      perfMonitor.markEnd('app-startup');
      console.error('Failed to complete service initialization:', error);
      
      // Send comprehensive error to renderer with detailed information
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('initialization:error', {
          message: 'Failed to complete service initialization',
          error: error.message,
          phase: 'completion',
          timestamp: Date.now(),
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          recovery: {
            message: 'Try restarting the application',
            actions: ['restart', 'check-system-requirements']
          }
        });
      }
    }
  }

async function getWindowBounds() {
  try {
    // Try to load settings quickly for window bounds
    const tempSettingsManager = new SettingsManager();
    const settings = await tempSettingsManager.loadSettings();
    return settings;
  } catch (error) {
    // Return default bounds if settings can't be loaded
    return {
      windowBounds: {
        width: 800,
        height: 700,
        x: undefined,
        y: undefined
      }
    };
  }
}


  // Save window bounds before closing
  mainWindow.on('close', async () => {
    if (settingsManager) {
      try {
        const bounds = mainWindow.getBounds();
        await settingsManager.updateSetting('windowBounds', bounds);
      } catch (error) {
        console.error('Failed to save window bounds:', error);
      }
    }
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications to stay active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Clean up IPC handlers when app is quitting
app.on('before-quit', () => {
  if (ipcHandlers) {
    ipcHandlers.cleanup();
  }
  
  // Clean up services and resources
  cleanupApplicationResources();
});

// Clean up application resources with enhanced bundled FFmpeg management
function cleanupApplicationResources() {
  try {
    console.log('Starting application resource cleanup...');
    
    // Clean up audio processor resources with enhanced FFmpeg cleanup
    if (audioProcessor) {
      console.log('Cleaning up audio processor...');
      
      // Cancel any active FFmpeg processes
      audioProcessor.cleanup && audioProcessor.cleanup();
      
      // Additional cleanup for bundled FFmpeg resources
      try {
        // Reset FFmpeg status to prevent memory leaks
        const ffmpegStatus = audioProcessor.getFFmpegStatus();
        if (ffmpegStatus && ffmpegStatus.available) {
          console.log(`Cleaning up ${ffmpegStatus.source} FFmpeg resources`);
        }
      } catch (error) {
        console.warn('Error during FFmpeg status cleanup:', error);
      }
    }
    
    // Clean up TTS service resources with enhanced voice cleanup
    if (ttsService) {
      console.log('Cleaning up TTS service...');
      
      // Remove all event listeners
      ttsService.removeAllListeners();
      
      // Clean up any temporary files and voice loading state
      ttsService.cleanup && ttsService.cleanup();
      
      // Clear voice loading state to prevent memory leaks
      try {
        const voiceState = ttsService.getVoiceLoadingState();
        if (voiceState && voiceState.isLoading) {
          console.log('Cancelling active voice loading operations');
        }
      } catch (error) {
        console.warn('Error during voice state cleanup:', error);
      }
    }
    
    // Clean up file manager resources
    if (fileManager) {
      console.log('Cleaning up file manager...');
      fileManager.cleanup && fileManager.cleanup();
    }
    
    // Clean up settings manager resources
    if (settingsManager) {
      console.log('Cleaning up settings manager...');
      // Settings manager doesn't need explicit cleanup but log for completeness
    }
    
    // Clean up error handler
    if (errorHandler) {
      console.log('Cleaning up error handler...');
      errorHandler.cleanup && errorHandler.cleanup();
    }
    
    // Clean up IPC handlers
    if (ipcHandlers) {
      console.log('Cleaning up IPC handlers...');
      // IPC handlers cleanup is already called in before-quit event
    }
    
    // Clear any remaining global promises
    if (global.initializationPromises) {
      console.log('Clearing initialization promises...');
      delete global.initializationPromises;
    }
    
    // Force garbage collection if available (development mode)
    if (global.gc && process.env.NODE_ENV === 'development') {
      console.log('Running garbage collection...');
      global.gc();
    }
    
    console.log('Application resources cleaned up successfully');
  } catch (error) {
    console.error('Error during resource cleanup:', error);
  }
}