const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/offers/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const oldModalCode = content.slice(content.indexOf('// ==================== OFFER MODAL COMPONENT ===================='));

const newModalCode = `// ==================== OFFER MODAL COMPONENT (MODERN & COMPACT) ====================
function OfferModal({ isOpen, offer, categories = [], menuItems = [], onClose, onSuccess }) {
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const [title, setTitle] = useState(offer?.title || '');
  const [description, setDescription] = useState(offer?.description || '');
  const [offerType, setOfferType] = useState(offer?.offer_type || 'ITEM');
  const [discountType, setDiscountType] = useState(offer?.discount_type || 'PERCENTAGE');
  const [discountValue, setDiscountValue] = useState(offer?.discount_value || '');
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(offer?.max_discount_amount || '');
  
  // Format start & end dates
  const defaultStart = offer?.start_date ? new Date(offer.start_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);
  const defaultEnd = offer?.end_date ? new Date(offer.end_date).toISOString().slice(0, 16) : new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 16);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [isActive, setIsActive] = useState(offer?.is_active ?? true);

  // Selections
  const initialSelectedItems = offer?.menu_offer_items?.map((oi) => oi.item_id) || offer?.itemIds || [];
  const [selectedItems, setSelectedItems] = useState(initialSelectedItems);

  const initialSelectedCats = offer?.menu_offer_categories?.map((oc) => oc.category_id) || offer?.categoryIds || [];
  const [selectedCategories, setSelectedCategories] = useState(initialSelectedCats);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Calculation Preview
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
  const sampleFinalPrice = Math.max(0, samplePrice - calculatedSavings);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Offer title is required');
      return;
    }
    if (!discountValue || Number(discountValue) <= 0) {
      toast.error('Valid discount value is required');
      return;
    }
    if (discountType === 'PERCENTAGE' && Number(discountValue) > 100) {
      toast.error('Percentage discount cannot exceed 100%');
      return;
    }
    if (offerType === 'ITEM' && selectedItems.length === 0) {
      toast.error('Please select at least one menu item');
      return;
    }
    if (offerType === 'CATEGORY' && selectedCategories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        offerType,
        discountType,
        discountValue: Number(discountValue),
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        isActive: Boolean(isActive),
        itemIds: offerType === 'ITEM' ? selectedItems : [],
        categoryIds: offerType === 'CATEGORY' ? selectedCategories : []
      };

      if (offer?.id) {
        await offerService.updateOffer(offer.id, payload);
        toast.success('Offer updated successfully');
      } else {
        await offerService.createOffer(payload);
        toast.success('Offer published successfully');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full border border-[#FEE2E2] shadow-2xl space-y-3.5 my-auto max-h-[92vh] flex flex-col">
        
        {/* Compact Header */}
        <div className="flex items-center justify-between border-b border-[#FEE2E2] pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-[#FFF5F5] text-[#E50914] border border-[#FEE2E2]">
              <BadgePercent className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#252525] leading-none">
                {offer?.id ? 'Edit Special Offer' : 'Create Special Offer'}
              </h3>
              <span className="text-[10px] text-[#757575] font-medium mt-0.5 block">Configure live discount rates & scope</span>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-[#757575] hover:text-[#252525] p-1 rounded-xl hover:bg-[#FFF5F5] transition-colors cursor-pointer"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Compact Form */}
        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto scrollbar-none pr-0.5 flex-1">
          
          {/* Row 1: Title & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Offer Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 20% OFF Biriyani Weekend"
                className="w-full px-3 py-2 bg-white border border-[#FEE2E2] rounded-xl text-xs font-bold text-[#252525] outline-none focus:border-[#E50914] transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Status
              </label>
              <ModernDropdown
                className="w-full"
                value={isActive ? 'true' : 'false'}
                onChange={(val) => setIsActive(val === 'true')}
                options={[
                  { value: 'true', label: 'Active', badge: <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> },
                  { value: 'false', label: 'Paused', badge: <span className="w-2 h-2 rounded-full bg-stone-300 inline-block" /> }
                ]}
              />
            </div>
          </div>

          {/* Row 2: Offer Scope & Discount Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Offer Scope *
              </label>
              <ModernDropdown
                className="w-full"
                value={offerType}
                onChange={setOfferType}
                options={[
                  { value: 'ITEM', label: 'Item-wise Discount' },
                  { value: 'CATEGORY', label: 'Category-wise' },
                  { value: 'RESTAURANT', label: 'Restaurant-wide (All)' }
                ]}
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Discount Type *
              </label>
              <ModernDropdown
                className="w-full"
                value={discountType}
                onChange={setDiscountType}
                options={[
                  { value: 'PERCENTAGE', label: 'Percentage (%) Off' },
                  { value: 'FIXED_AMOUNT', label: 'Fixed Amount (₹) Off' }
                ]}
              />
            </div>
          </div>

          {/* Row 3: Discount Value & Max Cap */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Discount {discountType === 'PERCENTAGE' ? '(%)' : '(₹)'} *
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENTAGE' ? '20' : '40'}
                className="w-full px-3 py-2 bg-white border border-[#FEE2E2] rounded-xl text-xs font-black text-[#252525] outline-none focus:border-[#E50914]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Max Cap (₹) {discountType === 'PERCENTAGE' ? '' : '(N/A)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={discountType === 'FIXED_AMOUNT'}
                value={maxDiscountAmount}
                onChange={(e) => setMaxDiscountAmount(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-3 py-2 bg-white border border-[#FEE2E2] rounded-xl text-xs font-bold text-[#252525] outline-none focus:border-[#E50914] disabled:bg-stone-50 disabled:text-stone-300"
              />
            </div>
          </div>

          {/* LIVE DISCOUNT PREVIEW BANNER (COMPACT PILL) */}
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
          </div>

          {/* Dynamic Selection: Items or Categories */}
          {offerType === 'ITEM' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider">
                  Select Applicable Items ({selectedItems.length}) *
                </label>
                {selectedItems.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => setSelectedItems([])}
                    className="text-[10px] font-bold text-[#E50914] hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto border border-[#FEE2E2] rounded-xl p-1.5 space-y-1 scrollbar-none bg-[#FFF5F5]/40">
                {safeMenuItems.length === 0 ? (
                  <p className="text-[11px] text-[#757575] p-2 text-center">No menu items created yet.</p>
                ) : (
                  safeMenuItems.map((item) => {
                    const isChecked = selectedItems.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={\`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-bold transition-all \${
                          isChecked ? 'bg-white shadow-2xs border border-[#FEE2E2]' : 'hover:bg-white/60'
                        }\`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedItems([...selectedItems, item.id]);
                              else setSelectedItems(selectedItems.filter((id) => id !== item.id));
                            }}
                            className="accent-[#E50914] w-3.5 h-3.5 rounded"
                          />
                          <span className="text-[#252525] truncate">{item.name}</span>
                        </div>
                        <span className="text-[#757575] shrink-0 font-mono text-[11px]">₹{Number(item.price).toFixed(2)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {offerType === 'CATEGORY' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider">
                  Select Applicable Categories ({selectedCategories.length}) *
                </label>
                {selectedCategories.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => setSelectedCategories([])}
                    className="text-[10px] font-bold text-[#E50914] hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="max-h-28 overflow-y-auto border border-[#FEE2E2] rounded-xl p-1.5 space-y-1 scrollbar-none bg-[#FFF5F5]/40">
                {safeCategories.length === 0 ? (
                  <p className="text-[11px] text-[#757575] p-2 text-center">No categories created yet.</p>
                ) : (
                  safeCategories.map((cat) => {
                    const isChecked = selectedCategories.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={\`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-bold transition-all \${
                          isChecked ? 'bg-white shadow-2xs border border-[#FEE2E2]' : 'hover:bg-white/60'
                        }\`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedCategories([...selectedCategories, cat.id]);
                              else setSelectedCategories(selectedCategories.filter((id) => id !== cat.id));
                            }}
                            className="accent-[#E50914] w-3.5 h-3.5 rounded"
                          />
                          <span className="text-[#252525] truncate">{cat.name}</span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Schedule Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#FEE2E2] rounded-xl text-xs font-bold text-[#252525] outline-none focus:border-[#E50914]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#FEE2E2] rounded-xl text-xs font-bold text-[#252525] outline-none focus:border-[#E50914]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-[#FEE2E2]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#FEE2E2] text-xs font-bold text-[#757575] hover:bg-[#FFF5F5] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#B71C1C] text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : offer?.id ? 'Update Offer' : 'Publish Offer'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
`;

const baseCode = content.slice(0, content.indexOf('// ==================== OFFER MODAL COMPONENT ===================='));
fs.writeFileSync(filePath, baseCode + newModalCode, 'utf8');
console.log('Offer modal upgraded to modern, compact, centered popup successfully!');

