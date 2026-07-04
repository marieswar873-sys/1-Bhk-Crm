#!/usr/bin/env node
/**
 * Per-tenant CRM installer builder.
 *
 * Usage:
 *   node scripts/build-tenant.js --name "Sadhana Foods" --slug sadhana --icon https://...logo.png
 *   node scripts/build-tenant.js --name "Sadhana Foods" --slug sadhana --icon ./local-icon.png
 *
 * Output:
 *   dist/Sadhana-Foods-CRM-Setup.exe
 *
 * What it does:
 *   1. Downloads / copies the tenant icon → app-icon-tenant.png
 *   2. Converts PNG → ICO using png-to-ico
 *   3. Patches package.json build config (productName, artifactName, shortcutName)
 *   4. Runs `npm run dist:win`
 *   5. Restores package.json to original
 *
 * Requirements:
 *   npm install  (png-to-ico is already in devDependencies)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  const name = get('--name');
  const slug = get('--slug');
  const icon = get('--icon');
  if (!name || !slug) {
    console.error('Usage: node scripts/build-tenant.js --name "Restaurant Name" --slug slug [--icon url-or-path]');
    process.exit(1);
  }
  return { name, slug, icon };
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

async function ensureIcon(iconSrc) {
  const tmpPng = path.join(ROOT, 'app-icon-tenant.png');
  const tmpIco = path.join(ROOT, 'app-icon-tenant.ico');

  if (!iconSrc) {
    // Use existing app-icon.ico unchanged
    console.log('No icon provided — using default app-icon.ico');
    return path.join(ROOT, 'app-icon.ico');
  }

  if (iconSrc.startsWith('http://') || iconSrc.startsWith('https://')) {
    console.log('Downloading icon...');
    await download(iconSrc, tmpPng);
  } else {
    fs.copyFileSync(path.resolve(iconSrc), tmpPng);
  }

  console.log('Converting PNG → ICO...');
  const pngToIco = require('png-to-ico');
  const icoData = await pngToIco(tmpPng);
  fs.writeFileSync(tmpIco, icoData);
  fs.unlinkSync(tmpPng);
  console.log(`Icon ready: ${tmpIco}`);
  return tmpIco;
}

async function main() {
  const { name, slug, icon } = parseArgs();

  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-');
  const safeName = name.replace(/[^a-z0-9 ]/gi, '').trim();
  const artifactName = `${safeName.replace(/\s+/g, '-')}-CRM-Setup`;

  console.log(`\nBuilding CRM installer for: ${name} (${safeSlug})\n`);

  // 1. Prepare icon
  const icoPath = await ensureIcon(icon);
  const icoRel = path.relative(ROOT, icoPath);

  // 2. Patch package.json
  const pkgPath = path.join(ROOT, 'package.json');
  const pkgOriginal = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgOriginal);

  const originalBuild = JSON.parse(JSON.stringify(pkg.build));

  pkg.build.appId = `com.restro.${safeSlug}`;
  pkg.build.productName = `${name} CRM`;
  pkg.build.win.icon = icoRel;
  pkg.build.nsis.artifactName = `${artifactName}.\${ext}`;
  pkg.build.nsis.installerIcon = icoRel;
  pkg.build.nsis.uninstallerIcon = icoRel;
  pkg.build.nsis.shortcutName = `${name} CRM`;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('Patched package.json');

  try {
    // 3. Build
    console.log('\nRunning electron-builder...\n');
    execSync('npm run dist:win', { cwd: ROOT, stdio: 'inherit' });

    console.log(`\nDone! Installer at: dist/${artifactName}.exe`);
  } finally {
    // 4. Restore package.json regardless of build outcome
    pkg.build = originalBuild;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log('Restored package.json');

    // Clean up tenant icon
    try { if (icoRel !== 'app-icon.ico') fs.unlinkSync(icoPath); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
