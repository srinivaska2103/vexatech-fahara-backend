const offerRepository = require('../repositories/offerRepository');
const cafeRepository = require('../repositories/cafeRepository');
const prisma = require('../config/prisma');

/**
 * Resolve and authorize cafe for current vendor session
 */
const resolveAuthorizedCafe = async (userId, userRole, requestedCafeId = null) => {
  if (userRole === 'ADMIN' && requestedCafeId) {
    const cafe = await cafeRepository.findCafeById(requestedCafeId);
    if (!cafe) {
      const error = new Error('Cafe not found');
      error.statusCode = 404;
      throw error;
    }
    return cafe;
  }

  let cafe = null;
  if (requestedCafeId) {
    cafe = await cafeRepository.findCafeById(requestedCafeId);
    if (cafe && cafe.owner_id !== userId && userRole !== 'ADMIN') {
      const error = new Error('Unauthorized to access this cafe offers');
      error.statusCode = 403;
      throw error;
    }
  }

  if (!cafe) {
    // If owner has multiple cafes or requestedCafeId was not supplied,
    // find all cafes owned by userId and prefer one that has menu items or active bookings
    const userCafes = await prisma.cafes.findMany({
      where: { owner_id: userId },
      include: { _count: { select: { menu_items: true } } },
      orderBy: { created_at: 'desc' }
    });

    if (userCafes && userCafes.length > 0) {
      // Pick cafe with existing menu items if any, otherwise first
      cafe = userCafes.find((c) => c._count?.menu_items > 0) || userCafes[0];
    }
  }

  if (!cafe) {
    const error = new Error('No registered restaurant profile found for this partner account');
    error.statusCode = 404;
    throw error;
  }

  return cafe;
};

/**
 * Comprehensive Cart & Multi-Item Offer Evaluation Engine
 * Handles:
 * 1. BUY_X_GET_Y (BOGO):
 *    - Same item (Buy 1 Biryani Get 1 Biryani Free) -> 2 Biryanis in cart = 1 free (100% off 1 unit)
 *    - Cross item (Buy 1 Burger Get 1 Fries Free) -> 1 Burger + 1 Fries = Fries is free
 *    - Configurable reward discounts (FREE, PERCENTAGE, FIXED)
 *    - Cap via max_reward_quantity
 * 2. PERCENTAGE discounts (% OFF with optional max cap)
 * 3. FLAT discounts (₹ OFF)
 * 4. COMBO deals (Bundle items for combo price)
 * 5. FREE_ITEM on orders meeting minimum threshold (min_order_value)
 * 6. CATEGORY discounts
 */
