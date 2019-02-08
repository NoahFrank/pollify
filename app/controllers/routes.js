const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');

// Setup logging
const log = require('../../config/logger');

module.exports = (app) => {
    app.use('/', router);
};

// CONSTANTS
const ADDED_TRACK_KEY = "RecentlyAddedTrackThatNeedsToBeStoredBecauseSpotifyDoesn'tUpdateThatQuick";
// END CONSTANTS

function saltAddedTrackKey(roomId) {
    return ADDED_TRACK_KEY + roomId;
}

function isRoomIdValid(roomId, res) {
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed, cannot get Room name from URL`);
        res.sendStatus(400).send("Failed to get room ID");
        return false;
    } else {
        return true;
    }
}

function buildTrackView(track, trackPositionIndex, includeAlbumImage=false, includeFullTrack=false) {
    let manipulatedTrack = {};

    // Set optional fields if supplied
    if (includeFullTrack) {
        // put raw track to pass to other routes later
        manipulatedTrack.rawTrackJson = track;
    }
    if (includeAlbumImage) {
        manipulatedTrack.albumImage = track.album.images[2].url;
    }

    manipulatedTrack.position = trackPositionIndex;
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

    return manipulatedTrack;
}

function cacheDeleteCallback(err, numOfDeletedEntries) {
    if (err) {
        log.error(`Failed to delete key in cache with err=${err} and message=${err.message}`)
    } else {
        log.debug(`Successfully deleted ${numOfDeletedEntries} entry(s) for key in cache`);
    }
}


router.get('/', (req, res, next) => {
    // TODO: Be careful on how we store the JS class in Redis
    // Source: https://medium.com/@stockholmux/store-javascript-objects-in-redis-with-node-js-the-right-way-1e2e89dbbf64

    res.render('index', {
        title: "Pollify"
    });
});

router.get('/:roomId', (req, res, next) => {
    let roomId = req.params.roomId;
    if (!isRoomIdValid(roomId, res))
        return next();

    let cache = req.app.get('cache');
    const includeAlbumImage = true;

    Room.get(roomId, cache)
        .then( (room) => {
            if (!room.isPlaylistCreated()) {
                log.error(`This room (${roomId}) has no linked playlist!  That's a huge problem...`);
                res.status(500).send(`Failed to add track because this Room doesn't have a Spotify playlist!`);
                return next();
            }

            room.spotify.getPlaylistTracks(room.playlistId)
                .then( (playlistTracks) => {
                    let queueList = [];
                    let tracks = playlistTracks.body.items;

                    let addedTrack = null;
                    let isAddedTrackAlreadyInPlaylist = false;
                    const saltedAddedTrackKey = saltAddedTrackKey(roomId);
                    if (cache.get(saltedAddedTrackKey) !== undefined) {  // Ensure we check SALTED key to avoid collisions, no error checking on cache.get
                        addedTrack = cache.get(saltedAddedTrackKey);
                        if (addedTrack === undefined)
                            log.error(`We really messed up, cache.get failed...`);
                        log.debug(`Got passed track (${addedTrack.name} - ${addedTrack.artistName}) context from redirect!`);
                    }

                    let trackPositionIndex = 1;
                    for (let track of tracks) {
                        track = track.track;  // Playlist Tracks have more info, so Track info is nested

                        // If there is a new addedTrack, then we need to check if its already in the playlist
                        if (addedTrack && track.id == addedTrack.id) {
                            log.debug(`Found added track already in spotify!`);
                            isAddedTrackAlreadyInPlaylist = true;

                            log.debug(`Deleted key=${saltedAddedTrackKey} from cache because we already have it in spotify`);
                            cache.del(saltedAddedTrackKey, cacheDeleteCallback);
                        }

                        let manipulatedTrack = buildTrackView(track, trackPositionIndex, includeAlbumImage);
                        queueList.push(manipulatedTrack);

                        trackPositionIndex += 1;
                    }

                    // Add track if we don't already have it!
                    if (!isAddedTrackAlreadyInPlaylist && addedTrack != null) {
                        let cachedAddedTrack = buildTrackView(addedTrack, trackPositionIndex, includeAlbumImage);
                        queueList.push(cachedAddedTrack);

                        // Make sure to reset cache key for next time because we just used it, now it will be in spotify, unless there was an extremely fast double refresh
                        log.debug(`Deleted key=${saltedAddedTrackKey} from cache after adding it to track`);
                        cache.del(saltedAddedTrackKey, cacheDeleteCallback);
                    }

                    // TODO: Now would be a great time to resort position of tracks in queue inside trackSearchOutput

                    log.info(`Rendering ${roomId}`);
                    res.render('room', {
                        roomId: roomId,
                        queue: queueList,
                    });
                })
                .catch( (err) => {
                    log.error(`Failed to get Room ${roomId}'s Spotify playlist with error=${err} and message=${err.message}`);
                    res.status(500).send("Failed to get Spotify Playlist for this Room");
                    return next();
                }
            );
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/vote', (req, res, next) => {
    res.body.trackId.votes++; // TODO: Assumes trackId being sent in body
    res.redirect(`/${res.params.roomId}`);
});

