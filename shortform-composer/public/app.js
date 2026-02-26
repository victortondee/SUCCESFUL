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
const creditLayer = document.getElementById("creditLayer");
const creditHandle = document.getElementById("creditHandle");
const textLayer = document.getElementById("textLayer");
const previewTitle = document.getElementById("previewTitle");
const previewSubtitle = document.getElementById("previewSubtitle");
const previewAudio = document.getElementById("previewAudio");
const resultVideo = document.getElementById("resultVideo");
const downloadLink = document.getElementById("downloadLink");

let currentPreviewMedia = null;
let currentPreviewMusic = null;
let previewLoopInterval = null;
let titleRevealTimeout = null;
let subtitleRevealTimeout = null;
let creditRevealTimeout = null;
let titleLineRevealTimeouts = [];
let lastBlobUrl = null;
let instagramIconPromise = null;
const previewMeasureCanvas = document.createElement("canvas");
const previewMeasureCtx = previewMeasureCanvas.getContext("2d");
const CANVAS_RENDER_WIDTH = 1080;
const CANVAS_RENDER_HEIGHT = 1920;
const TEXT_WIDTH_RATIO = 0.8;
const TITLE_MIN_FONT_SIZE = 18;
const SUBTITLE_BASE_FONT_SIZE = 42;
const SUBTITLE_MIN_FONT_SIZE = 12;
const MAIN_TEXT_START_SECONDS = 1.0;
const TITLE_LINE_DELAY_SECONDS = 0.3;
const SUBTITLE_AFTER_LAST_MAIN_SECONDS = 0.3;
const AUTHOR_AFTER_FIRST_LINE_SECONDS = 0.05;
const REVEAL_DURATION_SECONDS = 0.8;
const CREDIT_TOP_RATIO = 0.16;
const CREDIT_TEXT_SIZE_PX = 35;
const CREDIT_ICON_SIZE_PX = 40;
const CREDIT_ICON_GAP_PX = 8;

function setStatus(message, isError = false) {
  statusText.textContent = message || "";
  statusText.classList.toggle("error", Boolean(isError));
}

function splitTitleLines(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

function normalizeHandle(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9._]/g, "");
  const edgeTrimmed = cleaned.replace(/^[._]+|[._]+$/g, "");
  if (edgeTrimmed.length < 2 || edgeTrimmed.length > 30) {
    return null;
  }
  return edgeTrimmed;
}

function extractArtistHandle(fileName) {
  if (!fileName) {
    return null;
  }

  const stem = fileName.replace(/\.[^.]+$/, "");
  const directAt = stem.match(/@([A-Za-z0-9._]{2,30})/);
  if (directAt) {
    return normalizeHandle(directAt[1]);
  }

  const instaPath = stem.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i);
  if (instaPath) {
    return normalizeHandle(instaPath[1]);
  }

  const byMarker = stem.match(
    /(?:^|[_\-\s])(by|ig|artist)[_\-\s]+([A-Za-z0-9._]{2,30})(?=$|[_\-\s])/i
  );
  if (byMarker) {
    return normalizeHandle(byMarker[2]);
  }

  const stemCandidate = normalizeHandle(
    stem
      .replace(/^snapinsta\.to[_\-]*/i, "")
      .replace(/^video[_\-]*/i, "")
      .replace(/^clip[_\-]*/i, "")
      .trim()
  );
  if (stemCandidate && /[A-Za-z]/.test(stemCandidate)) {
    return stemCandidate;
  }

  return null;
}

function updatePreviewCredit(media) {
  const handle = media?.type === "video" ? extractArtistHandle(media.fileName) : null;
  if (!handle) {
    creditHandle.textContent = "";
    creditLayer.hidden = true;
    return;
  }
  creditHandle.textContent = handle;
  creditLayer.hidden = false;
}

function loadInstagramIcon() {
  if (instagramIconPromise) {
    return instagramIconPromise;
  }
  instagramIconPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/assets/instagram.svg";
  });
  return instagramIconPromise;
}

