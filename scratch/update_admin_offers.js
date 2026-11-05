const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-admin/src/app/admin/cafes/[id]/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add BadgePercent icon if needed
if (!content.includes('BadgePercent,')) {
  content = content.replace('ArrowLeft,', 'ArrowLeft, BadgePercent,');
}

// 2. Fetch Active Offers query for Admin oversight
const queryInsert = `  const { data: offersData, isLoading: isOffersLoading } = useQuery({
    queryKey: ['adminCafeOffers', id],
    queryFn: async () => {
      try {
        const response = await api.get(\`/public/cafes/\${id}/offers\`);
        return response.data.data;
      } catch (e) {
        return [];
      }
    }
  });
  const cafeOffers = offersData || [];`;

if (!content.includes('adminCafeOffers')) {
  content = content.replace('  const menuCategories = menuData?.categories || [];', `  const menuCategories = menuData?.categories || [];\n${queryInsert}`);
}

// 3. Add Discounts & Special Offers Card right below Menu Categories in Admin view
const targetInsert = `          {/* Menu Categories & Items Oversight (Phase 1) */}`;

const offersOversightCard = `          {/* Special Offers & Discounts Oversight (Phase 2) */}
          <div className="bg-fahara-surface border border-fahara-border rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-fahara-border/60 pb-3">
              <div className="flex items-center gap-2">
                <BadgePercent className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-fahara-text">Active Special Offers &amp; Discounts ({cafeOffers.length})</h3>
              </div>
              <span className="text-xs text-fahara-secondary">Live customer promotional pricing</span>
            </div>

            {isOffersLoading ? (
              <div className="p-8 text-center text-xs text-fahara-secondary">Loading discounts...</div>
            ) : cafeOffers.length === 0 ? (
              <p className="text-xs text-fahara-secondary py-3 text-center">No active promotional discounts created by this vendor.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cafeOffers.map((offer) => (
                  <div key={offer.id} className="p-3.5 rounded-xl bg-fahara-background border border-fahara-border space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-rose-600">
                        {offer.discount_type === 'PERCENTAGE' ? \`\${Number(offer.discount_value)}% OFF\` : \`₹\${Number(offer.discount_value)} OFF\`}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-fahara-secondary px-2 py-0.5 rounded-md bg-white border border-fahara-border">
                        {offer.offer_type}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-fahara-text">{offer.title}</h4>
                    <span className="text-[10px] text-fahara-secondary block">
                      Expires: {new Date(offer.end_date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Menu Categories & Items Oversight (Phase 1) */}`;

if (!content.includes('Special Offers & Discounts Oversight (Phase 2)')) {
  content = content.replace(targetInsert, offersOversightCard);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Admin Cafe Details updated with Phase 2 offers oversight!');
} else {
  console.log('Admin offers oversight already present');
}

