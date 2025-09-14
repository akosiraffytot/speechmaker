// Build configuration for SpeechMaker
// This file contains advanced build settings and can be used to customize the build process

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Get version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

// Build configuration
const buildConfig = {
  // Environment-specific settings
  development: {
    compression: 'store',
    nsis: {
      oneClick: false,
      allowElevation: false
    }
  },
  
  production: {
    compression: 'maximum',
    nsis: {
      oneClick: false,
      allowElevation: true
    }
  },
  
  // Build metadata
  metadata: {
    version: version,
    buildDate: new Date().toISOString(),
    buildNumber: process.env.BUILD_NUMBER || '1',
    gitCommit: getGitCommit()
  }
};

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    return 'unknown';
  }
}

// Pre-build validation
function validateBuild() {
  const errors = [];
  
  // Check for required files
  const requiredFiles = [
    'src/main/main.js',
    'src/renderer/index.html',
    'package.json'
  ];
  
  requiredFiles.forEach(file => {
    if (!fs.existsSync(file)) {
      errors.push(`Required file missing: ${file}`);
    }
  });
  
  // Check for icon files (warn only)
  const iconFiles = ['assets/icon.ico', 'assets/icon.png'];
  iconFiles.forEach(file => {
    if (!fs.existsSync(file)) {
      console.warn(`Warning: Icon file missing: ${file}`);
      console.warn('The application will use default Electron icons.');
    }
  });
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 16) {
    errors.push(`Node.js version ${nodeVersion} is not supported. Please use Node.js 16 or later.`);
  }
  
  if (errors.length > 0) {
    console.error('Build validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  
  console.log('Build validation passed ✓');
}

// Post-build actions
function postBuild() {
  console.log('Build completed successfully!');
  console.log(`Version: ${buildConfig.metadata.version}`);
  console.log(`Build Date: ${buildConfig.metadata.buildDate}`);
  console.log(`Git Commit: ${buildConfig.metadata.gitCommit}`);
  
  // Check output files
  const distDir = 'dist';
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    console.log('\nGenerated files:');
    files.forEach(file => {
      const filePath = path.join(distDir, file);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`  - ${file} (${size} MB)`);
    });
  }
}

export {
  buildConfig,
  validateBuild,
  postBuild
};

// If run directly, perform validation
if (import.meta.url === `file://${process.argv[1]}`) {
  validateBuild();
}