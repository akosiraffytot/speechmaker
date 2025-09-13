import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM elements for testing
const mockDOM = () => {
  global.document = {
    getElementById: vi.fn((id) => {
      const mockElement = {
        style: { display: '', width: '' },
        textContent: '',
        disabled: false,
        classList: { add: vi.fn(), remove: vi.fn() },
        remove: vi.fn(),
        parentElement: null
      };
      
      if (id === 'progressSection') {
        return mockElement;
      }
      if (id === 'progressFill') {
        return mockElement;
      }
      if (id === 'progressText') {
        return mockElement;
      }
      if (id === 'statusText') {
        return mockElement;
      }
      if (id === 'cancelBtn') {
        return mockElement;
      }
      if (id === 'convertBtn') {
        return mockElement;
      }
      
      return mockElement;
    }),
    createElement: vi.fn(() => ({
      className: '',
      innerHTML: '',
      classList: { add: vi.fn() },
      remove: vi.fn(),
      parentElement: { removeChild: vi.fn() }
    })),
    body: {
      appendChild: vi.fn()
    }
  };
  
  global.window = {
    electronAPI: {
      cancelConversion: vi.fn()
    }
  };
  
  global.setTimeout = vi.fn((fn) => fn());
};

// Mock ProgressManager class (extracted from renderer.js for testing)
class ProgressManager {
  constructor() {
    this.isActive = false;
    this.canCancel = false;
    this.currentPhase = '';
    this.totalPhases = 0;
    this.currentPhaseProgress = 0;
    this.overallProgress = 0;
  }

  start(phases = []) {
    this.isActive = true;
    this.canCancel = true;
    this.totalPhases = phases.length;
    this.currentPhase = phases[0] || 'Starting...';
    this.currentPhaseProgress = 0;
    this.overallProgress = 0;
    
    this.showProgressSection();
    this.updateDisplay();
    this.enableCancelButton();
  }

  updatePhase(phaseName, phaseProgress = 0) {
    if (!this.isActive) return;
    
    this.currentPhase = phaseName;
    this.currentPhaseProgress = Math.max(0, Math.min(100, phaseProgress));
    this.updateDisplay();
  }

  updateOverallProgress(progress) {
    if (!this.isActive) return;
    
    this.overallProgress = Math.max(0, Math.min(100, progress));
    this.updateDisplay();
  }

  complete(message = 'Conversion completed successfully!') {
    this.isActive = false;
    this.canCancel = false;
    this.overallProgress = 100;
    this.currentPhase = message;
    
    this.updateDisplay();
    this.disableCancelButton();
    this.showSuccessNotification(message);
  }

  error(errorMessage) {
    this.isActive = false;
    this.canCancel = false;
    this.currentPhase = 'Conversion failed';
    
    this.updateDisplay();
    this.disableCancelButton();
    this.showErrorNotification(errorMessage);
  }

  cancel() {
    if (!this.canCancel) return;
    
    this.isActive = false;
    this.canCancel = false;
    this.currentPhase = 'Cancelling...';
    
    this.updateDisplay();
    this.disableCancelButton();
  }

  showProgressSection() {
    const progressSection = document.getElementById('progressSection');
    const convertBtn = document.getElementById('convertBtn');
    if (progressSection) progressSection.style.display = 'block';
    if (convertBtn) convertBtn.disabled = true;
  }

  updateDisplay() {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const statusText = document.getElementById('statusText');
    
    if (progressFill) progressFill.style.width = `${this.overallProgress}%`;
    if (progressText) progressText.textContent = `${Math.round(this.overallProgress)}%`;
    if (statusText) statusText.textContent = this.currentPhase;
  }

  enableCancelButton() {
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.style.display = 'inline-block';
      cancelBtn.disabled = false;
    }
  }

  disableCancelButton() {
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }
  }

  showSuccessNotification(message) {
    this.showNotification(message, 'success');
  }

  showErrorNotification(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    document.body.appendChild(notification);
  }
}

