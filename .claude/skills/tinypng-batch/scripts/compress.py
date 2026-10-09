#!/usr/bin/env python3
"""Batch Tinify compression with a key pool and content-addressed cache."""
import argparse
import base64
from contextlib import contextmanager
import fnmatch
import hashlib
import http.client
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.avif'}
SKIP_DIRS = {'node_modules', 'library', 'temp', 'tmp', 'build', '__pycache__'}
API = 'https://api.tinify.com/shrink'


class Failure(Exception):
    pass


class PoolEmpty(Failure):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
    fd, temporary = tempfile.mkstemp(prefix='.tinify-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def image_type(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data[4:8] == b'ftyp' and b'avif' in data[8:32]:
        return 'image/avif'
    raise Failure('Unsupported or invalid image signature')


def load_keys(filename=None):
    try:
        if filename:
            value = json.loads(Path(filename).expanduser().read_text())
        elif os.environ.get('TINIFY_API_KEYS'):
            value = json.loads(os.environ['TINIFY_API_KEYS'])
        else:
            project_keys = Path(__file__).resolve().parents[4] / 'local/tinypng-batch/keys.json'
            value = json.loads(project_keys.read_text())
        if isinstance(value, dict):
            value = value.get('api_keys')
        if not isinstance(value, list) or not value:
            raise ValueError()
        if any(not isinstance(key, str) or not key.strip() or ':' in key
               or any(ch.isspace() for ch in key.strip()) for key in value):
            raise ValueError()
        keys = list(dict.fromkeys(key.strip() for key in value))
        if any(key.startswith('YOUR_') for key in keys):
            raise ValueError()
        return keys
    except (OSError, ValueError, TypeError):
        raise Failure('Configure api_keys in local/tinypng-batch/keys.json, '
                      '--keys-file, or TINIFY_API_KEYS (JSON array); values are never logged') from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Transport:
    def __init__(self, timeout=60):
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect)

    def __call__(self, method, url, key, data=None):
        # Never send credentials to an arbitrary download/redirect host.
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or parsed.netloc != 'api.tinify.com':
            raise Failure('Unexpected API response URL')
        auth = base64.b64encode(('api:' + key).encode()).decode()
        request = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': 'Basic ' + auth, 'Content-Type': 'application/octet-stream',
            'User-Agent': 'tinypng-batch/1.0',
        })
        try:
            response = self.opener.open(request, timeout=self.timeout)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, urllib.error.URLError, http.client.HTTPException):
            # Do not expose request details or retry ambiguous uploads.
            raise Failure('Network request failed; upload may already have consumed quota') from None
        try:
            with response:
                return response.code, {k.lower(): v for k, v in response.headers.items()}, response.read()
        except (OSError, http.client.HTTPException):
            raise Failure('Incomplete response; upload may already have consumed quota') from None


def monthly_exhausted(status, body):
    if status != 429:
        return False
    try:
        message = json.loads(body).get('message', '').lower()
    except (ValueError, AttributeError):
        return False
    return 'monthly' in message and ('limit' in message or 'quota' in message)


