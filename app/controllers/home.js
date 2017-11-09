const express = require('express');
const router = express.Router();

const Room = require('../models/room');

// Setup Redis connection
const redis = require("redis");
const client = redis.createClient();

// Setup logging
const log = require('winston');

// Print Redis errors
client.on("error", (err) => {
    log.error("Redis Error " + err);
});


module.exports = (app) => {
    app.use('/', router);
};

router.get('/', (req, res, next) => {
    log.info("starting meme");
    let room = new Room('kappaface-no-apikey');
    res.render('index', {
        title: 'Generator-Express MVC'
    });
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