const evaluateCartOffers = (cartItems = [], activeOffers = []) => {
  if (!cartItems || cartItems.length === 0) {
    return {
      items: [],
      appliedOffers: [],
      subtotal: 0,
      totalSavings: 0,
      finalPayableAmount: 0
    };
  }

  // 1. Initial items mapped with basic properties
  let evaluatedItems = cartItems.map((cartItem) => {
    const item = cartItem.menu_item || cartItem.menu_items || cartItem;
    const originalPrice = Number(item.price || cartItem.price || 0);
    const quantity = Number(cartItem.quantity || 1);
    const lineOriginal = Math.round(originalPrice * quantity * 100) / 100;
    const menuItemId = cartItem.menuItemId || cartItem.menu_item_id || item.id;

    return {
      id: cartItem.id || menuItemId,
      menuItemId: menuItemId,
      name: item.name || cartItem.name,
      imageUrl: item.image_url || cartItem.imageUrl,
      foodType: item.food_type || cartItem.foodType,
      isAvailable: item.is_available !== false,
      preparationTime: item.preparation_time || cartItem.preparationTime || 15,
      categoryName: item.menu_categories?.name || cartItem.categoryName || null,
      categoryId: item.category_id || cartItem.categoryId || null,
      quantity,
      originalUnitPrice: originalPrice,
      unitPrice: originalPrice,
      discountAmount: 0,
      hasDiscount: false,
      appliedOffer: null,
      lineOriginalTotal: lineOriginal,
      lineTotal: lineOriginal,
      lineSavings: 0,
      isFreeReward: false,
      rewardQuantity: 0,
      comboGroupId: null,
      comboName: null
    };
  });

  const appliedOffers = [];
  let totalSavings = 0;
  const initialSubtotal = evaluatedItems.reduce((acc, it) => acc + it.lineOriginalTotal, 0);

  // Filter valid active offers that have not reached max redemptions
  const validOffers = (activeOffers || []).filter((o) => {
    if (o.is_active === false) return false;
    if (o.max_redemptions && (o.redemption_count || 0) >= o.max_redemptions) return false;
    return true;
  });

  // Separate offers by mechanic/category
  const comboOffers = validOffers.filter((o) => o.offer_category === 'COMBO');
  const bogoOffers = validOffers.filter((o) => o.offer_category === 'BUY_X_GET_Y' || o.offer_type === 'BUY_X_GET_Y');
  const freeItemOffers = validOffers.filter((o) => o.offer_category === 'FREE_ITEM');
  const otherOffers = validOffers.filter((o) => 
    o.offer_category !== 'BUY_X_GET_Y' && 
    o.offer_type !== 'BUY_X_GET_Y' &&
    o.offer_category !== 'COMBO' &&
    o.offer_category !== 'FREE_ITEM'
  );

  // --- STEP 1: PROCESS COMBO DEALS ---
  for (const combo of comboOffers) {
    let comboComponents = [];
    if (combo.terms_and_conditions && typeof combo.terms_and_conditions === 'string' && combo.terms_and_conditions.startsWith('{')) {
      try {
        const parsed = JSON.parse(combo.terms_and_conditions);
        if (Array.isArray(parsed.components) && parsed.components.length > 0) {
          comboComponents = parsed.components;
        }
      } catch (e) {}
    }

    if (comboComponents.length === 0 && Array.isArray(combo.menu_offer_items) && combo.menu_offer_items.length > 0) {
      comboComponents = combo.menu_offer_items.map((oi) => ({
        itemId: oi.item_id,
        quantity: 1
      }));
    }

    if (comboComponents.length === 0) continue;

    const sellingPrice = Number(combo.combo_price || combo.discount_value || 0);
    const maxCombos = combo.max_reward_quantity ? Number(combo.max_reward_quantity) : Infinity;

    // Check how many complete combo sets can be formed from available items in cart
    let setsPossible = Infinity;
    for (const comp of comboComponents) {
      const neededPerSet = Math.max(1, Number(comp.quantity || 1));
      const availItem = evaluatedItems.find((it) => it.menuItemId === comp.itemId && !it.appliedOffer);
      if (!availItem) {
        setsPossible = 0;
        break;
      }
      const possibleWithThis = Math.floor(availItem.quantity / neededPerSet);
      if (possibleWithThis < setsPossible) {
        setsPossible = possibleWithThis;
      }
    }

    if (setsPossible === Infinity) setsPossible = 0;
    const setsFormed = Math.min(setsPossible, maxCombos);

    if (setsFormed > 0) {
      // Calculate original combined price for one set
      let originalComboSetPrice = 0;
      const componentItemsDetails = [];

      for (const comp of comboComponents) {
        const it = evaluatedItems.find((i) => i.menuItemId === comp.itemId);
        const qtyNeeded = Math.max(1, Number(comp.quantity || 1));
        const linePrice = (it ? it.originalUnitPrice : 0) * qtyNeeded;
        originalComboSetPrice += linePrice;
        componentItemsDetails.push({
          name: it?.name || 'Item',
          quantity: qtyNeeded * setsFormed,
          singleSetQty: qtyNeeded
        });
      }

      const originalTotalForSets = originalComboSetPrice * setsFormed;
      const promoTotalForSets = sellingPrice * setsFormed;
      const comboSavings = Math.max(0, Math.round((originalTotalForSets - promoTotalForSets) * 100) / 100);

      // Proportionately distribute discounted price across component items
      totalSavings += comboSavings;

      for (const comp of comboComponents) {
        const qtyNeededTotal = Math.max(1, Number(comp.quantity || 1)) * setsFormed;
        evaluatedItems = evaluatedItems.map((it) => {
          if (it.menuItemId === comp.itemId && !it.appliedOffer) {
            const compRatio = originalComboSetPrice > 0 ? ((it.originalUnitPrice * Math.max(1, Number(comp.quantity || 1))) / originalComboSetPrice) : (1 / comboComponents.length);
            const lineProportionalSavings = Math.round(comboSavings * compRatio * 100) / 100;
            const newLineTotal = Math.max(0, it.lineOriginalTotal - lineProportionalSavings);

            return {
              ...it,
              hasDiscount: true,
              lineSavings: it.lineSavings + lineProportionalSavings,
              lineTotal: newLineTotal,
              unitPrice: Math.round((newLineTotal / it.quantity) * 100) / 100,
              discountAmount: Math.round(((it.lineSavings + lineProportionalSavings) / it.quantity) * 100) / 100,
              comboGroupId: combo.id,
              comboName: combo.title,
              appliedOffer: {
                id: combo.id,
                title: combo.title,
                offerCategory: 'COMBO',
                comboPrice: sellingPrice,
                sets: setsFormed
              }
            };
          }
          return it;
        });
      }

      appliedOffers.push({
        id: combo.id,
        title: combo.title,
        offerType: 'COMBO',
        offerCategory: 'COMBO',
        comboName: combo.title,
        sets: setsFormed,
        originalPrice: originalTotalForSets,
        comboPrice: promoTotalForSets,
        savings: comboSavings,
        components: componentItemsDetails,
        description: combo.description || `Special Combo at ₹${sellingPrice}`
      });
    }
  }

  // --- STEP 2: PROCESS BUY X GET Y (BOGO) OFFERS ---
  for (const bogo of bogoOffers) {
    const buyItemId = bogo.buy_item_id || bogo.menu_offer_items?.[0]?.item_id;
    const buyCatId = bogo.buy_category_id || bogo.menu_offer_categories?.[0]?.category_id;
    const buyQtyNeeded = Math.max(1, Number(bogo.buy_quantity || 1));

    const rewardItemId = bogo.reward_item_id || buyItemId;
    const rewardQtyPerSet = Math.max(1, Number(bogo.reward_quantity || 1));
    const maxRewardCap = bogo.max_reward_quantity ? Number(bogo.max_reward_quantity) : Infinity;

    // Check minimum order value if set
    if (bogo.min_order_value && initialSubtotal < Number(bogo.min_order_value)) {
      continue;
    }

    // Determine qualifying buy quantity in cart
    let qualifyingCount = 0;
    evaluatedItems.forEach((it) => {
      if (it.appliedOffer) return; // skip already discounted by combo
      if (buyItemId && it.menuItemId === buyItemId) {
        qualifyingCount += it.quantity;
      } else if (!buyItemId && buyCatId && it.categoryId === buyCatId) {
        qualifyingCount += it.quantity;
      }
    });

    if (qualifyingCount <= 0) continue;

    const isSameItemBogo = buyItemId === rewardItemId || (!buyItemId && !bogo.reward_item_id);

    if (isSameItemBogo) {
      let setsEarned = 0;
      let eligibleFreeQty = 0;
      let totalKitchenUnits = qualifyingCount;
      let qualifyingPaidCount = qualifyingCount;

      const totalUnitsInSet = buyQtyNeeded + rewardQtyPerSet;
      if (qualifyingCount >= totalUnitsInSet) {
        setsEarned = Math.floor(qualifyingCount / totalUnitsInSet);
        eligibleFreeQty = Math.min(setsEarned * rewardQtyPerSet, maxRewardCap);
        qualifyingPaidCount = qualifyingCount - eligibleFreeQty;
        totalKitchenUnits = qualifyingCount;
      } else if (qualifyingCount >= buyQtyNeeded) {
        setsEarned = Math.floor(qualifyingCount / buyQtyNeeded);
        eligibleFreeQty = Math.min(setsEarned * rewardQtyPerSet, maxRewardCap);
        qualifyingPaidCount = qualifyingCount;
        totalKitchenUnits = qualifyingCount + eligibleFreeQty;
      }

      if (eligibleFreeQty > 0) {
        const targetItem = evaluatedItems.find((it) => (buyItemId && it.menuItemId === buyItemId) || (!buyItemId && buyCatId && it.categoryId === buyCatId));
        const rewardType = bogo.reward_discount_type || 'FREE';
        const rewardVal = Number(bogo.reward_discount_value || 100);

        let discountPerRewardUnit = targetItem?.originalUnitPrice || 0;
        if (rewardType === 'PERCENTAGE') {
          discountPerRewardUnit = (discountPerRewardUnit * Math.min(100, rewardVal)) / 100;
        } else if (rewardType === 'FIXED_AMOUNT') {
          discountPerRewardUnit = Math.min(discountPerRewardUnit, rewardVal);
        }

        const totalItemSavings = Math.round(discountPerRewardUnit * eligibleFreeQty * 100) / 100;

        if (qualifyingCount >= totalUnitsInSet) {
          let remainingRewardToDeduct = eligibleFreeQty;
          evaluatedItems = evaluatedItems.map((it) => {
            if (remainingRewardToDeduct > 0 && ((buyItemId && it.menuItemId === buyItemId) || (!buyItemId && buyCatId && it.categoryId === buyCatId))) {
              const deductHere = Math.min(it.quantity, remainingRewardToDeduct);
              remainingRewardToDeduct -= deductHere;
              const newLineTotal = Math.max(0, it.lineOriginalTotal - totalItemSavings);
              totalSavings += totalItemSavings;

              return {
                ...it,
                hasDiscount: true,
                lineSavings: it.lineSavings + totalItemSavings,
                lineTotal: newLineTotal,
                unitPrice: Math.round((newLineTotal / it.quantity) * 100) / 100,
                discountAmount: Math.round(((it.lineSavings + totalItemSavings) / it.quantity) * 100) / 100,
                isFreeReward: rewardType === 'FREE',
                rewardQuantity: it.rewardQuantity + deductHere,
                appliedOffer: {
                  id: bogo.id,
                  title: bogo.title,
                  offerCategory: 'BUY_X_GET_Y',
                  discountType: rewardType,
                  discountValue: rewardVal,
                  rewardQuantity: deductHere
                }
              };
            }
            return it;
          });
        } else {
          evaluatedItems = evaluatedItems.map((it) => {
            if ((buyItemId && it.menuItemId === buyItemId) || (!buyItemId && buyCatId && it.categoryId === buyCatId)) {
              return {
                ...it,
                hasDiscount: true,
                isFreeReward: rewardType === 'FREE',
                rewardQuantity: eligibleFreeQty,
                appliedOffer: {
                  id: bogo.id,
                  title: bogo.title,
                  offerCategory: 'BUY_X_GET_Y',
                  discountType: rewardType,
                  discountValue: rewardVal,
                  rewardQuantity: eligibleFreeQty,
                  rewardSavings: totalItemSavings
                }
              };
            }
            return it;
          });
        }

        appliedOffers.push({
          id: bogo.id,
          title: bogo.title,
          offerType: bogo.offer_type || 'ITEM',
          offerCategory: 'BUY_X_GET_Y',
          qualifyingItem: {
            name: (bogo.buy_item?.name || targetItem?.name) || 'Qualifying Dish',
            quantity: qualifyingPaidCount,
            type: 'PAID'
          },
          rewardItem: {
            name: (bogo.reward_item?.name || bogo.buy_item?.name || targetItem?.name) || 'Reward Dish',
            quantity: eligibleFreeQty,
            type: bogo.reward_discount_type || 'FREE'
          },
          totalKitchenQuantity: totalKitchenUnits,
          savings: totalItemSavings,
          description: bogo.description || `Buy ${buyQtyNeeded} Get ${rewardQtyPerSet} Free`
        });
      }
    } else {
      // Cross-item BOGO
      const rewardItemInCart = evaluatedItems.find((it) => it.menuItemId === rewardItemId && !it.appliedOffer);
      if (rewardItemInCart) {
        const setsEarned = Math.floor(qualifyingCount / buyQtyNeeded);
        let eligibleRewardQty = Math.min(rewardItemInCart.quantity, setsEarned * rewardQtyPerSet);
        eligibleRewardQty = Math.min(eligibleRewardQty, maxRewardCap);

        if (eligibleRewardQty > 0) {
          evaluatedItems = evaluatedItems.map((it) => {
            if (it.menuItemId === rewardItemId && !it.appliedOffer) {
              let discountPerRewardUnit = it.originalUnitPrice;
              const rewardType = bogo.reward_discount_type || 'FREE';
              const rewardVal = Number(bogo.reward_discount_value || 100);

              if (rewardType === 'PERCENTAGE') {
                discountPerRewardUnit = (it.originalUnitPrice * Math.min(100, rewardVal)) / 100;
              } else if (rewardType === 'FIXED_AMOUNT') {
                discountPerRewardUnit = Math.min(it.originalUnitPrice, rewardVal);
              }

              const totalItemSavings = Math.round(discountPerRewardUnit * eligibleRewardQty * 100) / 100;
              const newLineTotal = Math.max(0, it.lineOriginalTotal - totalItemSavings);
              totalSavings += totalItemSavings;

              return {
                ...it,
                hasDiscount: true,
                lineSavings: totalItemSavings,
                lineTotal: newLineTotal,
                unitPrice: Math.round((newLineTotal / it.quantity) * 100) / 100,
                discountAmount: Math.round((totalItemSavings / it.quantity) * 100) / 100,
                isFreeReward: rewardType === 'FREE',
                rewardQuantity: eligibleRewardQty,
                appliedOffer: {
                  id: bogo.id,
                  title: bogo.title,
                  offerCategory: 'BUY_X_GET_Y',
                  discountType: rewardType,
                  discountValue: rewardVal,
                  rewardQuantity: eligibleRewardQty
                }
              };
            }
            return it;
          });

          const buyItemObj = bogo.buy_item || evaluatedItems.find(i => i.menuItemId === buyItemId);
          const rewardItemObj = bogo.reward_item || evaluatedItems.find(i => i.menuItemId === rewardItemId);

          appliedOffers.push({
            id: bogo.id,
            title: bogo.title,
            offerType: bogo.offer_type || 'ITEM',
            offerCategory: 'BUY_X_GET_Y',
            qualifyingItem: {
              name: buyItemObj?.name || 'Qualifying Dish',
              quantity: buyQtyNeeded * setsEarned,
              type: 'PAID'
            },
            rewardItem: {
              name: rewardItemObj?.name || 'Reward Dish',
              quantity: eligibleRewardQty,
              type: bogo.reward_discount_type || 'FREE'
            },
            totalKitchenQuantity: (buyQtyNeeded * setsEarned) + eligibleRewardQty,
            savings: Math.round(eligibleRewardQty * rewardItemInCart.originalUnitPrice * 100) / 100,
            description: bogo.description || `Buy ${buyQtyNeeded} Get ${rewardQtyPerSet} Free`
          });
        }
      }
    }
  }

  // --- STEP 3: PROCESS FREE ITEM ON MINIMUM ORDER OFFERS ---
  for (const freeOff of freeItemOffers) {
    const minOrder = Number(freeOff.min_order_value || 0);
    const rewardItemId = freeOff.reward_item_id || freeOff.menu_offer_items?.[0]?.item_id;
    const rewardQty = Math.max(1, Number(freeOff.reward_quantity || 1));

    if (!rewardItemId) continue;

    // Evaluate eligible subtotal from items in cart
    const currentEligibleSubtotal = evaluatedItems.reduce((acc, it) => acc + it.lineOriginalTotal, 0);

    if (currentEligibleSubtotal >= minOrder) {
      // Check if reward item is already present in cart
      const existingInCart = evaluatedItems.find((it) => it.menuItemId === rewardItemId);

      if (existingInCart) {
        // Mark reward units as free (100% discount on rewardQty)
        const unitsToFree = Math.min(existingInCart.quantity, rewardQty);
        const freeSavings = Math.round(existingInCart.originalUnitPrice * unitsToFree * 100) / 100;

        if (!existingInCart.appliedOffer) {
          totalSavings += freeSavings;
          const newLineTotal = Math.max(0, existingInCart.lineOriginalTotal - freeSavings);

          evaluatedItems = evaluatedItems.map((it) => {
            if (it.menuItemId === rewardItemId) {
              return {
                ...it,
                hasDiscount: true,
                lineSavings: freeSavings,
                lineTotal: newLineTotal,
                unitPrice: Math.round((newLineTotal / it.quantity) * 100) / 100,
                discountAmount: Math.round((freeSavings / it.quantity) * 100) / 100,
                isFreeReward: true,
                rewardQuantity: unitsToFree,
                appliedOffer: {
                  id: freeOff.id,
                  title: freeOff.title,
                  offerCategory: 'FREE_ITEM',
                  rewardQuantity: unitsToFree
                }
              };
            }
            return it;
          });

          appliedOffers.push({
            id: freeOff.id,
            title: freeOff.title,
            offerType: 'FREE_ITEM',
            offerCategory: 'FREE_ITEM',
            minOrderValue: minOrder,
            currentSubtotal: currentEligibleSubtotal,
            rewardItem: {
              name: existingInCart.name,
              quantity: unitsToFree,
              type: 'FREE'
            },
            savings: freeSavings,
            description: freeOff.description || `Order for ₹${minOrder} and get ${unitsToFree}x ${existingInCart.name} FREE!`
          });
        }
      } else if (freeOff.reward_item) {
        // Automatically inject the free reward dish at ₹0
        const freeDish = freeOff.reward_item;
        const freeDishPrice = Number(freeDish.price || 0);
        const freeSavings = Math.round(freeDishPrice * rewardQty * 100) / 100;

        evaluatedItems.push({
          id: `free-reward-${freeOff.id}`,
          menuItemId: freeDish.id,
          name: freeDish.name,
          imageUrl: freeDish.image_url,
          foodType: freeDish.food_type,
          isAvailable: true,
          preparationTime: freeDish.preparation_time || 15,
          categoryName: 'Promotional Reward',
          categoryId: freeDish.category_id || null,
          quantity: rewardQty,
          originalUnitPrice: freeDishPrice,
          unitPrice: 0,
          discountAmount: freeDishPrice,
          hasDiscount: true,
          appliedOffer: {
            id: freeOff.id,
            title: freeOff.title,
            offerCategory: 'FREE_ITEM',
            rewardQuantity: rewardQty
          },
          lineOriginalTotal: freeSavings,
          lineTotal: 0,
          lineSavings: freeSavings,
          isFreeReward: true,
          rewardQuantity: rewardQty
        });

        totalSavings += freeSavings;

        appliedOffers.push({
          id: freeOff.id,
          title: freeOff.title,
          offerType: 'FREE_ITEM',
          offerCategory: 'FREE_ITEM',
          minOrderValue: minOrder,
          currentSubtotal: currentEligibleSubtotal,
          rewardItem: {
            name: freeDish.name,
            quantity: rewardQty,
            type: 'FREE'
          },
          savings: freeSavings,
          description: freeOff.description || `Order for ₹${minOrder} and get ${rewardQty}x ${freeDish.name} FREE!`
        });
      }
    }
  }

  // --- STEP 4: PROCESS STANDARD FLAT, CATEGORY, PERCENTAGE & RESTAURANT OFFERS ---
  // Apply only to items that haven't received a combo, bogo, or free item reward
  evaluatedItems = evaluatedItems.map((it) => {
    if (it.appliedOffer) return it;

    const singleItemCalc = calculateDiscountForItem(
      { id: it.menuItemId, category_id: it.categoryId, price: it.originalUnitPrice },
      otherOffers,
      initialSubtotal
    );

    if (singleItemCalc.hasDiscount && singleItemCalc.discountAmount > 0) {
      const lineDisc = Math.round(singleItemCalc.discountAmount * it.quantity * 100) / 100;
      totalSavings += lineDisc;

      if (!appliedOffers.some((o) => o.id === singleItemCalc.appliedOffer.id)) {
        appliedOffers.push({
          id: singleItemCalc.appliedOffer.id,
          title: singleItemCalc.appliedOffer.title,
          offerType: singleItemCalc.appliedOffer.offerType,
          offerCategory: singleItemCalc.appliedOffer.offerCategory || singleItemCalc.appliedOffer.offerType,
          qualifyingItem: {
            name: it.name,
            quantity: it.quantity,
            type: 'DISCOUNTED'
          },
          savings: lineDisc,
          description: singleItemCalc.appliedOffer.description || singleItemCalc.appliedOffer.title
        });
      }

      return {
        ...it,
        hasDiscount: true,
        unitPrice: singleItemCalc.discountedPrice,
        discountAmount: singleItemCalc.discountAmount,
        lineSavings: lineDisc,
        lineTotal: Math.round(singleItemCalc.discountedPrice * it.quantity * 100) / 100,
        appliedOffer: singleItemCalc.appliedOffer
      };
    }

    return it;
  });

  const calculatedSubtotal = evaluatedItems.reduce((acc, it) => acc + it.lineOriginalTotal, 0);
  const finalPayable = Math.max(0, Math.round((calculatedSubtotal - totalSavings) * 100) / 100);

  return {
    items: evaluatedItems,
    appliedOffers,
    subtotal: Math.round(calculatedSubtotal * 100) / 100,
    totalSavings: Math.round(totalSavings * 100) / 100,
    finalPayableAmount: finalPayable
  };
};

