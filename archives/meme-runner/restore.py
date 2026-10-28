#!/usr/bin/env python3
"""校验或恢复咧咧团快跑归档；共享配置只通过补丁合并，不覆盖整份文件。"""
from __future__ import annotations

import argparse
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ARCHIVE = Path(__file__).resolve().parent


def stream_sha256(source) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: source.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


def sha256(path: Path) -> str:
    with path.open('rb') as source:
        return stream_sha256(source)


def within(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    if not target.is_relative_to(root):
        raise ValueError(f'路径越出目标目录：{relative}')
    return target


def verify(inventory: dict, packages: dict[str, zipfile.ZipFile]) -> None:
    for container in inventory.get('auxiliaryArchives', []):
        relative = container['path']
        path = within(ARCHIVE, relative)
        if path.stat().st_size != container['bytes'] or sha256(path) != container['sha256']:
            raise ValueError(f'辅助压缩包校验失败：{relative}')
        expected = {record['path'] for record in inventory['files'] if record.get('container') == relative}
        members = packages[relative].namelist()
        if len(members) != container['fileCount'] or len(members) != len(expected) or set(members) != expected:
            raise ValueError(f'辅助压缩包文件清单不匹配：{relative}')
    for record in inventory['files']:
        container = record.get('container')
        if container:
            if container not in packages:
                raise ValueError(f'辅助压缩包未登记：{container}')
            package = packages[container]
            size = package.getinfo(record['path']).file_size
            with package.open(record['path']) as source:
                digest = stream_sha256(source)
        else:
            path = within(ARCHIVE, record['path'])
            if not path.is_file():
                raise ValueError(f'归档文件缺失：{record["path"]}')
            size = path.stat().st_size
            digest = sha256(path)
        if size != record['bytes'] or digest != record['sha256']:
            raise ValueError(f'归档文件校验失败：{record["path"]}')
    for relative, expected in inventory.get('supportFiles', {}).items():
        path = within(ARCHIVE, relative)
        if not path.is_file() or sha256(path) != expected:
            raise ValueError(f'恢复资料校验失败：{relative}')
    print(f'归档完整性通过：{len(inventory["files"])} 个文件。')


def apply_patch(root: Path, patch: Path, check: bool) -> None:
    command = ['git', 'apply']
    if check:
        command.append('--check')
    result = subprocess.run(command + [str(patch)], cwd=root, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('共享注册补丁无法合并，请参照 integration/before 手动合并：\n' + result.stderr.strip())


def preflight(root: Path, inventory: dict, patch: Path) -> list[tuple[dict, Path]]:
    pending = []
    conflicts = []
    for record in inventory['files']:
        relative = record['restorePath']
        if relative is None:
            continue
        destination = within(root, relative)
        if destination.exists():
            if destination.is_file() and sha256(destination) == record['sha256']:
                continue
            conflicts.append(relative)
        else:
            parent = destination.parent
            while parent != root:
                if parent.exists() and not parent.is_dir():
                    conflicts.append(relative)
                    break
                parent = parent.parent
            else:
                pending.append((record, destination))
    if conflicts:
        raise ValueError('目标已有不同内容，停止恢复以避免覆盖：\n' + '\n'.join(conflicts[:12]))
    apply_patch(root, patch, check=True)
    print(f'恢复预检通过：待恢复 {len(pending)} 个文件，共享注册补丁可合并。')
    return pending


def restore_file(record: dict, destination: Path, packages: dict[str, zipfile.ZipFile]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    container = record.get('container')
    if not container:
        shutil.copy2(within(ARCHIVE, record['path']), destination)
        return
    with packages[container].open(record['path']) as source, destination.open('wb') as target:
        shutil.copyfileobj(source, target)
    destination.chmod(record['mode'])
    timestamp = record['mtimeNs']
    os.utime(destination, ns=(timestamp, timestamp))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--verify', action='store_true', help='只校验归档文件，不检查或修改工作区')
    mode.add_argument('--check', action='store_true', help='校验文件并检查恢复冲突（默认）')
    mode.add_argument('--restore', action='store_true', help='通过全部预检后复制文件并合并注册补丁')
    parser.add_argument('--root', type=Path, default=ARCHIVE.parents[1], help='目标项目根目录')
    args = parser.parse_args()
    inventory = json.loads((ARCHIVE / 'inventory.json').read_text(encoding='utf-8'))
    with ExitStack() as resources:
        packages = {
            container['path']: resources.enter_context(zipfile.ZipFile(within(ARCHIVE, container['path'])))
            for container in inventory.get('auxiliaryArchives', [])
        }
        verify(inventory, packages)
        if args.verify:
            return
        root = args.root.resolve(strict=True)
        patch = within(ARCHIVE, inventory['registrationPatchPath'])
        pending = preflight(root, inventory, patch)
        if not args.restore:
            print('工作区未修改。恢复命令：python3 archives/meme-runner/restore.py --restore')
            return
        for record, destination in pending:
            restore_file(record, destination, packages)
        apply_patch(root, patch, check=False)
    print('恢复完成。请通过 cocos_creator_stdio MCP 刷新资源，再运行 TypeScript 和 Bundle 检查。')
    print('游戏沿用归档前的 development 可见性，正式上架前仍需完成发布验收。')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as error:
        print(f'恢复未执行完成：{error}', file=sys.stderr)
        sys.exit(1)
