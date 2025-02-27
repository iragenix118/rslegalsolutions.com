const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');
const cache = require('./cache');
const { ServiceError } = require('./errors');
require('dotenv').config();

class I18nService {
  constructor() {
    this.localesDir = path.join(__dirname, '../locales');
    this.defaultLanguage = process.env.DEFAULT_LANGUAGE || 'en';
    this.supportedLanguages = ['en', 'hi', 'gu', 'mr', 'bn']; // English, Hindi, Gujarati, Marathi, Bengali
    this.cachePrefix = 'i18n:';
    this.cacheDuration = 3600; // 1 hour

    this.initialize();
  }

  // Initialize i18n service
  async initialize() {
    try {
      await fs.mkdir(this.localesDir, { recursive: true });
      await this.initializeI18next();
      await this.loadTranslations();
      logger.info('I18n service initialized');
    } catch (error) {
      logger.error('I18n service initialization failed:', error);
      throw new ServiceError('I18n service initialization failed', 'i18n');
    }
  }

  // Initialize i18next
  async initializeI18next() {
    await i18next
      .use(Backend)
      .init({
        backend: {
          loadPath: path.join(this.localesDir, '{{lng}}/{{ns}}.json'),
          addPath: path.join(this.localesDir, '{{lng}}/{{ns}}.missing.json')
        },
        fallbackLng: this.defaultLanguage,
        supportedLngs: this.supportedLanguages,
        ns: ['common', 'legal', 'forms', 'errors'],
        defaultNS: 'common',
        preload: this.supportedLanguages,
        interpolation: {
          escapeValue: false
        },
        saveMissing: process.env.NODE_ENV !== 'production',
        debug: process.env.NODE_ENV === 'development'
      });
  }

