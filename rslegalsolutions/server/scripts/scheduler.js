const { DateTime } = require('luxon');
const RRule = require('rrule').RRule;
const mongoose = require('mongoose');
const logger = require('./logger');
const notifications = require('./notifications');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class SchedulerService {
  constructor() {
    this.workingHours = {
      start: parseInt(process.env.WORKING_HOURS_START) || 9,  // 9 AM
      end: parseInt(process.env.WORKING_HOURS_END) || 17      // 5 PM
    };

    this.slotDuration = parseInt(process.env.SLOT_DURATION) || 60; // 60 minutes
    this.bufferTime = parseInt(process.env.BUFFER_TIME) || 15;     // 15 minutes
    this.maxAdvanceDays = parseInt(process.env.MAX_ADVANCE_DAYS) || 30;

    this.initialize();
  }

  // Initialize scheduler service
  async initialize() {
    try {
      await this.setupSchedules();
      this.startReminders();
      logger.info('Scheduler service initialized');
    } catch (error) {
      logger.error('Scheduler service initialization failed:', error);
      throw new ServiceError('Scheduler service initialization failed', 'scheduler');
    }
  }

  // Setup schedules
  async setupSchedules() {
    try {
      // Setup recurring tasks
      this.setupDailyTasks();
      this.setupWeeklyTasks();
      this.setupMonthlyTasks();
    } catch (error) {
      logger.error('Failed to setup schedules:', error);
      throw error;
    }
  }

  // Get available slots
  async getAvailableSlots(date, lawyerId = null) {
    try {
      const requestedDate = DateTime.fromISO(date);
      
      // Validate date
      if (!this.isValidDate(requestedDate)) {
        throw new Error('Invalid date selected');
      }

      // Get all slots for the day
      const slots = this.generateDaySlots(requestedDate);

      // Get booked appointments
      const bookedSlots = await this.getBookedSlots(requestedDate, lawyerId);

      // Filter out booked slots
      const availableSlots = slots.filter(slot => 
        !bookedSlots.some(booked => 
          slot.start <= booked.end && slot.end >= booked.start
        )
      );

      return availableSlots;
    } catch (error) {
      logger.error('Failed to get available slots:', error);
      throw error;
    }
  }

  // Schedule appointment
  async scheduleAppointment(data) {
    try {
      const {
        clientId,
        lawyerId,
        serviceId,
        startTime,
        duration = this.slotDuration,
        type,
        notes
      } = data;

      // Validate time slot
      const slot = DateTime.fromISO(startTime);
      if (!this.isValidSlot(slot)) {
        throw new Error('Invalid time slot');
      }

      // Check availability
      const isAvailable = await this.checkSlotAvailability(slot, lawyerId);
      if (!isAvailable) {
        throw new Error('Time slot not available');
      }

      // Create appointment
      const appointment = await this.createAppointment({
        clientId,
        lawyerId,
        serviceId,
        startTime: slot.toJSDate(),
        endTime: slot.plus({ minutes: duration }).toJSDate(),
        type,
        notes,
        status: 'scheduled'
      });

      // Schedule notifications
      await this.scheduleAppointmentNotifications(appointment);

      return appointment;
    } catch (error) {
      logger.error('Failed to schedule appointment:', error);
      throw error;
    }
  }

  // Schedule court date
  async scheduleCourtDate(data) {
    try {
      const {
        caseId,
        courtId,
        date,
        time,
        purpose,
        participants,
        documents
      } = data;

      const courtDate = await this.createCourtDate({
        caseId,
        courtId,
        dateTime: DateTime.fromISO(`${date}T${time}`).toJSDate(),
        purpose,
        participants,
        documents,
        status: 'scheduled'
      });

      // Schedule notifications
      await this.scheduleCourtDateNotifications(courtDate);

      return courtDate;
    } catch (error) {
      logger.error('Failed to schedule court date:', error);
      throw error;
    }
  }

  // Reschedule appointment
  async rescheduleAppointment(appointmentId, newStartTime) {
    try {
      const appointment = await this.getAppointment(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const newSlot = DateTime.fromISO(newStartTime);
      if (!this.isValidSlot(newSlot)) {
        throw new Error('Invalid time slot');
      }

      // Check availability
      const isAvailable = await this.checkSlotAvailability(newSlot, appointment.lawyerId);
      if (!isAvailable) {
        throw new Error('Time slot not available');
      }

      // Update appointment
      appointment.startTime = newSlot.toJSDate();
      appointment.endTime = newSlot.plus({ minutes: this.slotDuration }).toJSDate();
      appointment.rescheduled = true;
      await appointment.save();

      // Notify participants
      await this.notifyReschedule(appointment);

      return appointment;
    } catch (error) {
      logger.error('Failed to reschedule appointment:', error);
      throw error;
    }
  }

  // Cancel appointment
  async cancelAppointment(appointmentId, reason) {
    try {
      const appointment = await this.getAppointment(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      appointment.status = 'cancelled';
      appointment.cancellationReason = reason;
      appointment.cancelledAt = new Date();
      await appointment.save();

      // Notify participants
      await this.notifyCancellation(appointment);

      return appointment;
    } catch (error) {
      logger.error('Failed to cancel appointment:', error);
      throw error;
    }
  }

  // Generate day slots
  generateDaySlots(date) {
    const slots = [];
    let currentSlot = date.set({
      hour: this.workingHours.start,
      minute: 0,
      second: 0,
      millisecond: 0
    });

    while (currentSlot.hour < this.workingHours.end) {
      slots.push({
        start: currentSlot.toJSDate(),
        end: currentSlot.plus({ minutes: this.slotDuration }).toJSDate()
      });

      currentSlot = currentSlot.plus({ minutes: this.slotDuration + this.bufferTime });
    }

    return slots;
  }

  // Check slot availability
  async checkSlotAvailability(slot, lawyerId) {
    const bookedSlots = await this.getBookedSlots(slot, lawyerId);
    return !bookedSlots.some(booked => 
      slot <= booked.end && slot.plus({ minutes: this.slotDuration }) >= booked.start
    );
  }

  // Get booked slots
  async getBookedSlots(date, lawyerId) {
    const startOfDay = date.startOf('day').toJSDate();
    const endOfDay = date.endOf('day').toJSDate();

    const query = {
      startTime: { $gte: startOfDay, $lt: endOfDay },
      status: { $ne: 'cancelled' }
    };

    if (lawyerId) {
      query.lawyerId = lawyerId;
    }

    const appointments = await mongoose.model('Appointment').find(query);
    return appointments.map(apt => ({
      start: apt.startTime,
      end: apt.endTime
    }));
  }

  // Schedule appointment notifications
  async scheduleAppointmentNotifications(appointment) {
    try {
      // Confirmation notification
      await notifications.sendInAppNotification(appointment.clientId, {
        type: 'appointment',
        title: 'Appointment Confirmed',
        message: `Your appointment on ${DateTime.fromJSDate(appointment.startTime).toFormat('ff')} has been confirmed.`
      });

      // Email confirmation
      await mailer.sendAppointmentConfirmation(appointment);

      // Schedule reminders
      const reminderTimes = [
        { hours: 24 }, // 24 hours before
        { hours: 2 }   // 2 hours before
      ];

      for (const time of reminderTimes) {
        const reminderDate = DateTime.fromJSDate(appointment.startTime)
          .minus(time)
          .toJSDate();

        await this.scheduleReminder(appointment, reminderDate);
      }
    } catch (error) {
      logger.error('Failed to schedule appointment notifications:', error);
      throw error;
    }
  }

  // Schedule reminder
  async scheduleReminder(appointment, reminderDate) {
    const now = new Date();
    if (reminderDate > now) {
      const delay = reminderDate.getTime() - now.getTime();
      setTimeout(async () => {
        try {
          await notifications.sendInAppNotification(appointment.clientId, {
            type: 'reminder',
            title: 'Appointment Reminder',
            message: `Your appointment is scheduled for ${DateTime.fromJSDate(appointment.startTime).toFormat('ff')}`
          });

          await mailer.sendAppointmentReminder(appointment);
        } catch (error) {
          logger.error('Failed to send reminder:', error);
        }
      }, delay);
    }
  }

  // Setup daily tasks
  setupDailyTasks() {
    const rule = new RRule({
      freq: RRule.DAILY,
      dtstart: new Date(),
      byhour: [0], // Run at midnight
      byminute: [0]
    });

    this.scheduleTask(rule, async () => {
      await this.cleanupOldAppointments();
      await this.sendDailySchedule();
    });
  }

  // Setup weekly tasks
  setupWeeklyTasks() {
    const rule = new RRule({
      freq: RRule.WEEKLY,
      dtstart: new Date(),
      byweekday: [RRule.MO], // Run on Mondays
      byhour: [0],
      byminute: [0]
    });

    this.scheduleTask(rule, async () => {
      await this.generateWeeklyReport();
    });
  }

  // Schedule recurring task
  scheduleTask(rule, task) {
    const now = new Date();
    const nextOccurrence = rule.after(now);
    
    if (nextOccurrence) {
      const delay = nextOccurrence.getTime() - now.getTime();
      setTimeout(() => {
        task();
        this.scheduleTask(rule, task); // Schedule next occurrence
      }, delay);
    }
  }

  // Validate date
  isValidDate(date) {
    const now = DateTime.now();
    const maxDate = now.plus({ days: this.maxAdvanceDays });
    
    return date >= now.startOf('day') && date <= maxDate;
  }

  // Validate time slot
  isValidSlot(slot) {
    return slot.hour >= this.workingHours.start && 
           slot.hour < this.workingHours.end &&
           this.isValidDate(slot);
  }

  // Clean up old appointments
  async cleanupOldAppointments() {
    try {
      const cutoffDate = DateTime.now().minus({ days: 30 }).toJSDate();
      
      await mongoose.model('Appointment').deleteMany({
        startTime: { $lt: cutoffDate },
        status: { $in: ['completed', 'cancelled'] }
      });

      logger.info('Old appointments cleaned up');
    } catch (error) {
      logger.error('Failed to clean up old appointments:', error);
    }
  }
}

// Export singleton instance
module.exports = new SchedulerService();
