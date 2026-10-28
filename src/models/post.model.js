const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
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
  mediaUrl: {
    type: String,
    required: true
  },
  caption: {
    type: String,
    default: '',
    maxlength: 1000
  },
  location: {
    type: String,
    default: ''
  },
  likes: [{
    phone: { type: String, required: true },
    likedAt: { type: Date, default: Date.now }
  }],
  comments: [{
    phone: { type: String, required: true },
    name: { type: String, default: 'Member' },
    text: { type: String, required: true, maxlength: 300 },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

PostSchema.index({ createdAt: -1 });
PostSchema.index({ authorPhone: 1, createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
