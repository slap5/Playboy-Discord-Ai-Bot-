import importlib.util
import io
import json
from pathlib import Path
import threading
from types import SimpleNamespace
import unittest
import urllib.request
import urllib.error
import wave
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('voice_service', Path(__file__).resolve().parents[1] / 'scripts' / 'voice_service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

class FakeWhisper:
    def transcribe(self, data, **kwargs):
        return iter([SimpleNamespace(text='play my song')]), None

class FakePiper:
    def synthesize_wav(self, text, wav):
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b'\x00\x00' * 2205)

class LocalSpeechTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), service.make_handler(FakeWhisper(), FakePiper(), 'test-token'))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def call(self, route, body=None, kind='application/json', token='test-token'):
        req = urllib.request.Request(self.base + route, data=body, headers={'X-Local-Token':token, 'Content-Type':kind})
        return urllib.request.urlopen(req, timeout=5)

    def test_auth_and_health(self):
        with self.call('/health') as r:
            self.assertTrue(json.load(r)['ready'])
        with self.assertRaises(urllib.error.HTTPError) as err:
            self.call('/health', token='wrong')
        self.assertEqual(err.exception.code, 403)

    def test_speech_wav(self):
        with self.call('/audio/speech', b'{"text":"Hi"}') as r:
            data=r.read()
        with wave.open(io.BytesIO(data)) as wav:
            self.assertEqual(wav.getframerate(),22050)
            self.assertGreater(wav.getnframes(),0)

    def test_transcription_and_invalid_input(self):
        output=io.BytesIO()
        with wave.open(output,'wb') as wav:
            wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(48000);wav.writeframes(b'\x00'*192000)
        with self.call('/audio/transcribe',output.getvalue(),'audio/wav') as r:
            self.assertEqual(json.load(r)['text'],'play my song')
        with self.assertRaises(urllib.error.HTTPError) as err:
            self.call('/audio/speech',b'{"text":""}')
        self.assertEqual(err.exception.code,400)

if __name__ == '__main__':
    unittest.main()
