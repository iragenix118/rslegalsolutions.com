const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const documents = require('./documents');
const notifications = require('./notifications');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class CaseManagementService {
  constructor() {
    this.caseStatuses = {
      NEW: 'new',
      IN_PROGRESS: 'in_progress',
      PENDING_REVIEW: 'pending_review',
      PENDING_COURT: 'pending_court',
      ON_HOLD: 'on_hold',
      RESOLVED: 'resolved',
      CLOSED: 'closed'
    };

    this.caseTypes = {
      CIVIL: 'civil',
      CRIMINAL: 'criminal',
      CORPORATE: 'corporate',
      FAMILY: 'family',
      PROPERTY: 'property',
      INTELLECTUAL_PROPERTY: 'intellectual_property',
      TAXATION: 'taxation'
    };

    this.priorityLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      URGENT: 'urgent'
    };

    this.initialize();
  }

  // Initialize case management service
  async initialize() {
    try {
      logger.info('Case management service initialized');
    } catch (error) {
      logger.error('Case management service initialization failed:', error);
      throw new ServiceError('Case management service initialization failed', 'cases');
    }
  }

  // Create new case
  async createCase(data) {
    try {
      const caseNumber = await this.generateCaseNumber(data.type);
      
      const newCase = await mongoose.model('Case').create({
        ...data,
        caseNumber,
        status: this.caseStatuses.NEW,
        timeline: [{
          action: 'Case Created',
          description: 'New case file opened',
          performedBy: data.createdBy,
          timestamp: new Date()
        }]
      });

      // Create initial case documents
      await this.createInitialDocuments(newCase);

      // Send notifications
      await this.notifyAssignment(newCase);

      logger.info(`New case created: ${caseNumber}`);
      return newCase;
    } catch (error) {
      logger.error('Failed to create case:', error);
      throw error;
    }
  }

  // Update case
  async updateCase(caseId, updates, userId) {
    try {
      const legalCase = await mongoose.model('Case').findById(caseId);
      if (!legalCase) {
        throw new Error('Case not found');
      }

      // Track changes for timeline
      const changes = this.trackChanges(legalCase, updates);

      // Update case
      Object.assign(legalCase, updates);
      
      // Add timeline entry for changes
      if (changes.length > 0) {
        legalCase.timeline.push({
          action: 'Case Updated',
          description: `Updated: ${changes.join(', ')}`,
          performedBy: userId,
          timestamp: new Date()
        });
      }

      await legalCase.save();

      // Send notifications if status changed
      if (updates.status && updates.status !== legalCase.status) {
        await this.notifyStatusChange(legalCase, updates.status);
      }

      logger.info(`Case updated: ${legalCase.caseNumber}`);
      return legalCase;
    } catch (error) {
      logger.error('Failed to update case:', error);
      throw error;
    }
  }

  // Add case note
  async addCaseNote(caseId, note) {
    try {
      const legalCase = await mongoose.model('Case').findById(caseId);
      if (!legalCase) {
        throw new Error('Case not found');
      }

      legalCase.notes.push({
        ...note,
        timestamp: new Date()
      });

      legalCase.timeline.push({
        action: 'Note Added',
        description: note.title,
        performedBy: note.createdBy,
        timestamp: new Date()
      });

      await legalCase.save();

      // Notify relevant parties if note is important
      if (note.important) {
        await this.notifyImportantNote(legalCase, note);
      }

      return legalCase;
    } catch (error) {
      logger.error('Failed to add case note:', error);
      throw error;
    }
  }

  // Add hearing details
  async addHearing(caseId, hearingDetails) {
    try {
      const legalCase = await mongoose.model('Case').findById(caseId);
      if (!legalCase) {
        throw new Error('Case not found');
      }

      legalCase.hearings.push({
        ...hearingDetails,
        status: 'scheduled'
      });

      legalCase.timeline.push({
        action: 'Hearing Scheduled',
        description: `Hearing scheduled for ${hearingDetails.date}`,
        performedBy: hearingDetails.scheduledBy,
        timestamp: new Date()
      });

      await legalCase.save();

      // Schedule notifications
      await this.scheduleHearingNotifications(legalCase, hearingDetails);

      return legalCase;
    } catch (error) {
      logger.error('Failed to add hearing:', error);
      throw error;
    }
  }

  // Update hearing details
  async updateHearing(caseId, hearingId, updates) {
    try {
      const legalCase = await mongoose.model('Case').findById(caseId);
      if (!legalCase) {
        throw new Error('Case not found');
      }

      const hearing = legalCase.hearings.id(hearingId);
      if (!hearing) {
        throw new Error('Hearing not found');
      }

      Object.assign(hearing, updates);

      legalCase.timeline.push({
        action: 'Hearing Updated',
        description: `Hearing details updated for ${hearing.date}`,
        performedBy: updates.updatedBy,
        timestamp: new Date()
      });

      await legalCase.save();

      // Update notifications
      await this.updateHearingNotifications(legalCase, hearing);

      return legalCase;
    } catch (error) {
      logger.error('Failed to update hearing:', error);
      throw error;
    }
  }

  // Add document to case
  async addDocument(caseId, document) {
    try {
      const legalCase = await mongoose.model('Case').findById(caseId);
      if (!legalCase) {
        throw new Error('Case not found');
      }

      legalCase.documents.push(document);

      legalCase.timeline.push({
        action: 'Document Added',
        description: document.title,
        performedBy: document.uploadedBy,
        timestamp: new Date()
      });

      await legalCase.save();

      // Notify relevant parties about new document
      await this.notifyNewDocument(legalCase, document);

      return legalCase;
    } catch (error) {
      logger.error('Failed to add document:', error);
      throw error;
    }
  }

  // Generate case summary
  async generateCaseSummary(caseId) {
    try {
      const legalCase = await mongoose.model('Case')
        .findById(caseId)
        .populate('client', 'name')
        .populate('assignedLawyer', 'name')
        .populate('documents')
        .lean();

      if (!legalCase) {
        throw new Error('Case not found');
      }

      const summary = {
        caseInfo: {
          caseNumber: legalCase.caseNumber,
          title: legalCase.title,
          type: legalCase.type,
          status: legalCase.status,
          priority: legalCase.priority,
          client: legalCase.client.name,
          lawyer: legalCase.assignedLawyer.name,
          openedDate: legalCase.createdAt
        },
        statistics: {
          daysOpen: DateTime.fromJSDate(legalCase.createdAt).diffNow('days').days,
          documentsCount: legalCase.documents.length,
          hearingsCount: legalCase.hearings.length,
          notesCount: legalCase.notes.length
        },
        recentActivity: legalCase.timeline
          .slice(-5)
          .map(entry => ({
            action: entry.action,
            description: entry.description,
            date: entry.timestamp
          })),
        upcomingHearings: legalCase.hearings
          .filter(h => new Date(h.date) > new Date())
          .sort((a, b) => new Date(a.date) - new Date(b.date))
      };

      return summary;
    } catch (error) {
      logger.error('Failed to generate case summary:', error);
      throw error;
    }
  }

  // Generate case report
  async generateCaseReport(caseId) {
    try {
      const legalCase = await mongoose.model('Case')
        .findById(caseId)
        .populate('client')
        .populate('assignedLawyer')
        .populate('documents')
        .lean();

      if (!legalCase) {
        throw new Error('Case not found');
      }

      const report = await documents.generateDocument('case-report', {
        case: legalCase,
        generatedAt: new Date(),
        timeline: legalCase.timeline,
        statistics: await this.calculateCaseStatistics(legalCase)
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate case report:', error);
      throw error;
    }
  }

  // Helper: Generate case number
  async generateCaseNumber(type) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Case').countDocuments({
      type,
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    });

    return `${type.toUpperCase()}-${year}-${(count + 1).toString().padStart(4, '0')}`;
  }

  // Helper: Track changes
  trackChanges(original, updates) {
    return Object.keys(updates)
      .filter(key => updates[key] !== original[key])
      .map(key => `${key}: ${original[key]} → ${updates[key]}`);
  }

  // Helper: Calculate case statistics
  async calculateCaseStatistics(legalCase) {
    return {
      duration: DateTime.fromJSDate(legalCase.createdAt).diffNow('days').days,
      documentsCount: legalCase.documents.length,
      hearingsCount: legalCase.hearings.length,
      completedHearings: legalCase.hearings.filter(h => h.status === 'completed').length,
      notesCount: legalCase.notes.length,
      lastUpdated: legalCase.updatedAt
    };
  }

  // Helper: Create initial documents
  async createInitialDocuments(legalCase) {
    // Implementation depends on document templates
  }

  // Helper: Schedule hearing notifications
  async scheduleHearingNotifications(legalCase, hearing) {
    const notifications = [
      { days: 7, message: '7 days until hearing' },
      { days: 1, message: '1 day until hearing' },
      { hours: 2, message: '2 hours until hearing' }
    ];

    for (const notification of notifications) {
      const notificationDate = DateTime.fromJSDate(hearing.date)
        .minus(notification)
        .toJSDate();

      if (notificationDate > new Date()) {
        await this.scheduleNotification(
          legalCase,
          notificationDate,
          notification.message
        );
      }
    }
  }

  // Helper: Schedule notification
  async scheduleNotification(legalCase, date, message) {
    // Implementation depends on notification system
  }
}

// Export singleton instance
module.exports = new CaseManagementService();
