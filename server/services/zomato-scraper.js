// Zomato Partner Portal scraper (Email + OTP login)
// Scrapes daily sales and payout data from partner.zomato.com
const { getDb } = require('../db/schema');
const { v4: uuid } = require('uuid');

const ZOMATO_URL = 'https://partner.zomato.com';
let otpResolver = null;

function resolveOtp(otp) {
  if (otpResolver) { otpResolver(otp); otpResolver = null; }
}

function waitForOtp(sendOtpRequest) {
  return new Promise((resolve) => {
    otpResolver = resolve;
    sendOtpRequest();
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1280, height: 800 },
  });
}

async function loginZomato(page, email, sendOtpRequest) {
  await page.goto(`${ZOMATO_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Enter email
  await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 15000 });
  const emailInput = await page.$('input[type="email"]') || await page.$('input[name="email"]') || await page.$('input[placeholder*="mail"]');
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 50 });

  // Click continue
  const continueBtn = await page.$('button[type="submit"]') || await page.$('[class*="submit"], [class*="Continue"]');
  await continueBtn?.click();
  await new Promise(r => setTimeout(r, 2000));

  // Wait for OTP input
  await page.waitForSelector('input[placeholder*="OTP"], input[placeholder*="otp"], input[maxlength="6"], input[maxlength="4"]', { timeout: 20000 });

  const otp = await waitForOtp(sendOtpRequest);
  const otpInput = await page.$('input[placeholder*="OTP"]') || await page.$('input[maxlength="6"]') || await page.$('input[maxlength="4"]');
  await otpInput?.click({ clickCount: 3 });
  await otpInput?.type(String(otp), { delay: 80 });

  const submitBtn = await page.$('button[type="submit"]') || await page.$('[class*="Submit"], [class*="Verify"]');
  await submitBtn?.click();
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
}

function toISTDateStr(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function scrapeZomatoDay(page, date) {
  try {
    // Zomato partner dashboard - orders section
    await page.goto(`${ZOMATO_URL}/restaurant/orders`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      const getText = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.innerText.trim() : null;
      };
      return {
        orders: getText('[class*="order-count"], [class*="orderCount"], [data-testid*="order"]'),
        revenue: getText('[class*="revenue"], [class*="Revenue"], [class*="earning"], [class*="Earning"]'),
        commission: getText('[class*="commission"], [class*="Commission"]'),
        payout: getText('[class*="payout"], [class*="Payout"], [class*="net"]'),
        pageText: document.body.innerText.slice(0, 3000),
      };
    });
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

async function scrapeZomatoPayouts(page) {
  try {
    await page.goto(`${ZOMATO_URL}/restaurant/payouts`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    const data = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('tr, [class*="payout-row"], [class*="settlement"]').forEach(row => {
        rows.push(row.innerText.replace(/\s+/g,' ').trim());
      });
      return rows.filter(r => r.length > 5).slice(0, 30);
    });
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

async function runZomato({ sendOtpRequest, onStatus }) {
  const email = getSetting('zomato_email');
  if (!email) throw new Error('Zomato email not set in Settings');

  const db = getDb();
  const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
  if (!outlet) throw new Error('No outlet found');

  onStatus?.('Launching browser...');
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

  try {
    const savedCookies = loadCookies('zomato', outlet.id);
    if (savedCookies) {
      await page.setCookie(...savedCookies);
      await page.goto(`${ZOMATO_URL}/restaurant`, { waitUntil: 'networkidle2', timeout: 20000 });
      const url = page.url();
      if (url.includes('login')) {
        onStatus?.('Session expired â€” logging in again...');
        await loginZomato(page, email, sendOtpRequest);
      } else {
        onStatus?.('Using saved session...');
      }
    } else {
      onStatus?.('Logging in â€” OTP will be sent to ' + email);
      await loginZomato(page, email, sendOtpRequest);
    }

    const cookies = await page.cookies();
    saveCookies('zomato', outlet.id, cookies);
    onStatus?.('Logged in. Scraping today\'s data...');

    const today = toISTDateStr();
    const dayData = await scrapeZomatoDay(page, today);
    const payoutData = await scrapeZomatoPayouts(page);

    const parseNum = (s) => s ? parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0 : 0;

    const record = {
      id: uuid(),
      outlet_id: outlet.id,
      platform: 'zomato',
      date: today,
      orders: parseInt(parseNum(dayData.orders)) || 0,
      gross_revenue: parseNum(dayData.revenue),
      commission: parseNum(dayData.commission),
      net_payout: parseNum(dayData.payout),
      raw_data: JSON.stringify({ dayData, payoutData }),
    };

    db.prepare('INSERT OR REPLACE INTO platform_sales (id,outlet_id,platform,date,orders,gross_revenue,commission,net_payout,raw_data) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(record.id, record.outlet_id, record.platform, record.date, record.orders, record.gross_revenue, record.commission, record.net_payout, record.raw_data);

    onStatus?.('Zomato data saved!');
    return { success: true, record, payoutRows: payoutData };
  } finally {
    await browser.close();
  }
}

module.exports = { runZomato, resolveOtp };
