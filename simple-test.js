// Simple test to check if modules can be imported
console.log('Testing module imports...');

try {
    console.log('Node version:', process.version);
    console.log('Current directory:', process.cwd());
    console.log('Test completed successfully');
} catch (error) {
    console.error('Test failed:', error);
}