#!/usr/bin/env python3
import argparse
from pathlib import Path
from pprint import pprint

from model_loader import load_encrypted_checkpoint


def summarize_checkpoint(checkpoint):
    print('加载结果类型:', type(checkpoint).__name__)

    if isinstance(checkpoint, dict):
        print('checkpoint 顶层字段:')
        print(list(checkpoint.keys()))

        if 'state_dict' in checkpoint and isinstance(checkpoint['state_dict'], dict):
            state_dict = checkpoint['state_dict']
            print('\nstate_dict 参数数量:', len(state_dict))
            print('前 10 个参数名:')
            for name in list(state_dict.keys())[:10]:
                value = state_dict[name]
                shape = tuple(value.shape) if hasattr(value, 'shape') else type(value).__name__
                print(f'  - {name}: {shape}')

        extra_keys = [key for key in checkpoint.keys() if key != 'state_dict']
        if extra_keys:
            print('\n除 state_dict 外的其他字段:')
            for key in extra_keys:
                value = checkpoint[key]
                if isinstance(value, (str, int, float, bool, type(None), dict, list, tuple)):
                    print(f'  - {key}:')
                    pprint(value, sort_dicts=False)
                else:
                    print(f'  - {key}: <{type(value).__name__}>')
    else:
        print('该交付文件解密后不是 dict，请根据实际对象类型自行处理。')
        pprint(checkpoint)


def main():
    parser = argparse.ArgumentParser(description='客户侧算法交付加载演示')
    parser.add_argument('--model', default='delivery.model', help='交付的加密模型文件路径')
    parser.add_argument('--license', dest='license_path', default='license.txt', help='配套的 license 文件路径')
    args = parser.parse_args()

    model_path = Path(args.model)
    license_path = Path(args.license_path)

    if not model_path.exists():
        raise FileNotFoundError(f'找不到模型文件: {model_path}')
    if not license_path.exists():
        raise FileNotFoundError(f'找不到 license 文件: {license_path}')

    print('开始加载交付文件...')
    print('model :', model_path.resolve())
    print('license:', license_path.resolve())
    print()

    checkpoint = load_encrypted_checkpoint(
        model_path=str(model_path),
        license_path=str(license_path),
    )

    print('加载成功。\n')
    summarize_checkpoint(checkpoint)


if __name__ == '__main__':
    main()
