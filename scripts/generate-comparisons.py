import os
from PIL import Image, ImageDraw, ImageFont

DEV_MOCK_DIR = 'docs/ui/dev-mock'
USER_SOURCES_DIR = 'docs/ui/user-sources'
COMPARISON_DIR = 'docs/ui/comparison'

os.makedirs(COMPARISON_DIR, exist_ok=True)

COMPARE_SCREENS = [
    'home-top.png',
    'home-featured-movie.png',
    'home-featured-series.png',
    'home-scrolled.png',
    'live-tv-guide.png',
    'movies-top.png',
    'movies-rails.png',
    'movie-details.png',
    'movies-empty.png',
    'tv-shows-top.png',
    'tv-shows-rails.png',
    'tv-show-details.png',
    'tv-shows-empty.png',
    'radio.png',
    'news.png',
    'sports.png',
    'education.png',
    'culture-arts.png',
    'nature-science.png',
    'gaming.png',
    'language-resources.png',
    'search-results.png',
    'library.png',
    'artwork-library.png',
    'recordings.png',
    'imdb-share-dialog.png',
    'sources.png',
    'settings.png'
]

HEADER_HEIGHT = 60
GAP = 20

def create_comparison(screen_filename):
    dev_path = os.path.join(DEV_MOCK_DIR, screen_filename)
    user_path = os.path.join(USER_SOURCES_DIR, screen_filename)

    if not os.path.exists(dev_path) or not os.path.exists(user_path):
        print(f"Skipping {screen_filename}: one or both source images missing")
        return

    img_dev = Image.open(dev_path).convert('RGB')
    img_user = Image.open(user_path).convert('RGB')

    # Scale to 960x540 each so total width is 1920 + gap
    target_w, target_h = 960, 540
    img_dev_scaled = img_dev.resize((target_w, target_h), Image.Resampling.LANCZOS)
    img_user_scaled = img_user.resize((target_w, target_h), Image.Resampling.LANCZOS)

    total_w = target_w * 2 + GAP
    total_h = target_h + HEADER_HEIGHT + 20

    comp = Image.new('RGB', (total_w, total_h), color=(15, 14, 13))
    draw = ImageDraw.Draw(comp)

    # Header bar
    draw.rectangle([0, 0, total_w, HEADER_HEIGHT], fill=(24, 23, 21))

    # Font setup
    try:
        font_title = ImageFont.truetype('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf', 20)
        font_sub = ImageFont.truetype('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf', 14)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Labels
    screen_name = screen_filename.replace('.png', '').replace('-', ' ').title()
    draw.text((20, 18), f"DEV MOCK: {screen_name}", fill=(245, 197, 24), font=font_title)
    draw.text((target_w + GAP + 20, 18), f"USER SOURCES: {screen_name}", fill=(229, 9, 20), font=font_title)

    # Paste images
    comp.paste(img_dev_scaled, (0, HEADER_HEIGHT))
    comp.paste(img_user_scaled, (target_w + GAP, HEADER_HEIGHT))

    # Separator line
    draw.line([(target_w + GAP // 2, HEADER_HEIGHT), (target_w + GAP // 2, total_h)], fill=(45, 42, 38), width=2)

    base_name = screen_filename.replace('.png', '')
    out_path = os.path.join(COMPARISON_DIR, f"{base_name}-comparison.png")
    comp.save(out_path, quality=92)
    print(f"Generated comparison: {out_path}")

def main():
    print("Generating side-by-side comparison library...")
    count = 0
    for screen in COMPARE_SCREENS:
        create_comparison(screen)
        count += 1
    print(f"Comparison generation complete: {count} comparisons processed.")

if __name__ == '__main__':
    main()
