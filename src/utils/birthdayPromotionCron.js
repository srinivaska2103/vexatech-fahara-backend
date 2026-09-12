const cron = require('node-cron');
const prisma = require('../config/prisma');
const { sendBirthdayPromotionalEmail } = require('./emailService');

const MONTH_NAMES = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/**
 * Extracts month (0-indexed) and day (1-31) from bio text or DOB date.
 * Supports patterns like:
 * - "Birthday: 12 October"
 * - "Bday Oct 12"
 * - "Born on 12/10" or "12-10" or "2000-10-12"
 * - "DOB: 12th Oct"
 */
const extractBirthdayFromUser = (user) => {
  // 1. First priority: Check structured DOB field
  if (user.dob && !isNaN(new Date(user.dob).getTime())) {
    const d = new Date(user.dob);
    return { month: d.getUTCMonth(), day: d.getUTCDate() };
  }

  // 2. Check Bio text for birthday mentions
  if (!user.bio || typeof user.bio !== 'string') return null;

  const bio = user.bio.toLowerCase();

  // Pattern A: "Birthday: 12 Oct", "Bday October 12th", "DOB: Oct 12"
  const monthNameRegex = /(?:birthday|bday|dob|born|b-day)?[\s:-]*([a-z]{3,9})[\s,]+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const matchA = bio.match(monthNameRegex);
  if (matchA && MONTH_NAMES[matchA[1].toLowerCase()] !== undefined) {
    const month = MONTH_NAMES[matchA[1].toLowerCase()];
    const day = parseInt(matchA[2], 10);
    if (day >= 1 && day <= 31) return { month, day };
  }

  // Pattern B: "Birthday: 12th October", "12 Oct"
  const dayFirstRegex = /(?:birthday|bday|dob|born|b-day)?[\s:-]*(\d{1,2})(?:st|nd|rd|th)?[\s,\/-]+([a-z]{3,9})\b/i;
  const matchB = bio.match(dayFirstRegex);
  if (matchB && MONTH_NAMES[matchB[2].toLowerCase()] !== undefined) {
    const month = MONTH_NAMES[matchB[2].toLowerCase()];
    const day = parseInt(matchB[1], 10);
    if (day >= 1 && day <= 31) return { month, day };
  }

  // Pattern C: Full ISO / numeric dates like "1998-10-25" or "25/10/1998"
  const fullNumericRegex = /(?:birthday|bday|dob|born)?[\s:-]*(\d{4}|\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4}|\d{1,2})/i;
  const matchC = bio.match(fullNumericRegex);
  if (matchC) {
    let month, day;
    const p1 = parseInt(matchC[1], 10);
    const p2 = parseInt(matchC[2], 10);
    const p3 = parseInt(matchC[3], 10);

    if (p1 > 31) {
      // YYYY-MM-DD
      month = p2 - 1;
      day = p3;
    } else if (p3 > 31) {
      // DD-MM-YYYY
      day = p1;
      month = p2 - 1;
    } else {
      // DD/MM or MM/DD
      day = p1;
      month = p2 - 1;
    }

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { month, day };
    }
  }

  // Pattern D: Simple short numeric dates like "DOB 25/10" or "bday 25-10"
  const shortNumericRegex = /(?:birthday|bday|dob|born)[\s:-]*(\d{1,2})[\/\.-](\d{1,2})/i;
  const matchD = bio.match(shortNumericRegex);
  if (matchD) {
    const day = parseInt(matchD[1], 10);
    const month = parseInt(matchD[2], 10) - 1;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { month, day };
    }
  }

  return null;
};


/**
 * Checks if the given (month, day) is EXACTLY 30 days away from current local date.
 */
const isExact30DaysBeforeBirthday = (targetMonth, targetDay, now = new Date()) => {
  const currentYear = now.getFullYear();
  
  // Calculate target birthday in current year
  let bdayThisYear = new Date(currentYear, targetMonth, targetDay, 0, 0, 0, 0);

  // If birthday already passed this year, look at next year's birthday
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (bdayThisYear < todayStart) {
    bdayThisYear = new Date(currentYear + 1, targetMonth, targetDay, 0, 0, 0, 0);
  }

  const diffInMs = bdayThisYear.getTime() - todayStart.getTime();
  const diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));

  return diffInDays === 30;
};

/**
 * Main routine: Scans users and sends birthday promo emails 30 days before birthday.
 */
const runBirthdayPromotions = async () => {
  try {
    console.log('[BirthdayCron] Checking users for birthdays exactly 30 days from today...');

    const users = await prisma.users.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { dob: { not: null } },
          { bio: { not: null } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        dob: true,
        bio: true
      }
    });

    let emailsSent = 0;
    const now = new Date();
    const currentYear = now.getFullYear();

    for (const user of users) {
      if (!user.email) continue;

      const birthday = extractBirthdayFromUser(user);
      if (!birthday) continue;

      if (isExact30DaysBeforeBirthday(birthday.month, birthday.day, now)) {
        // Check if we already logged/sent notification for this user this year
        const notificationType = `BIRTHDAY_PROMO_${currentYear}`;
        const existingNotification = await prisma.notifications.findFirst({
          where: {
            user_id: user.id,
            notification_type: notificationType
          }
        });

        if (!existingNotification) {
          console.log(`[BirthdayCron] User ${user.name} (${user.email}) has birthday in 30 days! Sending promotional email...`);

          // Send promotional email
          await sendBirthdayPromotionalEmail(user.email, user.name);


          // Log in DB notifications table to avoid duplicate emails in the same year
          await prisma.notifications.create({
            data: {
              user_id: user.id,
              title: '30-Day Birthday Promotion Email Sent',
              message: `Special birthday promotional email sent to ${user.email} for upcoming birthday on Month ${birthday.month + 1}, Day ${birthday.day}.`,
              notification_type: notificationType,
              channel: 'EMAIL',
              status: 'SENT',
              sent_at: new Date()
            }
          });

          emailsSent++;
        }
      }
    }

    console.log(`[BirthdayCron] Completed scan. Sent ${emailsSent} promotional email(s).`);
  } catch (error) {
    console.error('[BirthdayCron] Error processing birthday promotions:', error?.message || error);
  }
};

/**
 * Initializes Cron job running daily at 09:00 AM.
 */
const startBirthdayPromotionCron = () => {
  // Run check 15 seconds after startup
  setTimeout(() => {
    runBirthdayPromotions().catch(() => {});
  }, 15000);

  // Daily schedule at 09:00 AM
  cron.schedule('0 9 * * *', async () => {
    await runBirthdayPromotions();
  });

  console.log('[BirthdayCron] Scheduled daily 30-day birthday promotional email checker at 09:00 AM.');
};

module.exports = {
  extractBirthdayFromUser,
  isExact30DaysBeforeBirthday,
  runBirthdayPromotions,
  startBirthdayPromotionCron
};
