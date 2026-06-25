# IBI Flipkart &amp; Shopsy Pricing Calculator &nbsp;`v3.0`

A zero-dependency, **installable (PWA)** web app that **fixes the right retail price** for products sold on **Flipkart** and **Shopsy** — accounting for every platform fee, eKart shipping, returns, GST, seller tier and your target profit margin. Built for **India Business International (IBI)**.

> 🧮 It doesn't just add costs — it **solves** for the selling price at which, after *all* fees and costs, you still earn your target profit.

### What's new in v3.0
- 🎨 **Modern redesign** — Roboto typography, cyan-on-black (`#00c5ff`) headings, **dark / light theme switch**.
- 🏷️ **IBI + Flipkart logos** in the header, **live date-time** clock, and a **version badge** (top-left).
- 📲 **PWA**: install on phone/laptop, works **offline**; install button (top-right) + Settings menu entry + a banner that re-appears after 1 day (not 7).
- 💾 **Local memory** — save up to **24** calculations, reload or delete each, or clear all.
- 📱 **Edge-to-edge mobile** layout for maximum screen area.
- 🗓️ **Calendar date-picker** for the pricing date.

> **Versioning:** minor patches bump like `v3.1`; the next big feature release becomes `v4`.

---

## ✨ What it does

You enter:
1. **Wholesale Price (WSP)** of the product
2. **Packing charges** — carton box, cello tape, shipping-label paper, invoice-copy paper, filler (itemised or as a single figure)
3. **Labour charges**

…and it computes the **recommended retail price** (GST-inclusive) plus a full settlement breakdown.

It also factors in everything that quietly eats margin:

| Built-in | Detail |
|---|---|
| **Platform commission** | Category-wise %, with Flipkart's **0% commission under ₹1,000** rule and **Shopsy's 0% commission** |
| **Fixed / closing fee** | Price-slab based, **per seller tier** (Bronze / Silver / Gold / Diamond) and Self-ship (NFBF) vs Flipkart-fulfilled (FBF) |
| **eKart shipping** | **Local / Regional / National** zone rate card by weight slab, incl. free sub-500 g local/zonal |
| **Collection fee** | Blended Prepaid (2%) / COD (2.5%) by your COD share |
| **GST on fees** | 18%, with an **Input Tax Credit (ITC)** toggle for registered sellers |
| **Returns** | Provision for your return % (default 10%) — lost forward shipping + reverse shipping + damage write-off + re-pack |
| **GST on product** | 0 / 3 / 5 / 12 / 18 / 28% — shown GST-inclusive |
| **Target profit** | 25% default, editable — as *markup on cost* or *margin on price* |

### Extra value (things worth not leaving out)
- **Seller tier selector** — Bronze / Silver / Gold / Diamond. Models Flipkart's real tier mechanism: Silver & Gold pay the same **Base Rate Card**, **Bronze = Base + ₹10**/order, **Diamond = Base − ₹15** (up to ₹30); exact settlement days **15 / 10 / 3 / 2**. The ₹10 surcharge and ₹15 discount are editable.
- **Flipkart vs Shopsy** side-by-side for the same target profit
- **Market price** — estimated **min / max / average** band, or real figures from competitor prices you enter
- **Breakeven price**, net margin, markup and return-on-cost KPIs
- **Volumetric weight** helper (L×W×H ÷ 5000)
- **Advertising / PLA %** and other per-unit costs
- **TCS (1%) & TDS** shown as withheld-at-settlement (adjustable, not a true cost)
- **Monthly profit projection** from expected units/month
- **Print / Save-PDF, CSV export, copy summary**
- **Editable rate card** — overwrite any fee with the exact figure from your Seller Hub; everything is saved in your browser

---

## 🚀 Host it on GitHub Pages (free)

1. Create a new repository on GitHub, e.g. `ibi-flipkart-calculator`.
2. Upload these files (or push this folder — see below):
   - `index.html`, `app.js`, `README.md`, `LICENSE`, `.nojekyll`
