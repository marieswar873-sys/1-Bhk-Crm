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
  const apiKey = get('--api-key');
  if (!name || !slug) {
    console.error('Usage: node scripts/build-tenant.js --name "Restaurant Name" --slug slug [--icon url-or-path] [--api-key key]');
    process.exit(1);
  }
  return { name, slug, icon, apiKey };
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
  const _pngToIcoMod = require('png-to-ico');
  const pngToIco = _pngToIcoMod.default || _pngToIcoMod;
  const icoData = await pngToIco(tmpPng);
  fs.writeFileSync(tmpIco, icoData);
  fs.unlinkSync(tmpPng);
  console.log(`Icon ready: ${tmpIco}`);
  return tmpIco;
}

async function main() {
  const { name, slug, icon, apiKey } = parseArgs();

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

  // Write branding.json so Electron shows the correct name before first sync
  const brandingPath = path.join(ROOT, 'branding.json');
  fs.writeFileSync(brandingPath, JSON.stringify({ name, slug: safeSlug }, null, 2));
  console.log('Wrote branding.json');

  // 3. Patch React client branding (Layout.js, Login.js, logo files)
  const layoutPath  = path.join(ROOT, 'client', 'src', 'components', 'Layout.js');
  const loginPath   = path.join(ROOT, 'client', 'src', 'pages', 'Login.js');
  const indexPath   = path.join(ROOT, 'client', 'public', 'index.html');
  const srcLogoPath = path.join(ROOT, 'client', 'src', 'logo.png');
  const pubLogoPath = path.join(ROOT, 'client', 'public', 'logo.png');

  const layoutOrig = fs.readFileSync(layoutPath, 'utf8');
  const loginOrig  = fs.readFileSync(loginPath,  'utf8');
  const indexOrig  = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
  const srcLogoOrig = fs.existsSync(srcLogoPath) ? fs.readFileSync(srcLogoPath) : null;
  const pubLogoOrig = fs.existsSync(pubLogoPath) ? fs.readFileSync(pubLogoPath) : null;

  // Replace "1BHK CRM" and "1BHK Kitchen" with tenant name in JS source
  fs.writeFileSync(layoutPath, layoutOrig.replace(/1BHK CRM/g, `${name} CRM`).replace(/1BHK Kitchen/g, name));
  fs.writeFileSync(loginPath,  loginOrig .replace(/1BHK CRM/g, `${name} CRM`).replace(/1BHK Kitchen/g, name));
  if (indexOrig) fs.writeFileSync(indexPath, indexOrig.replace(/1BHK CRM/g, `${name} CRM`).replace(/1BHK Kitchen/g, name));
  console.log('Patched Layout.js, Login.js and index.html');

  // Replace logo with tenant icon PNG if provided
  if (icon && icoRel !== 'app-icon.ico') {
    // Re-download PNG (we already converted it to ICO and deleted it)
    const tmpLogoPng = path.join(ROOT, 'app-icon-tenant-logo.png');
    if (icon.startsWith('http://') || icon.startsWith('https://')) {
      await download(icon, tmpLogoPng);
    } else {
      fs.copyFileSync(path.resolve(icon), tmpLogoPng);
    }
    if (fs.existsSync(tmpLogoPng)) {
      fs.copyFileSync(tmpLogoPng, srcLogoPath);
      fs.copyFileSync(tmpLogoPng, pubLogoPath);
      fs.unlinkSync(tmpLogoPng);
      console.log('Replaced logo.png with tenant logo');
    }
  }

  try {
    // 4. Build
    console.log('\nRunning electron-builder...\n');
    execSync('npm run dist:win', { cwd: ROOT, stdio: 'inherit' });

    console.log(`\nDone! Installer at: dist/${artifactName}.exe`);
  } finally {
    // 5. Restore everything regardless of build outcome
    pkg.build = originalBuild;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    fs.writeFileSync(layoutPath, layoutOrig);
    fs.writeFileSync(loginPath,  loginOrig);
    if (indexOrig) fs.writeFileSync(indexPath, indexOrig);
    if (srcLogoOrig) fs.writeFileSync(srcLogoPath, srcLogoOrig);
    if (pubLogoOrig) fs.writeFileSync(pubLogoPath, pubLogoOrig);
    console.log('Restored all source files');

    // Clean up tenant icon
    try { if (icoRel !== 'app-icon.ico') fs.unlinkSync(icoPath); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
