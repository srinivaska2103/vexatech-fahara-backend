const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/offers/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace preview calculation to use selected item or first available menu item
const oldCalc = `  // Live Calculation Preview
  const samplePrice = 200;
  const numDiscount = Number(discountValue) || 0;
  let calculatedSavings = 0;
  if (discountType === 'PERCENTAGE') {
    calculatedSavings = (samplePrice * numDiscount) / 100;
    if (maxDiscountAmount && Number(maxDiscountAmount) > 0) {
      calculatedSavings = Math.min(calculatedSavings, Number(maxDiscountAmount));
    }
  } else {
    calculatedSavings = Math.min(numDiscount, samplePrice);
  }
  const sampleFinalPrice = Math.max(0, samplePrice - calculatedSavings);`;

const newCalc = `  // Live Calculation Preview dynamically based on actual selected item or first dish
  const firstSelectedItem = safeMenuItems.find((i) => selectedItems.includes(i.id)) || safeMenuItems[0];
  const targetItemName = firstSelectedItem?.name || 'Selected Dish';
  const originalPrice = firstSelectedItem ? Number(firstSelectedItem.price) : 200;
  
  const numDiscount = Number(discountValue) || 0;
  let calculatedSavings = 0;
  if (discountType === 'PERCENTAGE') {
    calculatedSavings = (originalPrice * numDiscount) / 100;
    if (maxDiscountAmount && Number(maxDiscountAmount) > 0) {
      calculatedSavings = Math.min(calculatedSavings, Number(maxDiscountAmount));
    }
  } else {
    calculatedSavings = Math.min(numDiscount, originalPrice);
  }
  const sampleFinalPrice = Math.max(0, originalPrice - calculatedSavings);`;

content = content.replace(oldCalc, newCalc);

// Replace preview display banner
const oldBanner = `          {/* LIVE DISCOUNT PREVIEW BANNER (COMPACT PILL) */}
          <div className="bg-[#FFF5F5] border border-[#FEE2E2] rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FF6B00] shrink-0" />
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#757575] block leading-none">
                  Live Preview on ₹{samplePrice} Item
                </span>
                <span className="text-[11px] text-[#252525] font-black mt-0.5 block">
                  Final Price: <span className="text-[#E50914]">₹{sampleFinalPrice.toFixed(2)}</span>
                </span>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black shrink-0">
              Saves ₹{calculatedSavings.toFixed(2)}
            </div>
          </div>`;

const newBanner = `          {/* LIVE DISCOUNT PREVIEW BANNER DYNAMIC */}
          <div className="bg-[#FFF5F5] border border-[#FEE2E2] rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-[#FF6B00] shrink-0" />
              <div className="min-w-0">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#757575] block truncate leading-none">
                  Live Preview • {targetItemName} (Original: ₹{originalPrice.toFixed(2)})
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs line-through text-stone-400 font-bold">
                    ₹{originalPrice.toFixed(2)}
                  </span>
                  <span className="text-sm font-black text-[#E50914]">
                    ₹{sampleFinalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black shrink-0 text-right">
              Saves ₹{calculatedSavings.toFixed(2)}
            </div>
          </div>`;

content = content.replace(oldBanner, newBanner);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed live preview calculation in offers/page.jsx successfully!');

