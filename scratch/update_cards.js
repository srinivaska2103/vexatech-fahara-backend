const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/menu/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Target the food items rendering block to add interactive hover, zoom, badges and sleek card polish
const oldCardSearch = `            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const isVeg = item.food_type === 'VEG';
                const isNonVeg = item.food_type === 'NON_VEG';
                const isEgg = item.food_type === 'EGG';

                return (
                  <div
                    key={item.id}
                    className={\`bg-white border rounded-2xl overflow-hidden transition-all flex flex-col justify-between \${
                      item.is_available ? 'border-[#FEE2E2] shadow-xs' : 'border-stone-300 opacity-80 bg-stone-50'
                    }\`}
                  >
                    <div>
                      {/* Item Image & Badge Container */}
                      <div className="relative h-44 w-full bg-[#FFF5F5] overflow-hidden">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[#757575]/40">
                            <ImageIcon className="w-10 h-10 mb-1" />
                            <span className="text-[10px] font-bold">No Image Provided</span>
                          </div>
                        )}

                        {/* Food Type Indicator (FSSAI green/red/yellow square badge) */}
                        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-black/5 flex items-center gap-1.5">
                          <span className={\`w-3 h-3 border flex items-center justify-center rounded-xs \${
                            isVeg ? 'border-emerald-600' : isNonVeg ? 'border-red-600' : 'border-amber-600'
                          }\`}>
                            <span className={\`w-1.5 h-1.5 rounded-full \${
                              isVeg ? 'bg-emerald-600' : isNonVeg ? 'bg-red-600' : 'bg-amber-600'
                            }\`} />
                          </span>
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#252525]">
                            {isVeg ? 'Veg' : isNonVeg ? 'Non-Veg' : 'Egg'}
                          </span>
                        </div>

                        {/* Featured Pill */}
                        {item.is_featured && (
                          <div className="absolute top-3 right-3 bg-[#E50914] text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Featured
                          </div>
                        )}

                        {/* Availability Overlay if Sold Out */}
                        {!item.is_available && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center">
                            <span className="px-3 py-1 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg">
                              SOLD OUT
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#E50914] block">
                              {item.menu_categories?.name || 'Uncategorized'}
                            </span>
                            <h4 className="text-sm font-extrabold text-[#252525] leading-snug">{item.name}</h4>
                          </div>
                          <span className="text-base font-black text-[#252525] shrink-0">
                            ₹{Number(item.price).toFixed(2)}
                          </span>
                        </div>

                        <p className="text-xs text-[#757575] line-clamp-2 leading-relaxed">
                          {item.description || 'No description provided for this food item.'}
                        </p>

                        <div className="flex items-center gap-3 text-[11px] text-[#757575] pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#E50914]" />
                            {item.preparation_time || 15} mins prep
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-3 bg-[#FFF5F5]/60 border-t border-[#FEE2E2] flex items-center justify-between gap-2">
                      {/* Availability Toggle Button */}
                      <button
                        onClick={() => toggleItemAvailabilityMutation.mutate({ id: item.id, isAvailable: !item.is_available })}
                        className={\`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer \${
                          item.is_available
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        }\`}
                      >
                        {item.is_available ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Available</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Sold Out</span>
                          </>
                        )}
                      </button>

                      {/* Edit & Delete */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }}
                          className="p-1.5 text-[#757575] hover:text-[#E50914] hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="Edit Food Item"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmation({ type: 'item', id: item.id, name: item.name })}
                          className="p-1.5 text-[#757575] hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                          title="Delete Food Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}`;

