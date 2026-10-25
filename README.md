# Discord Voice AI Bot

A self-hosted Discord companion that talks in voice channels, streams music, and tracks community XP. Chat, transcription, and speech generation run locally using Ollama, Faster-Whisper, and Piper.

Built with Node.js and Python. No hosted AI API key is required. A Discord bot token is required; Discord and online music need internet access.

## Features

- AI text chat with separate conversation history per user and channel.
- Spoken questions and replies, activated by “Playboy” at the start of a request.
- Automatic listening with a join notice, individual opt-out, and call-wide pause.
- Local music files and online song-name search using yt-dlp and FFmpeg.
- Queue, skip, autoplay, volume, and music pause/resume controls.
- Music pauses while the bot speaks.
- Persistent chat and voice XP, levels, and a top-ten leaderboard.
- Emoji and Markdown cleanup for spoken replies.
- Windows setup scripts and automated tests.

## Architecture

Discord audio is decoded into PCM, wrapped in WAV, and sent to an authenticated Python service on localhost. Faster-Whisper transcribes it. Explicit music commands go to the music player; other activated requests go to Ollama. Piper generates a WAV reply for playback in Discord.

| File | Responsibility |
| --- | --- |
| `src/index.js` | Discord events, voice sessions, commands, and playback |
| `src/local-ai.js` | Ollama and local speech-service requests |
| `scripts/voice_service.py` | Loaded speech models and localhost HTTP endpoints |
| `src/web-music.js` | Online search and FFmpeg streams |
| `src/autoplay.js` | Next-song selection and recent-track history |
| `src/levels.js` | XP rules and persistent progress |
| `src/util.js` | Activation, parsing, audio wrapping, and text cleanup |

## Requirements

The included launchers target Windows:

- Node.js 24.17 or newer, with npm.
- Python 3.11, 64-bit, with the Windows Python launcher.
- FFmpeg available on PATH.
- Ollama installed and running locally.
- Several GB of disk space for downloaded models.

The default models are `qwen3:4b-instruct` for chat, `base.en` for transcription, and `en_US-ryan-high` for speech. Whisper and Piper use the CPU; Ollama can use a supported GPU. A machine with 16 GB RAM and a modest dedicated GPU is a reasonable starting point, but response speed varies.

