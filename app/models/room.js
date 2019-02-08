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

    getCurrentUsersArray() {
        return Array.from(this.users);
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
}

module.exports = Room;