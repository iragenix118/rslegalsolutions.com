const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { S3 } = require('aws-sdk');
const sharp = require('sharp');
const logger = require('./logger');
require('dotenv').config();

class FileManager {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || 'uploads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5242880; // 5MB
    this.allowedFileTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || 
      ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];

    // Initialize storage providers
    this.initializeLocalStorage();
    this.initializeS3Storage();
  }

  // Initialize local storage
  initializeLocalStorage() {
    // Create upload directories if they don't exist
    const directories = [
      this.uploadDir,
      path.join(this.uploadDir, 'images'),
      path.join(this.uploadDir, 'documents'),
      path.join(this.uploadDir, 'temp')
    ];

    directories.forEach(async (dir) => {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        logger.error(`Error creating directory ${dir}:`, error);
      }
    });

    // Configure multer for local storage
    this.localStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        const type = this.getFileType(file.mimetype);
        cb(null, path.join(this.uploadDir, type));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        cb(null, `${Date.now()}-${uniqueSuffix}${path.extname(file.originalname)}`);
      }
    });
  }

  // Initialize S3 storage
  initializeS3Storage() {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION
      });
      this.s3Bucket = process.env.AWS_S3_BUCKET;
    }
  }

  // Get file type based on mimetype
  getFileType(mimetype) {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('application/')) return 'documents';
    return 'temp';
  }

  // File filter for multer
  fileFilter() {
    return (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!this.allowedFileTypes.includes(ext)) {
        return cb(new Error('File type not allowed'), false);
      }
      cb(null, true);
    };
  }

  // Get multer upload middleware
  getUploadMiddleware(field = 'file') {
    return multer({
      storage: this.localStorage,
      limits: {
        fileSize: this.maxFileSize
      },
      fileFilter: this.fileFilter()
    }).single(field);
  }

  // Process image upload
  async processImageUpload(file, options = {}) {
    try {
      const {
        width,
        height,
        quality = 80,
        format = 'jpeg',
        generateThumbnail = true
      } = options;

      // Process original image
      let processedImage = sharp(file.path);
      
      if (width || height) {
        processedImage = processedImage.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      processedImage = processedImage[format]({ quality });
      
      const processedBuffer = await processedImage.toBuffer();
      const processedFilename = `${path.parse(file.filename).name}.${format}`;
      const processedPath = path.join(file.destination, processedFilename);
      
      await fs.writeFile(processedPath, processedBuffer);

      // Generate thumbnail if requested
      let thumbnailPath;
      if (generateThumbnail) {
        const thumbnailBuffer = await sharp(processedBuffer)
          .resize(200, 200, { fit: 'cover' })
          [format]({ quality })
          .toBuffer();
        
        thumbnailPath = path.join(
          file.destination,
          `thumb_${processedFilename}`
        );
        await fs.writeFile(thumbnailPath, thumbnailBuffer);
      }

      // Upload to S3 if configured
      let s3Urls;
      if (this.s3) {
        s3Urls = await this.uploadToS3(processedPath, thumbnailPath);
      }

      return {
        originalName: file.originalname,
        filename: processedFilename,
        path: processedPath,
        thumbnailPath,
        mimetype: `image/${format}`,
        size: processedBuffer.length,
        s3Urls
      };
    } catch (error) {
      logger.error('Error processing image:', error);
      throw error;
    }
  }

  // Upload file to S3
  async uploadToS3(filePath, thumbnailPath = null) {
    try {
      const fileContent = await fs.readFile(filePath);
      const filename = path.basename(filePath);
      
      const params = {
        Bucket: this.s3Bucket,
        Key: `uploads/${filename}`,
        Body: fileContent,
        ContentType: this.getMimeType(filePath)
      };

      const result = await this.s3.upload(params).promise();
      const urls = { original: result.Location };

      if (thumbnailPath) {
        const thumbnailContent = await fs.readFile(thumbnailPath);
        const thumbnailFilename = path.basename(thumbnailPath);
        
        const thumbnailParams = {
          ...params,
          Key: `uploads/thumbnails/${thumbnailFilename}`,
          Body: thumbnailContent
        };

        const thumbnailResult = await this.s3.upload(thumbnailParams).promise();
        urls.thumbnail = thumbnailResult.Location;
      }

      return urls;
    } catch (error) {
      logger.error('Error uploading to S3:', error);
      throw error;
    }
  }

  // Delete file
  async deleteFile(filename, type = 'local') {
    try {
      if (type === 'local') {
        const filePath = path.join(this.uploadDir, filename);
        await fs.unlink(filePath);
        
        // Delete thumbnail if it exists
        const thumbPath = path.join(
          path.dirname(filePath),
          `thumb_${path.basename(filePath)}`
        );
        try {
          await fs.unlink(thumbPath);
        } catch (error) {
          // Ignore error if thumbnail doesn't exist
        }
      } else if (type === 's3' && this.s3) {
        await this.s3.deleteObject({
          Bucket: this.s3Bucket,
          Key: `uploads/${filename}`
        }).promise();

        // Delete thumbnail from S3
        await this.s3.deleteObject({
          Bucket: this.s3Bucket,
          Key: `uploads/thumbnails/thumb_${filename}`
        }).promise();
      }

      return true;
    } catch (error) {
      logger.error('Error deleting file:', error);
      throw error;
    }
  }

  // Get file URL
  getFileUrl(filename, type = 'local') {
    if (type === 's3' && this.s3) {
      return `https://${this.s3Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${filename}`;
    }
    return `/uploads/${filename}`;
  }

  // Get mime type
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Clean up temporary files
  async cleanupTempFiles() {
    try {
      const tempDir = path.join(this.uploadDir, 'temp');
      const files = await fs.readdir(tempDir);
      
      const deletePromises = files.map(file => 
        fs.unlink(path.join(tempDir, file))
      );
      
      await Promise.all(deletePromises);
      logger.info(`Cleaned up ${files.length} temporary files`);
    } catch (error) {
      logger.error('Error cleaning up temp files:', error);
    }
  }
}

// Export singleton instance
module.exports = new FileManager();
