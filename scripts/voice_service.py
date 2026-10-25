"""Loopback-only speech worker. Models remain loaded; recordings stay in RAM."""
import hmac
import io
import json
import os
from pathlib import Path
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 4 * 1024 * 1024


def load_models():
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
    from faster_whisper import WhisperModel
    from piper import PiperVoice
    model = os.getenv('WHISPER_MODEL', 'base.en')
    voice = os.getenv('PIPER_VOICE', 'en_US-ryan-high')
    whisper = WhisperModel(model, device='cpu', compute_type='int8',
                           cpu_threads=int(os.getenv('WHISPER_THREADS', '4')),
                           download_root=str(ROOT / 'models' / 'whisper'),
                           local_files_only=True)
    piper = PiperVoice.load(str(ROOT / 'models' / f'{voice}.onnx'))
    return whisper, piper


def make_handler(whisper, piper, token):
    inference_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log transcripts, audio, or credentials.

        def send(self, status, data, content_type='application/json'):
            try:
                self.send_response(status)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # The caller may opt out while inference completes.

        def error(self, status, message):
            self.send(status, json.dumps({'error': message}).encode())

        def authorized(self):
            return not self.headers.get('Origin') and hmac.compare_digest(
                self.headers.get('X-Local-Token', ''), token)

        def do_GET(self):
            if not self.authorized():
                return self.error(403, 'Unauthorized local request')
            if self.path != '/health':
                return self.error(404, 'Unknown endpoint')
            self.send(200, b'{"ready":true}')

        def do_POST(self):
            if not self.authorized():
                return self.error(403, 'Unauthorized local request')
            if self.path not in ('/audio/transcribe', '/audio/speech'):
                return self.error(404, 'Unknown endpoint')
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= MAX_BODY:
                    return self.error(413, 'Request too large or empty')
                self.connection.settimeout(15)
                body = self.rfile.read(size)
                if len(body) != size:
                    return self.error(400, 'Incomplete request')
            except (ValueError, TimeoutError):
                return self.error(400, 'Invalid request body')
            if not inference_lock.acquire(blocking=False):
                return self.error(503, 'Speech worker busy; wait for the current reply')
            try:
                if self.path == '/audio/transcribe':
                    if self.headers.get('Content-Type') != 'audio/wav':
                        return self.error(415, 'Expected audio/wav')
                    with wave.open(io.BytesIO(body), 'rb') as wav:
                        if wav.getframerate() == 0 or wav.getnframes() / wav.getframerate() > 16:
                            return self.error(400, 'Voice clip exceeds 16 seconds')
                    segments, _ = whisper.transcribe(io.BytesIO(body), beam_size=3,
                                                    initial_prompt='Names: Playboy.',
                                                    vad_filter=True, condition_on_previous_text=False)
                    text = ' '.join(segment.text.strip() for segment in segments).strip()
                    return self.send(200, json.dumps({'text': text}).encode())
                if self.headers.get('Content-Type') != 'application/json':
                    return self.error(415, 'Expected application/json')
                text = json.loads(body).get('text')
                if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                    return self.error(400, 'Speech text must contain 1 to 2000 characters')
                output = io.BytesIO()
                with wave.open(output, 'wb') as wav:
                    piper.synthesize_wav(text, wav)
                self.send(200, output.getvalue(), 'audio/wav')
            except (ValueError, wave.Error, EOFError, AttributeError):
                self.error(400, 'Invalid audio or JSON')
            except Exception as exc:
                print(f'Local speech failed: {type(exc).__name__}', flush=True)
                self.error(500, 'Speech processing failed; check the local service console')
            finally:
                inference_lock.release()

    return Handler


def main():
    token = os.getenv('LOCAL_AUDIO_TOKEN', '')
    if not token:
        raise SystemExit('Start this service through npm start (missing local session token).')
    print('Loading local Whisper and Piper models...', flush=True)
    whisper, piper = load_models()
    port = int(os.getenv('LOCAL_AUDIO_PORT', '8765'))
    server = ThreadingHTTPServer(('127.0.0.1', port), make_handler(whisper, piper, token))
    server.daemon_threads = True
    print(f'Local speech ready on 127.0.0.1:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
