const titleInput = document.getElementById("titleInput");
const subtitleInput = document.getElementById("subtitleInput");
const durationInput = document.getElementById("durationInput");
const darknessInput = document.getElementById("darknessInput");
const refreshPreviewBtn = document.getElementById("refreshPreviewBtn");
const refreshMusicBtn = document.getElementById("refreshMusicBtn");
const renderBtn = document.getElementById("renderBtn");
const statusText = document.getElementById("statusText");
const libraryStatus = document.getElementById("libraryStatus");

const previewFrame = document.getElementById("previewFrame");
const previewVideo = document.getElementById("previewVideo");
const previewImage = document.getElementById("previewImage");
const shadeLayer = document.getElementById("shadeLayer");
const textLayer = document.getElementById("textLayer");
const previewTitle = document.getElementById("previewTitle");
const previewSubtitle = document.getElementById("previewSubtitle");
const previewBgName = document.getElementById("previewBgName");
const previewMusicName = document.getElementById("previewMusicName");
const previewAudio = document.getElementById("previewAudio");
const lastMediaName = document.getElementById("lastMediaName");
const lastMusicName = document.getElementById("lastMusicName");
const resultVideo = document.getElementById("resultVideo");
const downloadLink = document.getElementById("downloadLink");

let currentPreviewMedia = null;
let currentPreviewMusic = null;
let previewLoopInterval = null;
let animationTimeout = null;
let lastBlobUrl = null;
const previewMeasureCanvas = document.createElement("canvas");
const previewMeasureCtx = previewMeasureCanvas.getContext("2d");

function setStatus(message, isError = false) {
  statusText.textContent = message || "";
  statusText.classList.toggle("error", Boolean(isError));
}

function splitTitleLines(value) {
  const lines = String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : ["Your", "Title"];
}

function cleanTitleLines(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeSubtitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getDurationSeconds() {
  const raw = Number(durationInput.value);
  if (!Number.isFinite(raw)) {
    return 7;
  }
  return Math.max(2, Math.min(120, raw));
}

function getDarknessPercent() {
  const raw = Number(darknessInput.value);
  if (!Number.isFinite(raw)) {
    return 15;
  }
  return clamp(raw, 0, 100);
}

function getDarknessOpacity() {
  return getDarknessPercent() / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getFadeOutSeconds(durationSeconds) {
  // Keep the fade musical and noticeable across short and long clips.
  return clamp(durationSeconds * 0.22, 0.6, 1.8);
}

function refreshPreviewText() {
  const titleLines = splitTitleLines(titleInput.value);
  const subtitle = normalizeSubtitle(subtitleInput.value);

  previewTitle.textContent = titleLines.join("\n");
  previewSubtitle.textContent = subtitle;
  previewSubtitle.style.display = subtitle ? "inline-block" : "none";

  fitPreviewText();
}

function fitPreviewText() {
  const frameW = previewFrame.clientWidth;
  const frameH = previewFrame.clientHeight;
  if (!frameW || !frameH) {
    return;
  }

  if (!previewMeasureCtx) {
    return;
  }

  const titleLines = splitTitleLines(titleInput.value);
  const subtitle = normalizeSubtitle(subtitleInput.value);
  const titleSize = computeTitleFont(previewMeasureCtx, titleLines, frameW, frameH);

  previewTitle.style.fontSize = `${titleSize}px`;
  previewTitle.style.lineHeight = `${Math.round(titleSize * 1.16)}px`;

  if (previewSubtitle.style.display !== "none" && subtitle) {
    const subtitleSize = computeSubtitleFont(previewMeasureCtx, subtitle, frameW, titleSize);
    previewSubtitle.style.fontSize = `${subtitleSize}px`;
  }
}

function stopPreviewLoop() {
  if (previewLoopInterval) {
    window.clearInterval(previewLoopInterval);
    previewLoopInterval = null;
  }
  if (animationTimeout) {
    window.clearTimeout(animationTimeout);
    animationTimeout = null;
  }
  previewAudio.pause();
}

function runIntroAnimation() {
  if (animationTimeout) {
    window.clearTimeout(animationTimeout);
    animationTimeout = null;
  }

  shadeLayer.style.transition = "none";
  textLayer.style.transition = "none";
  shadeLayer.style.opacity = "0";
  textLayer.style.opacity = "0";
  textLayer.style.transform = "translateY(18px)";

  // Force style flush so transitions restart every cycle.
  void shadeLayer.offsetHeight;

  const duration = getDurationSeconds();
  const fadeMs = Math.max(500, Math.min(900, Math.round(duration * 100)));
  shadeLayer.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  textLayer.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  animationTimeout = window.setTimeout(() => {
    shadeLayer.style.opacity = `${getDarknessOpacity()}`;
    textLayer.style.opacity = "1";
    textLayer.style.transform = "translateY(0px)";
  }, 1000);
}

function restartPreviewCycle() {
  runIntroAnimation();
  if (currentPreviewMedia?.type === "video") {
    previewVideo.currentTime = 0;
    previewVideo.play().catch(() => {});
  }
  if (currentPreviewMusic) {
    previewAudio.currentTime = 0;
    previewAudio.play().catch(() => {});
  }
}

function startPreviewLoop() {
  stopPreviewLoop();
  const durationMs = Math.round(getDurationSeconds() * 1000);
  restartPreviewCycle();
  previewLoopInterval = window.setInterval(restartPreviewCycle, durationMs);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.details || `Request failed (${response.status})`);
  }
  return body;
}

