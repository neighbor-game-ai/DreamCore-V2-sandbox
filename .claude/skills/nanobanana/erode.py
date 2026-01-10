#!/usr/bin/env python3
"""
透過画像のエッジを収縮するツール
"""

import argparse
import sys
import subprocess
from pathlib import Path

VENV_DIR = Path(__file__).parent / ".venv"


def ensure_venv():
    venv_python = VENV_DIR / "bin" / "python"
    if not VENV_DIR.exists():
        print("仮想環境を作成中...")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])
        subprocess.check_call([str(venv_python), "-m", "pip", "install", "-q", "pillow", "numpy", "scipy"])
    if sys.executable != str(venv_python):
        import os
        os.execv(str(venv_python), [str(venv_python)] + sys.argv)


def erode_image(image_path: str, output_path: str = None, iterations: int = 1) -> bool:
    """透過画像のエッジを収縮"""
    from PIL import Image
    import numpy as np
    from scipy.ndimage import binary_erosion

    output = output_path or image_path
    print(f"入力: {image_path}")
    print(f"収縮: {iterations}px")

    try:
        img = Image.open(image_path).convert("RGBA")
        data = np.array(img)

        alpha = data[:, :, 3]
        alpha_mask = alpha > 0
        eroded_mask = binary_erosion(alpha_mask, iterations=iterations)
        data[~eroded_mask] = [0, 0, 0, 0]

        result = Image.fromarray(data, 'RGBA')
        result.save(output, "PNG")
        print(f"出力: {output}")
        return True
    except Exception as e:
        print(f"エラー: {e}")
        return False


def main():
    ensure_venv()

    parser = argparse.ArgumentParser(description="透過画像エッジ収縮ツール")
    parser.add_argument("input", help="入力画像パス")
    parser.add_argument("-o", "--output", help="出力画像パス（省略時は上書き）")
    parser.add_argument("-i", "--iterations", type=int, default=1, help="収縮量（ピクセル数、デフォルト: 1）")

    args = parser.parse_args()
    success = erode_image(args.input, args.output, args.iterations)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
