#!/usr/bin/env python3
"""
マゼンタ/ピンク背景を色ベースで透過にするツール
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


def remove_background_magenta(image_path: str, output_path: str = None) -> bool:
    """マゼンタ/ピンク背景を色ベースで透過にする（エッジデフリンジ付き）"""
    from PIL import Image
    import numpy as np
    from scipy.ndimage import binary_erosion, binary_dilation

    output = output_path or image_path
    print(f"入力: {image_path}")
    print("背景を除去中（マゼンタ/ピンク色除去 + デフリンジ）...")

    try:
        img = Image.open(image_path).convert("RGBA")
        data = np.array(img, dtype=np.float32)

        r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

        # マゼンタ検出（条件を緩和してアンチエイリアス部分も検出）
        # 純粋なマゼンタ: R高、G低、B高
        magenta_strong = (r > 180) & (g < 100) & (b > 100)
        # 薄いマゼンタ/ピンク: Rが高くGが低め、BがGより高い
        magenta_weak = (r > 150) & (g < 150) & (b > g + 30) & (r > b)
        magenta_mask = magenta_strong | magenta_weak

        # マゼンタ領域を透過に
        data[magenta_mask] = [0, 0, 0, 0]

        # エッジ検出（残った不透明部分の境界）
        alpha = data[:, :, 3]
        alpha_mask = alpha > 0
        dilated = binary_dilation(alpha_mask, iterations=2)
        eroded = binary_erosion(alpha_mask, iterations=2)
        edge_mask = dilated & ~eroded & alpha_mask

        # エッジピクセルのデフリンジ処理
        # マゼンタ成分（R-G と B-G の両方が高い）を除去
        edge_indices = np.where(edge_mask)
        for y, x in zip(edge_indices[0], edge_indices[1]):
            pixel = data[y, x]
            r_val, g_val, b_val, a_val = pixel
            if a_val > 0:
                # マゼンタ汚染度を計算
                magenta_contamination = min(r_val - g_val, b_val - g_val)
                if magenta_contamination > 20:
                    # マゼンタ成分を除去（RとBを下げる）
                    reduction = magenta_contamination * 0.7
                    data[y, x, 0] = max(0, r_val - reduction)  # R
                    data[y, x, 2] = max(0, b_val - reduction)  # B
                    # アルファも少し下げてソフトエッジに
                    if magenta_contamination > 50:
                        data[y, x, 3] = a_val * 0.7

        # 最外周1pxを透過（残った細かいフリンジ対策）
        alpha_final = data[:, :, 3] > 0
        eroded_final = binary_erosion(alpha_final, iterations=1)
        data[~eroded_final] = [0, 0, 0, 0]

        result = Image.fromarray(data.astype(np.uint8), 'RGBA')
        result.save(output, "PNG")
        print(f"出力: {output}")
        print("背景除去完了（デフリンジ + 1px収縮済）")
        return True
    except Exception as e:
        print(f"エラー: {e}")
        return False


def main():
    ensure_venv()

    parser = argparse.ArgumentParser(description="マゼンタ背景除去ツール")
    parser.add_argument("input", help="入力画像パス")
    parser.add_argument("-o", "--output", help="出力画像パス（省略時は上書き）")

    args = parser.parse_args()
    success = remove_background_magenta(args.input, args.output)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
