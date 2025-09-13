# TTS Service

The TTS Service provides text-to-speech conversion functionality using Microsoft Edge TTS engine.

## Features

- **Voice Detection**: Automatically detects and lists all available Windows TTS voices
- **Text-to-Speech Conversion**: Converts text to speech with customizable voice and speed
- **Large File Support**: Automatically chunks large text files to prevent memory issues
- **Event-Driven**: Emits events for progress tracking and error handling
- **Offline Operation**: Works completely offline using Windows built-in TTS

## Requirements Implemented

This service implements the following requirements from the specification:

- **Requirement 1.1**: Detects and lists all available Windows TTS voices on startup
- **Requirement 1.2**: Remembers voice selection for future sessions (via settings integration)
- **Requirement 1.3**: Uses Microsoft Edge TTS for audio generation
- **Requirement 2.3**: Splits large text files into manageable chunks for processing

## Usage

```javascript
import TTSService from './ttsService.js';

const ttsService = new TTSService();

// Initialize the service
await ttsService.initialize();

// Get available voices
const voices = await ttsService.getAvailableVoices();
console.log('Available voices:', voices);

// Convert text to speech
const outputPath = './output.wav';
await ttsService.convertTextToSpeech(
  'Hello, this is a test message.',
  'Microsoft David Desktop',
  1.0, // Normal speed
  outputPath
);

// Listen for events
ttsService.on('progress', (event) => {
  console.log(`Progress: ${event.current}/${event.total} - ${event.message}`);
});

ttsService.on('conversionComplete', (event) => {
  console.log(`Conversion complete: ${event.outputPath}`);
});

ttsService.on('error', (error) => {
  console.error('TTS Error:', error.message);
});
```

## API Reference

### Methods

#### `initialize()`
Initializes the TTS service and loads available voices.

#### `getAvailableVoices()`
Returns an array of available voice objects with properties:
- `id`: Unique voice identifier
- `name`: Display name
- `gender`: 'Male' or 'Female'
- `language`: Language code (e.g., 'en-US')
- `isDefault`: Boolean indicating if this is the default voice

#### `convertTextToSpeech(text, voiceId, speed, outputPath)`
Converts text to speech and saves to the specified path.

**Parameters:**
- `text` (string): Text to convert (required)
- `voiceId` (string): ID of the voice to use (required)
- `speed` (number): Speech speed multiplier (0.5-2.0, default: 1.0)
- `outputPath` (string): Full path where to save the audio file (required)

#### `splitTextIntoChunks(text, maxLength)`
Splits large text into smaller chunks for processing.

**Parameters:**
- `text` (string): Text to split
- `maxLength` (number): Maximum characters per chunk (default: 5000)

#### `setMaxChunkLength(length)`
Sets the maximum chunk length for text processing.

#### `getStatus()`
Returns service status information including initialization state and voice count.

### Events

#### `initialized`
Emitted when the service is successfully initialized.

#### `progress`
Emitted during long operations with progress information:
```javascript
{
  current: number,    // Current step
  total: number,      // Total steps
  phase: string,      // 'converting' or 'merging'
  message: string     // Human-readable status message
}
```

#### `conversionComplete`
Emitted when a conversion is successfully completed:
```javascript
{
  outputPath: string, // Path to the generated audio file
  text: string        // Preview of the converted text
}
```

#### `error`
Emitted when an error occurs during processing.

#### `warning`
Emitted for non-fatal issues that don't stop processing.

## Error Handling

The service provides comprehensive error handling for common scenarios:

- **No TTS voices found**: Indicates Windows TTS is not properly installed
- **Invalid voice selection**: Voice ID not found in available voices
- **Invalid parameters**: Speed out of range, empty text, missing paths
- **File system errors**: Directory creation failures, permission issues
- **TTS engine errors**: Edge TTS execution failures

## Dependencies

- **edge-tts**: Microsoft Edge TTS package for voice synthesis
- **Node.js built-ins**: child_process, fs, path, events

## Testing

The service includes comprehensive unit tests covering:
- Voice parsing and detection
- Text chunking algorithms
- Input validation
- Event emission
- Error handling
- Edge cases with special characters

Run tests with:
```bash
npm test
```

## Performance Considerations

- **Memory Usage**: Large texts are automatically chunked to prevent memory issues
- **Processing Time**: Conversion time scales with text length and selected voice
- **File I/O**: Temporary files are created for chunked processing and cleaned up automatically
- **Async Operations**: All operations are asynchronous to prevent UI blocking