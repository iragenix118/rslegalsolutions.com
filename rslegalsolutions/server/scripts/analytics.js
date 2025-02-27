const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');
const cache = require('./cache');
const mailer = require('./mailer');
const { ServiceError } = require('./errors');
require('dotenv').config();

class AnalyticsService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../reports');
    this.cachePrefix = 'analytics:';
    this.cacheDuration = 3600; // 1 hour

    this.initialize();
  }

  // Initialize analytics service
  async initialize() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      logger.info('Analytics service initialized');
    } catch (error) {
      logger.error('Analytics service initialization failed:', error);
      throw new ServiceError('Analytics service initialization failed', 'analytics');
    }
  }

  // Generate dashboard analytics
  async getDashboardAnalytics() {
    try {
      const cacheKey = `${this.cachePrefix}dashboard`;
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      const now = DateTime.now();
      const startOfMonth = now.startOf('month').toJSDate();
      const startOfYear = now.startOf('year').toJSDate();

      const [
        appointmentsStats,
        casesStats,
        revenueStats,
        clientStats
      ] = await Promise.all([
        this.getAppointmentsAnalytics(startOfMonth),
        this.getCasesAnalytics(startOfMonth),
        this.getRevenueAnalytics(startOfYear),
        this.getClientAnalytics(startOfMonth)
      ]);

      const analytics = {
        appointments: appointmentsStats,
        cases: casesStats,
        revenue: revenueStats,
        clients: clientStats,
        timestamp: new Date()
      };

      await cache.set(cacheKey, analytics, this.cacheDuration);
      return analytics;
    } catch (error) {
      logger.error('Failed to generate dashboard analytics:', error);
      throw error;
    }
  }

  // Get appointments analytics
  async getAppointmentsAnalytics(startDate) {
    const appointments = await mongoose.model('Appointment').aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalAppointments = appointments.reduce((sum, item) => sum + item.count, 0);
    const completionRate = appointments.find(a => a._id === 'completed')?.count || 0;
    const cancellationRate = appointments.find(a => a._id === 'cancelled')?.count || 0;

    return {
      total: totalAppointments,
      byStatus: appointments,
      completionRate: totalAppointments ? (completionRate / totalAppointments) * 100 : 0,
      cancellationRate: totalAppointments ? (cancellationRate / totalAppointments) * 100 : 0
    };
  }

  // Get cases analytics
  async getCasesAnalytics(startDate) {
    const cases = await mongoose.model('Case').aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            type: '$type'
          },
          count: { $sum: 1 },
          avgDuration: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } }
        }
      }
    ]);

    return {
      total: cases.reduce((sum, item) => sum + item.count, 0),
      byType: this.groupByKey(cases, '_id.type'),
      byStatus: this.groupByKey(cases, '_id.status'),
      averageDuration: this.calculateAverageDuration(cases)
    };
  }

  // Get revenue analytics
  async getRevenueAnalytics(startDate) {
    const revenue = await mongoose.model('Payment').aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'successful'
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    return {
      monthly: this.formatMonthlyRevenue(revenue),
      total: revenue.reduce((sum, item) => sum + item.total, 0),
      averagePerTransaction: revenue.reduce((sum, item) => sum + item.total, 0) / 
                           revenue.reduce((sum, item) => sum + item.count, 0)
    };
  }

  // Get client analytics
  async getClientAnalytics(startDate) {
    const clients = await mongoose.model('User').aggregate([
      {
        $match: {
          role: 'client',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            source: '$source'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      total: clients.reduce((sum, item) => sum + item.count, 0),
      bySource: this.groupByKey(clients, '_id.source'),
      monthlyGrowth: this.calculateMonthlyGrowth(clients)
    };
  }

  // Generate performance report
  async generatePerformanceReport(startDate, endDate) {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RS Legal Solutions';
      workbook.created = new Date();

      // Appointments sheet
      await this.addAppointmentsSheet(workbook, startDate, endDate);

      // Cases sheet
      await this.addCasesSheet(workbook, startDate, endDate);

      // Revenue sheet
      await this.addRevenueSheet(workbook, startDate, endDate);

      // Save workbook
      const filename = `performance-report-${DateTime.now().toFormat('yyyy-MM-dd')}.xlsx`;
      const filepath = path.join(this.reportsDir, filename);
      await workbook.xlsx.writeFile(filepath);

      return {
        filename,
        filepath,
        size: (await fs.stat(filepath)).size
      };
    } catch (error) {
      logger.error('Failed to generate performance report:', error);
      throw error;
    }
  }

  // Add appointments sheet
  async addAppointmentsSheet(workbook, startDate, endDate) {
    const sheet = workbook.addWorksheet('Appointments');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Client', key: 'client', width: 20 },
      { header: 'Service', key: 'service', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Duration', key: 'duration', width: 15 },
      { header: 'Revenue', key: 'revenue', width: 15 }
    ];

    const appointments = await mongoose.model('Appointment')
      .find({
        createdAt: { $gte: startDate, $lte: endDate }
      })
      .populate('client', 'name')
      .populate('service', 'name price')
      .lean();

    appointments.forEach(apt => {
      sheet.addRow({
        date: apt.createdAt.toLocaleDateString(),
        client: apt.client.name,
        service: apt.service.name,
        status: apt.status,
        duration: `${apt.duration} mins`,
        revenue: apt.service.price
      });
    });
  }

  // Generate monthly newsletter report
  async generateNewsletterReport() {
    try {
      const startDate = DateTime.now().minus({ months: 1 }).startOf('month').toJSDate();
      const endDate = DateTime.now().minus({ months: 1 }).endOf('month').toJSDate();

      const stats = await mongoose.model('Newsletter').aggregate([
        {
          $match: {
            sentAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalSent: { $sum: '$recipientCount' },
            totalOpened: { $sum: '$openCount' },
            totalClicked: { $sum: '$clickCount' },
            totalUnsubscribed: { $sum: '$unsubscribeCount' }
          }
        }
      ]);

      const report = {
        period: {
          start: startDate,
          end: endDate
        },
        metrics: stats[0] || {
          totalSent: 0,
          totalOpened: 0,
          totalClicked: 0,
          totalUnsubscribed: 0
        },
        openRate: stats[0] ? (stats[0].totalOpened / stats[0].totalSent) * 100 : 0,
        clickRate: stats[0] ? (stats[0].totalClicked / stats[0].totalSent) * 100 : 0,
        unsubscribeRate: stats[0] ? (stats[0].totalUnsubscribed / stats[0].totalSent) * 100 : 0
      };

      // Send report to administrators
      await this.sendAnalyticsReport('newsletter', report);

      return report;
    } catch (error) {
      logger.error('Failed to generate newsletter report:', error);
      throw error;
    }
  }

  // Send analytics report
  async sendAnalyticsReport(type, data) {
    try {
      await mailer.sendMail({
        to: process.env.ADMIN_EMAIL,
        subject: `${type.charAt(0).toUpperCase() + type.slice(1)} Analytics Report`,
        template: 'analytics-report',
        context: {
          type,
          data,
          date: DateTime.now().toFormat('MMMM yyyy')
        }
      });
    } catch (error) {
      logger.error('Failed to send analytics report:', error);
      throw error;
    }
  }

  // Helper: Group by key
  groupByKey(array, key) {
    return array.reduce((result, item) => {
      const value = this.getNestedValue(item, key);
      if (!result[value]) {
        result[value] = 0;
      }
      result[value] += item.count;
      return result;
    }, {});
  }

  // Helper: Get nested object value
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current[key], obj);
  }

  // Helper: Format monthly revenue
  formatMonthlyRevenue(revenue) {
    return revenue.map(item => ({
      month: DateTime.fromObject({ month: item._id.month, year: item._id.year }).toFormat('MMM yyyy'),
      total: item.total,
      count: item.count
    }));
  }

  // Helper: Calculate average duration
  calculateAverageDuration(cases) {
    const totalDuration = cases.reduce((sum, item) => sum + item.avgDuration, 0);
    return totalDuration / cases.length / (1000 * 60 * 60 * 24); // Convert to days
  }

  // Helper: Calculate monthly growth
  calculateMonthlyGrowth(data) {
    const monthlyTotals = data.reduce((result, item) => {
      const month = item._id.month;
      if (!result[month]) {
        result[month] = 0;
      }
      result[month] += item.count;
      return result;
    }, {});

    return Object.entries(monthlyTotals)
      .sort(([a], [b]) => a - b)
      .map(([month, count]) => ({
        month: DateTime.fromObject({ month: parseInt(month) }).toFormat('MMM'),
        count
      }));
  }
}

// Export singleton instance
module.exports = new AnalyticsService();
