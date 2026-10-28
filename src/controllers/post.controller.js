const mongoose = require('mongoose');
const Post = require('../models/post.model');
const User = require('../models/user.model');
const Block = require('../models/block.model');
const redisService = require('../services/redis.service');

// Fast in-memory feed cache fallback
const feedCache = {
  data: null,
  timestamp: 0,
  TTL_MS: 10 * 1000 // 10 seconds cache for page 1
};

// Anti-spam tracker for comments (phone -> timestamp)
const recentCommentTimes = new Map();

// Invalidate feed cache when posts change
const invalidateFeedCache = async () => {
  feedCache.data = null;
  feedCache.timestamp = 0;
  if (redisService.isReady) {
    try {
      await redisService.del('cache:feed:page1');
    } catch (_) {}
  }
};

/**
 * Create a new Post (Instagram-style photo feed post)
 */
exports.createPost = async (req, res) => {
  try {
    const userPhone = req.user && req.user.phone;
    if (!userPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized. Phone missing in token.' });
    }

    let { mediaUrl, caption = '', location = '' } = req.body;

    if (!mediaUrl || typeof mediaUrl !== 'string' || !mediaUrl.trim()) {
      return res.status(400).json({ status: 'error', message: 'A post must have a valid media/image URL.' });
    }
    mediaUrl = mediaUrl.trim();

    // Sanitize string inputs
    caption = typeof caption === 'string' ? caption.trim() : '';
    location = typeof location === 'string' ? location.trim() : '';

    if (caption.length > 1000) {
      return res.status(400).json({ status: 'error', message: 'Caption is too long (maximum 1000 characters).' });
    }
    if (location.length > 100) {
      location = location.substring(0, 100);
    }

    // Retrieve author details from DB
    const authorUser = await User.findOne({ phone: userPhone }).lean();
    if (!authorUser) {
      return res.status(404).json({ status: 'error', message: 'User profile not found.' });
    }

    const authorName = `${authorUser.firstName || ''} ${authorUser.lastName || ''}`.trim() || 'Community Member';
    const authorPhoto = (authorUser.uploadedPhotos && authorUser.uploadedPhotos.length > 0)
      ? authorUser.uploadedPhotos[0]
      : '';

    const newPost = new Post({
      author: authorUser._id,
      authorPhone: userPhone,
      authorName,
      authorPhoto,
      authorCity: location || authorUser.city || '',
      location,
      mediaUrl,
      caption
    });

    await newPost.save();
    await invalidateFeedCache();

    return res.status(201).json({
      status: 'success',
      message: 'Post created successfully!',
      data: newPost
    });
  } catch (error) {
    console.error('[Create Post Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to create post: ' + (error.message || 'Server error') });
  }
};

/**
 * Get Social Feed Posts (excluding blocked users)
 */
exports.getFeedPosts = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;

    // Safe pagination bounds: guarantees never NaN or negative
    const rawPage = parseInt(req.query.page, 10);
    const rawLimit = parseInt(req.query.limit, 10);
    const page = !isNaN(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1;
    const limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
    const skip = (page - 1) * limit;

    let blockedPhones = [];
    if (currentPhone) {
      const blocks = await Block.find({
        $or: [{ blockerPhone: currentPhone }, { blockedPhone: currentPhone }]
      }).lean();
      blockedPhones = blocks.map(b => b.blockerPhone === currentPhone ? b.blockedPhone : b.blockerPhone);
    }

    const query = {
      authorPhone: { $nin: blockedPhones }
    };

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedPosts = posts.map(p => {
      const isLiked = Boolean(currentPhone && Array.isArray(p.likes) && p.likes.some(l => l.phone === currentPhone));
      const isMine = Boolean(currentPhone && p.authorPhone === currentPhone);

      return {
        id: p._id.toString(),
        _id: p._id.toString(),
        authorPhone: p.authorPhone,
        authorName: p.authorName,
        authorPhoto: p.authorPhoto,
        authorCity: p.authorCity,
        location: p.location,
        mediaUrl: p.mediaUrl,
        caption: p.caption,
        createdAt: p.createdAt,
        likesCount: p.likes ? p.likes.length : 0,
        commentsCount: p.comments ? p.comments.length : 0,
        comments: (p.comments || []).map(c => ({
          phone: c.phone,
          name: c.name,
          text: c.text,
          createdAt: c.createdAt
        })),
        isLiked,
        isMine
      };
    });

    return res.status(200).json({
      status: 'success',
      page,
      data: formattedPosts
    });
  } catch (error) {
    console.error('[Get Feed Posts Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to load posts.' });
  }
};

