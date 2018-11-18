const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');

// Setup Redis connection
const redis = require("redis");
const client = redis.createClient();

// Setup logging
const log = require('../../config/logger');

// Print Redis errors
client.on("error", (err) => {
    log.error("Redis Error " + err);
});

module.exports = (app) => {
    app.use('/', router);
};


router.get('/', (req, res, next) => {
    // TODO: Be careful on how we store the JS class in Redis
    // Source: https://medium.com/@stockholmux/store-javascript-objects-in-redis-with-node-js-the-right-way-1e2e89dbbf64

    res.render('index', {
        title: "Pollify"
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
    spotify.pause().then( (result) => {  // Supports device_id flag
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to pause playback.");
    });
});

router.post('/:roomId/play', (req, res, next) => {
    spotify.play().then( (result) => {  // Object can be passed to play() to play a specific song, e.g. .play({device_id: wa2324ge5in3E8h, uris: []}
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to play playback.");
    });
});

router.get('/:roomId/skip', (req, res, next) => {  // TODO: Should Skip/Back/Play be GET or POST? Owner override or vote-based events?
    // Need some security check that this was actually backed by vote
    let roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }

    Room.get(roomId, (err, room) => {
        if (!room) {
            log.error(`Failed to get room id=${roomId}`);
            res.status(500).send("Server error: Failed to get room data.");
            return next();
        }

        let spotify = require('../models/spotify')(room.owner);
        spotify.skipToNext()
            .then( () => {
                log.debug(`Successfully skipped to next track for Room ${room.name}`);
                res.redirect(`/${roomId}`);
            }).catch( (err) => {
                log.error(err);
                res.status(500).send("Server error: Failed to skipToNext.");
            });
    });
});

router.post('/:roomId/back', (req, res, next) => {
    // Need some security check that this was actually backed by vote
    let roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    Room.get(roomId, (err, room) => {
        if (!room) {
            log.error("Failed to get room");
            res.status(500).send("Server error: Failed to get room data.");
            return next();
        }

        let spotify = require('../models/spotify')(room.owner);
        spotify.skipToPrevious()
            .then(() => {
                log.debug(`Successfully skipped back to previous track for Room ${room.name}`);
                res.redirect(`/${roomId}`);
            }).catch((err) => {
                log.error(err);
                res.status(500).send("Server error: Failed to skipToPrevious.");
            });
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

router.get('/:roomId/add/:trackId', (req, res, next) => {
    // 1. Get room
    Room.get(req.params.roomId, (err, room) => {
        // 2. Ensure valid room object from db
        if (room) {
            // 3. Construct new Track object with suggestor and populate Track data with getTrackById
            let newTrack = new Track("Bob");  // TODO: Determine suggestor's name
            let spotify = require('../models/spotify')(room.owner);
            newTrack.getTrackById(spotify, req.params.trackId).then( () => {
                // 4. Done populating Track!  Now make sure to actually add track to room playlist and redirect back to room after successful queue add
                if (room.isPlaylistCreated()) {
                    spotify.addTracksToPlaylist(room.owner.profileId, room.roomPlaylistId, [newTrack.uri])
                        .then( () => {
                            log.info(`Added Track ${newTrack.uri} to Playlist for room ${room.name}`)
                        }).catch( (err) => {
                            log.error(`Failed to add track ${newTrack.uri} to playlist for room ${room.name}, likely a spotify API error!`, err);
                    });
                } else {
                    log.error("Failed to add track to playlist, this room has no linked playlist!");
                }

                log.debug(`Added track ${newTrack.name} to queue for room ${room.name} from suggestor ${newTrack.suggestor}`);
                room.save((err, result) => {
                    if (err) {
                        log.error(err);
                        res.status(500).send("Server error: Failed to find track.");
                    } else {
                        // 5. Return user to room home
                        res.redirect(`/${room.name}`);
                    }
                });
            }).catch( err => {
                log.error(err);
            });
        } else {
            log.error(`Attempted to find room ${room.name} but doesn't exist`);
            res.sendStatus(404);
        }
    });
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
            // 2. Create spotify instance off room (or rather change the tokens each time to make the corresponding search request from the room it originated)
            let spotify = require('../models/spotify')(room.owner);
            // 3. Query spotify
            spotify.search(trackSearch, ['track'])  // Can search many types or combinations of ['album', 'artist', 'playlist', and 'track']
                .then(function(data) {
                    let tracks = data.body.tracks.items;
                    // 4. Manipulate response to an output we are going to display
                    let trackSearchOutput = [];
                    for (let track of tracks) {
                        let manipulatedTrack = {};
                        manipulatedTrack.id = track.id;
                        manipulatedTrack.name = track.name;
                        manipulatedTrack.albumName = track.album.name;
                        let seconds = track.duration_ms / 1000;
                        let minutes = parseInt(seconds / 60);
                        let secondsLeftOver = (seconds%60).toFixed(0);
                        manipulatedTrack.duration = `${minutes}:${secondsLeftOver}`;  // TODO: Convert this to human readable
                        manipulatedTrack.artistName = "";
                        for (let i = 0; i < track.artists.length; i++) {
                            let artist = track.artists[i];
                            manipulatedTrack.artistName += artist.name;
                            manipulatedTrack.artistName += track.artists.length-1 != i ? ", " : '';
                        }
                        // put raw track to pass to other routes later
                        manipulatedTrack.rawTrackJson = track;
                        manipulatedTrack.albumImage = track.album.images[2].url;
                        trackSearchOutput.push(manipulatedTrack);
                    }
                    // 5. How to return results
                    res.render('searchResults', {
                        // This doesn't feel great, but not sure how else to
                        // render the search results dynamically without using some
                        // sort of javascript on the frontend to make this query
                        searchQuery: trackSearch,
                        results: trackSearchOutput,
                        roomId: room.name,
                    });
                }).catch(function(err) {
                // TODO: handle this error more elegantly?
                log.error(err);
                res.status(500).send("Server error: Failed to find track.");
            });
        }
    });
});

router.post('/:roomId/remove/:trackId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});
