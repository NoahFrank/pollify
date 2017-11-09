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
    let room = new Room('kappaface-no-apikey');

    let track = new Track("4zGvb8hxGLB2jEPRFiRRqw");

    // console.log(require('../models/spotify'));
    res.render('index', {
        title: room.name
    });
});

router.get('/:roomId', (req, res, next) => {
    let roomId = req.params.roomId;
    console.log(`testing ${roomId}`);
    client.get(roomId, (err, reply) => {
        if (reply === null) {
            // doesn't exist
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        } else {
            // render template passing Room object
            log.info(`Rendering ${roomId} with ${reply}`);
            res.render('room', reply);
        }
    });
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
    let roomId = req.body.roomId;
    console.log(`WHAT AM I TRYING TO DO RIGHT NOW ${roomId}`);
    if (roomId !== undefined) {
        client.exists(roomId, (err, result) => {
            console.log(`${result}`);
            if (result == 1) {
                log.info(`Connection to ${roomId} successful`);
                res.redirect(`/${roomId}`);
            } else {
                log.error(`Attempted to join ${roomId} but room doesn't exist`);
                res.sendStatus(404);
            }
        });
    } else {
        log.error(`Connection to ${roomId} failed`);
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
