// Setup logging
const log = require('../../config/logger');

class Owner {

    constructor(profileId, profileName, accessToken, refreshToken) {
        this.profileId = profileId;
        this.profileName = profileName;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
    }
}

module.exports = Owner;
