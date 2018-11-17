const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');
const SpotifyWebApi = require('spotify-web-api-node');
const Owner = require('./owner');
// Setup Redis connection
const redis = require("redis");
const client = redis.createClient();

// Setup and authorize spotify API
let spotify = new SpotifyWebApi({
    clientId : appId,
    clientSecret : appSecret,
    redirectUri: 'http://localhost:3000/auth/spotify/callback'
});

// spotify.setAccessToken(token);
//
// const passport = require('passport');
// const SpotifyStrategy = require('passport-spotify').Strategy;
//
// passport.use(new SpotifyStrategy({
//         clientID: appId,
//         clientSecret: appSecret,
//         callbackURL: "http://localhost:3000/callback"
//     },
//     function(accessToken, refreshToken, profile, done) {
//         // TODO: How do we store user stuff as the owner of a room? Or should we skip to android stuff? Or should we ignore authentication and get basic functionality working xD
//
//     }
// ));

module.exports = spotify;
