const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const archiver = require('archiver');
const AWS = require('aws-sdk');
const mongoose = require('mongoose');
const logger = require('./logger');
const { ServiceError } = require('./errors');
require('dotenv').config();

class BackupService {
  constructor() {
    this.backupTypes = {
      FULL: 'full',
      INCREMENTAL: 'incremental',
      DIFFERENTIAL: 'differential'
    };

    this.storageTypes = {
      LOCAL: 'local',
      S3: 's3',
      GLACIER: 'glacier'
    };

    this.retentionPeriods = {
      DAILY: 7, // 7 days
      WEEKLY: 4, // 4 weeks
      MONTHLY: 12, // 12 months
      YEARLY: 5 // 5 years
    };

    this.initialize();
  }

  // Initialize backup service
  async initialize() {
    try {
      this.backupDir = path.join(__dirname, '../backups');
      await fs.mkdir(this.backupDir, { recursive: true });

      this.setupS3Client();
      await this.setupBackupSchedule();
      logger.info('Backup service initialized');
    } catch (error) {
      logger.error('Backup service initialization failed:', error);
      throw new ServiceError('Backup service initialization failed', 'backup');
    }
  }

  // Setup S3 client
  setupS3Client() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
  }

  // Create backup
  async createBackup(type = this.backupTypes.FULL) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-${type}-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });

      // Backup different components
      await Promise.all([
        this.backupDatabase(backupPath),
        this.backupFiles(backupPath),
        this.backupConfigs(backupPath)
      ]);

      // Create archive
      const archivePath = await this.createArchive(backupPath, backupName);

      // Upload to cloud storage
      const uploadResult = await this.uploadToCloud(archivePath);

      // Clean up local files
      await this.cleanupLocalBackup(backupPath, archivePath);

      // Log backup details
      await this.logBackup({
        type,
        name: backupName,
        size: (await fs.stat(archivePath)).size,
        location: uploadResult.Location,
        timestamp: new Date()
      });

      return {
        name: backupName,
        path: uploadResult.Location,
        type,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Backup creation failed:', error);
      throw error;
    }
  }

  // Backup database
  async backupDatabase(backupPath) {
    try {
      const dbConfig = {
        uri: process.env.MONGODB_URI,
        name: process.env.DB_NAME
      };

      // Use mongodump for backup
      const dumpPath = path.join(backupPath, 'database');
      await execAsync(`mongodump --uri="${dbConfig.uri}" --out="${dumpPath}"`);

      // Get collections data through Mongoose
      const collections = await mongoose.connection.db.collections();
      
      for (const collection of collections) {
        const data = await collection.find({}).toArray();
        const collectionPath = path.join(backupPath, 'database-json', `${collection.collectionName}.json`);
        await fs.mkdir(path.dirname(collectionPath), { recursive: true });
        await fs.writeFile(collectionPath, JSON.stringify(data, null, 2));
      }

      return dumpPath;
    } catch (error) {
      logger.error('Database backup failed:', error);
      throw error;
    }
  }

  // Backup files
  async backupFiles(backupPath) {
    try {
      const directories = [
        'uploads',
        'documents',
        'templates'
      ];

      for (const dir of directories) {
        const sourcePath = path.join(__dirname, '..', dir);
        const destPath = path.join(backupPath, 'files', dir);

        try {
          await fs.access(sourcePath);
          await this.copyDirectory(sourcePath, destPath);
        } catch (error) {
          logger.warn(`Directory ${dir} not found, skipping...`);
        }
      }
    } catch (error) {
      logger.error('Files backup failed:', error);
      throw error;
    }
  }

  // Backup configurations
  async backupConfigs(backupPath) {
    try {
      const configs = {
        env: process.env,
        settings: await mongoose.model('Setting').find().lean()
      };

      const configPath = path.join(backupPath, 'configs.json');
      await fs.writeFile(configPath, JSON.stringify(configs, null, 2));
    } catch (error) {
      logger.error('Config backup failed:', error);
      throw error;
    }
  }

  // Create archive
  async createArchive(sourcePath, name) {
    return new Promise((resolve, reject) => {
      const archivePath = path.join(this.backupDir, `${name}.zip`);
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => resolve(archivePath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  // Upload to cloud storage
  async uploadToCloud(filePath, storageType = this.storageTypes.S3) {
    try {
      const fileName = path.basename(filePath);
      const fileContent = await fs.readFile(filePath);

      switch (storageType) {
        case this.storageTypes.S3:
          return await this.uploadToS3(fileName, fileContent);
        case this.storageTypes.GLACIER:
          return await this.uploadToGlacier(fileName, fileContent);
        default:
          throw new Error(`Unsupported storage type: ${storageType}`);
      }
    } catch (error) {
      logger.error('Cloud upload failed:', error);
      throw error;
    }
  }

  // Upload to S3
  async uploadToS3(fileName, fileContent) {
    try {
      const params = {
        Bucket: process.env.AWS_BACKUP_BUCKET,
        Key: `backups/${fileName}`,
        Body: fileContent
      };

      return await this.s3.upload(params).promise();
    } catch (error) {
      logger.error('S3 upload failed:', error);
      throw error;
    }
  }

  // Restore from backup
  async restoreFromBackup(backupId) {
    try {
      // Get backup details
      const backup = await mongoose.model('Backup').findById(backupId);
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Download backup
      const localPath = await this.downloadBackup(backup);

      // Extract archive
      const extractPath = await this.extractArchive(localPath);

      // Restore components
      await Promise.all([
        this.restoreDatabase(extractPath),
        this.restoreFiles(extractPath),
        this.restoreConfigs(extractPath)
      ]);

      // Clean up
      await this.cleanupRestore(localPath, extractPath);

      // Log restoration
      await this.logRestoration(backup);

      return {
        success: true,
        backup: backup.name,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Restore failed:', error);
      throw error;
    }
  }

  // Download backup
  async downloadBackup(backup) {
    try {
      const localPath = path.join(this.backupDir, backup.name);
      
      const params = {
        Bucket: process.env.AWS_BACKUP_BUCKET,
        Key: `backups/${backup.name}`
      };

      const response = await this.s3.getObject(params).promise();
      await fs.writeFile(localPath, response.Body);

      return localPath;
    } catch (error) {
      logger.error('Backup download failed:', error);
      throw error;
    }
  }

  // Extract archive
  async extractArchive(archivePath) {
    try {
      const extractPath = archivePath.replace('.zip', '');
      await execAsync(`unzip "${archivePath}" -d "${extractPath}"`);
      return extractPath;
    } catch (error) {
      logger.error('Archive extraction failed:', error);
      throw error;
    }
  }

  // Restore database
  async restoreDatabase(backupPath) {
    try {
      const dumpPath = path.join(backupPath, 'database');
      await execAsync(`mongorestore --uri="${process.env.MONGODB_URI}" "${dumpPath}"`);
    } catch (error) {
      logger.error('Database restore failed:', error);
      throw error;
    }
  }

  // Helper: Copy directory recursively
  async copyDirectory(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  // Helper: Clean up local backup files
  async cleanupLocalBackup(backupPath, archivePath) {
    try {
      await fs.rm(backupPath, { recursive: true });
      await fs.unlink(archivePath);
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  }

  // Helper: Log backup details
  async logBackup(details) {
    try {
      await mongoose.model('Backup').create(details);
    } catch (error) {
      logger.error('Backup logging failed:', error);
    }
  }
}

// Export singleton instance
module.exports = new BackupService();