async function refreshFolderStatus() {
  try {
    const status = await fetchJson("/api/status");
    libraryStatus.textContent = `Library: ${status.mediaCount} media file(s), Music library: ${status.musicCount} track(s).`;
  } catch (error) {
    libraryStatus.textContent = `Unable to check folders: ${error.message}`;
  }
}

async function pickRandomPreviewMedia() {
  setStatus("Loading random background...");
  try {
    currentPreviewMedia = await fetchJson("/api/media/random");
    previewBgName.textContent = currentPreviewMedia.fileName;

    if (currentPreviewMedia.type === "video") {
      previewImage.style.display = "none";
      previewVideo.style.display = "block";
      previewVideo.src = `${currentPreviewMedia.url}?ts=${Date.now()}`;
      previewVideo.load();
      previewVideo.play().catch(() => {});
    } else {
      previewVideo.pause();
      previewVideo.removeAttribute("src");
      previewVideo.load();
      previewVideo.style.display = "none";
      previewImage.style.display = "block";
      previewImage.src = `${currentPreviewMedia.url}?ts=${Date.now()}`;
    }

    startPreviewLoop();
    setStatus("");
  } catch (error) {
    currentPreviewMedia = null;
    setStatus(error.message, true);
  }
}

async function pickRandomPreviewMusic() {
  setStatus("Loading random preview music...");
  try {
    currentPreviewMusic = await fetchJson("/api/music/random");
    previewMusicName.textContent = currentPreviewMusic.fileName;
    previewAudio.src = `${currentPreviewMusic.url}?ts=${Date.now()}`;
    previewAudio.volume = 0.95;
    previewAudio.load();
    if (previewLoopInterval) {
      previewAudio.currentTime = 0;
      previewAudio.play().catch(() => {});
    }
    setStatus("");
  } catch (error) {
    currentPreviewMusic = null;
    previewMusicName.textContent = "-";
    previewAudio.removeAttribute("src");
    previewAudio.load();
    setStatus(error.message, true);
  }
}

function getSupportedRecorderMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function drawCover(ctx, source, targetWidth, targetHeight) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    return;
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (targetWidth - drawWidth) / 2;
  const y = (targetHeight - drawHeight) / 2;
  ctx.drawImage(source, x, y, drawWidth, drawHeight);
}

function computeTitleFont(ctx, lines, width, height) {
  const maxWidth = width * 0.84;
  const maxHeight = height * 0.44;

  for (let size = 220; size >= 42; size -= 2) {
    ctx.font = `700 ${size}px \"Avenir Next\", \"Helvetica Neue\", sans-serif`;
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const lineHeight = size * 1.16;
    const blockHeight = lineHeight * lines.length;
    if (widest <= maxWidth && blockHeight <= maxHeight) {
      return size;
    }
  }

  return 42;
}

function computeSubtitleFont(ctx, subtitle, width, titleFontSize) {
  if (!subtitle) {
    return 0;
  }
  const maxWidth = width * 0.84;
  for (let size = Math.min(96, Math.round(titleFontSize * 0.58)); size >= 20; size -= 1) {
    ctx.font = `300 ${size}px \"Poppins Light\", \"Poppins\", \"Avenir Next\", sans-serif`;
    if (ctx.measureText(subtitle).width <= maxWidth) {
      return size;
    }
  }
  return 20;
}

