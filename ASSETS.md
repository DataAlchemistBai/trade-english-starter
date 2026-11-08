# Asset and provenance notice

## Images

The project owner states that the supplied character images were AI-generated and explicitly authorizes their public release with this project. They are included under the project MIT license, to the extent of the owner's rights. This is an owner-provided provenance statement, not an independent verification of an image-generation process.

The `images/` directory includes current portraits and historical alternatives. Active filenames are defined in `window.speakingCharacters` in `practice-pack.js`. Files are copied unchanged from the running project; some portraits are cropped only in the UI through an SVG viewport.

The six characters are fictional adults. Their names, jobs, ages, romantic relationships and sexual orientation are story elements, not assertions about an identifiable real person. Do not use the project to impersonate or make claims about real people.

## Audio

The 42 MP3 files are synthesized dialogue recordings supplied with the project for language practice: six beginner trade lessons and 36 retained story lessons. There is no microphone recording, live voice cloning or voice-model download in this repository. This separate edition regenerated audio using the same original story text, voice profiles and rate to obtain word-level service metadata; recordings in the parent website were not overwritten.

Each lesson has a corresponding file in `timings/` with sentence and word boundaries. Word starts come from speech-service metadata, not uniform text-length estimates. Rare zero-duration weak words use the next measured word start as their end, explicitly noted by `endSource`.

The existing recordings were prepared using these voice profiles:

| Character | Base voice | Pitch |
| --- | --- | --- |
| Evan | en-GB-RyanNeural | -2Hz |
| Oliver | en-GB-ThomasNeural | -2Hz |
| Miles | en-IE-ConnorNeural | -4Hz |
| Kai | en-GB-RyanNeural | +5Hz |
| Grant | en-GB-ThomasNeural | -14Hz |
| Dean | en-GB-RyanNeural | -12Hz |

All retain rate `-8%`. Different pitch profiles are not independent voice models; Miles has the established Irish accent. The `130wpm` filename suffix is historical, not a measured speed guarantee.

The MIT grant does not convey ownership of, access to or a license for third-party voice models, service endpoints or trademarks, and does not override applicable speech-provider terms. Check those terms for any further generation or intended reuse. No speech-service credentials or provider SDKs are bundled.

## Excluded from the public repository

- Internal hosting manifests and repository history.
- Credentials, account tokens, local configuration and absolute local paths.
- The user's personal context/profile and private conversation history.
- Intermediate sentence caches, temporary files and previous deployment archives.

The story notes contain only the fictional cast and authoring continuity. Browser progress and cached practice assets stay in each visitor's own browser and are not exported to GitHub.
