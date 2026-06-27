// ESC/POS builder for thermal receipts — works on any thermal printer.
// Text uses "Rs." (basic printers can't render ₹). Logo prints via GS v 0 raster.
const ESC = 0x1b, GS = 0x1d;

export default class EscPos {
  constructor(width = 80) {
    this.cols = parseInt(width) === 58 ? 32 : 48;
    this.colsB = parseInt(width) === 58 ? 42 : 64; // chars per line in the smaller Font B
    this.dots = parseInt(width) === 58 ? 384 : 576; // printable dots
    this.bytes = [];
    this.cmd(ESC, 0x40);
  }
  fontB(on) { return this.cmd(ESC, 0x4D, on ? 1 : 0); } // ESC M: 1=Font B (small), 0=Font A
  cmd(...b) { this.bytes.push(...b); return this; }
  raw(arr) { for (const b of arr) this.bytes.push(b & 0xff); return this; }
  _enc(s) {
    s = String(s).replace(/₹/g, 'Rs.').replace(/[—–]/g, '-').replace(/[^\x00-\x7F]/g, '');
    const out = []; for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff); return out;
  }
  text(s) { this.bytes.push(...this._enc(s)); return this; }
  line(s = '') { return this.text(s).feed(1); }
  align(a) { return this.cmd(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on) { return this.cmd(ESC, 0x45, on ? 1 : 0); }
  size(big) { return this.cmd(GS, 0x21, big ? 0x11 : 0x00); }   // double w+h
  sizeH(big) { return this.cmd(GS, 0x21, big ? 0x01 : 0x00); }  // double height only (keeps columns aligned)
  feed(n = 1) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this; }
  hr(ch = '-') { return this.line(ch.repeat(this.cols)); }
  // two columns padded to full width
  row(left, right) {
    left = String(left); right = String(right);
    const gap = this.cols - left.length - right.length;
    return this.line(gap > 0 ? left + ' '.repeat(gap) + right : (left + ' ' + right).slice(0, this.cols));
  }
  wrap(s, indent = '') {
    const cols = this.cols - indent.length; const out = []; s = String(s);
    while (s.length > cols) { out.push(indent + s.slice(0, cols)); s = s.slice(cols); }
    if (s) out.push(indent + s);
    for (const ln of out) this.line(ln);
    return this;
  }
  cut() { return this.feed(3).cmd(GS, 0x56, 0x42, 0x00); }
  toBase64() { let bin = ''; for (const b of this.bytes) bin += String.fromCharCode(b & 0xff); return btoa(bin); }
}

const rs = (n) => 'Rs.' + (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);

// SQLite stores created_at as UTC "YYYY-MM-DD HH:MM:SS" (no tz marker). Parse it as UTC
// and format to the laptop's local time (IST) so the bill time matches the KOT.
function fmtDate(v) {
  let d;
  if (v) {
    const s = String(v);
    d = (/T/.test(s) || /[Z+]/.test(s)) ? new Date(s) : new Date(s.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) d = new Date(v);
  } else { d = new Date(); }
  return d.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// Convert a logo (data URI / URL) to an ESC/POS GS v 0 raster byte array, sized to the printer.
export function logoToRaster(src, maxDots = 384) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDots / img.width);
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        const wBytes = Math.ceil(w / 8), wDots = wBytes * 8;
        const cv = document.createElement('canvas');
        cv.width = wDots; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, wDots, h);
        ctx.drawImage(img, Math.floor((wDots - w) / 2), 0, w, h);
        const d = ctx.getImageData(0, 0, wDots, h).data;
        const out = new Uint8Array(wBytes * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < wDots; x++) {
          const i = (y * wDots + x) * 4;
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (d[i + 3] > 128 && lum < 140) out[y * wBytes + (x >> 3)] |= (0x80 >> (x & 7));
        }
        const header = [GS, 0x76, 0x30, 0x00, wBytes & 0xff, (wBytes >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff];
        const raster = new Uint8Array(header.length + out.length);
        raster.set(header, 0); raster.set(out, header.length);
        resolve(raster);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function buildBillEscPos(order, items, s, gstEnabled, width, logoRaster) {
  const p = new EscPos(width);
  if (logoRaster) p.align('center').raw(logoRaster).feed(1);
  p.align('center').bold(true).sizeH(true).line(s.outlet_name || 'Restaurant').sizeH(false).bold(false);
  if (s.hero_tagline) p.line(s.hero_tagline);
  if (s.outlet_address) p.wrap(s.outlet_address);
  if (s.outlet_phone) p.line('Ph: ' + s.outlet_phone);
  p.hr('=');
  p.bold(true).line(gstEnabled ? 'TAX INVOICE' : 'BILL').bold(false);
  if (s.outlet_gstin) p.line('GSTIN: ' + s.outlet_gstin);
  if (s.outlet_fssai) p.line('FSSAI: ' + s.outlet_fssai);
  p.align('left').hr();
  p.line('Bill : ' + order.order_number);
  p.line('Date : ' + fmtDate(order.created_at));
  p.line('Type : ' + (order.order_type === 'dine_in' ? 'Dine-in' : 'Takeaway'));
  if (order.customer_name) p.line('Cust : ' + order.customer_name);
  p.hr();
  // Item table in the smaller Font B so long names fit on one line (cb = chars/line in Font B).
  p.fontB(true);
  const cb = p.colsB, amtW = 12, qtyW = 5, itemW = cb - amtW - qtyW;
  p.bold(true).line('Item'.padEnd(itemW) + 'Qty'.padStart(qtyW) + 'Amount'.padStart(amtW)).bold(false);
  p.line('-'.repeat(cb));
  let totalItems = 0;
  for (const i of items) {
    totalItems += i.quantity;
    const qtyAmt = String(i.quantity).padStart(qtyW) + rs(i.unit_price * i.quantity).padStart(amtW);
    const name = i.item_name || '';
    if (name.length <= itemW) {
      p.line(name.padEnd(itemW) + qtyAmt);
    } else {
      p.line(name.slice(0, itemW) + qtyAmt);
      let rest = name.slice(itemW);
      while (rest.length) { p.line(rest.slice(0, cb)); rest = rest.slice(cb); }
    }
  }
  p.fontB(false);
  p.hr();
  p.row(`Subtotal (${totalItems})`, rs(order.subtotal));
  if (gstEnabled) {
    p.row(`CGST ${s.gst_percent / 2}%`, rs(order.tax_amount / 2));
    p.row(`SGST ${s.gst_percent / 2}%`, rs(order.tax_amount / 2));
  }
  if (order.packing_charges > 0) p.row('Packing', rs(order.packing_charges));
  p.hr('=');
  p.bold(true).sizeH(true).row('TOTAL', rs(order.total)).sizeH(false).bold(false);
  p.hr('=');
  p.align('center').feed(1).line('Thank you, visit again!').line(s.outlet_name || '');
  p.cut();
  return p.toBase64();
}

export function buildKotEscPos(kotNumber, orderNumber, type, tableNum, items, width) {
  const p = new EscPos(width);
  p.align('center').bold(true).size(true).line(`KOT #${kotNumber}`).size(false).bold(false);
  p.align('left').hr();
  p.line('Order: ' + orderNumber);
  p.line('Type : ' + (type === 'dine_in' ? 'Dine-in' : 'Takeaway') + (tableNum ? ` (${tableNum})` : ''));
  p.line('Time : ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  p.hr();
  for (const i of items) p.bold(true).sizeH(true).line(`${i.quantity} x ${i.name}`).sizeH(false).bold(false);
  p.hr();
  p.cut();
  return p.toBase64();
}
