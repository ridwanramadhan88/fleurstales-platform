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

## 1. Create the best-quality WAV preset (one time)

Premiere needs an export preset (`.epr`) to know the format. Make one like this:

1. Open any sequence, then go to **File → Export → Media** (or the **Export** tab).
2. Set **Format** to **Waveform Audio**.
3. In the **Audio** section:
   - **Audio Codec:** Uncompressed
   - **Sample Rate:** the same as your sequence (usually **48000 Hz**). Pick
     96000 Hz only if your source audio is 96 kHz. Raising the rate adds no
     quality.
   - **Sample Size:** **32-bit float** gives the highest quality, with no
     clipping and no quantization. If your DAW or client needs integer files,
     use **24-bit** instead.
   - **Channels:** Stereo, or match your sequence or tracks.
4. Click the **⋯ / Preset** menu, choose **Save Preset…**, and name it
   `WAV 48k 32-bit float`, for example.
5. Find the saved `.epr` file:
   - macOS: `~/Documents/Adobe/Adobe Media Encoder/<version>/Presets/`
   - Windows: `Documents\Adobe\Adobe Media Encoder\<version>\Presets\`

   You can also use **Preset → Export Preset…** to save it anywhere.

## 2. Install the plugin

**For development or personal use, with UXP Developer Tool:**

1. Install **Adobe UXP Developer Tool** from the Creative Cloud app.
2. Click **Add Plugin** and select this folder's `manifest.json`.
3. Start Premiere Pro, then click **Load** on the plugin in UDT.
4. Open the panel from **Window → UXP Plugins → Audio Track Exporter**.

**To distribute it:** in UDT, choose **⋯ → Package**. This creates a `.ccx`
file that installs when you double-click it.

## 3. Use it

1. Open the sequence you want to split in the Timeline.
2. In the panel, click **Choose preset…** and select your WAV `.epr`. The panel
   checks that the preset really produces `.wav` files.
3. Click **Choose folder…** and select an output folder.
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