3. On GitHub: **Settings → Pages → Build and deployment → Source: `Deploy from a branch`** → Branch **`main`** / folder **`/ (root)`** → **Save**.
4. Wait ~1 minute. Your calculator is live at:
   `https://<your-username>.github.io/ibi-flipkart-calculator/`

### Push from this folder
```bash
git init
git add .
git commit -m "IBI Flipkart & Shopsy pricing calculator"
git branch -M main
git remote add origin https://github.com/<your-username>/ibi-flipkart-calculator.git
git push -u origin main
```
> `.nojekyll` is included so GitHub Pages serves the files as-is.

### Run locally
Just **double-click `index.html`** — it works offline with no server or build step.
(Optional preview server, no Node/Python needed: `powershell -File serve.ps1 -Port 8123` then open `http://localhost:8123/`.)

---

## 🎨 Branding / replacing the logo

The header IBI logo is a crisp **SVG recreation** of the India Business International mark (cyan halftone grid + wordmark) at [`assets/ibi-logo.svg`](assets/ibi-logo.svg), in brand cyan `#00c5ff`. To use your exact artwork instead, either:
- replace `assets/ibi-logo.svg` with your own SVG, **or**
- drop a PNG at `assets/ibi-logo.png` and change the header `<img src="assets/ibi-logo.svg">` to `…ibi-logo.png` in `index.html`.

App/PWA icons live in [`icons/`](icons/) and the favicon is [`favicon.svg`](favicon.svg) (the "IBI" mark). Regenerate PNG icons any time with `generate-icons.ps1` if you change the brand.

## 📐 How the price is calculated

For a GST-inclusive selling price **SP**:

```
taxable        = SP / (1 + GST)
commission     = rate × SP            (0 on Shopsy / under ₹1,000)
fixed fee      = slab(SP)             (0 on Shopsy)
shipping       = eKart(zone, weight)
collection     = blendedRate × SP
fees           = commission + fixed + shipping + collection
settlement     = SP − fees − 18%·fees

returnProvision = return% × (forwardShip + reverseShip + damage%·WSP + repack)
profit          = taxable − fees − [GST-on-fees if no ITC]
                          − WSP − packing − labour − returnProvision − ads − other
```

The app **binary-searches SP** until `profit` equals your target (markup-on-cost or margin-on-price). Because commission, fixed fee and collection all depend on SP, this is the only correct way to fix the price — a plain mark-up under-prices once fees are applied.

GST treatment: the retail price is quoted **GST-inclusive**. For a registered seller claiming ITC, product GST is **pass-through** and the 18% GST on fees is reclaimed; turn ITC off for a more conservative (slightly higher) price.

---

## ⚠️ Disclaimer

Fee defaults reflect **Flipkart's November-2025 rate revision** as published in **mid-2026** and are **indicative**. The tier mechanism (Silver/Gold = Base Rate Card, Bronze = Base + ₹10, Diamond = Base − ₹15 up to ₹30, settlement 15/10/3/2 days) is taken from **Seller Hub → Tier Criteria & Benefits**; the Base Rate Card slab amounts themselves are the researched Nov-2025 figures and may differ for your category/sub-category. Always confirm in **Flipkart Seller Hub → Reports → My Commission Structure** and overwrite the editable rate card in the app.

Not affiliated with, endorsed by, or sponsored by Flipkart or Shopsy. All trademarks belong to their respective owners.

### Sources
- [Flipkart — Fees & Commission](https://seller.flipkart.com/fees-and-commission)
- [Shopsy — 0% Commission for Sellers](https://seller.flipkart.com/shopsy)
- [Flipkart November-2025 Fee Revision guide](https://rekonsile.com/flipkart-fee-revision-november-2025-complete-guide)

---

© India Business International. Released under the [MIT License](LICENSE).
