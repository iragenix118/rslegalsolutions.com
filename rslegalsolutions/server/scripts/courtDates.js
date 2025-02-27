const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const notifications = require('./notifications');
const calendar = require('./calendar');
const documents = require('./documents');
const { ServiceError } = require('./errors');
require('dotenv').config();

class CourtDateService {
  constructor() {
    this.hearingTypes = {
      FIRST_HEARING: 'first_hearing',
      EVIDENCE: 'evidence',
      ARGUMENTS: 'arguments',
      JUDGMENT: 'judgment',
      INTERIM_ORDER: 'interim_order',
      MEDIATION: 'mediation',
      MISCELLANEOUS: 'miscellaneous'
    };

    this.hearingStatus = {
      SCHEDULED: 'scheduled',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      ADJOURNED: 'adjourned',
      CANCELLED: 'cancelled'
    };

    this.courtTypes = {
      SUPREME_COURT: 'supreme_court',
      HIGH_COURT: 'high_court',
      DISTRICT_COURT: 'district_court',
      TRIBUNAL: 'tribunal'
    };

    this.initialize();
  }

  // Initialize court date service
  async initialize() {
    try {
      await this.setupReminders();
      logger.info('Court date service initialized');
    } catch (error) {
      logger.error('Court date service initialization failed:', error);
      throw new ServiceError('Court date service initialization failed', 'court_dates');
    }
  }

  // Schedule hearing
  async scheduleHearing(data) {
    try {
      const hearing = await mongoose.model('Hearing').create({
        ...data,
        status: this.hearingStatus.SCHEDULED,
        timeline: [{
          action: 'Hearing Scheduled',
          description: 'New hearing scheduled',
          performedBy: data.createdBy,
          timestamp: new Date()
        }]
      });

      // Create calendar event
      await this.createCalendarEvent(hearing);

      // Schedule reminders
      await this.scheduleHearingReminders(hearing);

      // Generate preparation checklist
      await this.generatePreparationChecklist(hearing);

      // Notify relevant parties
      await this.notifyHearingScheduled(hearing);

      return hearing;
    } catch (error) {
      logger.error('Failed to schedule hearing:', error);
      throw error;
    }
  }

  // Update hearing
  async updateHearing(hearingId, updates, userId) {
    try {
      const hearing = await mongoose.model('Hearing').findById(hearingId);
      if (!hearing) {
        throw new Error('Hearing not found');
      }

      // Track changes
      const changes = this.trackChanges(hearing, updates);

      // Update hearing
      Object.assign(hearing, updates);

      // Add timeline entry
      if (changes.length > 0) {
        hearing.timeline.push({
          action: 'Hearing Updated',
          description: `Updated: ${changes.join(', ')}`,
          performedBy: userId,
          timestamp: new Date()
        });
      }

      await hearing.save();

      // Update calendar event
      await this.updateCalendarEvent(hearing);

      // Update reminders if date changed
      if (updates.date) {
        await this.updateHearingReminders(hearing);
      }

      // Notify about updates
      await this.notifyHearingUpdated(hearing, changes);

      return hearing;
    } catch (error) {
      logger.error('Failed to update hearing:', error);
      throw error;
    }
  }

  // Record hearing outcome
  async recordHearingOutcome(hearingId, outcome) {
    try {
      const hearing = await mongoose.model('Hearing').findById(hearingId);
      if (!hearing) {
        throw new Error('Hearing not found');
      }

      hearing.outcome = outcome;
      hearing.status = this.hearingStatus.COMPLETED;
      hearing.completedAt = new Date();

      hearing.timeline.push({
        action: 'Hearing Completed',
        description: 'Hearing outcome recorded',
        performedBy: outcome.recordedBy,
        timestamp: new Date()
      });

      await hearing.save();

      // Generate outcome document
      await this.generateOutcomeDocument(hearing);

      // Update case status if needed
      await this.updateCaseStatus(hearing.caseId, outcome);

      // Schedule next steps
      await this.scheduleNextSteps(hearing, outcome);

      return hearing;
    } catch (error) {
      logger.error('Failed to record hearing outcome:', error);
      throw error;
    }
  }

  // Get upcoming hearings
  async getUpcomingHearings(filters = {}) {
    try {
      const {
        startDate = new Date(),
        endDate,
        lawyer,
        court,
        status
      } = filters;

      const query = {
        date: { $gte: startDate },
        status: status || { $ne: this.hearingStatus.CANCELLED }
      };

      if (endDate) query.date.$lte = endDate;
      if (lawyer) query.assignedLawyer = lawyer;
      if (court) query.court = court;

      const hearings = await mongoose.model('Hearing')
        .find(query)
        .populate('caseId', 'title number')
        .populate('assignedLawyer', 'name email')
        .sort('date')
        .lean();

      return hearings;
    } catch (error) {
      logger.error('Failed to get upcoming hearings:', error);
      throw error;
    }
  }

