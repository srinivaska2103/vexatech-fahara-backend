const fs = require('fs');

const path = 'vexatech-fahara-backend/src/repositories/cafeRepository.js';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('findCafeByOwnerId')) {
  const method = `
const findCafeByOwnerId = async (ownerId) => {
  return await prisma.cafes.findFirst({
    where: { owner_id: ownerId },
    include: {
      cafe_fulfilment_settings: true
    }
  });
};
`;

  code = code.replace('module.exports = {', method + '\nmodule.exports = {\n  findCafeByOwnerId,');
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully added findCafeByOwnerId to cafeRepository.js!');
} else {
  console.log('findCafeByOwnerId already exists');
}

