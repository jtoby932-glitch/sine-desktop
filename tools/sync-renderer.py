#!/usr/bin/env python3
"""Builds the PC version's page (renderer/) from the iPhone app's web files, so both stay one app.

  python3 tools/sync-renderer.py <iPhone app's public folder> <renderer folder>

Leaves out what only the iPhone needs (its bridge to iOS, the phone layout script), adds the PC's own files
(desktop.js, desktop-engine.js, desktop.css, kept in tools/renderer-extra/) and switches Sine's own layers
(the sound engine, the Sine touches) on for the PC as well as the phone.
"""
import json
import os
import re
import shutil
import sys

src, dst = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
LEAVE_OUT = {'mobile-bridge.js', 'mobile-bridge.js.map', 'cordova.js', 'cordova_plugins.js', 'mobile-ui.js', 'touch-sliders.js', 'mobile.css'}

if os.path.isdir(dst):
    shutil.rmtree(dst)
shutil.copytree(src, dst, ignore=lambda d, names: [n for n in names if d == src and n in LEAVE_OUT])
for name in os.listdir(os.path.join(here, 'renderer-extra')):
    shutil.copy(os.path.join(here, 'renderer-extra', name), os.path.join(dst, name))


def edit(name, pairs):
    p = os.path.join(dst, name)
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        n = s.count(a) if isinstance(a, str) else len(re.findall(a, s))
        if n != 1:
            raise SystemExit(f'{name}: expected one match for {a!r}, found {n}')
        s = s.replace(a, b) if isinstance(a, str) else re.sub(a, b, s)
    open(p, 'w', encoding='utf-8').write(s)


def script_tag(src_name):
    return re.compile(r'[ \t]*<script[^>]*src="' + re.escape(src_name) + r'"[^>]*></script>\n?')


edit('index.html', [
    ('<link rel="stylesheet" href="mobile.css">', ''),
    ('<link rel="stylesheet" href="extras.css">', '<link rel="stylesheet" href="extras.css">\n  <link rel="stylesheet" href="desktop.css">'),
    (script_tag('mobile-bridge.js'), ''),
    (script_tag('mobile-ui.js'), ''),
    (script_tag('touch-sliders.js'), ''),
    (re.compile(r'(<script[^>]*src="profiles-core.js"[^>]*></script>)'), r'<script src="desktop.js"></script>\n  \1'),
    (re.compile(r'(<script[^>]*src="audio-engine.js"[^>]*></script>)'), r'\1\n  <script src="desktop-engine.js"></script>'),
])

