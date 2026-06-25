/* =====================================================================
   IBI Flipkart & Shopsy Pricing Calculator
   India Business International
   ---------------------------------------------------------------------
   Zero-dependency vanilla JS. All fee defaults reflect Flipkart's
   Nov-2025 rate revision (Gold tier) as published mid-2026 and are
   editable in the UI. The app SOLVES for the retail price that yields
   the target profit after every platform fee, return provision and GST.
   ===================================================================== */
"use strict";

/* ----------------------------- Defaults ----------------------------- */
// Category -> typical Flipkart commission % (mid-of-range, editable).
const CATEGORIES = [
  ["Mobiles & Tablets", 5],
  ["Electronics & Accessories", 8],
  ["Computers & Laptops", 5],
  ["Large & Small Appliances", 7],
  ["Men's Clothing", 14],
  ["Women's Clothing", 15],
  ["Kids' Clothing", 13],
  ["Footwear", 14],
  ["Watches, Bags & Belts", 16],
  ["Fashion / Imitation Jewellery", 20],
  ["Home & Kitchen", 12],
  ["Home Decor & Furnishing", 14],
  ["Furniture", 15],
  ["Beauty & Personal Care", 10],
  ["Health & Nutrition", 12],
  ["Grocery & Gourmet", 8],
  ["Books", 10],
  ["Toys, Baby & Kids", 10],
  ["Sports & Fitness", 12],
  ["Automotive Accessories", 10],
  ["Stationery & Office", 12],
  ["Pet Supplies", 11],
  ["Other / Custom", 12],
];

// Fixed (closing) fee by price slab, PER SELLER TIER.
// Flipkart tiers: Bronze · Silver · Gold · Diamond (higher tier = lower fee +
// faster settlement). Gold is the researched Nov-2025 baseline; the other
// tiers are scaled, indicative defaults — all editable & remembered per tier.
const BIG = 1e12; // sentinel for "no upper bound" (JSON-safe, unlike Infinity)
const SLAB_CAPS = [250, 500, 1000, 5000, BIG];
// Base Rate Card = the fixed/closing fee that SILVER & GOLD both pay
// (Nov-2025 baseline). Editable in the UI. [upTo, NFBF, FBF]
const BASE_FIXED = [
  { upTo: 250,  nfbf: 11, fbf: 9 },
  { upTo: 500,  nfbf: 18, fbf: 14 },
  { upTo: 1000, nfbf: 30, fbf: 24 },
  { upTo: 5000, nfbf: 65, fbf: 50 },
  { upTo: BIG,  nfbf: 90, fbf: 70 },
];
// Per-tier treatment from Flipkart Seller Hub "Tier Criteria & Benefits"
// (verified Jun 2026). Fixed fee = base card adjusted per tier; settlement
// days are exact. Bronze +₹10 · Silver/Gold = base · Diamond −₹15 (up to ₹30).
const TIER_INFO = {
  bronze:  { label: "Bronze",  pay: "15 days", adj: "Base + ₹10" },
  silver:  { label: "Silver",  pay: "10 days", adj: "Base Rate Card" },
  gold:    { label: "Gold",    pay: "3 days",  adj: "Base Rate Card" },
  diamond: { label: "Diamond", pay: "2 days",  adj: "Base − ₹15 (up to ₹30)" },
};
const DEFAULT_TIER = "silver";
let activeTier = DEFAULT_TIER;
// Apply the tier adjustment to a base fixed (closing) fee.
function tierAdjustFixed(base, tier, bronzeAdd, diamondSub) {
  if (tier === "bronze") return base + bronzeAdd;
  if (tier === "diamond") return Math.max(0, base - diamondSub);
  return base; // silver & gold pay the base rate card unchanged
}

// eKart forward shipping rate card. [upTo grams, local, zonal, national]
const DEFAULT_SHIP = [
  { upTo: 500,   local: 0,   zonal: 0,   national: 40 },
  { upTo: 1000,  local: 28,  zonal: 40,  national: 63 },
  { upTo: 2000,  local: 48,  zonal: 63,  national: 85 },
  { upTo: 5000,  local: 75,  zonal: 98,  national: 125 },
  { upTo: 12000, local: 120, zonal: 145, national: 185 },
];

const STORE_KEY = "ibi_flipkart_calc_v1";

/* ----------------------------- Helpers ------------------------------ */
const $ = (id) => document.getElementById(id);
const inr = (n) =>
  "₹" + (isFinite(n) ? Math.round(n).toLocaleString("en-IN") : "0");
