const mongoose = require('mongoose');

/**
 * AppConfig Model
 * Stores the current app version requirements for update management.
 * Admin can update these values from the Admin Panel.
 */
const AppConfigSchema = new mongoose.Schema({
  latestVersion: {
    type: String,
    default: '2.0.0'
  },
  minVersion: {
    type: String,
    default: '2.0.0'   // Minimum version that can still run the app
  },
  forceUpdate: {
    type: Boolean,
    default: false      // If true, shows un-dismissible update screen
  },
  updateMessage: {
    type: String,
    default: 'A new version of Perfect Bandhan is available. Please update for the best experience.'
  },
  downloadUrl: {
    type: String,
    default: 'https://play.google.com/store/apps/details?id=com.perfectbandhan.app'
  },
  isMaintenanceMode: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'Software under maintenance, come back later.'
  },
  globalBannerEnabled: {
    type: Boolean,
    default: false
  },
  globalBannerMessage: {
    type: String,
    default: 'Welcome to Perfect Bandhan!'
  },
  globalBannerImageUrl: {
    type: String,
    default: ''
  },
  developerBypassPassword: {
    type: String,
    default: '123456'
  },
  chatComingSoon: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AppConfig', AppConfigSchema);
