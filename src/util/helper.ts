import { Response } from "express";

export const POLLIFY_SESSION = "pollifySession";

function convertMilliToReadable(duration: number): string {
    if (duration < 0) {
        return "";
    }
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    // Add leading zero padding to seconds if it's a single digit to look pretty
    const secondsStr = (seconds < 10) ? "0" + seconds : seconds;

    let output = "";
    if (hours) {
        output = `${hours}:`;
    }
    return `${output}${minutes}:${secondsStr}`;
};

function setPollifySession(hash: number, res: Response) {
    res.cookie(POLLIFY_SESSION, hash, {
      maxAge: 900000,
      httpOnly: true,
    });
}

export {
    convertMilliToReadable,
    setPollifySession
};