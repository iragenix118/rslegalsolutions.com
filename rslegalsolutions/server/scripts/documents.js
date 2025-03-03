const PDFDocument = require('pdfkit');
const docx = require('docx');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const fileManager = require('./fileManager');
const { ServiceError } = require('./errors');
require('dotenv').config();

class DocumentService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/documents');
    this.outputDir = path.join(__dirname, '../generated');
    this.documentTypes = {
      AGREEMENT: 'agreement',
      PETITION: 'petition',
      AFFIDAVIT: 'affidavit',
      NOTICE: 'notice',
      LETTER: 'letter'
    };

    this.initialize();
  }

  // Initialize document service
  async initialize() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      logger.info('Document service initialized');
    } catch (error) {
      logger.error('Document service initialization failed:', error);
      throw new ServiceError('Document service initialization failed', 'documents');
    }
  }

  // Generate legal document
  async generateDocument(type, data, format = 'pdf') {
    try {
      switch (format.toLowerCase()) {
        case 'pdf':
          return await this.generatePDF(type, data);
        case 'docx':
          return await this.generateDOCX(type, data);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      logger.error('Document generation failed:', error);
      throw new ServiceError('Document generation failed', 'documents');
    }
  }

  // Generate PDF document
  async generatePDF(type, data) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: data.title,
            Author: 'RS Legal Solutions',
            Subject: type,
            Keywords: data.keywords?.join(', ')
          }
        });

        const filename = `${type}-${Date.now()}.pdf`;
        const outputPath = path.join(this.outputDir, filename);
        const writeStream = fs.createWriteStream(outputPath);

        doc.pipe(writeStream);

        // Add letterhead
        await this.addLetterhead(doc);

        // Add content based on document type
        switch (type) {
          case this.documentTypes.AGREEMENT:
            await this.generateAgreement(doc, data);
            break;
          case this.documentTypes.PETITION:
            await this.generatePetition(doc, data);
            break;
          case this.documentTypes.AFFIDAVIT:
            await this.generateAffidavit(doc, data);
            break;
          case this.documentTypes.NOTICE:
            await this.generateNotice(doc, data);
            break;
          case this.documentTypes.LETTER:
            await this.generateLetter(doc, data);
            break;
          default:
            throw new Error(`Unknown document type: ${type}`);
        }

        // Add footer
        this.addFooter(doc);

        doc.end();

        writeStream.on('finish', () => {
          resolve({
            path: outputPath,
            filename,
            size: doc.length
          });
        });

        writeStream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Generate DOCX document
  async generateDOCX(type, data) {
    try {
      const doc = new docx.Document({
        sections: [{
          properties: {},
          children: await this.getDocxContent(type, data)
        }]
      });

      const filename = `${type}-${Date.now()}.docx`;
      const outputPath = path.join(this.outputDir, filename);

      const buffer = await docx.Packer.toBuffer(doc);
      await fs.writeFile(outputPath, buffer);

      return {
        path: outputPath,
        filename,
        size: buffer.length
      };
    } catch (error) {
      throw error;
    }
  }

  // Add letterhead to document
  async addLetterhead(doc) {
    const logoPath = path.join(__dirname, '../assets/logo.png');
    
    doc.image(logoPath, 50, 45, { width: 150 })
       .fontSize(20)
       .text('RS Legal Solutions', 230, 45)
       .fontSize(10)
       .text('123 Legal Street, New Delhi, India 110001')
       .text('Phone: +91 XXX XXX XXXX | Email: contact@rslegalsolutions.com')
       .moveDown(2);
  }

  // Add footer to document
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

  // Generate agreement document
  async generateAgreement(doc, data) {
    doc.fontSize(16)
       .text(data.title, { align: 'center' })
       .moveDown()
       .fontSize(12)
       .text('THIS AGREEMENT is made on ' + data.date)
       .moveDown()
       .text('BETWEEN:')
       .text(data.party1)
       .text('AND')
       .text(data.party2)
       .moveDown()
       .text('WHEREAS:')
       .text(data.recitals)
       .moveDown()
       .text('NOW IT IS HEREBY AGREED as follows:')
       .moveDown();

    data.clauses.forEach((clause, index) => {
      doc.text(`${index + 1}. ${clause.title}`)
         .text(clause.content)
         .moveDown();
    });

    // Signature section
    doc.moveDown(4)
       .text('IN WITNESS WHEREOF, the parties have executed this Agreement:')
       .moveDown(2);

    // Signature blocks
    doc.text('_______________________', 50, doc.y)
       .text('Party 1', 50, doc.y + 10)
       .text('_______________________', 300, doc.y - 12)
       .text('Party 2', 300, doc.y - 2);
  }

  // Generate petition document
  async generatePetition(doc, data) {
    doc.fontSize(14)
       .text('IN THE COURT OF ' + data.court)
       .moveDown()
       .fontSize(12)
       .text('Petition No: ' + data.petitionNumber)
       .text('IN THE MATTER OF:')
       .moveDown()
       .text(data.petitionerDetails)
       .text('...Petitioner')
       .moveDown()
       .text('VERSUS')
       .moveDown()
       .text(data.respondentDetails)
       .text('...Respondent')
       .moveDown(2)
       .text('PETITION UNDER ' + data.actDetails)
       .moveDown(2);

    // Petition body
    doc.text('MOST RESPECTFULLY SHOWETH:')
       .moveDown();

    data.grounds.forEach((ground, index) => {
      doc.text(`${index + 1}. ${ground}`)
         .moveDown();
    });

    // Prayer
    doc.moveDown()
       .text('PRAYER')
       .moveDown()
       .text(data.prayer)
       .moveDown(2);

    // Verification
    doc.text('VERIFICATION')
       .moveDown()
       .text(data.verification);
  }

  // Generate affidavit document
  async generateAffidavit(doc, data) {
    doc.fontSize(14)
       .text('AFFIDAVIT', { align: 'center' })
       .moveDown()
       .fontSize(12)
       .text('I, ' + data.deponentName + ', aged about ' + data.deponentAge + ' years, ' +
             'residing at ' + data.deponentAddress + ', do hereby solemnly affirm and state as follows:')
       .moveDown();

    data.statements.forEach((statement, index) => {
      doc.text(`${index + 1}. ${statement}`)
         .moveDown();
    });

    // Verification
    doc.moveDown(2)
       .text('VERIFICATION')
       .moveDown()
       .text('Verified at ' + data.place + ' on this ' + data.date + ' that the contents ' +
             'of the above affidavit are true and correct to the best of my knowledge, ' +
             'information and belief.')
       .moveDown(4)
       .text('Deponent')
       .moveDown(2)
       .text('Sworn before me')
       .moveDown(2)
       .text('Notary Public');
  }

  // Get DOCX content based on document type
  async getDocxContent(type, data) {
    const content = [];

    // Add header
    content.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: 'RS Legal Solutions',
          bold: true,
          size: 28
        })
      ],
      alignment: docx.AlignmentType.CENTER
    }));

    // Add content based on type
    switch (type) {
      case this.documentTypes.AGREEMENT:
        content.push(...this.getAgreementDocxContent(data));
        break;
      case this.documentTypes.PETITION:
        content.push(...this.getPetitionDocxContent(data));
        break;
      // Add other document types...
    }

    return content;
  }

  // Clean up old documents
  async cleanupOldDocuments(days = 7) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const files = await fs.readdir(this.outputDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoff) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      logger.info(`Cleaned up ${deletedCount} old documents`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to clean up old documents:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new DocumentService();