const inr2 = (n) =>
  "₹" +
  (isFinite(n)
    ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00");
const pct = (n) => (isFinite(n) ? n.toFixed(1) + "%" : "0%");
const num = (id, d = 0) => {
  const v = parseFloat($(id) && $(id).value);
  return isFinite(v) ? v : d;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ------------------------- Build editable tables -------------------- */
function buildCategoryOptions() {
  const sel = $("category");
  sel.innerHTML = CATEGORIES.map(
    ([n], i) => `<option value="${i}">${n}</option>`
  ).join("");
}

function buildFixedTable(data) {
  const tb = $("fixedTable");
  tb.innerHTML = data
    .map((r, i) => {
      const label = r.upTo >= 1e9 ? "Above ₹5,000" : "₹" + r.upTo.toLocaleString("en-IN");
      return `<tr>
        <td>${label}</td>
        <td><input type="number" min="0" step="1" data-fx="${i}" data-k="nfbf" value="${r.nfbf}"></td>
        <td><input type="number" min="0" step="1" data-fx="${i}" data-k="fbf" value="${r.fbf}"></td>
      </tr>`;
    })
    .join("");
}

function buildShipTable(data) {
  const tb = $("shipTable");
  tb.innerHTML = data
    .map((r, i) => {
      const label =
        r.upTo >= 1000 ? r.upTo / 1000 + " kg" : r.upTo + " g";
      return `<tr>
        <td>${label}</td>
        <td><input type="number" min="0" step="1" data-sh="${i}" data-k="local" value="${r.local}"></td>
        <td><input type="number" min="0" step="1" data-sh="${i}" data-k="zonal" value="${r.zonal}"></td>
        <td><input type="number" min="0" step="1" data-sh="${i}" data-k="national" value="${r.national}"></td>
      </tr>`;
    })
    .join("");
}

function readFixedTable() {
  const rows = SLAB_CAPS.map((upTo) => ({ upTo, nfbf: 0, fbf: 0 }));
  document.querySelectorAll("[data-fx]").forEach((el) => {
    rows[+el.dataset.fx][el.dataset.k] = parseFloat(el.value) || 0;
  });
  return rows;
}

// Switch tier — there is ONE shared base rate card, so this only relabels.
function loadTier(tier) {
  activeTier = tier;
  updateTierUI();
}
function updateTierUI() {
  const info = TIER_INFO[activeTier] || TIER_INFO.silver;
  const pay = $("tierPayInfo"); if (pay) pay.value = info.pay;
  const note = $("tierNote");
  if (note)
    note.innerHTML =
      `<b>${info.label}</b> tier · fixed fee = <b>${info.adj}</b> · payment in <b>${info.pay}</b>. ` +
      `Silver &amp; Gold share the base rate card; Bronze adds ₹10/order, Diamond saves up to ₹30/order &amp; settles fastest.`;
  const fs = $("fixedSummary");
  if (fs) fs.textContent = "Base Rate Card — fixed (closing) fee by slab (Silver/Gold base)";
}
function readShipTable() {
  const rows = JSON.parse(JSON.stringify(DEFAULT_SHIP));
  document.querySelectorAll("[data-sh]").forEach((el) => {
    rows[+el.dataset.sh][el.dataset.k] = parseFloat(el.value) || 0;
  });
  return rows;
}

/* --------------------------- Fee functions -------------------------- */
function fixedFeeFor(price, slabs, fulfil) {
  for (const s of slabs) if (price <= s.upTo) return fulfil === "fbf" ? s.fbf : s.nfbf;
  const last = slabs[slabs.length - 1];
  return fulfil === "fbf" ? last.fbf : last.nfbf;
}

function shippingFor(zone, grams, card, beyond) {
  const last = card[card.length - 1];
  if (grams <= last.upTo) {
    for (const s of card) if (grams <= s.upTo) return s[zone];
  }
  const extraKg = Math.ceil((grams - last.upTo) / 1000);
  return last[zone] + extraKg * beyond[zone];
}

function reverseShipFor(zone, grams, base, per500) {
  const b = { local: base.local, zonal: base.zonal, national: base.national }[zone];
  const extra = grams > 500 ? Math.ceil((grams - 500) / 500) * per500 : 0;
  return b + extra;
}

/* ----------------------- Gather all inputs -------------------------- */
function gatherCtx() {
  const fixed = readFixedTable();
  const ship = readShipTable();
  const beyond = {
    local: num("shipBeyondLocal", 10),
    zonal: num("shipBeyondZonal", 12),
    national: num("shipBeyondNational", 15),
  };
  const revBase = {
    local: num("revLocal", 65),
    zonal: num("revZonal", 85),
    national: num("revNational", 105),
  };
  const zone = $("zone").value;
  const weight = Math.max(1, num("weight", 500));
  const fulfil = $("fulfil").value;

  // reverse shipping (auto or manual)
  const autoRev = $("autoReverse").checked;
  const revAuto = reverseShipFor(zone, weight, revBase, num("revPer500", 30));
  if (autoRev) $("reverseShip").value = Math.round(revAuto);
  const reverseShip = autoRev ? revAuto : num("reverseShip", 0);

  const codShare = clamp(num("codShare", 55), 0, 100) / 100;

  return {
    platform: window.__platform || "flipkart",
    wsp: num("wsp", 0),
    packing: num("packing", 0),
    labour: num("labour", 0),
    margin: num("margin", 25) / 100,
    profitBasis: $("profitBasis").value,
    gst: num("gst", 0) / 100,
    claimITC: $("claimITC").checked,
    rounding: $("rounding").value,

    commission: num("commission", 12) / 100,
    zeroUnder1000: $("zeroUnder1000").checked,
    commBase: $("commBase").value,

    tier: activeTier,
    bronzeAdd: num("bronzeAdd", 10),
    diamondSub: num("diamondSub", 15),
    zone, weight, fulfil,
    fixed, ship, beyond,
    forwardShip: shippingFor(zone, weight, ship, beyond),
    reverseShip,

    collPrepaid: num("collPrepaid", 2) / 100,
    collCod: num("collCod", 2.5) / 100,
    codShare,
    feeGst: num("feeGst", 18) / 100,

    returnRate: clamp(num("returnRate", 10), 0, 100) / 100,
    damageRate: clamp(num("damageRate", 15), 0, 100) / 100,

    adsRate: num("adsRate", 0) / 100,
    otherCost: num("otherCost", 0),

    tcs: num("tcs", 1) / 100,
    tds: num("tds", 0.1) / 100,
    showTax: $("showTax").checked,
  };
}

/* --------------------- Core economics @ a price --------------------- */
// Returns full breakdown for a given GST-inclusive selling price `sp`.
function economicsAt(sp, c, platform) {
  const taxable = sp / (1 + c.gst);
  const outputGST = sp - taxable;

  const isShopsy = platform === "shopsy";
  // Commission
  let commission = 0;
  if (!isShopsy) {
    const base = c.commBase === "net" ? taxable : sp;
    const rate = c.zeroUnder1000 && sp < 1000 ? 0 : c.commission;
    commission = rate * base;
  }
  // Fixed (Shopsy = 0); Flipkart = base rate card adjusted for seller tier
  const fixed = isShopsy
    ? 0
    : tierAdjustFixed(fixedFeeFor(sp, c.fixed, c.fulfil), c.tier, c.bronzeAdd, c.diamondSub);
  // Shipping & collection apply to both platforms (eKart)
  const shipping = c.forwardShip;
  const collRate = c.codShare * c.collCod + (1 - c.codShare) * c.collPrepaid;
  const collection = collRate * sp;

  const feesExGst = commission + fixed + shipping + collection;
  const feeGST = c.feeGst * feesExGst;
  const feeGSTcost = c.claimITC ? 0 : feeGST;

  // Settlement = what the marketplace credits to the bank (fee GST always
  // deducted at settlement; reclaimed later via ITC if applicable).
  const settlement = sp - feesExGst - feeGST;

  // Return provision per unit SOLD
  const perReturn =
    shipping /*forward lost*/ +
    c.reverseShip /*reverse*/ +
    c.damageRate * c.wsp /*write-off*/ +
    (1 - c.damageRate) * (c.packing + c.labour) /*re-pack resold*/;
  const returnProvision = c.returnRate * perReturn;

  const ads = c.adsRate * sp;
  const cost = c.wsp + c.packing + c.labour;

  // Profit (registered seller, GST pass-through on product):
  // profit = taxable revenue − fees(exGST) − feeGSTcost − costs − returns − ads − other
  const profit =
    taxable - feesExGst - feeGSTcost - cost - returnProvision - ads - c.otherCost;

  return {
    sp, taxable, outputGST,
    commission, fixed, shipping, collection, collRate,
    feesExGst, feeGST, feeGSTcost, settlement,
    returnProvision, perReturn, ads, cost, profit,
    tcs: c.tcs * taxable, tds: c.tds * sp,
  };
}

function targetProfit(c, sp) {
  if (c.profitBasis === "price") return c.margin * (sp / (1 + c.gst));
  return c.margin * (c.wsp + c.packing + c.labour); // markup on cost
}

// Binary search the GST-inclusive price that hits the target profit.
function solvePrice(c, platform) {
  let lo = 0,
    hi = Math.max(1000, (c.wsp + c.packing + c.labour) * 50 + 5000);
  // ensure hi is high enough
  for (let i = 0; i < 40; i++) {
    if (economicsAt(hi, c, platform).profit - targetProfit(c, hi) > 0) break;
    hi *= 2;
    if (hi > 1e9) break;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const f = economicsAt(mid, c, platform).profit - targetProfit(c, mid);
    if (f > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/* --------------------------- Rounding ------------------------------- */
function roundPrice(p, mode) {
  if (mode === "none") return p;
  if (mode === "charm") {
    // round up to nearest …99 (or …49 for sub-100 friendliness)
    if (p < 100) return Math.max(0, Math.ceil(p / 50) * 50 - 1); // 49 / 99
    return Math.ceil(p / 100) * 100 - 1;
  }
  const step = parseFloat(mode);
  return Math.round(p / step) * step;
}

/* --------------------------- Breakeven ------------------------------ */
function breakevenPrice(c, platform) {
  // price at which profit = 0
  const saved = c.margin, basis = c.profitBasis;
  c.margin = 0; c.profitBasis = "cost";
  const p = solvePrice(c, platform);
  c.margin = saved; c.profitBasis = basis;
  return p;
}

/* ============================ RENDER ================================ */
function render() {
  const c = gatherCtx();
  const platform = c.platform;
  const isShopsy = platform === "shopsy";

  // Solve for both platforms (for comparison) at the same target.
  const rawPrice = solvePrice(c, platform);
  const finalPrice = roundPrice(rawPrice, c.rounding);
  const e = economicsAt(finalPrice, c, platform); // actual economics at the listed price

  /* ---- Hero ---- */
  const hero = $("priceHero");
  hero.classList.toggle("shopsy-mode", isShopsy);
  $("heroTag").textContent =
    "Recommended Retail Price · " + (isShopsy ? "Shopsy" : "Flipkart");
  $("heroPrice").textContent = inr(finalPrice);
  const bePrice = breakevenPrice(c, platform);
  $("heroCharm").innerHTML =
    `incl. GST · base <b>${inr2(e.taxable)}</b> + GST <b>${inr2(e.outputGST)}</b>` +
    (c.rounding !== "none" ? ` · exact ${inr2(rawPrice)}` : "") +
    ` · breakeven <b>${inr(bePrice)}</b>`;

  /* ---- KPIs ---- */
  const totalCost = c.wsp + c.packing + c.labour;
  const netMargin = (e.profit / e.taxable) * 100;
  const markup = (e.profit / totalCost) * 100;
  const roi = (e.profit / totalCost) * 100;
  setKPI("kpiProfit", inr2(e.profit), e.profit >= 0);
  setKPI("kpiMargin", pct(netMargin), e.profit >= 0);
  $("kpiMarkup").textContent = pct(markup);
  $("kpiRoi").textContent = pct(roi);

  /* ---- Alerts ---- */
  const alerts = [];
  if (e.profit < 0)
    alerts.push(["bad", "⚠ Loss at this price — even at the target this product cannot clear all fees. Lower WSP/packing or reconsider the category."]);
  if (c.zeroUnder1000 && !isShopsy && finalPrice >= 1000 && rawPrice < 1000)
    alerts.push(["warn", "Crossing ₹1,000 adds commission. A price just under ₹1,000 may net more — test both."]);
  if (c.weight <= 500 && (c.zone === "local" || c.zone === "zonal") && c.forwardShip === 0)
    alerts.push(["warn", "Sub-500g local/zonal shipping is free under the current rate card — great for margins."]);
  $("alertBox").innerHTML = alerts
    .map(([t, m]) => `<div class="alert ${t === "bad" ? "bad" : ""}">${m}</div>`)
    .join("");

  /* ---- Breakdown ---- */
  $("brkPlatform").innerHTML = isShopsy
    ? '<span class="sh">Shopsy</span>'
    : '<span class="fk">Flipkart</span>';
  const taxRows = c.showTax
    ? `<tr class="sub"><td>TCS (GST, adjustable)</td><td>−${inr2(e.tcs)}</td></tr>
       <tr class="sub"><td>TDS (194-O, adjustable)</td><td>−${inr2(e.tds)}</td></tr>`
    : "";
  $("breakdown").innerHTML = `
    <tr class="head"><td>Revenue</td><td></td></tr>
    <tr><td>Retail price (customer pays, incl. GST)</td><td>${inr2(e.sp)}</td></tr>
    <tr class="sub"><td>Less: GST collected (remitted to govt)</td><td>−${inr2(e.outputGST)}</td></tr>
    <tr><td><b>Taxable sale value</b></td><td><b>${inr2(e.taxable)}</b></td></tr>

    <tr class="head"><td>${isShopsy ? "Shopsy" : "Flipkart"} fees (deducted at settlement)</td><td></td></tr>
    <tr class="sub"><td>Commission${isShopsy ? " (0% on Shopsy)" : (c.zeroUnder1000 && e.sp < 1000 ? " (0% under ₹1,000)" : ` (${pct(c.commission*100)})`)}</td><td>−${inr2(e.commission)}</td></tr>
    <tr class="sub"><td>Fixed / closing fee${isShopsy ? " (waived)" : ` (${(TIER_INFO[c.tier]||TIER_INFO.silver).label}: ${(TIER_INFO[c.tier]||TIER_INFO.silver).adj})`}</td><td>−${inr2(e.fixed)}</td></tr>
    <tr class="sub"><td>eKart shipping (${labelZone(c.zone)}, ${c.weight} g)</td><td>−${inr2(e.shipping)}</td></tr>
    <tr class="sub"><td>Collection fee (${pct(e.collRate*100)} blended)</td><td>−${inr2(e.collection)}</td></tr>
    <tr class="sub"><td>GST on fees (${pct(c.feeGst*100)})${c.claimITC ? " — reclaimed via ITC" : ""}</td><td>−${inr2(e.feeGST)}</td></tr>
    <tr><td><b>Net settlement to your bank</b></td><td><b>${inr2(e.settlement)}</b></td></tr>
    ${taxRows}

    <tr class="head"><td>Your costs</td><td></td></tr>
    <tr class="sub"><td>Wholesale price (WSP)</td><td>−${inr2(c.wsp)}</td></tr>
    <tr class="sub"><td>Packing</td><td>−${inr2(c.packing)}</td></tr>
    <tr class="sub"><td>Labour</td><td>−${inr2(c.labour)}</td></tr>
    <tr class="sub"><td>Return provision (${pct(c.returnRate*100)} × ${inr2(e.perReturn)})</td><td>−${inr2(e.returnProvision)}</td></tr>
    ${c.adsRate>0?`<tr class="sub"><td>Advertising (${pct(c.adsRate*100)})</td><td>−${inr2(e.ads)}</td></tr>`:""}
    ${c.otherCost>0?`<tr class="sub"><td>Other</td><td>−${inr2(c.otherCost)}</td></tr>`:""}
    ${c.claimITC?"":`<tr class="sub"><td>GST on fees (not reclaimed)</td><td>included above</td></tr>`}

    <tr class="total"><td>Net profit per unit</td><td class="${e.profit>=0?'pos':'neg'}">${inr2(e.profit)}</td></tr>
  `;

  /* ---- Cost bar ---- */
  renderBar(e, c);

  /* ---- Market price ---- */
  renderMarket(finalPrice, c);

  /* ---- Comparison ---- */
  renderComparison(c);

  /* ---- Monthly ---- */
  renderMonthly(e, c);

  /* ---- persist + status ---- */
  saveState();
  $("liveStatus").textContent =
    "Computed " + new Date().toLocaleString("en-IN") + " · saved locally in your browser.";
}

function setKPI(id, txt, good) {
  const el = $(id);
  el.textContent = txt;
  el.classList.toggle("good", good);
  el.classList.toggle("bad", !good);
}
function labelZone(z) {
  return { local: "Local", zonal: "Regional", national: "National" }[z];
}

/* --------------------------- Cost bar ------------------------------- */
function renderBar(e, c) {
  const parts = [
    ["WSP", c.wsp, "#2874F0"],
    ["Packing", c.packing, "#5b9bd5"],
    ["Labour", c.labour, "#8e44ad"],
    ["Platform fees", e.feesExGst + e.feeGSTcost, "#e67e22"],
    ["Returns", e.returnProvision, "#d23b2f"],
    ["Ads/Other", e.ads + c.otherCost, "#7f8c8d"],
    ["GST (pass-thru)", e.outputGST, "#bdc3c7"],
    ["Profit", Math.max(0, e.profit), "#1a8a4a"],
  ].filter((p) => p[1] > 0.01);
  const tot = parts.reduce((s, p) => s + p[1], 0) || 1;
  $("costBar").innerHTML = parts
    .map(
      (p) =>
        `<span style="width:${(p[1] / tot) * 100}%;background:${p[2]}" title="${p[0]}: ${inr2(p[1])}"></span>`
    )
    .join("");
  $("costLegend").innerHTML = parts
    .map(
      (p) =>
        `<span><i style="background:${p[2]}"></i>${p[0]} ${inr(p[1])} (${((p[1] / tot) * 100).toFixed(0)}%)</span>`
    )
    .join("");
}

/* ------------------------- Market price ----------------------------- */
function getCompetitorPrices() {
  return [...document.querySelectorAll(".comp-input")]
    .map((el) => parseFloat(el.value))
    .filter((v) => isFinite(v) && v > 0);
}
function renderMarket(price, c) {
  const comps = getCompetitorPrices();
  let min, max, avg, note;
  if (comps.length) {
    min = Math.min(...comps);
    max = Math.max(...comps);
    avg = comps.reduce((a, b) => a + b, 0) / comps.length;
    const sorted = [...comps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    note = `Based on <b>${comps.length}</b> competitor price(s) you entered · median ${inr(median)}. Your price is <b>${price <= avg ? "below" : "above"}</b> the market average.`;
  } else {
    min = price * (1 - num("spreadDown", 8) / 100);
    max = price * (1 + num("spreadUp", 22) / 100);
    avg = (min + max) / 2;
    note = `Estimated band around your price using your spread settings (−${num("spreadDown",8)}% / +${num("spreadUp",22)}%). Add competitor prices above for real figures.`;
  }
  $("mktMin").textContent = inr(min);
  $("mktAvg").textContent = inr(avg);
  $("mktMax").textContent = inr(max);
  // position marker on scale
  const lo = Math.min(min, price), hi = Math.max(max, price);
  const posPct = clamp(((price - lo) / (hi - lo || 1)) * 100, 0, 100);
  $("youMark").style.left = posPct + "%";
  $("youMark").setAttribute("data-l", "You " + inr(price));
  $("mktNote").innerHTML = note;
}

/* ----------------------- Flipkart vs Shopsy ------------------------- */
function renderComparison(c) {
  const rows = ["flipkart", "shopsy"].map((p) => {
    const raw = solvePrice(c, p);
    const price = roundPrice(raw, c.rounding);
    const e = economicsAt(price, c, p);
    return { p, price, e };
  });
  const [fk, sh] = rows;
  // "winner" = lower required retail price for the same profit
  const fkWin = fk.price <= sh.price;
  $("cmpTable").innerHTML = `
    <thead><tr><th>Metric</th><th class="fk">Flipkart</th><th class="sh">Shopsy</th></tr></thead>
    <tbody>
      <tr class="${fkWin ? "winner" : ""}"><td>Required retail price (incl. GST)</td><td>${inr(fk.price)}</td><td>${inr(sh.price)}</td></tr>
      <tr><td>Commission</td><td>${inr2(fk.e.commission)}</td><td>${inr2(sh.e.commission)}</td></tr>
      <tr><td>Fixed fee</td><td>${inr2(fk.e.fixed)}</td><td>${inr2(sh.e.fixed)}</td></tr>
      <tr><td>Shipping + collection</td><td>${inr2(fk.e.shipping + fk.e.collection)}</td><td>${inr2(sh.e.shipping + sh.e.collection)}</td></tr>
      <tr><td>Total deductions</td><td>${inr2(fk.e.feesExGst + fk.e.feeGST)}</td><td>${inr2(sh.e.feesExGst + sh.e.feeGST)}</td></tr>
      <tr><td>Net profit / unit</td><td>${inr2(fk.e.profit)}</td><td>${inr2(sh.e.profit)}</td></tr>
    </tbody>`;
  const diff = Math.abs(fk.price - sh.price);
  $("cmpNote").innerHTML = fkWin
    ? `For the same ${pct(c.margin*100)} target, <b class="fk">Flipkart</b> lets you price ${inr(diff)} lower (wider reach). <b class="sh">Shopsy</b> still wins on value-segment buyers with its zero commission.`
    : `<b class="sh">Shopsy's</b> zero commission lets you price ${inr(diff)} lower than Flipkart for the same ${pct(c.margin*100)} target — strong for price-sensitive, sub-₹1,000 products.`;
}

/* --------------------------- Monthly -------------------------------- */
function renderMonthly(e, c) {
  const u = num("unitsMonth", 0);
  const card = $("monthlyCard");
  if (u <= 0) { card.style.display = "none"; return; }
  card.style.display = "";
  const sold = u;
  $("monthly").innerHTML = `
    <tr class="head"><td>Per month @ ${u.toLocaleString("en-IN")} units</td><td></td></tr>
    <tr><td>Gross sales (incl. GST)</td><td>${inr(e.sp * sold)}</td></tr>
    <tr><td>Bank settlement</td><td>${inr(e.settlement * sold)}</td></tr>
    <tr><td>Total platform fees</td><td>${inr((e.feesExGst + e.feeGST) * sold)}</td></tr>
    <tr><td>Return provision</td><td>${inr(e.returnProvision * sold)}</td></tr>
    <tr class="total"><td>Net profit / month</td><td class="${e.profit>=0?'pos':'neg'}">${inr(e.profit * sold)}</td></tr>`;
}

/* ----------------------- Competitor rows ---------------------------- */
function addCompRow(val = "") {
  const wrap = document.createElement("div");
  wrap.className = "compitem";
  wrap.innerHTML = `<div class="inputgroup prefixed" style="flex:1"><span class="prefix">₹</span><input type="number" class="comp-input" step="1" min="0" value="${val}" placeholder="competitor price"></div><button type="button" title="remove">✕</button>`;
  wrap.querySelector("button").onclick = () => { wrap.remove(); render(); };
  wrap.querySelector("input").addEventListener("input", debounce(render, 250));
  $("compList").appendChild(wrap);
}

/* --------------------------- Packing -------------------------------- */
function sumPacking() {
  let s = 0;
  document.querySelectorAll(".pk").forEach((el) => (s += parseFloat(el.value) || 0));
  $("pkSum").textContent = inr2(s);
  return s;
}

/* ----------------------- Volumetric weight -------------------------- */
function calcVol() {
  const v = (num("dimL", 0) * num("dimW", 0) * num("dimH", 0)) / 5000; // kg
  const grams = Math.round(v * 1000);
  $("volOut").textContent = grams > 0 ? grams + " g (" + v.toFixed(2) + " kg)" : "—";
  return grams;
}

/* ----------------------- Persistence -------------------------------- */
function saveState() {
  const data = {};
  document.querySelectorAll("input,select").forEach((el) => {
    if (!el.id) return; // table cells have no id and are saved via __fixed/__ship
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  data.__platform = window.__platform;
  data.__activeTier = activeTier;
  data.__fixed = readFixedTable();
  data.__comps = getCompetitorPrices();
  data.__ship = readShipTable();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
}
function loadState() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  if (!data) return false;
  activeTier = data.__activeTier || DEFAULT_TIER;
  buildFixedTable(data.__fixed && data.__fixed.length ? data.__fixed : BASE_FIXED);
  if (data.__ship) buildShipTable(data.__ship);
  Object.keys(data).forEach((k) => {
    const el = $(k);
    if (!el) return;
    if (el.type === "checkbox") el.checked = data[k];
    else el.value = data[k];
  });
  if (data.__platform) setPlatform(data.__platform);
  if (Array.isArray(data.__comps)) data.__comps.forEach((v) => addCompRow(v));
  return true;
}

/* ----------------------- Platform toggle ---------------------------- */
function setPlatform(p) {
  window.__platform = p;
  document.querySelectorAll("#platformSeg button").forEach((b) =>
    b.classList.toggle("active", b.dataset.v === p)
  );
}

/* --------------------------- Export --------------------------------- */
function exportCSV() {
  const c = gatherCtx();
  const price = roundPrice(solvePrice(c, c.platform), c.rounding);
  const e = economicsAt(price, c, c.platform);
  const rows = [
    ["IBI Flipkart/Shopsy Pricing Calculator", ""],
    ["Generated", new Date().toLocaleString("en-IN")],
    ["Platform", c.platform],
    ["", ""],
    ["Recommended retail price (incl GST)", price.toFixed(2)],
    ["Taxable value", e.taxable.toFixed(2)],
    ["GST collected", e.outputGST.toFixed(2)],
    ["Commission", e.commission.toFixed(2)],
    ["Fixed fee", e.fixed.toFixed(2)],
    ["eKart shipping", e.shipping.toFixed(2)],
    ["Collection fee", e.collection.toFixed(2)],
    ["GST on fees", e.feeGST.toFixed(2)],
    ["Net settlement", e.settlement.toFixed(2)],
    ["WSP", c.wsp.toFixed(2)],
    ["Packing", c.packing.toFixed(2)],
    ["Labour", c.labour.toFixed(2)],
    ["Return provision", e.returnProvision.toFixed(2)],
    ["Advertising", e.ads.toFixed(2)],
    ["Other", c.otherCost.toFixed(2)],
    ["Net profit per unit", e.profit.toFixed(2)],
    ["Net margin %", ((e.profit / e.taxable) * 100).toFixed(2)],
    ["Markup on cost %", ((e.profit / (c.wsp + c.packing + c.labour)) * 100).toFixed(2)],
  ];
  const csv = rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "IBI-pricing-" + c.platform + ".csv";
  a.click();
}
function copySummary() {
  const c = gatherCtx();
  const price = roundPrice(solvePrice(c, c.platform), c.rounding);
  const e = economicsAt(price, c, c.platform);
  const t = `IBI Pricing — ${c.platform.toUpperCase()}
Retail price (incl GST): ${inr2(price)}
Net settlement: ${inr2(e.settlement)}
Net profit/unit: ${inr2(e.profit)} (${pct((e.profit/e.taxable)*100)} margin)
Total fees: ${inr2(e.feesExGst + e.feeGST)} | Returns: ${inr2(e.returnProvision)}`;
  navigator.clipboard?.writeText(t).then(
    () => flash("Summary copied to clipboard ✓"),
    () => flash("Copy failed — select manually")
  );
}
function flash(msg) {
  const s = $("liveStatus");
  const old = s.textContent;
  s.textContent = msg;
  setTimeout(() => (s.textContent = old), 1800);
}

/* --------------------------- Utilities ------------------------------ */
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* ----------------------------- Init --------------------------------- */
function init() {
  buildCategoryOptions();
  activeTier = DEFAULT_TIER;
  buildFixedTable(BASE_FIXED);
  buildShipTable(DEFAULT_SHIP);
  setPlatform("flipkart");

  const restored = loadState();
  if (!restored) {
    // sensible first-run defaults already in HTML; set commission from category
    $("commission").value = CATEGORIES[0][1];
    $("category").value = "0";
  }
  // Seller tier: sync select with active tier and wire switching
  $("tier").value = activeTier;
  updateTierUI();
  $("tier").addEventListener("change", () => { loadTier($("tier").value); render(); });

  // Category -> commission
  $("category").addEventListener("change", () => {
    const i = +$("category").value;
    $("commission").value = CATEGORIES[i][1];
    render();
  });

  // Platform buttons
  document.querySelectorAll("#platformSeg button").forEach((b) =>
    b.addEventListener("click", () => { setPlatform(b.dataset.v); render(); })
  );

  // Packing helpers
  document.querySelectorAll(".pk").forEach((el) =>
    el.addEventListener("input", sumPacking)
  );
  sumPacking();
  $("applyPacking").addEventListener("click", () => {
    $("packing").value = sumPacking().toFixed(2);
    render();
  });

  // Volumetric helper
  ["dimL", "dimW", "dimH"].forEach((id) => $(id).addEventListener("input", calcVol));
  calcVol();
  $("applyVol").addEventListener("click", () => {
    const g = calcVol();
    $("weight").value = Math.max(g, num("weight", 0));
    render();
  });

  // Competitor add
  $("addComp").addEventListener("click", () => { addCompRow(); });

  // Reset fees
  $("resetFees").addEventListener("click", () => {
    buildFixedTable(BASE_FIXED);
    buildShipTable(DEFAULT_SHIP);
    $("bronzeAdd").value = 10; $("diamondSub").value = 15;
    $("shipBeyondLocal").value = 10; $("shipBeyondZonal").value = 12; $("shipBeyondNational").value = 15;
    $("revLocal").value = 65; $("revZonal").value = 85; $("revNational").value = 105; $("revPer500").value = 30;
    $("collPrepaid").value = 2; $("collCod").value = 2.5; $("feeGst").value = 18;
    bindDynamic();
    updateTierUI();
    render();
  });

  // Buttons
  $("btnPrint").addEventListener("click", () => window.print());
  $("btnCsv").addEventListener("click", exportCSV);
  $("btnCopy").addEventListener("click", copySummary);
  $("btnReset").addEventListener("click", () => {
    if (confirm("Reset all inputs to defaults? (Your saved calculations are kept.)")) {
      localStorage.removeItem(STORE_KEY);
      location.reload();
    }
  });

  initExtras();
  bindDynamic();
  render();
}

// (Re)bind change listeners to every input/select for live recompute.
function bindDynamic() {
  const recompute = debounce(render, 200);
  document.querySelectorAll("input,select").forEach((el) => {
    if (el.__bound) return;
    el.__bound = true;
    el.addEventListener("input", recompute);
    el.addEventListener("change", recompute);
  });
}

/* ====================================================================
   v3 EXTRAS — branding, live clock, theme toggle, saved memory, PWA
   ==================================================================== */
const APP_VERSION = "3.1";
const SAVED_KEY = "ibi_calc_saved_v1";
const THEME_KEY = "ibi_calc_theme";
const INSTALL_DISMISS_KEY = "ibi_calc_install_dismissed";
const INSTALL_REMIND_DAYS = 1; // re-show install banner far sooner than Chrome's 7 days
const SAVED_MAX = 24;
let deferredInstallPrompt = null;

function initExtras() {
  $("verChip").textContent = "v" + APP_VERSION;
  if ($("menuVer")) $("menuVer").textContent = "v" + APP_VERSION;
  $("verChip").addEventListener("click", () => openMenu(true));
  const pd = $("priceDate");
  if (pd && !pd.value) pd.value = todayISO();
  $("btnQuote").addEventListener("click", shareQuote);
  initClock();
  initTheme();
  initMenu();
  initSavedCalcs();
  initPWA();
}

/* ---- date & live clock ---- */
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDateTime(d) {
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const p = (n) => String(n).padStart(2, "0");
  // e.g. "28 May 2026, Thursday, 01:38:00 PM"
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}, ${p(h)}:${p(d.getMinutes())}:${p(d.getSeconds())} ${ampm}`;
}
function initClock() {
  const el = $("clock");
  const tick = () => { el.textContent = formatDateTime(new Date()); };
  tick();
  setInterval(tick, 1000);
}

/* ---- theme (dark / light toggle) ---- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const dark = theme === "dark";
  if ($("themeToggle")) $("themeToggle").checked = dark;
  if ($("themeToggleMenu")) $("themeToggleMenu").checked = dark;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}
function initTheme() {
  let theme;
  try { theme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (!theme) theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  applyTheme(theme);
  const handler = (e) => applyTheme(e.target.checked ? "dark" : "light");
  if ($("themeToggle")) $("themeToggle").addEventListener("change", handler);
  if ($("themeToggleMenu")) $("themeToggleMenu").addEventListener("change", handler);
}

/* ---- settings menu ---- */
function openMenu(open) {
  $("settingsMenu").hidden = !open;
  $("menuBtn").setAttribute("aria-expanded", String(!!open));
}
function initMenu() {
  $("menuBtn").addEventListener("click", (e) => { e.stopPropagation(); openMenu($("settingsMenu").hidden); });
  document.addEventListener("click", (e) => {
    const m = $("settingsMenu");
    if (!m.hidden && !m.contains(e.target) && e.target !== $("menuBtn")) openMenu(false);
  });
  $("menuClearMem").addEventListener("click", () => { clearAllSaved(); });
}

/* ---- saved calculations (local memory, up to 24) ---- */
function loadSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch (e) { return []; } }
function storeSaved(arr) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(arr)); } catch (e) {} }
function snapshotInputs() {
  const snap = {};
  document.querySelectorAll("#inputs input, #inputs select").forEach((el) => {
    if (!el.id) return;
    snap[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  snap.__platform = window.__platform;
  snap.__tier = activeTier;
  snap.__comps = getCompetitorPrices();
  return snap;
}
function saveCurrent(name) {
  const arr = loadSaved();
  if (arr.length >= SAVED_MAX) {
    alert(`Memory is full (${SAVED_MAX} items). Delete an item or use Clear all to free space.`);
    return;
  }
  const c = gatherCtx();
  const price = roundPrice(solvePrice(c, c.platform), c.rounding);
  const e = economicsAt(price, c, c.platform);
  const catName = CATEGORIES[+$("category").value] ? CATEGORIES[+$("category").value][0] : "Item";
  const auto = ($("productName") && $("productName").value.trim()) || catName;
  arr.unshift({
    id: "s" + new Date().getTime() + Math.floor(Math.random() * 1000),
    name: (name && name.trim()) || auto,
    ts: formatDateTime(new Date()),
    date: $("priceDate") ? $("priceDate").value : todayISO(),
    platform: c.platform,
    tier: (TIER_INFO[c.tier] || TIER_INFO.silver).label,
    price: price,
    profit: e.profit,
    snap: snapshotInputs(),
  });
  storeSaved(arr);
  renderSaved();
  flash("Saved to memory ✓");
}
function deleteSaved(id) { storeSaved(loadSaved().filter((x) => x.id !== id)); renderSaved(); }
function clearAllSaved() {
  if (!loadSaved().length) { flash("Memory already empty"); return; }
  if (confirm("Clear ALL saved calculations? This cannot be undone.")) { storeSaved([]); renderSaved(); flash("Memory cleared"); }
}
function loadSavedEntry(id) {
  const entry = loadSaved().find((x) => x.id === id);
  if (!entry) return;
  const snap = entry.snap || {};
  if (snap.__tier) { activeTier = snap.__tier; if ($("tier")) $("tier").value = snap.__tier; }
  Object.keys(snap).forEach((k) => {
    if (k.indexOf("__") === 0) return;
    const el = $(k);
    if (!el) return;
    if (el.type === "checkbox") el.checked = snap[k]; else el.value = snap[k];
  });
  if (snap.__platform) setPlatform(snap.__platform);
  $("compList").innerHTML = "";
  if (Array.isArray(snap.__comps)) snap.__comps.forEach((v) => addCompRow(v));
  updateTierUI();
  render();
  flash("Loaded: " + entry.name);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function renderSaved() {
  const arr = loadSaved();
  const cnt = arr.length;
  if ($("memCount")) $("memCount").textContent = `${cnt} / ${SAVED_MAX}`;
  if ($("menuMemCount")) $("menuMemCount").textContent = `${cnt} / ${SAVED_MAX} saved`;
  const list = $("savedList");
  if (!cnt) { list.innerHTML = `<div class="emptymsg">No saved calculations yet. Set up a product and tap <b>💾 Save to memory</b>.</div>`; return; }
  list.innerHTML = arr.map((e) =>
    `<div class="savedcard">
       <div class="sc-main">
         <div class="sc-name">${escapeHtml(e.name)}</div>
         <div class="sc-meta">${e.platform === "shopsy" ? "Shopsy" : "Flipkart"} · ${escapeHtml(e.tier)} · profit ${inr2(e.profit)} · ${escapeHtml(e.ts)}</div>
       </div>
       <div class="sc-price">${inr(e.price)}</div>
       <div class="sc-btns">
         <button class="iconmini load" title="Load this calculation" data-load="${e.id}">↺</button>
         <button class="iconmini del" title="Delete this entry" data-del="${e.id}">✕</button>
       </div>
     </div>`
  ).join("");
  list.querySelectorAll("[data-load]").forEach((b) => b.addEventListener("click", () => loadSavedEntry(b.dataset.load)));
  list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteSaved(b.dataset.del)));
}
function initSavedCalcs() {
  $("btnSave").addEventListener("click", () => saveCurrent($("saveName") ? $("saveName").value : ""));
  $("btnSaveNamed").addEventListener("click", () => { saveCurrent($("saveName").value); if ($("saveName")) $("saveName").value = ""; });
  $("btnClearAll").addEventListener("click", clearAllSaved);
  renderSaved();
}

/* ---- PWA: service worker + install flow ---- */
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; showInstallUI(); });
  window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; hideInstallUI(); flash("App installed ✓"); });

  $("installBtn").addEventListener("click", doInstall);
  $("menuInstall").addEventListener("click", () => { doInstall(); openMenu(false); });
  $("installBarYes").addEventListener("click", doInstall);
  $("installBarNo").addEventListener("click", () => {
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(new Date().getTime())); } catch (e) {}
    $("installBar").hidden = true;
  });

  if (standalone) { hideInstallUI(); return; }

  // iOS Safari lacks beforeinstallprompt — surface manual Add-to-Home-Screen
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (iOS) { $("installBtn").hidden = false; maybeShowBanner(true); }
}
function showInstallUI() {
  $("installBtn").hidden = false;
  if ($("menuInstallRow")) $("menuInstallRow").style.display = "";
  maybeShowBanner(false);
}
function hideInstallUI() {
  $("installBtn").hidden = true;
  $("installBar").hidden = true;
  if ($("menuInstallRow")) $("menuInstallRow").style.display = "none";
}
function maybeShowBanner(iOS) {
  let last = 0;
  try { last = parseInt(localStorage.getItem(INSTALL_DISMISS_KEY) || "0", 10); } catch (e) {}
  const days = (new Date().getTime() - last) / 86400000;
  if (last && days < INSTALL_REMIND_DAYS) return; // respect a recent "Later" (< 1 day)
  if (iOS) {
    $("installBar").querySelector(".ib-txt").innerHTML =
      "<b>Install IBI Calculator</b><small>In Safari: tap Share &#x2191; then “Add to Home Screen”.</small>";
    $("installBarYes").style.display = "none";
  }
  $("installBar").hidden = false;
}
async function doInstall() {
  if (!deferredInstallPrompt) {
    alert("To install this app:\n\n• Android / Chrome / Edge: open the browser ⋮ menu → “Install app” / “Add to Home screen”.\n• iPhone / iPad (Safari): tap Share → “Add to Home Screen”.\n\n(On desktop, look for the install ⊕ icon in the address bar.)");
    return;
  }
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch (e) {}
  deferredInstallPrompt = null;
  $("installBar").hidden = true;
}

/* ---- one-tap Share / Print Quote ---- */
function buildQuoteData() {
  const c = gatherCtx();
  const price = roundPrice(solvePrice(c, c.platform), c.rounding);
  const e = economicsAt(price, c, c.platform);
  const name = ($("productName") && $("productName").value.trim()) ||
    (CATEGORIES[+$("category").value] ? CATEGORIES[+$("category").value][0] : "Product");
  const date = ($("priceDate") && $("priceDate").value) ? $("priceDate").value : todayISO();
  return { c, price, e, name, date };
}
function formatQuoteDate(iso) {
  const p = String(iso).split("-");
  if (p.length !== 3) return String(iso);
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
}
function quoteText(q) {
  const plat = q.c.platform === "shopsy" ? "Shopsy" : "Flipkart";
  const tier = (TIER_INFO[q.c.tier] || TIER_INFO.silver).label;
  return `IBI Price Quote — ${q.name}\n` +
    `${formatQuoteDate(q.date)} · ${plat} (${tier} tier)\n` +
    `Recommended retail price (incl GST): ${inr2(q.price)}\n` +
    `Net settlement: ${inr2(q.e.settlement)} · Net profit: ${inr2(q.e.profit)} (${pct((q.e.profit / q.e.taxable) * 100)})\n` +
    `— India Business International · eCommerce for the World`;
}
function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawIBILogoCanvas(ctx, cx, topY, targetW) {
  const s = targetW / 545;
  ctx.save();
  ctx.translate(cx - targetW / 2, topY);
  ctx.scale(s, s);
  ctx.fillStyle = "#00c5ff";
  const cols = [24, 58, 92, 126, 160], rows = [24, 58, 92, 126, 160], radii = [4.5, 7.5, 10.5, 13.5, 16.5];
  rows.forEach((ry) => cols.forEach((cxx, i) => { ctx.beginPath(); ctx.arc(cxx, ry, radii[i], 0, Math.PI * 2); ctx.fill(); }));
  ctx.strokeStyle = "#00c5ff"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(198, 14); ctx.lineTo(198, 170); ctx.stroke();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#00c5ff";
  ctx.font = "800 40px Roboto, 'Segoe UI', sans-serif";
  ctx.fillText("INDIA", 220, 55);
  ctx.fillText("BUSINESS", 220, 101);
  ctx.fillText("INTERNATIONAL", 220, 147);
  ctx.fillStyle = "rgba(0,197,255,0.7)";
  ctx.font = "400 20px Roboto, 'Segoe UI', sans-serif";
  ctx.fillText("eCommerce for the World", 222, 178);
  ctx.restore();
}
function drawQuoteImage(q) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#06080c"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#00c5ff"; ctx.fillRect(0, 0, W, 8);
  drawIBILogoCanvas(ctx, W / 2, 80, 720);
  const plat = q.c.platform === "shopsy" ? "Shopsy" : "Flipkart";
  const tier = (TIER_INFO[q.c.tier] || TIER_INFO.silver).label;
  ctx.textAlign = "center";
  ctx.fillStyle = "#00c5ff"; ctx.font = "700 26px Roboto, sans-serif";
  ctx.fillText("P R I C E   Q U O T E", W / 2, 410);
  ctx.fillStyle = "#ffffff"; ctx.font = "800 46px Roboto, sans-serif";
  ctx.fillText(clip(q.name, 26), W / 2, 472);
  ctx.fillStyle = "#9aa6b4"; ctx.font = "400 24px Roboto, sans-serif";
  ctx.fillText(`${formatQuoteDate(q.date)}  ·  ${plat}  ·  ${tier} tier`, W / 2, 510);
  roundRectPath(ctx, 140, 548, W - 280, 150, 18);
  ctx.fillStyle = "#0c2230"; ctx.fill();
  ctx.strokeStyle = "rgba(0,197,255,.5)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#7fd6f2"; ctx.font = "700 20px Roboto, sans-serif";
  ctx.fillText("RECOMMENDED RETAIL PRICE (INCL. GST)", W / 2, 602);
  ctx.fillStyle = "#00c5ff"; ctx.font = "800 64px Roboto, sans-serif";
  ctx.fillText(inr(q.price), W / 2, 670);
  const stats = [
    ["Net settlement", inr(q.e.settlement)],
    ["Net profit/unit", inr2(q.e.profit)],
    ["Net margin", pct((q.e.profit / q.e.taxable) * 100)],
  ];
  const colW = (W - 200) / 3;
  stats.forEach((st, i) => {
    const x = 100 + colW * i + colW / 2;
    ctx.fillStyle = "#ffffff"; ctx.font = "800 30px Roboto, sans-serif"; ctx.fillText(st[1], x, 772);
    ctx.fillStyle = "#8fa0b3"; ctx.font = "400 18px Roboto, sans-serif"; ctx.fillText(st[0], x, 800);
  });
  const lines = [
    ["Wholesale price (WSP)", "− " + inr2(q.c.wsp)],
    ["Packing + labour", "− " + inr2(q.c.packing + q.c.labour)],
    [`${plat} fees + GST`, "− " + inr2(q.e.feesExGst + q.e.feeGST)],
    [`Return provision (${pct(q.c.returnRate * 100)})`, "− " + inr2(q.e.returnProvision)],
  ];
  let y = 872;
  ctx.font = "400 24px Roboto, sans-serif";
  lines.forEach((ln) => {
    ctx.textAlign = "left"; ctx.fillStyle = "#aeb9c6"; ctx.fillText(ln[0], 120, y);
    ctx.textAlign = "right"; ctx.fillStyle = "#e9eef5"; ctx.fillText(ln[1], W - 120, y);
    y += 42;
  });
  ctx.textAlign = "center"; ctx.fillStyle = "#5d6b7b"; ctx.font = "400 19px Roboto, sans-serif";
  ctx.fillText("Generated by IBI Flipkart & Shopsy Pricing Calculator · v" + APP_VERSION, W / 2, 1042);
  return canvas;
}
function printQuote(q) {
  const plat = q.c.platform === "shopsy" ? "Shopsy" : "Flipkart";
  const tier = (TIER_INFO[q.c.tier] || TIER_INFO.silver).label;
  $("quoteBody").innerHTML =
    `<div class="qs-product">${escapeHtml(q.name)}</div>` +
    `<div class="qs-meta">${formatQuoteDate(q.date)} · ${plat} · ${escapeHtml(tier)} tier</div>` +
    `<div class="qs-price"><span>Recommended Retail Price (incl. GST)</span><b>${inr(q.price)}</b></div>` +
    `<table>` +
      `<tr><td>Taxable sale value</td><td>${inr2(q.e.taxable)}</td></tr>` +
      `<tr><td>${plat} fees + 18% GST</td><td>− ${inr2(q.e.feesExGst + q.e.feeGST)}</td></tr>` +
      `<tr><td>Net settlement to bank</td><td>${inr2(q.e.settlement)}</td></tr>` +
      `<tr><td>Wholesale price (WSP)</td><td>− ${inr2(q.c.wsp)}</td></tr>` +
      `<tr><td>Packing + labour</td><td>− ${inr2(q.c.packing + q.c.labour)}</td></tr>` +
      `<tr><td>Return provision (${pct(q.c.returnRate * 100)})</td><td>− ${inr2(q.e.returnProvision)}</td></tr>` +
      `<tr><td><b>Net profit / unit</b></td><td><b>${inr2(q.e.profit)} (${pct((q.e.profit / q.e.taxable) * 100)})</b></td></tr>` +
    `</table>`;
  document.body.classList.add("quote-mode");
  const cleanup = () => { document.body.classList.remove("quote-mode"); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 2000);
}
async function shareQuote() {
  const q = buildQuoteData();
  if (q.e.profit < 0 && !confirm("This product is at a LOSS at the current price. Share the quote anyway?")) return;
  const text = quoteText(q);
  try {
    const canvas = drawQuoteImage(q);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (blob) {
      const file = new File([blob], "IBI-price-quote.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "IBI Price Quote", text, files: [file] });
        return;
      }
    }
  } catch (err) { if (err && err.name === "AbortError") return; }
  if (navigator.share) {
    try { await navigator.share({ title: "IBI Price Quote", text, url: location.href }); return; }
    catch (err) { if (err && err.name === "AbortError") return; }
  }
  printQuote(q); // desktop fallback → clean printable quote (Save as PDF)
}

document.addEventListener("DOMContentLoaded", init);
