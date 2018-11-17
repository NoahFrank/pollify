// Setup logging
const log = require('../../config/logger');

class Owner {

    constructor(profileId, profileName, profileEmail, accessToken, refreshToken, tokenExpirationEpoch) {
        this.profileId = profileId;
        this.profileName = profileName;
        this.profileEmail = profileEmail;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenExpirationEpoch = tokenExpirationEpoch;
    }
}

module.exports = Owner;
