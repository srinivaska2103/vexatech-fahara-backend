require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const payments = await prisma.payments.findMany({
    include: { bookings: true }
  });
  console.log('ALL PAYMENTS COUNT:', payments.length);
  payments.forEach((p, idx) => {
    console.log(`Payment #${idx + 1}:`, {
      id: p.id,
      status: p.status,
      amount: p.amount,
      platform_fee: p.platform_fee,
      paid_at: p.paid_at,
      created_at: p.created_at,
      booking: p.bookings ? {
        id: p.bookings.id,
        total: p.bookings.total,
        subtotal: p.bookings.subtotal,
        fahara_service_charge: p.bookings.fahara_service_charge,
        gst: p.bookings.gst,
        booking_status: p.bookings.booking_status
      } : null
    });
  });

  const bookings = await prisma.bookings.findMany();
  console.log('ALL BOOKINGS COUNT:', bookings.length);
  bookings.forEach((b, idx) => {
    console.log(`Booking #${idx + 1}:`, {
      id: b.id,
      total: b.total,
      subtotal: b.subtotal,
      fahara_service_charge: b.fahara_service_charge,
      cafe_amount: b.cafe_amount,
      event_service_amount: b.event_service_amount,
      booking_status: b.booking_status,
      payment_status: b.payment_status
    });
  });
}

main().finally(() => prisma.$disconnect());
