
export const convertMilliToReadable = (duration: number): string => {
    if (duration < 0) {
        return "";
    }
    const milliseconds = parseInt(((duration % 1000) / 100).toString());
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    const hoursStr = (hours < 10) ? "0" + hours : hours;
    const minutesStr = (minutes < 10) ? "0" + minutes : minutes;
    const secondsStr = (seconds < 10) ? "0" + seconds : seconds;

    let output = "";
    if (hours) {
        output = hoursStr + ":" + output;
    }
    output = output + minutesStr + ":" + secondsStr + "." + milliseconds;
    return output;
};