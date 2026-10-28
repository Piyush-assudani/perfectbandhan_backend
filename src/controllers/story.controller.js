const mongoose = require('mongoose');
const Story = require('../models/story.model');
const User = require('../models/user.model');
const Block = require('../models/block.model');
const redisService = require('../services/redis.service');

// Fast in-memory stories fallback cache
const memoryStoriesCache = {
  data: null,
  timestamp: 0,
  TTL_MS: 15 * 1000 // 15 seconds cache
};

const invalidateStoriesCache = async () => {
  memoryStoriesCache.data = null;
  memoryStoriesCache.timestamp = 0;
  if (redisService.isReady) {
    try {
      await redisService.del('cache:stories:all');
    } catch (err) {
      console.warn('[Stories] Redis invalidate warning:', err.message);
    }
  }
};

/**
 * Create a new 24-hour Story (Instagram/Facebook style)
 */
exports.createStory = async (req, res) => {
  try {
    const userPhone = req.user && req.user.phone;
    if (!userPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized. Phone missing in token.' });
    }

    let { mediaUrl = '', mediaType = 'image', caption = '', backgroundColor = '#D4AF37' } = req.body;

    mediaUrl = typeof mediaUrl === 'string' ? mediaUrl.trim() : '';
    caption = typeof caption === 'string' ? caption.trim() : '';
    backgroundColor = typeof backgroundColor === 'string' ? backgroundColor.trim() : '#D4AF37';

    // Boundary & type validation
    if (!mediaUrl && !caption) {
      return res.status(400).json({
        status: 'error',
        message: 'A story must include an image/media URL or text caption.'
      });
    }

    if (caption.length > 500) {
      return res.status(400).json({
        status: 'error',
        message: 'Story caption is too long (maximum 500 characters).'
      });
    }

    // Limit active stories per user to prevent spam (max 10 active stories per user)
    const activeCount = await Story.countDocuments({
      authorPhone: userPhone,
      expiresAt: { $gt: new Date() }
    });

    if (activeCount >= 10) {
      return res.status(429).json({
        status: 'error',
        message: 'You have reached the maximum of 10 active stories. Wait for old stories to expire or delete one.'
      });
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

    // Calculate age safely
    let age = null;
    if (authorUser.dob) {
      const birth = new Date(authorUser.dob);
      if (!isNaN(birth.getTime())) {
        const diff = Date.now() - birth.getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL

    const newStory = new Story({
      author: authorUser._id,
      authorPhone: userPhone,
      authorName,
      authorPhoto,
      authorCity: authorUser.city || '',
      authorAge: age,
      authorGender: authorUser.gender || '',
      mediaUrl,
      mediaType: mediaType === 'text' ? 'text' : 'image',
      caption,
      backgroundColor,
      expiresAt
    });

    await newStory.save();
    await invalidateStoriesCache();

    return res.status(201).json({
      status: 'success',
      message: 'Story published successfully! Visible for 24 hours.',
      story: newStory
    });
  } catch (error) {
    console.error('[Create Story Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create story: ' + (error.message || 'Server error')
    });
  }
};

/**
 * Get active stories grouped by user (Social Feed) with Redis caching
 */
exports.getActiveStories = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;

    // Check Redis/Memory cache for non-authenticated or base active stories
    const now = new Date();
    let stories = null;

    if (redisService.isReady) {
      try {
        const cached = await redisService.get('cache:stories:all');
        if (cached && Array.isArray(cached)) {
          stories = cached;
        }
      } catch (_) {}
    } else if (memoryStoriesCache.data && (Date.now() - memoryStoriesCache.timestamp < memoryStoriesCache.TTL_MS)) {
      stories = memoryStoriesCache.data;
    }

    if (!stories) {
      stories = await Story.find({ expiresAt: { $gt: now } })
        .sort({ createdAt: -1 })
        .lean();

      // Populate cache
      if (redisService.isReady) {
        redisService.set('cache:stories:all', stories, 15).catch(() => {});
      } else {
        memoryStoriesCache.data = stories;
        memoryStoriesCache.timestamp = Date.now();
      }
    }

    // Check blocked users so stories from blocked users are never shown
    let blockedPhones = new Set();
    if (currentPhone) {
      const blocks = await Block.find({
        $or: [{ blockerPhone: currentPhone }, { blockedPhone: currentPhone }]
      }).lean();
      blocks.forEach(b => {
        blockedPhones.add(b.blockerPhone === currentPhone ? b.blockedPhone : b.blockerPhone);
      });
    }

    // Group stories by author
    const authorMap = new Map();

    for (const story of stories) {
      const phone = story.authorPhone;
      if (blockedPhones.has(phone)) continue;

      const isMine = Boolean(currentPhone && phone === currentPhone);
      const isViewed = Boolean(currentPhone && Array.isArray(story.views) && story.views.some(v => v.phone === currentPhone));
      const isLiked = Boolean(currentPhone && Array.isArray(story.likes) && story.likes.some(l => l.phone === currentPhone));

      const formattedStory = {
        id: story._id.toString(),
        _id: story._id.toString(),
        authorPhone: story.authorPhone,
        authorName: story.authorName,
        authorPhoto: story.authorPhoto,
        authorCity: story.authorCity,
        authorAge: story.authorAge,
        authorGender: story.authorGender,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        caption: story.caption,
        backgroundColor: story.backgroundColor,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewsCount: story.views ? story.views.length : 0,
        likesCount: story.likes ? story.likes.length : 0,
        isViewed,
        isLiked,
        isMine
      };

      if (!authorMap.has(phone)) {
        authorMap.set(phone, {
          authorPhone: story.authorPhone,
          authorName: story.authorName,
          authorPhoto: story.authorPhoto,
          authorCity: story.authorCity,
          authorAge: story.authorAge,
          authorGender: story.authorGender,
          isMine,
          hasUnviewed: !isViewed,
          stories: [formattedStory]
        });
      } else {
        const group = authorMap.get(phone);
        group.stories.push(formattedStory);
        if (!isViewed) group.hasUnviewed = true;
      }
    }

    // Convert map to array: Put user's own stories first, then users with unviewed stories, then rest
    const storyGroups = Array.from(authorMap.values());
    storyGroups.sort((a, b) => {
      if (a.isMine) return -1;
      if (b.isMine) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    return res.status(200).json({
      status: 'success',
      totalGroups: storyGroups.length,
      data: storyGroups
    });
  } catch (error) {
    console.error('[Get Active Stories Error]:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve stories.'
    });
  }
};

/**
 * Mark a story as viewed
 */
exports.viewStory = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;
    if (!currentPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid story ID format.' });
    }

    const story = await Story.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ status: 'error', message: 'Story not found or expired.' });
    }

    const alreadyViewed = Array.isArray(story.views) && story.views.some(v => v.phone === currentPhone);
    if (!alreadyViewed) {
      story.views.push({ phone: currentPhone, viewedAt: new Date() });
      await story.save();
    }

    return res.status(200).json({
      status: 'success',
      viewsCount: story.views.length
    });
  } catch (error) {
    console.error('[View Story Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to record story view.' });
  }
};