# Sine's sound engine and Sine's own touches run on the PC too (they were switched on for the phone only)
edit('phone-fx.js', [
    ("  function start() {\n    if (!document.documentElement.classList.contains('is-mobile')) return;",
     "  function start() {\n    if (!document.documentElement.classList.contains('is-mobile') && !document.documentElement.classList.contains('is-desktop')) return;"),
    # the volume slider works on a PC (on an iPhone the buttons on the side own it): live sound and the second
    # player follow it as well as the main player
    ("  let wantMuted = false;                // what the listener chose",
     "  let wantMuted = false;                // what the listener chose\n  let wantVolume = 1;                   // the volume slider (a PC: an iPhone's is the hardware's)\n  const liveLevel = () => (wantMuted ? 0 : wantVolume);"),
    ("    if (helper) helper.el.muted = wantMuted;\n    if (live) live.master.gain.value = wantMuted ? 0 : 1;",
     "    if (helper) { helper.el.muted = wantMuted; helper.el.volume = wantVolume; }\n    if (live) live.master.gain.value = liveLevel();"),
    ("    master.gain.linearRampToValueAtTime(wantMuted ? 0 : 1, t0 + 0.012);", "    master.gain.linearRampToValueAtTime(liveLevel(), t0 + 0.012);"),
    ("    l.master.gain.linearRampToValueAtTime(wantMuted ? 0 : 1, when + 0.02);", "    l.master.gain.linearRampToValueAtTime(liveLevel(), when + 0.02);"),
    ("    el.muted = wantMuted;\n", "    el.muted = wantMuted;\n    el.volume = wantVolume;\n"),
    ("      get() { return wantMuted; },\n      set(v) { wantMuted = !!v; applyMute(); },",
     "      get() { return wantMuted; },\n      set(v) { wantMuted = !!v; applyMute(); },\n    });\n    const nativeVolume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');\n    wantVolume = nativeVolume.get.call(audio);\n    Object.defineProperty(audio, 'volume', {\n      configurable: true,\n      get() { return wantVolume; },\n      set(v) { wantVolume = Math.max(0, Math.min(1, Number(v) || 0)); nativeVolume.set.call(audio, wantVolume); applyMute(); },"),
])
edit('nocturne.js', [
    ("  if (!document.documentElement.classList.contains('is-mobile')) return;",
     "  if (!document.documentElement.classList.contains('is-mobile') && !document.documentElement.classList.contains('is-desktop')) return;"),
    # the first-launch tips: a mouse and keyboard instead of swipes and taps
    ("      <ul>\n        <li><b>Swipe the artwork</b>",
     "      <ul>${document.documentElement.classList.contains('is-desktop') ? DESKTOP_TIPS : ''}${document.documentElement.classList.contains('is-desktop') ? '' : `\n        <li><b>Swipe the artwork</b>"),
    ("        <li><b>Autoplay</b> follows the song and its genre, not its name. Change it in Settings → Tracks.</li>\n      </ul>",
     "        <li><b>Autoplay</b> follows the song and its genre, not its name. Change it in Settings → Tracks.</li>`}\n      </ul>"),
    ("  const WELCOME_KEY = 'nocturne_welcome_v2';",
     """  const WELCOME_KEY = 'nocturne_welcome_v2';
  const DESKTOP_TIPS = `
        <li><b>Keyboard</b>: Space plays and pauses. Ctrl + ← → skips, Ctrl + ↑ ↓ changes the volume, Shift + ← → jumps 5 seconds, M mutes, / jumps to search, Ctrl + K opens quick commands.</li>
        <li><b>Sound</b>: equalizer, moods, upscaler and effects are in the Audio button at the bottom right. Changes are instant. Hold Compare to hear the difference.</li>
        <li><b>Mini player</b>: the small-window button at the top right keeps Sine on top of everything else.</li>
        <li><b>Sliders</b>: click or drag anywhere on one. Double-click an equalizer slider to set it back to 0.</li>
        <li><b>Autoplay</b> follows the song and its genre, not its name. Change it in Settings → Tracks.</li>`;"""),
])
# the PC fetches songs itself and keeps them as they came: nothing upgrades in the background
edit('nocturne.js', [
    (" Songs you’ve already saved upgrade in the background when you play them.", " Songs you’ve already saved stay as they are."),
])
# the Spotify login on a PC: the browser opens, and Windows hands the muriel:// answer back to Sine
edit('extras.js', [
    ("Then tap Log in below. Safari opens, you approve, and it comes back here.",
     "${document.documentElement.classList.contains('is-desktop') ? 'Then click Log in below. Your browser opens; approve, and when the browser asks to open Sine, allow it.' : 'Then tap Log in below. Safari opens, you approve, and it comes back here.'}"),
])
# downloads with "Apply current audio effects": Sine's own sound engine renders them on the PC (the original
# desktop engine is switched off, so its settings were all defaults)
edit('app.js', [
    ("          finalBuffer = await audioEngine.renderOffline(bufferToProcess, currentSettings);",
     "          const sineFx = document.documentElement.classList.contains('is-desktop') && window.MurielPhoneFx;\n"
     "          if (sineFx) { const s = sineFx.current(t); finalBuffer = sineFx.isActive(s) ? await sineFx.render(bufferToProcess, s, sineFx.detectCutoff(bufferToProcess)) : bufferToProcess; }\n"
     "          else finalBuffer = await audioEngine.renderOffline(bufferToProcess, currentSettings);"),
])
# a PC "shares" by copying to the clipboard: say so where the page didn't
edit('extras.js', [
    ("      if (api2 && api2.shareText) await api2.shareText('Listen together', text);",
     "      if (api2 && api2.shareText) { if (await api2.shareText('Listen together', text) === 'copied') toast('Invite copied', 'success'); }"),
])
edit('encore.js', [
    ("    if (api && api.shareText) { await api.shareText(I18n.T('My Sine Encore'), text); return; }",
     "    if (api && api.shareText) { if (await api.shareText(I18n.T('My Sine Encore'), text) === 'copied' && window.MurielCore) window.MurielCore.toast(I18n.Tm('Copied your Encore')); return; }"),
])
# the PC version's own number and notes (the iPhone's are about the iPhone)
pc_version = json.load(open(os.path.join(here, '..', 'package.json'), encoding='utf-8'))['version']
edit('build-info.js', [(re.compile(r'"version": "[^"]*"'), f'"version": "{pc_version}"')])
edit('extras.js', [
    ("  const WHATS_NEW = [\n",
     "  const WHATS_NEW = document.documentElement.classList.contains('is-desktop') ? [\n"
     "    'A graphics driver crash no longer closes Sine; if it keeps happening Sine restarts without hardware acceleration',\n"
     "    'The Audio panel is lighter to draw (no live blur behind it)',\n"
     "    'Fixed: sliding the sound sliders fast no longer floods the sound engine (it hears the slider about 12 times a second, and where you let go)',\n"
     "    'The player bar visualizer is back, behind the controls on the right, clear of the progress bar',\n"
     "    'Song menus are solid, so the page no longer shows through them',\n"
     "    'Fixed: the visualizer no longer runs behind the progress bar',\n"
     "    'If the page or graphics ever crash, Sine comes straight back and notes why in its log',\n"
     "    'Spotify song links work, in Import and pasted into search',\n"
     "    'Log in to Spotify on the PC with the same Redirect URI as your iPhone (muriel://spotify-callback)',\n"
     "    'Search Spotify with your own developer key (Settings, Integrations)',\n"
     "    'Sync, listen-along and shared playlist links open straight in Sine',\n"
     "    'Downloads in MP3, FLAC, M4A, Opus or WAV, with your sound settings if you like',\n"
     "    'Streaming quality and your chosen output device now apply to everything Sine plays',\n"
     "    'The Spotify source button and song names no longer get cut off, and the window fits smaller screens',\n"
     "  ] : [\n"),
])
print('renderer ready:', dst)