router.post('/:roomId/unvote', (req, res, next) => {
    res.body.trackId.votes--; // TODO: Assumes trackId being sent in body
    res.redirect(`/${res.params.roomId}`);
});

router.get('/:roomId/pause', (req, res, next) => {
    let roomId = req.params.roomId;
    if (!isRoomIdValid(roomId, res))
        return next();

    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            log.debug(`Attempting to pause spotify for Room ${room.name}`);
            room.spotify.pause()
                .then( (pauseResult) => {
                    log.info(`Successfully paused Spotify for Room ${room.name}`);
                })
                .catch( (err) => {
                    log.error(`Failed to pause Spotify for current track in Room ${room.name} with error=${err} and message=${err.message}`);
                }
            );
            res.redirect(`/${roomId}`);
        })
        .catch( (err) => {
            log.error(`Failed to connect to Room ${roomId}! error=${err} and message=${err.message}`);
            res.status(500).send(`Failed to connect to Room ${roomId}!`);
        }
    );
});

router.post('/:roomId/play', (req, res, next) => {
    spotify.play()
        .then( (result) => {  // Object can be passed to play() to play a specific song, e.g. .play({device_id: wa2324ge5in3E8h, uris: []}
            res.redirect(`/${res.params.roomId}`);
        })
        .catch( (err) => {
            log.error(err);
            res.status(500).send("Server error: Failed to play playback.");
        }
    );
});

router.post('/:roomId/skip', (req, res, next) => {  // TODO: Should Skip/Back/Play be GET or POST? Owner override or vote-based events?
    // Need some security check that this was actually backed by vote
    let roomId = req.params.roomId;
    if (!isRoomIdValid(roomId, res))
        return next();

    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            return Promise.all([room, room.spotify.skipToNext()]);
        })
        .then( (context) => {  // Triggered when skipToNext promise resolves
            let [room, skipToNextResult] = context;
            log.debug(`Successfully skipped to next track for Room ${room.name}`);
            res.redirect(`/${roomId}`);
        })
        .catch( (err) => {
            // Could be Room.get or skipToNext error
            log.error(`Failed to skip track in queue! error=${err} and message=${err.message}`);
            res.status(500).send(`Failed to skip Track in queue for your Room`);
        }
    );
});

router.post('/:roomId/back', (req, res, next) => {
    // Need some security check that this was actually backed by vote
    let roomId = req.params.roomId;
    if (!isRoomIdValid(roomId, res))
        return next();

    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            return Promise.all([room, room.spotify.skipToPrevious()]);
        })
        .then( (context) => {  // Triggered when skipToPrevious promise resolves
            let [room, skipToPreviousResult] = context;
            log.debug(`Successfully skipped to previous track for Room ${room.name}`);
            res.redirect(`/${roomId}`);
        })
        .catch( (err) => {
            // Could be Room.get or skipToPrevious error
            log.error(`Failed to skip to previous track in queue! error=${err} and ${err.message}`);
            res.status(500).send(`Failed to skip to previous Track in queue for your Room`);
        }
    );
});

router.post('/join', (req, res, next) => {
    let roomId = req.body.roomId;

    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    req.app.get('cache').getTtl(roomId, (ttl) => {
        if (ttl === undefined) {  // Undefined means key does not exist
            log.error(`Attempted to join ${roomId} but room doesn't exist with error=${err} and message=${err.message}`);
            res.sendStatus(404);
        } else {  // 0 or timestamp of how long key-value will be in cache
            log.info(`Connection to ${roomId} successful`);
            res.redirect(`/${roomId}`);
        }
    });
});

