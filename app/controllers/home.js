const express = require('express');
const router = express.Router();
const Article = require('../models/article');

module.exports = (app) => {
    app.use('/', router);
};

router.get('/', (req, res, next) => {
    const articles = [new Article(), new Article()];
    res.render('index', {
        title: 'Generator-Express MVC',
        articles: articles
    });
});

router.get('/', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.get('/:roomId', (req, res, next) => {

});

router.post('/:roomId/vote', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/unvote', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/pause', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/play', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/skip', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/join/:roomId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/add/:songId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/remove/:songId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});
