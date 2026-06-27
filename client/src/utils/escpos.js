// Minimal ESC/POS builder for thermal receipts.
// Text-based for maximum compatibility with cheap / non-branded printers.
// Uses "Rs." instead of ₹ because basic thermal printers can't render the rupee glyph.
const ESC = 0x1b, GS = 0x1d;

export default class EscPos {
  constructor(width = 80) {
    this.cols = parseInt(width) === 58 ? 32 : 48; // characters per line
    this.bytes = [];
    this.cmd(ESC, 0x40); // initialize
  }
  cmd(...b) { this.bytes.push(...b); return this; }
  _bytes(s) {
    s = String(s).replace(/₹/g, 'Rs.').replace(/[^\x00-\x7F]/g, '');
    const out = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }
  text(s) { this.bytes.push(...this._bytes(s)); return this; }
  line(s = '') { return this.text(s).feed(1); }
  align(a) { return this.cmd(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on) { return this.cmd(ESC, 0x45, on ? 1 : 0); }
  size(big) { return this.cmd(GS, 0x21, big ? 0x11 : 0x00); } // double w+h / normal
  feed(n = 1) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this; }
  hr(ch = '-') { return this.line(ch.repeat(this.cols)); }
  // left text + right text padded to full width (for item/amount rows)
  row(left, right) {
    left = String(left); right = String(right);
    const gap = this.cols - left.length - right.length;
    const l = gap > 0 ? left + ' '.repeat(gap) + right : (left + ' ' + right).slice(0, this.cols);
    return this.line(l);
  }
  cut() { return this.feed(3).cmd(GS, 0x56, 0x42, 0x00); } // feed + partial cut (function B)
  toBase64() {
    let bin = '';
    for (const b of this.bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
}

const rs = (n) => 'Rs.' + (Math.round((parseFloat(n) || 0) * 100) / 100);

export function buildBillEscPos(order, items, s, gstEnabled, width) {
  const p = new EscPos(width);
  p.align('center').bold(true).size(true).line(s.outlet_name || 'Restaurant').size(false).bold(false);
  if (s.hero_tagline) p.line(s.hero_tagline);
  if (s.outlet_address) p.line(s.outlet_address);
  if (s.outlet_phone) p.line('Ph: ' + s.outlet_phone);
  p.hr('=');
  p.bold(true).line(gstEnabled ? 'TAX INVOICE' : 'BILL').bold(false);
  if (s.outlet_gstin) p.line('GSTIN: ' + s.outlet_gstin);
  if (s.outlet_fssai) p.line('FSSAI: ' + s.outlet_fssai);
  p.align('left').hr();
  p.line('Bill: ' + order.order_number);
  p.line('Date: ' + new Date(order.created_at || Date.now()).toLocaleString('en-IN'));
  p.line('Type: ' + (order.order_type === 'dine_in' ? 'Dine-in' : 'Takeaway'));
  if (order.customer_name) p.line('Customer: ' + order.customer_name);
  p.hr();
  p.row('Item  Qty', 'Amount');
  p.hr();
  let totalItems = 0;
  for (const i of items) {
    const name = i.item_name + (i.variant_name ? ` (${i.variant_name})` : '');
    const amt = (i.unit_price * i.quantity).toFixed(0);
    totalItems += i.quantity;
    p.row(`${name} x${i.quantity}`, rs(amt));
  }
  p.hr();
  p.row(`Subtotal (${totalItems})`, rs(order.subtotal));
  if (gstEnabled) {
    p.row(`CGST (${s.gst_percent / 2}%)`, rs(order.tax_amount / 2));
    p.row(`SGST (${s.gst_percent / 2}%)`, rs(order.tax_amount / 2));
  }
  if (order.packing_charges > 0) p.row('Packing', rs(order.packing_charges));
  p.hr('=');
  p.bold(true).size(true).row('TOTAL', rs(order.total)).size(false).bold(false);
  p.hr('=');
  p.align('center').feed(1).line('Thank you! Visit again').line(s.outlet_name || '');
  p.cut();
  return p.toBase64();
}

export function buildKotEscPos(kotNumber, orderNumber, type, tableNum, items, width) {
  const p = new EscPos(width);
  p.align('center').bold(true).size(true).line(`KOT #${kotNumber}`).size(false).bold(false);
  p.align('left').hr();
  p.line('Order: ' + orderNumber);
  p.line('Type: ' + (type === 'dine_in' ? 'Dine-in' : 'Takeaway') + (tableNum ? ` (${tableNum})` : ''));
  p.line('Time: ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  p.hr();
  for (const i of items) p.bold(true).size(true).line(`${i.quantity} x ${i.name}`).size(false).bold(false);
  p.hr();
  p.cut();
  return p.toBase64();
}
