#!/bin/bash
# Builds the local fixtures the native smoke tests use, in $KINORA_SMOKE_DIR/fx (default
# /tmp/kinora-smoke/fx). Needs ffmpeg (libx264, aac) and python3. Everything is synthetic: a test
# pattern with a tone, generated playlists and generated XMLTV. Guide times are relative to now, so
# rebuild the fixtures before a run on another day.
set -euo pipefail
D=${KINORA_SMOKE_DIR:-/tmp/kinora-smoke}; F=$D/fx; S='http://127.0.0.1:18765'
mkdir -p "$F/hls" "$F/aes" "$F/missing"
clip() { ffmpeg -loglevel error -y -f lavfi -i "$1=size=640x360:rate=25" -f lavfi -i "sine=frequency=$2:sample_rate=48000" -t 12 \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 50 -c:a aac -b:a 96k -f hls -hls_time 2 -hls_list_size 0 "${@:3}"; }
( cd "$F/hls" && clip testsrc 440 -hls_segment_filename 'seg%02d.ts' index.m3u8 )
# AES-128: the key is served by the fixture server (with a token Kinora must never expose).
( cd "$F/aes" && head -c 16 /dev/urandom > key.bin && printf 'key.bin?token=KEYTOKEN\n%s/key.bin\n' "$F/aes" > keyinfo \
  && clip testsrc2 660 -hls_key_info_file keyinfo -hls_segment_filename 'seg%02d.ts' index.m3u8 )