describe('ProgressManager', () => {
  let progressManager;

  beforeEach(() => {
    mockDOM();
    progressManager = new ProgressManager();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(progressManager.isActive).toBe(false);
      expect(progressManager.canCancel).toBe(false);
      expect(progressManager.currentPhase).toBe('');
      expect(progressManager.overallProgress).toBe(0);
    });
  });

  describe('start', () => {
    it('should start progress tracking with phases', () => {
      const phases = ['Phase 1', 'Phase 2', 'Phase 3'];
      progressManager.start(phases);

      expect(progressManager.isActive).toBe(true);
      expect(progressManager.canCancel).toBe(true);
      expect(progressManager.totalPhases).toBe(3);
      expect(progressManager.currentPhase).toBe('Phase 1');
      expect(progressManager.overallProgress).toBe(0);
    });

    it('should start with default phase when no phases provided', () => {
      progressManager.start();

      expect(progressManager.isActive).toBe(true);
      expect(progressManager.currentPhase).toBe('Starting...');
      expect(progressManager.totalPhases).toBe(0);
    });

    it('should show progress section and disable convert button', () => {
      const progressSection = document.getElementById('progressSection');
      const convertBtn = document.getElementById('convertBtn');
      
      progressManager.start(['Phase 1']);

      expect(progressSection.style.display).toBe('block');
      expect(convertBtn.disabled).toBe(true);
    });
  });

  describe('updatePhase', () => {
    beforeEach(() => {
      progressManager.start(['Phase 1']);
    });

    it('should update current phase and progress', () => {
      progressManager.updatePhase('Phase 2', 50);

      expect(progressManager.currentPhase).toBe('Phase 2');
      expect(progressManager.currentPhaseProgress).toBe(50);
    });

    it('should clamp phase progress between 0 and 100', () => {
      progressManager.updatePhase('Phase 2', 150);
      expect(progressManager.currentPhaseProgress).toBe(100);

      progressManager.updatePhase('Phase 3', -10);
      expect(progressManager.currentPhaseProgress).toBe(0);
    });

    it('should not update when not active', () => {
      progressManager.isActive = false;
      const originalPhase = progressManager.currentPhase;
      
      progressManager.updatePhase('New Phase', 75);
      
      expect(progressManager.currentPhase).toBe(originalPhase);
    });
  });

  describe('updateOverallProgress', () => {
    beforeEach(() => {
      progressManager.start(['Phase 1']);
    });

    it('should update overall progress', () => {
      progressManager.updateOverallProgress(75);
      expect(progressManager.overallProgress).toBe(75);
    });

    it('should clamp progress between 0 and 100', () => {
      progressManager.updateOverallProgress(150);
      expect(progressManager.overallProgress).toBe(100);

      progressManager.updateOverallProgress(-10);
      expect(progressManager.overallProgress).toBe(0);
    });

    it('should update progress display', () => {
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');
      
      progressManager.updateOverallProgress(75);
      
      expect(progressFill.style.width).toBe('75%');
      expect(progressText.textContent).toBe('75%');
    });
  });

  describe('complete', () => {
    beforeEach(() => {
      progressManager.start(['Phase 1']);
    });

    it('should complete progress with success message', () => {
      const message = 'All done!';
      progressManager.complete(message);

      expect(progressManager.isActive).toBe(false);
      expect(progressManager.canCancel).toBe(false);
      expect(progressManager.overallProgress).toBe(100);
      expect(progressManager.currentPhase).toBe(message);
    });

    it('should use default message when none provided', () => {
      progressManager.complete();
      expect(progressManager.currentPhase).toBe('Conversion completed successfully!');
    });

    it('should disable cancel button', () => {
      const cancelBtn = document.getElementById('cancelBtn');
      progressManager.complete();
      expect(cancelBtn.disabled).toBe(true);
    });
  });

  describe('error', () => {
    beforeEach(() => {
      progressManager.start(['Phase 1']);
    });

    it('should handle error state', () => {
      const errorMessage = 'Something went wrong';
      progressManager.error(errorMessage);

      expect(progressManager.isActive).toBe(false);
      expect(progressManager.canCancel).toBe(false);
      expect(progressManager.currentPhase).toBe('Conversion failed');
    });

    it('should disable cancel button on error', () => {
      const cancelBtn = document.getElementById('cancelBtn');
      progressManager.error('Error occurred');
      expect(cancelBtn.disabled).toBe(true);
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      progressManager.start(['Phase 1']);
    });

    it('should cancel active conversion', () => {
      progressManager.cancel();

      expect(progressManager.isActive).toBe(false);
      expect(progressManager.canCancel).toBe(false);
      expect(progressManager.currentPhase).toBe('Cancelling...');
    });

    it('should not cancel when not cancellable', () => {
      progressManager.canCancel = false;
      const originalPhase = progressManager.currentPhase;
      
      progressManager.cancel();
      
      expect(progressManager.currentPhase).toBe(originalPhase);
    });

    it('should disable cancel button', () => {
      const cancelBtn = document.getElementById('cancelBtn');
      progressManager.cancel();
      expect(cancelBtn.disabled).toBe(true);
    });
  });

  describe('notifications', () => {
    it('should create success notification', () => {
      const createElement = vi.spyOn(document, 'createElement');
      const appendChild = vi.spyOn(document.body, 'appendChild');
      
      progressManager.showSuccessNotification('Success!');
      
      expect(createElement).toHaveBeenCalledWith('div');
      expect(appendChild).toHaveBeenCalled();
    });

    it('should create error notification', () => {
      const createElement = vi.spyOn(document, 'createElement');
      const appendChild = vi.spyOn(document.body, 'appendChild');
      
      progressManager.showErrorNotification('Error!');
      
      expect(createElement).toHaveBeenCalledWith('div');
      expect(appendChild).toHaveBeenCalled();
    });
  });
});