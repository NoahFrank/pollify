import stringHash from "string-hash";
import { Room } from "./room";
import logger from "../util/logger";
import { Request, Response } from "express";
import { Document, model, Schema } from "mongoose";
import { setPollifySession } from "../util/helper";

const UserSchema: Schema = new Schema({
  username: {
    type: String,
    required: true,
  },
  sessionId: {
      type: Number,
      required: true,
      unique: true
  }
});
export interface UserDocument extends Document {
    username: string;
    sessionId: number;
}
export const User = model<UserDocument>("User", UserSchema);

// Helpers
function newUser(usernameInput: string, sessionIdInput?: number, ip?: string) {
    if (!sessionIdInput && !ip) {
        logger.error("Didn't pass enough arguments to newUser sessionIdInput or ip is required.");
    }
    const username = usernameInput || "";
    const sessionId = sessionIdInput ? sessionIdInput || undefined : stringHash(ip);

    const newUser = new User({
        username,
        sessionId,
    });
    return newUser;
}

function createUserSession(req: Request, res: Response) {
    const userIP: string = req.connection.remoteAddress;
    const userIPHash: number = stringHash(userIP);
    logger.debug(
      `Setting user's public ip (${userIP}) converted to hashed string (${userIPHash})`
    );
    setPollifySession(userIPHash, res);
    return userIPHash;
}

async function getOrCreateUser(sessionId: number, ip: string, username: string): Promise<UserDocument> {
    let session = sessionId;
    let user;
    try {
        if (session) {
            user = await User.findOne({sessionId: session});
        }
        if (!user) {
            user = newUser(username, session, ip);
            const fUser = await User.findOne({sessionId: user.sessionId});
            if (fUser) {
                user = fUser;
            }
            if (!fUser) {
                await user.save();
            }
            session = user.sessionId;
        }
    } catch (e) {
        logger.error(`New room user creation failed. Session=${session} User=${user} Err=${e}`);
        throw new Error(e);
    }
    return user;
}

export {
    newUser,
    createUserSession,
    getOrCreateUser
};