const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const notifications = require('./notifications');
const mailer = require('./mailer');
const tasks = require('./tasks');
const { ServiceError } = require('./errors');
require('dotenv').config();

class WorkflowService {
  constructor() {
    this.workflowTypes = {
      CASE_MANAGEMENT: 'case_management',
      CLIENT_ONBOARDING: 'client_onboarding',
      DOCUMENT_APPROVAL: 'document_approval',
      BILLING_COLLECTION: 'billing_collection',
      APPOINTMENT_SCHEDULING: 'appointment_scheduling',
      COMPLIANCE_CHECK: 'compliance_check'
    };

    this.workflowStates = {
      PENDING: 'pending',
      IN_PROGRESS: 'in_progress',
      WAITING: 'waiting',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      ERROR: 'error'
    };

    this.triggerTypes = {
      EVENT: 'event',
      SCHEDULE: 'schedule',
      CONDITION: 'condition',
      MANUAL: 'manual'
    };

    this.initialize();
  }

  // Initialize workflow service
  async initialize() {
    try {
      await this.loadWorkflowDefinitions();
      await this.setupWorkflowTriggers();
      logger.info('Workflow service initialized');
    } catch (error) {
      logger.error('Workflow service initialization failed:', error);
      throw new ServiceError('Workflow service initialization failed', 'workflow');
    }
  }

  // Start workflow
  async startWorkflow(type, data, options = {}) {
    try {
      const definition = await this.getWorkflowDefinition(type);
      if (!definition) {
        throw new Error(`Workflow definition not found: ${type}`);
      }

      const workflow = await mongoose.model('Workflow').create({
        type,
        data,
        currentState: this.workflowStates.PENDING,
        steps: definition.steps,
        currentStepIndex: 0,
        startedAt: new Date(),
        options
      });

      // Execute first step
      await this.executeWorkflowStep(workflow);

      return workflow;
    } catch (error) {
      logger.error('Failed to start workflow:', error);
      throw error;
    }
  }

  // Execute workflow step
  async executeWorkflowStep(workflow) {
    try {
      const currentStep = workflow.steps[workflow.currentStepIndex];
      if (!currentStep) {
        return await this.completeWorkflow(workflow);
      }

      workflow.currentState = this.workflowStates.IN_PROGRESS;
      await workflow.save();

      // Execute step action
      const result = await this.executeStepAction(currentStep, workflow.data);

      // Update workflow data with step result
      workflow.data = {
        ...workflow.data,
        ...result
      };

      // Check conditions for next step
      if (await this.checkStepConditions(currentStep, workflow.data)) {
        workflow.currentStepIndex++;
        await workflow.save();

        // Execute next step
        await this.executeWorkflowStep(workflow);
      } else {
        workflow.currentState = this.workflowStates.WAITING;
        await workflow.save();
      }

      return workflow;
    } catch (error) {
      logger.error('Failed to execute workflow step:', error);
      await this.handleWorkflowError(workflow, error);
      throw error;
    }
  }

  // Execute step action
  async executeStepAction(step, data) {
    try {
      const actionHandler = this.getActionHandler(step.action);
      if (!actionHandler) {
        throw new Error(`Action handler not found: ${step.action}`);
      }

      return await actionHandler(step, data);
    } catch (error) {
      logger.error('Failed to execute step action:', error);
      throw error;
    }
  }

  // Check step conditions
  async checkStepConditions(step, data) {
    try {
      if (!step.conditions || step.conditions.length === 0) {
        return true;
      }

      for (const condition of step.conditions) {
        const result = await this.evaluateCondition(condition, data);
        if (!result) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check step conditions:', error);
      return false;
    }
  }

  // Complete workflow
  async completeWorkflow(workflow) {
    try {
      workflow.currentState = this.workflowStates.COMPLETED;
      workflow.completedAt = new Date();
      await workflow.save();

      // Execute completion handlers
      await this.executeCompletionHandlers(workflow);

      return workflow;
    } catch (error) {
      logger.error('Failed to complete workflow:', error);
      throw error;
    }
  }

  // Handle workflow error
  async handleWorkflowError(workflow, error) {
    try {
      workflow.currentState = this.workflowStates.ERROR;
      workflow.error = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date()
      };
      await workflow.save();

      // Notify administrators
      await this.notifyWorkflowError(workflow, error);

      // Create error recovery task
      await this.createErrorRecoveryTask(workflow);
    } catch (err) {
      logger.error('Failed to handle workflow error:', err);
    }
  }

