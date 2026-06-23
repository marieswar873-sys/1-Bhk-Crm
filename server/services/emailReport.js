const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { getDb } = require('../db/schema');

function getSettings(outletId) {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(outletId);
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

function getReportForDate(outletId, date) {
  const db = getDb();

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN tax_amount ELSE 0 END), 0) as total_tax,
      COALESCE(SUM(CASE WHEN order_type='dine_in' AND payment_status='paid' THEN total ELSE 0 END), 0) as dine_in_revenue,
      COALESCE(SUM(CASE WHEN order_type='takeaway' AND payment_status='paid' THEN total ELSE 0 END), 0) as takeaway_revenue,
      COALESCE(SUM(CASE WHEN order_type='zomato' AND payment_status='paid' THEN total ELSE 0 END), 0) as zomato_revenue,
      COALESCE(SUM(CASE WHEN order_type='swiggy' AND payment_status='paid' THEN total ELSE 0 END), 0) as swiggy_revenue,
      COUNT(CASE WHEN order_type='dine_in' THEN 1 END) as dine_in_count,
      COUNT(CASE WHEN order_type='takeaway' THEN 1 END) as takeaway_count,
      COUNT(CASE WHEN order_type='zomato' THEN 1 END) as zomato_count,
      COUNT(CASE WHEN order_type='swiggy' THEN 1 END) as swiggy_count,
      COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled_count,
      COUNT(CASE WHEN payment_method='cash' THEN 1 END) as cash_count,
      COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) as cash_amount,
      COUNT(CASE WHEN payment_method='upi' THEN 1 END) as upi_count,
      COALESCE(SUM(CASE WHEN payment_method='upi' THEN total ELSE 0 END), 0) as upi_amount,
      COUNT(CASE WHEN payment_method='card' THEN 1 END) as card_count,
      COALESCE(SUM(CASE WHEN payment_method='card' THEN total ELSE 0 END), 0) as card_amount
    FROM orders WHERE outlet_id = ? AND date(created_at) = ?
  `).get(outletId, date);

  const topItems = db.prepare(`
    SELECT mi.name, mi.is_veg, SUM(oi.quantity) as qty, SUM(oi.total) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE o.outlet_id = ? AND date(o.created_at) = ? AND o.status != 'cancelled'
    GROUP BY mi.id ORDER BY qty DESC LIMIT 10
  `).all(outletId, date);

  const orders = db.prepare(`
    SELECT order_number, order_type, customer_name, total, payment_method, status, created_at
    FROM orders WHERE outlet_id = ? AND date(created_at) = ? ORDER BY created_at
  `).all(outletId, date);

  return { date, summary, topItems, orders };
}

function getYesterdayReport(outletId) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return getReportForDate(outletId, yesterday);
}

function getTodayReport(outletId) {
  const today = new Date().toISOString().slice(0, 10);
  return getReportForDate(outletId, today);
}

function buildEmailHtml(report, outletName) {
  const s = report.summary;
  const d = report.date;

  const topItemsRows = report.topItems.map((item, i) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0">${i+1}. ${item.is_veg ? '🟢' : '🔴'} ${item.name}</td>
     <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${item.qty}</td>
     <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right">₹${Math.round(item.revenue)}</td></tr>`
  ).join('');

  const orderRows = report.orders.map(o =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px">${o.order_number}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px">${o.order_type}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px">${o.customer_name || 'Walk-in'}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px;text-align:right">₹${o.total}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px">${o.payment_method || '-'}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px">${o.status}</td></tr>`
  ).join('');

  return `
  <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
    <div style="background:#1a1a2e;padding:20px;text-align:center;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:22px">${outletName || '1BHK Kitchen'}</h1>
      <p style="color:#4fc3f7;margin:4px 0 0;font-size:14px">Daily Sales Report — ${d}</p>
    </div>

    <div style="padding:20px;background:#fff">
      <!-- Summary Cards -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="padding:12px;background:#e3f2fd;border-radius:8px;text-align:center;width:25%">
            <div style="font-size:24px;font-weight:700;color:#1a1a2e">₹${Math.round(s.total_revenue).toLocaleString()}</div>
            <div style="font-size:11px;color:#666">Total Revenue</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#e8f5e9;border-radius:8px;text-align:center;width:25%">
            <div style="font-size:24px;font-weight:700;color:#1a1a2e">${s.total_orders}</div>
            <div style="font-size:11px;color:#666">Total Orders</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#fff3e0;border-radius:8px;text-align:center;width:25%">
            <div style="font-size:24px;font-weight:700;color:#1a1a2e">₹${Math.round(s.total_tax).toLocaleString()}</div>
            <div style="font-size:11px;color:#666">GST Collected</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#ffebee;border-radius:8px;text-align:center;width:25%">
            <div style="font-size:24px;font-weight:700;color:#f44336">${s.cancelled_count}</div>
            <div style="font-size:11px;color:#666">Cancelled</div>
          </td>
        </tr>
      </table>

      <!-- Platform Breakdown -->
      <h3 style="margin:0 0 10px;font-size:15px;color:#1a1a2e">Platform Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
        <tr style="background:#f8f9fa"><td style="padding:8px 12px;font-weight:600">Platform</td><td style="padding:8px 12px;text-align:center;font-weight:600">Orders</td><td style="padding:8px 12px;text-align:right;font-weight:600">Revenue</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">🍽️ Dine-in</td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f0f0f0">${s.dine_in_count}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f0f0f0">₹${Math.round(s.dine_in_revenue).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">🛍️ Takeaway</td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f0f0f0">${s.takeaway_count}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f0f0f0">₹${Math.round(s.takeaway_revenue).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">🟥 Zomato</td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f0f0f0">${s.zomato_count}</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f0f0f0">₹${Math.round(s.zomato_revenue).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px">🟧 Swiggy</td><td style="padding:8px 12px;text-align:center">${s.swiggy_count}</td><td style="padding:8px 12px;text-align:right">₹${Math.round(s.swiggy_revenue).toLocaleString()}</td></tr>
      </table>

      <!-- Payment Methods -->
      <h3 style="margin:0 0 10px;font-size:15px;color:#1a1a2e">Payment Methods</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">💵 Cash</td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f0f0f0">${s.cash_count} orders</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f0f0f0">₹${Math.round(s.cash_amount).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">📱 UPI</td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f0f0f0">${s.upi_count} orders</td><td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f0f0f0">₹${Math.round(s.upi_amount).toLocaleString()}</td></tr>
        <tr><td style="padding:8px 12px">💳 Card</td><td style="padding:8px 12px;text-align:center">${s.card_count} orders</td><td style="padding:8px 12px;text-align:right">₹${Math.round(s.card_amount).toLocaleString()}</td></tr>
      </table>

      <!-- Top Items -->
      <h3 style="margin:0 0 10px;font-size:15px;color:#1a1a2e">Top 10 Selling Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
        <tr style="background:#f8f9fa"><td style="padding:6px 12px;font-weight:600">Item</td><td style="padding:6px 12px;text-align:center;font-weight:600">Qty</td><td style="padding:6px 12px;text-align:right;font-weight:600">Revenue</td></tr>
        ${topItemsRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999">No orders</td></tr>'}
      </table>

      <!-- All Orders -->
      <h3 style="margin:0 0 10px;font-size:15px;color:#1a1a2e">All Orders (${report.orders.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#f8f9fa"><td style="padding:6px 8px;font-weight:600">Order #</td><td style="padding:6px 8px;font-weight:600">Type</td><td style="padding:6px 8px;font-weight:600">Customer</td><td style="padding:6px 8px;text-align:right;font-weight:600">Amount</td><td style="padding:6px 8px;font-weight:600">Payment</td><td style="padding:6px 8px;font-weight:600">Status</td></tr>
        ${orderRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#999">No orders</td></tr>'}
      </table>
    </div>

    <div style="background:#f8f9fa;padding:16px;text-align:center;border-radius:0 0 12px 12px;font-size:11px;color:#888">
      Auto-generated by 1BHK CRM · ${new Date().toLocaleString('en-IN')}
    </div>
  </div>`;
}

async function sendDailyReport() {
  const db = getDb();
  const outlets = db.prepare('SELECT * FROM outlets').all();

  for (const outlet of outlets) {
    const settings = getSettings(outlet.id);
    if (settings.daily_report_enabled !== 'true') continue;

    let recipients = [];
    try { recipients = JSON.parse(settings.partner_emails || '[]'); } catch {}
    if (settings.company_email) recipients.unshift(settings.company_email);
    if (!recipients.length) continue;

    const report = getYesterdayReport(outlet.id);
    if (report.summary.total_orders === 0) {
      console.log(`[Email] No orders yesterday for ${outlet.name}, sending anyway`);
    }
    const html = buildEmailHtml(report, settings.outlet_name || outlet.name);

    const smtpUser = process.env.SMTP_USER || settings.company_email;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpPass) {
      console.log(`[Email] SMTP_PASS not set, skipping daily report for ${outlet.name}. Set SMTP_PASS in .env`);
      continue;
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: `"1BHK CRM" <${smtpUser}>`,
        to: recipients.join(', '),
        subject: `📊 Daily Sales Report — ${report.date} — ${settings.outlet_name || '1BHK Kitchen'}`,
        html,
      });

      console.log(`[Email] Daily report sent to: ${recipients.join(', ')}`);
    } catch (err) {
      console.error(`[Email] Failed to send report:`, err.message);
    }
  }
}

function startDailyReportCron() {
  // Run every night at 11 PM
  cron.schedule('0 23 * * *', () => {
    console.log('[Cron] Running daily sales report...');
    sendDailyReport().catch(err => console.error('[Cron] Error:', err));
  });
  console.log('[Cron] Daily sales report scheduled at 11:00 PM');
}

async function sendTestReport() {
  const db = getDb();
  const outlets = db.prepare('SELECT * FROM outlets').all();

  for (const outlet of outlets) {
    const settings = getSettings(outlet.id);

    let recipients = [];
    try { recipients = JSON.parse(settings.partner_emails || '[]'); } catch {}
    if (settings.company_email) recipients.unshift(settings.company_email);
    if (!recipients.length) { console.log('[Email] No recipients configured'); continue; }

    const report = getTodayReport(outlet.id);
    const html = buildEmailHtml(report, settings.outlet_name || outlet.name);

    const smtpUser = process.env.SMTP_USER || settings.company_email;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpPass) {
      throw new Error('SMTP_PASS not set in .env file');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: `"1BHK CRM" <${smtpUser}>`,
      to: recipients.join(', '),
      subject: `📊 Sales Report — ${report.date} (Test) — ${settings.outlet_name || '1BHK Kitchen'}`,
      html,
    });

    console.log(`[Email] Test report sent to: ${recipients.join(', ')} | MessageID: ${info.messageId}`);
  }
}

module.exports = { sendDailyReport, sendTestReport, startDailyReportCron, getYesterdayReport, getTodayReport, buildEmailHtml };
