"""Download the selected speech models once; runtime uses local files only."""
import os
from pathlib import Path
import subprocess
import sys
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
models = ROOT / 'models'
models.mkdir(exist_ok=True)
voice = os.getenv('PIPER_VOICE', 'en_US-ryan-high')
print(f'Downloading Piper voice: {voice}', flush=True)
subprocess.run([sys.executable, '-m', 'piper.download_voices', voice], cwd=models, check=True)
from faster_whisper import WhisperModel
name = os.getenv('WHISPER_MODEL', 'base.en')
print(f'Downloading Whisper model: {name}', flush=True)
WhisperModel(name, device='cpu', compute_type='int8', download_root=str(models / 'whisper'))
print('Speech models downloaded. Ready for local inference.', flush=True)
