const Queue = require('bull');
const mailer = require('./mailer');
const emailTemplates = require('./emailTemplates');
const dayjs = require('dayjs');
require('dotenv').config();

// Create queues
const emailQueue = new Queue('email-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000 // 1 second
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Create separate queues for different types of emails
const appointmentQueue = new Queue('appointment-emails');
const newsletterQueue = new Queue('newsletter-emails');
const reminderQueue = new Queue('reminder-emails');

class EmailQueueManager {
  constructor() {
    this.setupQueueProcessors();
    this.setupQueueEvents();
  }

  // Set up queue processors
  setupQueueProcessors() {
    // Process general emails
    emailQueue.process(async (job) => {
      const { template, data, options } = job.data;
      const html = await emailTemplates.render(template, data);
      return mailer.sendMail({ ...options, html });
    });

    // Process appointment emails
    appointmentQueue.process(async (job) => {
      const { type, appointment } = job.data;
      let html;

      switch (type) {
        case 'confirmation':
          html = await emailTemplates.renderAppointmentConfirmation(appointment);
          break;
        case 'reminder':
          html = await emailTemplates.renderAppointmentReminder(appointment);
          break;
        default:
          throw new Error(`Unknown appointment email type: ${type}`);
      }

      return mailer.sendMail({
        to: appointment.email,
        subject: `Appointment ${type === 'confirmation' ? 'Confirmation' : 'Reminder'}`,
        html
      });
    });

    // Process newsletter emails
    newsletterQueue.process(async (job) => {
      const { newsletter, subscribers, batchSize = 50 } = job.data;
      const results = [];

      // Process subscribers in batches
      for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);
        const batchPromises = batch.map(async (subscriber) => {
          const html = await emailTemplates.renderNewsletter(newsletter, subscriber);
          return mailer.sendMail({
            to: subscriber.email,
            subject: newsletter.subject,
            html
          });
        });

        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);

        // Add delay between batches to prevent rate limiting
        if (i + batchSize < subscribers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return results;
    });

    // Process reminder emails
    reminderQueue.process(async (job) => {
      const { type, data } = job.data;
      let html;

      switch (type) {
        case 'appointment':
          html = await emailTemplates.renderAppointmentReminder(data);
          break;
        // Add other reminder types here
        default:
          throw new Error(`Unknown reminder type: ${type}`);
      }

      return mailer.sendMail({
        to: data.email,
        subject: `Reminder: ${data.subject}`,
        html
      });
    });
  }

  // Set up queue events
  setupQueueEvents() {
    const queues = [emailQueue, appointmentQueue, newsletterQueue, reminderQueue];

    queues.forEach(queue => {
      queue.on('completed', (job) => {
        console.log(`Job ${job.id} completed in queue ${queue.name}`);
      });

      queue.on('failed', (job, err) => {
        console.error(`Job ${job.id} failed in queue ${queue.name}:`, err);
        this.handleFailedJob(queue.name, job, err);
      });

      queue.on('error', (err) => {
        console.error(`Error in queue ${queue.name}:`, err);
      });

      queue.on('stalled', (job) => {
        console.warn(`Job ${job.id} stalled in queue ${queue.name}`);
      });
    });
  }

  // Handle failed jobs
  async handleFailedJob(queueName, job, error) {
    try {
      // Notify administrators
      await this.sendAdminNotification({
        subject: `Failed Email Job in ${queueName}`,
        message: `Job ${job.id} failed after ${job.attemptsMade} attempts`,
        error: error.message,
        jobData: job.data
      });

      // Store failed job for later analysis
      await this.storeFailedJob(queueName, job, error);
    } catch (err) {
      console.error('Error handling failed job:', err);
    }
  }

  // Add email to queue
  async addToQueue(template, data, options = {}) {
    return emailQueue.add({
      template,
      data,
      options: {
        to: options.to,
        subject: options.subject,
        ...options
      }
    });
  }

  // Schedule appointment emails
  async scheduleAppointmentEmails(appointment) {
    // Schedule confirmation email
    await appointmentQueue.add('confirmation', {
      type: 'confirmation',
      appointment
    });

    // Schedule reminder email (24 hours before)
    const reminderDate = dayjs(appointment.appointmentDate).subtract(24, 'hour').toDate();
    await reminderQueue.add('appointment', {
      type: 'appointment',
      data: appointment
    }, {
      delay: Math.max(0, reminderDate - new Date())
    });
  }

  // Send newsletter
  async sendNewsletter(newsletter, subscribers) {
    return newsletterQueue.add({
      newsletter,
      subscribers,
      batchSize: 50
    });
  }

  // Send admin notification
  async sendAdminNotification(notification) {
    const html = await emailTemplates.renderAdminNotification(notification);
    return mailer.sendMail({
      to: process.env.ADMIN_EMAIL,
      subject: notification.subject,
      html
    });
  }

  // Store failed job for analysis
  async storeFailedJob(queueName, job, error) {
    // Implement storage logic (e.g., in MongoDB)
    console.log('Failed job stored for analysis:', {
      queueName,
      jobId: job.id,
      error: error.message,
      timestamp: new Date()
    });
  }

  // Get queue statistics
  async getQueueStats() {
    const queues = [emailQueue, appointmentQueue, newsletterQueue, reminderQueue];
    const stats = {};

    for (const queue of queues) {
      stats[queue.name] = {
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        completed: await queue.getCompletedCount(),
        failed: await queue.getFailedCount(),
        delayed: await queue.getDelayedCount()
      };
    }

    return stats;
  }

  // Clean up old jobs
  async cleanupOldJobs() {
    const queues = [emailQueue, appointmentQueue, newsletterQueue, reminderQueue];
    
    for (const queue of queues) {
      await queue.clean(7 * 24 * 3600 * 1000, 'completed'); // Clean completed jobs older than 7 days
      await queue.clean(30 * 24 * 3600 * 1000, 'failed'); // Clean failed jobs older than 30 days
    }
  }
}

// Export singleton instance
module.exports = new EmailQueueManager();
