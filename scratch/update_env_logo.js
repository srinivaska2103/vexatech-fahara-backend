const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
let env = fs.readFileSync(envPath, 'utf8');

const oldLogo = 'EMAIL_LOGO_URL="https://res.cloudinary.com/fv9fi0y5/image/upload/v1786768060/fahara_assets/fahara_logo.jpg"';
const newLogo = 'EMAIL_LOGO_URL="https://res.cloudinary.com/fv9fi0y5/image/upload/v1793863179/grab2go_assets/grab2go_logo.jpg"\nGRAB2GO_LOGO_URL="https://res.cloudinary.com/fv9fi0y5/image/upload/v1793863179/grab2go_assets/grab2go_logo.jpg"';

if (env.includes(oldLogo)) {
  env = env.replace(oldLogo, newLogo);
  fs.writeFileSync(envPath, env, 'utf8');
  console.log('Successfully updated .env logo URL!');
} else {
  console.log('Old logo not found in .env');
}