/**
 * Single-Item fallback calculation engine with conflict resolution rules:
 * Rule 1: ITEM offer takes precedence over CATEGORY offer.
 * Rule 2: CATEGORY offer takes precedence over RESTAURANT offer.
 * Rule 3: If multiple offers exist at the same tier, the one offering highest customer savings applies.
 */
const calculateDiscountForItem = (item, activeOffers, cartSubtotal = 0) => {
  const originalPrice = Number(item.price);
  if (!originalPrice || originalPrice <= 0) {
    return {
      originalPrice,
      discountAmount: 0,
      discountedPrice: originalPrice,
      hasDiscount: false,
      appliedOffer: null
    };
  }

  // 1. Identify applicable active offers for this item
  const matchingOffers = [];

  for (const offer of (activeOffers || [])) {
    // Skip BOGO, COMBO, and FREE_ITEM offers in single-item pricing
    if (
      offer.offer_category === 'BUY_X_GET_Y' || 
      offer.offer_type === 'BUY_X_GET_Y' ||
      offer.offer_category === 'COMBO' ||
      offer.offer_category === 'FREE_ITEM'
    ) {
      continue;
    }

    // Check minimum order value if set
    if (offer.min_order_value && Number(offer.min_order_value) > 0) {
      if (cartSubtotal > 0 && cartSubtotal < Number(offer.min_order_value)) {
        continue;
      }
    }

    let isApplicable = false;

    if (offer.offer_type === 'ITEM' || offer.applicable_to === 'ITEM') {
      isApplicable = offer.menu_offer_items?.some((oi) => oi.item_id === item.id) || offer.buy_item_id === item.id;
    } else if (offer.offer_type === 'CATEGORY' || offer.offer_category === 'CATEGORY' || offer.applicable_to === 'CATEGORY') {
      isApplicable = offer.menu_offer_categories?.some((oc) => oc.category_id === item.category_id) || offer.buy_category_id === item.category_id;
    } else if (offer.offer_type === 'RESTAURANT' || offer.applicable_to === 'ALL') {
      isApplicable = true;
    }

    if (isApplicable) {
      const val = Number(offer.discount_value);
      let calcDiscount = 0;

      if (offer.discount_type === 'PERCENTAGE') {
        calcDiscount = (originalPrice * val) / 100;
        if (offer.max_discount_amount && Number(offer.max_discount_amount) > 0) {
          calcDiscount = Math.min(calcDiscount, Number(offer.max_discount_amount));
        }
      } else {
        // FIXED_AMOUNT / FLAT
        calcDiscount = Math.min(val, originalPrice);
      }

      // Priority rank: ITEM (3) > CATEGORY (2) > RESTAURANT (1)
      const tierRank = (offer.offer_type === 'ITEM' || offer.applicable_to === 'ITEM') ? 3 : (offer.offer_type === 'CATEGORY' || offer.offer_category === 'CATEGORY') ? 2 : 1;

      matchingOffers.push({
        offer,
        discountAmount: Math.round(calcDiscount * 100) / 100,
        tierRank
      });
    }
  }

  if (matchingOffers.length === 0) {
    // Check if this item qualifies for an active BOGO deal
    const bogoOffer = (activeOffers || []).find((o) => {
      const isBogo = o.offer_category === 'BUY_X_GET_Y' || o.offer_type === 'BUY_X_GET_Y';
      if (!isBogo) return false;
      return o.buy_item_id === item.id || o.menu_offer_items?.some((oi) => oi.item_id === item.id);
    });

    return {
      originalPrice,
      discountAmount: 0,
      discountedPrice: originalPrice,
      hasDiscount: false,
      appliedOffer: null,
      bogoOffer: bogoOffer ? {
        id: bogoOffer.id,
        title: bogoOffer.title,
        offerCategory: 'BUY_X_GET_Y',
        buyQuantity: bogoOffer.buy_quantity || 1,
        rewardQuantity: bogoOffer.reward_quantity || 1,
        rewardDiscountType: bogoOffer.reward_discount_type || 'FREE',
        rewardItemId: bogoOffer.reward_item_id
      } : null
    };
  }

  // Sort by highest priority tier, then highest discount savings
  matchingOffers.sort((a, b) => {
    if (b.tierRank !== a.tierRank) return b.tierRank - a.tierRank;
    return b.discountAmount - a.discountAmount;
  });

  const best = matchingOffers[0];
  const finalDiscount = Math.min(best.discountAmount, originalPrice);
  const discountedPrice = Math.max(0, Math.round((originalPrice - finalDiscount) * 100) / 100);

  return {
    originalPrice,
    discountAmount: finalDiscount,
    discountedPrice,
    hasDiscount: finalDiscount > 0,
    appliedOffer: {
      id: best.offer.id,
      title: best.offer.title,
      offerType: best.offer.offer_type,
      offerCategory: best.offer.offer_category || (best.offer.discount_type === 'FIXED_AMOUNT' ? 'FLAT' : 'PERCENTAGE'),
      discountType: best.offer.discount_type,
      discountValue: Number(best.offer.discount_value),
      maxDiscountAmount: best.offer.max_discount_amount ? Number(best.offer.max_discount_amount) : null
    }
  };
};