function drawCompositionFrame(ctx, source, payload, elapsedSeconds) {
  const {
    width,
    height,
    durationSeconds,
    darknessOpacity,
    titleLines,
    subtitle,
    titleFontSize,
    subtitleFontSize
  } = payload;
  const t = Math.min(elapsedSeconds, durationSeconds);

  drawCover(ctx, source, width, height);

  if (t < 1) {
    return;
  }

  const darkProgress = clamp((t - 1) / 0.8, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${darknessOpacity * darkProgress})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const titleProgress = darkProgress;
  const lineHeight = Math.round(titleFontSize * 1.16);
  const titleBlockHeight = lineHeight * titleLines.length;
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.2);
  const subtitleGap = subtitle ? clamp(width * 0.022, 10, 24) : 0;
  const contentHeight = titleBlockHeight + (subtitle ? subtitleGap + subtitleLineHeight : 0);
  const contentTop = (height - contentHeight) / 2;

  if (titleProgress > 0) {
    const yOffset = (1 - titleProgress) * 34;
    let y = contentTop + yOffset;

    ctx.save();
    ctx.globalAlpha = titleProgress;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `700 ${titleFontSize}px \"Avenir Next\", \"Helvetica Neue\", sans-serif`;
    ctx.shadowColor = "rgba(0, 0, 0, 0.58)";
    ctx.shadowBlur = Math.max(8, titleFontSize * 0.22);

    for (const line of titleLines) {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
    }
    ctx.restore();
  }

  if (subtitle) {
    const subtitleProgress = clamp((t - 1.2) / 0.8, 0, 1);
    if (subtitleProgress > 0) {
      const yOffset = (1 - subtitleProgress) * 24;
      const subtitleY = contentTop + titleBlockHeight + subtitleGap + yOffset;
      ctx.save();
      ctx.globalAlpha = subtitleProgress;
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `300 ${subtitleFontSize}px \"Poppins Light\", \"Poppins\", \"Avenir Next\", sans-serif`;
      ctx.shadowColor = "rgba(0, 0, 0, 0.52)";
      ctx.shadowBlur = Math.max(6, subtitleFontSize * 0.18);
      ctx.fillText(subtitle, width / 2, subtitleY);
      ctx.restore();
    }
  }
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.src = url;

    const onLoaded = () => {
      cleanup();
      resolve(video);
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load background video."));
    };

    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    video.load();
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load background image."));
    image.src = url;
  });
}

function loadAudio(url) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.src = url;

    const onReady = () => {
      cleanup();
      resolve(audio);
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load music track."));
    };

    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onError);
    };

    audio.addEventListener("canplaythrough", onReady);
    audio.addEventListener("error", onError);
    audio.load();
  });
}

async function renderInBrowser({ media, music, titleLines, subtitle, durationSeconds, darknessOpacity }) {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not initialize canvas renderer.");
  }

  const [sourceMedia, musicAudio] = await Promise.all([
    media.type === "video"
      ? loadVideo(`${media.url}?ts=${Date.now()}`)
      : loadImage(`${media.url}?ts=${Date.now()}`),
    loadAudio(`${music.url}?ts=${Date.now()}`)
  ]);

  const titleFontSize = computeTitleFont(ctx, titleLines, width, height);
  const subtitleFontSize = computeSubtitleFont(ctx, subtitle, width, titleFontSize);

  const mimeType = getSupportedRecorderMimeType();
  if (!mimeType) {
    throw new Error("This browser does not support WebM recording.");
  }

  const canvasStream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const sourceNode = audioContext.createMediaElementSource(musicAudio);
  const gainNode = audioContext.createGain();
  const baseVolume = 0.95;
  gainNode.gain.value = baseVolume;
  const destination = audioContext.createMediaStreamDestination();
  sourceNode.connect(gainNode);
  gainNode.connect(destination);

  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks()
  ]);

  const recorder = new MediaRecorder(mixedStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000
  });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) {
      chunks.push(event.data);
    }
  };

  let animationFrameId = 0;
  let stopCalled = false;

  const stopPlayback = () => {
    if (stopCalled) {
      return;
    }
    stopCalled = true;
    cancelAnimationFrame(animationFrameId);
    if (media.type === "video") {
      sourceMedia.pause();
    }
    musicAudio.pause();
    try {
      recorder.stop();
    } catch {
      // no-op
    }
  };

  const recorderDone = new Promise((resolve, reject) => {
    recorder.onerror = (event) => {
      const err = event.error || new Error("MediaRecorder error");
      reject(err);
    };
    recorder.onstop = resolve;
  });

  drawCompositionFrame(
    ctx,
    sourceMedia,
    {
      width,
      height,
      durationSeconds,
      darknessOpacity,
      titleLines,
      subtitle,
      titleFontSize,
      subtitleFontSize
    },
    0
  );

  recorder.start(250);

  if (media.type === "video") {
    sourceMedia.currentTime = 0;
    await sourceMedia.play().catch(() => {});
  }

  musicAudio.currentTime = 0;
  musicAudio.loop = true;
  await musicAudio.play().catch(() => {
    throw new Error("Browser blocked audio playback. Click render again and allow autoplay audio.");
  });

  const fadeOutSeconds = getFadeOutSeconds(durationSeconds);
  const fadeOutStart = Math.max(0, durationSeconds - fadeOutSeconds);
  const audioNow = audioContext.currentTime;
  gainNode.gain.cancelScheduledValues(audioNow);
  gainNode.gain.setValueAtTime(baseVolume, audioNow);
  gainNode.gain.linearRampToValueAtTime(baseVolume, audioNow + fadeOutStart);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioNow + durationSeconds);

  const startTime = performance.now();
  const drawLoop = (now) => {
    const elapsedSeconds = (now - startTime) / 1000;

    if (media.type === "video" && sourceMedia.readyState >= 2) {
      if (sourceMedia.ended) {
        sourceMedia.currentTime = 0;
        sourceMedia.play().catch(() => {});
      }
    }

    drawCompositionFrame(
      ctx,
      sourceMedia,
      {
        width,
        height,
        durationSeconds,
        darknessOpacity,
        titleLines,
        subtitle,
        titleFontSize,
        subtitleFontSize
      },
      elapsedSeconds
    );

    if (elapsedSeconds >= durationSeconds) {
      stopPlayback();
      return;
    }

    animationFrameId = requestAnimationFrame(drawLoop);
  };
  animationFrameId = requestAnimationFrame(drawLoop);

  await recorderDone;

  canvasStream.getTracks().forEach((track) => track.stop());
  destination.stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();

  if (!chunks.length) {
    throw new Error("Recording produced no output.");
  }

  return new Blob(chunks, { type: mimeType });
}

