const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const docx = require('docx');
const Handlebars = require('handlebars');
const { DateTime } = require('luxon');
const logger = require('./logger');
const fileManager = require('./fileManager');
const { ServiceError } = require('./errors');
require('dotenv').config();

class DocumentGeneratorService {
  constructor() {
    this.templateTypes = {
      AGREEMENT: 'agreement',
      PETITION: 'petition',
      AFFIDAVIT: 'affidavit',
      NOTICE: 'notice',
      LETTER: 'letter',
      LEGAL_OPINION: 'legal_opinion',
      COURT_ORDER: 'court_order'
    };

    this.outputFormats = {
      PDF: 'pdf',
      DOCX: 'docx',
      HTML: 'html'
    };

    this.initialize();
  }

  // Initialize document generator service
  async initialize() {
    try {
      this.templatesDir = path.join(__dirname, '../templates/documents');
      this.outputDir = path.join(__dirname, '../generated');
      await this.setupDirectories();
      await this.loadTemplates();
      logger.info('Document generator service initialized');
    } catch (error) {
      logger.error('Document generator service initialization failed:', error);
      throw new ServiceError('Document generator service initialization failed', 'document_generator');
    }
  }

  // Setup directories
  async setupDirectories() {
    try {
      await fs.mkdir(this.templatesDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to setup directories:', error);
      throw error;
    }
  }

  // Load templates
  async loadTemplates() {
    try {
      this.templates = new Map();
      const templateFiles = await fs.readdir(this.templatesDir);

      for (const file of templateFiles) {
        const templateContent = await fs.readFile(
          path.join(this.templatesDir, file),
          'utf8'
        );
        const templateName = path.basename(file, path.extname(file));
        this.templates.set(templateName, Handlebars.compile(templateContent));
      }

      // Register custom helpers
      this.registerHelpers();
    } catch (error) {
      logger.error('Failed to load templates:', error);
      throw error;
    }
  }

  // Generate document
  async generateDocument(type, data, format = this.outputFormats.PDF) {
    try {
      // Validate template type
      if (!this.templates.has(type)) {
        throw new Error(`Template not found: ${type}`);
      }

      // Process template with data
      const content = await this.processTemplate(type, data);

      // Generate document in requested format
      const document = await this.createDocument(content, format, data);

      // Save document metadata
      const metadata = await this.saveDocumentMetadata(document, type, data);

      return {
        ...document,
        metadata
      };
    } catch (error) {
      logger.error('Failed to generate document:', error);
      throw error;
    }
  }

  // Process template
  async processTemplate(type, data) {
    try {
      const template = this.templates.get(type);
      const processedData = await this.preprocessData(data);
      return template(processedData);
    } catch (error) {
      logger.error('Failed to process template:', error);
      throw error;
    }
  }

  // Create document
  async createDocument(content, format, data) {
    try {
      switch (format) {
        case this.outputFormats.PDF:
          return await this.generatePDF(content, data);
        case this.outputFormats.DOCX:
          return await this.generateDOCX(content, data);
        case this.outputFormats.HTML:
          return await this.generateHTML(content, data);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to create document:', error);
      throw error;
    }
  }

  // Generate PDF
  async generatePDF(content, data) {
    return new Promise((resolve, reject) => {
      try {
        const filename = this.generateFilename(data.title, 'pdf');
        const outputPath = path.join(this.outputDir, filename);
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(outputPath);

        doc.pipe(stream);

        // Add letterhead
        this.addLetterhead(doc);

        // Add content
        doc.fontSize(12).text(content);

        // Add footer
        this.addFooter(doc);

        doc.end();

        stream.on('finish', () => {
          resolve({
            path: outputPath,
            filename,
            format: this.outputFormats.PDF
          });
        });

        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate DOCX
  async generateDOCX(content, data) {
    try {
      const filename = this.generateFilename(data.title, 'docx');
      const outputPath = path.join(this.outputDir, filename);

      const doc = new docx.Document({
        sections: [{
          properties: {},
          children: [
            new docx.Paragraph({
              children: [new docx.TextRun(content)]
            })
          ]
        }]
      });

      const buffer = await docx.Packer.toBuffer(doc);
      await fs.writeFile(outputPath, buffer);

      return {
        path: outputPath,
        filename,
        format: this.outputFormats.DOCX
      };
    } catch (error) {
      logger.error('Failed to generate DOCX:', error);
      throw error;
    }
  }

  // Generate HTML
  async generateHTML(content, data) {
    try {
      const filename = this.generateFilename(data.title, 'html');
      const outputPath = path.join(this.outputDir, filename);

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${data.title}</title>
            <style>
              ${await this.getHTMLStyles()}
            </style>
          </head>
          <body>
            ${content}
          </body>
        </html>
      `;

      await fs.writeFile(outputPath, html);

      return {
        path: outputPath,
        filename,
        format: this.outputFormats.HTML
      };
    } catch (error) {
      logger.error('Failed to generate HTML:', error);
      throw error;
    }
  }

  // Add template
  async addTemplate(name, content) {
    try {
      const templatePath = path.join(this.templatesDir, `${name}.hbs`);
      await fs.writeFile(templatePath, content);
      this.templates.set(name, Handlebars.compile(content));
      return true;
    } catch (error) {
      logger.error('Failed to add template:', error);
      throw error;
    }
  }

  // Update template
  async updateTemplate(name, content) {
    try {
      if (!this.templates.has(name)) {
        throw new Error(`Template not found: ${name}`);
      }

      const templatePath = path.join(this.templatesDir, `${name}.hbs`);
      await fs.writeFile(templatePath, content);
      this.templates.set(name, Handlebars.compile(content));
      return true;
    } catch (error) {
      logger.error('Failed to update template:', error);
      throw error;
    }
  }

  // Register Handlebars helpers
  registerHelpers() {
    Handlebars.registerHelper('formatDate', (date, format) => {
      return DateTime.fromJSDate(date).toFormat(format || 'dd/MM/yyyy');
    });

    Handlebars.registerHelper('formatCurrency', (amount) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount);
    });

    Handlebars.registerHelper('uppercase', (text) => {
      return text.toUpperCase();
    });

    Handlebars.registerHelper('lowercase', (text) => {
      return text.toLowerCase();
    });

    Handlebars.registerHelper('titlecase', (text) => {
      return text.replace(/\w\S*/g, (word) => 
        word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
      );
    });
  }

  // Helper: Preprocess data
  async preprocessData(data) {
    return {
      ...data,
      currentDate: new Date(),
      companyInfo: await this.getCompanyInfo(),
      generatedAt: new Date()
    };
  }

  // Helper: Generate filename
  generateFilename(title, extension) {
    const timestamp = DateTime.now().toFormat('yyyyMMdd-HHmmss');
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${sanitizedTitle}-${timestamp}.${extension}`;
  }

  // Helper: Add letterhead
  addLetterhead(doc) {
    doc.image('path/to/logo.png', 50, 45, { width: 150 })
       .fontSize(20)
       .text('RS Legal Solutions', 230, 45)
       .fontSize(10)
       .text('123 Legal Street, New Delhi, India 110001')
       .text('Phone: +91 XXX XXX XXXX | Email: contact@rslegalsolutions.com')
       .moveDown(2);
  }

  // Helper: Add footer
  addFooter(doc) {
    const totalPages = doc.bufferedPageRange().count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      
      doc.fontSize(8)
         .text(
           'This document is generated by RS Legal Solutions',
           50,
           doc.page.height - 50,
           {
             align: 'center',
             width: doc.page.width - 100
           }
         )
         .text(
           `Page ${i + 1} of ${totalPages}`,
           50,
           doc.page.height - 40,
           {
             align: 'center',
             width: doc.page.width - 100
           }
         );
    }
  }

  // Helper: Get HTML styles
  async getHTMLStyles() {
    return `
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        margin: 40px;
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
      }
      .content {
        margin-bottom: 40px;
      }
      .footer {
        text-align: center;
        font-size: 12px;
        color: #666;
        margin-top: 40px;
      }
    `;
  }

  // Helper: Get company info
  async getCompanyInfo() {
    // This could be fetched from database or environment variables
    return {
      name: 'RS Legal Solutions',
      address: '123 Legal Street, New Delhi, India 110001',
      phone: '+91 XXX XXX XXXX',
      email: 'contact@rslegalsolutions.com',
      website: 'www.rslegalsolutions.com'
    };
  }
}

// Export singleton instance
module.exports = new DocumentGeneratorService();
