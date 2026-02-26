const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const LIBRARY_DIR = path.join(ROOT, "Library");
const MUSIC_DIR = path.join(ROOT, "Music library");
const OUTPUT_DIR = path.join(ROOT, "output");
const FONTS_DIR = path.join(ROOT, "fonts");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
const MUSIC_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".ttf": "font/ttf"
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getFadeOutSeconds(durationSeconds) {
  return clamp(durationSeconds * 0.22, 0.6, 1.8);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function extnameLower(fileName) {
  return path.extname(fileName).toLowerCase();
}

function isVideo(fileName) {
  return VIDEO_EXTENSIONS.has(extnameLower(fileName));
}

function isImage(fileName) {
  return IMAGE_EXTENSIONS.has(extnameLower(fileName));
}

function isMusic(fileName) {
  return MUSIC_EXTENSIONS.has(extnameLower(fileName));
}

async function ensureFolders() {
  await Promise.all([
    fs.mkdir(LIBRARY_DIR, { recursive: true }),
    fs.mkdir(MUSIC_DIR, { recursive: true }),
    fs.mkdir(OUTPUT_DIR, { recursive: true }),
    fs.mkdir(FONTS_DIR, { recursive: true })
  ]);
}

async function listFiles(dirPath, matcher) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && matcher(entry.name))
    .map((entry) => entry.name);
}

async function listMediaFiles() {
  const names = await listFiles(LIBRARY_DIR, (name) => isVideo(name) || isImage(name));
  return names.map((name) => ({
    fileName: name,
    type: isVideo(name) ? "video" : "image",
    absolutePath: path.join(LIBRARY_DIR, name),
    url: `/library-media/${encodeURIComponent(name)}`
  }));
}