async function convertWebmBlobToMp4(blob, durationSeconds) {
  const response = await fetch("/api/convert-webm", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Duration-Seconds": `${durationSeconds}`
    },
    body: blob
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.details || `Conversion failed (${response.status})`);
  }
  return body;
}

function revokeLastBlobUrl() {
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }
}

async function renderVideo() {
  const titleLines = cleanTitleLines(titleInput.value);
  if (!titleLines.length) {
    setStatus("Title is required.", true);
    return;
  }

  const subtitle = normalizeSubtitle(subtitleInput.value);
  const durationSeconds = getDurationSeconds();
  const darknessOpacity = getDarknessOpacity();

  renderBtn.disabled = true;
  resultVideo.style.display = "none";
  downloadLink.hidden = true;
  revokeLastBlobUrl();

  try {
    if (!currentPreviewMedia) {
      setStatus("No preview background selected. Loading one now...");
      await pickRandomPreviewMedia();
    }
    if (!currentPreviewMusic) {
      setStatus("No preview music selected. Loading one now...");
      await pickRandomPreviewMusic();
    }

    const media = currentPreviewMedia;
    const music = currentPreviewMusic;
    if (!media || !music) {
      throw new Error("Could not load preview background/music. Try randomizing and render again.");
    }

    lastMediaName.textContent = media.fileName;
    lastMusicName.textContent = music.fileName;

    setStatus("Rendering with current preview background/music...");
    const webmBlob = await renderInBrowser({
      media,
      music,
      titleLines,
      subtitle,
      durationSeconds,
      darknessOpacity
    });

    setStatus("Converting WebM to MP4...");
    const converted = await convertWebmBlobToMp4(webmBlob, durationSeconds);
    const outputUrl = `${converted.output.url}?ts=${Date.now()}`;

    resultVideo.src = outputUrl;
    resultVideo.style.display = "block";
    downloadLink.href = `${converted.output.url}?download=1`;
    downloadLink.download = converted.output.fileName;
    downloadLink.hidden = false;

    setStatus(`Rendered ${converted.output.fileName}.`);
    await refreshFolderStatus();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    renderBtn.disabled = false;
  }
}

refreshPreviewBtn.addEventListener("click", pickRandomPreviewMedia);
refreshMusicBtn.addEventListener("click", pickRandomPreviewMusic);
renderBtn.addEventListener("click", renderVideo);
titleInput.addEventListener("input", refreshPreviewText);
subtitleInput.addEventListener("input", refreshPreviewText);
durationInput.addEventListener("input", () => {
  startPreviewLoop();
});
darknessInput.addEventListener("input", () => {
  startPreviewLoop();
});

window.addEventListener("resize", fitPreviewText);
window.addEventListener("beforeunload", () => {
  stopPreviewLoop();
  revokeLastBlobUrl();
});

titleInput.value = "YOUR TITLE\nGOES HERE";
subtitleInput.value = "Smaller one-line text";
refreshPreviewText();
refreshFolderStatus();
pickRandomPreviewMusic();
pickRandomPreviewMedia();
