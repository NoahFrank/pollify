import logger from "./logger";
import dotenv from "dotenv";
import fs from "fs";
export const ENVIRONMENT = process.env.NODE_ENV;
const prod = ENVIRONMENT === "production"; // Anything else is treated as 'dev'
logger.info(`Server configuration is set to: ENVIRONMENT=${ENVIRONMENT}`);

if (!prod) {
    if (fs.existsSync(".env")) {
        logger.debug("Using .env file to supply config environment variables");
        dotenv.config({ path: ".env" });
    } else {
        logger.debug("Using .env.example file to supply config environment variables");
        dotenv.config({ path: ".env.example" });  // you can delete this after you create your own .env file!
    }
}

export const SPOTIFY_APP_ID = process.env["SPOTIFY_APP_ID"];
export const SPOTIFY_APP_SECRET = process.env["SPOTIFY_APP_SECRET"];

export const SESSION_SECRET = process.env["SESSION_SECRET"];
export const MONGODB_URI = prod ? process.env["MONGODB_URI"] : process.env["MONGODB_URI_LOCAL"];

if (!SESSION_SECRET) {
    logger.error("No client secret. Set SESSION_SECRET environment variable.");
    process.exit(1);
}

if (!MONGODB_URI) {
    if (prod) {
        logger.error("No mongo connection string. Set MONGODB_URI environment variable.");
    } else {
        logger.error("No mongo connection string. Set MONGODB_URI_LOCAL environment variable.");
    }
    process.exit(1);
}

if (!SPOTIFY_APP_ID || !SPOTIFY_APP_SECRET) {
    logger.error("No Spotify app settings set. Set SPOTIFY_APP_ID and SPOTIFY_APP_SECRET environment variables.");
    process.exit(1);
}