const newCardCode = `            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {items.map((item) => {
                const isVeg = item.food_type === 'VEG';
                const isNonVeg = item.food_type === 'NON_VEG';
                const isEgg = item.food_type === 'EGG';

                return (
                  <div
                    key={item.id}
                    className={\`group relative bg-white border rounded-3xl overflow-hidden transition-all duration-300 flex flex-col justify-between hover:shadow-xl hover:shadow-[#E50914]/10 hover:-translate-y-1.5 \${
                      item.is_available
                        ? 'border-[#FEE2E2] hover:border-[#E50914]/50'
                        : 'border-stone-200 bg-stone-50/70 opacity-80'
                    }\`}
                  >
                    <div>
                      {/* Item Image with smooth Zoom & Badges */}
                      <div className="relative h-48 w-full bg-[#FFF5F5] overflow-hidden cursor-pointer" onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }}>
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-[#757575]/40 transition-colors group-hover:text-[#E50914]">
                            <ImageIcon className="w-10 h-10 mb-1" />
                            <span className="text-[10px] font-bold">No Image Provided</span>
                          </div>
                        )}

                        {/* Top Gradient Overlay on hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                        {/* Quick Edit Overlay Button appearing on hover */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                          <span className="px-3.5 py-1.5 rounded-full bg-white/95 text-[#252525] font-black text-xs shadow-lg backdrop-blur-xs flex items-center gap-1.5 scale-95 group-hover:scale-100 transition-transform">
                            <Edit3 className="w-3.5 h-3.5 text-[#E50914]" />
                            Quick Edit
                          </span>
                        </div>

                        {/* Food Type Indicator (FSSAI green/red/yellow badge) */}
                        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-2 py-1 rounded-xl shadow-md border border-black/5 flex items-center gap-1.5 z-10">
                          <span className={\`w-3.5 h-3.5 border-1.5 flex items-center justify-center rounded-xs \${
                            isVeg ? 'border-emerald-600' : isNonVeg ? 'border-red-600' : 'border-amber-600'
                          }\`}>
                            <span className={\`w-1.5 h-1.5 rounded-full \${
                              isVeg ? 'bg-emerald-600' : isNonVeg ? 'bg-red-600' : 'bg-amber-600'
                            }\`} />
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#252525]">
                            {isVeg ? 'Pure Veg' : isNonVeg ? 'Non-Veg' : 'Egg'}
                          </span>
                        </div>

                        {/* Featured Pill */}
                        {item.is_featured && (
                          <div className="absolute top-3 right-3 bg-gradient-to-r from-[#E50914] to-[#B71C1C] text-white px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 z-10 ring-2 ring-white/60">
                            <Sparkles className="w-2.5 h-2.5 fill-current" />
                            Featured
                          </div>
                        )}

                        {/* Availability Overlay if Sold Out */}
                        {!item.is_available && (
                          <div className="absolute inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center z-20">
                            <span className="px-4 py-1.5 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-xl border border-white/20">
                              SOLD OUT
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#E50914] bg-[#FFF5F5] px-2 py-0.5 rounded-md inline-block mb-1">
                              {item.menu_categories?.name || 'Category'}
                            </span>
                            <h4 className="text-sm font-black text-[#252525] truncate group-hover:text-[#E50914] transition-colors leading-snug">
                              {item.name}
                            </h4>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-base font-black text-[#252525] block group-hover:text-[#E50914] transition-colors">
                              ₹{Number(item.price).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-[#757575] line-clamp-2 leading-relaxed min-h-[32px]">
                          {item.description || 'Deliciously prepared with high-quality ingredients.'}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-[#757575] pt-1 border-t border-[#FEE2E2]/60">
                          <span className="flex items-center gap-1 font-bold">
                            <Clock className="w-3.5 h-3.5 text-[#E50914]" />
                            {item.preparation_time || 15} mins prep
                          </span>
                          <span className="text-[10px] font-bold text-stone-400">
                            Order #{item.display_order || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Card Action Bar */}
                    <div className="p-3 bg-[#FFF5F5]/70 border-t border-[#FEE2E2] flex items-center justify-between gap-2">
                      {/* Availability Toggle */}
                      <button
                        onClick={() => toggleItemAvailabilityMutation.mutate({ id: item.id, isAvailable: !item.is_available })}
                        className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 \${
                          item.is_available
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
                        }\`}
                      >
                        {item.is_available ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Available</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Mark Sold Out</span>
                          </>
                        )}
                      </button>

                      {/* Edit & Delete Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }}
                          className="p-2 text-[#757575] hover:text-white hover:bg-[#E50914] bg-white rounded-xl transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 border border-[#FEE2E2]"
                          title="Edit Food Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmation({ type: 'item', id: item.id, name: item.name })}
                          className="p-2 text-[#757575] hover:text-white hover:bg-rose-600 bg-white rounded-xl transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95 border border-[#FEE2E2]"
                          title="Delete Food Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}`;

// Normalize line endings to avoid CRLF mismatch
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedSearch = oldCardSearch.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedSearch)) {
  const updated = normalizedContent.replace(normalizedSearch, newCardCode);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log('Food cards updated to modern interactive UI successfully!');
} else {
  console.log('Search block did not match exactly, searching snippet...');
  const idx = normalizedContent.indexOf('{items.map((item) => {');
  console.log('Found map at index:', idx);
}

