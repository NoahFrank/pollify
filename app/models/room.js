const Moniker = require('moniker');
const Track = require('../models/track');

// Setup logging
const log = require('../../config/logger');

// CONSTANTS
const ADDED_TRACK_KEY = "RecentlyAddedTrackThatNeedsToBeStoredBecauseSpotifyDoesn'tUpdateThatQuick";
// END CONSTANTS

class Room {
    constructor (owner, name=Moniker.generator([Moniker.adjective, Moniker.noun]).choose()) {
        // TODO check for collision of Moniker name generation, two rooms with same name would likely throw many errors
        this.name = name;
        this.owner = owner;
        this.playlistId = null;
        // array of track objects that reflects the current top voted songs
        this.trackList = [];
        this.users = new Set();

        this.currentPlaybackState = null;
        this.votesToSkipCurrentSong = new Set();

        // Also create a dedicated instance of SpotifyWebApi to make ALL requests for this Room using the given Owner authorized credentials
        this.spotify = require('../models/spotify')(owner);
    }

    isPlaylistCreated() {
        return this.playlistId !== null;
    }

    static async get(roomId, cache) {
        try {
            const room = await cache.get(roomId);

            if (room === null || room === undefined) {
                // doesn't exist
                throw new Error(`${roomId} doesn't exist`);
            } else {
                log.info(`Found Room ${room.name}`);
                return room;
            }
        } catch(err) {
            // Always log error so no need in each catch statement where this is used
            log.error(`Failed to get roomId=${roomId} from db with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            // Make sure to not negate any custom .catch statements by passing this error down the line
            throw err;  // We can handle this in a Promise.catch or in try-catch block
        }
    }

    async save(cache) {
        // before save perform sorting of tracks based on user votes:
        const result = await this.orderSongs();
        // now save
        try {
            // Cache stores (key, value) with set() so we are storing (roomName, roomObject)
            const success = await cache.set(this.name, this);
            return success;
        } catch(err) {
            log.error(`Failed to save room to db/cache, with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            return false;
        }
    }

    async refreshAccessToken() {
        if (this.owner.tokenExpirationEpoch < new Date()) {  // Check if token has expired!
            log.info("Token expired, refreshing now...");
            try {
                const data = await this.spotify.refreshAccessToken();
                // Make sure important tokens, etc are updated in db and state
                let tokenExpirationEpoch = new Date();
                tokenExpirationEpoch.setSeconds(tokenExpirationEpoch.getSeconds() + data.body['expires_in']);
                this.owner.accessToken = data.body['accessToken'];
                this.owner.refreshToken = data.body['refreshToken'];

                log.info(
                    `Refreshed token for room owner's profile_id=${this.owner.profileId}. 
                        It now expires at ${new Date(tokenExpirationEpoch)}!`
                );
            } catch(err) {
                log.error(`Could not refresh the token! error=${err.message}`);
            }
        }
    }

    findTrack(trackId) {
        for (let roomTrack of this.trackList) {
            if (roomTrack.id === trackId) {
                return roomTrack;
            }
        }
        return null;
    }

    addTrackToTrackList(track) {
        // Make sure track is not already in trackList
        if (this.findTrack(track.id)) return;

        this.trackList.push(track);
    }

    removeTrack(trackId, cache, callback) {
        let trackList = this.trackList;
        let removedTrack;
        for (let [i, roomTrack] of trackList.entries()) {
            if (roomTrack.id === trackId) {
                removedTrack = this.trackList.splice(i, 1);
                break;
            }
        }
        if (removedTrack.length === 1) {
            removedTrack = removedTrack[0];
            // remove the removed track from spotify
            this.spotify.removeTracksFromPlaylist(this.playlistId, [{uri: removedTrack.getUri()}])
                .then( (success) => {
                    this.save(cache)
                        .then( (success) => {
                            log.info(`Successfully saved Room ${this.name} with removed track`);
                            return callback(null, success);
                        })
                        .catch( (err) => {
                            log.error(`Failed to save removed track from playlist. err=${err} and message=${err.message}`);
                            return callback(err, null);
                        }
                    );
                })
                .catch( (err) => {
                    log.error(`Failed to remove track from spotify playlist. err=${err} and message=${err.message}`);
                    return callback(err, null);
                }
            );
        } else {
            return callback(null, true);
        }
    }

    initializeTrackList(track) {
        if (this.findTrack(track.id)) return;

        this.trackList.push(track);
    }

    addTrackVote(sessionId, track) {
        if (!track.votedToSkipUsers.has(sessionId)) {
            track.votedToSkipUsers.add(sessionId);
        }
    }

    removeTrackVote(sessionId, track) {
        if (track.votedToSkipUsers.has(sessionId)) {
            track.votedToSkipUsers.delete(sessionId);
        }
    }

    async voteToRemoveTrack(sessionId, track, cache, callback) {
        if (track.votedToRemoveUsers.has(sessionId)) {
            return callback(`User is already voted to remove this track ${track.name}`, false);
        }
        track.votedToRemoveUsers.add(sessionId);
        // This if condition is the skip vote threshold ALGORITHM
        if (Math.floor(track.votedToRemoveUsers.size/this.users.size) > 0.5) {
            let thisRoom = this;
            try {
                this.removeTrack(track.id, cache, callback);
            } catch(err) {
                log.error(`Failed to perform a community remove! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return callback(err, null);
            }
        } else {  // Skip vote threshold not met! Just save this room
            this.save(cache)
                .then( () => {
                    log.debug(`Successfully saved rooms votes to remove of Track ${track.name}`);
                    return callback(null, true);
                })
                .catch( (err) => {
                    log.error(`Failed to save votes to remove of Track ${track.name}. error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    return callback(err, null);
                }
            );
        }
    }

    unvoteToRemoveTrack(sessionId, track, cache, callback) {
        if (!track.votedToRemoveUsers.has(sessionId)) {
            return callback(`User is already not voting for to remove this track ${track.name}`, false);
        }
        track.votedToRemoveUsers.delete(sessionId);
        this.save(cache)
            .then( () => {
                log.debug(`Successfully unvoted to remove track ${track.name} for Room ${this.name}`);
                return callback(null, true);
            })
            .catch( (err) => {
                log.error(`Failed to unvote to remove track ${track.name}! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return callback(err, null);
            }
        );
    }

    getSetAsArray(attr) {
        return Array.from(this[attr]);
    }

    songSort(a,b) {
        if (a.votedToSkipUsers.size > b.votedToSkipUsers.size) {
            return -1;
        }
        if (a.votedToSkipUsers.size < b.votedToSkipUsers.size) {
            return 1;
        }
        // TODO: secondary sort?
        return 0;
    }

    async orderSongs() {
        let output = false;
        // Store the first track in queue for equality check and manipulation
        const nextTrackPreSort = this.trackList[0];

        if (this.trackList.length) {
            this.trackList.sort(this.songSort);
            output = true;
        }

        // If we made sorting changes to the FIRST TRACK IN QUEUE, then update playlist in spotify
        if (output && !this.trackList[0].equals(nextTrackPreSort)) {
            // UPDATE SPOTIFY PLAYLIST
            log.debug(`We are updating FIRST TRACK IN QUEUE because it was changed by sort`);
            // Need to make sure "this.trackList[0].uri" is populated
            if (this.trackList[0].uri.length == 0) {
                log.error("First track's uri isn't populated! Huge problem");
                return false;
            }
            try {
                await this.spotify.removeTracksFromPlaylist(this.playlistId, [{uri: this.trackList[0].uri}]);
                await this.spotify.addTracksToPlaylist(this.playlistId, [this.trackList[0].uri], {position: 0});
            } catch(err) {
                log.error(`Failed to remove or add a track from room's playlist, error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            }
        }
        return output;
    }

    isOwner(sessionId) {
        return this.owner.sessionId === sessionId;
    }

    async getCurrentPlayback() {
        // Get room's current playback
        try {
            const playback = await this.spotify.getMyCurrentPlaybackState();
            if (Object.keys(playback.body).length === 0) {
                this.currentPlaybackState = null;
                return this.currentPlaybackState;
            }
            this.currentPlaybackState = playback.body;
            return this.currentPlaybackState;
        } catch(err) {
            log.error(`Failed to get Room ${this.name}'s current playback state with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            throw err;
        }
    }

    async voteToSkipCurrentSong(sessionId, cache, callback) {
        if (this.votesToSkipCurrentSong.has(sessionId)) {
            return callback(`User is already voting for current song`, false);
        }
        this.votesToSkipCurrentSong.add(sessionId);
        // This if condition is the skip vote threshold ALGORITHM
        if (Math.floor(this.votesToSkipCurrentSong.size/this.users.size) > 0.5) {
            let thisRoom = this;
            try {
                const context = await this.spotify.skipToNext();
                // Triggered when skipToNext promise resolves
                log.debug(`Successfully performed a community skip to next track for Room ${this.name}`);
                thisRoom.votesToSkipCurrentSong = new Set();
                thisRoom.save(cache)
                    .then( () => {
                        log.debug(`Successfully reset rooms votes to skip current track`);
                        return callback(null, true);
                    })
                    .catch( (err) => {
                        log.error(`Failed to save reset votes to skip current track. error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                        return callback(err, null);
                    }
                );
            } catch(err) {
                log.error(`Failed to perform a community skip! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return callback(err, null);
            }
        } else {  // Skip vote threshold not met! Just save this room
            this.save(cache)
                .then( () => {
                    log.debug(`Successfully saved rooms votes to skip current track`);
                    return callback(null, true);
                })
                .catch( (err) => {
                    log.error(`Failed to save votes to skip current track. error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    return callback(err, null);
                }
            );
        }
    }

    unvoteToSkipCurrentSong(sessionId, cache, callback) {
        if (!this.votesToSkipCurrentSong.has(sessionId)) {
            return callback("User is already not voting for current song", false);
        }
        this.votesToSkipCurrentSong.delete(sessionId);
        this.save(cache)
            .then( () => {
                log.debug(`Successfully unvoted skipped to next track for Room ${this.name}`);
                return callback(null, true);
            })
            .catch( (err) => {
                log.error(`Failed to unvote skip track in queue! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return callback(err, null);
            }
        );
    }
}

module.exports = Room;