async function listMusicFiles() {
  const names = await listFiles(MUSIC_DIR, (name) => isMusic(name));
  return names.map((name) => ({
    fileName: name,
    absolutePath: path.join(MUSIC_DIR, name),
    url: `/music-media/${encodeURIComponent(name)}`
  }));
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function safeBasenameRoute(urlPath, prefix) {
  const encoded = urlPath.slice(prefix.length);
  const fileName = decodeURIComponent(encoded);
  if (!fileName || fileName !== path.basename(fileName)) {
    return null;
  }
  return fileName;
}

async function streamFile(req, res, absolutePath, contentType, asDownload = false) {
  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (!stat.isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const rangeHeader = req.headers.range;
  const disposition = asDownload
    ? { "Content-Disposition": `attachment; filename="${path.basename(absolutePath)}"` }
    : {};

  if (rangeHeader) {
    const parsed = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (!parsed) {
      res.writeHead(416);
      res.end();
      return;
    }

    const start = Number(parsed[1]);
    const end = parsed[2] ? Number(parsed[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= stat.size) {
      res.writeHead(416);
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      ...disposition
    });
    fsSync.createReadStream(absolutePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    ...disposition
  });
  fsSync.createReadStream(absolutePath).pipe(res);
}

async function readRawBody(req, maxBytes = 300 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`));
      }
    });
  });
}

async function convertWebmToMp4(webmBuffer, durationSeconds) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shortform-webm-"));
  const inputPath = path.join(tempDir, "input.webm");
  const outputName = `short_${Date.now()}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, outputName);
  await fs.writeFile(inputPath, webmBuffer);

  const ffmpegArgs = [
    "-hide_banner",
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k"
  ];

  if (Number.isFinite(durationSeconds)) {
    const fadeSeconds = getFadeOutSeconds(durationSeconds);
    const fadeStart = Math.max(0, durationSeconds - fadeSeconds);
    ffmpegArgs.push(
      "-af",
      `afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeSeconds.toFixed(3)}`
    );
  }

  ffmpegArgs.push(
    "-movflags",
    "+faststart",
    outputPath
  );

  try {
    await runProcess("ffmpeg", ffmpegArgs);
  } catch (error) {
    throw new Error(`MP4 conversion failed: ${error.message}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

   return {
     outputName,
     outputPath,
     url: `/output/${encodeURIComponent(outputName)}`
   };
 }

 async function handleApiStatus(res) {
   const [mediaFiles, musicFiles] = await Promise.all([listMediaFiles(), listMusicFiles()]);
   json(res, 200, {
     mediaCount: mediaFiles.length,
     musicCount: musicFiles.length
   });
 }

 async function handleApiRandomMedia(res) {
   const mediaFiles = await listMediaFiles();
   if (!mediaFiles.length) {
     json(res, 400, {
       error: "No media found in Library. Add image/video files first."
     });
     return;
   }
   json(res, 200, pickRandom(mediaFiles));
 }

 async function handleApiRandomMusic(res) {
   const musicFiles = await listMusicFiles();
   if (!musicFiles.length) {
     json(res, 400, {
       error: "No music found in Music library. Add audio files first."
     });
     return;
   }
   json(res, 200, pickRandom(musicFiles));
 }

async function handleApiConvertWebm(req, res) {
   let body;
   try {
     body = await readRawBody(req);
   } catch (error) {
     json(res, 400, { error: error.message });
     return;
   }

   if (!body.length) {
     json(res, 400, { error: "Request body is empty." });
     return;
   }

  const durationHeader = Number(req.headers["x-duration-seconds"]);
  const durationSeconds = Number.isFinite(durationHeader) ? clamp(durationHeader, 2, 120) : null;

  try {
    const result = await convertWebmToMp4(body, durationSeconds);
     json(res, 200, {
       success: true,
       output: {
         fileName: result.outputName,
         url: result.url
       }
     });
   } catch (error) {
     json(res, 500, {
       error: "MP4 conversion failed.",
       details: error.message
     });
   }
 }

 async function handleRequest(req, res) {
   if (!req.url) {
     res.writeHead(400);
     res.end("Bad request");
     return;
   }

   const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
   const pathname = requestUrl.pathname;
   const method = req.method || "GET";

   if (method === "GET" && pathname === "/api/status") {
     await handleApiStatus(res);
     return;
   }

   if (method === "GET" && pathname === "/api/media/random") {
     await handleApiRandomMedia(res);
     return;
   }

   if (method === "GET" && pathname === "/api/music/random") {
     await handleApiRandomMusic(res);
     return;
   }

   if (method === "POST" && pathname === "/api/convert-webm") {
     await handleApiConvertWebm(req, res);
     return;
   }

   if (method === "GET" && pathname.startsWith("/library-media/")) {
     const fileName = safeBasenameRoute(pathname, "/library-media/");
     if (!fileName) {
       res.writeHead(400);
       res.end("Invalid file");
       return;
     }
     const absolutePath = path.join(LIBRARY_DIR, fileName);
     const contentType = MIME_TYPES[extnameLower(fileName)] || "application/octet-stream";
     await streamFile(req, res, absolutePath, contentType);
     return;
   }

   if (method === "GET" && pathname.startsWith("/music-media/")) {
     const fileName = safeBasenameRoute(pathname, "/music-media/");
     if (!fileName) {
       res.writeHead(400);
       res.end("Invalid file");
       return;
     }
     const absolutePath = path.join(MUSIC_DIR, fileName);
     const contentType = MIME_TYPES[extnameLower(fileName)] || "application/octet-stream";
     await streamFile(req, res, absolutePath, contentType);
     return;
   }

   if (method === "GET" && pathname.startsWith("/output/")) {
     const fileName = safeBasenameRoute(pathname, "/output/");
     if (!fileName) {
       res.writeHead(400);
       res.end("Invalid file");
       return;
     }
     const absolutePath = path.join(OUTPUT_DIR, fileName);
     const contentType = MIME_TYPES[extnameLower(fileName)] || "application/octet-stream";
     await streamFile(req, res, absolutePath, contentType, requestUrl.searchParams.get("download") === "1");
     return;
   }

   if (method === "GET" && pathname.startsWith("/fonts/")) {
     const fileName = safeBasenameRoute(pathname, "/fonts/");
     if (!fileName) {
       res.writeHead(400);
       res.end("Invalid file");
       return;
     }
     const absolutePath = path.join(FONTS_DIR, fileName);
     await streamFile(req, res, absolutePath, "font/ttf");
     return;
   }

   if (method === "GET" && pathname === "/") {
     await streamFile(req, res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
     return;
   }

   if (method === "GET") {
     const relativePath = pathname.replace(/^\/+/, "");
     const normalizedPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
     const absolutePath = path.join(PUBLIC_DIR, normalizedPath);
     if (absolutePath.startsWith(PUBLIC_DIR)) {
       const ext = extnameLower(absolutePath);
       const contentType = MIME_TYPES[ext] || "application/octet-stream";
       await streamFile(req, res, absolutePath, contentType);
       return;
     }
   }

   res.writeHead(404);
   res.end("Not found");
 }

 async function start() {
   await ensureFolders();
   const server = http.createServer((req, res) => {
     handleRequest(req, res).catch((error) => {
       json(res, 500, { error: "Server error", details: error.message });
     });
   });

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Short-form composer running at http://${HOST}:${PORT}`);
     // eslint-disable-next-line no-console
     console.log(`Library: ${LIBRARY_DIR}`);
     // eslint-disable-next-line no-console
     console.log(`Music library: ${MUSIC_DIR}`);
   });
 }

 if (require.main === module) {
   start().catch((error) => {
     // eslint-disable-next-line no-console
     console.error(error);
     process.exit(1);
   });
 }

 module.exports = {
   ensureFolders,
   listMediaFiles,
   listMusicFiles,
   convertWebmToMp4,
   start
 };
