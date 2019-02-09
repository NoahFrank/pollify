// Setup logging
const log = require('../../config/logger');

class User {

    constructor(username, currentRoom = "") {
        this.username = username;
        this.roomHistory = [];

        if (currentRoom.length > 0)  // If user has currentRoom passed into constructor then add to roomHistory
            this.roomHistory.push(currentRoom);  // TODO: Also store timestamp or other needed data?
    }
}

module.exports = User;
