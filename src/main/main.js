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
    
    // Initialize services asynchronously after window is shown
    initializeServicesAsync();
  });

  // Initialize services in background
  async function initializeServicesAsync() {
    try {
      perfMonitor.markStart('services-init');
      
      // Initialize services with staggered loading for better performance
      perfMonitor.markStart('error-handler-init');
      errorHandler = new ErrorHandler();
      await errorHandler.initialize();
      perfMonitor.markEnd('error-handler-init');
      
      perfMonitor.markStart('settings-manager-init');
      settingsManager = new SettingsManager();
      await settingsManager.initialize();
      perfMonitor.markEnd('settings-manager-init');
      
      // Initialize lightweight services first
      perfMonitor.markStart('file-services-init');
      fileManager = new FileManager();
      audioProcessor = new AudioProcessor();
      perfMonitor.markEnd('file-services-init');
      
      // Initialize TTS service (potentially slow) last
      perfMonitor.markStart('tts-service-init');
      ttsService = new TTSService();
      ttsService.setAudioProcessor(audioProcessor);
      
      // Initialize TTS service in background
      ttsService.initialize().then(() => {
        perfMonitor.markEnd('tts-service-init');
      }).catch(error => {
        perfMonitor.markEnd('tts-service-init');
        console.error('Failed to initialize TTS service:', error);
        // Send error to renderer for user notification
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tts:initialization-error', {
            message: 'Failed to initialize TTS service. Some features may not work properly.',
            error: error.message
          });
        }
      });
      
      // Initialize IPC handlers after core services are ready
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
      
      perfMonitor.markEnd('services-init');
      perfMonitor.markEnd('app-startup');
      
      // Log performance summary in development
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => perfMonitor.logStartupSummary(), 1000);
      }
      
      // Start memory monitoring
      perfMonitor.startMemoryMonitoring();
      
      // Notify renderer that services are ready
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('services:ready');
      }
      
    } catch (error) {
      perfMonitor.markEnd('services-init');
      perfMonitor.markEnd('app-startup');
      console.error('Failed to initialize services:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('services:error', {
          message: 'Failed to initialize application services',
          error: error.message
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
});