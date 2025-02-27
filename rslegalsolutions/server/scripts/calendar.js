const { google } = require('googleapis');
const { Client } = require('@microsoft/microsoft-graph-client');
const ical = require('ical-generator');
const logger = require('./logger');
const cache = require('./cache');
const { ServiceError } = require('./errors');
require('dotenv').config();

class CalendarService {
  constructor() {
    this.providers = {
      GOOGLE: 'google',
      OUTLOOK: 'outlook',
      ICAL: 'ical'
    };

    this.eventTypes = {
      APPOINTMENT: 'appointment',
      HEARING: 'hearing',
      MEETING: 'meeting',
      DEADLINE: 'deadline',
      REMINDER: 'reminder'
    };

    this.initialize();
  }

  // Initialize calendar service
  async initialize() {
    try {
      await this.initializeGoogleCalendar();
      await this.initializeOutlookCalendar();
      logger.info('Calendar service initialized');
    } catch (error) {
      logger.error('Calendar service initialization failed:', error);
      throw new ServiceError('Calendar service initialization failed', 'calendar');
    }
  }

  // Initialize Google Calendar
  async initializeGoogleCalendar() {
    try {
      this.googleAuth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      this.googleCalendar = google.calendar({
        version: 'v3',
        auth: this.googleAuth
      });
    } catch (error) {
      logger.error('Failed to initialize Google Calendar:', error);
      throw error;
    }
  }

  // Initialize Outlook Calendar
  async initializeOutlookCalendar() {
    try {
      this.outlookClient = Client.init({
        authProvider: (done) => {
          done(null, process.env.OUTLOOK_ACCESS_TOKEN);
        }
      });
    } catch (error) {
      logger.error('Failed to initialize Outlook Calendar:', error);
      throw error;
    }
  }

  // Create calendar event
  async createEvent(data, provider = this.providers.GOOGLE) {
    try {
      switch (provider) {
        case this.providers.GOOGLE:
          return await this.createGoogleEvent(data);
        case this.providers.OUTLOOK:
          return await this.createOutlookEvent(data);
        case this.providers.ICAL:
          return await this.createICalEvent(data);
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      logger.error('Failed to create calendar event:', error);
      throw error;
    }
  }

  // Create Google Calendar event
  async createGoogleEvent(data) {
    try {
      const event = {
        summary: data.title,
        location: data.location,
        description: data.description,
        start: {
          dateTime: data.startTime,
          timeZone: data.timeZone || 'Asia/Kolkata'
        },
        end: {
          dateTime: data.endTime,
          timeZone: data.timeZone || 'Asia/Kolkata'
        },
        attendees: data.attendees?.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 }
          ]
        }
      };