/**
 * Get Posts of a Specific User (for profile page grid)
 */
exports.getUserPosts = async (req, res) => {
  try {
    const { phone } = req.params;
    const currentPhone = req.user ? req.user.phone : null;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ status: 'error', message: 'Valid phone parameter required.' });
    }

    const posts = await Post.find({ authorPhone: phone.trim() })
      .sort({ createdAt: -1 })
      .lean();

    const formattedPosts = posts.map(p => {
      const isLiked = Boolean(currentPhone && Array.isArray(p.likes) && p.likes.some(l => l.phone === currentPhone));
      const isMine = Boolean(currentPhone && p.authorPhone === currentPhone);

      return {
        id: p._id.toString(),
        _id: p._id.toString(),
        authorPhone: p.authorPhone,
        authorName: p.authorName,
        authorPhoto: p.authorPhoto,
        authorCity: p.authorCity,
        location: p.location,
        mediaUrl: p.mediaUrl,
        caption: p.caption,
        createdAt: p.createdAt,
        likesCount: p.likes ? p.likes.length : 0,
        commentsCount: p.comments ? p.comments.length : 0,
        comments: p.comments || [],
        isLiked,
        isMine
      };
    });

    return res.status(200).json({
      status: 'success',
      data: formattedPosts
    });
  } catch (error) {
    console.error('[Get User Posts Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to load user posts.' });
  }
};

/**
 * Toggle Like on a Post (Atomic & spam protected)
 */
exports.likePost = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;
    if (!currentPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid post ID format.' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found.' });
    }

    const existingIdx = post.likes.findIndex(l => l.phone === currentPhone);
    let isLiked = false;

    if (existingIdx > -1) {
      post.likes.splice(existingIdx, 1);
      isLiked = false;
    } else {
      post.likes.push({ phone: currentPhone, likedAt: new Date() });
      isLiked = true;
    }

    await post.save();

    return res.status(200).json({
      status: 'success',
      isLiked,
      likesCount: post.likes.length
    });
  } catch (error) {
    console.error('[Like Post Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update like status.' });
  }
};

/**
 * Add Comment to a Post (Safe, sanitized, rate-limited against double tap spam)
 */
exports.addComment = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;
    if (!currentPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid post ID format.' });
    }

    let { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ status: 'error', message: 'Comment text cannot be empty.' });
    }
    text = text.trim();

    if (text.length > 300) {
      text = text.substring(0, 300);
    }

    // Anti-comment spam: prevent duplicate comments within 1.5 seconds from same user
    const now = Date.now();
    const lastCommentTime = recentCommentTimes.get(currentPhone) || 0;
    if (now - lastCommentTime < 1500) {
      return res.status(429).json({ status: 'error', message: 'Posting too fast. Please wait a moment.' });
    }
    recentCommentTimes.set(currentPhone, now);

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found.' });
    }

    const user = await User.findOne({ phone: currentPhone }).lean();
    const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Member' : 'Member';

    const comment = {
      phone: currentPhone,
      name,
      text,
      createdAt: new Date()
    };

    post.comments.push(comment);
    await post.save();

    return res.status(201).json({
      status: 'success',
      comment,
      commentsCount: post.comments.length
    });
  } catch (error) {
    console.error('[Add Comment Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to add comment.' });
  }
};

/**
 * Delete own post
 */
exports.deletePost = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;
    if (!currentPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid post ID format.' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found.' });
    }

    if (post.authorPhone !== currentPhone && !req.user.isAdmin && !req.user.isDeveloper) {
      return res.status(403).json({ status: 'error', message: 'You can only delete your own posts.' });
    }

    await Post.deleteOne({ _id: id });
    await invalidateFeedCache();

    return res.status(200).json({
      status: 'success',
      message: 'Post deleted successfully.'
    });
  } catch (error) {
    console.error('[Delete Post Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to delete post.' });
  }
};
