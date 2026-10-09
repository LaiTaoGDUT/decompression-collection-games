"""Offline regression tests; never contacts Tinify or reads real credentials."""
import argparse
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import compress as c

PNG = b'\x89PNG\r\n\x1a\n'
SOURCE = PNG + b'x' * 120
SMALL = PNG + b'y' * 30
URL = 'https://api.tinify.com/output/test'


def downloaded(data=SMALL):
    return 200, {'content-type': 'image/png', 'content-length': str(len(data))}, data


class CompressionTests(unittest.TestCase):
    def test_monthly_cap_and_invalid_key_switch(self):
        calls = []

        def transport(method, url, key, data=None):
            calls.append((method, key, data))
            if key == 'invalid':
                return 401, {}, b'{}'
            if data == b'':
                return 400, {'compression-count': '500' if key == 'full' else '499'}, b'{}'
            if method == 'POST':
                return 201, {'location': URL, 'compression-count': '500'}, b'{}'
            return downloaded()

        pool = c.KeyPool(['invalid', 'full', 'usable'], transport=transport)
        self.assertEqual(pool.compress(SOURCE), SMALL)
        with self.assertRaises(c.PoolEmpty):
            pool.compress(SOURCE)
        self.assertEqual([key for method, key, data in calls if data == SOURCE], ['usable'])

    def test_monthly_429_switches_but_temporary_429_retries_same_key(self):
        keys = []
        replies = iter([
            (429, {}, b'{"message":"Your monthly limit has been exceeded"}'),
            (429, {'retry-after': '1'}, b'{"message":"Rate limit exceeded"}'),
            (201, {'location': URL}, b'{}'), downloaded(),
        ])

        def transport(method, url, key, data=None):
            keys.append(key)
            return next(replies)

        waits = []
        pool = c.KeyPool(['a', 'b'], limit=0, transport=transport, sleep=waits.append)
        self.assertEqual(pool.compress(SOURCE), SMALL)
        self.assertEqual(keys, ['a', 'b', 'b', 'b'])
        self.assertEqual(waits, [1])

    def test_round_robin(self):
        uploads = []

        def transport(method, url, key, data=None):
            if method == 'POST':
                uploads.append(key)
                return 201, {'location': URL}, b'{}'
            return downloaded()

        pool = c.KeyPool(['a', 'b'], limit=0, strategy='round-robin', transport=transport)
        for _ in range(3):
            pool.compress(SOURCE)
        self.assertEqual(uploads, ['a', 'b', 'a'])

    def test_upload_timeout_not_retried(self):
        calls = []

        def transport(*args):
            calls.append(args)
            raise c.Failure('Network request failed')

        with self.assertRaises(c.Failure):
            c.KeyPool(['a', 'b'], limit=0, transport=transport).compress(SOURCE)
        self.assertEqual(len(calls), 1)

    def test_corrupt_download_rejected_and_larger_result_not_used(self):
        for result, succeeds in [(downloaded(b'not an image'), False), (downloaded(SOURCE + b'longer'), True)]:
            replies = iter([(201, {'location': URL}, b'{}'), result])
            pool = c.KeyPool(['a'], limit=0, transport=lambda *args: next(replies))
            if succeeds:
                self.assertEqual(pool.compress(SOURCE), SOURCE)
            else:
                with self.assertRaises(c.Failure):
                    pool.compress(SOURCE)

    def test_credentials_never_sent_to_download_host(self):
        with self.assertRaises(c.Failure):
            c.Transport()('GET', 'https://example.com/output', 'secret')

    def test_config_deduplication_and_redacted_error(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'keys.json'
            config.write_text(json.dumps({'api_keys': ['a', 'b', 'a']}))
            self.assertEqual(c.load_keys(config), ['a', 'b'])
            config.write_text('{"api_keys": ["secret-value", broken]}')
            with self.assertRaises(c.Failure) as caught:
                c.load_keys(config)
            self.assertNotIn('secret-value', str(caught.exception))

    def test_in_place_cache_and_failure_preserve_original_and_meta(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            images = root / 'images'
            images.mkdir()
            path = images / 'a.png'
            path.write_bytes(SOURCE)
            path.chmod(0o644)
            meta = images / 'a.png.meta'
            meta.write_bytes(b'uuid-stays-the-same')
            args = argparse.Namespace(inputs=[str(images)], exclude=[], output=None,
                                      cache_dir=str(root / 'cache'), in_place=True,
                                      dry_run=False, keys_file=None, monthly_limit=500, strategy='ordered')
            with patch.object(c, 'load_keys', return_value=['fake']), patch.object(c.KeyPool, 'compress', return_value=SMALL) as mock:
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(c.run(args), 0)
                    self.assertEqual(c.run(args), 0)
                self.assertEqual(mock.call_count, 1)
            self.assertEqual(path.read_bytes(), SMALL)
            self.assertEqual(path.stat().st_mode & 0o777, 0o644)
            self.assertEqual(meta.read_bytes(), b'uuid-stays-the-same')
            path.write_bytes(PNG + b'new input')
            with patch.object(c, 'load_keys', return_value=['fake']), patch.object(c.KeyPool, 'compress', side_effect=c.Failure('download failed')):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(c.run(args), 1)
            self.assertEqual(path.read_bytes(), PNG + b'new input')

    def test_discovery_excludes_generated_output_symlinks_and_meta(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / 'a.png').write_bytes(SOURCE)
            (root / 'a.png.meta').write_text('{}')
            (root / 'link.png').symlink_to(root / 'a.png')
            output = root / 'output'
            output.mkdir()
            (output / 'a.png').write_bytes(SMALL)
            (root / 'library').mkdir()
            (root / 'library' / 'a.png').write_bytes(SMALL)
            _, files, _ = c.collect([str(root)], [], (output,))
            self.assertEqual(files, [root / 'a.png'])

    def test_cache_corruption_is_a_miss_and_output_is_cached(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = c.Cache(Path(folder))
            cache.put(SOURCE, SMALL)
            self.assertEqual(cache.get(SOURCE), SMALL)
            self.assertEqual(cache.get(SMALL), SMALL)
            (cache.root / 'objects' / c.digest(SMALL)).write_bytes(b'broken')
            self.assertIsNone(cache.get(SOURCE))


if __name__ == '__main__':
    unittest.main()
