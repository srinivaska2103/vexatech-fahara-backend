const fs = require('fs');

const navPath = 'vexa-fahara-user/app/components/layout/CustomerNavbar.jsx';
let content = fs.readFileSync(navPath, 'utf8');

if (!content.includes('ShoppingBag')) {
  // Add ShoppingBag to lucide imports
  content = content.replace(
    '  Map, List, LayoutGrid, SlidersHorizontal, Bell, Heart, User,',
    '  Map, List, LayoutGrid, SlidersHorizontal, Bell, Heart, User, ShoppingBag,'
  );

  // Add cart store import
  content = content.replace(
    "import { useFavoritesStore } from '@/stores/favorites.store';",
    "import { useFavoritesStore } from '@/stores/favorites.store';\nimport { useCartStore } from '@/stores/cart.store';"
  );

  // Inside component, get itemCount and fetchCart
  const storeAnchor = '  const user = useAuthStore((state) => state.user);';
  const cartHook = `${storeAnchor}
  const { itemCount, fetchCart } = useCartStore();

  useEffect(() => {
    if (user) {
      fetchCart();
    }
  }, [user]);`;
  content = content.replace(storeAnchor, cartHook);

  // Add Cart button in navbar next to Bell
  const bellAnchor = '{/* Notifications Dropdown Container */}';
  const cartButton = `{/* Cart Button */}
            <Link 
              href="/customer/cart" 
              className="p-2 sm:p-2.5 bg-stone-50 border border-stone-200/80 rounded-xl text-stone-600 hover:bg-white hover:text-[#E50914] hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-300 relative cursor-pointer"
              title="Shopping Cart"
            >
              <ShoppingBag size={18} />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#E50914] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                  {itemCount}
                </span>
              )}
            </Link>

            ${bellAnchor}`;
  content = content.replace(bellAnchor, cartButton);

  // Add "My Food Orders" to profile menu
  const bookingsAnchor = `<Link \n                      href="/customer/bookings"`;
  const ordersLink = `<Link 
                      href="/customer/orders" 
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-[#FFF5F5] hover:text-[#E50914] transition-colors"
                    >
                      <ShoppingBag size={14} /> My Food Orders
                    </Link>

                    ${bookingsAnchor}`;
  content = content.replace(bookingsAnchor, ordersLink);

  fs.writeFileSync(navPath, content, 'utf8');
  console.log('CustomerNavbar successfully updated with Cart and My Food Orders links!');
} else {
  console.log('CustomerNavbar already includes ShoppingBag');
}

