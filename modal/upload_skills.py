"""
Upload skills and scripts to dreamcore-global Volume.

Usage:
    cd modal && modal run upload_skills.py

This script copies:
1. Migration-target skills from the old project
2. V2 skills from modal/skills/
3. Scripts from modal/scripts/
"""

import os
import modal

# Skills to migrate from V1 (GameCreatorMVP-v2)
MIGRATE_SKILLS_V1 = [
    "p5js-setup",
    "p5js-input",
    "p5js-collision",
    "threejs-setup",
    "threejs-input",
    "threejs-lighting",
    "threejs-water",
    "visual-polish-2d",
    "visual-polish-3d",
    "tween-animation",
    "game-ai",
    "vehicle-physics",
    "kawaii-3d",
    "kawaii-colors",
    "kawaii-ui",
    "frontend-design",
    "bria-rmbg",
    "_threejs-input",
    "web-claude-cli-architecture",
]

# V2 skills (override V1 if same name exists)
V2_SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")

# Scripts directory
V2_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "scripts")

# Source and destination
SOURCE_DIR_V1 = "/Users/admin/GameCreatorMVP-v2/.claude/skills"
VOLUME_NAME = "dreamcore-global"
MOUNT_PATH = "/global"

app = modal.App("dreamcore-skill-upload")
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


def read_skill_files(skill_path: str) -> dict[str, str]:
    """Read all files in a skill directory into a dict."""
    files = {}
    for root, _, filenames in os.walk(skill_path):
        for filename in filenames:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, skill_path)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    files[rel_path] = f.read()
            except UnicodeDecodeError:
                # Skip binary files
                print(f"    (skipping binary: {rel_path})")
    return files


@app.local_entrypoint()
def main():
    """Upload skills and scripts to the global volume."""
    # Collect all files in memory
    skills_data = {}  # skill_name -> { rel_path -> content }
    scripts_data = {}  # script_name -> content

    copied_count = 0
    total_size = 0

    # 1. Collect V1 skills
    print(f"[V1] Collecting {len(MIGRATE_SKILLS_V1)} skills from GameCreatorMVP-v2...")
    for skill_name in MIGRATE_SKILLS_V1:
        src_path = os.path.join(SOURCE_DIR_V1, skill_name)

        if os.path.isdir(src_path):
            files = read_skill_files(src_path)
            skill_size = sum(len(content.encode("utf-8")) for content in files.values())
            skills_data[skill_name] = files
            total_size += skill_size
            copied_count += 1
            print(f"  ✓ {skill_name} ({skill_size:,} bytes, {len(files)} files)")
        else:
            print(f"  ✗ {skill_name} (not found)")

    # 2. Collect V2 skills (override V1 if same name)
    if os.path.isdir(V2_SKILLS_DIR):
        v2_skills = [d for d in os.listdir(V2_SKILLS_DIR) if os.path.isdir(os.path.join(V2_SKILLS_DIR, d))]
        print(f"\n[V2] Collecting {len(v2_skills)} skills from modal/skills/...")
        for skill_name in v2_skills:
            src_path = os.path.join(V2_SKILLS_DIR, skill_name)
            files = read_skill_files(src_path)
            skill_size = sum(len(content.encode("utf-8")) for content in files.values())

            # Override V1 if exists
            if skill_name in skills_data:
                total_size -= sum(len(content.encode("utf-8")) for content in skills_data[skill_name].values())
            else:
                copied_count += 1

            skills_data[skill_name] = files
            total_size += skill_size
            print(f"  ✓ {skill_name} ({skill_size:,} bytes, {len(files)} files) [V2 override]")

    # 3. Collect scripts
    scripts_count = 0
    if os.path.isdir(V2_SCRIPTS_DIR):
        scripts = [f for f in os.listdir(V2_SCRIPTS_DIR) if f.endswith('.py')]
        print(f"\n[Scripts] Collecting {len(scripts)} scripts from modal/scripts/...")
        for script_name in scripts:
            src_path = os.path.join(V2_SCRIPTS_DIR, script_name)
            with open(src_path, "r", encoding="utf-8") as f:
                content = f.read()
            script_size = len(content.encode("utf-8"))
            scripts_data[script_name] = content
            total_size += script_size
            scripts_count += 1
            print(f"  ✓ {script_name} ({script_size:,} bytes)")

    print(f"\nTotal: {copied_count} skills + {scripts_count} scripts ({total_size:,} bytes)")

    # Upload to Modal Volume
    print("\nUploading to Modal Volume...")
    upload_to_volume.remote(skills_data, scripts_data)
    print("Done!")


@app.function(volumes={MOUNT_PATH: volume})
def upload_to_volume(skills_data: dict, scripts_data: dict):
    """Write files to the volume."""
    import subprocess

    skills_dst = os.path.join(MOUNT_PATH, ".claude", "skills")
    scripts_dst = os.path.join(MOUNT_PATH, "scripts")

    # Create destination directories
    os.makedirs(skills_dst, exist_ok=True)
    os.makedirs(scripts_dst, exist_ok=True)

    # Write skills
    print("Writing skills...")
    for skill_name, files in skills_data.items():
        skill_dir = os.path.join(skills_dst, skill_name)
        os.makedirs(skill_dir, exist_ok=True)

        for rel_path, content in files.items():
            file_path = os.path.join(skill_dir, rel_path)
            # Create parent directories if needed
            parent_dir = os.path.dirname(file_path)
            if parent_dir and not os.path.exists(parent_dir):
                os.makedirs(parent_dir, exist_ok=True)

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

        print(f"  ✓ {skill_name} ({len(files)} files)")

    # Write scripts
    print("Writing scripts...")
    for script_name, content in scripts_data.items():
        file_path = os.path.join(scripts_dst, script_name)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        # Make executable
        os.chmod(file_path, 0o755)
        print(f"  ✓ {script_name}")

    # Commit volume changes
    volume.commit()

    # Verify
    print("\nVolume contents:")
    result = subprocess.run(
        ["ls", "-la", skills_dst],
        capture_output=True,
        text=True
    )
    print(f"Skills ({len(skills_data)}):\n{result.stdout}")

    result = subprocess.run(
        ["ls", "-la", scripts_dst],
        capture_output=True,
        text=True
    )
    print(f"Scripts ({len(scripts_data)}):\n{result.stdout}")


if __name__ == "__main__":
    # Run with: modal run upload_skills.py
    print("Run this script with: modal run upload_skills.py")
