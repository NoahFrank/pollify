const Moniker = require('moniker');

// Setup logging
const log = require('../../config/logger');

class Room {

    constructor (apiKey) {
        // TODO Create custom "dumb" dictionary so we don't have to spell 'efficacious'
        // TODO check for collision, LUL
        this.name = Moniker.generator([Moniker.adjective, Moniker.noun]).choose();
        this.owner = null;
        this.apiKey = apiKey;
        this.songQueue = [];
    }

    static addTrack(room, track) {
        room.songQueue.push(track); // Add to end of queue
        // Shouldn't need to sort after this
        // TODO: Make note of time song was added to determine ties, or does add order suffice?
    }

    static removeTrack(room, track) {
        // TODO: Instead of p-queue, we can use manual array to fit our needs.  Sort after each vote change, and easy insertion and removal
        for (let i = 0; i < this.songQueue.length; i++) {
            if (room.songQueue[i].id === track.id) {
                room.songQueue.splice(i, 1);
                room.songQueue.sort(Room.sortDesc);
                return true;
            }
        }
        return false;
    }

    static skipTrack(room) {
        room.songQueue.pop();
        // Shouldn't need to sort after this
    }

    static sortDesc(a, b) {
        return a.votes > b.votes ? -1 : (a.votes < b.votes ? 1 : 0);
    }

    // I hate my life - Noah
    // generateName(depth=0, limit=100) {
    //     if (depth >= limit) {
    //         return new Promise( (resolve, reject) => {reject("Hit name generation limit")} );
    //     }
    //     return new Promise( (resolve, reject) => {
    //         let name = Moniker.generator([Moniker.adjective, Moniker.noun]).choose();
    //         client.exists(name, (err, result) => {
    //             if (err) {
    //                 reject(err);
    //             } else {
    //                 if ( Boolean(result) ) {
    //                     resolve(name);
    //                 } else {
    //                     return this.generateName(depth++, limit);
    //                 }
    //             }
    //         });
    //     });
    // }
}

module.exports = Room;
