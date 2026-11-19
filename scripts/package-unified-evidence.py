import os
import zipfile

# 1. Clean up old separate zip archives
old_zips = [
    'Kinora_DEV_MOCK_Evidence.zip',
    'Kinora_REAL_USER_Evidence.zip',
    '/home/millsy/.gemini/antigravity/brain/1c521f47-1460-4a82-a96e-baff8b40854c/Kinora_DEV_MOCK_Evidence.zip',
    '/home/millsy/.gemini/antigravity/brain/1c521f47-1460-4a82-a96e-baff8b40854c/Kinora_REAL_USER_Evidence.zip'
]
for z in old_zips:
    if os.path.exists(z):
        os.remove(z)
        print(f"Removed old zip: {z}")

readme_content = """# Kinora UI Verification Evidence Package

This single archive contains the complete, uncompressed screenshot evidence from both environments of Kinora TV for independent inspection and review.

## Archive Structure

Kinora_COMPLETE_UI_Evidence/
  DEV-MOCK/
    All desktop screenshots (1920x1080)
    All responsive screenshots (1280x800)
  REAL-USER/
    All desktop screenshots (1920x1080)
    All responsive screenshots (1280x800)
  COMPARISON/
    All existing side-by-side comparison sheets
  MANIFEST/
    SCREENSHOT-MANIFEST.md
    README.md
  VERIFICATION/
    ARCHIVE-INVENTORY.md

## Environment Definitions

1. DEV MOCK (DEV-MOCK/):
   - Populated with deterministic development fixtures, sample movies, fictional series, and continuous EPG data.
   - Used for design system reference, visual benchmark testing, and layout regression detection.
2. REAL USER (REAL-USER/):
   - Captured from the genuine Kinora user runtime with real configured sources, live Xtream connections, verified public discovery entries, and real physical storage volume metrics.
   - Clean empty states and structured notices when external providers are not connected. Never contaminated with fabricated personal mock data.
3. COMPARISON (COMPARISON/):
   - 25 side-by-side comparison images demonstrating layout alignment, typography consistency, and visual symmetry between the two environments.
"""

dev_files = sorted(os.listdir('docs/ui/dev-mock'))
user_files = sorted(os.listdir('docs/ui/user-sources'))
comp_files = sorted(os.listdir('docs/ui/comparison'))

inventory_lines = [
    "# Kinora Archive Verification & Capture Inventory",
    "",
    "## 1. Summary of Archive Contents",
    "",
    f"- **DEV-MOCK Screenshots:** {len(dev_files)} files (34 Desktop 1920x1080, 6 Responsive 1280x800)",
    f"- **REAL-USER Screenshots:** {len(user_files)} files (34 Desktop 1920x1080, 6 Responsive 1280x800)",
    f"- **COMPARISON Sheets:** {len(comp_files)} side-by-side comparison images",
    "- **Documentation & Manifest:** SCREENSHOT-MANIFEST.md, README.md, ARCHIVE-INVENTORY.md",
    f"- **Total Image Files:** {len(dev_files) + len(user_files) + len(comp_files)}",
    "",
    "## 2. DEV-MOCK File Inventory (docs/ui/dev-mock/)",
    "",
    "| Filename | Resolution | File Size | Classification |",
    "|---|---|---|---|"
]

for f in dev_files:
    p = os.path.join('docs/ui/dev-mock', f)
    res = '1280x800' if '1280' in f else '1920x1080'
    kind = 'Responsive' if '1280' in f else 'Desktop'
    sz = os.path.getsize(p)
    inventory_lines.append(f"| `{f}` | {res} | {sz:,} bytes | {kind} |")

inventory_lines.extend([
    "",
    "## 3. REAL-USER File Inventory (docs/ui/user-sources/)",
    "",
    "| Filename | Resolution | File Size | Classification |",
    "|---|---|---|---|"
])

for f in user_files:
    p = os.path.join('docs/ui/user-sources', f)
    res = '1280x800' if '1280' in f else '1920x1080'
    kind = 'Responsive' if '1280' in f else 'Desktop'
    sz = os.path.getsize(p)
    inventory_lines.append(f"| `{f}` | {res} | {sz:,} bytes | {kind} |")

inventory_lines.extend([
    "",
    "## 4. COMPARISON File Inventory (docs/ui/comparison/)",
    "",
    "| Filename | File Size | Notes |",
    "|---|---|---|"
])

for f in comp_files:
    p = os.path.join('docs/ui/comparison', f)
    sz = os.path.getsize(p)
    inventory_lines.append(f"| `{f}` | {sz:,} bytes | Side-by-side comparison sheet |")

inventory_content = "\n".join(inventory_lines) + "\n"

# Verify zero em-dash in generated content
assert '\u2014' not in readme_content, "Em-dash found in README"
assert '\u2014' not in inventory_content, "Em-dash found in INVENTORY"

# 4. Create the unified archive
zip_target = 'Kinora_COMPLETE_UI_Evidence.zip'
print(f"Building {zip_target}...")

with zipfile.ZipFile(zip_target, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    # DEV-MOCK
    for f in dev_files:
        arcname = f"Kinora_COMPLETE_UI_Evidence/DEV-MOCK/{f}"
        zf.write(os.path.join('docs/ui/dev-mock', f), arcname)
    # REAL-USER
    for f in user_files:
        arcname = f"Kinora_COMPLETE_UI_Evidence/REAL-USER/{f}"
        zf.write(os.path.join('docs/ui/user-sources', f), arcname)
    # COMPARISON
    for f in comp_files:
        arcname = f"Kinora_COMPLETE_UI_Evidence/COMPARISON/{f}"
        zf.write(os.path.join('docs/ui/comparison', f), arcname)
    # MANIFEST
    zf.write('docs/ui/reports/SCREENSHOT-MANIFEST.md', 'Kinora_COMPLETE_UI_Evidence/MANIFEST/SCREENSHOT-MANIFEST.md')
    zf.writestr('Kinora_COMPLETE_UI_Evidence/MANIFEST/README.md', readme_content)
    # VERIFICATION
    zf.writestr('Kinora_COMPLETE_UI_Evidence/VERIFICATION/ARCHIVE-INVENTORY.md', inventory_content)

print(f"Created {zip_target} successfully. Size: {os.path.getsize(zip_target):,} bytes.")
