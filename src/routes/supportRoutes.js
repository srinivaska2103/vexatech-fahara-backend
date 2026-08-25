const express = require('express');
const router = express.Router();
const { sendSupportTicketEmailToAdmin } = require('../utils/emailService');

const handleSupportTicket = async (req, res, next) => {
  try {
    const { fullName, email, phone, bookingId, category, subject, message } = req.body;
    const ticketId = `TK-${Math.floor(10000 + Math.random() * 90000)}`;

    const ticketPayload = {
      ticketId,
      fullName: fullName || 'Customer',
      email: email || 'No email provided',
      phone: phone || 'N/A',
      bookingId: bookingId || 'N/A',
      category: category || 'General Support',
      subject: subject || 'Support Request',
      message: message || '',
      created_at: new Date().toISOString()
    };

    // Send notification email directly to admin email (vexatech.connect@gmail.com)
    await sendSupportTicketEmailToAdmin(ticketPayload);

    res.status(201).json({
      success: true,
      message: 'Support ticket submitted and sent to admin email successfully',
      data: ticketPayload
    });
  } catch (error) {
    console.error('Error sending support ticket to admin email:', error);
    next(error);
  }
};

router.post('/', handleSupportTicket);
router.post('/tickets', handleSupportTicket);
router.post('/ticket', handleSupportTicket);
router.post('/contact', handleSupportTicket);

module.exports = router;
