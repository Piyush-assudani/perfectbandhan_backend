const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  authorPhone: {
    type: String,
    required: true,
    index: true
  },
  authorName: {
    type: String,
    required: true
  },
  authorPhoto: {
    type: String,
    default: ''
  },
  authorCity: {
    type: String,
    default: ''
  },
  authorAge: {
    type: Number,
    default: null
  },
  authorGender: {
    type: String,
    default: ''
  },
  mediaUrl: {
    type: String,
    default: ''
  },
  mediaType: {
    type: String,
    enum: ['image', 'text'],
    default: 'image'
  },
  caption: {
    type: String,
    default: '',
    maxlength: 500
  },
  backgroundColor: {
    type: String,
    default: '#D4AF37'
  },
  views: [{
    phone: { type: String, required: true },
    viewedAt: { type: Date, default: Date.now }
  }],
  likes: [{
    phone: { type: String, required: true },
    likedAt: { type: Date, default: Date.now }
  }],
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// TTL index to automatically purge stories 24 hours after creation
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ authorPhone: 1, createdAt: -1 });
StorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Story', StorySchema);