async function ensureRenderFontsReady() {
  if (!document.fonts || typeof document.fonts.load !== "function") {
    return;
  }
  await Promise.allSettled([
    document.fonts.load('700 64px "Avenir Next"'),
    document.fonts.load('300 48px "Poppins Light"')
  ]);
}

function computeCreditLayoutForRender(canvasWidth, canvasHeight) {
  const labelSize = CREDIT_TEXT_SIZE_PX;
  const handleSize = CREDIT_TEXT_SIZE_PX;
  const iconSize = CREDIT_ICON_SIZE_PX;
  const gap = CREDIT_ICON_GAP_PX;
  const topY = Math.round(canvasHeight * CREDIT_TOP_RATIO);

  return {
    labelSize,
    handleSize,
    iconSize,
    gap,
    topY
  };
}

function applyPreviewCreditScale(frameWidth) {
  const scale = frameWidth / CANVAS_RENDER_WIDTH;
  const fontPx = Math.max(12, Math.round(CREDIT_TEXT_SIZE_PX * scale));
  const iconPx = Math.max(12, Math.round(CREDIT_ICON_SIZE_PX * scale));
  const gapPx = Math.max(3, Math.round(CREDIT_ICON_GAP_PX * scale));
  creditLayer.style.setProperty("--credit-font-size", `${fontPx}px`);
  creditLayer.style.setProperty("--credit-icon-size", `${iconPx}px`);
  creditLayer.style.setProperty("--credit-icon-gap", `${gapPx}px`);
}

function computeRenderTextSizes(titleLines, subtitle) {
  if (!previewMeasureCtx) {
    return {
      titleFontSize: TITLE_MIN_FONT_SIZE,
      subtitleFontSize: subtitle ? SUBTITLE_MIN_FONT_SIZE : 0
    };
  }
  const titleFontSize = computeTitleFont(
    previewMeasureCtx,
    titleLines,
    CANVAS_RENDER_WIDTH,
    CANVAS_RENDER_HEIGHT
  );
  const subtitleFontSize = computeSubtitleFont(previewMeasureCtx, subtitle, CANVAS_RENDER_WIDTH);
  return {
    titleFontSize,
    subtitleFontSize
  };
}

function computeAnimationTimeline(titleLineCount) {
  const safeLineCount = Math.max(1, titleLineCount);
  const mainStart = MAIN_TEXT_START_SECONDS;
  const lastLineStart = mainStart + (safeLineCount - 1) * TITLE_LINE_DELAY_SECONDS;
  const lastLineFullyVisible = lastLineStart + REVEAL_DURATION_SECONDS;
  const subtitleStart = lastLineFullyVisible + SUBTITLE_AFTER_LAST_MAIN_SECONDS;
  const firstLineCue = mainStart + TITLE_LINE_DELAY_SECONDS;
  const authorStart = firstLineCue + AUTHOR_AFTER_FIRST_LINE_SECONDS;
  return {
    mainStart,
    subtitleStart,
    authorStart
  };
}

function refreshPreviewText() {
  const titleLines = splitTitleLines(titleInput.value);
  const subtitle = normalizeSubtitle(subtitleInput.value);

  previewTitle.replaceChildren();
  for (const line of titleLines) {
    const lineElement = document.createElement("div");
    lineElement.className = "preview-title-line";
    lineElement.textContent = line;
    previewTitle.appendChild(lineElement);
  }
  previewTitle.style.display = titleLines.length ? "inline-block" : "none";
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

  applyPreviewCreditScale(frameW);

  if (!previewMeasureCtx) {
    return;
  }

  const titleLines = splitTitleLines(titleInput.value);
  const subtitle = normalizeSubtitle(subtitleInput.value);
  const scale = frameW / CANVAS_RENDER_WIDTH;
  let titleSize = Math.max(12, Math.round(TITLE_MIN_FONT_SIZE * scale));
  if (titleLines.length) {
    const renderSizes = computeRenderTextSizes(titleLines, subtitle);
    titleSize = Math.max(12, Math.round(renderSizes.titleFontSize * scale));
    previewTitle.style.fontSize = `${titleSize}px`;
    previewTitle.style.lineHeight = `${Math.round(titleSize * 1.16)}px`;
    if (previewSubtitle.style.display !== "none" && subtitle) {
      const subtitleSize = Math.max(
        10,
        Math.round(renderSizes.subtitleFontSize * scale)
      );
      previewSubtitle.style.fontSize = `${subtitleSize}px`;
    }
  } else if (previewSubtitle.style.display !== "none" && subtitle) {
    const subtitleSize = Math.max(
      10,
      Math.round(SUBTITLE_MIN_FONT_SIZE * scale)
    );
    previewSubtitle.style.fontSize = `${subtitleSize}px`;
  }
}

