const TinyQueue = require('tinyqueue');
const Moniker = require('moniker');

// Setup Redis server
const redis = require("redis");
const bluebird = require("bluebird");

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const client = redis.createClient();

// Setup logging
const log = require('winston');

class Room {

    constructor (apiKey) {
        // TODO Create custom "dumb" dictionary so we don't have to spell 'efficacious'
        // TODO check for collision, LUL
        this.name = Moniker.generator([Moniker.adjective, Moniker.noun]).choose();
        this.apiKey = apiKey;
        this.songQueue = new TinyQueue([], (a, b) => {
            return a.votes > b.votes ? -1 : (a.votes < b.votes ? 1 : 0);
        });
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
