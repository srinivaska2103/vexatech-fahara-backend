const fs = require('fs');

let content = fs.readFileSync('vexatech-fahara-backend/src/services/foodOrderPaymentService.js', 'utf8');

const targetStr = 'const updatedOrder = await prisma.$transaction(async (tx) => {';
const replacement = [
  '// 2. Record or update verified payment in central payments table & mark food order as PAID',
  '    const updatedOrder = await prisma.$transaction(async (tx) => {',
  '      const existingPayment = await tx.payments.findFirst({',
  '        where: {',
  '          OR: [',
  '            ...(razorpay_order_id ? [{ gateway_order_id: razorpay_order_id }, { provider_order_id: razorpay_order_id }] : [{ gateway_order_id: order.order_number }]),',
  '            ...(razorpay_payment_id ? [{ gateway_payment_id: razorpay_payment_id }, { provider_payment_id: razorpay_payment_id }] : [])',
  '          ]',
  '        }',
  '      });',
  '',
  '      if (!existingPayment) {',
  '        await tx.payments.create({',
  '          data: {',
  '            amount: order.total_amount,',
  '            platform_fee: order.delivery_charge || 0,',
  '            gst_amount: order.tax_amount || 0,',
  '            payment_gateway: "RAZORPAY",',
  '            payment_provider: "RAZORPAY",',
  '            gateway_order_id: razorpay_order_id || order.order_number,',
  '            gateway_payment_id: razorpay_payment_id,',
  '            provider_order_id: razorpay_order_id,',
  '            provider_payment_id: razorpay_payment_id,',
  '            status: "SUCCESS",',
  '            paid_at: new Date(),',
  '            payment_method: "ONLINE"',
  '          }',
  '        });',
  '      } else {',
  '        await tx.payments.update({',
  '          where: { id: existingPayment.id },',
  '          data: {',
  '            status: "SUCCESS",',
  '            gateway_payment_id: razorpay_payment_id,',
  '            provider_payment_id: razorpay_payment_id,',
  '            paid_at: new Date()',
  '          }',
  '        });',
  '      }'
].join('\n');

content = content.replace(targetStr, replacement + '\n\n      const resOrder = await tx.food_orders.update({');
fs.writeFileSync('vexatech-fahara-backend/src/services/foodOrderPaymentService.js', content, 'utf8');
console.log('Successfully updated foodOrderPaymentService.js with payments tracking');