  // Generate preparation checklist
  async generatePreparationChecklist(hearing) {
    try {
      const checklist = {
        documents: await this.getRequiredDocuments(hearing),
        tasks: await this.getPreparationTasks(hearing),
        deadlines: this.calculatePreparationDeadlines(hearing),
        contacts: await this.getRelevantContacts(hearing)
      };

      hearing.preparationChecklist = checklist;
      await hearing.save();

      // Create tasks for preparation items
      await this.createPreparationTasks(hearing, checklist);

      return checklist;
    } catch (error) {
      logger.error('Failed to generate preparation checklist:', error);
      throw error;
    }
  }

  // Schedule hearing reminders
  async scheduleHearingReminders(hearing) {
    try {
      const reminders = [
        { days: 7, message: '7 days until hearing' },
        { days: 3, message: '3 days until hearing' },
        { days: 1, message: '1 day until hearing' },
        { hours: 2, message: '2 hours until hearing' }
      ];

      for (const reminder of reminders) {
        const reminderDate = DateTime.fromJSDate(hearing.date)
          .minus(reminder.days ? { days: reminder.days } : { hours: reminder.hours })
          .toJSDate();

        if (reminderDate > new Date()) {
          await notifications.scheduleNotification({
            type: 'hearing_reminder',
            recipients: await this.getHearingParticipants(hearing),
            title: 'Hearing Reminder',
            message: reminder.message,
            data: {
              hearingId: hearing._id,
              caseId: hearing.caseId
            },
            scheduledFor: reminderDate
          });
        }
      }
    } catch (error) {
      logger.error('Failed to schedule hearing reminders:', error);
      throw error;
    }
  }

  // Generate outcome document
  async generateOutcomeDocument(hearing) {
    try {
      const template = await this.getOutcomeTemplate(hearing.type);
      const document = await documents.generateDocument('hearing-outcome', {
        template,
        hearing,
        case: await mongoose.model('Case').findById(hearing.caseId),
        outcome: hearing.outcome
      });

      hearing.outcomeDocument = document._id;
      await hearing.save();

      return document;
    } catch (error) {
      logger.error('Failed to generate outcome document:', error);
      throw error;
    }
  }

  // Get hearing statistics
  async getHearingStatistics(filters = {}) {
    try {
      const stats = {
        total: await mongoose.model('Hearing').countDocuments(filters),
        byStatus: await this.getHearingsByStatus(filters),
        byType: await this.getHearingsByType(filters),
        completionRate: await this.calculateCompletionRate(filters),
        averageDuration: await this.calculateAverageDuration(filters),
        adjournmentRate: await this.calculateAdjournmentRate(filters)
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get hearing statistics:', error);
      throw error;
    }
  }

  // Helper: Track changes
  trackChanges(original, updates) {
    return Object.keys(updates)
      .filter(key => updates[key] !== original[key])
      .map(key => `${key}: ${original[key]} → ${updates[key]}`);
  }

  // Helper: Get required documents
  async getRequiredDocuments(hearing) {
    const documentTypes = {
      [this.hearingTypes.FIRST_HEARING]: [
        'Petition/Complaint',
        'Power of Attorney',
        'Supporting Documents'
      ],
      [this.hearingTypes.EVIDENCE]: [
        'Evidence Documents',
        'Witness Statements',
        'Expert Reports'
      ],
      [this.hearingTypes.ARGUMENTS]: [
        'Written Arguments',
        'Case Law Citations',
        'Previous Orders'
      ]
    };

    return documentTypes[hearing.type] || [];
  }

  // Helper: Calculate preparation deadlines
  calculatePreparationDeadlines(hearing) {
    const hearingDate = DateTime.fromJSDate(hearing.date);
    
    return {
      documentPreparation: hearingDate.minus({ days: 7 }).toJSDate(),
      clientBriefing: hearingDate.minus({ days: 3 }).toJSDate(),
      finalReview: hearingDate.minus({ days: 1 }).toJSDate()
    };
  }

  // Helper: Get hearing participants
  async getHearingParticipants(hearing) {
    const case_ = await mongoose.model('Case').findById(hearing.caseId)
      .populate('client')
      .populate('assignedLawyer');

    return [
      case_.client.email,
      case_.assignedLawyer.email,
      ...hearing.additionalParticipants || []
    ];
  }

  // Helper: Create calendar event
  async createCalendarEvent(hearing) {
    return await calendar.createEvent({
      title: `Hearing: ${hearing.type} - Case ${hearing.caseNumber}`,
      description: hearing.description,
      startTime: hearing.date,
      endTime: DateTime.fromJSDate(hearing.date).plus({ hours: 2 }).toJSDate(),
      location: hearing.court,
      attendees: await this.getHearingParticipants(hearing)
    });
  }
}

// Export singleton instance
module.exports = new CourtDateService();
