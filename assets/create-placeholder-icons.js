// Script to create placeholder icon files for testing
import fs from 'fs';

// Create a simple SVG icon as placeholder
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)" rx="24"/>
  <!-- Microphone icon -->
  <ellipse cx="128" cy="80" rx="25" ry="35" fill="white"/>
  <rect x="120" y="115" width="16" height="40" fill="white"/>
  <rect x="100" y="155" width="56" height="8" rx="4" fill="white"/>
  <rect x="124" y="163" width="8" height="20" fill="white"/>
  <!-- Sound waves -->
  <path d="M 170 60 Q 190 80 170 100" stroke="white" stroke-width="6" fill="none" opacity="0.7"/>
  <path d="M 180 50 Q 210 80 180 110" stroke="white" stroke-width="6" fill="none" opacity="0.5"/>
  <path d="M 86 60 Q 66 80 86 100" stroke="white" stroke-width="6" fill="none" opacity="0.7"/>
  <path d="M 76 50 Q 46 80 76 110" stroke="white" stroke-width="6" fill="none" opacity="0.5"/>
  <!-- Text indicator -->
  <text x="128" y="220" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="18" font-weight="bold">TTS</text>
</svg>`;

// Create a simple PNG data (base64 encoded 1x1 pixel - placeholder)
const pngPlaceholder = `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;

// Create a simple ICO header for a 256x256 icon (placeholder)
const icoHeader = Buffer.from([
    0x00, 0x00, // Reserved
    0x01, 0x00, // Type (1 = ICO)
    0x01, 0x00, // Number of images
    0x00,       // Width (0 = 256)
    0x00,       // Height (0 = 256)
    0x00,       // Colors (0 = no palette)
    0x00,       // Reserved
    0x01, 0x00, // Color planes
    0x20, 0x00, // Bits per pixel (32)
    0x16, 0x00, 0x00, 0x00, // Size of image data
    0x16, 0x00, 0x00, 0x00  // Offset to image data
]);

// Write files
fs.writeFileSync('assets/icon.svg', svgIcon);

// Create a basic PNG file (this is just a placeholder - in production you'd use a proper image library)
console.log('Creating placeholder icon files...');

// For now, create empty files that the build process can detect
fs.writeFileSync('assets/icon.png', Buffer.from(pngPlaceholder, 'base64'));
fs.writeFileSync('assets/icon.ico', icoHeader);

console.log('✓ Created placeholder SVG icon at assets/icon.svg');
console.log('✓ Created placeholder PNG icon at assets/icon.png');
console.log('✓ Created placeholder ICO icon at assets/icon.ico');
console.log('');
console.log('NOTE: These are minimal placeholder files for build testing.');
console.log('For production, replace with proper high-quality icons:');
console.log('1. Use the SVG as a template for design');
console.log('2. Create a proper 256x256 PNG file');
console.log('3. Convert to ICO format with multiple sizes (16, 32, 48, 64, 128, 256)');
console.log('');
console.log('Recommended tools:');
console.log('- Online: https://favicon.io/favicon-converter/');
console.log('- Software: GIMP, Paint.NET, Adobe Photoshop');