const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const mailer = require('./mailer');
const notifications = require('./notifications');
const analytics = require('./analytics');
const { ServiceError } = require('./errors');
require('dotenv').config();

class CRMService {
  constructor() {
    this.clientStatuses = {
      ACTIVE: 'active',
      INACTIVE: 'inactive',
      POTENTIAL: 'potential',
      VIP: 'vip',
      BLOCKED: 'blocked'
    };

    this.interactionTypes = {
      MEETING: 'meeting',
      CALL: 'call',
      EMAIL: 'email',
      DOCUMENT: 'document',
      PAYMENT: 'payment',
      FEEDBACK: 'feedback',
      OTHER: 'other'
    };

    this.leadSources = {
      WEBSITE: 'website',
      REFERRAL: 'referral',
      SOCIAL_MEDIA: 'social_media',
      ADVERTISEMENT: 'advertisement',
      DIRECT: 'direct',
      OTHER: 'other'
    };

    this.initialize();
  }

  // Initialize CRM service
  async initialize() {
    try {
      await this.setupAutomatedWorkflows();
      logger.info('CRM service initialized');
    } catch (error) {
      logger.error('CRM service initialization failed:', error);
      throw new ServiceError('CRM service initialization failed', 'crm');
    }
  }

  // Create new client
  async createClient(data) {
    try {
      const client = await mongoose.model('Client').create({
        ...data,
        status: this.clientStatuses.ACTIVE,
        timeline: [{
          action: 'Client Created',
          description: 'New client profile created',
          performedBy: data.createdBy,
          timestamp: new Date()
        }]
      });

      // Send welcome email
      await this.sendWelcomeEmail(client);

      // Create client folder structure
      await this.createClientFolderStructure(client);

      // Schedule follow-up tasks
      await this.scheduleInitialFollowUp(client);

      return client;
    } catch (error) {
      logger.error('Failed to create client:', error);
      throw error;
    }
  }

