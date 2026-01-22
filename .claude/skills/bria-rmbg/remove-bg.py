#!/usr/bin/env python3
"""
BRIA RMBG 2.0 - Background Removal Tool
Uses Replicate API to remove image backgrounds.

Required:
  - Environment variable: REPLICATE_API_TOKEN
  - pip install replicate

Usage:
  python3 remove-bg.py input.png [-o output.png]
"""

import argparse
import os
import sys
import requests
from pathlib import Path

try:
    import replicate
except ImportError:
    print("Error: replicate package not installed.", file=sys.stderr)
    print("Run: pip install replicate", file=sys.stderr)
    sys.exit(1)


MODEL_ID = "bria/remove-background:4ed060b3587b7c3912353dd7d59000c883a6e1c5c9181ed7415c2624c2e8e392"


def get_api_token():
    """Check API token from environment variable."""
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        print("Error: REPLICATE_API_TOKEN environment variable is not set.", file=sys.stderr)
        print("Get your API token from https://replicate.com/account/api-tokens", file=sys.stderr)
        sys.exit(1)
    return token


def remove_background(image_path: str) -> str:
    """
    Remove background from image using Replicate API.

    Args:
        image_path: Path to input image

    Returns:
        URL of the result image
    """
    print(f"Uploading image to Replicate API...")

    # Open image file and pass to API
    with open(image_path, "rb") as f:
        output = replicate.run(
            MODEL_ID,
            input={
                "image": f,
                "preserve_alpha": True,
                "content_moderation": False,
            }
        )

    if output:
        print(f"Processing complete!")
        return str(output)

    print("Error: No output from API", file=sys.stderr)
    sys.exit(1)


def download_image(url: str, output_path: str):
    """Download image from URL and save to file."""
    print(f"Downloading result...")
    response = requests.get(url)

    if response.status_code != 200:
        print(f"Error: Failed to download image", file=sys.stderr)
        sys.exit(1)

    with open(output_path, "wb") as f:
        f.write(response.content)

    print(f"Saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Remove background from image using BRIA RMBG 2.0 (Replicate)"
    )
    parser.add_argument(
        "input",
        help="Input image path (PNG or JPEG)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output image path (default: overwrites input)",
        default=None
    )

    args = parser.parse_args()

    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Set output path
    output_path = args.output if args.output else str(input_path)

    # Check API token
    get_api_token()

    # Remove background
    result_url = remove_background(str(input_path))

    # Download and save result
    download_image(result_url, output_path)

    print("Done!")


if __name__ == "__main__":
    main()
