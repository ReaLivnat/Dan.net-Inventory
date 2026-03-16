// ============================================================
//  מלאי 4 חנויות דן — Google Apps Script
//  הוראות:
//  1. Extensions → Apps Script → מחק הכל → הדבק → שמור
//  2. Deploy → New deployment → Web App
//  3. Execute as: Me  |  Who has access: Anyone
//  4. Deploy → העתק את ה-URL לאפליקציה
// ============================================================

const STORES = ["סטו-דן", "צילום דן", "צמצם דן", "צמצם סביונים"];

const HEADERS = [
  'ברקוד / מק"ט','שם המוצר','קטגוריה','ספק',
  'כמות במחסן','מינימום להזמנה','סטטוס','עדכון אחרון',
];

const COL = { BARCODE:1,NAME:2,CATEGORY:3,SUPPLIER:4,QTY:5,MIN:6,STATUS:7,UPDATED:8 };

function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  const p      = e.parameter || {};
  const body   = parseBody(e);
  const action  = p.action  || body.action;
  const store   = p.store   || body.store;
  const barcode = p.barcode || body.barcode;
  try {
    switch (action) {
      case "getAll": return json(getAll(store));
      case "getOne": return json(getOne(store, barcode));
      case "update": return json(updateQty(body));
      case "addNew":      return json(addProduct(body));
      case "sendAlert":   return json(sendAlert(body));
      case "sendTransfer":return json(sendTransfer(body));
      default:            return json({ ok:false, error:"פעולה לא מוכרת" });
    }
  } catch(err) { return json({ ok:false, error:err.message }); }
}

function parseBody(e) {
  try { return JSON.parse(e.postData.contents); } catch(_) { return {}; }
}
function json(d) {
  return ContentService.createTextOutput(JSON.stringify(d))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAll(store) {
  if (!store) return { ok:false, error:"חסר שם חנות" };
  const rows = getSheet(store).getDataRange().getValues();
  const products = [];
  for (let i=1;i<rows.length;i++) {
    if (!rows[i][COL.BARCODE-1]) continue;
    products.push(rowToObj(rows[i]));
  }
  return { ok:true, products };
}

function getOne(store, barcode) {
  if (!store||!barcode) return { ok:false, error:"חסר חנות או ברקוד" };
  const row = findRow(store, barcode);
  if (!row) return { ok:true, found:false, barcode };
  return { ok:true, found:true, product:rowToObj(row) };
}

function updateQty(body) {
  const { store, barcode, qty } = body;
  if (!store||!barcode) return { ok:false, error:"חסר חנות או ברקוד" };
  const sheet = getSheet(store);
  const data  = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][COL.BARCODE-1])===String(barcode)) {
      const min = Number(data[i][COL.MIN-1])||0;
      sheet.getRange(i+1,COL.QTY).setValue(Number(qty));
      sheet.getRange(i+1,COL.STATUS).setValue(calcStatus(qty,min));
      sheet.getRange(i+1,COL.UPDATED).setValue(new Date().toLocaleString("he-IL"));
      return { ok:true };
    }
  }
  return { ok:false, error:"מוצר לא נמצא" };
}

function addProduct(body) {
  const { store, barcode, name, category, supplier, qty, min } = body;
  if (!store||!barcode||!name) return { ok:false, error:"חסר חנות, ברקוד או שם" };
  if (findRow(store, barcode)) return { ok:false, error:"ברקוד כבר קיים בחנות זו" };
  const q=Number(qty)||0, m=Number(min)||10;
  getSheet(store).appendRow([
    barcode, name, category||"כללי", supplier||"",
    q, m, calcStatus(q,m), new Date().toLocaleString("he-IL"),
  ]);
  return { ok:true };
}

function getSheet(store) {
  if (!STORES.includes(store)) throw new Error("חנות לא מוכרת: "+store);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(store);
  if (!sh) {
    sh = ss.insertSheet(store);
    sh.appendRow(HEADERS);
    sh.setRightToLeft(true);
    sh.getRange(1,1,1,HEADERS.length)
      .setBackground("#1F3864").setFontColor("#FFFFFF").setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRow(store, barcode) {
  const data = getSheet(store).getDataRange().getValues();
  for (let i=1;i<data.length;i++)
    if (String(data[i][COL.BARCODE-1])===String(barcode)) return data[i];
  return null;
}

function rowToObj(r) {
  return {
    barcode : String(r[COL.BARCODE-1]),
    name    : r[COL.NAME-1],
    category: r[COL.CATEGORY-1]||"",
    supplier: r[COL.SUPPLIER-1]||"",
    qty     : Number(r[COL.QTY-1])||0,
    min     : Number(r[COL.MIN-1])||0,
    status  : r[COL.STATUS-1]||"",
    updated : r[COL.UPDATED-1]||"",
  };
}

function calcStatus(qty, min) {
  qty=Number(qty); min=Number(min);
  if (qty<=0)   return "🔴 חסר — הזמן מיד";
  if (qty<=min) return "🟡 הזמן עכשיו";
  return "🟢 תקין";
}

// הרץ פעם אחת ידנית מ-Apps Script ליצירת 4 גיליונות
function initAllSheets() {
  STORES.forEach(s => getSheet(s));
  Logger.log("✅ 4 גיליונות נוצרו בהצלחה");
}

// ── שליחת התראת מייל ─────────────────────────────────────
function sendAlert(body) {
  const { store, productName, barcode, qty, min, storeEmail, managerEmail } = body;
  const subject = `⚠️ התראת מלאי — ${productName} ב${store}`;
  const msg = `שלום,\n\nמוצר "${productName}" (ברקוד: ${barcode}) ב${store} ירד מתחת למינימום.\n\nכמות נוכחית: ${qty}\nמינימום: ${min}\n\nנא לטפל בהקדם.\n\nמערכת מלאי חנויות דן`;
  try {
    GmailApp.sendEmail(storeEmail, subject, msg);
    GmailApp.sendEmail(managerEmail, subject, msg);
  } catch(e) {
    return { ok: false, error: e.message };
  }
  return { ok: true };
}

// ── שליחת בקשת העברת מלאי ────────────────────────────────
function sendTransfer(body) {
  const { fromStore, toStore, productName, barcode, qty, managerEmail } = body;
  const subject = `↔️ בקשת העברת מלאי — ${productName}`;
  const msg = `שלום,\n\nהתקבלה בקשה להעברת מלאי:\n\nמוצר: ${productName} (ברקוד: ${barcode})\nמ: ${fromStore}\nל: ${toStore}\nכמות: ${qty}\n\nנא לאשר ולבצע את ההעברה.\n\nמערכת מלאי חנויות דן`;
  try {
    GmailApp.sendEmail(managerEmail, subject, msg);
  } catch(e) {
    return { ok: false, error: e.message };
  }
  return { ok: true };
}
