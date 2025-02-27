const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const notifications = require('./notifications');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class TaskManagementService {
  constructor() {
    this.taskStatuses = {
      PENDING: 'pending',
      IN_PROGRESS: 'in_progress',
      REVIEW: 'review',
      COMPLETED: 'completed',
      ON_HOLD: 'on_hold',
      CANCELLED: 'cancelled'
    };

    this.taskPriorities = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      URGENT: 'urgent'
    };

    this.taskTypes = {
      LEGAL_RESEARCH: 'legal_research',
      DOCUMENT_PREPARATION: 'document_preparation',
      COURT_FILING: 'court_filing',
      CLIENT_MEETING: 'client_meeting',
      CASE_REVIEW: 'case_review',
      HEARING_PREPARATION: 'hearing_preparation',
      ADMINISTRATIVE: 'administrative'
    };

    this.initialize();
  }

  // Initialize task management service
  async initialize() {
    try {
      await this.setupAutomatedWorkflows();
      logger.info('Task management service initialized');
    } catch (error) {
      logger.error('Task management service initialization failed:', error);
      throw new ServiceError('Task management service initialization failed', 'tasks');
    }
  }

  // Create new task
  async createTask(data) {
    try {
      const task = await mongoose.model('Task').create({
        ...data,
        status: this.taskStatuses.PENDING,
        timeline: [{
          action: 'Task Created',
          description: 'New task created',
          performedBy: data.createdBy,
          timestamp: new Date()
        }]
      });

      // Create subtasks if specified
      if (data.subtasks) {
        await this.createSubtasks(task._id, data.subtasks);
      }

      // Assign task
      await this.assignTask(task, data.assignedTo);

      // Schedule reminders
      await this.scheduleTaskReminders(task);

      return task;
    } catch (error) {
      logger.error('Failed to create task:', error);
      throw error;
    }
  }

  // Update task
  async updateTask(taskId, updates, userId) {
    try {
      const task = await mongoose.model('Task').findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Track changes
      const changes = this.trackChanges(task, updates);

      // Update task
      Object.assign(task, updates);

      // Add timeline entry
      if (changes.length > 0) {
        task.timeline.push({
          action: 'Task Updated',
          description: `Updated: ${changes.join(', ')}`,
          performedBy: userId,
          timestamp: new Date()
        });
      }

      // Handle status change
      if (updates.status && updates.status !== task.status) {
        await this.handleStatusChange(task, updates.status, userId);
      }

      await task.save();

      // Update dependent tasks
      if (updates.status === this.taskStatuses.COMPLETED) {
        await this.updateDependentTasks(task);
      }

      return task;
    } catch (error) {
      logger.error('Failed to update task:', error);
      throw error;
    }
  }

  // Assign task
  async assignTask(task, userId) {
    try {
      task.assignedTo = userId;
      task.timeline.push({
        action: 'Task Assigned',
        description: `Task assigned to user ${userId}`,
        performedBy: task.createdBy,
        timestamp: new Date()
      });

      await task.save();

      // Notify assignee
      await this.notifyAssignment(task);

      return task;
    } catch (error) {
      logger.error('Failed to assign task:', error);
      throw error;
    }
  }

  // Create subtasks
  async createSubtasks(parentTaskId, subtasks) {
    try {
      const createdSubtasks = await Promise.all(
        subtasks.map(subtask =>
          mongoose.model('Task').create({
            ...subtask,
            parentTask: parentTaskId,
            status: this.taskStatuses.PENDING
          })
        )
      );

      await mongoose.model('Task').findByIdAndUpdate(parentTaskId, {
        $push: { subtasks: { $each: createdSubtasks.map(st => st._id) } }
      });

      return createdSubtasks;
    } catch (error) {
      logger.error('Failed to create subtasks:', error);
      throw error;
    }
  }

  // Add task comment
  async addComment(taskId, comment) {
    try {
      const task = await mongoose.model('Task').findById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      task.comments.push({
        ...comment,
        timestamp: new Date()
      });

      task.timeline.push({
        action: 'Comment Added',
        description: comment.content.substring(0, 50) + '...',
        performedBy: comment.createdBy,
        timestamp: new Date()
      });

      await task.save();

      // Notify relevant users
      await this.notifyNewComment(task, comment);

      return task;
    } catch (error) {
      logger.error('Failed to add comment:', error);
      throw error;
    }
  }

  // Get task dependencies
  async getTaskDependencies(taskId) {
    try {
      const task = await mongoose.model('Task')
        .findById(taskId)
        .populate('dependencies')
        .populate('dependents');

      return {
        dependencies: task.dependencies,
        dependents: task.dependents
      };
    } catch (error) {
      logger.error('Failed to get task dependencies:', error);
      throw error;
    }
  }

  // Add task dependency
  async addDependency(taskId, dependencyId) {
    try {
      const [task, dependency] = await Promise.all([
        mongoose.model('Task').findById(taskId),
        mongoose.model('Task').findById(dependencyId)
      ]);

      if (!task || !dependency) {
        throw new Error('Task or dependency not found');
      }

      // Check for circular dependencies
      if (await this.hasCircularDependency(taskId, dependencyId)) {
        throw new Error('Circular dependency detected');
      }

      task.dependencies.push(dependencyId);
      dependency.dependents.push(taskId);

      await Promise.all([task.save(), dependency.save()]);

      return task;
    } catch (error) {
      logger.error('Failed to add dependency:', error);
      throw error;
    }
  }

  // Generate task report
  async generateTaskReport(filters = {}) {
    try {
      const tasks = await mongoose.model('Task')
        .find(filters)
        .populate('assignedTo', 'name')
        .populate('createdBy', 'name')
        .lean();

      const report = {
        totalTasks: tasks.length,
        byStatus: this.groupByKey(tasks, 'status'),
        byPriority: this.groupByKey(tasks, 'priority'),
        byAssignee: this.groupByKey(tasks, 'assignedTo.name'),
        overdueTasks: tasks.filter(task => 
          task.dueDate && new Date(task.dueDate) < new Date()
        ).length,
        completedOnTime: tasks.filter(task =>
          task.status === this.taskStatuses.COMPLETED &&
          task.completedAt <= task.dueDate
        ).length
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate task report:', error);
      throw error;
    }
  }

  // Setup automated workflows
  async setupAutomatedWorkflows() {
    // Setup recurring tasks
    await this.setupRecurringTasks();

    // Setup task reminders
    await this.setupTaskReminders();

    // Setup overdue task notifications
    await this.setupOverdueTaskNotifications();
  }

  // Helper: Track changes
  trackChanges(original, updates) {
    return Object.keys(updates)
      .filter(key => updates[key] !== original[key])
      .map(key => `${key}: ${original[key]} → ${updates[key]}`);
  }

  // Helper: Handle status change
  async handleStatusChange(task, newStatus, userId) {
    const statusActions = {
      [this.taskStatuses.COMPLETED]: async () => {
        task.completedAt = new Date();
        await this.handleTaskCompletion(task);
      },
      [this.taskStatuses.IN_PROGRESS]: async () => {
        task.startedAt = new Date();
      }
    };

    if (statusActions[newStatus]) {
      await statusActions[newStatus]();
    }

    task.timeline.push({
      action: 'Status Changed',
      description: `Status changed from ${task.status} to ${newStatus}`,
      performedBy: userId,
      timestamp: new Date()
    });
  }

  // Helper: Handle task completion
  async handleTaskCompletion(task) {
    // Update parent task progress
    if (task.parentTask) {
      await this.updateParentTaskProgress(task.parentTask);
    }

    // Notify dependent task assignees
    await this.notifyDependentTasks(task);

    // Archive task documents
    await this.archiveTaskDocuments(task);
  }

  // Helper: Check for circular dependency
  async hasCircularDependency(taskId, dependencyId, visited = new Set()) {
    if (taskId === dependencyId) return true;
    if (visited.has(taskId)) return false;

    visited.add(taskId);

    const task = await mongoose.model('Task')
      .findById(dependencyId)
      .select('dependencies');

    for (const depId of task.dependencies) {
      if (await this.hasCircularDependency(taskId, depId, visited)) {
        return true;
      }
    }

    return false;
  }

  // Helper: Group by key
  groupByKey(array, key) {
    return array.reduce((result, item) => {
      const value = key.split('.').reduce((obj, k) => obj[k], item);
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  // Helper: Schedule task reminders
  async scheduleTaskReminders(task) {
    const reminders = [
      { days: 7, message: '7 days until due date' },
      { days: 1, message: '1 day until due date' },
      { hours: 2, message: '2 hours until due date' }
    ];

    for (const reminder of reminders) {
      const reminderDate = DateTime.fromJSDate(task.dueDate)
        .minus(reminder)
        .toJSDate();

      if (reminderDate > new Date()) {
        await this.scheduleReminder(task, reminderDate, reminder.message);
      }
    }
  }

  // Helper: Schedule reminder
  async scheduleReminder(task, date, message) {
    // Implementation depends on notification system
  }
}

// Export singleton instance
module.exports = new TaskManagementService();
