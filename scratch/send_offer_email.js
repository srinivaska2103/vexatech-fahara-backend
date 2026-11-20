require('dotenv').config();
const emailService = require('../src/utils/emailService');

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Grab2Go Movie Ticket & Exclusive Offers!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #FFF5F5; margin: 0; padding: 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #FEE2E2;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #E50914 0%, #B71C1C 100%); padding: 24px; text-align: center; color: #FFFFFF;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">Grab<span style="color: #FDE047;">2GO</span></h1>
              <p style="margin: 4px 0 0; font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">Exclusive Offers &amp; Rewards</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px 28px;">
              <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 900; color: #166534;">🎬 Your Movie Ticket is Ready!</h2>
              <p style="margin: 0 0 20px; font-size: 14px; color: #555555; line-height: 1.6;">
                Hi <strong>Srinivas K A</strong>,<br>
                Congratulations! Your Grab2Go promotional movie ticket reward has been approved and issued. Here are your show details:
              </p>

              <!-- Ticket Card -->
              <table width="100%" cellpadding="12" cellspacing="0" border="0" style="background: #FDF2F2; border-radius: 14px; border: 1px solid #FCA5A5; margin-bottom: 24px;">
                <tr>
                  <td style="font-size: 13px; color: #4B5563; font-weight: 600;">Movie Name:</td>
                  <td align="right" style="font-size: 14px; font-weight: 900; color: #111827;">Avengers Doomsday Free Movie Ticket</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #4B5563; font-weight: 600;">Cinema / Theatre:</td>
                  <td align="right" style="font-size: 14px; font-weight: 800; color: #111827;">Vetri Cinema</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #4B5563; font-weight: 600;">Show Time:</td>
                  <td align="right" style="font-size: 14px; font-weight: 800; color: #E50914;">07:30 PM, Screen 1</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #4B5563; font-weight: 600;">Seat Details:</td>
                  <td align="right" style="font-size: 14px; font-weight: 800; color: #111827;">Row D - Seat 14 (VIP)</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #4B5563; font-weight: 600;">Booking / PNR Reference:</td>
                  <td align="right" style="font-size: 13px; font-weight: 900; color: #1F2937; letter-spacing: 1px;">G2G-BKG-612220</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #4B5563; font-weight: 600;">Claim Number:</td>
                  <td align="right" style="font-size: 13px; font-weight: 700; color: #6B7280;">CLM-MVI-4A668C-2026</td>
                </tr>
              </table>

              <!-- Ticket Image Preview -->
              <div style="text-align: center; margin-bottom: 24px;">
                <p style="font-size: 12px; font-weight: 800; color: #4B5563; margin-bottom: 8px; text-transform: uppercase;">Digital Ticket / Barcode</p>
                <img src="https://res.cloudinary.com/fv9fi0y5/image/upload/v1795006644/fahara_uploads/yrwzpdzap8b1nomizmtr.jpg" alt="Ticket Barcode" style="max-width: 100%; width: 340px; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 2px 8px rgba(0,0,0,0.06);" />
              </div>

              <!-- Special Offers Banner -->
              <table width="100%" cellpadding="16" cellspacing="0" border="0" style="background: linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%); border-radius: 14px; border: 1px solid #FECDD3; margin-bottom: 24px;">
                <tr>
                  <td>
                    <span style="display: inline-block; background: #E50914; color: #FFFFFF; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">HOT DEALS</span>
                    <h3 style="margin: 8px 0 4px; font-size: 16px; font-weight: 900; color: #881337;">🔥 Flat 50% OFF on Your Next Food &amp; Cafe Order!</h3>
                    <p style="margin: 0; font-size: 13px; color: #4C0519; line-height: 1.5;">
                      Enjoy delicious meals from top restaurants and cozy cafe spaces with Grab2GO exclusive deals.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 28px 0 8px;">
                <a href="https://fahara.in/customer/profile?tab=rewards" style="display: inline-block; background: #E50914; color: #FFFFFF; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 32px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 14px rgba(229, 9, 20, 0.35);">
                  View My Tickets &amp; Rewards &rarr;
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF5F5; padding: 20px 28px; text-align: center; border-top: 1px solid #FEE2E2; font-size: 11px; color: #6B7280; line-height: 1.6;">
              <p style="margin: 0 0 4px; font-weight: 700; color: #111827;">Grab2GO &bull; Exclusive Customer Rewards</p>
              <p style="margin: 0;">Need help? Contact us at support: <a href="mailto:vexatech.connect@gmail.com" style="color: #E50914; text-decoration: none; font-weight: 700;">vexatech.connect@gmail.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const text = `Hi Srinivas K A,

Your Grab2Go movie ticket for 'Avengers Doomsday Free Movie Ticket' at Vetri Cinema is ready!

Show Time: 07:30 PM, Screen 1
Seat Details: Row D - Seat 14 (VIP)
Booking Reference: G2G-BKG-612220
Claim Number: CLM-MVI-4A668C-2026

Ticket Image URL: https://res.cloudinary.com/fv9fi0y5/image/upload/v1795006644/fahara_uploads/yrwzpdzap8b1nomizmtr.jpg

View your rewards & explore 50% OFF offers on Grab2GO:
https://fahara.in/customer/profile?tab=rewards

Thank you,
Grab2GO Team
`;

async function run() {
  console.log('Sending email...');
  const res = await emailService.sendEmail(
    'testsrini276@gmail.com',
    '🎬 Your Movie Ticket & Exclusive 50% OFF Offers Details - Grab2GO',
    text,
    html,
    true,
    'Grab2GO Rewards & Offers'
  );
  console.log('Email dispatch executed. Details:', res);
}

run().catch(console.error);
