#!/usr/bin/env python3
"""Review player for coreslopper renders: play, step frame by frame, write notes.

Keys:
  Space            Play / pause (while typing a note: a space)
  Left / Right     (paused) previous / next frame
  Up / Down        (paused) one second forward / back
  PageUp / PageDn  (paused) previous / next note
  Type + Enter     (paused) save a note on the current frame
  Delete           (paused) remove the last note on the current frame
  Backspace        delete the last character
  Esc              discard the input, or quit

Notes are written after every change to `review/notes/<video-stem>.json` when
the video is in a project's `renders/`, otherwise next to the video.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import OrderedDict
from pathlib import Path

import av
import numpy as np
import pygame
import sounddevice as sd

from review_notes import ReviewNotes, default_notes_path, format_time

BAR_HEIGHT = 130
MAX_INITIAL_SIZE = (1280, 720)


class Video:
    """Frame-accurate access to a video, with a cache for stepping backwards."""

    def __init__(self, path):
        self.container = av.open(str(path))
        self.stream = self.container.streams.video[0]
        self.stream.thread_type = "AUTO"
        self.fps = float(self.stream.average_rate or self.stream.guessed_rate or 25)
        self.time_base = self.stream.time_base
        self.start_pts = self.stream.start_time or 0
        self.start_seconds = float(self.start_pts * self.time_base)
        self.width = self.stream.codec_context.width
        self.height = self.stream.codec_context.height

        self.frame_count = self.stream.frames
        if not self.frame_count and self.container.duration:
            self.frame_count = int(self.container.duration / av.time_base * self.fps)

        # Size the cache by resolution so it stays around 400 MB
        frame_bytes = self.width * self.height * 1.5
        self.cache_size = max(15, min(300, int(400e6 / frame_bytes)))
        self.cache = OrderedDict()
        self.decoder = None
        self.last_decoded = None

    def seconds(self, frame):
        return float((frame.pts - self.start_pts) * self.time_base)

    def index_of(self, frame):
        return round(self.seconds(frame) * self.fps)

    def _seek(self, index):
        target = max(0.0, (index - 0.5) / self.fps)
        pts = int(target / self.time_base) + self.start_pts
        self.container.seek(pts, stream=self.stream, backward=True)
        self.decoder = self.container.decode(self.stream)
        self.last_decoded = None

    def _decode_next(self):
        try:
            frame = next(self.decoder)
        except (StopIteration, av.error.EOFError):
            return None
        index = self.index_of(frame)
        self.cache[index] = frame
        self.cache.move_to_end(index)
        while len(self.cache) > self.cache_size:
            self.cache.popitem(last=False)
        self.last_decoded = index
        return index

    def get(self, index):
        """(index, frame) for the requested frame, or None past the end."""
        index = max(0, index)
        if index in self.cache:
            self.cache.move_to_end(index)
            return index, self.cache[index]

        near_ahead = (
            self.decoder is not None
            and self.last_decoded is not None
            and self.last_decoded < index <= self.last_decoded + 2 * self.fps
        )
        if not near_ahead:
            self._seek(index)

        while True:
            decoded = self._decode_next()
            if decoded is None:
                return None
            if decoded >= index:
                return decoded, self.cache[decoded]


class Audio:
    """Plays the audio track and is the clock for the picture while playing."""

    def __init__(self, path, video_start_seconds):
        container = av.open(str(path))
        stream = container.streams.audio[0]
        self.rate = stream.rate or 48000
        resampler = av.AudioResampler(format="s16", layout="stereo", rate=self.rate)
        chunks = []
        first = None
        for frame in container.decode(stream):
            if first is None and frame.pts is not None:
                first = frame.time
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1, 2))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1, 2))
        container.close()

        self.samples = np.concatenate(chunks) if chunks else np.zeros((0, 2), np.int16)
        # Offset of the audio track against the first video frame, in samples
        self.offset = round(((first or video_start_seconds) - video_start_seconds) * self.rate)
        self.pos = 0
        self.playing = False
        self.stream = self._open_stream()

    def _open_stream(self, attempts=4):
        # WSLg's ALSA -> PulseAudio bridge sometimes times out on start; retry with a
        # roomier buffer before giving up.
        error = None
        for attempt in range(attempts):
            stream = sd.OutputStream(
                samplerate=self.rate, channels=2, dtype="int16", latency="high",
                callback=self._callback,
            )
            try:
                stream.start()
                return stream
            except sd.PortAudioError as exc:
                error = exc
                stream.close()
                time.sleep(0.5 * (attempt + 1))
        raise error

    def _callback(self, outdata, frames, time_info, status):
        outdata.fill(0)
        if not self.playing:
            return
        begin = self.pos - self.offset
        src_from = max(begin, 0)
        src_to = min(begin + frames, len(self.samples))
        if src_to > src_from:
            outdata[src_from - begin:src_to - begin] = self.samples[src_from:src_to]
        self.pos += frames

    def play(self, seconds):
        self.pos = round(seconds * self.rate)
        self.playing = True

    def pause(self):
        self.playing = False

    def time(self):
        return self.pos / self.rate - self.stream.latency

    def close(self):
        self.stream.close()


class WallClock:
    """Clock for videos without an audio track."""

    def __init__(self):
        self.t0 = 0.0

    def play(self, seconds):
        self.t0 = time.perf_counter() - seconds

    def pause(self):
        pass

    def time(self):
        return time.perf_counter() - self.t0

    def close(self):
        pass


def choose_file():
    import tkinter
    from tkinter import filedialog

    root = tkinter.Tk()
    root.withdraw()
    path = filedialog.askopenfilename(
        title="Choose a video", filetypes=[("Videos", "*.mp4 *.mov *.m4v *.mkv"), ("All", "*.*")]
    )
    root.destroy()
    return path


def fit(src_w, src_h, max_w, max_h):
    scale = min(max_w / src_w, max_h / src_h)
    return max(2, int(src_w * scale)), max(2, int(src_h * scale))


def frame_surface(frame, size):
    rgb = frame.reformat(width=size[0], height=size[1], format="rgb24").to_ndarray()
    return pygame.image.frombuffer(rgb.tobytes(), size, "RGB")


def parse_args():
    parser = argparse.ArgumentParser(description="Frame-accurate review player with per-frame notes.")
    parser.add_argument("video", nargs="?", help="Video file; a file dialog opens without one")
    parser.add_argument("--notes", help="Notes JSON (default: review/notes/<stem>.json in a project)")
    parser.add_argument("--frame", type=int, default=0, help="Start at this frame")
    return parser.parse_args()


def main():
    args = parse_args()
    path = args.video or choose_file()
    if not path:
        return
    path = Path(path)
    video = Video(path)
    notes = ReviewNotes(Path(args.notes) if args.notes else default_notes_path(path), path, video.fps)

    pygame.init()
    pygame.display.set_caption(f"Review – {path.name}")
    w, h = fit(video.width, video.height, *MAX_INITIAL_SIZE)
    screen = pygame.display.set_mode((max(w, 700), h + BAR_HEIGHT), pygame.RESIZABLE)
    pygame.key.set_repeat(350, 35)
    pygame.key.start_text_input()
    font = pygame.font.SysFont("Helvetica", 20)
    small = pygame.font.SysFont("Helvetica", 16)
    clock = pygame.time.Clock()

    if video.container.streams.audio:
        screen.blit(font.render("Loading audio …", True, (230, 230, 230)), (12, 12))
        pygame.display.flip()
        try:
            timer = Audio(path, video.start_seconds)
        except sd.PortAudioError as exc:
            print(f"Audio output failed ({exc}); playing without sound.", file=sys.stderr)
            timer = WallClock()
    else:
        timer = WallClock()

    current = video.get(args.frame) or video.get(0)
    if current is None:
        sys.exit("The video has no frames.")
    playing = False
    text = ""
    flash = ""
    flash_until = 0
    rendered_key = None
    rendered = None

    def show(message):
        nonlocal flash, flash_until
        flash = message
        flash_until = pygame.time.get_ticks() + 1500

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE and not text:
                    playing = not playing
                    if playing:
                        timer.play(video.seconds(current[1]))
                    else:
                        timer.pause()
                elif event.key == pygame.K_ESCAPE:
                    if text:
                        text = ""
                    else:
                        running = False
                elif playing:
                    pass
                elif event.key in (pygame.K_RIGHT, pygame.K_LEFT, pygame.K_UP, pygame.K_DOWN):
                    step = {
                        pygame.K_RIGHT: 1,
                        pygame.K_LEFT: -1,
                        pygame.K_UP: round(video.fps),
                        pygame.K_DOWN: -round(video.fps),
                    }[event.key]
                    nxt = video.get(current[0] + step)
                    if nxt is not None:
                        current = nxt
                elif event.key in (pygame.K_PAGEUP, pygame.K_PAGEDOWN):
                    target = notes.neighbor(current[0], 1 if event.key == pygame.K_PAGEDOWN else -1)
                    nxt = video.get(target) if target is not None else None
                    if nxt is not None:
                        current = nxt
                elif event.key == pygame.K_DELETE and not text:
                    removed = notes.remove_last(current[0])
                    if removed is not None:
                        show(f"Removed: {removed}")
                elif event.key == pygame.K_BACKSPACE:
                    text = text[:-1]
                elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    if text.strip():
                        idx, frame = current
                        notes.add(video.seconds(frame), idx, text.strip())
                        show(f"Saved: frame {idx}")
                    text = ""

            elif event.type == pygame.TEXTINPUT and not playing:
                # Space with an empty input is play/pause, not a character
                if event.text == " " and not text:
                    continue
                text += event.text

        if playing:
            target = round(timer.time() * video.fps)
            if target > current[0]:
                nxt = video.get(target)
                if nxt is None:
                    playing = False
                    timer.pause()
                else:
                    current = nxt

        # Picture
        win_w, win_h = screen.get_size()
        area_h = max(2, win_h - BAR_HEIGHT)
        size = fit(video.width, video.height, win_w, area_h)
        key = (current[0], size)
        if key != rendered_key:
            rendered = frame_surface(current[1], size)
            rendered_key = key
        screen.fill((0, 0, 0))
        screen.blit(rendered, ((win_w - size[0]) // 2, (area_h - size[1]) // 2))

        # Status bar
        idx, frame = current
        pygame.draw.rect(screen, (28, 28, 32), (0, area_h, win_w, BAR_HEIGHT))
        total = f" / {video.frame_count - 1}" if video.frame_count else ""
        state = "PLAY" if playing else "PAUSE"
        status = f"{state}    Frame {idx}{total}    {format_time(video.seconds(frame))}    {len(notes.notes)} notes"
        screen.blit(font.render(status, True, (230, 230, 230)), (12, area_h + 8))

        existing = notes.for_frame(idx)
        if existing:
            line = f"{len(existing)} note(s) here: " + " | ".join(existing)
            screen.blit(small.render(line, True, (140, 200, 140)), (12, area_h + 38))

        if playing:
            hint = "Space = pause"
            screen.blit(small.render(hint, True, (150, 150, 150)), (12, area_h + 70))
        else:
            cursor = "_" if pygame.time.get_ticks() // 500 % 2 else " "
            screen.blit(font.render("> " + text + cursor, True, (255, 220, 120)), (12, area_h + 64))
            hint = "Type + Enter = save   ←/→ = frame   ↑/↓ = 1 s   PgUp/PgDn = note   Del = remove   Space = play   Esc = quit"
            screen.blit(small.render(hint, True, (150, 150, 150)), (12, area_h + 100))

        if flash and pygame.time.get_ticks() < flash_until:
            surf = small.render(flash, True, (140, 200, 140))
            screen.blit(surf, (win_w - surf.get_width() - 12, area_h + 12))

        pygame.display.flip()
        clock.tick(120 if playing else 30)

    timer.close()
    pygame.quit()
    print(f"Notes saved to: {notes.path}")


if __name__ == "__main__":
    main()
