const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const logger = require('./logger');
const notifications = require('./notifications');
const mailer = require('./mailer');
const analytics = require('./analytics');
const { ServiceError } = require('./errors');
require('dotenv').config();

class FeedbackService {
  constructor() {
    this.feedbackTypes = {
      SERVICE: 'service',
      LAWYER: 'lawyer',
      CASE: 'case',
      GENERAL: 'general',
      WEBSITE: 'website'
    };

    this.sentimentLevels = {
      VERY_POSITIVE: 5,
      POSITIVE: 4,
      NEUTRAL: 3,
      NEGATIVE: 2,
      VERY_NEGATIVE: 1
    };

    this.reviewStatus = {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      HIDDEN: 'hidden'
    };

    this.initialize();
  }

  // Initialize feedback service
  async initialize() {
    try {
      await this.setupFeedbackTriggers();
      logger.info('Feedback service initialized');
    } catch (error) {
      logger.error('Feedback service initialization failed:', error);
      throw new ServiceError('Feedback service initialization failed', 'feedback');
    }
  }

  // Submit feedback
  async submitFeedback(data) {
    try {
      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(data.content);

      const feedback = await mongoose.model('Feedback').create({
        ...data,
        sentiment,
        status: this.reviewStatus.PENDING,
        submittedAt: new Date()
      });

      // Process feedback based on sentiment
      await this.processFeedback(feedback);

      // Send acknowledgment
      await this.sendFeedbackAcknowledgment(feedback);

      return feedback;
    } catch (error) {
      logger.error('Failed to submit feedback:', error);
      throw error;
    }
  }

  // Process feedback
  async processFeedback(feedback) {
    try {
      // Handle based on sentiment
      if (feedback.sentiment <= this.sentimentLevels.NEGATIVE) {
        await this.handleNegativeFeedback(feedback);
      } else if (feedback.sentiment >= this.sentimentLevels.POSITIVE) {
        await this.handlePositiveFeedback(feedback);
      }

      // Update analytics
      await this.updateFeedbackAnalytics(feedback);

      // Notify relevant staff
      await this.notifyStaff(feedback);
    } catch (error) {
      logger.error('Failed to process feedback:', error);
      throw error;
    }
  }

  // Handle negative feedback
  async handleNegativeFeedback(feedback) {
    try {
      // Create high-priority task for follow-up
      const task = await mongoose.model('Task').create({
        title: 'Negative Feedback Follow-up',
        description: `Follow up on negative feedback from ${feedback.clientName}`,
        priority: 'high',
        dueDate: DateTime.now().plus({ days: 1 }).toJSDate(),
        assignedTo: await this.getAppropriateAssignee(feedback),
        relatedTo: {
          type: 'feedback',
          id: feedback._id
        }
      });

      // Send immediate notification to management
      await notifications.sendNotification(
        await this.getManagementRecipients(),
        {
          title: 'Negative Feedback Alert',
          message: `Negative feedback received from ${feedback.clientName}`,
          priority: 'high',
          data: { feedbackId: feedback._id }
        }
      );

      return task;
    } catch (error) {
      logger.error('Failed to handle negative feedback:', error);
      throw error;
    }
  }

  // Handle positive feedback
  async handlePositiveFeedback(feedback) {
    try {
      // Update lawyer/service ratings if applicable
      if (feedback.type === this.feedbackTypes.LAWYER) {
        await this.updateLawyerRating(feedback);
      } else if (feedback.type === this.feedbackTypes.SERVICE) {
        await this.updateServiceRating(feedback);
      }

      // Consider for testimonials
      if (feedback.sentiment === this.sentimentLevels.VERY_POSITIVE) {
        await this.processForTestimonial(feedback);
      }
    } catch (error) {
      logger.error('Failed to handle positive feedback:', error);
      throw error;
    }
  }

  // Review feedback
  async reviewFeedback(feedbackId, review) {
    try {
      const feedback = await mongoose.model('Feedback').findById(feedbackId);
      if (!feedback) {
        throw new Error('Feedback not found');
      }

      feedback.status = review.status;
      feedback.reviewNotes = review.notes;
      feedback.reviewedBy = review.reviewedBy;
      feedback.reviewedAt = new Date();

      await feedback.save();

      // Handle review outcome
      if (review.status === this.reviewStatus.APPROVED) {
        await this.handleApprovedFeedback(feedback);
      } else if (review.status === this.reviewStatus.REJECTED) {
        await this.handleRejectedFeedback(feedback);
      }

      return feedback;
    } catch (error) {
      logger.error('Failed to review feedback:', error);
      throw error;
    }
  }