Official downloads: [Node.js](https://nodejs.org/), [Python](https://www.python.org/downloads/windows/), [FFmpeg](https://ffmpeg.org/download.html), and [Ollama](https://ollama.com/download/windows).

## Setup

1. Clone or extract the project into a new folder.
2. Install the requirements and open Ollama.
3. Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
4. Enable **Message Content Intent** on the Bot page.
5. Invite the bot using the `bot` scope with View Channels, Send Messages, Read Message History, Connect, and Speak permissions. Administrator permission is not required.
6. Copy `.env.example` to `.env`. Set `DISCORD_TOKEN` to your private bot token and `DISCORD_GUILD_ID` to your server ID. Discord Developer Mode enables the Copy Server ID option.
7. Run **SETUP-WINDOWS.cmd**. Wait for dependency installation and model downloads to complete successfully.
8. Run **START-WINDOWS.cmd** and wait for the ready message.
9. Join a normal voice channel, type `!join`, and say **“Playboy, can you hear me?”** in one sentence.

For later launches, keep Ollama open and run START-WINDOWS.cmd. Ctrl+C stops the bot and speech worker; Ollama stays running independently. This version serves one configured Discord server.

To change the chat model, first run `ollama pull MODEL_NAME`, then set `OLLAMA_MODEL` to that installed name in `.env` and restart. Speech models must also be downloaded before use. UPDATE-VOICE.cmd downloads and checks Ryan high and generates a local preview; UPDATE-MUSIC.cmd updates online music support.

## Commands

The default prefix is `!`, configurable through `BOT_PREFIX`.

| Command | Action |
| --- | --- |
| `!help` | Command summary |
| `!ask question` | AI text reply |
| `!forget` | Clear your text history in this channel |
| `!join` / `!leave` | Join your call / disconnect |
| `!voice` | Listening state and last activation result |
| `!listen off` / `!listen on` | Opt out / re-enable listening for yourself |
| `!pause` / `!resume` | Pause / resume voice listening for the call |
| `!tracks` | List local music |
| `!play song name by artist` | Queue a local match or online search |
| `!queue` / `!skip` / `!stop` | Show queue / skip / stop and clear queue |
| `!autoplay` | Show autoplay status |
| `!autoplay on` / `!autoplay off` | Enable / disable automatic next-song selection |
| `!mpause` / `!mresume` | Pause / resume music |
| `!volume 0-100` | Set music volume |
| `!rank` / `!level` / `!xp` | Your level and XP; optionally add `@user` |
| `!leaderboard` / `!lb` | Top ten saved members |

Voice and music controls require being in the bot's call, except for listing tracks. Spoken examples:

- “Playboy, play song name by artist.”
- “Playboy, could you please play song name by artist?”
- “Playboy, skip.” or “Playboy, next song.”
- “Playboy, stop music.”
- “Playboy, autoplay on.” or “Playboy, autoplay off.”

Spoken play requests search online. Text play requests check local filenames first. Searches run when a track reaches the front of the queue. Direct URLs and Spotify playback are not supported. Only add or request music you have permission to play.

## XP

Chat messages earn 15 XP with a 60-second cooldown per member. Commands, bots, messages shorter than five characters, and repeats of the last rewarded message do not earn XP.

Voice participation earns 10 XP per full eligible minute when at least two humans in the same channel are unmuted and undeafened. The server AFK channel is excluded. XP uses connection state, not audio, and does not require the bot in the call. Partial minutes reset when eligibility ends. Checks occur every 15 seconds.

Level thresholds are `100 × level²` total XP: 100 for level 1, 400 for level 2, and 900 for level 3. Progress is saved in `data/levels.json`. Back up this folder and keep it during updates. Do not run multiple processes against the same data file. Departed members remain in the historical leaderboard.

## Privacy and limitations

Listening starts automatically with a text-channel notice. `!listen off` disables listening to that person and clears their voice history for the current bot session. That opt-out survives leaving and rejoining the same session, but resets when a new bot call session starts. `!pause` pauses the entire call's listening.

Audio is processed locally even when it does not contain the activation phrase. Clips stay in memory. Short conversation histories stay in memory and clear on restart. XP storage contains IDs, totals, cooldown timestamps, and duplicate-detection hashes, not message bodies or recordings. Discord still carries call audio and posted messages. Online song queries go to YouTube and its media servers.

The bot processes one voice request at a time and does not listen while answering. Clips are limited to 15 seconds. The activation keyword alone is silent. Online extraction and Discord voice receive behavior can change; live streams and sign-in/restricted sources are unsupported. Local Piper can sound synthetic.

Keep Ollama and the speech service bound to localhost. Never commit `.env`, runtime data, recordings, or downloaded models.

## Development

```sh
npm ci
npm test
npm run check
python -m unittest discover -s test -p "test_*.py"
```

Python HTTP tests use fake models and do not require model downloads. Tests cover routing, local transport, cancellation, audio formatting, music queue behavior, and XP persistence. They do not verify live Discord compatibility, music availability, or voice quality on every machine.

The showcase copy uses a generic gaming-companion personality. Edit the system prompt in `src/index.js` to customize it.

## Troubleshooting

- **Silent bot:** use `!voice`, check microphone/deafened state, use `!resume`, and wait for the previous response to finish.
- **Missing voice configuration:** run UPDATE-VOICE.cmd successfully before restarting.
- **Ollama model missing:** run `ollama pull qwen3:4b-instruct`, or pull the exact configured model.
- **Missing dependencies:** rerun setup and resolve its first error before starting.
- **Music search fails:** run UPDATE-MUSIC.cmd and use a specific song title and artist.
- **FFmpeg not found:** reopen your terminal after changing PATH, then check `ffmpeg -version`.

## Publishing this project

The archive contains source, tests, manifests, setup scripts, and blank configuration examples. It excludes personal credentials, IDs, saved XP, music, model weights, installed dependencies, and Git history. `.gitignore` excludes runtime files from future Git commits.

Extract the ZIP and publish the contents of this folder so README.md and package.json appear at the repository root. Include `.env.example`, `.gitignore`, and `.gitattributes`. Do not upload your configured working installation over this clean copy. Browser uploads do not apply Git ignore rules automatically.

See [THIRD_PARTY.md](THIRD_PARTY.md) for upstream references. No source-code license grant is selected for this showcase copy; add a license if you want to grant reuse rights. Dependencies and model weights retain their own terms.
