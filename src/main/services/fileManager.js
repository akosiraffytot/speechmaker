import fs from 'fs/promises';
import { existsSync, accessSync, constants, statSync } from 'fs';
import path from 'path';
import os from 'os';
import ErrorHandler from './errorHandler.js';

/**
 * File Manager Service
 * Handles file operations including reading text files, validating directories,
 * and generating unique file names for the SpeechMaker application.
 */
class FileManager {
    constructor() {
        this.supportedTextExtensions = ['.txt'];
        this.maxFileSize = 10 * 1024 * 1024; // 10MB limit
        this.errorHandler = new ErrorHandler();
    }

    /**
     * Reads and validates a text file
     * @param {string} filePath - Path to the text file
     * @returns {Promise<string>} - File content as string
     * @throws {Error} - If file is invalid, unreadable, or too large
     */
    async readTextFile(filePath) {
        try {
            // Validate file path
            if (!filePath || typeof filePath !== 'string') {
                throw new Error('Invalid file path provided');
            }

            // Check if file exists
            if (!existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Validate file extension
            const fileExtension = path.extname(filePath).toLowerCase();
            if (!this.supportedTextExtensions.includes(fileExtension)) {
                throw new Error(`Unsupported file type: ${fileExtension}. Only .txt files are supported.`);
            }

            // Check file size
            const stats = await fs.stat(filePath);
            if (stats.size > this.maxFileSize) {
                throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB. Maximum size is ${this.maxFileSize / 1024 / 1024}MB.`);
            }

            // Check file permissions
            try {
                accessSync(filePath, constants.R_OK);
            } catch (error) {
                throw new Error(`Cannot read file: Permission denied for ${filePath}`);
            }

            // Read file content
            const content = await fs.readFile(filePath, 'utf8');
            
            // Validate content
            if (!content || content.trim().length === 0) {
                throw new Error('File is empty or contains no readable text');
            }

            return content;

        } catch (error) {
            // Use enhanced error handling
            throw this.errorHandler.handleFileError(error, filePath, { operation: 'readTextFile' });
        }
    }

    /**
     * Validates if a directory path is writable
     * @param {string} directoryPath - Path to validate
     * @returns {boolean} - True if directory is writable, false otherwise
     */
    validateOutputDirectory(directoryPath) {
        try {
            if (!directoryPath || typeof directoryPath !== 'string') {
                return false;
            }

            // Check if directory exists
            if (!existsSync(directoryPath)) {
                return false;
            }

            // Check if it's actually a directory
            const stats = statSync(directoryPath);
            if (!stats.isDirectory()) {
                return false;
            }

            // Check write permissions
            accessSync(directoryPath, constants.W_OK);
            return true;

        } catch (error) {
            return false;
        }
    }

    /**
     * Generates a unique filename to prevent overwrites
     * @param {string} outputDirectory - Directory where file will be saved
     * @param {string} baseName - Base name for the file (without extension)
     * @param {string} extension - File extension (with dot, e.g., '.wav')
     * @returns {string} - Full path to unique filename
     */
    generateUniqueFileName(outputDirectory, baseName, extension) {
        if (!outputDirectory || !baseName || !extension) {
            throw new Error('Missing required parameters for filename generation');
        }

        // Sanitize base name (remove invalid characters)
        const sanitizedBaseName = baseName.replace(/[<>:"/\\|?*]/g, '_');
        
        let counter = 0;
        let fileName = `${sanitizedBaseName}${extension}`;
        let fullPath = path.join(outputDirectory, fileName);

        // Keep incrementing counter until we find a unique name
        while (existsSync(fullPath)) {
            counter++;
            fileName = `${sanitizedBaseName}_${counter}${extension}`;
            fullPath = path.join(outputDirectory, fileName);
        }

        return fullPath;
    }

    /**
     * Gets detailed error information for file access issues
     * @param {string} filePath - Path that caused the error
     * @param {Error} error - The original error
     * @returns {Object} - Detailed error information with user-friendly message
     */
    getFileErrorDetails(filePath, error) {
        const errorDetails = {
            originalError: error.message,
            userMessage: '',
            troubleshooting: [],
            errorCode: error.code || 'UNKNOWN'
        };

        switch (error.code) {
            case 'ENOENT':
                errorDetails.userMessage = `File not found: ${path.basename(filePath)}`;
                errorDetails.troubleshooting = [
                    'Check if the file exists at the specified location',
                    'Verify the file path is correct',
                    'Make sure the file hasn\'t been moved or deleted'
                ];
                break;

            case 'EACCES':
                errorDetails.userMessage = `Access denied: Cannot read ${path.basename(filePath)}`;
                errorDetails.troubleshooting = [
                    'Check if the file is open in another application',
                    'Verify you have permission to read the file',
                    'Try running the application as administrator',
                    'Check if the file is on a network drive with restricted access'
                ];
                break;

            case 'EISDIR':
                errorDetails.userMessage = `Invalid selection: You selected a folder instead of a file`;
                errorDetails.troubleshooting = [
                    'Please select a .txt file, not a folder',
                    'Navigate into the folder and select a text file'
                ];
                break;

            case 'EMFILE':
            case 'ENFILE':
                errorDetails.userMessage = 'Too many files are currently open';
                errorDetails.troubleshooting = [
                    'Close some applications and try again',
                    'Restart the application if the problem persists'
                ];
                break;

            default:
                if (error.message.includes('Unsupported file type')) {
                    errorDetails.userMessage = error.message;
                    errorDetails.troubleshooting = [
                        'Only .txt files are supported',
                        'Convert your file to .txt format using a text editor',
                        'Copy and paste the text directly into the application'
                    ];
                } else if (error.message.includes('File too large')) {
                    errorDetails.userMessage = error.message;
                    errorDetails.troubleshooting = [
                        'Split the file into smaller parts',
                        'Use a text editor to reduce the file size',
                        'Copy and paste smaller portions of text directly'
                    ];
                } else {
                    errorDetails.userMessage = `Unexpected error: ${error.message}`;
                    errorDetails.troubleshooting = [
                        'Try selecting a different file',
                        'Restart the application',
                        'Check if the file is corrupted'
                    ];
                }
        }

        return errorDetails;
    }

    /**
     * Creates a directory if it doesn't exist
     * @param {string} directoryPath - Path to create
     * @returns {Promise<boolean>} - True if created or already exists, false on error
     */
    async ensureDirectoryExists(directoryPath) {
        try {
            await fs.mkdir(directoryPath, { recursive: true });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Gets the default output directory for the application
     * @returns {string} - Default output directory path
     */
    getDefaultOutputDirectory() {
        const defaultPath = path.join(os.homedir(), 'Documents', 'SpeechMaker');
        return defaultPath;
    }

    /**
     * Gets the temporary directory for the application
     * @returns {Promise<string>} - Temporary directory path
     */
    async getTempDirectory() {
        const tempPath = path.join(os.tmpdir(), 'SpeechMaker');
        await this.ensureDirectoryExists(tempPath);
        return tempPath;
    }

    /**
     * Deletes a file
     * @param {string} filePath - Path to file to delete
     * @returns {Promise<void>}
     */
    async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
}

export default FileManager;