function clearRevealTimeouts() {
  if (titleRevealTimeout) {
    window.clearTimeout(titleRevealTimeout);
    titleRevealTimeout = null;
  }
  if (subtitleRevealTimeout) {
    window.clearTimeout(subtitleRevealTimeout);
    subtitleRevealTimeout = null;
  }
  if (creditRevealTimeout) {
    window.clearTimeout(creditRevealTimeout);
    creditRevealTimeout = null;
  }
  if (titleLineRevealTimeouts.length) {
    for (const timeoutId of titleLineRevealTimeouts) {
      window.clearTimeout(timeoutId);
    }
    titleLineRevealTimeouts = [];
  }
}

function stopPreviewLoop() {
  if (previewLoopInterval) {
    window.clearInterval(previewLoopInterval);
    previewLoopInterval = null;
  }
  clearRevealTimeouts();
  previewAudio.pause();
}

function runIntroAnimation() {
  clearRevealTimeouts();

  shadeLayer.style.transition = "none";
  shadeLayer.style.opacity = "0";
  textLayer.style.opacity = "1";
  textLayer.style.transform = "none";

  const titleLineElements = Array.from(previewTitle.querySelectorAll(".preview-title-line"));
  for (const lineElement of titleLineElements) {
    lineElement.style.transition = "none";
    lineElement.style.opacity = "0";
    lineElement.style.transform = "translateY(18px)";
  }

  previewSubtitle.style.transition = "none";
  previewSubtitle.style.opacity = "0";
  previewSubtitle.style.transform = "translateY(16px)";

  creditLayer.style.transition = "none";
  creditLayer.style.opacity = "0";
  creditLayer.style.transform = "translate(-50%, 10px)";

  // Force style flush so transitions restart every cycle.
  void shadeLayer.offsetHeight;

  const duration = getDurationSeconds();
  const timeline = computeAnimationTimeline(titleLineElements.length);
  const fadeMs = Math.max(
    500,
    Math.min(900, Math.round(Math.min(duration, REVEAL_DURATION_SECONDS * 1.25) * 1000))
  );
  shadeLayer.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  for (const lineElement of titleLineElements) {
    lineElement.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  }
  previewSubtitle.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  creditLayer.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  titleRevealTimeout = window.setTimeout(() => {
    shadeLayer.style.opacity = `${getDarknessOpacity()}`;
  }, Math.round(timeline.mainStart * 1000));

  titleLineRevealTimeouts = titleLineElements.map((lineElement, index) =>
    window.setTimeout(() => {
      lineElement.style.opacity = "1";
      lineElement.style.transform = "translateY(0px)";
    }, Math.round((timeline.mainStart + index * TITLE_LINE_DELAY_SECONDS) * 1000))
  );

  subtitleRevealTimeout = window.setTimeout(() => {
    if (previewSubtitle.style.display !== "none") {
      previewSubtitle.style.opacity = "1";
      previewSubtitle.style.transform = "translateY(0px)";
    }
  }, Math.round(timeline.subtitleStart * 1000));

  creditRevealTimeout = window.setTimeout(() => {
    if (!creditLayer.hidden) {
      creditLayer.style.opacity = "1";
      creditLayer.style.transform = "translate(-50%, 0px)";
    }
  }, Math.round(timeline.authorStart * 1000));
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
    updatePreviewCredit(currentPreviewMedia);
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
    updatePreviewCredit(null);
    setStatus(error.message, true);
  }
}

