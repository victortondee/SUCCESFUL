# Short-Form Composer (9:16)

Local browser app that:
- picks a random image/video from `Library/`
- picks a random track from `Music library/`
- renders the animation in-browser to WebM
- auto-converts to MP4 via local FFmpeg
- final video is 9:16 (`1080x1920`) with:
  - first second: only background media
  - dark overlay fade in (customizable darkness %, default `15`)
  - animated title reveal (multiline from textarea)
  - optional smaller one-line subtitle (Poppins Light if available)
- default duration: 7 seconds (editable in UI)

## Run

```bash
cd "/Users/yerevan/Desktop/DLT in/1 year/my software/feb 26/Title Reels with Video Backgrounds"
npm run up
```

Open: `http://localhost:3000`

### Fast start commands

- Start or reuse existing server: `npm run up`
- Check if running: `npm run status`
- Stop server: `npm run down`
- Live foreground mode (manual): `npm start`

## Folders

- Add background media files to: `Library/`
  - supported: `.mp4 .mov .mkv .webm .avi .m4v .jpg .jpeg .png .webp .bmp`
- Add music files to: `Music library/`
  - supported: `.mp3 .wav .m4a .aac .flac .ogg`
- Rendered videos are downloaded by the browser to your default download location.

## Poppins Light font

For exact Poppins Light in final renders, place:

`Poppins-Light.ttf` in `fonts/Poppins-Light.ttf`

If not found, the renderer falls back to system Helvetica.