// ==================== SERVICE HANDLERS ====================

const getOffers = async (userId, userRole, query = {}) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, query.cafeId);
  return await offerRepository.findOffersByCafe(cafe.id, query);
};

const getOfferStats = async (userId, userRole, cafeId = null) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, cafeId);
  const allOffers = await offerRepository.findOffersByCafe(cafe.id);

  const stats = {
    totalOffers: allOffers.length,
    activeOffers: 0,
    scheduledOffers: 0,
    expiredOffers: 0,
    inactiveOffers: 0
  };

  allOffers.forEach((o) => {
    if (o.computed_status === 'ACTIVE') stats.activeOffers++;
    else if (o.computed_status === 'SCHEDULED') stats.scheduledOffers++;
    else if (o.computed_status === 'EXPIRED') stats.expiredOffers++;
    else if (o.computed_status === 'INACTIVE') stats.inactiveOffers++;
  });

  return stats;
};

const getOfferById = async (userId, userRole, id) => {
  const offer = await offerRepository.findOfferById(id);
  if (!offer) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }

  // Authorize cafe ownership
  if (userRole !== 'ADMIN') {
    const userCafes = await cafeRepository.findAllCafes({ owner_id: userId });
    const userCafeIds = (userCafes || []).map((c) => c.id);
    if (!userCafeIds.includes(offer.cafe_id)) {
      const error = new Error('Unauthorized to view this offer');
      error.statusCode = 403;
      throw error;
    }
  }

  return offer;
};