  // Get feedback statistics
  async getFeedbackStats(filters = {}) {
    try {
      const stats = {
        total: await mongoose.model('Feedback').countDocuments(filters),
        byType: await this.getFeedbackByType(filters),
        bySentiment: await this.getFeedbackBySentiment(filters),
        averageRating: await this.getAverageRating(filters),
        recentTrend: await this.getFeedbackTrend(filters)
      };

      // Cache statistics
      await this.cacheFeedbackStats(stats);

      return stats;
    } catch (error) {
      logger.error('Failed to get feedback statistics:', error);
      throw error;
    }
  }

  // Generate feedback report
  async generateFeedbackReport(startDate, endDate) {
    try {
      const feedback = await mongoose.model('Feedback')
        .find({
          submittedAt: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .populate('clientId', 'name email')
        .sort('-submittedAt')
        .lean();

      const report = {
        period: {
          start: startDate,
          end: endDate
        },
        summary: {
          total: feedback.length,
          averageSentiment: this.calculateAverageSentiment(feedback),
          topIssues: await this.identifyTopIssues(feedback),
          improvements: await this.identifyImprovementAreas(feedback)
        },
        analysis: {
          byType: this.groupByKey(feedback, 'type'),
          bySentiment: this.groupByKey(feedback, 'sentiment'),
          trend: await this.analyzeTrend(feedback)
        },
        recommendations: await this.generateRecommendations(feedback)
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate feedback report:', error);
      throw error;
    }
  }

  // Analyze sentiment
  async analyzeSentiment(content) {
    try {
      // Implement sentiment analysis logic here
      // This could use a third-party service or local NLP library
      return this.sentimentLevels.NEUTRAL;
    } catch (error) {
      logger.error('Failed to analyze sentiment:', error);
      return this.sentimentLevels.NEUTRAL;
    }
  }

  // Update lawyer rating
  async updateLawyerRating(feedback) {
    try {
      const lawyer = await mongoose.model('User').findById(feedback.lawyerId);
      if (!lawyer) return;

      const allFeedback = await mongoose.model('Feedback').find({
        type: this.feedbackTypes.LAWYER,
        lawyerId: lawyer._id,
        status: this.reviewStatus.APPROVED
      });

      const averageRating = this.calculateAverageRating(allFeedback);
      lawyer.rating = averageRating;
      await lawyer.save();

      return lawyer;
    } catch (error) {
      logger.error('Failed to update lawyer rating:', error);
      throw error;
    }
  }

  // Process for testimonial
  async processForTestimonial(feedback) {
    try {
      if (feedback.sentiment === this.sentimentLevels.VERY_POSITIVE) {
        const testimonial = await mongoose.model('Testimonial').create({
          feedback: feedback._id,
          client: feedback.clientId,
          content: feedback.content,
          rating: feedback.rating,
          status: 'pending'
        });

        // Request client permission
        await this.requestTestimonialPermission(testimonial);

        return testimonial;
      }
    } catch (error) {
      logger.error('Failed to process testimonial:', error);
      throw error;
    }
  }

  // Helper: Calculate average rating
  calculateAverageRating(feedback) {
    if (!feedback.length) return 0;
    const sum = feedback.reduce((acc, item) => acc + item.rating, 0);
    return sum / feedback.length;
  }

  // Helper: Group by key
  groupByKey(array, key) {
    return array.reduce((result, item) => {
      const value = key.split('.').reduce((obj, k) => obj[k], item);
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  // Helper: Get appropriate assignee
  async getAppropriateAssignee(feedback) {
    // Implementation to determine the best person to handle the feedback
    return process.env.DEFAULT_FEEDBACK_HANDLER;
  }

  // Helper: Send feedback acknowledgment
  async sendFeedbackAcknowledgment(feedback) {
    try {
      await mailer.sendMail({
        to: feedback.email,
        subject: 'Thank you for your feedback',
        template: 'feedback-acknowledgment',
        context: {
          name: feedback.clientName,
          feedback: feedback
        }
      });
    } catch (error) {
      logger.error('Failed to send feedback acknowledgment:', error);
    }
  }
}

// Export singleton instance
module.exports = new FeedbackService();
