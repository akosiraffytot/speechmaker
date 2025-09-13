import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure IPC Bridge for Renderer Process
 * Exposes safe IPC methods to the renderer while maintaining security
 * Requirements: 6.2, 6.3, 5.3
 */

// Validate channel names to prevent unauthorized access
const ALLOWED_CHANNELS = {
  // TTS operations
  'tts:getVoices': true,
  'tts:convert': true,
  'tts:cancel': true,
  'tts:preview': true,
  'tts:progress': true,
  'tts:complete': true,
  'tts:error': true,
  'tts:cancelled': true,
  'tts:initialization-error': true,
  
  // File operations
  'file:select': true,
  'file:selectFolder': true,
  'file:validate': true,
  
  // Settings operations
  'settings:load': true,
  'settings:save': true,
  'settings:update': true,
  'settings:reset': true,
  'settings:getDefaults': true,
  
  // System operations
  'system:checkFFmpeg': true,
  'system:getVersion': true,
  
  // Error handling
  'ipc:error': true,
  'tts:retry': true,
  
  // Service initialization
  'services:ready': true,
  'services:error': true,
  
  // Error management
  'error:getRecent': true,
  'error:getStatistics': true,
  'error:clear': true,
  'error:resetRetries': true
};

/**
 * Secure IPC invoke wrapper with error handling
 */
function secureInvoke(channel, ...args) {
  if (!ALLOWED_CHANNELS[channel]) {
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
  
  return ipcRenderer.invoke(channel, ...args).catch(error => {
    console.error(`IPC Error on channel ${channel}:`, error);
    throw error;
  });
}

/**
 * Secure IPC listener wrapper with validation
 */
function secureOn(channel, callback) {
  if (!ALLOWED_CHANNELS[channel]) {
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
  
  const wrappedCallback = (event, ...args) => {
    try {
      callback(event, ...args);
    } catch (error) {
      console.error(`Error in IPC listener for ${channel}:`, error);
    }
  };
  
  ipcRenderer.on(channel, wrappedCallback);
  return () => ipcRenderer.removeListener(channel, wrappedCallback);
}

/**
 * Secure IPC once listener wrapper
 */
function secureOnce(channel, callback) {
  if (!ALLOWED_CHANNELS[channel]) {
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
  
  const wrappedCallback = (event, ...args) => {
    try {
      callback(event, ...args);
    } catch (error) {
      console.error(`Error in IPC once listener for ${channel}:`, error);
    }
  };
  
  ipcRenderer.once(channel, wrappedCallback);
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // TTS operations
  getAvailableVoices: () => secureInvoke('tts:getVoices'),
  convertTextToSpeech: (data) => {
    // Validate conversion data before sending
    if (!data || typeof data !== 'object') {
      throw new Error('Conversion data is required');
    }
    return secureInvoke('tts:convert', data);
  },
  cancelConversion: (jobId) => {
    if (!jobId || typeof jobId !== 'string') {
      throw new Error('Job ID is required');
    }
    return secureInvoke('tts:cancel', jobId);
  },
  previewVoiceSpeed: (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Preview data is required');
    }
    return secureInvoke('tts:preview', data);
  },
  
  // File operations
  selectFile: () => secureInvoke('file:select'),
  selectOutputFolder: () => secureInvoke('file:selectFolder'),
  validateFile: (filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required');
    }
    return secureInvoke('file:validate', filePath);
  },
  
  // Settings operations
  settings: {
    load: () => secureInvoke('settings:load'),
    save: (settings) => {
      if (!settings || typeof settings !== 'object') {
        throw new Error('Settings object is required');
      }
      return secureInvoke('settings:save', settings);
    },
    update: (key, value) => {
      if (!key || typeof key !== 'string') {
        throw new Error('Setting key is required');
      }
      return secureInvoke('settings:update', key, value);
    },
    reset: () => secureInvoke('settings:reset'),
    getDefaults: () => secureInvoke('settings:getDefaults')
  },
  
  // System operations
  checkFFmpeg: () => secureInvoke('system:checkFFmpeg'),
  getVersion: () => secureInvoke('system:getVersion'),
  
  // Error management
  error: {
    getRecent: (limit) => secureInvoke('error:getRecent', limit),
    getStatistics: () => secureInvoke('error:getStatistics'),
    clear: () => secureInvoke('error:clear'),
    resetRetries: (key) => secureInvoke('error:resetRetries', key)
  },
  
  // External links (for error guidance)
  openExternal: (url) => {
    // This would need to be implemented in main process
    console.log('Open external URL:', url);
  },
  
  // Event listeners with automatic cleanup
  onTTSProgress: (callback) => secureOn('tts:progress', callback),
  onTTSComplete: (callback) => secureOn('tts:complete', callback),
  onTTSError: (callback) => secureOn('tts:error', callback),
  onTTSCancelled: (callback) => secureOn('tts:cancelled', callback),
  onIPCError: (callback) => secureOn('ipc:error', callback),
  onRetryAttempt: (callback) => secureOn('tts:retry', callback),
  onServiceReady: (callback) => secureOn('services:ready', callback),
  onServiceError: (callback) => secureOn('services:error', callback),
  onTTSInitError: (callback) => secureOn('tts:initialization-error', callback),
  
  // Legacy support for existing renderer code
  onProgressUpdate: (callback) => secureOn('tts:progress', callback),
  onConversionComplete: (callback) => secureOn('tts:complete', callback),
  onConversionError: (callback) => secureOn('tts:error', callback),
  onConversionCancelled: (callback) => secureOn('tts:cancelled', callback),
  
  // Listener management
  removeAllListeners: (channel) => {
    if (!ALLOWED_CHANNELS[channel]) {
      console.warn(`Cannot remove listeners for unauthorized channel: ${channel}`);
      return;
    }
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Utility methods
  isChannelAllowed: (channel) => Boolean(ALLOWED_CHANNELS[channel]),
  getAllowedChannels: () => Object.keys(ALLOWED_CHANNELS)
});