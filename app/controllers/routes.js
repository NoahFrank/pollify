const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');
const spotify = require('../models/spotify');

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
    res.body.trackId.votes++; // TODO: Assumes trackId being sent in body
    res.redirect(`/${res.params.roomId}`);
});

router.post('/:roomId/unvote', (req, res, next) => {
    res.body.trackId.votes--; // TODO: Assumes trackId being sent in body
    res.redirect(`/${res.params.roomId}`);
});

router.post('/:roomId/pause', (req, res, next) => {
    spotify.pause().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to pause playback.");
    });
});

router.post('/:roomId/play', (req, res, next) => {
    spotify.play().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to play playback.");
    });
});

router.post('/:roomId/skip', (req, res, next) => {
    spotify.skip().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to skip playback.");
    });
});

router.post('/:roomId/back', (req, res, next) => {
    spotify.previous().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to back playback.");
    });
});

router.post('/join', (req, res, next) => {
    let roomId = req.body.roomId;
    if (roomId !== undefined) {
        client.exists(roomId, (err, result) => {
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
