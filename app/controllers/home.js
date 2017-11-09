const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');

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
<<<<<<< HEAD
    console.log("Testing something.");
    res.render('index', { title: 'Pollify', join: 'Join', host: 'Host', roomId: "Room Id" });
=======
    let room = new Room('kappaface-no-apikey');

    let track = new Track("4zGvb8hxGLB2jEPRFiRRqw");

    // console.log(require('../models/spotify'));
    res.render('index', {
        title: room.name
    });
>>>>>>> fb2c478b135405ee92d36ef33d350cd9d503c86f
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

router.post('/join', (req, res, next) => {
    let roomId = req.query.roomId;
    if (roomId !== undefined) {
        res.redirect("/#{roomId}");
    } else {
        res.sendStatus(400);
    }
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