/**
 * Like / react to a story
 */
exports.likeStory = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;
    if (!currentPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid story ID format.' });
    }

    const story = await Story.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ status: 'error', message: 'Story not found or expired.' });
    }

    const existingIndex = story.likes.findIndex(l => l.phone === currentPhone);
    let isLiked = false;

    if (existingIndex > -1) {
      story.likes.splice(existingIndex, 1);
      isLiked = false;
    } else {
      story.likes.push({ phone: currentPhone, likedAt: new Date() });
      isLiked = true;
    }

    await story.save();

    return res.status(200).json({
      status: 'success',
      isLiked,
      likesCount: story.likes.length
    });
  } catch (error) {
    console.error('[Like Story Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to update story like.' });
  }
};

/**
 * Delete own story
 */
exports.deleteStory = async (req, res) => {
  try {
    const currentPhone = req.user ? req.user.phone : null;
    if (!currentPhone) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid story ID format.' });
    }

    const story = await Story.findOne({ _id: id });
    if (!story) {
      return res.status(404).json({ status: 'error', message: 'Story not found.' });
    }

    if (story.authorPhone !== currentPhone && !req.user.isAdmin && !req.user.isDeveloper) {
      return res.status(403).json({ status: 'error', message: 'You can only delete your own stories.' });
    }

    await Story.deleteOne({ _id: id });
    await invalidateStoriesCache();

    return res.status(200).json({
      status: 'success',
      message: 'Story deleted successfully.'
    });
  } catch (error) {
    console.error('[Delete Story Error]:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to delete story.' });
  }
};