      const response = await this.googleCalendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all'
      });

      return {
        id: response.data.id,
        provider: this.providers.GOOGLE,
        eventUrl: response.data.htmlLink
      };
    } catch (error) {
      logger.error('Failed to create Google Calendar event:', error);
      throw error;
    }
  }

  // Create Outlook Calendar event
  async createOutlookEvent(data) {
    try {
      const event = {
        subject: data.title,
        location: {
          displayName: data.location
        },
        body: {
          contentType: 'HTML',
          content: data.description
        },
        start: {
          dateTime: data.startTime,
          timeZone: data.timeZone || 'Asia/Kolkata'
        },
        end: {
          dateTime: data.endTime,
          timeZone: data.timeZone || 'Asia/Kolkata'
        },
        attendees: data.attendees?.map(email => ({
          emailAddress: {
            address: email
          },
          type: 'required'
        }))
      };

      const response = await this.outlookClient
        .api('/me/events')
        .post(event);

      return {
        id: response.id,
        provider: this.providers.OUTLOOK,
        eventUrl: response.webLink
      };
    } catch (error) {
      logger.error('Failed to create Outlook Calendar event:', error);
      throw error;
    }
  }

  // Create iCal event
  async createICalEvent(data) {
    try {
      const calendar = ical({
        domain: 'rslegalsolutions.com',
        name: 'RS Legal Solutions Calendar'
      });

      const event = calendar.createEvent({
        start: data.startTime,
        end: data.endTime,
        summary: data.title,
        description: data.description,
        location: data.location,
        url: data.url
      });

      return {
        id: event.uid(),
        provider: this.providers.ICAL,
        icalContent: calendar.toString()
      };
    } catch (error) {
      logger.error('Failed to create iCal event:', error);
      throw error;
    }
  }

  // Update calendar event
  async updateEvent(eventId, data, provider = this.providers.GOOGLE) {
    try {
      switch (provider) {
        case this.providers.GOOGLE:
          return await this.updateGoogleEvent(eventId, data);
        case this.providers.OUTLOOK:
          return await this.updateOutlookEvent(eventId, data);
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      logger.error('Failed to update calendar event:', error);
      throw error;
    }
  }

  // Delete calendar event
  async deleteEvent(eventId, provider = this.providers.GOOGLE) {
    try {
      switch (provider) {
        case this.providers.GOOGLE:
          return await this.deleteGoogleEvent(eventId);
        case this.providers.OUTLOOK:
          return await this.deleteOutlookEvent(eventId);
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      logger.error('Failed to delete calendar event:', error);
      throw error;
    }
  }

  // Sync calendar events
  async syncEvents(userId, provider = this.providers.GOOGLE) {
    try {
      const user = await mongoose.model('User').findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const events = await this.fetchExternalEvents(user, provider);
      await this.updateLocalEvents(user, events, provider);

      return events;
    } catch (error) {
      logger.error('Failed to sync calendar events:', error);
      throw error;
    }
  }

  // Fetch external events
  async fetchExternalEvents(user, provider) {
    try {
      switch (provider) {
        case this.providers.GOOGLE:
          return await this.fetchGoogleEvents(user);
        case this.providers.OUTLOOK:
          return await this.fetchOutlookEvents(user);
        default:
          throw new Error(`Unsupported calendar provider: ${provider}`);
      }
    } catch (error) {
      logger.error('Failed to fetch external events:', error);
      throw error;
    }
  }

  // Fetch Google Calendar events
  async fetchGoogleEvents(user) {
    try {
      const response = await this.googleCalendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items.map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        location: event.location,
        startTime: event.start.dateTime || event.start.date,
        endTime: event.end.dateTime || event.end.date,
        attendees: event.attendees?.map(a => a.email),
        provider: this.providers.GOOGLE
      }));
    } catch (error) {
      logger.error('Failed to fetch Google Calendar events:', error);
      throw error;
    }
  }

  // Update local events
  async updateLocalEvents(user, events, provider) {
    try {
      const CalendarEvent = mongoose.model('CalendarEvent');

      // Update or create events
      for (const event of events) {
        await CalendarEvent.findOneAndUpdate(
          {
            externalId: event.id,
            provider
          },
          {
            userId: user._id,
            title: event.title,
            description: event.description,
            location: event.location,
            startTime: event.startTime,
            endTime: event.endTime,
            attendees: event.attendees,
            lastSynced: new Date()
          },
          { upsert: true }
        );
      }

      // Remove deleted events
      const eventIds = events.map(e => e.id);
      await CalendarEvent.deleteMany({
        userId: user._id,
        provider,
        externalId: { $nin: eventIds }
      });
    } catch (error) {
      logger.error('Failed to update local events:', error);
      throw error;
    }
  }

  // Get user calendar settings
  async getCalendarSettings(userId) {
    try {
      const settings = await mongoose.model('CalendarSettings')
        .findOne({ userId })
        .lean();

      if (!settings) {
        return this.getDefaultSettings();
      }

      return settings;
    } catch (error) {
      logger.error('Failed to get calendar settings:', error);
      throw error;
    }
  }

  // Get default settings
  getDefaultSettings() {
    return {
      defaultProvider: this.providers.GOOGLE,
      workingHours: {
        start: '09:00',
        end: '17:00'
      },
      timeZone: 'Asia/Kolkata',
      reminderDefaults: {
        email: 24 * 60, // 24 hours
        notification: 30 // 30 minutes
      }
    };
  }
}

// Export singleton instance
module.exports = new CalendarService();
