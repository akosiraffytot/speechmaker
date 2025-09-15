/**
 * Integration tests for intelligent format option management
 * Tests the dynamic MP3 option enabling/disabling based on FFmpeg availability
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import StateManager from '../src/renderer/components/StateManager.js';

// Mock DOM environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head>
    <title>Test</title>
</head>
<body>
    <div class="radio-group">
        <input type="radio" id="formatWav" name="outputFormat" value="wav" checked>
        <label for="formatWav">WAV</label>
        <input type="radio" id="formatMp3" name="outputFormat" value="mp3">
        <label for="formatMp3">MP3</label>
    </div>
    <div id="statusText">Ready</div>
    <button id="convertBtn">Convert</button>
</body>
</html>
`);

global.document = dom.window.document;
global.window = dom.window;

describe('Format Option Management', () => {
    let stateManager;
    let formatWav;
    let formatMp3;
    let formatMp3Label;

    beforeEach(() => {
        // Reset DOM
        formatWav = document.getElementById('formatWav');
        formatMp3 = document.getElementById('formatMp3');
        formatMp3Label = document.querySelector('label[for="formatMp3"]');
        
        // Reset format selections
        formatWav.checked = true;
        formatMp3.checked = false;
        formatMp3.disabled = false;
        formatMp3Label.classList.remove('disabled', 'enabled');
        formatMp3Label.title = '';
        
        // Clear any existing indicators
        const existingIndicators = document.querySelectorAll('.format-availability-indicator, .ffmpeg-status-indicator');
        existingIndicators.forEach(indicator => indicator.remove());
        
        // Create fresh StateManager instance
        stateManager = new StateManager();
        
        // Mock console methods to avoid noise in tests
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('MP3 Format Enabling', () => {
        it('should enable MP3 option when FFmpeg becomes available', () => {
            // Initially no FFmpeg
            stateManager.updateFFmpegState(false, 'none', false);
            expect(formatMp3.disabled).toBe(true);
            expect(formatMp3Label.classList.contains('disabled')).toBe(true);

            // FFmpeg becomes available
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            expect(formatMp3.disabled).toBe(false);
            expect(formatMp3Label.classList.contains('disabled')).toBe(false);
            expect(formatMp3Label.classList.contains('enabled')).toBe(true);
            expect(formatMp3Label.title).toContain('MP3 format available');
        });

        it('should show correct tooltip for bundled FFmpeg', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            expect(formatMp3Label.title).toContain('bundled FFmpeg');
        });

        it('should show correct tooltip for system FFmpeg', () => {
            stateManager.updateFFmpegState(true, 'system', true);
            
            expect(formatMp3Label.title).toContain('system FFmpeg');
        });

        it('should create format availability indicator when MP3 becomes available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const indicator = document.querySelector('.format-availability-indicator');
            expect(indicator).toBeTruthy();
            expect(indicator.classList.contains('success')).toBe(true);
            expect(indicator.textContent).toContain('Both WAV and MP3 formats available');
        });
    });

    describe('MP3 Format Disabling', () => {
        beforeEach(() => {
            // Start with MP3 available
            stateManager.updateFFmpegState(true, 'bundled', true);
        });

        it('should disable MP3 option when FFmpeg becomes unavailable', () => {
            // FFmpeg becomes unavailable
            stateManager.updateFFmpegState(false, 'none', false);
            
            expect(formatMp3.disabled).toBe(true);
            expect(formatMp3Label.classList.contains('disabled')).toBe(true);
            expect(formatMp3Label.classList.contains('enabled')).toBe(false);
        });

        it('should automatically select WAV when MP3 is selected and becomes unavailable', () => {
            // Select MP3 first
            formatMp3.checked = true;
            formatWav.checked = false;
            
            // FFmpeg becomes unavailable
            stateManager.updateFFmpegState(false, 'none', false);
            
            expect(formatMp3.checked).toBe(false);
            expect(formatWav.checked).toBe(true);
        });

        it('should show warning indicator when MP3 becomes unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const indicator = document.querySelector('.format-availability-indicator');
            expect(indicator).toBeTruthy();
            expect(indicator.classList.contains('warning')).toBe(true);
            expect(indicator.textContent).toContain('Only WAV format available');
        });

        it('should show appropriate tooltip for different unavailability reasons', () => {
            // FFmpeg not found
            stateManager.updateFFmpegState(false, 'none', false);
            expect(formatMp3Label.title).toContain('FFmpeg not found');

            // FFmpeg found but not validated
            stateManager.updateFFmpegState(false, 'system', false);
            expect(formatMp3Label.title).toContain('FFmpeg validation failed');

            // FFmpeg not available (other reason) - when available=false but validated=false
            stateManager.updateFFmpegState(false, 'bundled', false);
            expect(formatMp3Label.title).toContain('FFmpeg validation failed');
        });
    });

    describe('Format Selection Validation', () => {
        it('should validate WAV format selection (always valid)', () => {
            const validation = stateManager.validateFormatSelection('wav');
            expect(validation.valid).toBe(true);
        });

        it('should validate MP3 format when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const validation = stateManager.validateFormatSelection('mp3');
            expect(validation.valid).toBe(true);
        });

        it('should invalidate MP3 format when FFmpeg is unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const validation = stateManager.validateFormatSelection('mp3');
            expect(validation.valid).toBe(false);
            expect(validation.reason).toContain('FFmpeg is required');
            expect(validation.suggestedFormat).toBe('wav');
        });

        it('should invalidate unknown formats', () => {
            const validation = stateManager.validateFormatSelection('ogg');
            expect(validation.valid).toBe(false);
            expect(validation.reason).toContain('Invalid format');
            expect(validation.suggestedFormat).toBe('wav');
        });
    });

    describe('Format Selection Management', () => {
        it('should get currently selected format', () => {
            formatWav.checked = true;
            formatMp3.checked = false;
            expect(stateManager.getSelectedFormat()).toBe('wav');

            formatWav.checked = false;
            formatMp3.checked = true;
            expect(stateManager.getSelectedFormat()).toBe('mp3');
        });

        it('should set WAV format successfully', () => {
            const result = stateManager.setSelectedFormat('wav');
            expect(result).toBe(true);
            expect(formatWav.checked).toBe(true);
            expect(formatMp3.checked).toBe(false);
        });

        it('should set MP3 format when available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const result = stateManager.setSelectedFormat('mp3');
            expect(result).toBe(true);
            expect(formatMp3.checked).toBe(true);
            expect(formatWav.checked).toBe(false);
        });

        it('should fail to set MP3 format when unavailable and auto-select WAV', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const result = stateManager.setSelectedFormat('mp3');
            expect(result).toBe(false);
            expect(formatWav.checked).toBe(true);
            expect(formatMp3.checked).toBe(false);
        });

        it('should force set MP3 format even when unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const result = stateManager.setSelectedFormat('mp3', true);
            expect(result).toBe(true);
            expect(formatMp3.checked).toBe(true);
            expect(formatWav.checked).toBe(false);
        });
    });

    describe('Available Formats Information', () => {
        it('should return correct available formats when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const formats = stateManager.getAvailableFormats();
            expect(formats).toHaveLength(2);
            
            const wavFormat = formats.find(f => f.value === 'wav');
            const mp3Format = formats.find(f => f.value === 'mp3');
            
            expect(wavFormat.available).toBe(true);
            expect(mp3Format.available).toBe(true);
            expect(mp3Format.requiresFFmpeg).toBe(true);
        });

        it('should return correct available formats when FFmpeg is unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const formats = stateManager.getAvailableFormats();
            expect(formats).toHaveLength(2);
            
            const wavFormat = formats.find(f => f.value === 'wav');
            const mp3Format = formats.find(f => f.value === 'mp3');
            
            expect(wavFormat.available).toBe(true);
            expect(mp3Format.available).toBe(false);
            expect(mp3Format.description).toContain('Requires FFmpeg');
        });
    });

    describe('Format Recommendations', () => {
        it('should recommend MP3 when available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            const recommendations = stateManager.getFormatRecommendations();
            expect(recommendations.recommended).toBe('mp3');
            expect(recommendations.reasons.mp3).toContain('Smaller file size');
            expect(recommendations.ffmpegStatus.available).toBe(true);
        });

        it('should recommend WAV when MP3 is unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            
            const recommendations = stateManager.getFormatRecommendations();
            expect(recommendations.recommended).toBe('wav');
            expect(recommendations.reasons.mp3).toContain('Not available');
            expect(recommendations.ffmpegStatus.available).toBe(false);
        });
    });

    describe('Real-time Format Updates', () => {
        it('should handle MP3 becoming available during runtime', () => {
            // Start with no FFmpeg
            stateManager.updateFFmpegState(false, 'none', false);
            expect(stateManager.canConvertToMp3()).toBe(false);

            // Mock notification creation to avoid DOM manipulation issues
            const mockShowNotification = vi.spyOn(stateManager, 'showFormatStatusNotification').mockImplementation(() => {});

            // FFmpeg becomes available
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            expect(stateManager.canConvertToMp3()).toBe(true);
            expect(formatMp3.disabled).toBe(false);
            expect(mockShowNotification).toHaveBeenCalledWith(
                'MP3 format is now available!',
                'success',
                expect.stringContaining('FFmpeg is ready')
            );
        });

        it('should handle MP3 becoming unavailable during runtime', () => {
            // Start with FFmpeg available
            stateManager.updateFFmpegState(true, 'bundled', true);
            formatMp3.checked = true;
            formatWav.checked = false;

            // Mock notification creation
            const mockShowNotification = vi.spyOn(stateManager, 'showFormatStatusNotification').mockImplementation(() => {});

            // FFmpeg becomes unavailable
            stateManager.updateFFmpegState(false, 'none', false);
            
            expect(stateManager.canConvertToMp3()).toBe(false);
            expect(formatMp3.disabled).toBe(true);
            expect(formatMp3.checked).toBe(false);
            expect(formatWav.checked).toBe(true);
            expect(mockShowNotification).toHaveBeenCalledWith(
                'MP3 format is no longer available',
                'warning',
                expect.stringContaining('FFmpeg connection lost')
            );
        });
    });

    describe('Event Notifications', () => {
        it('should notify listeners of format availability changes', () => {
            const mockListener = vi.fn();
            stateManager.addEventListener('formatAvailability', mockListener);

            stateManager.updateFFmpegState(true, 'bundled', true);
            
            expect(mockListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    mp3Available: true,
                    ffmpegSource: 'bundled',
                    ffmpegValidated: true
                })
            );
        });

        it('should notify listeners of automatic format changes', () => {
            const mockListener = vi.fn();
            stateManager.addEventListener('automaticFormatChange', mockListener);

            // Start with MP3 selected
            stateManager.updateFFmpegState(true, 'bundled', true);
            formatMp3.checked = true;
            formatWav.checked = false;

            // FFmpeg becomes unavailable
            stateManager.updateFFmpegState(false, 'none', false);
            
            expect(mockListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    newFormat: 'wav',
                    reason: 'mp3_unavailable'
                })
            );
        });
    });

    describe('Container Styling', () => {
        it('should update container styling when MP3 becomes available', () => {
            const container = formatMp3.closest('.radio-group');
            
            stateManager.updateFFmpegState(true, 'bundled', true);
            
            expect(container.classList.contains('mp3-available')).toBe(true);
            expect(container.classList.contains('mp3-unavailable')).toBe(false);
            expect(container.getAttribute('data-mp3-available')).toBe('true');
        });

        it('should update container styling when MP3 becomes unavailable', () => {
            const container = formatMp3.closest('.radio-group');
            
            stateManager.updateFFmpegState(false, 'none', false);
            
            expect(container.classList.contains('mp3-available')).toBe(false);
            expect(container.classList.contains('mp3-unavailable')).toBe(true);
            expect(container.getAttribute('data-mp3-available')).toBe('false');
        });
    });

    describe('Integration with Conversion Validation', () => {
        it('should prevent conversion with MP3 when FFmpeg is unavailable', () => {
            stateManager.updateFFmpegState(false, 'none', false);
            formatMp3.checked = true;
            formatWav.checked = false;
            
            // This would be called by the conversion process
            const canConvert = stateManager.canConvertToMp3();
            const selectedFormat = stateManager.getSelectedFormat();
            
            expect(canConvert).toBe(false);
            expect(selectedFormat).toBe('mp3'); // Still selected but invalid
            
            // Validation should catch this
            const validation = stateManager.validateFormatSelection(selectedFormat);
            expect(validation.valid).toBe(false);
        });

        it('should allow conversion with MP3 when FFmpeg is available', () => {
            stateManager.updateFFmpegState(true, 'bundled', true);
            formatMp3.checked = true;
            formatWav.checked = false;
            
            const canConvert = stateManager.canConvertToMp3();
            const selectedFormat = stateManager.getSelectedFormat();
            
            expect(canConvert).toBe(true);
            expect(selectedFormat).toBe('mp3');
            
            const validation = stateManager.validateFormatSelection(selectedFormat);
            expect(validation.valid).toBe(true);
        });
    });
});