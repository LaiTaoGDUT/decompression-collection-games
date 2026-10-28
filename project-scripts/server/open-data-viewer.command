#!/bin/bash
# 使用已有 SSH 登录凭据，仅转发服务器上的只读数据页面。
set -euo pipefail

project_root=$(cd "$(dirname "$0")/../.." && pwd)
viewer_url=http://127.0.0.1:3100/
ssh_target=ubuntu@139.199.210.76
ssh_key=${ANTCOSMOS_SSH_KEY:-"$HOME/Downloads/antcosmos_mac.pem"}
state_dir="$project_root/local/server/tunnel"
control_dir="/tmp/antcosmos-viewer-$(id -u)"
expected_fingerprint=SHA256:OOKcoxy1YnmUuhsQWfOYLFQz/zFXLms5rCVUwe7uZhE
mode=${1:-}

case "$mode" in
    ''|--no-open|--stop) ;;
    *) printf '用法：%s [--no-open|--stop]\n' "$0" >&2; exit 2 ;;
esac

# 路径保持足够短，避免 macOS 的 Unix 套接字路径长度限制。
if [[ -e $control_dir && (! -d $control_dir || ! -O $control_dir || -L $control_dir) ]]; then
    printf '本地连接目录不安全，请检查：%s\n' "$control_dir" >&2
    exit 1
fi
mkdir -p "$control_dir"
chmod 700 "$control_dir"

if [[ $mode == --stop ]]; then
    if ssh -S "$control_dir/control" -O check "$ssh_target" >/dev/null 2>&1; then
        ssh -S "$control_dir/control" -O exit "$ssh_target"
        printf '已停止本脚本建立的看板连接。\n'
    else
        printf '本脚本的看板连接当前未运行。\n'
    fi
    exit 0
fi

healthy() {
    curl --fail --silent --show-error --connect-timeout 2 --max-time 5 "${viewer_url}health" 2>/dev/null |
        node -e 'let body="";process.stdin.on("data",s=>body+=s);process.stdin.on("end",()=>{try{const v=JSON.parse(body);process.exit(v.ok===true&&v.service==="decompression-data"&&v.readOnly===true?0:1)}catch{process.exit(1)}})'
}

if ! command -v node >/dev/null; then
    printf '需要项目使用的 Node.js，安装后重新双击。\n' >&2
    exit 1
fi

if ! healthy; then
    if lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; then
        printf '本机 3100 端口已被占用，但看板没有响应。请检查当前连接；脚本不会结束其他进程。\n' >&2
        exit 1
    fi
    if [[ ! -r $ssh_key ]]; then
        printf '找不到已绑定的 SSH 私钥：%s\n可用 ANTCOSMOS_SSH_KEY 指定私钥路径。不要复制私钥内容到聊天或仓库。\n' "$ssh_key" >&2
        exit 1
    fi
    mkdir -p "$state_dir"
    chmod 700 "$state_dir"
    scan=$(mktemp "$state_dir/host-key.XXXXXX")
    trap 'rm -f "$scan"' EXIT
    ssh-keyscan -T 5 -t ed25519 139.199.210.76 > "$scan" 2>/dev/null
    fingerprint=$(ssh-keygen -lf "$scan" | awk 'NR==1 {print $2}')
    if [[ $fingerprint != "$expected_fingerprint" ]]; then
        printf '服务器 SSH 主机指纹与先前核验的记录不符，已停止连接。\n' >&2
        exit 1
    fi
    chmod 600 "$scan"
    mv "$scan" "$state_dir/known_hosts"
    if [[ -S $control_dir/control ]] && ! ssh -S "$control_dir/control" -O check "$ssh_target" >/dev/null 2>&1; then
        rm -f "$control_dir/control"
    fi
    ssh -fNT -M -S "$control_dir/control" -i "$ssh_key" \
        -o BatchMode=yes -o IdentitiesOnly=yes \
        -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$state_dir/known_hosts" \
        -o HostKeyAlgorithms=ssh-ed25519 -o ConnectTimeout=8 \
        -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
        -L 127.0.0.1:3100:127.0.0.1:3100 "$ssh_target"
    if ! healthy; then
        printf 'SSH 已连接，但看板服务未响应。请检查服务器 decompression-data 服务。\n' >&2
        exit 1
    fi
fi

printf '看板连接正常：%s\n' "$viewer_url"
printf '连接仅监听本机。电脑重启或网络断开后，再双击此脚本即可重连。\n'
if [[ -z $mode ]]; then
    open "$viewer_url"
fi
