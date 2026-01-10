#!/usr/bin/env python3
"""
Nano Banana 画像生成スクリプト
Google Gemini の画像生成モデルを使用して画像を生成します。
"""

import argparse
import os
import sys
import subprocess
from pathlib import Path

VENV_DIR = Path(__file__).parent / ".venv"


def ensure_venv():
    """仮想環境を作成・有効化"""
    venv_python = VENV_DIR / "bin" / "python"

    if not VENV_DIR.exists():
        print("仮想環境を作成中...")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])
        subprocess.check_call([str(venv_python), "-m", "pip", "install", "-q", "google-genai", "pillow"])
        print("セットアップ完了")

    if sys.executable != str(venv_python):
        os.execv(str(venv_python), [str(venv_python)] + sys.argv)


def load_reference_image(image_path: str):
    """参照画像を読み込み"""
    from PIL import Image

    path = Path(image_path)
    if not path.exists():
        print(f"エラー: 参照画像が見つかりません: {image_path}")
        sys.exit(1)

    print(f"参照画像: {path.absolute()}")
    return Image.open(path)


def generate_image(
    prompt: str,
    output_path: str = "generated_image.png",
    aspect_ratio: str = "1:1",
    model_type: str = "pro",
    magenta_bg: bool = False,
    reference_image: str = None
) -> str:
    """Gemini APIを使用して画像を生成"""
    from google import genai

    # APIキー確認
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("エラー: 環境変数 GEMINI_API_KEY が設定されていません")
        sys.exit(1)

    # マゼンタ背景指定時はプロンプトを最適化
    if magenta_bg:
        bg_instruction = (
            "BACKGROUND: solid flat uniform magenta pink (#FF00FF) color only. "
            "NO borders, NO outlines, NO frames, NO shadows, NO gradients. "
            "Subject has natural colors, floating directly on pure magenta background."
        )
        final_prompt = f"{prompt}. {bg_instruction}"
    else:
        final_prompt = prompt

    # クライアント初期化
    client = genai.Client(api_key=api_key)

    # モデル選択
    model_ids = {
        "flash": "gemini-2.5-flash-image",
        "pro": "gemini-3-pro-image-preview"
    }
    model_id = model_ids.get(model_type, model_ids["pro"])

    print(f"モデル: {model_id}")
    print(f"プロンプト: {final_prompt[:100]}...")
    if magenta_bg:
        print("オプション: マゼンタ背景")
    if reference_image:
        print("オプション: 参照画像あり")
    print("生成中...")

    # コンテンツ構築
    if reference_image:
        ref_img = load_reference_image(reference_image)
        contents = [final_prompt, ref_img]
    else:
        contents = final_prompt

    # 画像生成
    response = client.models.generate_content(
        model=model_id,
        contents=contents,
    )

    # 画像保存
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    for part in response.parts:
        if part.inline_data is not None:
            image = part.as_image()
            image.save(output_file)
            print(f"保存完了: {output_file.absolute()}")
            return str(output_file.absolute())

    if hasattr(response, 'text') and response.text:
        print(f"レスポンス: {response.text}")

    print("警告: 画像が生成されませんでした")
    return ""


def main():
    ensure_venv()

    parser = argparse.ArgumentParser(
        description="Nano Banana 画像生成 (Google Gemini)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
例:
  python generate.py "かわいい猫のイラスト"
  python generate.py "夕焼けの風景" -a 16:9 -o sunset.png
  python generate.py "アイコン" --magenta-bg -o icon.png
  python generate.py "同じスタイルで犬を描いて" -r reference.png
        """
    )
    parser.add_argument("prompt", help="画像生成プロンプト")
    parser.add_argument("-o", "--output", default="generated_image.png", help="出力ファイルパス")
    parser.add_argument("-a", "--aspect-ratio", default="1:1", choices=["1:1", "16:9", "9:16", "4:3", "3:4"], help="アスペクト比")
    parser.add_argument("-m", "--model", default="pro", choices=["flash", "pro"], help="モデル: flash=高速, pro=高品質")
    parser.add_argument("--magenta-bg", action="store_true", help="マゼンタ背景で生成（後でremove-bg-magenta.pyで透過可能）")
    parser.add_argument("-r", "--reference", default=None, help="参照画像のパス")

    args = parser.parse_args()

    generate_image(
        prompt=args.prompt,
        output_path=args.output,
        aspect_ratio=args.aspect_ratio,
        model_type=args.model,
        magenta_bg=args.magenta_bg,
        reference_image=args.reference
    )


if __name__ == "__main__":
    main()
