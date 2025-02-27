const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class AuditService {
  constructor() {
    this.auditTypes = {
      USER: 'user',
      CASE: 'case',
      DOCUMENT: 'document',
      PAYMENT: 'payment',
      SYSTEM: 'system',
      SECURITY: 'security',
      COMPLIANCE: 'compliance'
    };

    this.severityLevels = {
      INFO: 'info',
      WARNING: 'warning',
      ERROR: 'error',
      CRITICAL: 'critical'
    };

    this.retentionPeriods = {
      USER: 365, // 1 year
      CASE: 1825, // 5 years
      DOCUMENT: 2555, // 7 years
      PAYMENT: 3650, // 10 years
      SYSTEM: 180, // 6 months
      SECURITY: 730, // 2 years
      COMPLIANCE: 1825 // 5 years
    };

    this.initialize();
  }

  // Initialize audit service
  async initialize() {
    try {
      await this.setupAuditCollection();
      await this.setupRetentionPolicies();
      logger.info('Audit service initialized');
    } catch (error) {
      logger.error('Audit service initialization failed:', error);
      throw new ServiceError('Audit service initialization failed', 'audit');
    }
  }

  // Log audit event
  async logEvent(data) {
    try {
      const auditLog = await mongoose.model('AuditLog').create({
        ...data,
        timestamp: new Date(),
        metadata: {
          ...data.metadata,
          userAgent: data.userAgent,
          ipAddress: data.ipAddress
        }
      });

      // Check for critical events
      if (data.severity === this.severityLevels.CRITICAL) {
        await this.handleCriticalEvent(auditLog);
      }

      // Check compliance rules
      await this.checkComplianceRules(auditLog);

      return auditLog;
    } catch (error) {
      logger.error('Failed to log audit event:', error);
      throw error;
    }
  }

  // Search audit logs
  async searchAuditLogs(filters = {}, options = {}) {
    try {
      const {
        startDate,
        endDate,
        type,
        severity,
        userId,
        resourceId,
        page = 1,
        limit = 50,
        sort = { timestamp: -1 }
      } = filters;

      const query = {};

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      if (type) query.type = type;
      if (severity) query.severity = severity;
      if (userId) query['metadata.userId'] = userId;
      if (resourceId) query['metadata.resourceId'] = resourceId;

      const auditLogs = await mongoose.model('AuditLog')
        .find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const total = await mongoose.model('AuditLog').countDocuments(query);

      return {
        logs: auditLogs,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Failed to search audit logs:', error);
      throw error;
    }
  }

  // Generate audit report
  async generateAuditReport(filters = {}) {
    try {
      const logs = await this.searchAuditLogs(filters);

      const report = {
        generatedAt: new Date(),
        period: {
          start: filters.startDate,
          end: filters.endDate
        },
        summary: {
          totalEvents: logs.total,
          byType: this.groupByKey(logs.logs, 'type'),
          bySeverity: this.groupByKey(logs.logs, 'severity'),
          criticalEvents: logs.logs.filter(log => 
            log.severity === this.severityLevels.CRITICAL
          ).length
        },
        details: logs.logs.map(log => ({
          timestamp: log.timestamp,
          type: log.type,
          severity: log.severity,
          action: log.action,
          description: log.description,
          metadata: log.metadata
        }))
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate audit report:', error);
      throw error;
    }
  }

  // Check compliance rules
  async checkComplianceRules(auditLog) {
    try {
      const rules = await this.getComplianceRules(auditLog.type);
      let violations = [];

      for (const rule of rules) {
        if (!this.validateRule(auditLog, rule)) {
          violations.push({
            rule: rule.name,
            description: rule.description,
            severity: rule.severity
          });
        }
      }

      if (violations.length > 0) {
        await this.handleComplianceViolations(auditLog, violations);
      }

      return violations;
    } catch (error) {
      logger.error('Failed to check compliance rules:', error);
      throw error;
    }
  }

  // Handle critical events
  async handleCriticalEvent(auditLog) {
    try {
      // Log to special critical events collection
      await mongoose.model('CriticalEvent').create({
        auditLogId: auditLog._id,
        timestamp: auditLog.timestamp,
        type: auditLog.type,
        description: auditLog.description,
        metadata: auditLog.metadata
      });

      // Send notifications
      await this.notifyCriticalEvent(auditLog);

      // Create incident report
      await this.createIncidentReport(auditLog);
    } catch (error) {
      logger.error('Failed to handle critical event:', error);
      throw error;
    }
  }

  // Create incident report
  async createIncidentReport(auditLog) {
    try {
      const report = await mongoose.model('IncidentReport').create({
        auditLogId: auditLog._id,
        timestamp: auditLog.timestamp,
        type: auditLog.type,
        severity: auditLog.severity,
        description: auditLog.description,
        metadata: auditLog.metadata,
        status: 'open',
        timeline: [{
          action: 'Incident Created',
          timestamp: new Date(),
          description: 'Incident report created from critical audit event'
        }]
      });

      // Send incident report to administrators
      await this.sendIncidentReport(report);

      return report;
    } catch (error) {
      logger.error('Failed to create incident report:', error);
      throw error;
    }
  }

  // Setup retention policies
  async setupRetentionPolicies() {
    try {
      // Create TTL index for each audit type
      const AuditLog = mongoose.model('AuditLog');
      
      for (const [type, days] of Object.entries(this.retentionPeriods)) {
        const indexName = `ttl_${type.toLowerCase()}`;
        await AuditLog.collection.createIndex(
          { timestamp: 1 },
          { 
            expireAfterSeconds: days * 24 * 60 * 60,
            partialFilterExpression: { type },
            name: indexName
          }
        );
      }
    } catch (error) {
      logger.error('Failed to setup retention policies:', error);
      throw error;
    }
  }

  // Export audit logs
  async exportAuditLogs(filters = {}, format = 'csv') {
    try {
      const logs = await this.searchAuditLogs(filters);

      switch (format.toLowerCase()) {
        case 'csv':
          return this.exportToCSV(logs.logs);
        case 'json':
          return this.exportToJSON(logs.logs);
        case 'pdf':
          return this.exportToPDF(logs.logs);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      throw error;
    }
  }

  // Helper: Group by key
  groupByKey(array, key) {
    return array.reduce((result, item) => {
      const value = key.split('.').reduce((obj, k) => obj[k], item);
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  // Helper: Validate compliance rule
  validateRule(auditLog, rule) {
    try {
      const condition = new Function('log', rule.condition);
      return condition(auditLog);
    } catch (error) {
      logger.error('Rule validation failed:', error);
      return false;
    }
  }

  // Helper: Get compliance rules
  async getComplianceRules(type) {
    // Implementation would load rules from database or configuration
    return [];
  }

  // Helper: Handle compliance violations
  async handleComplianceViolations(auditLog, violations) {
    try {
      // Log violations
      await mongoose.model('ComplianceViolation').create({
        auditLogId: auditLog._id,
        timestamp: auditLog.timestamp,
        violations,
        status: 'open'
      });

      // Notify compliance team
      await this.notifyComplianceViolations(auditLog, violations);
    } catch (error) {
      logger.error('Failed to handle compliance violations:', error);
      throw error;
    }
  }

  // Helper: Notify critical event
  async notifyCriticalEvent(auditLog) {
    try {
      await mailer.sendMail({
        to: process.env.ADMIN_EMAIL,
        subject: 'Critical Audit Event Detected',
        template: 'critical-event',
        context: {
          event: auditLog
        }
      });
    } catch (error) {
      logger.error('Failed to notify critical event:', error);
    }
  }
}

// Export singleton instance
module.exports = new AuditService();
