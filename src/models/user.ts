// Setup logging
import stringHash from "string-hash";
import { Room } from "./room";
import logger from "../util/logger";

import { Request, Response } from "express";

export class User {
    username: string;
    roomHistory: Array<Room>;

    constructor(username?: string, currentRoom?: Room) {
        this.username = username || "";
        this.roomHistory = [];

        if (currentRoom)  // If user has currentRoom passed into constructor then add to roomHistory
            this.roomHistory.push(currentRoom);  // TODO: Also store timestamp or other needed data?
    }

    static createUserSession(req: Request, res: Response) {
        const userIP: string = req.connection.remoteAddress;
        const userIPHash: number = stringHash(userIP);
        logger.debug(`Setting user's public ip (${userIP}) converted to hashed string (${userIPHash})`);
        res.cookie("pollifySession", userIPHash, {
            maxAge: 900000,
            httpOnly: true
        });
    }
}