const createOffer = async (userId, userRole, data) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, data.cafeId);

  // Validate dates
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const error = new Error('Valid start date and end date are required');
    error.statusCode = 400;
    throw error;
  }

  if (end <= start) {
    const error = new Error('End date and time must be after the start date and time');
    error.statusCode = 400;
    throw error;
  }

  // Validate discount value
  let val = Number(data.discountValue || 0);
  const offerCategory = data.offerCategory || (data.offerType === 'BUY_X_GET_Y' ? 'BUY_X_GET_Y' : 'PERCENTAGE');

  if (offerCategory !== 'BUY_X_GET_Y' && offerCategory !== 'COMBO' && offerCategory !== 'FREE_ITEM') {
    if (isNaN(val) || val <= 0) {
      const error = new Error('Discount value must be greater than zero');
      error.statusCode = 400;
      throw error;
    }

    if (data.discountType === 'PERCENTAGE' && val > 100) {
      const error = new Error('Percentage discount cannot exceed 100%');
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate item and category associations belong to this cafe
  let itemIds = Array.isArray(data.itemIds) ? data.itemIds : [];
  let categoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];

  // 1. COMBO DEALS validation
  if (offerCategory === 'COMBO') {
    const comboPrice = Number(data.comboPrice || 0);
    if (isNaN(comboPrice) || comboPrice <= 0) {
      const error = new Error('Please enter a valid combo selling price greater than ₹0');
      error.statusCode = 400;
      throw error;
    }

    let comboComponents = [];
    if (Array.isArray(data.comboComponents) && data.comboComponents.length > 0) {
      comboComponents = data.comboComponents;
    } else if (typeof data.termsAndConditions === 'string' && data.termsAndConditions.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(data.termsAndConditions);
        if (Array.isArray(parsed.components)) comboComponents = parsed.components;
      } catch (e) {}
    }

    if (comboComponents.length === 0 && itemIds.length > 0) {
      comboComponents = itemIds.map(id => ({ itemId: id, quantity: 1 }));
    }

    if (comboComponents.length === 0) {
      const error = new Error('Please select at least one food item for the combo');
      error.statusCode = 400;
      throw error;
    }

    const componentItemIds = comboComponents.map(c => c.itemId || c.id).filter(Boolean);
    const cafeItems = await prisma.menu_items.findMany({
      where: { id: { in: componentItemIds }, cafe_id: cafe.id },
      select: { id: true, name: true, price: true }
    });

    if (cafeItems.length !== componentItemIds.length) {
      const error = new Error('One or more selected combo items do not belong to this restaurant');
      error.statusCode = 400;
      throw error;
    }

    const originalTotal = comboComponents.reduce((sum, comp) => {
      const it = cafeItems.find(i => i.id === (comp.itemId || comp.id));
      const qty = Number(comp.quantity) || 1;
      return sum + (it ? Number(it.price) * qty : 0);
    }, 0);

    if (comboPrice >= originalTotal && originalTotal > 0) {
      const error = new Error(`Combo price (₹${comboPrice}) must be less than combined original menu price (₹${originalTotal}) to provide real customer savings`);
      error.statusCode = 400;
      throw error;
    }

    data.termsAndConditions = JSON.stringify({
      components: comboComponents.map(c => ({
        itemId: c.itemId || c.id,
        quantity: Number(c.quantity) || 1
      })),
      originalPrice: originalTotal,
      savings: originalTotal - comboPrice,
      maxCombosPerOrder: data.maxRewardQuantity ? Number(data.maxRewardQuantity) : null,
      imageUrl: data.imageUrl || null
    });

    itemIds = componentItemIds;
    categoryIds = [];
    val = originalTotal - comboPrice;
  }
  // 2. FREE ITEM ON MINIMUM ORDER validation
  else if (offerCategory === 'FREE_ITEM') {
    const minOrderVal = Number(data.minOrderValue || 0);
    if (isNaN(minOrderVal) || minOrderVal <= 0) {
      const error = new Error('Please specify a minimum order value greater than ₹0 to unlock the free item');
      error.statusCode = 400;
      throw error;
    }

    const rewardItemId = data.rewardItemId || (itemIds.length > 0 ? itemIds[0] : null);
    if (!rewardItemId) {
      const error = new Error('Please select a free food item reward');
      error.statusCode = 400;
      throw error;
    }

    const freeItem = await prisma.menu_items.findFirst({
      where: { id: rewardItemId, cafe_id: cafe.id },
      select: { id: true, name: true, price: true }
    });

    if (!freeItem) {
      const error = new Error('Selected free item does not belong to this restaurant');
      error.statusCode = 400;
      throw error;
    }

    itemIds = [rewardItemId];
    categoryIds = [];
    val = Number(freeItem.price);
  }
  // 3. FLAT RUPEE DISCOUNT validation
  else if (offerCategory === 'FLAT') {
    if (isNaN(val) || val <= 0) {
      const error = new Error('Please specify a flat discount amount in ₹ greater than 0');
      error.statusCode = 400;
      throw error;
    }

    if (data.offerType === 'ITEM') {
      if (itemIds.length === 0) {
        const error = new Error('Please select at least one menu item for item-level flat discount');
        error.statusCode = 400;
        throw error;
      }
      const cafeItems = await prisma.menu_items.findMany({
        where: { id: { in: itemIds }, cafe_id: cafe.id },
        select: { id: true, price: true }
      });
      if (cafeItems.length !== itemIds.length) {
        const error = new Error('One or more selected items do not belong to this restaurant');
        error.statusCode = 400;
        throw error;
      }
      categoryIds = [];
    } else if (data.offerType === 'CATEGORY') {
      if (categoryIds.length === 0) {
        const error = new Error('Please select at least one category for category-level flat discount');
        error.statusCode = 400;
        throw error;
      }
      const cafeCats = await prisma.menu_categories.findMany({
        where: { id: { in: categoryIds }, cafe_id: cafe.id },
        select: { id: true }
      });
      if (cafeCats.length !== categoryIds.length) {
        const error = new Error('One or more selected categories do not belong to this restaurant');
        error.statusCode = 400;
        throw error;
      }
      itemIds = [];
    } else {
      itemIds = [];
      categoryIds = [];
    }
  }
  // 4. Special BOGO validation
  else if (offerCategory === 'BUY_X_GET_Y') {
    const buyItemId = data.buyItemId || (itemIds.length > 0 ? itemIds[0] : null);
    const rewardItemId = data.rewardItemId || buyItemId;

    if (!buyItemId) {
      const error = new Error('Please select an item to buy for the BOGO offer');
      error.statusCode = 400;
      throw error;
    }

    const bogoItemIds = [buyItemId, rewardItemId].filter(Boolean);
    const cafeItems = await prisma.menu_items.findMany({
      where: { id: { in: bogoItemIds } },
      select: { id: true, cafe_id: true, price: true }
    });

    if (cafeItems.length === 0) {
      const error = new Error('Selected BOGO items were not found');
      error.statusCode = 400;
      throw error;
    }

    // Auto-align cafe if items belong to another valid cafe of the same owner or authorized context
    if (userRole !== 'ADMIN') {
      const invalidOwnerItem = await prisma.menu_items.findFirst({
        where: {
          id: { in: bogoItemIds },
          cafes: { owner_id: { not: userId } }
        }
      });
      if (invalidOwnerItem) {
        const error = new Error('Selected items do not belong to your restaurant');
        error.statusCode = 400;
        throw error;
      }
    }

    // Ensure cafe matches the items' actual cafe
    if (cafeItems[0]?.cafe_id && cafeItems[0].cafe_id !== cafe.id) {
      const matchedCafe = await prisma.cafes.findUnique({ where: { id: cafeItems[0].cafe_id } });
      if (matchedCafe && (userRole === 'ADMIN' || matchedCafe.owner_id === userId)) {
        cafe = matchedCafe;
      }
    }

    val = Number(data.rewardDiscountValue || 100);
    itemIds = bogoItemIds;
    categoryIds = [];
  } else if (data.offerType === 'ITEM') {
    if (itemIds.length === 0) {
      const error = new Error('Please select at least one menu item for an item-wise offer');
      error.statusCode = 400;
      throw error;
    }
    let cafeItems = await prisma.menu_items.findMany({
      where: { id: { in: itemIds }, cafe_id: cafe.id },
      select: { id: true, price: true, cafe_id: true }
    });

    if (cafeItems.length !== itemIds.length) {
      // Check if all items belong to another cafe owned by this user
      const ownerItems = await prisma.menu_items.findMany({
        where: { id: { in: itemIds } },
        include: { cafes: { select: { id: true, owner_id: true } } }
      });
      const allOwned = ownerItems.length === itemIds.length &&
        (userRole === 'ADMIN' || ownerItems.every((it) => it.cafes?.owner_id === userId));

      if (allOwned && ownerItems.length > 0) {
        const targetCafeId = ownerItems[0].cafe_id;
        const sameCafe = ownerItems.every((it) => it.cafe_id === targetCafeId);
        if (sameCafe) {
          const newCafe = await prisma.cafes.findUnique({ where: { id: targetCafeId } });
          if (newCafe) {
            cafe = newCafe;
            cafeItems = ownerItems;
          }
        }
      }

      if (cafeItems.length !== itemIds.length) {
        const error = new Error('One or more selected items do not belong to this cafe');
        error.statusCode = 400;
        throw error;
      }
    }
    // Fixed discount sanity check
    if (data.discountType === 'FIXED_AMOUNT') {
      const maxPrice = Math.max(...cafeItems.map((i) => Number(i.price)));
      if (val > maxPrice) {
        const error = new Error(`Fixed discount ₹${val} cannot exceed item price (highest ₹${maxPrice})`);
        error.statusCode = 400;
        throw error;
      }
    }
    categoryIds = [];
  } else if (data.offerType === 'CATEGORY') {
    if (categoryIds.length === 0) {
      const error = new Error('Please select at least one category for a category-wise offer');
      error.statusCode = 400;
      throw error;
    }
    const cafeCats = await prisma.menu_categories.findMany({
      where: { id: { in: categoryIds }, cafe_id: cafe.id },
      select: { id: true }
    });
    if (cafeCats.length !== categoryIds.length) {
      const error = new Error('One or more selected categories do not belong to this cafe');
      error.statusCode = 400;
      throw error;
    }
    itemIds = [];
  } else if (data.offerType === 'RESTAURANT') {
    itemIds = [];
    categoryIds = [];
  }

  const offerData = {
    cafe_id: cafe.id,
    title: data.title.trim(),
    description: data.description ? data.description.trim() : null,
    offer_type: data.offerType || (offerCategory === 'BUY_X_GET_Y' ? 'ITEM' : 'RESTAURANT'),
    offer_category: offerCategory,
    discount_type: data.discountType || 'PERCENTAGE',
    discount_value: val,
    max_discount_amount: data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null,
    applicable_to: data.offerType === 'RESTAURANT' ? 'ALL' : (data.offerType || 'ITEM'),

    // BOGO / Advanced Fields
    buy_item_id: data.buyItemId || (itemIds.length > 0 ? itemIds[0] : null),
    buy_category_id: data.buyCategoryId || (categoryIds.length > 0 ? categoryIds[0] : null),
    buy_quantity: data.buyQuantity ? Number(data.buyQuantity) : 1,
    reward_item_id: data.rewardItemId || data.buyItemId || (itemIds.length > 0 ? itemIds[0] : null),
    reward_category_id: data.rewardCategoryId || null,
    reward_quantity: data.rewardQuantity ? Number(data.rewardQuantity) : 1,
    reward_discount_type: data.rewardDiscountType || 'FREE',
    reward_discount_value: data.rewardDiscountValue !== undefined ? Number(data.rewardDiscountValue) : 100,
    max_reward_quantity: data.maxRewardQuantity ? Number(data.maxRewardQuantity) : null,
    min_order_value: data.minOrderValue ? Number(data.minOrderValue) : 0,
    max_redemptions: data.maxRedemptions ? Number(data.maxRedemptions) : null,
    combo_price: data.comboPrice ? Number(data.comboPrice) : null,
    terms_and_conditions: data.termsAndConditions || null,

    start_date: start,
    end_date: end,
    is_active: data.isActive !== undefined ? Boolean(data.isActive) : true
  };

  return await offerRepository.createOffer(offerData, itemIds, categoryIds);
};

