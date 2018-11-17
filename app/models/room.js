const Moniker = require('moniker');

// Setup Redis server
const redis = require("redis");
const client = redis.createClient();

// Setup logging
const log = require('../../config/logger');

class Room {

    constructor (owner, name=Moniker.generator([Moniker.adjective, Moniker.noun]).choose()) {
        // TODO check for collision, LUL
        this.name = name;
        this.owner = owner;
    }

    static get(roomId, callback) {
        client.get(roomId, (err, roomString) => {
            if (roomString === null) {
                // doesn't exist
                callback(`${roomId} doesn't exist`, null);
            } else {
                log.info(`Found Room ${roomString}`);
                let room = JSON.parse(roomString);
                callback(null, new Room(room.owner, room.name));
            }
        });
    }

    save(callback) {
        client.set(this.name, JSON.stringify(this), (err, result) => {
            if (result) {
                callback(null, result);
            } else {
                callback(err, null);
            }
        });
    }
}

module.exports = Room;
