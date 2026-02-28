# Short-Form Composer (9:16)

Local browser app that:
- picks a random image/video background
- picks a random music track
- renders animation in-browser to WebM
- converts to MP4 via FFmpeg

It can source media from either:
- local folders (`Library/` and `Music library/`) for local-only use
- Cloudinary (recommended for online deployment)

## Run locally

```bash
cd "/Users/yerevan/Desktop/DLT in/1 year/my software/feb 26/Pushed to Github WITHOUT media/Title Reels with Video Backgrounds"
npm run up
```

Open: `http://127.0.0.1:3000/`

## Cloudinary setup (recommended)

Create a `.env` file from `.env.example` and set:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- optional `CLOUDINARY_MEDIA_PREFIX` (default `shortform/library`)
- optional `CLOUDINARY_MUSIC_PREFIX` (default `shortform/music`)

When these vars are set, the app pulls random media/music from Cloudinary instead of local folders.

## Upload local files to Cloudinary

```bash
npm run cloudinary:upload
```

This uploads:
- `Library/*` (image/video) to `CLOUDINARY_MEDIA_PREFIX`
- `Music library/*` (audio) to `CLOUDINARY_MUSIC_PREFIX`

## Deploy online (Render)

Use a Render **Web Service**:
- Repository: `victortondee/SUCCESFUL`
- Root Directory: `shortform-composer`
- Runtime: `Docker`

Set these Render environment variables:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- optionally `CLOUDINARY_MEDIA_PREFIX`
- optionally `CLOUDINARY_MUSIC_PREFIX`

The included Dockerfile already installs FFmpeg.

## Fast local commands

- Start/reuse server: `npm run up`
- Check status: `npm run status`
- Stop server: `npm run down`
- Foreground mode: `npm start`
