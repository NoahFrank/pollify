const Moniker = require('moniker');

// Setup Redis server
const redis = require("redis");
const client = redis.createClient();

// Setup logging
const log = require('../../config/logger');

class Room {

    constructor (owner, name=Moniker.generator([Moniker.adjective, Moniker.noun]).choose()) {
        // TODO check for collision of Moniker name generation, two rooms with same name would likely throw many errors
        this.name = name;
        this.owner = owner;
        this.roomPlaylistId = null;

        // Also create a dedicated instance of SpotifyWebApi to make ALL requests for this Room using the given Owner authorized credentials
        this.spotify = require('../models/spotify')(owner);
    }

    isPlaylistCreated() {
        return this.roomPlaylistId !== null;
    }

    static get(roomId, cache) {
        return new Promise( (resolve, reject) => {
            cache.get(roomId, (err, room) => {
                if (err) {  // Always log error so we don't have to everytime
                    log.error(`Failed to get room id=${roomId}!`, err);
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
            log.error(`Failed to get roomId=${roomId} from db with error=${err}`);
            // Make sure to not negate any custom .catch statements by passing this error down the line
            throw err;
        });
    }

    save(callback) {
        // TODO: Convert to node-cache and Promise
        client.set(this.name, JSON.stringify(this), (err, result) => {
            if (result) {
                callback(null, result);
            } else {
                log.error(`Expected saved Room object, but got ${result} with error=${err}`);
                callback(err, null);
            }
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
}

module.exports = Room;