  // Load translations
  async loadTranslations() {
    try {
      for (const lang of this.supportedLanguages) {
        const langDir = path.join(this.localesDir, lang);
        await fs.mkdir(langDir, { recursive: true });

        // Create default translation files if they don't exist
        for (const namespace of i18next.options.ns) {
          const filePath = path.join(langDir, `${namespace}.json`);
          try {
            await fs.access(filePath);
          } catch {
            await fs.writeFile(filePath, '{}');
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load translations:', error);
      throw error;
    }
  }

  // Translate text
  async translate(key, options = {}) {
    try {
      const {
        lang = this.defaultLanguage,
        namespace = 'common',
        variables = {}
      } = options;

      const cacheKey = `${this.cachePrefix}${lang}:${namespace}:${key}:${JSON.stringify(variables)}`;
      const cached = await cache.get(cacheKey);
      if (cached) return cached;

      const translation = i18next.t(key, {
        lng: lang,
        ns: namespace,
        ...variables
      });

      await cache.set(cacheKey, translation, this.cacheDuration);
      return translation;
    } catch (error) {
      logger.error('Translation failed:', error);
      throw error;
    }
  }

  // Add translation
  async addTranslation(lang, namespace, key, value) {
    try {
      const filePath = path.join(this.localesDir, lang, `${namespace}.json`);
      const translations = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      translations[key] = value;
      await fs.writeFile(filePath, JSON.stringify(translations, null, 2));
      
      // Reload translations
      await i18next.reloadResources([lang], [namespace]);
      
      // Clear cache for this key
      await this.clearTranslationCache(lang, namespace, key);

      logger.info(`Translation added: ${lang}.${namespace}.${key}`);
      return true;
    } catch (error) {
      logger.error('Failed to add translation:', error);
      throw error;
    }
  }

  // Update translation
  async updateTranslation(lang, namespace, key, value) {
    return this.addTranslation(lang, namespace, key, value);
  }

  // Delete translation
  async deleteTranslation(lang, namespace, key) {
    try {
      const filePath = path.join(this.localesDir, lang, `${namespace}.json`);
      const translations = JSON.parse(await fs.readFile(filePath, 'utf8'));
      
      delete translations[key];
      await fs.writeFile(filePath, JSON.stringify(translations, null, 2));
      
      // Reload translations
      await i18next.reloadResources([lang], [namespace]);
      
      // Clear cache for this key
      await this.clearTranslationCache(lang, namespace, key);

      logger.info(`Translation deleted: ${lang}.${namespace}.${key}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete translation:', error);
      throw error;
    }
  }

  // Get all translations for a language
  async getTranslations(lang) {
    try {
      const translations = {};
      const langDir = path.join(this.localesDir, lang);
      
      const files = await fs.readdir(langDir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.includes('.missing.')) {
          const namespace = path.basename(file, '.json');
          const content = await fs.readFile(path.join(langDir, file), 'utf8');
          translations[namespace] = JSON.parse(content);
        }
      }

      return translations;
    } catch (error) {
      logger.error('Failed to get translations:', error);
      throw error;
    }
  }

  // Import translations
  async importTranslations(lang, translations) {
    try {
      const langDir = path.join(this.localesDir, lang);
      await fs.mkdir(langDir, { recursive: true });

      for (const [namespace, content] of Object.entries(translations)) {
        const filePath = path.join(langDir, `${namespace}.json`);
        await fs.writeFile(filePath, JSON.stringify(content, null, 2));
      }

      // Reload translations
      await i18next.reloadResources([lang]);
      
      // Clear cache for this language
      await this.clearLanguageCache(lang);

      logger.info(`Translations imported for language: ${lang}`);
      return true;
    } catch (error) {
      logger.error('Failed to import translations:', error);
      throw error;
    }
  }

  // Export translations
  async exportTranslations(lang) {
    try {
      return await this.getTranslations(lang);
    } catch (error) {
      logger.error('Failed to export translations:', error);
      throw error;
    }
  }

  // Clear translation cache
  async clearTranslationCache(lang, namespace, key) {
    try {
      const pattern = `${this.cachePrefix}${lang}:${namespace}:${key}:*`;
      await cache.deletePattern(pattern);
    } catch (error) {
      logger.error('Failed to clear translation cache:', error);
    }
  }

  // Clear language cache
  async clearLanguageCache(lang) {
    try {
      const pattern = `${this.cachePrefix}${lang}:*`;
      await cache.deletePattern(pattern);
    } catch (error) {
      logger.error('Failed to clear language cache:', error);
    }
  }

  // Get supported languages
  getSupportedLanguages() {
    return this.supportedLanguages.map(code => ({
      code,
      name: this.getLanguageName(code)
    }));
  }

  // Get language name
  getLanguageName(code) {
    const names = {
      en: 'English',
      hi: 'हिंदी',
      gu: 'ગુજરાતી',
      mr: 'मराठी',
      bn: 'বাংলা'
    };
    return names[code] || code;
  }

  // Detect language from text
  async detectLanguage(text) {
    try {
      // Implement language detection logic here
      // You might want to use a library like 'franc' or external API
      return this.defaultLanguage;
    } catch (error) {
      logger.error('Language detection failed:', error);
      return this.defaultLanguage;
    }
  }

  // Format date according to locale
  formatDate(date, lang, options = {}) {
    try {
      return new Intl.DateTimeFormat(lang, options).format(date);
    } catch (error) {
      logger.error('Date formatting failed:', error);
      return date.toISOString();
    }
  }

  // Format number according to locale
  formatNumber(number, lang, options = {}) {
    try {
      return new Intl.NumberFormat(lang, options).format(number);
    } catch (error) {
      logger.error('Number formatting failed:', error);
      return number.toString();
    }
  }

  // Format currency according to locale
  formatCurrency(amount, lang, currency = 'INR') {
    try {
      return new Intl.NumberFormat(lang, {
        style: 'currency',
        currency
      }).format(amount);
    } catch (error) {
      logger.error('Currency formatting failed:', error);
      return `${currency} ${amount}`;
    }
  }
}

// Export singleton instance
module.exports = new I18nService();
