// "Up to 3 minutes": the one length rule of short-form video. The release
// shape, the main video's Reel, a horizontal episode's vertical version and
// `publish`'s Short check read it here, so a track that reads "3:00" (180.02 s)
// is treated alike everywhere (ST-049, ADR 0057).

/** The longest short-form video, in seconds: 3 minutes (F12 in docs/research/platform-video-formats.md). */
export const SHORT_FORM_MAX_SECONDS = 180;

/** How far a measured length may run over a limit and still meet it: a render's last frame and the audio's end differ by a few hundredths. */
export const LENGTH_TOLERANCE_SECONDS = 0.05;

/** Whether a video of `seconds` lasts at most 3 minutes, within the tolerance. */
export function upToThreeMinutes(seconds: number): boolean {
  return seconds <= SHORT_FORM_MAX_SECONDS + LENGTH_TOLERANCE_SECONDS;
}
