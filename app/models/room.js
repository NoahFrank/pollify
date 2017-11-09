const TinyQueue = require('tinyqueue');
const Moniker = require('moniker');
const redis = require("redis");

class Room {

    constructor (apiKey) {
        name = Moniker.generator([Moniker.adjective, Moniker.noun]).choose();
        // TODO check in redis that name is unique
        this.apiKey = apiKey;
        this.songQueue = new TinyQueue([], a,b => {
            return a.votes > b.votes ? -1 : (a.votes < b.votes ? 1 : 0);
        });
    }

}
