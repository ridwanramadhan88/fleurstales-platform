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
let os = null;
try { fs = require("fs"); } catch (_) { /* older UXP: fall back to storage API */ }
try { os = require("os"); } catch (_) {}

const STORE_PRESET = "ate.presetPath";
const STORE_FOLDER = "ate.outputFolder";
const STORE_TEMPLATE = "ate.nameTemplate";
const DEFAULT_TEMPLATE = "Track {n}_{sequence}";
const WATCH_INTERVAL_MS = 1500;

const $ = (id) => document.getElementById(id);
let running = false;
let stopRequested = false;
let refreshing = false;
let trackRows = []; // { index, name, clipCount, muted, checkbox }
let currentSignature = "";
let currentSeqKey = "";
let presetPath = null;

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

function sepOf(p) {
  return p.includes("\\") && !p.includes("/") ? "\\" : "/";
}

function joinPath(folder, file) {
  const sep = sepOf(folder);
  return folder.endsWith(sep) ? folder + file : folder + sep + file;
}

function dirname(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i > 0 ? p.slice(0, i) : p;
}

function buildFileName(template, trackNumber, sequenceName) {
  const base = (template || DEFAULT_TEMPLATE)
    .replace(/\{n\}/gi, String(trackNumber))
    .replace(/\{sequence\}/gi, sequenceName);
  return sanitize(base) + ".wav";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- file system (fs module first, storage API fallback) ----------

async function stat(path) {
  if (fs) {
    for (const p of [path, "file:" + path]) {
      try {
        const st = await fs.lstat(p);
        return { size: st.size, isDir: st.isDirectory() };
      } catch (_) {}
    }
  }
  try {
    const entry = await lfs.getEntryWithUrl("file:" + path);
    if (entry.isFolder) return { size: 0, isDir: true };
    const meta = await entry.getMetadata();
    return { size: meta.size, isDir: false };
  } catch (_) {
    return null;
  }
}

async function getFileSize(path) {
  const st = await stat(path);
  return st && !st.isDir ? st.size : -1;
}

async function listDir(path) {
  if (fs) {
    for (const p of [path, "file:" + path]) {
      try {
        const names = await fs.readdir(p);
        const out = [];
        for (const name of names) {
          const full = joinPath(path, name);
          const st = await stat(full);
          if (st) out.push({ name, path: full, isDir: st.isDir });
        }
        return out;
      } catch (_) {}
    }
  }
  try {
    const folder = await lfs.getEntryWithUrl("file:" + path);
    const entries = await folder.getEntries();
    return entries.map((e) => ({ name: e.name, path: e.nativePath, isDir: e.isFolder }));
  } catch (_) {
    return [];
  }
}

async function ensureFolder(path) {
  const st = await stat(path);
  if (st && st.isDir) return true;
  if (fs) {
    for (const p of [path, "file:" + path]) {
      try { await fs.mkdir(p, { recursive: true }); return true; } catch (_) {}
    }
  }
  return false;
}

async function uniquePath(folder, fileName) {
  let candidate = joinPath(folder, fileName);
  const stem = fileName.replace(/\.wav$/i, "");
  for (let i = 2; (await getFileSize(candidate)) >= 0; i++) {
    candidate = joinPath(folder, `${stem} (${i}).wav`);
  }
  return candidate;
}

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

// ---------- sequence / tracks (auto-follows the open timeline) ----------

async function getActiveProject() {
  return ppro.Project.getActiveProject();
}

async function getActiveSequence() {
  const project = await getActiveProject();
  if (!project) throw new Error("No project is open.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("No active sequence. Open a sequence in the Timeline.");
  return sequence;
}

function seqKey(sequence) {
  try { return sequence.guid.toString(); } catch (_) { return sequence.name; }
}

async function readTracks(sequence) {
  const count = await sequence.getAudioTrackCount();
  const tracks = [];
  for (let i = 0; i < count; i++) {
    const track = await sequence.getAudioTrack(i);
    const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    tracks.push({
      index: i,
      name: track.name,
      clipCount: items ? items.length : 0,
      muted: await track.isMuted(),
    });
  }
  return tracks;
}

function showNoSequence(message) {
  currentSeqKey = "";
  currentSignature = "";
  trackRows = [];
  $("seqName").textContent = "No active sequence";
  $("seqInfo").textContent = "";
  $("trackList").innerHTML = `<span class="meta">${message}</span>`;
}

/** Re-reads the active timeline; rebuilds the track list only if something changed. */
async function refresh(force) {
  if (running || refreshing) return;
  refreshing = true;
  try {
    let sequence;
    try {
      sequence = await getActiveSequence();
    } catch (e) {
      if (currentSeqKey || force || !$("trackList").textContent) showNoSequence(e.message);
      return;
    }

    const key = seqKey(sequence);
    const tracks = await readTracks(sequence);
    const signature = key + "|" + sequence.name + "|" + tracks.map((t) => `${t.clipCount}:${t.muted ? 1 : 0}:${t.name}`).join(",");
    if (!force && signature === currentSignature) return;

    const sameSequence = key === currentSeqKey;
    const previousChecks = new Map(trackRows.map((r) => [r.index, r.checkbox.checked]));
    currentSeqKey = key;
    currentSignature = signature;

    $("seqName").textContent = sequence.name;
    try {
      const settings = await sequence.getSettings();
      const rate = await settings.getAudioSampleRate();
      const ch = await settings.getAudioChannelCount();
      $("seqInfo").textContent = `Sequence audio: ${Math.round(rate.value)} Hz, ${ch} ch`;
    } catch (_) {
      $("seqInfo").textContent = "";
    }

    const list = $("trackList");
    list.innerHTML = "";
    trackRows = [];
    if (!tracks.length) {
      list.innerHTML = '<span class="meta">This sequence has no audio tracks.</span>';
    }
    for (const t of tracks) {
      const row = document.createElement("div");
      row.className = "track";
      const cb = document.createElement("sp-checkbox");
      cb.textContent = `Track ${t.index + 1}${t.name ? ` — ${t.name}` : ""}`;
      const defaultChecked = t.clipCount > 0 || !$("skipEmpty").checked;
      cb.checked = sameSequence && previousChecks.has(t.index) ? previousChecks.get(t.index) : defaultChecked;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${t.clipCount} clip${t.clipCount === 1 ? "" : "s"}${t.muted ? " · muted" : ""}`;
      row.appendChild(cb);
      row.appendChild(meta);
      list.appendChild(row);
      trackRows.push({ ...t, checkbox: cb });
    }

    if (!sameSequence) {
      await fillDefaultFolder();
      if (!presetPath) await detectPreset(false);
    }
  } catch (e) {
    console.error(e);
  } finally {
    refreshing = false;
  }
}

function watchTimeline() {
  const onChange = () => setTimeout(() => refresh(false), 200);
  const C = ppro.Constants;
  const events = [
    C.SequenceEvent && C.SequenceEvent.ACTIVATED,
    C.SequenceEvent && C.SequenceEvent.CLOSED,
    C.ProjectEvent && C.ProjectEvent.ACTIVATED,
    C.ProjectEvent && C.ProjectEvent.OPENED,
    C.ProjectEvent && C.ProjectEvent.CLOSED,
  ];
  for (const evt of events) {
    if (evt === undefined) continue;
    try { ppro.EventManager.addGlobalEventListener(evt, onChange); } catch (_) {}
  }
  // Safety net: catches timeline switches, added/removed tracks and clips.
  setInterval(() => refresh(false), WATCH_INTERVAL_MS);
}

// ---------- output folder ----------

async function fillDefaultFolder() {
  if ($("folderPath").value) return;
  try {
    const project = await getActiveProject();
    if (project && project.path) $("folderPath").value = dirname(project.path);
  } catch (_) {}
}

async function pickFolder() {
  const folder = await lfs.getFolder();
  if (!folder || !folder.nativePath) return;
  $("folderPath").value = folder.nativePath;
  store(STORE_FOLDER, folder.nativePath);
}

// ---------- WAV preset (.epr) ----------

function showPreset(path, note) {
  presetPath = path;
  if (path) store(STORE_PRESET, path);
  const name = path ? path.split(/[\\/]/).pop().replace(/\.epr$/i, "") : "";
  $("presetPath").textContent = path ? `${name}${note ? ` (${note})` : ""}\n${path}` : note;
  $("presetPath").className = path ? "path" : "path err";
}

async function isWavPreset(sequence, path) {
  try {
    const ext = String(await ppro.EncoderManager.getExportFileExtension(sequence, path) || "");
    return ext.replace(/^\./, "").toLowerCase() === "wav";
  } catch (_) {
    return false;
  }
}

function homeDir(projectPath) {
  try { if (os && os.homedir) return os.homedir(); } catch (_) {}
  const m = projectPath && projectPath.match(/^(\/Users\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/);
  return m ? m[1] : null;
}

function isWindows() {
  try { if (os && os.platform) return os.platform() === "win32"; } catch (_) {}
  return navigator.platform ? /win/i.test(navigator.platform) : false;
}

async function findEprFiles(root, depth, out, max) {
  if (depth < 0 || out.length >= max) return;
  for (const e of await listDir(root)) {
    if (out.length >= max) return;
    if (e.isDir) await findEprFiles(e.path, depth - 1, out, max);
    else if (/\.epr$/i.test(e.name)) out.push(e.path);
  }
}

/** Folders that may hold WAV presets, best source first. */
async function presetRoots(project) {
  const roots = [];
  try {
    const pf = await lfs.getPluginFolder();
    roots.push({ path: joinPath(pf.nativePath, "presets"), source: "bundled", all: true });
  } catch (_) {}

  const home = homeDir(project && project.path);
  if (home) {
    const amePresets = joinPath(joinPath(joinPath(home, "Documents"), "Adobe"), "Adobe Media Encoder");
    for (const v of await listDir(amePresets)) {
      if (v.isDir) roots.push({ path: joinPath(v.path, "Presets"), source: "your presets", all: true });
    }
  }

  const appParents = isWindows()
    ? ["C:\\Program Files\\Adobe"]
    : ["/Applications"];
  for (const parent of appParents) {
    for (const app of await listDir(parent)) {
      if (!app.isDir || !/^Adobe (Premiere Pro|Media Encoder)/i.test(app.name)) continue;
      if (isWindows()) {
        roots.push({ path: joinPath(joinPath(app.path, "MediaIO"), "systempresets"), source: "Adobe built-in" });
      } else {
        for (const bundle of await listDir(app.path)) {
          if (/\.app$/i.test(bundle.name)) {
            roots.push({
              path: [bundle.path, "Contents", "MediaIO", "systempresets"].join("/"),
              source: "Adobe built-in",
            });
          }
        }
      }
    }
  }
  return roots;
}

function qualityScore(path) {
  const s = path.toLowerCase();
  let score = 0;
  if (/32[\s_-]?bit|32f|float/.test(s)) score += 30;
  else if (/24[\s_-]?bit/.test(s)) score += 20;
  else if (/16[\s_-]?bit/.test(s)) score += 10;
  if (/96\s?k/.test(s)) score += 3;
  else if (/48\s?k/.test(s)) score += 2;
  return score;
}

/** Finds the best WAV preset on this computer. */
async function detectPreset(verbose) {
  let sequence;
  try { sequence = await getActiveSequence(); } catch (_) {
    if (!presetPath) showPreset(null, "Open a sequence to auto-detect a WAV preset.");
    return;
  }

  const saved = load(STORE_PRESET);
  if (!verbose && saved && (await getFileSize(saved)) > 0 && (await isWavPreset(sequence, saved))) {
    showPreset(saved, "saved");
    return;
  }

  $("presetPath").textContent = "Searching for WAV presets…";
  const project = await getActiveProject();
  const roots = await presetRoots(project);
  let best = null;

  for (let r = 0; r < roots.length; r++) {
    const root = roots[r];
    const files = [];
    await findEprFiles(root.path, 6, files, 2000);
    // System folders hold hundreds of presets; only test the ones named like WAV.
    const candidates = root.all ? files : files.filter((f) => /wav|waveform/i.test(f));
    for (const f of candidates) {
      if (!(await isWavPreset(sequence, f))) continue;
      // Earlier roots win (bundled > yours > built-in); within a root, higher quality wins.
      const score = (roots.length - r) * 1000 + qualityScore(f);
      if (!best || score > best.score) best = { path: f, score, source: root.source };
    }
    if (best && root.source !== "Adobe built-in") break;
  }

  if (best) {
    showPreset(best.path, best.source);
    if (verbose) log(`Using WAV preset: ${best.path}`, "ok");
    if (best.source === "Adobe built-in" && qualityScore(best.path) < 30) {
      log("Using Adobe's built-in WAV preset. For 32-bit float, save your own preset (see README) and pick it with “Choose .epr…”.", "warn");
    }
  } else {
    showPreset(null, "No WAV preset found. Click “Choose .epr…” or save one from Premiere's Export settings (Format: Waveform Audio).");
  }
}

async function pickPreset() {
  const file = await lfs.getFileForOpening({ types: ["epr"] });
  if (!file || !file.nativePath) return;
  try {
    const sequence = await getActiveSequence();
    if (!(await isWavPreset(sequence, file.nativePath))) {
      log("That preset doesn't export .wav files. Pick a Waveform Audio preset.", "err");
      return;
    }
  } catch (_) { /* no sequence open: checked again at export */ }
  showPreset(file.nativePath, "chosen");
  log("Preset set.", "ok");
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

  let sequence;
  try { sequence = await getActiveSequence(); } catch (e) { return log(e.message, "err"); }

  await refresh(true);
  if (!presetPath) await detectPreset(true);
  if (!presetPath) return log("No WAV preset available — click “Choose .epr…”.", "err");
  if (!(await isWavPreset(sequence, presetPath))) return log("The selected preset doesn't export WAV.", "err");

  const folder = ($("folderPath").value || "").trim();
  if (!folder) return log("Choose an output folder first.", "err");
  if (!(await ensureFolder(folder))) return log(`Output folder doesn't exist and couldn't be created: ${folder}`, "err");
  store(STORE_FOLDER, folder);

  const selected = trackRows.filter((r) => r.checkbox.checked);
  if (!selected.length) return log("No tracks selected.", "err");

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
    refresh(true);
  }
}

// ---------- init ----------

function init() {
  const folder = load(STORE_FOLDER);
  const template = load(STORE_TEMPLATE);
  if (folder) $("folderPath").value = folder;
  if (template) $("nameTemplate").value = template;

  $("pickFolder").addEventListener("click", pickFolder);
  $("folderPath").addEventListener("change", () => store(STORE_FOLDER, ($("folderPath").value || "").trim()));
  $("findPreset").addEventListener("click", () => detectPreset(true));
  $("pickPreset").addEventListener("click", pickPreset);
  $("skipEmpty").addEventListener("change", () => {
    currentSeqKey = ""; // re-apply default selection
    refresh(true);
  });
  $("exportBtn").addEventListener("click", exportTracks);
  $("cancelBtn").addEventListener("click", () => {
    stopRequested = true;
    log("Stopping after the current track…");
  });

  watchTimeline();
  refresh(true).then(() => { if (!presetPath) detectPreset(false); });
}

entrypoints.setup({
  panels: {
    audioTrackExporterPanel: {
      show() { refresh(false); },
    },
  },
});

init();
