#!/usr/bin/env python3
"""Delegate image generation to the codex-qq account's built-in tool."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prompt-file', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--reference', action='append', default=[], type=Path)
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    prompt = args.prompt_file.expanduser().read_text(encoding='utf-8').strip()
    if not prompt:
        parser.error('提示词不能为空')
    output = args.output.expanduser().absolute()
    if output.suffix.lower() != '.png':
        parser.error('输出文件必须使用 .png 后缀')
    if output.exists():
        parser.error('输出已存在；请选择新的文件名，以免覆盖原图')
    refs = [p.expanduser().resolve(strict=True) for p in args.reference]
    codex = shutil.which('codex')
    account = Path.home() / '.codex-qq'
    if not codex or not account.is_dir():
        parser.error('需要已安装 codex 和已配置的 ~/.codex-qq 账户')
    output.parent.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='.codex-qq-imagegen-', dir=str(output.parent)))
    inputs = []
    for i, ref in enumerate(refs, 1):
        dest = run / ('reference-%d%s' % (i, ref.suffix))
        shutil.copyfile(ref, dest)
        inputs.append(str(dest))
    result = run / 'result.png'
    schema = run / 'schema.json'
    schema.write_text(json.dumps({'type': 'object', 'properties': {
        'status': {'type': 'string', 'enum': ['success', 'failed']},
        'message': {'type': 'string'}}, 'required': ['status', 'message'],
        'additionalProperties': False}), encoding='utf-8')
    request = '''你是生图执行器。仅使用本次会话内置 image_gen/image_gen__imagegen 工具完成用户的图片需求。
不要改用 OpenAI Images API、image_gen.py、网页截图、SVG、绘图代码或其他生图服务。
如果工具不可用或失败，明确报告 failed；不要重试产生额外图片。不要读登录配置、密钥或无关项目。
生成一张图片。参考图有提供时先用 view_image 查看，并按用户要求区分编辑目标和风格参考；调用参数以当前工具定义为准。
透明背景要求必须交给生图工具处理，不得以棋盘格代替透明。保留用户的文字、尺寸、比例及不变项要求。
生成后将实际图片无损保存/复制为 PNG 到指定 result 路径；如原图不是 PNG，可做纯格式转换，不改视觉内容。
不得只输出 Markdown 图片链接而不保存文件。仅在真实文件已保存时报告 success，否则报告 failed 和原因。
'''
    request += '\n参考图片：' + json.dumps(inputs, ensure_ascii=False)
    request += '\n结果路径：' + str(result) + '\n用户需求：\n' + prompt
    command = [codex, 'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox',
               'workspace-write', '--enable', 'image_generation', '-C', str(run),
               '--json', '--output-schema', str(schema), '-o', str(run / 'response.json'), '-']
    if args.dry_run:
        print(json.dumps({'command': command, 'account': str(account), 'run_dir': str(run)}, ensure_ascii=False))
        return 0
    env = os.environ.copy()
    env['CODEX_HOME'] = str(account)
    print('生图运行目录：' + str(run), file=sys.stderr, flush=True)
    try:
        with (run / 'events.jsonl').open('w') as events, (run / 'stderr.log').open('w') as errors:
            completed = subprocess.run(command, input=request, text=True, env=env,
                                       stdout=events, stderr=errors, timeout=args.timeout)
        if completed.returncode:
            raise RuntimeError('Codex 返回非零退出码 %d' % completed.returncode)
        response = json.loads((run / 'response.json').read_text(encoding='utf-8'))
        if response.get('status') != 'success':
            raise RuntimeError(response.get('message', '生图失败'))
        with result.open('rb') as f:
            if f.read(8) != b'\x89PNG\r\n\x1a\n':
                raise RuntimeError('未收到有效 PNG 文件')
        # Exclusive creation prevents overwriting an output created during generation.
        with output.open('xb') as target, result.open('rb') as source:
            shutil.copyfileobj(source, target)
        print(json.dumps({'status': 'success', 'output': str(output),
                          'run_dir': str(run), 'message': response['message']}, ensure_ascii=False))
        return 0
    except (subprocess.TimeoutExpired, OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({'status': 'failed', 'error': str(exc), 'run_dir': str(run),
                          'note': '请检查已有日志和图片，勿直接重复调用以免重复消耗额度'}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
