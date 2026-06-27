// ESC/POS builder for thermal receipts — works on any thermal printer.
// Text uses "Rs." (basic printers can't render ₹). Logo prints via GS v 0 raster.
const ESC = 0x1b, GS = 0x1d;

export default class EscPos {
  constructor(width = 80) {
    this.cols = parseInt(width) === 58 ? 32 : 48;
    this.dots = parseInt(width) === 58 ? 384 : 576; // printable dots
    this.bytes = [];
    this.cmd(ESC, 0x40);
  }
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
  p.line('Date : ' + new Date(order.created_at || Date.now()).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  p.line('Type : ' + (order.order_type === 'dine_in' ? 'Dine-in' : 'Takeaway'));
  if (order.customer_name) p.line('Cust : ' + order.customer_name);
  p.hr();
  p.bold(true).row('Item', 'Amount').bold(false);
  p.hr();
  let totalItems = 0;
  for (const i of items) {
    const name = i.item_name + (i.variant_name ? ` (${i.variant_name})` : '');
    totalItems += i.quantity;
    p.wrap(name);
    p.row(`  ${i.quantity} x ${rs(i.unit_price)}`, rs(i.unit_price * i.quantity));
  }
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