  // Resume workflow
  async resumeWorkflow(workflowId, data = {}) {
    try {
      const workflow = await mongoose.model('Workflow').findById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      if (workflow.currentState !== this.workflowStates.WAITING) {
        throw new Error(`Cannot resume workflow in state: ${workflow.currentState}`);
      }

      // Update workflow data
      workflow.data = {
        ...workflow.data,
        ...data
      };

      // Resume execution
      return await this.executeWorkflowStep(workflow);
    } catch (error) {
      logger.error('Failed to resume workflow:', error);
      throw error;
    }
  }

  // Cancel workflow
  async cancelWorkflow(workflowId, reason) {
    try {
      const workflow = await mongoose.model('Workflow').findById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      workflow.currentState = this.workflowStates.CANCELLED;
      workflow.cancellationReason = reason;
      workflow.cancelledAt = new Date();
      await workflow.save();

      // Execute cancellation handlers
      await this.executeCancellationHandlers(workflow);

      return workflow;
    } catch (error) {
      logger.error('Failed to cancel workflow:', error);
      throw error;
    }
  }

  // Register workflow definition
  async registerWorkflowDefinition(definition) {
    try {
      const existingDefinition = await mongoose.model('WorkflowDefinition')
        .findOne({ type: definition.type });

      if (existingDefinition) {
        Object.assign(existingDefinition, definition);
        await existingDefinition.save();
        return existingDefinition;
      }

      return await mongoose.model('WorkflowDefinition').create(definition);
    } catch (error) {
      logger.error('Failed to register workflow definition:', error);
      throw error;
    }
  }

  // Setup workflow triggers
  async setupWorkflowTriggers() {
    try {
      const definitions = await mongoose.model('WorkflowDefinition').find();

      for (const definition of definitions) {
        if (definition.trigger.type === this.triggerTypes.EVENT) {
          this.setupEventTrigger(definition);
        } else if (definition.trigger.type === this.triggerTypes.SCHEDULE) {
          await this.setupScheduledTrigger(definition);
        }
      }
    } catch (error) {
      logger.error('Failed to setup workflow triggers:', error);
      throw error;
    }
  }

  // Setup event trigger
  setupEventTrigger(definition) {
    const eventName = definition.trigger.event;
    process.on(eventName, async (data) => {
      try {
        await this.startWorkflow(definition.type, data);
      } catch (error) {
        logger.error(`Failed to handle event trigger ${eventName}:`, error);
      }
    });
  }

  // Setup scheduled trigger
  async setupScheduledTrigger(definition) {
    const schedule = definition.trigger.schedule;
    const job = require('node-schedule').scheduleJob(schedule, async () => {
      try {
        await this.startWorkflow(definition.type, {
          scheduledAt: new Date()
        });
      } catch (error) {
        logger.error(`Failed to handle scheduled trigger for ${definition.type}:`, error);
      }
    });

    return job;
  }

  // Get action handler
  getActionHandler(action) {
    const handlers = {
      'create_task': this.handleCreateTask.bind(this),
      'send_notification': this.handleSendNotification.bind(this),
      'send_email': this.handleSendEmail.bind(this),
      'update_record': this.handleUpdateRecord.bind(this),
      'create_document': this.handleCreateDocument.bind(this),
      'schedule_appointment': this.handleScheduleAppointment.bind(this)
      // Add more handlers as needed
    };

    return handlers[action];
  }

  // Action handlers
  async handleCreateTask(step, data) {
    return await tasks.createTask({
      title: this.interpolateTemplate(step.taskTemplate.title, data),
      description: this.interpolateTemplate(step.taskTemplate.description, data),
      assignedTo: step.taskTemplate.assignedTo,
      dueDate: this.calculateDueDate(step.taskTemplate.dueDateOffset),
      priority: step.taskTemplate.priority
    });
  }

  async handleSendNotification(step, data) {
    return await notifications.sendNotification(
      step.notification.recipients,
      {
        title: this.interpolateTemplate(step.notification.title, data),
        message: this.interpolateTemplate(step.notification.message, data),
        type: step.notification.type
      }
    );
  }

  // Helper: Interpolate template
  interpolateTemplate(template, data) {
    return template.replace(/\${(.*?)}/g, (match, key) => {
      return key.split('.').reduce((obj, key) => obj[key], data) || match;
    });
  }

  // Helper: Calculate due date
  calculateDueDate(offset) {
    return DateTime.now().plus(offset).toJSDate();
  }
}

// Export singleton instance
module.exports = new WorkflowService();
