#!/bin/bash
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Run with sudo.' >&2; exit 1; fi
printf '输入当前小游戏的 AppSecret（不回显，不写入命令历史）：' >/dev/tty
IFS= read -r -s CLOUD_SAVE_SECRET_INPUT </dev/tty
printf '\n' >/dev/tty
if [[ ! $CLOUD_SAVE_SECRET_INPUT =~ ^[a-fA-F0-9]{32}$ ]]; then echo 'AppSecret 应为 32 位十六进制字符串，未修改配置。' >&2; exit 1; fi
export CLOUD_SAVE_SECRET_INPUT
python3 <<'PY'
import os
from pathlib import Path
p=Path('/opt/decompression-api/.env')
lines=[line for line in p.read_text().splitlines() if not line.startswith('WX_APP_SECRET=')]
lines.append('WX_APP_SECRET='+os.environ['CLOUD_SAVE_SECRET_INPUT'])
p.write_text('\n'.join(lines)+'\n')
p.chmod(0o600)
PY
unset CLOUD_SAVE_SECRET_INPUT
systemctl restart decompression-api
for attempt in {1..15}; do
    if curl --fail --silent http://127.0.0.1:3000/ready; then echo; exit 0; fi
    sleep 1
done
echo '配置已保存，但就绪检查失败，请查看服务日志。' >&2
exit 1