ffmpeg -loglevel error -y -f lavfi -i testsrc=size=320x240:rate=25 -t 3 -c:v libx264 -pix_fmt yuv420p "$F/progressive.mp4"
printf '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nhls/index.m3u8?v=lo\n#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=640x360\nhls/index.m3u8?v=hi\n' > "$F/master.m3u8"
printf '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg00.ts\n#EXTINF:2.0,\nseg01.ts\n#EXT-X-ENDLIST\n' > "$F/missing/index.m3u8"
printf '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm.example/key",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXTINF:2.0,\nseg00.ts\n' > "$F/drm.m3u8"
cat > "$F/channels.m3u" <<EOF
#EXTM3U
#EXTINF:-1 tvg-id="fx.hls" group-title="Fixtures",Fixture HLS
$S/master.m3u8?token=STREAMTOKEN
#EXTINF:-1 tvg-id="fx.aes" group-title="Fixtures",Fixture AES
$S/aes/index.m3u8?token=STREAMTOKEN
#EXTINF:-1 tvg-id="fx.drm" group-title="Fixtures",Fixture DRM
$S/drm.m3u8?token=STREAMTOKEN
#EXTINF:-1 tvg-id="fx.mp4" group-title="Fixtures",Fixture MP4
$S/progressive.mp4?token=STREAMTOKEN
#EXTINF:-1 tvg-id="fx.missing" group-title="Fixtures",Fixture Missing
$S/missing/index.m3u8?token=STREAMTOKEN
#EXTINF:-1 tvg-id="fx.slow" group-title="Fixtures",Fixture Slow
$S/slow/hls/index.m3u8?token=STREAMTOKEN
EOF
# Formats: fMP4/CMAF, HEVC, separate audio and subtitle renditions, a sliding live window (server.py).
mkdir -p "$F/fmp4" "$F/hevc" "$F/alt/video" "$F/alt/en" "$F/alt/fr"
( cd "$F/fmp4" && clip testsrc 500 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename 'seg%02d.m4s' index.m3u8 )
( cd "$F/hevc" && ffmpeg -loglevel error -y -f lavfi -i testsrc=size=640x360:rate=25 -f lavfi -i sine=frequency=300:sample_rate=48000 -t 12 -c:v libx265 -x265-params log-level=error -preset veryfast -pix_fmt yuv420p -tag:v hvc1 -g 50 -c:a aac -b:a 96k -f hls -hls_time 2 -hls_list_size 0 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename 'seg%02d.m4s' index.m3u8 )
( cd "$F/alt/video" && ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=25 -t 12 -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 50 -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename 'seg%02d.ts' index.m3u8 )
for l in en:440 fr:880; do ( cd "$F/alt/${l%%:*}" && ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=${l##*:}:sample_rate=48000" -t 12 -c:a aac -b:a 96k -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename 'seg%02d.ts' index.m3u8 ); done
mkdir -p "$F/long" "$F/break"
( cd "$F/long" && ffmpeg -loglevel error -y -f lavfi -i testsrc=size=320x180:rate=25 -f lavfi -i sine=frequency=500:sample_rate=48000 -t 600 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -g 50 -c:a aac -b:a 48k -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename 'seg%03d.ts' index.m3u8 )
# Programme, ad break, programme: timestamps restart at the break.
printf '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n' > "$F/break/index.m3u8"
for part in 1 2 3; do [ $part -gt 1 ] && echo '#EXT-X-DISCONTINUITY' >> "$F/break/index.m3u8"; for i in 00 01 02; do printf '#EXTINF:2.0,\n/hls/seg%s.ts\n' $i >> "$F/break/index.m3u8"; done; done
echo '#EXT-X-ENDLIST' >> "$F/break/index.m3u8"
printf 'WEBVTT\n\n00:00:00.000 --> 00:00:12.000\nFixture subtitle\n' > "$F/alt/subs.vtt"
printf '#EXTM3U\n#EXT-X-TARGETDURATION:12\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:12.0,\nsubs.vtt\n#EXT-X-ENDLIST\n' > "$F/alt/subs.m3u8"
cat > "$F/alt/index.m3u8" <<'EOF'
#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="en/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Francais",LANGUAGE="fr",AUTOSELECT=YES,URI="fr/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",AUTOSELECT=YES,URI="subs.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360,CODECS="avc1.64001e,mp4a.40.2",AUDIO="aud",SUBTITLES="subs"
video/index.m3u8
EOF
cat > "$F/formats.m3u" <<EOF
#EXTM3U
#EXTINF:-1 tvg-id="fm.fmp4" group-title="Formats",Format fMP4
$S/fmp4/index.m3u8
#EXTINF:-1 tvg-id="fm.hevc" group-title="Formats",Format HEVC
$S/hevc/index.m3u8
#EXTINF:-1 tvg-id="fm.alt" group-title="Formats",Format Alternate
$S/alt/index.m3u8
#EXTINF:-1 tvg-id="fm.live" group-title="Formats",Format Live
$S/live/index.m3u8
#EXTINF:-1 tvg-id="fm.break" group-title="Formats",Format Break
$S/break/index.m3u8
#EXTINF:-1 tvg-id="fm.mp4" group-title="Formats",Format File
$S/progressive.mp4
EOF
printf 'this is not a playlist\n<<<>>>\n' > "$F/bad.m3u"
printf '<!doctype html><html><body>Sign in</body></html>' > "$F/login.html"
python3 - "$F" <<'PY'
import gzip, sys, time
F = sys.argv[1]
now = int(time.time()) // 1800 * 1800
fmt = lambda t: time.strftime('%Y%m%d%H%M%S', time.gmtime(t)) + ' +0000'
with open(f'{F}/big.m3u', 'w') as f:  # 10,000 channels
    f.write('#EXTM3U\n')
    for i in range(10000):
        f.write(f'#EXTINF:-1 tvg-id="ch.{i}" group-title="Group {i % 40};Big",Big Channel {i}\nhttp://127.0.0.1:18765/hls/index.m3u8?ch={i}&token=STREAMTOKEN\n')
def guide(path, channels, step, span_from, span_to):
    parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv>']
    parts += [f'<channel id="ch.{c}"><display-name>Big {c}</display-name></channel>' for c in range(channels)]
    n = 0
    for c in range(channels):
        t = now + span_from
        while t < now + span_to:
            parts.append(f'<programme start="{fmt(t)}" stop="{fmt(t + step)}" channel="ch.{c}"><title>Show {c}-{n}</title><desc>Programme {n} on channel {c}, a synthetic listing for load testing.</desc></programme>')
            t += step; n += 1
    parts.append('</tv>')
    open(path, 'wb').write(gzip.compress(''.join(parts).encode()))
guide(f'{F}/guide-big.xml.gz', 1000, 5400, -12 * 3600, 8 * 86400)   # 136,000 programmes, under the cap
guide(f'{F}/guide-over.xml.gz', 1200, 3600, -12 * 3600, 8 * 86400)  # 244,800 programmes, over the cap
# The small guide matches the fixture playlist by id (different case on purpose) and offers one id for hand matching.
p = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv><channel id="FX.HLS"><display-name>Fixture HLS (guide)</display-name></channel><channel id="fx.other"><display-name>Fixture Other</display-name></channel>']
for i in range(-4, 40):
    s = now + i * 1800
    p.append(f'<programme start="{fmt(s)}" stop="{fmt(s + 1800)}" channel="FX.HLS"><title>Fixture News {i}</title><icon src="http://127.0.0.1:18765/icon.png?token=ICONTOKEN"/></programme>')
    p.append(f'<programme start="{fmt(s)}" stop="{fmt(s + 1800)}" channel="fx.other"><title>Other Show {i}</title></programme>')
p.append('</tv>')
open(f'{F}/guide.xml.gz', 'wb').write(gzip.compress(''.join(p).encode()))
# Edge cases for fx.hls, in local (Europe/London) terms: a programme across midnight, a two-hour gap,
# and times written with different offsets that mean the same instants.
import calendar
day = calendar.timegm(time.strptime(time.strftime('%Y%m%d', time.gmtime(now)), '%Y%m%d'))  # today 00:00 UTC
def at(h, off):  # local hour h written with offset `off` hours
    t = day + h * 3600
    sign = '+' if off >= 0 else '-'
    return time.strftime('%Y%m%d%H%M%S', time.gmtime(t + off * 3600)) + f' {sign}{abs(off):02d}00'
e = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv><channel id="fx.hls"><display-name>Fixture HLS</display-name></channel>']
for title, a, b in [('Edge Morning', at(9, 0), at(10, 0)), ('Edge Offset Plus', at(10, 1), at(11, 1)), ('Edge Offset Minus', at(11, -5), at(12, -5)),
                    ('Edge After Gap', at(14, 0), at(15, 0)), ('Edge Late Film', at(23, 0), at(25, 0))]:
    e.append(f'<programme start="{a}" stop="{b}" channel="fx.hls"><title>{title}</title></programme>')
e.append('</tv>')
open(f'{F}/guide-edge.xml', 'w').write(''.join(e))
open(f'{F}/guide-truncated.xml', 'w').write(''.join(e)[:-60])
with open(f'{F}/guide-huge.xml', 'w') as h:  # over the 64 MB download limit, uncompressed
    h.write('<tv>')
    pad = '<!-- ' + 'x' * 1000 + ' -->\n'
    for _ in range(66 * 1024):
        h.write(pad)
    h.write('</tv>')
with gzip.open(f'{F}/guide-bomb.xml.gz', 'wb', compresslevel=9) as z:  # ~140 KB that inflates past 128 MB
    z.write(b'<tv>')
    for _ in range(140): z.write(b' ' * (1 << 20))
open(f'{F}/laughs.xml', 'w').write('<?xml version="1.0"?><!DOCTYPE tv [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><tv><channel id="x"><display-name>&b;</display-name></channel></tv>')
PY
echo "fixtures in $F"
