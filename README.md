# Discord Voice AI Bot

A self-hosted Discord bot that chats, speaks in voice calls, plays music, and tracks community activity through XP and levels.

Powered by **Ollama, Faster-Whisper, and Piper**, with AI processing running locally on your computer.

## Features

### AI Chat and Voice
- Chat with the bot through text commands.
- Ask questions in voice calls and receive spoken responses.
- Activate spoken requests with “Playboy.”
- Customize the bot’s personality through its system prompt.
- Automatically remove emojis and formatting from spoken replies.
- Pause listening or opt out individually.

### Music
- Search online by song name and artist.
- Play supported files from a local music folder.
- Queue songs, skip tracks, and adjust volume.
- Automatically select another song when the queue ends.
- Pause music while the bot answers aloud.
- Stream online audio without saving song files.

### XP and Levels
- Earn XP by chatting and spending time in eligible voice calls.
- View your level and progress.
- Check other members’ ranks.
- Display the server’s top-ten leaderboard.
- Preserve progress across bot restarts.
- Limit message farming with cooldowns and duplicate filtering.

## Technology

| Component | Technology |
|---|---|
| Discord integration | Node.js, discord.js, @discordjs/voice |
| AI conversations | Ollama |
| Speech recognition | Faster-Whisper |
| Speech generation | Piper |
| Online music search | yt-dlp |
| Audio processing | FFmpeg |
| Local speech service | Python |
| XP storage | Local JSON file |

## How It Works

1. The bot receives audio from its Discord voice channel.
2. Faster-Whisper transcribes the audio locally.
3. The bot checks for its activation phrase and music commands.
4. Music requests go to the player; conversation requests go to Ollama.
5. Piper generates a spoken answer, which plays in the call.

No hosted AI API key is required. A Discord bot token is required, and Discord and online music still use an internet connection.

## Requirements

The included setup scripts target Windows.

- Node.js 24.17 or newer
- Python 3.11, 64-bit
- FFmpeg available on PATH
- Ollama installed and running
- A Discord bot application and server
- Available disk space for downloaded models

The default models are:

| Purpose | Model |
|---|---|
| Chat | `qwen3:4b-instruct` |
| Transcription | `base.en` |
| Voice | `en_US-ryan-high` |

Performance depends on your hardware and selected models.

## Getting Started

1. Download or clone this repository.
2. Install Node.js, Python, FFmpeg, and Ollama.
3. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications).
4. Enable **Message Content Intent**.
5. Invite the bot with permissions to view and send messages, connect to voice channels, and speak.
6. Copy `.env.example` to `.env`.
7. Enter your bot token and server ID:

   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_GUILD_ID=your_server_id
   ```

8. Open Ollama.
9. Run **SETUP-WINDOWS.cmd** and wait for setup to finish.
10. Run **START-WINDOWS.cmd**.

Keep `.env` private. Never upload your bot token to GitHub.

## Commands

### Chat

| Command | Description |
|---|---|
| `!help` | Show available commands |
| `!ask question` | Chat with the AI |
| `!forget` | Clear your text history in the current channel |

### Voice

| Command | Description |
|---|---|
| `!join` | Join your voice channel |
| `!leave` | Disconnect from the call |
| `!voice` | Show listening and activation status |
| `!listen off` | Stop listening to you |
| `!listen on` | Re-enable listening to you |
| `!pause` | Pause listening for the call |
| `!resume` | Resume listening |

### Music

| Command | Description |
|---|---|
| `!play song name by artist` | Play or queue a song |
| `!tracks` | List local music files |
| `!queue` | Show the current song and queue |
| `!skip` | Skip the current track |
| `!stop` | Stop playback and clear the queue |
| `!autoplay` | Show autoplay status |
| `!autoplay on` | Enable automatic song selection |
| `!autoplay off` | Disable automatic song selection |
| `!mpause` | Pause music |
| `!mresume` | Resume music |
| `!volume 0-100` | Adjust music volume |

### Levels

| Command | Description |
|---|---|
| `!rank` | Show your level and XP |
| `!rank @user` | Show another member’s progress |
| `!level` or `!xp` | Aliases for `!rank` |
| `!leaderboard` or `!lb` | Show the top ten members |

## Spoken Commands

Start your request with **“Playboy”** and say the request in the same sentence.

Examples:

- “Playboy, tell me a joke.”
- “Playboy, play song name by artist.”
- “Playboy, can you play song name by artist?”
- “Playboy, skip.”
- “Playboy, stop music.”
- “Playboy, autoplay on.”

The activation word alone stays silent.

Spoken play requests search online. Text play requests check local files first. If music is already playing, new requests enter the queue.

## XP Rules

- **Chat:** 15 XP per eligible message, with a 60-second cooldown.
- **Voice:** 10 XP per eligible minute with at least two unmuted, undeafened human members together.
- Bot messages, commands, short messages, and repeated rewarded messages do not earn chat XP.
- The server AFK channel does not earn voice XP.
- Level thresholds follow `100 × level²` total XP.

Progress is saved in `data/levels.json`. Keep this folder when updating the bot.

## Privacy

AI processing runs locally. Audio clips and conversation histories are held in memory rather than saved as recordings.

Listening begins automatically when the bot joins, with a notice in text chat. Members can use `!listen off` to opt out for the current bot session.

Discord still handles call audio and posted messages. Online music searches contact external music services.

## Development

Run the automated checks:

```sh
npm ci
npm test
npm run check
python -m unittest discover -s test -p "test_*.py"
```

Tests cover command routing, audio handling, local service requests, music behavior, and XP persistence. Live Discord playback and model performance require testing on your own machine.

## Limitations

- The bot handles one voice request at a time.
- It does not listen while generating or speaking a response.
- Online music availability depends on the source and may change.
- Spotify playback and direct music URLs are not supported.
- Local speech synthesis may still sound synthetic.
- The included launchers are designed for Windows.

## Third-Party Components

This repository does not include model weights or music files. Dependencies and downloaded models retain their own licenses and terms.

See [THIRD_PARTY.md](THIRD_PARTY.md) for upstream projects and model references.
