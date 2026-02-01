#!/usr/bin/env python3
"""
Gemini Image API で画像生成 + マゼンタ背景除去 (Vertex AI対応)

Usage:
    python generate_image.py --prompt "cute cat character" --output "assets/player.png" --transparent

Requirements:
    pip install Pillow httpx google-auth

Environment (Vertex AI mode):
    GOOGLE_APPLICATION_CREDENTIALS_JSON - GCP service account JSON
    ANTHROPIC_VERTEX_PROJECT_ID - GCP project ID
    CLOUD_ML_REGION - GCP region (e.g., us-east5)

Environment (Legacy mode):
    GEMINI_BASE_URL - GCE API proxy URL
    GEMINI_API_KEY - Gemini API key (direct API)
"""

import argparse
import base64
import io
import json
import os
import sys

try:
    import httpx
    from PIL import Image
except ImportError:
    print("Error: Required packages not installed. Run: pip install Pillow httpx", file=sys.stderr)
    sys.exit(1)


# Gemini Image model for Vertex AI
GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview"


def get_vertex_ai_token():
    """Get OAuth access token from service account JSON or file."""
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleAuthRequest
    except ImportError:
        print("Error: google-auth not installed. Run: pip install google-auth", file=sys.stderr)
        return None

    creds_info = None

    # Try GOOGLE_APPLICATION_CREDENTIALS_JSON env var first
    creds_json = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if creds_json:
        try:
            creds_info = json.loads(creds_json)
        except json.JSONDecodeError:
            pass

    # Try GOOGLE_APPLICATION_CREDENTIALS file path
    if not creds_info:
        creds_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_file and os.path.exists(creds_file):
            try:
                with open(creds_file, 'r') as f:
                    creds_info = json.load(f)
            except Exception as e:
                print(f"Error reading credentials file: {e}", file=sys.stderr)

    if not creds_info:
        return None

    try:
        credentials = service_account.Credentials.from_service_account_info(
            creds_info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        credentials.refresh(GoogleAuthRequest())
        return credentials.token
    except Exception as e:
        print(f"Error getting Vertex AI token: {e}", file=sys.stderr)
        return None


def remove_magenta_background(img: Image.Image, tolerance: int = 75) -> Image.Image:
    """
    マゼンタ背景を透明化する。

    判定条件 (V1互換): R > 180, G < 100, B > 100

    Args:
        img: PIL Image (RGBA)
        tolerance: 未使用 (V1互換のため固定条件)

    Returns:
        透明化処理後の Image
    """
    img = img.convert("RGBA")
    pixels = img.load()
    width, height = img.size

    # Pass 1: マゼンタピクセルを透明化
    alpha_map = [[False] * width for _ in range(height)]

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # マゼンタ判定: R > 180, G < 100, B > 100
            if r > 180 and g < 100 and b > 100:
                pixels[x, y] = (r, g, b, 0)
                alpha_map[y][x] = True

    # Pass 2: 1px erosion - 透明ピクセルに隣接するエッジを透明化
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0:  # 不透明ピクセル
                # 隣接8方向をチェック
                has_transparent_neighbor = False
                for dy in [-1, 0, 1]:
                    for dx in [-1, 0, 1]:
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < width and 0 <= ny < height:
                            if alpha_map[ny][nx]:
                                has_transparent_neighbor = True
                                break
                    if has_transparent_neighbor:
                        break

                if has_transparent_neighbor:
                    r, g, b, _ = pixels[x, y]
                    pixels[x, y] = (r, g, b, 0)

    return img


def auto_trim(img: Image.Image) -> Image.Image:
    """
    透明部分をトリミングする。

    Args:
        img: PIL Image (RGBA)

    Returns:
        トリミング後の Image
    """
    # アルファチャンネルのバウンディングボックスを取得
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()

    if bbox:
        return img.crop(bbox)
    return img


def generate_image(prompt: str, output_path: str, transparent: bool = True) -> bool:
    """
    Gemini Image API で画像を生成し保存する。

    Args:
        prompt: 画像生成プロンプト
        output_path: 出力ファイルパス
        transparent: 透過背景処理を行うか

    Returns:
        成功したら True
    """
    # Check for Vertex AI configuration first
    gcp_project = os.environ.get("ANTHROPIC_VERTEX_PROJECT_ID")
    gcp_region = os.environ.get("CLOUD_ML_REGION")
    gcp_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")

    use_vertex_ai = all([gcp_project, gcp_region, gcp_creds])

    if use_vertex_ai:
        # Vertex AI mode
        access_token = get_vertex_ai_token()
        if not access_token:
            print("Error: Failed to get Vertex AI access token", file=sys.stderr)
            return False

        # Gemini 3 models are only available via global endpoint
        url = f"https://aiplatform.googleapis.com/v1/projects/{gcp_project}/locations/global/publishers/google/models/{GEMINI_IMAGE_MODEL}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        }
        print(f"Using Vertex AI (global): project={gcp_project}, model={GEMINI_IMAGE_MODEL}")
    else:
        # Legacy mode: GCE API proxy or direct API
        gemini_base_url = os.environ.get("GEMINI_BASE_URL")
        api_key = os.environ.get("GEMINI_API_KEY")

        if gemini_base_url:
            # GCE API proxy mode
            url = f"{gemini_base_url}/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent"
            headers = {"Content-Type": "application/json"}
            print("Using GCE API proxy (legacy)")
        elif api_key:
            # Direct API mode
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            print("Using direct Gemini API (legacy)")
        else:
            print("Error: No Vertex AI or Gemini API configuration found", file=sys.stderr)
            return False

    # 透過背景の場合、マゼンタ背景で生成
    enhanced_prompt = prompt
    if transparent:
        enhanced_prompt = f"{prompt}, on a solid magenta (#FF00FF) background, isolated game sprite, centered, clean edges, no shadows"

    print(f"Generating image: {prompt[:50]}...")

    # Gemini API リクエスト (画像生成では responseMimeType は使えない)
    request_body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": f"Generate an image: {enhanced_prompt}"}
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["Text", "Image"]
        }
    }

    try:
        # Use trust_env=True to respect HTTP_PROXY/HTTPS_PROXY environment variables
        with httpx.Client(timeout=120.0, trust_env=True) as client:
            response = client.post(
                url,
                json=request_body,
                headers=headers
            )

        if response.status_code != 200:
            print(f"Error: Gemini API returned {response.status_code}", file=sys.stderr)
            print(response.text[:500], file=sys.stderr)
            return False

        data = response.json()

        # 画像データを抽出
        candidates = data.get("candidates", [])
        if not candidates:
            print("Error: No candidates in response", file=sys.stderr)
            return False

        parts = candidates[0].get("content", {}).get("parts", [])
        image_data = None

        for part in parts:
            if "inlineData" in part:
                image_data = part["inlineData"].get("data")
                break

        if not image_data:
            # テキストレスポンスをチェック
            for part in parts:
                if "text" in part:
                    print(f"Error: Model returned text instead of image: {part['text'][:100]}", file=sys.stderr)
            return False

        # 画像をデコード
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes))

        print(f"Image generated: {img.size[0]}x{img.size[1]}")

        # 透過処理
        if transparent:
            print("Removing magenta background...")
            img = remove_magenta_background(img)
            print("Applying 1px erosion...")
            # erosionは remove_magenta_background 内で実行済み
            print("Auto-trimming...")
            img = auto_trim(img)
            print(f"Final size: {img.size[0]}x{img.size[1]}")

        # ディレクトリ作成
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        # PNG で保存
        img.save(output_path, "PNG")
        print(f"Saved: {output_path}")

        return True

    except httpx.TimeoutException:
        print("Error: Gemini API timeout", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Generate game sprite images using Gemini Image API"
    )
    parser.add_argument(
        "--prompt", "-p",
        required=True,
        help="Image generation prompt"
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="Output file path (e.g., assets/player.png)"
    )
    parser.add_argument(
        "--transparent", "-t",
        action="store_true",
        default=True,
        help="Generate with transparent background (default: True)"
    )
    parser.add_argument(
        "--no-transparent",
        action="store_true",
        help="Disable transparent background processing"
    )

    args = parser.parse_args()

    transparent = args.transparent and not args.no_transparent

    success = generate_image(args.prompt, args.output, transparent)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
