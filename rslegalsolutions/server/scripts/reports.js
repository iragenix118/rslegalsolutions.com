const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const ExcelJS = require('exceljs');
const ChartJS = require('chart.js');
const logger = require('./logger');
const cache = require('./cache');
const { ServiceError } = require('./errors');
require('dotenv').config();

class ReportingService {
  constructor() {
    this.reportTypes = {
      FINANCIAL: 'financial',
      CASE: 'case',
      CLIENT: 'client',
      PERFORMANCE: 'performance',
      COMPLIANCE: 'compliance',
      OPERATIONAL: 'operational'
    };

    this.timeframes = {
      DAILY: 'daily',
      WEEKLY: 'weekly',
      MONTHLY: 'monthly',
      QUARTERLY: 'quarterly',
      YEARLY: 'yearly',
      CUSTOM: 'custom'
    };

    this.chartTypes = {
      LINE: 'line',
      BAR: 'bar',
      PIE: 'pie',
      DOUGHNUT: 'doughnut',
      AREA: 'area',
      SCATTER: 'scatter'
    };

    this.initialize();
  }

  // Initialize reporting service
  async initialize() {
    try {
      await this.setupReportTemplates();
      logger.info('Reporting service initialized');
    } catch (error) {
      logger.error('Reporting service initialization failed:', error);
      throw new ServiceError('Reporting service initialization failed', 'reports');
    }
  }

