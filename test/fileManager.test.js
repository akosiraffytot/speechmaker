import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { existsSync, accessSync, constants, statSync } from 'fs';
import path from 'path';
import os from 'os';
import FileManager from '../src/main/services/fileManager.js';

// Mock the fs modules
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('path');
vi.mock('os');

describe('FileManager', () => {
    let fileManager;

    beforeEach(() => {
        fileManager = new FileManager();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with correct default values', () => {
            expect(fileManager.supportedTextExtensions).toEqual(['.txt']);
            expect(fileManager.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
        });
    });

    describe('readTextFile', () => {
        const mockFilePath = '/test/file.txt';
        const mockContent = 'Test file content';

        beforeEach(() => {
            // Setup default mocks for successful case
            existsSync.mockReturnValue(true);
            path.extname.mockReturnValue('.txt');
            fs.stat.mockResolvedValue({ size: 1024 }); // 1KB file
            accessSync.mockReturnValue(undefined); // No error means success
            fs.readFile.mockResolvedValue(mockContent);
        });

        it('should successfully read a valid text file', async () => {
            const result = await fileManager.readTextFile(mockFilePath);
            
            expect(result).toBe(mockContent);
            expect(existsSync).toHaveBeenCalledWith(mockFilePath);
            expect(path.extname).toHaveBeenCalledWith(mockFilePath);
            expect(fs.stat).toHaveBeenCalledWith(mockFilePath);
            expect(accessSync).toHaveBeenCalledWith(mockFilePath, constants.R_OK);
            expect(fs.readFile).toHaveBeenCalledWith(mockFilePath, 'utf8');
        });

        it('should throw error for invalid file path', async () => {
            await expect(fileManager.readTextFile(null)).rejects.toThrow('Invalid file path provided');
            await expect(fileManager.readTextFile('')).rejects.toThrow('Invalid file path provided');
            await expect(fileManager.readTextFile(123)).rejects.toThrow('Invalid file path provided');
        });

        it('should throw error if file does not exist', async () => {
            existsSync.mockReturnValue(false);
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow(`File not found: ${mockFilePath}`);
        });

        it('should throw error for unsupported file extension', async () => {
            path.extname.mockReturnValue('.pdf');
            
            await expect(fileManager.readTextFile('/test/file.pdf')).rejects.toThrow('Unsupported file type: .pdf. Only .txt files are supported.');
        });

        it('should throw error for files that are too large', async () => {
            fs.stat.mockResolvedValue({ size: 15 * 1024 * 1024 }); // 15MB file
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow('File too large: 15.00MB. Maximum size is 10MB.');
        });

        it('should throw error for permission denied', async () => {
            accessSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow(`Cannot read file: Permission denied for ${mockFilePath}`);
        });

        it('should throw error for empty file', async () => {
            fs.readFile.mockResolvedValue('   '); // Only whitespace
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow('File is empty or contains no readable text');
        });

        it('should handle ENOENT error code', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            fs.readFile.mockRejectedValue(error);
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow(`File not found: ${mockFilePath}`);
        });

        it('should handle EACCES error code', async () => {
            const error = new Error('Access denied');
            error.code = 'EACCES';
            fs.readFile.mockRejectedValue(error);
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow(`Access denied: Cannot read file ${mockFilePath}. Check file permissions.`);
        });

        it('should handle EISDIR error code', async () => {
            const error = new Error('Is directory');
            error.code = 'EISDIR';
            fs.readFile.mockRejectedValue(error);
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow(`Invalid file: ${mockFilePath} is a directory, not a file.`);
        });

        it('should handle EMFILE error code', async () => {
            const error = new Error('Too many files');
            error.code = 'EMFILE';
            fs.readFile.mockRejectedValue(error);
            
            await expect(fileManager.readTextFile(mockFilePath)).rejects.toThrow('Too many files open. Please close some applications and try again.');
        });
    });

    describe('validateOutputDirectory', () => {
        const mockDirPath = '/test/output';

        beforeEach(() => {
            existsSync.mockReturnValue(true);
            statSync.mockReturnValue({ isDirectory: () => true });
            accessSync.mockReturnValue(undefined); // No error means success
        });

        it('should return true for valid writable directory', () => {
            const result = fileManager.validateOutputDirectory(mockDirPath);
            
            expect(result).toBe(true);
            expect(existsSync).toHaveBeenCalledWith(mockDirPath);
            expect(statSync).toHaveBeenCalledWith(mockDirPath);
            expect(accessSync).toHaveBeenCalledWith(mockDirPath, constants.W_OK);
        });

        it('should return false for invalid directory path', () => {
            expect(fileManager.validateOutputDirectory(null)).toBe(false);
            expect(fileManager.validateOutputDirectory('')).toBe(false);
            expect(fileManager.validateOutputDirectory(123)).toBe(false);
        });

        it('should return false if directory does not exist', () => {
            existsSync.mockReturnValue(false);
            
            const result = fileManager.validateOutputDirectory(mockDirPath);
            expect(result).toBe(false);
        });

        it('should return false if path is not a directory', () => {
            statSync.mockReturnValue({ isDirectory: () => false });
            
            const result = fileManager.validateOutputDirectory(mockDirPath);
            expect(result).toBe(false);
        });

        it('should return false if directory is not writable', () => {
            accessSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });
            
            const result = fileManager.validateOutputDirectory(mockDirPath);
            expect(result).toBe(false);
        });
    });

    describe('generateUniqueFileName', () => {
        const mockOutputDir = '/test/output';
        const mockBaseName = 'test_file';
        const mockExtension = '.wav';

        beforeEach(() => {
            path.join.mockImplementation((...args) => args.join('/'));
        });

        it('should generate filename when no conflict exists', () => {
            existsSync.mockReturnValue(false);
            
            const result = fileManager.generateUniqueFileName(mockOutputDir, mockBaseName, mockExtension);
            
            expect(result).toBe('/test/output/test_file.wav');
            expect(path.join).toHaveBeenCalledWith(mockOutputDir, 'test_file.wav');
        });

        it('should generate unique filename when conflict exists', () => {
            existsSync
                .mockReturnValueOnce(true)  // First filename exists
                .mockReturnValueOnce(true)  // Second filename exists
                .mockReturnValueOnce(false); // Third filename is unique
            
            const result = fileManager.generateUniqueFileName(mockOutputDir, mockBaseName, mockExtension);
            
            expect(result).toBe('/test/output/test_file_2.wav');
            expect(existsSync).toHaveBeenCalledTimes(3);
        });

        it('should sanitize invalid characters in base name', () => {
            existsSync.mockReturnValue(false);
            const invalidBaseName = 'test<>:"/\\|?*file';
            
            const result = fileManager.generateUniqueFileName(mockOutputDir, invalidBaseName, mockExtension);
            
            expect(result).toBe('/test/output/test_________file.wav');
        });

        it('should throw error for missing parameters', () => {
            expect(() => fileManager.generateUniqueFileName(null, mockBaseName, mockExtension))
                .toThrow('Missing required parameters for filename generation');
            expect(() => fileManager.generateUniqueFileName(mockOutputDir, null, mockExtension))
                .toThrow('Missing required parameters for filename generation');
            expect(() => fileManager.generateUniqueFileName(mockOutputDir, mockBaseName, null))
                .toThrow('Missing required parameters for filename generation');
        });
    });

    describe('getFileErrorDetails', () => {
        it('should return detailed error information for ENOENT', () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            const filePath = '/test/missing.txt';
            
            path.basename.mockReturnValue('missing.txt');
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.errorCode).toBe('ENOENT');
            expect(result.userMessage).toBe('File not found: missing.txt');
            expect(result.troubleshooting).toContain('Check if the file exists at the specified location');
        });

        it('should return detailed error information for EACCES', () => {
            const error = new Error('Access denied');
            error.code = 'EACCES';
            const filePath = '/test/protected.txt';
            
            path.basename.mockReturnValue('protected.txt');
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.errorCode).toBe('EACCES');
            expect(result.userMessage).toBe('Access denied: Cannot read protected.txt');
            expect(result.troubleshooting).toContain('Check if the file is open in another application');
        });

        it('should return detailed error information for EISDIR', () => {
            const error = new Error('Is directory');
            error.code = 'EISDIR';
            const filePath = '/test/folder';
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.errorCode).toBe('EISDIR');
            expect(result.userMessage).toBe('Invalid selection: You selected a folder instead of a file');
            expect(result.troubleshooting).toContain('Please select a .txt file, not a folder');
        });

        it('should return detailed error information for EMFILE', () => {
            const error = new Error('Too many files');
            error.code = 'EMFILE';
            const filePath = '/test/file.txt';
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.errorCode).toBe('EMFILE');
            expect(result.userMessage).toBe('Too many files are currently open');
            expect(result.troubleshooting).toContain('Close some applications and try again');
        });

        it('should handle unsupported file type error', () => {
            const error = new Error('Unsupported file type: .pdf');
            const filePath = '/test/file.pdf';
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.userMessage).toBe('Unsupported file type: .pdf');
            expect(result.troubleshooting).toContain('Only .txt files are supported');
        });

        it('should handle file too large error', () => {
            const error = new Error('File too large: 15.00MB');
            const filePath = '/test/large.txt';
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.userMessage).toBe('File too large: 15.00MB');
            expect(result.troubleshooting).toContain('Split the file into smaller parts');
        });

        it('should handle unknown errors', () => {
            const error = new Error('Unknown error');
            const filePath = '/test/file.txt';
            
            const result = fileManager.getFileErrorDetails(filePath, error);
            
            expect(result.errorCode).toBe('UNKNOWN');
            expect(result.userMessage).toBe('Unexpected error: Unknown error');
            expect(result.troubleshooting).toContain('Try selecting a different file');
        });
    });

    describe('ensureDirectoryExists', () => {
        it('should create directory successfully', async () => {
            fs.mkdir.mockResolvedValue(undefined);
            
            const result = await fileManager.ensureDirectoryExists('/test/new-dir');
            
            expect(result).toBe(true);
            expect(fs.mkdir).toHaveBeenCalledWith('/test/new-dir', { recursive: true });
        });

        it('should return false on error', async () => {
            fs.mkdir.mockRejectedValue(new Error('Permission denied'));
            
            const result = await fileManager.ensureDirectoryExists('/test/protected-dir');
            
            expect(result).toBe(false);
        });
    });

    describe('getDefaultOutputDirectory', () => {
        it('should return correct default output directory', () => {
            const mockHomeDir = '/home/user';
            os.homedir.mockReturnValue(mockHomeDir);
            path.join.mockReturnValue('/home/user/Documents/SpeechMaker');
            
            const result = fileManager.getDefaultOutputDirectory();
            
            expect(result).toBe('/home/user/Documents/SpeechMaker');
            expect(os.homedir).toHaveBeenCalled();
            expect(path.join).toHaveBeenCalledWith(mockHomeDir, 'Documents', 'SpeechMaker');
        });
    });
});