class KeyPool:
    def __init__(self, keys, limit=500, strategy='ordered', transport=None, sleep=time.sleep):
        self.keys = keys
        self.limit = limit
        self.strategy = strategy
        self.transport = transport or Transport()
        self.sleep = sleep
        self.index = 0
        self.disabled = set()
        self.counts = {}

    def request(self, index, method, url, data=None):
        for attempt in range(3):
            try:
                result = self.transport(method, url, self.keys[index], data)
            except Failure:
                if method != 'GET' or attempt == 2:
                    raise
                self.sleep(2 ** attempt)
                continue
            status, headers, body = result
            count = headers.get('compression-count')
            if count is not None:
                try:
                    self.counts[index] = int(count)
                except ValueError:
                    raise Failure('Invalid compression count from API') from None
            retry = status >= 500 or (status == 429 and not monthly_exhausted(status, body))
            if not retry or attempt == 2:
                return result
            try:
                delay = float(headers.get('retry-after', 2 ** attempt))
            except ValueError:
                delay = 2 ** attempt
            if delay > 30:
                raise Failure('API requested a long cooldown; retry this batch later')
            self.sleep(max(1, delay))

    def select(self):
        for _ in self.keys:
            index = self.index
            self.index = (self.index + 1) % len(self.keys)
            if index in self.disabled:
                continue
            if self.limit and index not in self.counts:
                status, _, body = self.request(index, 'POST', API, b'')
                if status == 401 or monthly_exhausted(status, body):
                    self.disabled.add(index)
                    continue
                if status not in (200, 400) or index not in self.counts:
                    raise Failure('Cannot verify monthly usage for key #%d (HTTP %d)' % (index + 1, status))
            if self.limit and self.counts.get(index, 0) >= self.limit:
                self.disabled.add(index)
                continue
            if self.strategy == 'ordered':
                self.index = index
            return index
        raise PoolEmpty('All configured keys are invalid, exhausted, or at the monthly limit')

    def compress(self, data):
        original_type = image_type(data)
        while True:
            index = self.select()
            before = self.counts.get(index, 0)
            status, headers, body = self.request(index, 'POST', API, data)
            if status == 401 or monthly_exhausted(status, body):
                self.disabled.add(index)
                continue
            if status != 201:
                raise Failure('Compression failed for key #%d (HTTP %d)' % (index + 1, status))
            if 'compression-count' not in headers:
                self.counts[index] = before + 1
            location = headers.get('location')
            if not location:
                raise Failure('Missing download URL')
            status, headers, output = self.request(index, 'GET', location)
            if status != 200:
                raise Failure('Download failed (HTTP %d)' % status)
            mime = headers.get('content-type', '').split(';')[0].strip()
            if mime != original_type or image_type(output) != original_type:
                raise Failure('Downloaded image format does not match the original')
            try:
                if int(headers.get('content-length', len(output))) != len(output):
                    raise Failure('Truncated download')
            except ValueError:
                raise Failure('Invalid download length') from None
            return output if len(output) < len(data) else data


class Cache:
    def __init__(self, root):
        self.root = root

    def get(self, source):
        try:
            target = (self.root / 'index' / digest(source)).read_text().strip()
            if len(target) != 64 or any(c not in '0123456789abcdef' for c in target):
                return None
            data = (self.root / 'objects' / target).read_bytes()
            return data if digest(data) == target else None
        except OSError:
            return None

    def put(self, source, output):
        target = digest(output)
        atomic_write(self.root / 'objects' / target, output)
        atomic_write(self.root / 'index' / digest(source), target.encode())
        atomic_write(self.root / 'index' / target, target.encode())

    @contextmanager
    def lock(self):
        import fcntl
        self.root.mkdir(parents=True, exist_ok=True)
        with (self.root / '.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Failure('Another compression batch is using this cache') from None
            yield


def collect(inputs, excludes, excluded_trees=()):
    paths = []
    roots = []
    for name in inputs:
        raw = Path(name).expanduser().absolute()
        if raw.is_symlink() or any(parent.is_symlink() for parent in raw.parents):
            raise Failure('Input paths must not traverse symbolic links: ' + str(raw))
        path = raw.resolve()
        if not path.exists():
            raise Failure('Input does not exist: ' + str(path))
        roots.append(path if path.is_dir() else path.parent)
        if path.is_file():
            paths.append(path)
        else:
            for directory, dirs, names in os.walk(path):
                dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in SKIP_DIRS
                                 and not (Path(directory) / d).is_symlink()
                                 and (Path(directory) / d) not in excluded_trees)
                paths.extend(Path(directory) / n for n in sorted(names) if not n.startswith('.'))
    root = Path(os.path.commonpath(roots))
    files = sorted({p for p in paths if p.is_file() and not p.is_symlink()
                    and p.suffix.lower() in EXTENSIONS
                    and not any(fnmatch.fnmatch(p.relative_to(root).as_posix(), pattern)
                                or p.relative_to(root).match(pattern) for pattern in excludes)})
    return root, files, roots


