const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const notifications = require('./notifications');
const calendar = require('./calendar');
const { ServiceError } = require('./errors');
require('dotenv').config();

class ResourceManagementService {
  constructor() {
    this.resourceTypes = {
      LAWYER: 'lawyer',
      MEETING_ROOM: 'meeting_room',
      CONFERENCE_ROOM: 'conference_room',
      EQUIPMENT: 'equipment'
    };

    this.availabilityStatus = {
      AVAILABLE: 'available',
      BUSY: 'busy',
      OUT_OF_OFFICE: 'out_of_office',
      MAINTENANCE: 'maintenance',
      RESERVED: 'reserved'
    };

    this.bookingStatus = {
      PENDING: 'pending',
      CONFIRMED: 'confirmed',
      CANCELLED: 'cancelled',
      COMPLETED: 'completed'
    };

    this.initialize();
  }

  // Initialize resource management service
  async initialize() {
    try {
      await this.setupResourceAvailability();
      logger.info('Resource management service initialized');
    } catch (error) {
      logger.error('Resource management service initialization failed:', error);
      throw new ServiceError('Resource management service initialization failed', 'resources');
    }
  }

  // Check resource availability
  async checkAvailability(resourceId, startTime, endTime) {
    try {
      const resource = await mongoose.model('Resource').findById(resourceId);
      if (!resource) {
        throw new Error('Resource not found');
      }

      // Check if resource is available during the time period
      const conflicts = await mongoose.model('ResourceBooking').find({
        resourceId,
        status: { $in: ['confirmed', 'pending'] },
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime }
          }
        ]
      });

      // Check resource schedule
      const scheduleConflict = await this.checkScheduleConflict(
        resource,
        startTime,
        endTime
      );

      return {
        available: conflicts.length === 0 && !scheduleConflict,
        conflicts,
        scheduleConflict
      };
    } catch (error) {
      logger.error('Failed to check resource availability:', error);
      throw error;
    }
  }

  // Book resource
  async bookResource(data) {
    try {
      const { resourceId, startTime, endTime, userId, purpose } = data;

      // Check availability
      const availability = await this.checkAvailability(resourceId, startTime, endTime);
      if (!availability.available) {
        throw new Error('Resource not available for the requested time period');
      }

      // Create booking
      const booking = await mongoose.model('ResourceBooking').create({
        resourceId,
        userId,
        startTime,
        endTime,
        purpose,
        status: this.bookingStatus.CONFIRMED
      });

      // Update resource status
      await this.updateResourceStatus(resourceId, this.availabilityStatus.RESERVED);

      // Create calendar event
      await this.createBookingEvent(booking);

      // Send notifications
      await this.notifyBookingConfirmation(booking);

      return booking;
    } catch (error) {
      logger.error('Failed to book resource:', error);
      throw error;
    }
  }

  // Cancel booking
  async cancelBooking(bookingId, reason) {
    try {
      const booking = await mongoose.model('ResourceBooking').findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      booking.status = this.bookingStatus.CANCELLED;
      booking.cancellationReason = reason;
      booking.cancelledAt = new Date();
      await booking.save();

      // Update resource status
      await this.updateResourceStatus(booking.resourceId, this.availabilityStatus.AVAILABLE);

      // Cancel calendar event
      await this.cancelBookingEvent(booking);

      // Send notifications
      await this.notifyBookingCancellation(booking);

      return booking;
    } catch (error) {
      logger.error('Failed to cancel booking:', error);
      throw error;
    }
  }

  // Get resource schedule
  async getResourceSchedule(resourceId, startDate, endDate) {
    try {
      const bookings = await mongoose.model('ResourceBooking')
        .find({
          resourceId,
          startTime: { $gte: startDate },
          endTime: { $lte: endDate },
          status: { $ne: this.bookingStatus.CANCELLED }
        })
        .populate('userId', 'name email')
        .sort('startTime')
        .lean();

      const resource = await mongoose.model('Resource').findById(resourceId);
      const schedule = {
        resource,
        bookings,
        availability: await this.calculateAvailability(resource, bookings, startDate, endDate)
      };

      return schedule;
    } catch (error) {
      logger.error('Failed to get resource schedule:', error);
      throw error;
    }
  }

  // Update resource availability
  async updateResourceAvailability(resourceId, schedule) {
    try {
      const resource = await mongoose.model('Resource').findById(resourceId);
      if (!resource) {
        throw new Error('Resource not found');
      }

      resource.availability = schedule;
      await resource.save();

      // Update any affected bookings
      await this.updateAffectedBookings(resource);

      return resource;
    } catch (error) {
      logger.error('Failed to update resource availability:', error);
      throw error;
    }
  }

  // Find available resources
  async findAvailableResources(criteria) {
    try {
      const {
        type,
        startTime,
        endTime,
        capacity,
        features = []
      } = criteria;

      // Find resources matching basic criteria
      const resources = await mongoose.model('Resource').find({
        type,
        capacity: { $gte: capacity || 0 },
        features: { $all: features },
        status: this.availabilityStatus.AVAILABLE
      });

      // Check availability for each resource
      const availableResources = [];
      for (const resource of resources) {
        const availability = await this.checkAvailability(
          resource._id,
          startTime,
          endTime
        );
        if (availability.available) {
          availableResources.push(resource);
        }
      }

      return availableResources;
    } catch (error) {
      logger.error('Failed to find available resources:', error);
      throw error;
    }
  }

  // Get lawyer schedule
  async getLawyerSchedule(lawyerId, date) {
    try {
      const startOfDay = DateTime.fromJSDate(date).startOf('day').toJSDate();
      const endOfDay = DateTime.fromJSDate(date).endOf('day').toJSDate();

      const [bookings, appointments, hearings] = await Promise.all([
        mongoose.model('ResourceBooking').find({
          resourceId: lawyerId,
          startTime: { $gte: startOfDay, $lte: endOfDay },
          status: { $ne: this.bookingStatus.CANCELLED }
        }),
        mongoose.model('Appointment').find({
          lawyerId,
          startTime: { $gte: startOfDay, $lte: endOfDay },
          status: { $ne: 'cancelled' }
        }),
        mongoose.model('Hearing').find({
          lawyerId,
          date: { $gte: startOfDay, $lte: endOfDay }
        })
      ]);

      return {
        bookings,
        appointments,
        hearings,
        availability: await this.calculateLawyerAvailability(
          lawyerId,
          date,
          bookings,
          appointments,
          hearings
        )
      };
    } catch (error) {
      logger.error('Failed to get lawyer schedule:', error);
      throw error;
    }
  }

  // Calculate resource utilization
  async calculateUtilization(resourceId, startDate, endDate) {
    try {
      const bookings = await mongoose.model('ResourceBooking').find({
        resourceId,
        startTime: { $gte: startDate },
        endTime: { $lte: endDate },
        status: this.bookingStatus.COMPLETED
      });

      const totalMinutes = DateTime.fromJSDate(endDate)
        .diff(DateTime.fromJSDate(startDate))
        .as('minutes');

      const usedMinutes = bookings.reduce((total, booking) => {
        const duration = DateTime.fromJSDate(booking.endTime)
          .diff(DateTime.fromJSDate(booking.startTime))
          .as('minutes');
        return total + duration;
      }, 0);

      return {
        utilization: (usedMinutes / totalMinutes) * 100,
        totalBookings: bookings.length,
        totalHours: usedMinutes / 60
      };
    } catch (error) {
      logger.error('Failed to calculate resource utilization:', error);
      throw error;
    }
  }

  // Helper: Check schedule conflict
  async checkScheduleConflict(resource, startTime, endTime) {
    const startDateTime = DateTime.fromJSDate(startTime);
    const endDateTime = DateTime.fromJSDate(endTime);

    // Check if time is within resource's available hours
    const startTimeOfDay = startDateTime.toFormat('HH:mm');
    const endTimeOfDay = endDateTime.toFormat('HH:mm');

    return !resource.availability.some(slot => 
      slot.startTime <= startTimeOfDay &&
      slot.endTime >= endTimeOfDay &&
      slot.days.includes(startDateTime.weekday)
    );
  }

  // Helper: Create booking event
  async createBookingEvent(booking) {
    try {
      const resource = await mongoose.model('Resource').findById(booking.resourceId);
      const user = await mongoose.model('User').findById(booking.userId);

      await calendar.createEvent({
        title: `${resource.name} - ${booking.purpose}`,
        description: `Resource booking for ${resource.name}\nBooked by: ${user.name}`,
        startTime: booking.startTime,
        endTime: booking.endTime,
        location: resource.location,
        attendees: [user.email]
      });
    } catch (error) {
      logger.error('Failed to create booking event:', error);
    }
  }

  // Helper: Calculate lawyer availability
  async calculateLawyerAvailability(lawyerId, date, bookings, appointments, hearings) {
    const lawyer = await mongoose.model('User').findById(lawyerId);
    const workingHours = lawyer.workingHours || {
      start: '09:00',
      end: '17:00'
    };

    const slots = this.generateTimeSlots(date, workingHours);
    
    return slots.map(slot => ({
      ...slot,
      available: !this.hasConflict(slot, bookings, appointments, hearings)
    }));
  }

  // Helper: Generate time slots
  generateTimeSlots(date, workingHours, duration = 30) {
    const slots = [];
    let currentTime = DateTime.fromJSDate(date)
      .set({
        hour: parseInt(workingHours.start.split(':')[0]),
        minute: parseInt(workingHours.start.split(':')[1])
      });

    const endTime = DateTime.fromJSDate(date)
      .set({
        hour: parseInt(workingHours.end.split(':')[0]),
        minute: parseInt(workingHours.end.split(':')[1])
      });

    while (currentTime < endTime) {
      slots.push({
        startTime: currentTime.toJSDate(),
        endTime: currentTime.plus({ minutes: duration }).toJSDate()
      });
      currentTime = currentTime.plus({ minutes: duration });
    }

    return slots;
  }

  // Helper: Check for conflicts
  hasConflict(slot, bookings, appointments, hearings) {
    const slotStart = DateTime.fromJSDate(slot.startTime);
    const slotEnd = DateTime.fromJSDate(slot.endTime);

    return bookings.some(booking => this.isOverlapping(slotStart, slotEnd, booking)) ||
           appointments.some(apt => this.isOverlapping(slotStart, slotEnd, apt)) ||
           hearings.some(hearing => this.isOverlapping(slotStart, slotEnd, hearing));
  }

  // Helper: Check time overlap
  isOverlapping(start, end, event) {
    const eventStart = DateTime.fromJSDate(event.startTime || event.date);
    const eventEnd = DateTime.fromJSDate(event.endTime || event.date);
    return start < eventEnd && end > eventStart;
  }
}

// Export singleton instance
module.exports = new ResourceManagementService();
