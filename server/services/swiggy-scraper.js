// Swiggy Partner Portal scraper (Email + OTP login)
// Scrapes daily sales and payout data from partner.swiggy.com
const { getDb } = require('../db/schema');
const { v4: uuid } = require('uuid');

const SWIGGY_URL = 'https://partner.swiggy.com';
let otpResolver = null; // set by IPC when user submits OTP

// Called from electron.js IPC when user enters OTP
function resolveOtp(otp) {
  if (otpResolver) { otpResolver(otp); otpResolver = null; }
}

function waitForOtp(sendOtpRequest) {
  return new Promise((resolve) => {
    otpResolver = resolve;
    sendOtpRequest(); // tell renderer to show OTP modal
  });
}

function saveCookies(platform, outletId, cookies) {
  const db = getDb();
  db.prepare('INSERT INTO platform_sessions (id,outlet_id,platform,cookies,last_login) VALUES (?,?,?,?,datetime("now")) ON CONFLICT(outlet_id,platform) DO UPDATE SET cookies=excluded.cookies,last_login=excluded.last_login')
    .run(uuid(), outletId, platform, JSON.stringify(cookies));
}

function loadCookies(platform, outletId) {
  try {
    const row = getDb().prepare('SELECT cookies FROM platform_sessions WHERE outlet_id=? AND platform=?').get(outletId, platform);
    return row ? JSON.parse(row.cookies) : null;
  } catch { return null; }
}

function getSetting(key) {
  try { return getDb().prepare('SELECT value FROM settings WHERE key=? LIMIT 1').get(key)?.value || null; } catch { return null; }
}

async function launchBrowser() {
  const puppeteer = require('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,800',
    ],
    defaultViewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--enable-automation'],
  });
}

async function stealthPage(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
}

async function loginSwiggy(page, mobile, password, sendOtpRequest) {
  await page.goto(SWIGGY_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[placeholder*="Restaurant ID"], input[placeholder*="Mobile"], input[type="text"]', { timeout: 15000 });

  // Enter mobile / restaurant ID
  const mobileInput = await page.$('input[placeholder*="Restaurant ID"]') || await page.$('input[placeholder*="Mobile"]') || await page.$('input[type="text"]');
  await mobileInput.click({ clickCount: 3 });
  await mobileInput.type(mobile, { delay: 50 });

  // Find Continue button and click it directly
  const allBtns2 = await page.$$('button');
  let continueBtn2 = null;
  for (const btn of allBtns2) {
    const txt = await page.evaluate(el => el.textContent.trim(), btn);
    console.log('[Swiggy] Button text:', txt);
    if (/continue/i.test(txt)) { continueBtn2 = btn; break; }
  }
  if (continueBtn2) {
    const box = await continueBtn2.boundingBox();
    console.log('[Swiggy] Continue button bbox:', JSON.stringify(box));
    // Simulate real mouse interaction
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 100));
    await page.mouse.up();
  } else {
    console.log('[Swiggy] Continue button NOT FOUND');
  }
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'swiggy-after-continue.png') });
  console.log('[Swiggy] Screenshot saved, URL:', page.url());

  // Look for "Login with Password" button
  if (password) {
    const allBtnsAfter = await page.$$('button');
    console.log('[Swiggy] Buttons after OTP page:', allBtnsAfter.length);
    let pwdBtn = null;
    for (const btn of allBtnsAfter) {
      const txt = await page.evaluate(el => el.textContent.trim(), btn);
      console.log('[Swiggy] Btn text after:', JSON.stringify(txt));
      if (/password/i.test(txt)) { pwdBtn = btn; break; }
    }
    if (pwdBtn) {
      console.log('[Swiggy] Clicking Login with Password');
      const box = await pwdBtn.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await new Promise(r => setTimeout(r, 200));
      await page.mouse.down(); await new Promise(r => setTimeout(r, 100)); await page.mouse.up();
      await new Promise(r => setTimeout(r, 2000));
      // Now type password
      const pwdInput = await page.$('input[type="password"]');
      if (pwdInput) {
        await pwdInput.click({ clickCount: 3 });
        await pwdInput.type(password, { delay: 50 });
        // Click submit
        const submitBtns = await page.$$('button');
        for (const btn of submitBtns) {
          const txt = await page.evaluate(el => el.textContent.trim(), btn);
          if (/login|continue|submit/i.test(txt)) {
            const b = await btn.boundingBox();
            await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await new Promise(r => setTimeout(r, 200));
            await page.mouse.down(); await new Promise(r => setTimeout(r, 100)); await page.mouse.up();
            break;
          }
        }
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        return;
      }
    }
  }

  // Fallback: OTP flow — 6 individual input boxes
  const otp = await waitForOtp(sendOtpRequest);
  const otpBoxes = await page.$$('input');
  if (otpBoxes.length >= 4) {
    const digits = String(otp).split('');
    for (let i = 0; i < Math.min(digits.length, otpBoxes.length); i++) {
      await otpBoxes[i].click();
      await otpBoxes[i].type(digits[i], { delay: 80 });
    }
  }
  // Click Continue after OTP
  const otpSubmitBtns = await page.$$('button');
  for (const btn of otpSubmitBtns) {
    const txt = await page.evaluate(el => el.textContent.trim(), btn);
    if (/continue/i.test(txt)) {
      const b = await btn.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await new Promise(r => setTimeout(r, 200));
      await page.mouse.down(); await new Promise(r => setTimeout(r, 100)); await page.mouse.up();
      break;
    }
  }
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
}