  // Generate report
  async generateReport(type, options = {}) {
    try {
      const {
        startDate,
        endDate,
        timeframe = this.timeframes.MONTHLY,
        format = 'pdf',
        filters = {}
      } = options;

      // Get report data
      const data = await this.getReportData(type, startDate, endDate, filters);

      // Process data based on timeframe
      const processedData = this.processDataByTimeframe(data, timeframe);

      // Generate visualizations
      const visualizations = await this.generateVisualizations(processedData, type);

      // Create report
      const report = await this.createReport(type, processedData, visualizations, options);

      // Export in requested format
      return await this.exportReport(report, format);
    } catch (error) {
      logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  // Get report data
  async getReportData(type, startDate, endDate, filters) {
    try {
      const reportHandlers = {
        [this.reportTypes.FINANCIAL]: this.getFinancialData,
        [this.reportTypes.CASE]: this.getCaseData,
        [this.reportTypes.CLIENT]: this.getClientData,
        [this.reportTypes.PERFORMANCE]: this.getPerformanceData,
        [this.reportTypes.COMPLIANCE]: this.getComplianceData,
        [this.reportTypes.OPERATIONAL]: this.getOperationalData
      };

      if (!reportHandlers[type]) {
        throw new Error(`Unsupported report type: ${type}`);
      }

      return await reportHandlers[type].call(this, startDate, endDate, filters);
    } catch (error) {
      logger.error('Failed to get report data:', error);
      throw error;
    }
  }

  // Get financial data
  async getFinancialData(startDate, endDate, filters) {
    try {
      const invoices = await mongoose.model('Invoice')
        .find({
          createdAt: { $gte: startDate, $lte: endDate },
          ...filters
        })
        .lean();

      const payments = await mongoose.model('Payment')
        .find({
          createdAt: { $gte: startDate, $lte: endDate },
          ...filters
        })
        .lean();

      return {
        revenue: this.calculateRevenue(invoices),
        payments: this.analyzePayments(payments),
        outstanding: this.calculateOutstanding(invoices, payments),
        trends: this.calculateFinancialTrends(invoices, payments)
      };
    } catch (error) {
      logger.error('Failed to get financial data:', error);
      throw error;
    }
  }

  // Get case data
  async getCaseData(startDate, endDate, filters) {
    try {
      const cases = await mongoose.model('Case')
        .find({
          createdAt: { $gte: startDate, $lte: endDate },
          ...filters
        })
        .populate('client')
        .populate('assignedLawyer')
        .lean();

      return {
        totalCases: cases.length,
        byStatus: this.groupByKey(cases, 'status'),
        byType: this.groupByKey(cases, 'type'),
        byLawyer: this.groupByKey(cases, 'assignedLawyer.name'),
        resolution: this.analyzeResolutionRates(cases),
        duration: this.analyzeCaseDuration(cases),
        trends: this.analyzeCaseTrends(cases)
      };
    } catch (error) {
      logger.error('Failed to get case data:', error);
      throw error;
    }
  }

  // Generate visualizations
  async generateVisualizations(data, type) {
    try {
      const visualizations = {};

      switch (type) {
        case this.reportTypes.FINANCIAL:
          visualizations.revenueTrend = await this.createLineChart(
            'Revenue Trend',
            data.trends.revenue
          );
          visualizations.paymentDistribution = await this.createPieChart(
            'Payment Distribution',
            data.payments.byMethod
          );
          break;

        case this.reportTypes.CASE:
          visualizations.casesByStatus = await this.createDoughnutChart(
            'Cases by Status',
            data.byStatus
          );
          visualizations.caseResolution = await this.createBarChart(
            'Case Resolution Rates',
            data.resolution
          );
          break;

        // Add other report types...
      }

      return visualizations;
    } catch (error) {
      logger.error('Failed to generate visualizations:', error);
      throw error;
    }
  }

  // Create chart
  async createChart(type, title, data, options = {}) {
    try {
      const config = {
        type,
        data: {
          labels: Object.keys(data),
          datasets: [{
            data: Object.values(data),
            backgroundColor: this.getChartColors(Object.keys(data).length)
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          title: {
            display: true,
            text: title
          },
          ...options
        }
      };

      return config;
    } catch (error) {
      logger.error('Failed to create chart:', error);
      throw error;
    }
  }

  // Export report
  async exportReport(report, format) {
    try {
      switch (format.toLowerCase()) {
        case 'pdf':
          return await this.exportToPDF(report);
        case 'excel':
          return await this.exportToExcel(report);
        case 'json':
          return report;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to export report:', error);
      throw error;
    }
  }

  // Export to Excel
  async exportToExcel(report) {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RS Legal Solutions';
      workbook.created = new Date();

      // Add summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      this.addSummarySheet(summarySheet, report);

      // Add data sheets
      Object.entries(report.data).forEach(([key, data]) => {
        const sheet = workbook.addWorksheet(key);
        this.addDataSheet(sheet, data);
      });

      // Save workbook
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      logger.error('Failed to export to Excel:', error);
      throw error;
    }
  }

  // Helper: Process data by timeframe
  processDataByTimeframe(data, timeframe) {
    const groupBy = {
      [this.timeframes.DAILY]: 'day',
      [this.timeframes.WEEKLY]: 'week',
      [this.timeframes.MONTHLY]: 'month',
      [this.timeframes.QUARTERLY]: 'quarter',
      [this.timeframes.YEARLY]: 'year'
    };

    return this.groupDataByTime(data, groupBy[timeframe]);
  }

  // Helper: Group data by time
  groupDataByTime(data, unit) {
    return Object.entries(data).reduce((result, [key, value]) => {
      const time = DateTime.fromISO(key).startOf(unit);
      const timeKey = time.toFormat('yyyy-MM-dd');

      if (!result[timeKey]) {
        result[timeKey] = {};
      }

      result[timeKey][key] = value;
      return result;
    }, {});
  }

  // Helper: Get chart colors
  getChartColors(count) {
    const colors = [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ];

    return Array(count).fill().map((_, i) => colors[i % colors.length]);
  }

  // Helper: Group by key
  groupByKey(array, key) {
    return array.reduce((result, item) => {
      const value = key.split('.').reduce((obj, k) => obj[k], item);
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  // Helper: Calculate financial trends
  calculateFinancialTrends(invoices, payments) {
    // Implementation of financial trend calculation
    return {};
  }

  // Helper: Analyze case trends
  analyzeCaseTrends(cases) {
    // Implementation of case trend analysis
    return {};
  }
}

// Export singleton instance
module.exports = new ReportingService();
