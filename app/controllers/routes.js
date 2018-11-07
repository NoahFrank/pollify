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

    // TODO: Be careful on how we store the JS class in Redis
    // Source: https://medium.com/@stockholmux/store-javascript-objects-in-redis-with-node-js-the-right-way-1e2e89dbbf64

    let track = new Track("4zGvb8hxGLB2jEPRFiRRqw");

    // console.log(require('../models/spotify'));
    res.render('index', {
        title: room.name
    });
});

router.get('/:roomId', (req, res, next) => {
    let roomId = req.params.roomId;
    client.get(roomId, (err, room) => {
        if (room === null) {
            // doesn't exist
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        } else {
            // render template passing Room object
            log.info(`Rendering ${roomId} with ${room}`);
            room = JSON.parse(room);
            res.render('room', {
                roomId: room.name
            });
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
    // TODO: I am starting to think fully using a spotify playlist would be better than mirror state locally
    // TODO: because you can swap the order of songs with the API, and we will be using a shared resource so we will
    // TODO: encounter less concurrency issues.  This will increase the overall reliability and consistent behavior
    // TODO: mitigating race conditions like removing a song and skipping a song at the same time.  This may cost us
    // TODO: performance but does it really? Does it really?  What are we losing?  We can still grab the current playlist
    // TODO: and render our own voting view of it.  We can still pause/play, the only thing we have to mirror is the voting.
    // TODO: Once voting is done, we recalculate the queue, and make sure the spotify queue is the same.  That could be
    // TODO: an issue though, because if we have many swaps, we need to write a custom (insertion) sorting function that
    // TODO: logs all the swaps performed so they can be mirrored on the spotify side.

    Promise.all([client.get(res.params.roomId), spotify.skip()])
        .then( (results) => {
            let room = results[0];
            let skipStatus = results[1];

            room.skipTrack(); // Assumes current spotify song, could be painpoint

            res.redirect(`/${res.params.roomId}`);
        }).catch( (err) => {
            log.error(err);
            res.status(500).send("Server error: Failed to skip playback.");
            // TODO: Mirror error in state, put song back?
        });
});

router.post('/:roomId/back', (req, res, next) => {
    // TODO: Mirror state locally in Redis
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

router.post('/create', (req, res, next) => {
    let apiKey = req.body.apiKey;
    let room = new Room(apiKey);
    client.set(room.name, JSON.stringify(room), (err, result) => {
        if (result) {
            log.info(`Connection to ${room.name} successful`);
            res.redirect(`/${room.name}`);
        } else {
            log.error(`Attempted to join ${room.name} but room doesn't exist`);
            res.sendStatus(404);
        }
    });
});

router.post('/:roomId/add/:trackId', (req, res, next) => {
    client.get(res.params.trackId, (err, result) => {
        if (err) {
            log.error(err);
            res.status(500).send("Server error: Failed to add track.");
        } else {
            result.addTrack(new Track(res.body.track, "Bob")); // Assumes body gives full track data from search

        }
    });

    res.render('index', { title: 'Express' });
});

router.post('/:roomId/search/', (req, res, next) => {
    // 1. Get room
    let roomId = req.params.roomId;
    let trackSearch = req.body.trackSearch;
    client.get(roomId, (err, roomString) => {
        if (roomString === null) {
            // doesn't exist
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        } else {
            log.info(`Found Room ${roomString}`);
            let room = JSON.parse(roomString);
            // 2. Create spotify instance off room
            spotify.setAccessToken(room.apiKey);
            // 3. Query spotify
            spotify.searchTracks(trackSearch)
                .then(function(data) {
                    // 4. How to return results?
                    res.render('searchResults', {
                        // This doesn't feel great, but not sure how else to
                        // render the search results dynamically without using some
                        // sort of javascript on the frontend to make this query
                        searchQuery: trackSearch,
                        results: data.body.tracks.items
                    });
                }, function(err) {
                    log.error(err);
                    res.status(500).send("Server error: Failed to find track.");
                });
        }
    });
})

router.post('/:roomId/remove/:trackId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});
