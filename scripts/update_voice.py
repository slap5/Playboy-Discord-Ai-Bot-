"""Download and validate the male voice before changing the user's setting."""
from pathlib import Path
import subprocess
import sys
import wave
from dotenv import set_key
from piper import PiperVoice

ROOT = Path(__file__).resolve().parents[1]
VOICE = 'en_US-ryan-high'

def main():
    env = ROOT / '.env'
    if not env.is_file():
        raise SystemExit('Missing .env. Complete initial setup first.')
    models = ROOT / 'models'
    models.mkdir(exist_ok=True)
    print('Downloading Ryan high male voice. This may take several minutes.', flush=True)
    subprocess.run([sys.executable, '-m', 'piper.download_voices', VOICE], cwd=models, check=True)
    voice = PiperVoice.load(str(models / f'{VOICE}.onnx'))
    preview = ROOT / 'voice-preview.wav'
    with wave.open(str(preview), 'wb') as wav:
        voice.synthesize_wav('Hey, welcome back. Tell me what you want to play, and we will get the music going.', wav)
    with wave.open(str(preview), 'rb') as wav:
        if wav.getnframes() == 0:
            raise RuntimeError('The voice produced no audio; your setting has not changed.')
    result = set_key(str(env), 'PIPER_VOICE', VOICE, quote_mode='never')
    if not result[0]:
        raise RuntimeError('Could not update .env. Set PIPER_VOICE=en_US-ryan-high manually.')
    print('Voice updated. Listen to voice-preview.wav, then run START-WINDOWS.cmd.', flush=True)

if __name__ == '__main__':
    main()