router.get('/:roomId/add/:trackId', (req, res, next) => {  // TODO: Change back to POST
    let roomId = req.params.roomId;
    let trackId = req.params.trackId;
    if (!isRoomIdValid(roomId, res))
        return next();

    let cache = req.app.get('cache');
    // 1. Get room and spotify instance for this room
    Room.get(roomId, cache)
        .then( (room) => {
            // 2. Construct new Track object with suggestor and populate Track data with getTrackById
            let newTrack = new Track("Bob");  // TODO: Determine suggestor's name
            // This "joins" all Promises together usually, but in this case we use it to pass context to the next .then()
            // while also resolving the getTrackById promise and its resolved value(s)
            return Promise.all([room, newTrack.getTrackById(room.spotify, trackId)]);
        })
        .then( (context) => {
            let [room, newTrack] = context;  // Array deconstruction, why can't we have nice things
            // 3. Done populating Track!  Now make sure to actually add track to room playlist and redirect back to room after successful queue add
            if (!room.isPlaylistCreated()) {  // Sanity check to ensure the Room actually created a Playlist
                log.error(`This room (${roomId}) has no linked playlist!  That's a huge problem...`);
                res.status(500).send(`Failed to add track because this Room doesn't have a Spotify playlist!`);
                return next();
            }

            // TODO: Consider returning the addTracksToPlaylist promise and making another .then() chain to keep uniformity
            room.spotify.addTracksToPlaylist(room.playlistId, [newTrack.uri])  // Has 3rd options parameter that allows "position"!
                .then( () => {
                    // 4. Successful finish! We added the track to the playlist!
                    // TODO: Handle positioning of the track in queue
                    log.debug(`Added track ${newTrack.name} to queue for room ${room.name} from suggestor ${newTrack.suggestor}`);
                })
                .catch( (err) => {
                    // TODO: Notify user we failed to add track to spotify playlist "queue"
                    log.error(`Failed to add track ${newTrack.uri} to playlist for room ${room.name}, likely a spotify API error! error=${err} and message=${err.message}`);
                }
            );

            // 5. Return user to room home with addedTrack in cache
            cache.set(saltAddedTrackKey(roomId), newTrack);
            res.redirect(`/${room.name}`);
        })
        .catch( (err) => {
            // Could be Room.get or getTrackById error
            log.error(`Failed to add track to queue! error=${err} and message=${err.message}`);
            res.status(500).send(`Failed to add Track to queue for your Room`);
        }
    );
});

router.post('/:roomId/search/', (req, res, next) => {
    // 1. Get room
    let roomId = req.params.roomId;
    if (!isRoomIdValid(roomId, res))
        return next();

    let trackSearch = req.body.trackSearch;
    // let searchType = req.body.searchType.toLowerCase();  // Valid types are: album, artist, playlist, and track
    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            log.info(`Found Room for search=${room.name}`);
            // 2. Query spotify for results
            return Promise.all([room, room.spotify.search(trackSearch, ['track'])]);  // Can search many types or combinations of ['album', 'artist', 'playlist', and 'track']
        })
        .then( (context) => {
            let [room, data] = context;  // Array deconstruction, why can't we have nice things
            let tracks = data.body.tracks.items;  // TODO: Generalize for all searchType cases - let searchResults = data.body[searchType+"s"].items;
            // 3. Manipulate response to an output we are going to display
            let trackSearchOutput = [];
            for (let track of tracks) {
                let manipulatedTrack = buildTrackView(track, 0, true, true);
                trackSearchOutput.push(manipulatedTrack);
            }
            // 4. Render search results
            res.render('searchResults', {
                // This doesn't feel great, but not sure how else to
                // render the search results dynamically without using some
                // sort of javascript on the frontend to make this query
                searchQuery: trackSearch,
                results: trackSearchOutput,
                roomId: room.name,
            });
        })
        .catch( (err) => {
            // Could be Room.get or spotify.search error
            log.error(`Failed to search for ${trackSearch}! error=${err} and message=${err.message}`);
            res.status(500).send(`Failed to add Track to queue for your Room`);
        }
    );
});

router.post('/:roomId/remove/:trackId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});