  // Update client
  async updateClient(clientId, updates, userId) {
    try {
      const client = await mongoose.model('Client').findById(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      // Track changes
      const changes = this.trackChanges(client, updates);

      // Update client
      Object.assign(client, updates);

      // Add timeline entry
      if (changes.length > 0) {
        client.timeline.push({
          action: 'Client Updated',
          description: `Updated: ${changes.join(', ')}`,
          performedBy: userId,
          timestamp: new Date()
        });
      }

      await client.save();

      // Handle status change
      if (updates.status && updates.status !== client.status) {
        await this.handleStatusChange(client, updates.status);
      }

      return client;
    } catch (error) {
      logger.error('Failed to update client:', error);
      throw error;
    }
  }

  // Log client interaction
  async logInteraction(clientId, interaction) {
    try {
      const client = await mongoose.model('Client').findById(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      client.interactions.push({
        ...interaction,
        timestamp: new Date()
      });

      client.timeline.push({
        action: 'Interaction Logged',
        description: `${interaction.type}: ${interaction.summary}`,
        performedBy: interaction.loggedBy,
        timestamp: new Date()
      });

      await client.save();

      // Update client engagement score
      await this.updateEngagementScore(client);

      // Schedule follow-up if needed
      if (interaction.requiresFollowUp) {
        await this.scheduleFollowUp(client, interaction);
      }

      return client;
    } catch (error) {
      logger.error('Failed to log interaction:', error);
      throw error;
    }
  }

  // Add client note
  async addNote(clientId, note) {
    try {
      const client = await mongoose.model('Client').findById(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      client.notes.push({
        ...note,
        timestamp: new Date()
      });

      client.timeline.push({
        action: 'Note Added',
        description: note.title,
        performedBy: note.createdBy,
        timestamp: new Date()
      });

      await client.save();

      // Notify relevant team members if important
      if (note.important) {
        await this.notifyImportantNote(client, note);
      }

      return client;
    } catch (error) {
      logger.error('Failed to add note:', error);
      throw error;
    }
  }

  // Get client overview
  async getClientOverview(clientId) {
    try {
      const client = await mongoose.model('Client')
        .findById(clientId)
        .populate('cases')
        .populate('appointments')
        .populate('documents')
        .lean();

      if (!client) {
        throw new Error('Client not found');
      }

      return {
        profile: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          status: client.status,
          engagementScore: client.engagementScore,
          createdAt: client.createdAt
        },
        statistics: {
          totalCases: client.cases.length,
          activeCases: client.cases.filter(c => c.status === 'active').length,
          totalAppointments: client.appointments.length,
          upcomingAppointments: client.appointments.filter(a => 
            new Date(a.date) > new Date()
          ).length,
          totalDocuments: client.documents.length
        },
        recentActivity: client.timeline
          .slice(-5)
          .map(entry => ({
            action: entry.action,
            description: entry.description,
            date: entry.timestamp
          })),
        upcomingEvents: await this.getUpcomingEvents(client)
      };
    } catch (error) {
      logger.error('Failed to get client overview:', error);
      throw error;
    }
  }

  // Generate client report
  async generateClientReport(clientId, options = {}) {
    try {
      const client = await mongoose.model('Client')
        .findById(clientId)
        .populate('cases')
        .populate('appointments')
        .populate('documents')
        .populate('interactions')
        .lean();

      if (!client) {
        throw new Error('Client not found');
      }

      const report = {
        clientInfo: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          status: client.status,
          createdAt: client.createdAt
        },
        casesSummary: this.summarizeCases(client.cases),
        appointmentsSummary: this.summarizeAppointments(client.appointments),
        interactionsSummary: this.summarizeInteractions(client.interactions),
        financialSummary: await this.getFinancialSummary(client),
        timeline: client.timeline
      };

      if (options.format === 'pdf') {
        return await this.generatePDFReport(report);
      }

      return report;
    } catch (error) {
      logger.error('Failed to generate client report:', error);
      throw error;
    }
  }

  // Calculate client engagement score
  async updateEngagementScore(client) {
    try {
      const weights = {
        MEETING: 10,
        CALL: 5,
        EMAIL: 3,
        DOCUMENT: 4,
        PAYMENT: 8,
        FEEDBACK: 6
      };

      const recentInteractions = client.interactions.filter(interaction => 
        DateTime.fromJSDate(interaction.timestamp) > DateTime.now().minus({ months: 3 })
      );

      const score = recentInteractions.reduce((total, interaction) => 
        total + (weights[interaction.type] || 1), 0);

      client.engagementScore = score;
      await client.save();

      return score;
    } catch (error) {
      logger.error('Failed to update engagement score:', error);
      throw error;
    }
  }

  // Setup automated workflows
  async setupAutomatedWorkflows() {
    // Setup client review reminders
    await this.setupClientReviewReminders();

    // Setup engagement monitoring
    await this.setupEngagementMonitoring();

    // Setup feedback collection
    await this.setupFeedbackCollection();
  }

  // Helper: Track changes
  trackChanges(original, updates) {
    return Object.keys(updates)
      .filter(key => updates[key] !== original[key])
      .map(key => `${key}: ${original[key]} → ${updates[key]}`);
  }

  // Helper: Handle status change
  async handleStatusChange(client, newStatus) {
    const statusActions = {
      [this.clientStatuses.VIP]: async () => {
        await this.handleVIPStatusChange(client);
      },
      [this.clientStatuses.INACTIVE]: async () => {
        await this.handleInactiveStatusChange(client);
      },
      [this.clientStatuses.BLOCKED]: async () => {
        await this.handleBlockedStatusChange(client);
      }
    };

    if (statusActions[newStatus]) {
      await statusActions[newStatus]();
    }
  }

  // Helper: Get upcoming events
  async getUpcomingEvents(client) {
    const now = new Date();
    const thirtyDaysFromNow = DateTime.now().plus({ days: 30 }).toJSDate();

    return [
      ...await this.getUpcomingAppointments(client._id, now, thirtyDaysFromNow),
      ...await this.getUpcomingHearings(client._id, now, thirtyDaysFromNow),
      ...await this.getUpcomingDeadlines(client._id, now, thirtyDaysFromNow)
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Helper: Summarize cases
  summarizeCases(cases) {
    return {
      total: cases.length,
      active: cases.filter(c => c.status === 'active').length,
      closed: cases.filter(c => c.status === 'closed').length,
      byType: this.groupByKey(cases, 'type'),
      recentUpdates: cases
        .filter(c => c.status === 'active')
        .slice(0, 5)
        .map(c => ({
          caseNumber: c.caseNumber,
          title: c.title,
          lastUpdate: c.updatedAt
        }))
    };
  }

  // Helper: Group by key
  groupByKey(array, key) {
    return array.reduce((result, item) => {
      const value = key.split('.').reduce((obj, k) => obj[k], item);
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }
}

// Export singleton instance
module.exports = new CRMService();