async function pickRandomPreviewMusic() {
  setStatus("Loading random preview music...");
  try {
    currentPreviewMusic = await fetchJson("/api/music/random");
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
  const maxWidth = width * TEXT_WIDTH_RATIO;
  const maxHeight = height * 0.44;

  for (let size = 220; size >= TITLE_MIN_FONT_SIZE; size -= 2) {
    ctx.font = `700 ${size}px \"Avenir Next\", \"Helvetica Neue\", sans-serif`;
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const lineHeight = size * 1.16;
    const blockHeight = lineHeight * lines.length;
    if (widest <= maxWidth && blockHeight <= maxHeight) {
      return size;
    }
  }

  return TITLE_MIN_FONT_SIZE;
}

function computeSubtitleFont(ctx, subtitle, width) {
  if (!subtitle) {
    return 0;
  }
  const maxWidth = width * TEXT_WIDTH_RATIO;
  for (let size = SUBTITLE_BASE_FONT_SIZE; size >= SUBTITLE_MIN_FONT_SIZE; size -= 1) {
    ctx.font = `300 ${size}px \"Poppins Light\", \"Poppins\", \"Avenir Next\", sans-serif`;
    if (ctx.measureText(subtitle).width <= maxWidth) {
      return size;
    }
  }
  return SUBTITLE_MIN_FONT_SIZE;
}

function drawCompositionFrame(ctx, source, payload, elapsedSeconds) {
  const {
    width,
    height,
    durationSeconds,
    darknessOpacity,
    creditHandleText,
    creditIconImage,
    creditLayout,
    titleLines,
    subtitle,
    titleFontSize,
    subtitleFontSize
  } = payload;
  const t = Math.min(elapsedSeconds, durationSeconds);
  const timeline = computeAnimationTimeline(titleLines.length);

  drawCover(ctx, source, width, height);

  if (t < timeline.mainStart) {
    return;
  }

  const darkProgress = clamp((t - timeline.mainStart) / REVEAL_DURATION_SECONDS, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${darknessOpacity * darkProgress})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const lineHeight = Math.round(titleFontSize * 1.16);
  const titleBlockHeight = lineHeight * titleLines.length;
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.2);
  const subtitleGap = subtitle ? clamp(width * 0.022, 10, 24) : 0;
  const contentHeight = titleBlockHeight + (subtitle ? subtitleGap + subtitleLineHeight : 0);
  const contentTop = (height - contentHeight) / 2;

  if (titleLines.length) {
    let y = contentTop;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `700 ${titleFontSize}px \"Avenir Next\", \"Helvetica Neue\", sans-serif`;
    ctx.shadowColor = "rgba(0, 0, 0, 0.58)";
    ctx.shadowBlur = Math.max(8, titleFontSize * 0.22);

    for (let index = 0; index < titleLines.length; index += 1) {
      const line = titleLines[index];
      const lineStart = timeline.mainStart + index * TITLE_LINE_DELAY_SECONDS;
      const lineProgress = clamp((t - lineStart) / REVEAL_DURATION_SECONDS, 0, 1);
      if (lineProgress > 0) {
        const yOffset = (1 - lineProgress) * 34;
        ctx.globalAlpha = lineProgress;
        ctx.fillText(line, width / 2, y + yOffset);
      }
      y += lineHeight;
    }
    ctx.restore();
  }

  if (subtitle) {
    const subtitleProgress = clamp(
      (t - timeline.subtitleStart) / REVEAL_DURATION_SECONDS,
      0,
      1
    );
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

  if (creditHandleText) {
    const creditProgress = clamp(
      (t - timeline.authorStart) / REVEAL_DURATION_SECONDS,
      0,
      1
    );
    if (creditProgress <= 0) {
      return;
    }

    const labelSize = creditLayout?.labelSize || CREDIT_TEXT_SIZE_PX;
    const handleSize = creditLayout?.handleSize || CREDIT_TEXT_SIZE_PX;
    const iconSize = creditLayout?.iconSize || CREDIT_ICON_SIZE_PX;
    const gap = creditLayout?.gap || CREDIT_ICON_GAP_PX;
    const labelLineHeight = Math.round(labelSize * 1.18);
    const creditBaseY = creditLayout?.topY || Math.round(height * CREDIT_TOP_RATIO);
    const creditYOffset = (1 - creditProgress) * 16;

    ctx.save();
    ctx.globalAlpha = 0.88 * creditProgress;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = Math.max(4, handleSize * 0.48);
    ctx.font = `500 ${labelSize}px \"Avenir Next\", \"Helvetica Neue\", sans-serif`;
    ctx.fillText("background art:", width / 2, creditBaseY + creditYOffset);

    ctx.font = `500 ${handleSize}px \"Avenir Next\", \"Helvetica Neue\", sans-serif`;
    ctx.textAlign = "left";
    const handleWidth = ctx.measureText(creditHandleText).width;
    const rowWidth = iconSize + gap + handleWidth;
    const rowStartX = Math.round(width / 2 - rowWidth / 2);
    const rowY = Math.round(creditBaseY + labelLineHeight + creditYOffset);

    if (creditIconImage) {
      ctx.drawImage(creditIconImage, rowStartX, rowY + Math.max(0, Math.round((handleSize - iconSize) / 2)), iconSize, iconSize);
    }
    ctx.fillText(creditHandleText, rowStartX + iconSize + gap, rowY);
    ctx.restore();
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

  const [sourceMedia, musicAudio, creditIconImage] = await Promise.all([
    media.type === "video"
      ? loadVideo(`${media.url}?ts=${Date.now()}`)
      : loadImage(`${media.url}?ts=${Date.now()}`),
    loadAudio(`${music.url}?ts=${Date.now()}`),
    loadInstagramIcon()
  ]);

  await ensureRenderFontsReady();

  const titleFontSize = computeTitleFont(ctx, titleLines, width, height);
  const subtitleFontSize = computeSubtitleFont(ctx, subtitle, width);
  const creditHandleText = media.type === "video" ? extractArtistHandle(media.fileName) : null;
  const creditLayout = computeCreditLayoutForRender(width, height);

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
      creditHandleText,
      creditIconImage,
      creditLayout,
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
        creditHandleText,
        creditIconImage,
        creditLayout,
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

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.details || `Conversion failed (${response.status})`);
  }
  const mp4Blob = await response.blob();
  if (!mp4Blob.size) {
    throw new Error("Conversion returned an empty MP4.");
  }
  const fileName = response.headers.get("x-output-filename") || `short_${Date.now()}.mp4`;
  return {
    blob: mp4Blob,
    fileName
  };
}

function revokeLastBlobUrl() {
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }
}

function startBrowserDownload(fileUrl, fileName) {
  const anchor = document.createElement("a");
  anchor.href = fileUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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
    const outputUrl = URL.createObjectURL(converted.blob);
    lastBlobUrl = outputUrl;

    resultVideo.src = outputUrl;
    resultVideo.style.display = "block";
    downloadLink.href = outputUrl;
    downloadLink.download = converted.fileName;
    downloadLink.hidden = false;
    startBrowserDownload(outputUrl, converted.fileName);

    setStatus(`Rendered ${converted.fileName}. Saved via browser download.`);
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

titleInput.value = "";
subtitleInput.value = "";
refreshPreviewText();
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    refreshPreviewText();
  });
}
refreshFolderStatus();
pickRandomPreviewMusic();
pickRandomPreviewMedia();