def run(args):
    output = Path(args.output or 'tinypng-output').expanduser().resolve()
    cache_root = Path(args.cache_dir).expanduser().resolve()
    excluded = (cache_root,) if args.in_place else (output, cache_root)
    root, files, roots = collect(args.inputs, args.exclude, excluded)
    if not args.in_place:
        directories = [Path(p).expanduser().resolve() for p in args.inputs if Path(p).expanduser().is_dir()]
        if any(output == r or output in r.parents for r in directories):
            raise Failure('Output cannot contain an input directory; choose a separate directory or --in-place')
        if any(output / p.relative_to(root) in files for p in files):
            raise Failure('Output would overwrite an input; use --in-place explicitly')
    if args.dry_run:
        for path in files:
            print(path)
        print('Selected %d image(s); no uploads or writes' % len(files))
        return 0
    if not files:
        print('No matching images')
        return 0
    cache = Cache(cache_root)
    pool = None
    stats = {'processed': 0, 'cached': 0, 'failed': 0, 'saved_bytes': 0, 'pending': 0}
    with cache.lock():
        for position, path in enumerate(files):
            try:
                source = path.read_bytes()
                image_type(source)
                result = cache.get(source)
                cached = result is not None
                if result is None:
                    if pool is None:
                        try:
                            keys = load_keys(args.keys_file)
                        except Failure as error:
                            raise PoolEmpty(str(error)) from None
                        pool = KeyPool(keys, args.monthly_limit, args.strategy)
                    result = pool.compress(source)
                    cache.put(source, result)
                target = path if args.in_place else output / path.relative_to(root)
                if target.is_symlink() or any(p.is_symlink() for p in target.parents):
                    raise Failure('Refusing to write through a symbolic link')
                if args.in_place and path.read_bytes() != source:
                    raise Failure('Source changed during compression; original left untouched')
                if not args.in_place or result != source:
                    atomic_write(target, result)
                stats['processed'] += 1
                stats['cached'] += int(cached)
                stats['saved_bytes'] += len(source) - len(result)
                print('%s %s: %d -> %d bytes' % ('CACHE' if cached else 'OK', path, len(source), len(result)))
            except PoolEmpty as error:
                stats['failed'] += 1
                stats['pending'] = len(files) - position - 1
                print('STOP: ' + str(error), file=sys.stderr)
                break
            except (Failure, OSError) as error:
                stats['failed'] += 1
                # OS errors only describe file operations; transport errors are sanitized above.
                print('FAIL %s: %s' % (path, error), file=sys.stderr)
        print(json.dumps(stats, ensure_ascii=False))
    return 1 if stats['failed'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs='+', help='Files or directories (recursive)')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--output', help='Separate output directory; default: ./tinypng-output')
    mode.add_argument('--in-place', action='store_true', help='Atomically replace source images')
    parser.add_argument('--keys-file', help='Local JSON file containing api_keys array')
    parser.add_argument('--strategy', choices=['ordered', 'round-robin'], default='ordered')
    parser.add_argument('--monthly-limit', type=int, default=500, help='Per-key monthly cap; 0 disables cap')
    parser.add_argument('--cache-dir', default=str(Path(os.environ.get('XDG_CACHE_HOME', '~/.cache')) / 'tinypng-batch'))
    parser.add_argument('--exclude', action='append', default=[], help='Exclude relative glob (repeatable)')
    parser.add_argument('--dry-run', action='store_true', help='List inputs without keys, upload, or writes')
    args = parser.parse_args()
    if args.monthly_limit < 0:
        parser.error('--monthly-limit must be nonnegative')
    try:
        return run(args)
    except (Failure, OSError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Interrupted; completed results remain cached', file=sys.stderr)
        return 130


if __name__ == '__main__':
    sys.exit(main())
