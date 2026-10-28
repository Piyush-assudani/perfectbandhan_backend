const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const auth = require('../middleware/auth.middleware');
const { createDedupeMiddleware } = require('../middleware/dedupe.middleware');

const postDedupe = createDedupeMiddleware(
  (req) => req.user ? `posts:${req.user.phone}:${req.path}` : null,
  500
);

router.post('/', auth, postController.createPost);
router.get('/', auth, postDedupe, postController.getFeedPosts);
router.get('/user/:phone', auth, postDedupe, postController.getUserPosts);
router.post('/:id/like', auth, postController.likePost);
router.post('/:id/comment', auth, postController.addComment);
router.delete('/:id', auth, postController.deletePost);

module.exports = router;
