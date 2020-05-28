import express from "express";
import compression from "compression";  // compresses requests
import session from "express-session";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import lusca from "lusca";
import mongo from "connect-mongo";
import flash from "express-flash";
import path from "path";
import mongoose from "mongoose";
import passport from "passport";
import bluebird from "bluebird";
import NodeCache from "node-cache";
import { MONGODB_URI, SESSION_SECRET } from "./util/secrets";

const MongoStore = mongo(session);

// Boilerplate Controllers (route handlers)
// import * as homeController from "./controllers/home";
// import * as userController from "./controllers/user";
// import * as apiController from "./controllers/api";
// import * as contactController from "./controllers/contact";

// Controllers
import * as authController from "./controllers/auth";
import * as routesController from "./controllers/routes";

// API keys and Passport configuration
// import * as passportConfig from "./config/passport";

// Create Express server
const app = express();

// Connect to MongoDB
const mongoUrl = MONGODB_URI;
mongoose.Promise = bluebird;

mongoose.connect(mongoUrl, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true } ).then(
    () => { /** ready to use. The `mongoose.connect()` promise resolves to undefined. */ },
).catch(err => {
    console.log("MongoDB connection error. Please make sure MongoDB is running. " + err);
    // process.exit();
});

// Setup Node cache and bind to app
const cache = new NodeCache();
// Store into app with express
app.set("cache", cache);

// Express configuration
app.set("port", process.env.PORT || 3000);
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "pug");
app.use(compression());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: SESSION_SECRET,
    store: new MongoStore({
        url: mongoUrl,
        autoReconnect: true
    })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(lusca.xframe("SAMEORIGIN"));
app.use(lusca.xssProtection(true));
app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});
app.use((req, res, next) => {
    // After successful login, redirect back to the intended page
    if (!req.user &&
    req.path !== "/login" &&
    req.path !== "/signup" &&
    !req.path.match(/^\/auth/) &&
    !req.path.match(/\./)) {
        req.session.returnTo = req.path;
    } else if (req.user &&
    req.path == "/account") {
        req.session.returnTo = req.path;
    }
    next();
});

app.use(
    express.static(path.join(__dirname, "public"), { maxAge: 31557600000 })
);

/**
 * Spotify Authorization routes
 */
app.get("/auth/spotify/login", authController.loginStartAuth);
app.get("/auth/spotify/callback", authController.loginAuthCallback);

/**
 * Custom Pollify Routes!
 */
app.get("/", routesController.home);
app.post("/room/join", routesController.roomJoin);
app.get("/room/:roomId", routesController.findRoom);
app.post("/room/:roomId/skip", routesController.roomSkip);
app.post("/room/:roomId/play", routesController.roomPlay);
app.post("/room/:roomId/pause", routesController.roomPause);
app.post("/room/:roomId/vote", routesController.roomVote);
app.post("/room/:roomId/unvote", routesController.roomUnvote);
app.post("/room/:roomId/skip/vote", routesController.roomSkipVote);
app.post("/room/:roomId/skip/unvote", routesController.roomSkipUnvote);
app.post("/room/:roomId/search", routesController.roomSearch);
app.get("/room/:roomId/add/:trackId", routesController.roomTrackAdd);
app.post("/room/:roomId/remove/:trackId", routesController.roomTrackRemove);
app.post("/room/:roomId/remove/:trackId/vote", routesController.roomRemoveVote);
app.post("/room/:roomId/remove/:trackId/unvote", routesController.roomRemoveUnvote);
app.delete("/room/:roomId/delete", routesController.roomUserRemove);
app.post("/room/:roomId/getArtistTopTracks/:artistId", routesController.roomGetTopSongsForArtist);
// app.delete("/room/:roomId/close", routesController.roomClose);

export default app;
