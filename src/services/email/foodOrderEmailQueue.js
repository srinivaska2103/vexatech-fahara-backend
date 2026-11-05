/**
 * Grab2Go Food Order Email Queue & Processing Engine
 * Idempotent, durable in-database / queue processor with bounded exponential retries.
 */

const prisma = require('../../config/prisma');
const nodemailer = require('nodemailer');

// Reuse existing transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const getSenderAddress = () => {
  const fromName = process.env.EMAIL_FROM_NAME || 'Grab2Go';
  const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.FROM_EMAIL || 'noreply@vexatech.in';
  return `"${fromName.replace(/"/g, '')}" <${fromEmail}>`;
};

/**
 * Validates an email address syntax
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
};

class FoodOrderEmailQueue {
  constructor() {
    this.isProcessing = false;
    this.maxAttempts = 5;
  }

  /**
   * Enqueue an email job idempotently by eventKey.
   */
  async enqueue({
    eventKey,
    orderId = null,
    recipientEmail,
    recipientType, // 'OWNER' | 'CUSTOMER' | 'ADMIN'
    notificationType,
    subject,
    html,
    text
  }) {
    if (!eventKey) throw new Error('eventKey is required for idempotent email notifications');

    const cleanEmail = (recipientEmail || '').trim();
    if (!isValidEmail(cleanEmail)) {
      console.warn(`[FoodOrderEmailQueue] Skipped invalid recipient email "${cleanEmail}" for key "${eventKey}"`);
      try {
        await prisma.email_notifications.create({
          data: {
            event_key: eventKey,
            order_id: orderId,
            recipient_email: cleanEmail || 'invalid@recipient.empty',
            recipient_type: recipientType || 'UNKNOWN',
            notification_type: notificationType || 'GENERAL',
            subject: subject || 'No subject',
            status: 'SKIPPED',
            last_error: 'Empty or invalid recipient email address'
          }
        });
      } catch (logErr) {
        // Ignore unique violation if already logged
      }
      return null;
    }

    try {
      // 1. Create or fetch existing notification job
      const job = await prisma.email_notifications.upsert({
        where: { event_key: eventKey },
        update: {}, // Never overwrite if already created
        create: {
          event_key: eventKey,
          order_id: orderId,
          recipient_email: cleanEmail,
          recipient_type: recipientType,
          notification_type: notificationType,
          subject,
          status: 'PENDING',
          payload: { html, text }
        }
      });

      // If job is already completed or processing, do not re-send
      if (job.status === 'SENT' || job.status === 'PROCESSING') {
        console.log(`[FoodOrderEmailQueue] Notification "${eventKey}" already ${job.status}. Skipping.`);
        return job;
      }

      // Trigger background worker tick (non-blocking)
      setTimeout(() => this.processNextBatch().catch(e => console.error('[QueueWorker Error]:', e)), 100);

      return job;
    } catch (err) {
      console.error(`[FoodOrderEmailQueue] Failed to enqueue email for key ${eventKey}:`, err.message);
      return null;
    }
  }

  /**
   * Process pending / failed retriable jobs
   */
  async processNextBatch() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingJobs = await prisma.email_notifications.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          attempts: { lt: this.maxAttempts }
        },
        orderBy: { created_at: 'asc' },
        take: 10
      });

      for (const job of pendingJobs) {
        await this.dispatchJob(job);
      }
    } catch (err) {
      console.error('[FoodOrderEmailQueue.processNextBatch Error]:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Dispatch a single job through Nodemailer
   */
  async dispatchJob(job) {
    const payload = job.payload || {};
    const formattedFrom = getSenderAddress();

    try {
      await prisma.email_notifications.update({
        where: { id: job.id },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 }
        }
      });

      const mailOptions = {
        from: formattedFrom,
        to: job.recipient_email,
        subject: job.subject,
        text: payload.text || '',
        html: payload.html || ''
      };

      const info = await transporter.sendMail(mailOptions);

      await prisma.email_notifications.update({
        where: { id: job.id },
        data: {
          status: 'SENT',
          sent_at: new Date(),
          last_error: null
        }
      });

      console.log(`[FoodOrderEmailQueue] ✓ Sent "${job.notification_type}" to ${job.recipient_email} (MsgID: ${info?.messageId})`);
    } catch (sendErr) {
      const errMsg = sendErr?.message || String(sendErr);
      const isFinal = (job.attempts + 1) >= this.maxAttempts;

      await prisma.email_notifications.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          last_error: `Attempt ${job.attempts + 1} failed: ${errMsg}`
        }
      });

      console.error(`[FoodOrderEmailQueue] ✗ Failed "${job.notification_type}" for ${job.recipient_email} (${errMsg})`);
    }
  }

  /**
   * Manual retry for admin dashboard
   */
  async retryNotification(id) {
    const job = await prisma.email_notifications.findUnique({ where: { id } });
    if (!job) throw new Error('Notification record not found');

    await prisma.email_notifications.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0 }
    });

    setImmediate(() => this.processNextBatch().catch(e => console.error(e)));
    return { success: true, message: 'Notification queued for retry' };
  }
}

module.exports = new FoodOrderEmailQueue();