function toISTDateStr(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function scrapeSwiggyDay(page, date) {
  // Navigate to restaurant dashboard / orders page
  try {
    await page.goto(`${SWIGGY_URL}/restaurant/orders?date=${date}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Try to extract order count and revenue from DOM
    const data = await page.evaluate(() => {
      const getText = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.innerText.trim() : null;
      };
      // These selectors are best-effort; portal may change layout
      return {
        orders: getText('[data-testid="order-count"], .order-count, [class*="orderCount"]'),
        revenue: getText('[data-testid="revenue"], .revenue, [class*="revenue"], [class*="earning"]'),
        commission: getText('[class*="commission"], [class*="Commission"]'),
        payout: getText('[class*="payout"], [class*="Payout"], [class*="net-earning"]'),
      };
    });
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

async function scrapeSwiggyPayouts(page) {
  try {
    await page.goto(`${SWIGGY_URL}/restaurant/payouts`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    const data = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('tr, [class*="payout-row"], [class*="PayoutRow"]').forEach(row => {
        rows.push(row.innerText.replace(/\s+/g,' ').trim());
      });
      return rows.filter(r => r.length > 5).slice(0, 30);
    });
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

async function runSwiggy({ sendOtpRequest, onStatus }) {
  const email = getSetting('swiggy_email');
  const password = getSetting('swiggy_password');
  if (!email) throw new Error('Swiggy mobile/ID not set in Settings');

  const db = getDb();
  const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
  if (!outlet) throw new Error('No outlet found');

  onStatus?.('Launching browser...');
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await stealthPage(page);

  try {
    // Try saved cookies first
    const savedCookies = loadCookies('swiggy', outlet.id);
    if (savedCookies) {
      await page.setCookie(...savedCookies);
      await page.goto(`${SWIGGY_URL}/restaurant`, { waitUntil: 'networkidle2', timeout: 20000 });
      const url = page.url();
      if (url.includes('login')) {
        onStatus?.('Session expired â€” logging in again...');
        await loginSwiggy(page, email, password, sendOtpRequest);
      } else {
        onStatus?.('Using saved session...');
      }
    } else {
      onStatus?.('Logging in to Swiggy partner portal...');
      await loginSwiggy(page, email, password, sendOtpRequest);
    }

    // Save cookies
    const cookies = await page.cookies();
    saveCookies('swiggy', outlet.id, cookies);
    onStatus?.('Logged in. Scraping today\'s data...');

    const today = toISTDateStr();
    const dayData = await scrapeSwiggyDay(page, today);
    const payoutData = await scrapeSwiggyPayouts(page);

    // Parse numbers (best-effort)
    const parseNum = (s) => s ? parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0 : 0;

    const record = {
      id: uuid(),
      outlet_id: outlet.id,
      platform: 'swiggy',
      date: today,
      orders: parseInt(parseNum(dayData.orders)) || 0,
      gross_revenue: parseNum(dayData.revenue),
      commission: parseNum(dayData.commission),
      net_payout: parseNum(dayData.payout),
      raw_data: JSON.stringify({ dayData, payoutData }),
    };

    db.prepare('INSERT OR REPLACE INTO platform_sales (id,outlet_id,platform,date,orders,gross_revenue,commission,net_payout,raw_data) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(record.id, record.outlet_id, record.platform, record.date, record.orders, record.gross_revenue, record.commission, record.net_payout, record.raw_data);

    onStatus?.('Swiggy data saved!');
    return { success: true, record, payoutRows: payoutData };
  } finally {
    await browser.close();
  }
}

module.exports = { runSwiggy, resolveOtp };
