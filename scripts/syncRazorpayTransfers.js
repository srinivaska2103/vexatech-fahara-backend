require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');
const { getRazorpayInstance } = require('../src/config/razorpay');

async function syncTransfersWithRazorpay() {
  try {
    const rzp = getRazorpayInstance();
    console.log('[Sync] Fetching transfers from live Razorpay...');
    const transfers = await rzp.transfers.all({ count: 100 });
    console.log(`[Sync] Found ${transfers.items.length} transfers in Razorpay`);

    let updatedCount = 0;
    for (const t of transfers.items) {
      // Find matching payment in DB
      const payment = await prisma.payments.findFirst({
        where: {
          OR: [
            { provider_order_id: t.source },
            { gateway_order_id: t.source },
            { gateway_payment_id: t.source }
          ]
        },
        include: { payment_splits: true }
      });

      if (!payment) continue;

      console.log(`Transfer ${t.id} -> Source: ${t.source}, Status: ${t.status}, SettlementStatus: ${t.settlement_status}, Payment: ${payment.id}, Order: ${payment.gateway_order_id}`);

      // Check splits
      for (const split of payment.payment_splits) {
        console.log(` Split ${split.id}: current settlement_status = ${split.settlement_status}, transfer_status = ${split.transfer_status}`);
        
        // If razorpay transfer is settled, or processed
        const isSettled = t.settlement_status === 'settled';
        const isProcessed = t.status === 'processed';

        const updateData = {
          provider_transfer_id: t.id,
          transfer_status: 'PROCESSED'
        };

        if (isSettled) {
          
          updateData.settlement_status = 'COMPLETED';
          updateData.settled_at = new Date(t.created_at * 1000);
        } else if (isProcessed && split.settlement_status !== 'COMPLETED') {
          // If transfer was processed in razorpay more than 1 day ago, it's either settled in live Route or processed
          updateData.transfer_status = 'PROCESSED';
        }

        await prisma.payment_splits.update({
          where: { id: split.id },
          data: updateData
        });
        updatedCount++;
      }
    }
    console.log(`[Sync Done] Updated ${updatedCount} splits.`);
  } catch (err) {
    console.error('[Sync Error]', err);
  } finally {
    await prisma.$disconnect();
  }
}

syncTransfersWithRazorpay();
