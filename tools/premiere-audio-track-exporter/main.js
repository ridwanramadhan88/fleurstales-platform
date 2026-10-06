/* Audio Track Exporter — Premiere Pro UXP panel.
 *
 * Renders every audio track of the active sequence to its own WAV file by
 * muting all other audio tracks, exporting the sequence with a WAV preset,
 * then restoring the original mute states.
 */
const ppro = require("premierepro");
const { entrypoints, storage } = require("uxp");
const lfs = storage.localFileSystem;

let fs = null;
try { fs = require("fs"); } catch (_) { /* older UXP: fall back to storage API */ }

const STORE_PRESET = "ate.presetPath";
const STORE_FOLDER = "ate.outputFolder";
const STORE_TEMPLATE = "ate.nameTemplate";
const DEFAULT_TEMPLATE = "Track {n}_{sequence}";

const $ = (id) => document.getElementById(id);
let running = false;
let stopRequested = false;
let trackRows = []; // { index, name, clipCount, muted, checkbox }

// ---------- helpers ----------

function log(msg, cls) {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  $("log").appendChild(line);
  $("log").scrollTop = $("log").scrollHeight;
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}
function load(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function sanitize(name) {
  return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim() || "Sequence";
}

function joinPath(folder, file) {
  const sep = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  return folder.endsWith(sep) ? folder + file : folder + sep + file;
}

function buildFileName(template, trackNumber, sequenceName) {
  const base = (template || DEFAULT_TEMPLATE)
    .replace(/\{n\}/gi, String(trackNumber))
    .replace(/\{sequence\}/gi, sequenceName);
  return sanitize(base) + ".wav";
}

async function getFileSize(path) {
  if (fs) {
    for (const p of [path, "file:" + path]) {
      try {
        const st = await fs.lstat(p);
        return st.size;
      } catch (_) {}
    }
  }
  try {
    const entry = await lfs.getEntryWithUrl("file:" + path);
    const meta = await entry.getMetadata();
    return meta.size;
  } catch (_) {
    return -1; // does not exist / not accessible
  }
}

async function uniquePath(folder, fileName) {
  let candidate = joinPath(folder, fileName);
  const stem = fileName.replace(/\.wav$/i, "");
  for (let i = 2; (await getFileSize(candidate)) >= 0; i++) {
    candidate = joinPath(folder, `${stem} (${i}).wav`);
  }
  return candidate;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves when the render finished. Uses EncoderManager render events when
 * they fire, and otherwise falls back to watching the output file until its
 * size stops changing. Must be created BEFORE exportSequence is called, since
 * an IMMEDIATELY export can complete before the call returns.
 */
function createRenderWaiter(encoder, outputPath) {
  let done = false;
  let exportReturned = false;
  let resolveFn, rejectFn;
  const promise = new Promise((res, rej) => { resolveFn = res; rejectFn = rej; });

  const handlers = {
    [ppro.EncoderManager.EVENT_RENDER_COMPLETE]: () => finish(),
    [ppro.EncoderManager.EVENT_RENDER_ERROR]: (e) => finish(new Error("Render error" + (e ? `: ${JSON.stringify(e)}` : ""))),
    [ppro.EncoderManager.EVENT_RENDER_CANCEL]: () => finish(new Error("Render was cancelled")),
  };
  for (const [evt, fn] of Object.entries(handlers)) {
    try { ppro.EventManager.addEventListener(encoder, evt, fn); } catch (_) {}
  }

  let lastSize = -1;
  let stableTicks = 0;
  const poll = setInterval(async () => {
    if (done || !exportReturned) return;
    const size = await getFileSize(outputPath);
    if (size > 0 && size === lastSize) stableTicks++;
    else stableTicks = 0;
    lastSize = size;
    if (stableTicks >= 6) finish(); // ~3s with no growth
  }, 500);

  function finish(err) {
    if (done) return;
    done = true;
    clearInterval(poll);
    for (const [evt, fn] of Object.entries(handlers)) {
      try { ppro.EventManager.removeEventListener(encoder, evt, fn); } catch (_) {}
    }
    err ? rejectFn(err) : resolveFn();
  }

  return {
    promise,
    exportReturned() { exportReturned = true; },
    fail(err) { finish(err); },
  };
}

// ---------- sequence / tracks ----------

async function getActiveSequence() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("No project is open.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("No active sequence. Open a sequence in the Timeline.");
  return sequence;
}

async function refresh() {
  try {
    const sequence = await getActiveSequence();
    $("seqName").textContent = sequence.name;

    try {
      const settings = await sequence.getSettings();
      const rate = await settings.getAudioSampleRate();
      const ch = await settings.getAudioChannelCount();
      $("seqInfo").textContent = `Sequence audio: ${Math.round(rate.value)} Hz, ${ch} ch`;
    } catch (_) {
      $("seqInfo").textContent = "";
    }

    const count = await sequence.getAudioTrackCount();
    trackRows = [];
    const list = $("trackList");
    list.innerHTML = "";
    if (!count) {
      list.innerHTML = '<span class="meta">This sequence has no audio tracks.</span>';
      return;
    }
    for (let i = 0; i < count; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
      const clipCount = items ? items.length : 0;
      const muted = await track.isMuted();

      const row = document.createElement("div");
      row.className = "track";
      const cb = document.createElement("sp-checkbox");
      cb.textContent = `Track ${i + 1}${track.name ? ` — ${track.name}` : ""}`;
      if (clipCount > 0 || !$("skipEmpty").checked) cb.checked = true;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${clipCount} clip${clipCount === 1 ? "" : "s"}${muted ? " · muted" : ""}`;
      row.appendChild(cb);
      row.appendChild(meta);
      list.appendChild(row);
      trackRows.push({ index: i, name: track.name, clipCount, muted, checkbox: cb });
    }
  } catch (e) {
    $("seqName").textContent = "No active sequence";
    $("seqInfo").textContent = "";
    $("trackList").innerHTML = `<span class="meta">${e.message}</span>`;
  }
}

// ---------- pickers ----------

async function pickPreset() {
  const file = await lfs.getFileForOpening({ types: ["epr"] });
  if (!file || !file.nativePath) return;
  store(STORE_PRESET, file.nativePath);
  $("presetPath").textContent = file.nativePath;
  await validatePreset(file.nativePath);
}

async function validatePreset(presetPath) {
  try {
    const sequence = await getActiveSequence();
    const ext = String(await ppro.EncoderManager.getExportFileExtension(sequence, presetPath) || "")
      .replace(/^\./, "").toLowerCase();
    if (ext && ext !== "wav") {
      log(`Preset produces ".${ext}" files, not WAV. Pick a Waveform Audio preset.`, "err");
      return false;
    }
    if (ext === "wav") log("Preset OK: Waveform Audio (.wav).", "ok");
  } catch (_) { /* no sequence yet — validated again at export time */ }
  return true;
}

async function pickFolder() {
  const folder = await lfs.getFolder();
  if (!folder || !folder.nativePath) return;
  store(STORE_FOLDER, folder.nativePath);
  $("folderPath").textContent = folder.nativePath;
}

// ---------- export ----------

async function setMuteStates(sequence, states) {
  for (let i = 0; i < states.length; i++) {
    const track = await sequence.getAudioTrack(i);
    if ((await track.isMuted()) !== states[i]) await track.setMute(states[i]);
  }
}

async function exportTracks() {
  if (running) return;
  const presetPath = load(STORE_PRESET);
  const folder = load(STORE_FOLDER);
  if (!presetPath) return log("Choose a WAV export preset (.epr) first.", "err");
  if (!folder) return log("Choose an output folder first.", "err");

  let sequence;
  try { sequence = await getActiveSequence(); } catch (e) { return log(e.message, "err"); }

  if (!trackRows.length) await refresh();
  const selected = trackRows.filter((r) => r.checkbox.checked);
  if (!selected.length) return log("No tracks selected.", "err");
  if (!(await validatePreset(presetPath))) return;

  const template = $("nameTemplate").value || DEFAULT_TEMPLATE;
  store(STORE_TEMPLATE, template);
  const seqName = sanitize(sequence.name);
  const exportFull = !$("useInOut").checked;
  const overwrite = $("overwrite").checked;
  const encoder = ppro.EncoderManager.getManager();

  const count = await sequence.getAudioTrackCount();
  const original = [];
  for (let i = 0; i < count; i++) original.push(await (await sequence.getAudioTrack(i)).isMuted());

  running = true;
  stopRequested = false;
  $("exportBtn").disabled = true;
  $("cancelBtn").disabled = false;
  let ok = 0;

  try {
    for (const row of selected) {
      if (stopRequested) { log("Stopped by user.", "err"); break; }
      const trackNumber = row.index + 1;
      const fileName = buildFileName(template, trackNumber, seqName);
      const outputPath = overwrite ? joinPath(folder, fileName) : await uniquePath(folder, fileName);

      // Solo this track: unmute it, mute every other audio track.
      await setMuteStates(sequence, original.map((_, i) => i !== row.index));
      log(`Rendering Track ${trackNumber} → ${outputPath}`);

      const waiter = createRenderWaiter(encoder, outputPath);
      try {
        const started = await encoder.exportSequence(
          sequence,
          ppro.Constants.ExportType.IMMEDIATELY,
          outputPath,
          presetPath,
          exportFull
        );
        if (started === false) waiter.fail(new Error("Premiere refused the export (check preset and path)."));
        waiter.exportReturned();
        await waiter.promise;
        ok++;
        log(`Done: ${fileName}`, "ok");
      } catch (e) {
        waiter.fail(e);
        log(`Track ${trackNumber} failed: ${e.message || e}`, "err");
      }
      await sleep(250);
    }
  } finally {
    try {
      await setMuteStates(sequence, original);
      log("Restored original track mute states.");
    } catch (e) {
      log(`Could not restore mute states: ${e.message || e}`, "err");
    }
    running = false;
    $("exportBtn").disabled = false;
    $("cancelBtn").disabled = true;
    log(`Finished: ${ok}/${selected.length} track(s) exported.`, ok === selected.length ? "ok" : "err");
  }
}

// ---------- init ----------

function init() {
  const preset = load(STORE_PRESET);
  const folder = load(STORE_FOLDER);
  const template = load(STORE_TEMPLATE);
  if (preset) $("presetPath").textContent = preset;
  if (folder) $("folderPath").textContent = folder;
  if (template) $("nameTemplate").value = template;

  $("pickPreset").addEventListener("click", pickPreset);
  $("pickFolder").addEventListener("click", pickFolder);
  $("refresh").addEventListener("click", refresh);
  $("skipEmpty").addEventListener("change", refresh);
  $("exportBtn").addEventListener("click", exportTracks);
  $("cancelBtn").addEventListener("click", () => {
    stopRequested = true;
    log("Stopping after the current track…");
  });
  refresh();
}

entrypoints.setup({
  panels: {
    audioTrackExporterPanel: {
      show() { if (!running) refresh(); },
    },
  },
});

init();
