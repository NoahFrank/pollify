// Setup logging
const log = require('../../config/logger');
const stringHash = require('string-hash');

class User {

    constructor(username, currentRoom = "") {
        this.username = username;
        this.roomHistory = [];

        if (currentRoom.length > 0)  // If user has currentRoom passed into constructor then add to roomHistory
            this.roomHistory.push(currentRoom);  // TODO: Also store timestamp or other needed data?
    }

    static createUserSession(req, res) {
        const userIP = req.connection.remoteAddress;
        let userIPHash = stringHash(userIP);
        log.debug(`Setting user's public ip (${userIP}) converted to hashed string (${userIPHash})`);
        res.cookie('pollifySession', userIPHash, {
            maxAge: 900000,
            httpOnly: true
        });
    }
}

module.exports = User;
