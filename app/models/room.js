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

        log.info(`Generated name: ${name} for your room`);
        // TODO Create custom "dumb" dictionary so we don't have to spell 'efficacious'

        let taken = client.existsAsync('kappa').then( (res) => {
            return Boolean(res);
        });

        log.info(`Wut: ${taken}`);

        this.apiKey = apiKey;
        this.songQueue = new TinyQueue([], (a, b) => {
            return a.votes > b.votes ? -1 : (a.votes < b.votes ? 1 : 0);
        });
    }

    generateName(limit, depth=0) {
        return new Promise( (resolve, reject) => {
            let name = Moniker.generator([Moniker.adjective, Moniker.noun]).choose();
            client.exists()
        });
    }

}

module.exports = Room;
