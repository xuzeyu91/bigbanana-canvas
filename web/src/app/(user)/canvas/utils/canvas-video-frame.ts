export type VideoFramePosition = "first" | "last" | "current";

/** 计算截帧时间，末帧回退 1ms 以避免部分浏览器停在末尾时取不到画面。 */
export function resolveVideoFrameTime(position: VideoFramePosition, duration: number, currentTime: number) {
    const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    const endTime = Math.max(0, safeDuration - 0.001);
    if (position === "first") return 0;
    if (position === "last") return endTime;
    return Math.min(Math.max(0, currentTime), endTime);
}

export async function captureVideoFrame(source: string, position: VideoFramePosition, currentTime: number) {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    try {
        const metadataLoaded = waitForVideo(video, "loadedmetadata");
        video.src = source;
        video.load();
        await metadataLoaded;
        const time = resolveVideoFrameTime(position, video.duration, currentTime);
        if (time) {
            const seeked = waitForVideo(video, "seeked");
            video.currentTime = time;
            await seeked;
        } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            await waitForVideo(video, "loadeddata");
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")!.drawImage(video, 0, 0);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("无法截取该画面"))), "image/png"));
    } finally {
        video.removeAttribute("src");
        video.load();
    }
}

function waitForVideo(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
    return new Promise<void>((resolve, reject) => {
        const finish = () => {
            video.removeEventListener(eventName, finish);
            video.removeEventListener("error", fail);
            resolve();
        };
        const fail = () => {
            video.removeEventListener(eventName, finish);
            video.removeEventListener("error", fail);
            reject(new Error("无法读取视频画面"));
        };
        video.addEventListener(eventName, finish);
        video.addEventListener("error", fail);
    });
}
