const express = require('express');
const router = express.Router();
const storyController = require('../controllers/story.controller');
const auth = require('../middleware/auth.middleware');
const { createDedupeMiddleware } = require('../middleware/dedupe.middleware');

// Deduplication for reading stories (500ms debounce per user)
const storiesDedupe = createDedupeMiddleware(
  (req) => req.user ? `stories:${req.user.phone}` : null,
  500
);

// Routes
router.post('/', auth, storyController.createStory);
router.get('/', auth, storiesDedupe, storyController.getActiveStories);
router.post('/:id/view', auth, storyController.viewStory);
router.post('/:id/like', auth, storyController.likeStory);
router.delete('/:id', auth, storyController.deleteStory);

module.exports = router;
