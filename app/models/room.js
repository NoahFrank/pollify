const Moniker = require('moniker');

// Setup logging
const log = require('../../config/logger');

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

    static get(roomId, cache) {
        return new Promise( (resolve, reject) => {
            cache.get(roomId, (err, room) => {
                if (err) {  // Always log error so we don't have to everytime
                    log.error(`Failed to get room id=${roomId}! error=${err} and message=${err.message}`);
                    reject(err);
                }

                if (room === null) {
                    // doesn't exist
                    reject(`${roomId} doesn't exist`);
                } else {
                    log.info(`Found Room ${room.name}`);
                    resolve(room);
                }
            });
        })
        .catch( (err) => {
            // Always log error so no need in each catch statement where this is used
            log.error(`Failed to get roomId=${roomId} from db with error=${err} and message=${err.message}`);
            // Make sure to not negate any custom .catch statements by passing this error down the line
            throw err;
        });
    }

    save(cache) {
        return new Promise( (resolve, reject) => {
            // before save perform sorting of tracks based on user votes:
            this.orderSongs((result) => {
                // now save
                cache.set(this.name, this, (err, success) => {
                    if (success) {
                        resolve(success);
                    } else {
                        // Always log error before rejecting
                        log.error(`Expected saved Room object, but success=${success} with error=${err} and message=${err.message}`);
                        reject(err);
                    }
                });
            });
        });
    }

    refreshAccessToken() {
        if (this.owner.tokenExpirationEpoch < new Date()) {  // Check if token has expired!
            log.info("Token expired, refreshing now...");
            this.spotify.refreshAccessToken()
                .then( (data) => {
                    // Make sure important tokens, etc are updated in db and state
                    let tokenExpirationEpoch = new Date();
                    tokenExpirationEpoch.setSeconds(tokenExpirationEpoch.getSeconds() + data.body['expires_in']);
                    this.owner.accessToken = data.body['accessToken'];
                    this.owner.refreshToken = data.body['refreshToken'];

                    log.info(
                        `Refreshed token for profile_id=${this.owner.profileId}. 
                        It now expires at ${new Date(tokenExpirationEpoch)}!`
                    );
                }).catch( (err) => {
                    log.error(`Could not refresh the token! error=${err.message}`);
                }
            );
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

    initializeTrackList(track) {
        if (this.findTrack(track.id)) return;

        this.trackList.push(track);
    }

    addTrackVote(sessionId, track) {
        if (!track.users.has(sessionId)) {
            track.users.add(sessionId);
        }
    }

    removeTrackVote(sessionId, track) {
        if (track.users.has(sessionId)) {
            track.users.delete(sessionId);
        }
    }

    getSetAsArray(attr) {
        return Array.from(this[attr]);
    }

    songSort(a,b) {
        if (a.users.size > b.users.size) {
            return -1;
        }
        if (a.users.size < b.users.size) {
            return 1;
        }
        // TODO: secondary sort?
        return 0;
    }

    orderSongs(callback) {
        let output = false;
        if (this.trackList.length) {
            this.trackList.sort(this.songSort);
            output = true;
        }
        callback(output);
    }

    isOwner(sessionId) {
        return this.owner.sessionId === sessionId;
    }

    getCurrentPlayback(callback) {
        // Get room's current playback
        this.spotify.getMyCurrentPlaybackState()
            .then( (playback) => {
                if (Object.keys(playback.body).length === 0) {
                    this.currentPlaybackState = null;
                    return callback(null, null);
                }
                this.currentPlaybackState = playback.body;
                callback(null, playback);
            })
            .catch( (err) => {
                log.error(`Failed to get Room ${this.name}'s current playback state with error=${err}`);
                callback(err, null);
            }
        );
    }

    voteToSkipCurrentSong(sessionId, cache, callback) {
        if (!this.votesToSkipCurrentSong.has(sessionId)) {
            this.votesToSkipCurrentSong.add(sessionId);
            if (Math.floor(this.votesToSkipCurrentSong.size/this.users.size) > 0.5) {
                let that = this;
                this.spotify.skipToNext()
                    .then( (context) => {  // Triggered when skipToNext promise resolves
                        log.debug(`Successfully performed a community skip to next track for Room ${this.name}`);
                        that.votesToSkipCurrentSong = new Set();
                        that.save(cache)
                            .then( () => {
                                log.debug(`Successfully reset rooms votes to skip current track`);
                                return callback(null, true);
                            })
                            .catch( (err) => {
                                log.error(`Failed to save reset votes to skip current track. error=${err} and message=${err.message}`);
                                return callback(err, null);
                            }
                        );
                    })
                    .catch( (err) => {
                        // Could be getRoomAndSpotify or skipToNext error
                        log.error(`Failed to perform a community skip! error=${err} and message=${err.message}`);
                        return callback(err, null);
                    }
                );
            } else {
                this.save(cache)
                    .then( () => {
                        log.debug(`Successfully saved rooms votes to skip current track`);
                        return callback(null, true);
                    })
                    .catch( (err) => {
                        log.error(`Failed to save votes to skip current track. error=${err} and message=${err.message}`);
                        return callback(err, null);
                    }
                );
            }
        } else {
            return callback(null, false);
        }
    }

    unvoteToSkipCurrentSong(sessionId, cache, callback) {
        if (this.votesToSkipCurrentSong.has(sessionId)) {
            this.votesToSkipCurrentSong.delete(sessionId);
            this.save(cache)
                .then( () => {
                    log.debug(`Successfully unvoted skipped to next track for Room ${this.name}`);
                    return callback(null, true);
                })
                .catch( (err) => {
                    log.error(`Failed to unvote skip track in queue! error=${err} and message=${err.message}`);
                    return callback(err, null);
                }
            );
        }
        return callback(null, false);
    }
}

module.exports = Room;