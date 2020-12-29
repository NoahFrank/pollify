import mongoose from "mongoose";
import { UserDocument } from "./user";

export class Owner {
    id: string;
    profileName: string;
    profileEmail: string;
    accessToken: string;
    refreshToken: string;
    tokenExpirationEpoch: Date;
    user: UserDocument

    constructor(user: UserDocument, id: string, profileName: string, profileEmail: string, accessToken: string, refreshToken: string, tokenExpirationEpoch: Date) {
        this.id = id;
        this.profileName = profileName;
        this.profileEmail = profileEmail;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenExpirationEpoch = tokenExpirationEpoch;
        this.user = user;
    }
}


// export type OwnerDocument = mongoose.Document & {
//     sessionId: string;
//     profileId: number;
//     profileName: string;
//     profileEmail: string;
//     accessToken: string;
//     refreshToken: string;
//     tokenExpirationEpoch: Date;
// };


// export interface SpotifyAuthToken {
//     accessToken: string;
//     refreshToken: string;
//     expires_in: string;
// }

// const ownerSchema = new mongoose.Schema({
//     sessionId: { type: String, unique: true },
//     profileId: Number,
//     profileName: String,
//     profileEmail: String,
//     accessToken: String,
//     refreshToken: String,
//     tokenExpirationEpoch: Date
// }, { timestamps: true });

// export const Owner = mongoose.model<OwnerDocument>("Owner", ownerSchema);