require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  try {
    const sessions = await prisma.security_sessions.findMany({
      orderBy: [
        { is_current: 'desc' },
        { last_active_at: 'desc' }
      ],
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });
    console.log("Sessions successful!");
  } catch(e) {
    console.error("Sessions error:", e);
  }

  try {
    const history = await prisma.login_history.findMany({
      orderBy: { created_at: 'desc' },
      take: 20,
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });
    console.log("History successful!");
  } catch(e) {
    console.error("History error:", e);
  }
}

main().finally(() => prisma.$disconnect());
