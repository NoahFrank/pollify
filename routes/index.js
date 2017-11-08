var express = require('express');
var router = express.Router();

// 5IDyfpSvXNqBZi2bTa9Nez

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/:roomId', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/vote', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/unvote', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/pause', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/play', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/skip', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/join/:roomId', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/add/:songId', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/remove/:songId', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

module.exports = router;
