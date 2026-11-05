const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: { rejectUnauthorized: false }
});

async function run() {
  console.log('1. Verifying SMTP connection to', process.env.SMTP_HOST, process.env.SMTP_PORT);
  await transporter.verify();
  console.log('✓ SMTP connection verified successfully!');

  console.log('2. Sending test email from', process.env.SMTP_USER, 'to vexatech.connect@gmail.com');
  const info = await transporter.sendMail({
    from: `"Grab2Go Fahara" <${process.env.SMTP_USER}>`,
    to: 'vexatech.connect@gmail.com',
    subject: 'Grab2Go Test Email - ' + new Date().toISOString(),
    text: 'Hello, this is a test email from Grab2Go backend to confirm live email dispatch.',
    html: '<h3>Hello!</h3><p>This is a test email confirming live email dispatch from Fahara Grab2Go backend.</p>'
  });
  console.log('✓ Email dispatch result:');
  console.log('  MessageId:', info.messageId);
  console.log('  Accepted:', info.accepted);
  console.log('  Rejected:', info.rejected);
  console.log('  Response:', info.response);
}

run().catch(err => {
  console.error('✗ SMTP ERROR:', err);
});

