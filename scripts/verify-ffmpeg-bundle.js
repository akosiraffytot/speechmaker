#!/usr/bin/env node

/**
 * Script to verify FFmpeg bundling is set up correctly
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Verifying FFmpeg bundle setup...\n');

// Check directory structure
const requiredPaths = [
  'resources/ffmpeg',
  'resources/ffmpeg/win32',
  'resources/ffmpeg/win32/x64',
  'resources/ffmpeg/win32/ia32',
  'resources/ffmpeg/win32/x64/ffmpeg.exe',
  'resources/ffmpeg/win32/ia32/ffmpeg.exe',
  'resources/ffmpeg/LICENSE.txt',
  'resources/ffmpeg/README.md'
];

let allPathsExist = true;

for (const requiredPath of requiredPaths) {
  if (fs.existsSync(requiredPath)) {
    console.log(`✓ ${requiredPath}`);
  } else {
    console.log(`✗ ${requiredPath} - MISSING`);
    allPathsExist = false;
  }
}

if (!allPathsExist) {
  console.log('\n❌ Some required FFmpeg bundle files are missing!');
  process.exit(1);
}

// Check FFmpeg executable functionality
console.log('\n🧪 Testing FFmpeg executable...');

try {
  const ffmpegPath = path.join('resources', 'ffmpeg', 'win32', 'x64', 'ffmpeg.exe');
  const output = execSync(`"${ffmpegPath}" -version`, { encoding: 'utf8' });
  
  if (output.includes('ffmpeg version')) {
    console.log('✓ FFmpeg executable is functional');
    
    // Extract version info
    const versionLine = output.split('\n')[0];
    console.log(`  Version: ${versionLine}`);
  } else {
    console.log('✗ FFmpeg executable test failed');
    process.exit(1);
  }
} catch (error) {
  console.log('✗ FFmpeg executable test failed:', error.message);
  process.exit(1);
}

// Check package.json configuration
console.log('\n📦 Checking package.json configuration...');

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const extraResources = packageJson.build?.extraResources || [];
  
  const ffmpegResource = extraResources.find(resource => 
    resource.from === 'resources/ffmpeg/' && resource.to === 'resources/ffmpeg/'
  );
  
  if (ffmpegResource) {
    console.log('✓ FFmpeg extraResources configuration found');
  } else {
    console.log('✗ FFmpeg extraResources configuration missing');
    process.exit(1);
  }
} catch (error) {
  console.log('✗ Failed to check package.json:', error.message);
  process.exit(1);
}

// Check file sizes
console.log('\n📊 File size information:');

const x64Size = fs.statSync('resources/ffmpeg/win32/x64/ffmpeg.exe').size;
const ia32Size = fs.statSync('resources/ffmpeg/win32/ia32/ffmpeg.exe').size;

console.log(`  x64 FFmpeg: ${(x64Size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ia32 FFmpeg: ${(ia32Size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  Total FFmpeg size: ${((x64Size + ia32Size) / 1024 / 1024).toFixed(2)} MB`);

console.log('\n✅ FFmpeg bundle verification completed successfully!');

// Check if build exists and verify bundled FFmpeg
if (fs.existsSync('dist/win-unpacked/resources/resources/ffmpeg/win32/x64/ffmpeg.exe')) {
  console.log('\n🏗️  Build verification:');
  console.log('✓ FFmpeg found in built application');
  
  try {
    const builtFFmpegPath = 'dist/win-unpacked/resources/resources/ffmpeg/win32/x64/ffmpeg.exe';
    const output = execSync(`"${builtFFmpegPath}" -version`, { encoding: 'utf8' });
    if (output.includes('ffmpeg version')) {
      console.log('✓ Built FFmpeg executable is functional');
    }
  } catch (error) {
    console.log('⚠️  Built FFmpeg test failed (this is normal if build is not current)');
  }
} else {
  console.log('\n📝 Note: Run "npm run build" to verify FFmpeg bundling in built application');
}

console.log('\nNext steps:');
console.log('1. ✅ FFmpeg bundling infrastructure complete');
console.log('2. Implement FFmpeg detection in audioProcessor.js');
console.log('3. Update application initialization to use bundled FFmpeg');
console.log('\nBundled FFmpeg path in application: resources/resources/ffmpeg/win32/{arch}/ffmpeg.exe');