const updateOffer = async (userId, userRole, id, data) => {
  const existing = await offerRepository.findOfferById(id);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }

  const cafe = await resolveAuthorizedCafe(userId, userRole, existing.cafe_id);

  let start = existing.start_date;
  let end = existing.end_date;

  if (data.startDate) start = new Date(data.startDate);
  if (data.endDate) end = new Date(data.endDate);

  if (end <= start) {
    const error = new Error('End date must be after start date');
    error.statusCode = 400;
    throw error;
  }

  const val = data.discountValue !== undefined ? Number(data.discountValue) : Number(existing.discount_value);
  const discountType = data.discountType || existing.discount_type;

  if (discountType === 'PERCENTAGE' && val > 100) {
    const error = new Error('Percentage discount cannot exceed 100%');
    error.statusCode = 400;
    throw error;
  }

  let itemIds = null;
  let categoryIds = null;

  const currentCategory = data.offerCategory || existing.offer_category;

  if (currentCategory === 'COMBO') {
    let comboComponents = [];
    if (Array.isArray(data.comboComponents) && data.comboComponents.length > 0) {
      comboComponents = data.comboComponents;
    } else if (typeof data.termsAndConditions === 'string' && data.termsAndConditions.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(data.termsAndConditions);
        if (Array.isArray(parsed.components)) comboComponents = parsed.components;
      } catch (e) {}
    }

    if (comboComponents.length > 0) {
      const componentItemIds = comboComponents.map(c => c.itemId || c.id).filter(Boolean);
      const cafeItems = await prisma.menu_items.findMany({
        where: { id: { in: componentItemIds }, cafe_id: cafe.id },
        select: { id: true, name: true, price: true }
      });
      const originalTotal = comboComponents.reduce((sum, comp) => {
        const it = cafeItems.find(i => i.id === (comp.itemId || comp.id));
        const qty = Number(comp.quantity) || 1;
        return sum + (it ? Number(it.price) * qty : 0);
      }, 0);

      const comboPrice = data.comboPrice !== undefined ? Number(data.comboPrice) : Number(existing.combo_price || 0);
      data.termsAndConditions = JSON.stringify({
        components: comboComponents.map(c => ({
          itemId: c.itemId || c.id,
          quantity: Number(c.quantity) || 1
        })),
        originalPrice: originalTotal,
        savings: originalTotal - comboPrice,
        maxCombosPerOrder: data.maxRewardQuantity !== undefined ? (data.maxRewardQuantity ? Number(data.maxRewardQuantity) : null) : existing.max_reward_quantity,
        imageUrl: data.imageUrl || null
      });
      itemIds = componentItemIds;
    }
  } else if (currentCategory === 'FREE_ITEM') {
    const rewardItemId = data.rewardItemId !== undefined ? data.rewardItemId : existing.reward_item_id;
    if (rewardItemId) {
      itemIds = [rewardItemId];
    }
  } else if (currentCategory === 'BUY_X_GET_Y') {
    const buyItemId = data.buyItemId !== undefined ? data.buyItemId : existing.buy_item_id;
    const rewardItemId = data.rewardItemId !== undefined ? data.rewardItemId : (existing.reward_item_id || buyItemId);
    const bogoItemIds = [buyItemId, rewardItemId].filter(Boolean);

    if (bogoItemIds.length > 0) {
      const cafeItems = await prisma.menu_items.findMany({
        where: { id: { in: bogoItemIds }, cafe_id: cafe.id },
        select: { id: true }
      });
      if (cafeItems.length !== bogoItemIds.length) {
        // Check if items belong to same user
        const ownerItems = await prisma.menu_items.findMany({
          where: { id: { in: bogoItemIds } },
          include: { cafes: { select: { id: true, owner_id: true } } }
        });
        const allOwned = ownerItems.length === bogoItemIds.length &&
          (userRole === 'ADMIN' || ownerItems.every((it) => it.cafes?.owner_id === userId));
        if (!allOwned) {
          const error = new Error('One or more selected items do not belong to this cafe');
          error.statusCode = 400;
          throw error;
        }
      }
      itemIds = bogoItemIds;
    }
  } else if (data.offerType === 'ITEM' || (!data.offerType && existing.offer_type === 'ITEM')) {
    if (data.itemIds) {
      itemIds = data.itemIds;
      const cafeItems = await prisma.menu_items.findMany({
        where: { id: { in: itemIds }, cafe_id: cafe.id },
        select: { id: true }
      });
      if (cafeItems.length !== itemIds.length) {
        const error = new Error('One or more selected items do not belong to this cafe');
        error.statusCode = 400;
        throw error;
      }
    }
  } else if (data.offerType === 'CATEGORY' || (!data.offerType && existing.offer_type === 'CATEGORY')) {
    if (data.categoryIds) {
      categoryIds = data.categoryIds;
      const cafeCats = await prisma.menu_categories.findMany({
        where: { id: { in: categoryIds }, cafe_id: cafe.id },
        select: { id: true }
      });
      if (cafeCats.length !== categoryIds.length) {
        const error = new Error('One or more selected categories do not belong to this cafe');
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const offerData = {
    title: data.title ? data.title.trim() : existing.title,
    description: data.description !== undefined ? (data.description ? data.description.trim() : null) : existing.description,
    offer_type: data.offerType || existing.offer_type,
    offer_category: data.offerCategory || existing.offer_category,
    discount_type: discountType,
    discount_value: val,
    max_discount_amount: data.maxDiscountAmount !== undefined ? (data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null) : existing.max_discount_amount,
    applicable_to: (data.offerType || existing.offer_type) === 'RESTAURANT' ? 'ALL' : (data.offerType || existing.offer_type),

    // BOGO / Advanced Fields
    buy_item_id: data.buyItemId !== undefined ? data.buyItemId : existing.buy_item_id,
    buy_category_id: data.buyCategoryId !== undefined ? data.buyCategoryId : existing.buy_category_id,
    buy_quantity: data.buyQuantity !== undefined ? Number(data.buyQuantity) : existing.buy_quantity,
    reward_item_id: data.rewardItemId !== undefined ? data.rewardItemId : existing.reward_item_id,
    reward_category_id: data.rewardCategoryId !== undefined ? data.rewardCategoryId : existing.reward_category_id,
    reward_quantity: data.rewardQuantity !== undefined ? Number(data.rewardQuantity) : existing.reward_quantity,
    reward_discount_type: data.rewardDiscountType || existing.reward_discount_type,
    reward_discount_value: data.rewardDiscountValue !== undefined ? Number(data.rewardDiscountValue) : existing.reward_discount_value,
    max_reward_quantity: data.maxRewardQuantity !== undefined ? (data.maxRewardQuantity ? Number(data.maxRewardQuantity) : null) : existing.max_reward_quantity,
    min_order_value: data.minOrderValue !== undefined ? Number(data.minOrderValue) : existing.min_order_value,
    max_redemptions: data.maxRedemptions !== undefined ? (data.maxRedemptions ? Number(data.maxRedemptions) : null) : existing.max_redemptions,
    combo_price: data.comboPrice !== undefined ? (data.comboPrice ? Number(data.comboPrice) : null) : existing.combo_price,
    terms_and_conditions: data.termsAndConditions !== undefined ? data.termsAndConditions : existing.terms_and_conditions,

    start_date: start,
    end_date: end,
    is_active: data.isActive !== undefined ? Boolean(data.isActive) : existing.is_active
  };

  return await offerRepository.updateOffer(id, offerData, itemIds, categoryIds);
};

const deleteOffer = async (userId, userRole, id) => {
  const existing = await offerRepository.findOfferById(id);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }
  await resolveAuthorizedCafe(userId, userRole, existing.cafe_id);
  return await offerRepository.deleteOffer(id);
};

const updateOfferStatus = async (userId, userRole, id, isActive) => {
  const existing = await offerRepository.findOfferById(id);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }
  await resolveAuthorizedCafe(userId, userRole, existing.cafe_id);
  return await offerRepository.updateOfferStatus(id, isActive);
};

const getPublicOffers = async (limit = 30, offerCategory = null) => {
  return await offerRepository.findPublicActiveOffers(limit, offerCategory);
};

const getPublicCafeOffers = async (cafeId) => {
  const activeOffers = await offerRepository.getActiveOffersForCafe(cafeId);
  return activeOffers.map((o) => ({
    ...o,
    computed_status: 'ACTIVE'
  }));
};

module.exports = {
  getOffers,
  getOfferStats,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  updateOfferStatus,
  calculateDiscountForItem,
  evaluateCartOffers,
  getPublicOffers,
  getPublicCafeOffers
};

