import mongoose from "mongoose";

// export class Owner {
//     sessionId: string;
//     profileId: number;
//     profileName: string;
//     profileEmail: string;
//     accessToken: string;
//     refreshToken: string;
//     tokenExpirationEpoch: Date;

//     constructor(sessionId: string, profileId: number, profileName: string, profileEmail: string, accessToken: string, refreshToken: string, tokenExpirationEpoch: Date) {
//         this.sessionId = sessionId;
//         this.profileId = profileId;
//         this.profileName = profileName;
//         this.profileEmail = profileEmail;
//         this.accessToken = accessToken;
//         this.refreshToken = refreshToken;
//         this.tokenExpirationEpoch = tokenExpirationEpoch;
//     }
// }


export type OwnerDocument = mongoose.Document & {
    sessionId: string;
    profileId: number;
    profileName: string;
    profileEmail: string;
    accessToken: string;
    refreshToken: string;
    tokenExpirationEpoch: Date;
};


export interface SpotifyAuthToken {
    accessToken: string;
    refreshToken: string;
    expires_in: string;
}

const ownerSchema = new mongoose.Schema({
    sessionId: { type: String, unique: true },
    profileId: Number,
    profileName: String,
    profileEmail: String,
    accessToken: String,
    refreshToken: String,
    tokenExpirationEpoch: Date
}, { timestamps: true });

export const Owner = mongoose.model<OwnerDocument>("Owner", ownerSchema);