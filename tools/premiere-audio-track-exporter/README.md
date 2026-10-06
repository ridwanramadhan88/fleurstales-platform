# Audio Track Exporter (Premiere Pro UXP plugin)

A Premiere Pro panel that renders **each audio track of the open sequence to
its own WAV file**. Files are named by default:

```
Track 1_My Sequence.wav
Track 2_My Sequence.wav
...
```

To isolate a track, the panel mutes every other audio track, exports the
sequence with your WAV preset, moves on to the next track, and then puts every
track's mute state back the way it was. Each file contains the track after its
clip and track effects, volume and panning, and the master track's effects.

Requires Premiere Pro **25.1 or later**, which has the UXP plugin API.

## 1. The WAV preset (`.epr`)

An `.epr` file is a saved Premiere/Media Encoder **export preset**: it tells
Premiere the format and quality (Waveform Audio, sample rate, bit depth). The
UXP API can only export with one, so the panel **finds one automatically**, in
this order:

1. `presets/` inside this plugin folder (drop your own `.epr` here)
2. Your saved presets (`Documents/Adobe/Adobe Media Encoder/<version>/Presets`)
3. Adobe's built-in WAV presets that ship with Premiere / Media Encoder

It checks every candidate really produces `.wav` and prefers the highest bit
depth. Adobe's built-in WAV preset may be 16-bit. For **best quality** save
your own once:

1. **File → Export → Media**, **Format:** Waveform Audio.
2. **Audio Codec:** Uncompressed · **Sample Rate:** same as the sequence
   (usually 48000 Hz) · **Sample Size:** **32-bit float** (24-bit if your
   client needs integer files) · **Channels:** Stereo.
3. Preset menu → **Save Preset…**, name it e.g. `WAV 48k 32-bit float`.
4. In the panel click **Auto-detect** (or **Choose .epr…**), or copy the `.epr`
   into `presets/`.

## 2. Install the plugin

**For development or personal use, with UXP Developer Tool:**

1. Install **Adobe UXP Developer Tool** from the Creative Cloud app.
2. Click **Add Plugin** and select this folder's `manifest.json`.
3. Start Premiere Pro, then click **Load** on the plugin in UDT.
4. Open the panel from **Window → UXP Plugins → Audio Track Exporter**.

**To distribute it:** in UDT, choose **⋯ → Package**. This creates a `.ccx`
file that installs when you double-click it.

## 3. Use it

1. Open the sequence you want to split in the Timeline. The panel follows
   whichever timeline you have open, and updates when you add or remove tracks
   or clips.
2. **Output folder:** type a path or click **Browse…**. It defaults to the
   project's folder and is created if it doesn't exist.
3. Check the preset line shows a WAV preset (see above).
4. Optional settings:
   - **File name:** the default is `Track {n}_{sequence}`. `{n}` is the audio
     track number (A1 = 1), and `{sequence}` is the sequence name.
   - **Skip tracks with no clips:** on by default.
   - **Only export In/Out range:** exports the In/Out range instead of the full
     sequence.
   - **Overwrite existing files:** when off, a number is added, as in
     `Track 1_Seq (2).wav`.
5. Select or deselect tracks, then click **Export tracks**.

The panel remembers the preset, folder and name template.

## Notes and limitations

- **Solo buttons:** the UXP API can't read or change track solo. Turn off
  every **Solo (S)** button on the timeline before exporting, or soloed tracks
  will override the muting.
- **Submix tracks:** each file is rendered through the full mix path, so a
  track routed to a submix gets that submix's processing.
- **Track numbers:** these are timeline positions (A1, A2, …), not custom track
  names.
- **Stop:** this finishes the track that is currently rendering, then stops and
  restores mute states.
