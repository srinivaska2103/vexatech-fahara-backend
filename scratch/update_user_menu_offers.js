const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexa-fahara-user/app/components/cafe-details/RestaurantMenuSection.jsx');
let code = fs.readFileSync(filePath, 'utf8');

// Require BadgePercent and Tag icon
code = code.replace(
  "  ChevronRight,\n  Info",
  "  ChevronRight,\n  Info,\n  BadgePercent,\n  Tag"
);

// 1. Add Promotional Offers Banner Carousel right below the Search bar in RestaurantMenuSection
const searchBarEnd = `        </div>
      </div>

      {/* ── 2. CATEGORY HORIZONTAL CAROUSEL / NAVIGATION ── */}`;

const offersBannerSnippet = `        </div>
      </div>

      {/* ── 1.5 ACTIVE RESTAURANT SPECIAL OFFERS & PROMOTIONS ── */}
      {menuData?.activeOffers && menuData.activeOffers.length > 0 && (
        <div className="bg-gradient-to-r from-[#FFF5F5] via-[#FFF9F2] to-[#FFF5F5] border border-[#FEE2E2] rounded-3xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 bg-[#FF6B00] text-white rounded-xl shadow-xs">
              <BadgePercent className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-[#252525]">Special Offers & Deals Today</h3>
              <p className="text-[11px] text-[#757575]">Instant discounts applied automatically at billing.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
            {menuData.activeOffers.map((offer) => (
              <div
                key={offer.id}
                className="bg-white border border-[#FEE2E2] rounded-2xl p-3.5 shrink-0 min-w-[240px] max-w-[280px] shadow-2xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-md bg-[#FF6B00]/10 text-[#FF6B00] text-[10px] font-black uppercase tracking-wider">
                    {offer.discountType === 'PERCENTAGE' ? \`\${offer.discountValue}% OFF\` : \`₹\${offer.discountValue} OFF\`}
                  </span>
                  <span className="text-[9px] font-bold text-[#757575] uppercase">
                    {offer.offerType === 'ITEM' ? 'Selected Dishes' : offer.offerType === 'CATEGORY' ? 'Selected Category' : 'Whole Menu'}
                  </span>
                </div>
                <h4 className="text-xs font-black text-[#252525] truncate">{offer.title}</h4>
                {offer.description && (
                  <p className="text-[11px] text-[#757575] line-clamp-1">{offer.description}</p>
                )}
                <div className="text-[10px] font-bold text-[#E50914] pt-1 border-t border-[#FEE2E2]/60">
                  Valid until {new Date(offer.endDate).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2. CATEGORY HORIZONTAL CAROUSEL / NAVIGATION ── */}`;

code = code.replace(searchBarEnd, offersBannerSnippet);

// 2. Enhance Food Item Cards to display Original Strikethrough, Discounted price, Orange Savings badge and savings info
const oldPriceDisplay = `                        {/* Price */}
                        <div className="text-sm font-black text-[#252525]">
                          ₹{Number(item.price).toFixed(2)}
                        </div>`;

const newPriceDisplay = `                        {/* Price & Discount Offer Info */}
                        <div className="space-y-0.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-black text-[#252525]">
                              ₹{Number(item.discountedPrice !== undefined ? item.discountedPrice : item.price).toFixed(2)}
                            </span>
                            {item.hasDiscount && item.originalPrice > item.discountedPrice && (
                              <span className="text-xs line-through text-stone-400 font-bold">
                                ₹{Number(item.originalPrice).toFixed(2)}
                              </span>
                            )}
                          </div>
                          {item.hasDiscount && (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <span className="px-1.5 py-0.5 rounded-md bg-[#FF6B00] text-white text-[9px] font-black tracking-wider uppercase">
                                {item.appliedOffer?.discountType === 'PERCENTAGE' 
                                  ? \`\${item.appliedOffer.discountValue}% OFF\` 
                                  : \`₹\${item.appliedOffer?.discountValue} OFF\`}
                              </span>
                              <span className="text-[10px] font-extrabold text-emerald-600">
                                You save ₹{Number(item.discountAmount).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>`;

code = code.replace(oldPriceDisplay, newPriceDisplay);

// 3. Update Detail Modal Price display
const oldModalPrice = `                <span className="text-lg font-black text-[#252525]">
                  ₹{Number(selectedItemDetail.price).toFixed(2)}
                </span>`;

const newModalPrice = `                <div className="text-right">
                  <div className="flex items-baseline gap-2 justify-end">
                    <span className="text-xl font-black text-[#252525]">
                      ₹{Number(selectedItemDetail.discountedPrice !== undefined ? selectedItemDetail.discountedPrice : selectedItemDetail.price).toFixed(2)}
                    </span>
                    {selectedItemDetail.hasDiscount && (
                      <span className="text-xs line-through text-stone-400 font-bold">
                        ₹{Number(selectedItemDetail.originalPrice).toFixed(2)}
                      </span>
                    )}
                  </div>
                  {selectedItemDetail.hasDiscount && (
                    <span className="text-[11px] font-black text-emerald-600 block">
                      You save ₹{Number(selectedItemDetail.discountAmount).toFixed(2)}
                    </span>
                  )}
                </div>`;

code = code.replace(oldModalPrice, newModalPrice);

fs.writeFileSync(filePath, code, 'utf8');
console.log('RestaurantMenuSection.jsx updated with Phase 2 discounts & offer cards successfully!');

