const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(path.join(__dirname, 'client', 'public', 'logo.png'));
  const png = img.resize({ width: 64, height: 64 }).toPNG();

  // ICO header (6 bytes) + entry (16 bytes) + PNG data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(64, 0);
  entry.writeUInt8(64, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  fs.writeFileSync(path.join(__dirname, 'app-icon.ico'), Buffer.concat([header, entry, png]));
  console.log('ICO created!');
  app.quit();
});
