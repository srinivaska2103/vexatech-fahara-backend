const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/email/foodOrderEmailTemplates.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Define GRAB2GO logo constant
const logoConstant = `
const GRAB2GO_LOGO_URL = process.env.GRAB2GO_LOGO_URL || process.env.EMAIL_LOGO_URL || 'https://res.cloudinary.com/fv9fi0y5/image/upload/v1793863179/grab2go_assets/grab2go_logo.jpg';
const SUPPORT_EMAIL = process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com';
`;

if (!content.includes('GRAB2GO_LOGO_URL')) {
  content = content.replace("const formatCurrency = (amt) => {", `${logoConstant}\nconst formatCurrency = (amt) => {`);
}

// 2. Update Header Bar to display the official Grab2Go logo image + wordmark
const oldHeader = `          <!-- Header Bar -->
          <tr>
            <td style="background: linear-gradient(135deg, #E53935 0%, #B71C1C 100%); padding: 24px 32px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <span style="font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px;">Grab<span style="color: #FDE047;">2</span>Go</span>
                    <span style="display: block; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px;">Food Ordering &amp; Delivery</span>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); padding: 5px 12px; border-radius: 999px; font-size: 10px; font-weight: 800; color: #FFFFFF; text-transform: uppercase; letter-spacing: 1px;">
                      Order Alert
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

const newHeader = `          <!-- Header Bar with Official Grab2Go Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #E53935 0%, #B71C1C 100%); padding: 20px 28px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 14px;">
                          <img 
                            src="\${GRAB2GO_LOGO_URL}" 
                            alt="Grab2Go" 
                            width="52" 
                            height="52" 
                            style="width: 52px; height: 52px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.4); display: block; object-fit: contain; background: #FFFFFF;" 
                          />
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px; line-height: 1.1; display: block;">Grab<span style="color: #FDE047;">2</span>Go</span>
                          <span style="display: block; font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px;">Food Ordering &amp; Delivery</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.35); padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 800; color: #FFFFFF; text-transform: uppercase; letter-spacing: 1px;">
                      Grab2Go
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

if (content.includes(oldHeader)) {
  content = content.replace(oldHeader, newHeader);
} else {
  // Try CRLF
  content = content.replace(oldHeader.replace(/\n/g, '\r\n'), newHeader.replace(/\n/g, '\r\n'));
}

// 3. Update Footer support email to vexatech.connect@gmail.com
const oldFooterMail = `<a href="mailto:support@fahara.in" style="color: #E53935; text-decoration: none; font-weight: 700;">support@fahara.in</a>`;
const newFooterMail = `<a href="mailto:\${SUPPORT_EMAIL}" style="color: #E53935; text-decoration: none; font-weight: 700;">\${SUPPORT_EMAIL}</a>`;

content = content.replace(oldFooterMail, newFooterMail);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated foodOrderEmailTemplates.js with Grab2Go logo and vexatech.connect@gmail.com');

