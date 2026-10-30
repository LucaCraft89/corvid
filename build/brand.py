#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
"""Rebrand the Helium tree to the name in build/branding.conf.

Runs after Helium's own name substitution, translations and resources, so
it only has to turn "Helium" into our name:
  1. UI strings (.grd, .grdp, .xtb) through Helium's own substitution code,
     which also fixes the translation fingerprints;
  2. the BRANDING file;
  3. a short, checked list of code literals (URL scheme, binary name,
     profile folder, desktop file, environment variables);
  4. placeholder product icons.
Every code replacement must match, so a Helium change cannot slip by.

  brand.py --tree SRC --helium HELIUM_CHROMIUM_DIR [--config branding.conf]
"""

import argparse
import multiprocessing
import re
import shlex
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read_config(path):
    """KEY="value" lines, the same file the shell scripts source."""
    conf = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, _, value = line.partition('=')
        conf[key.strip()] = shlex.split(value)[0] if value.strip() else ''
    name = conf['PRODUCT_NAME']
    if not re.fullmatch(r'[A-Z][A-Za-z0-9]*', name):
        sys.exit(f'PRODUCT_NAME must be one word starting with a capital: {name!r}')
    lower = name.lower()
    return {
        'name': name,
        'lower': lower,
        'upper': name.upper(),
        'company': f'The {name} Authors',
        'app_id': f"{conf['APP_ID_PREFIX']}.{lower}",
        'url': conf['PROJECT_URL'],
    }


# Strings that name Helium's own services or project stay as they are.
KEEP = [r'Helium services', r"Helium's GitHub", r'Helium GitHub']


def string_regexes(b):
    """Replacement list in the shape name_substitution_utils expects."""
    regexes = []
    for keep in KEEP:
        regexes.append((keep, keep.replace('Helium', 'Helium_keep')))
    regexes += [
        (r'(\b)helium://', r'\1' + b['lower'] + '://'),
        (r'\bHelium\b', b['name']),
        (r'Helium_keep', 'Helium'),
    ]
    return [(re.compile(a), c) for a, c in regexes]


def code_replacements(b):
    """(file, old, new): every old literal must be present."""
    lo, up, name = b['lower'], b['upper'], b['name']
    return [
        # URL scheme: helium://settings -> corvid://settings
        ('content/public/common/url_constants.h',
         'kHeliumUIScheme[] = "helium"', f'kHeliumUIScheme[] = "{lo}"'),
        ('components/url_formatter/url_fixer.cc',
         'kHeliumUIScheme[] = "helium"', f'kHeliumUIScheme[] = "{lo}"'),
        ('components/omnibox/browser/builtin_provider.cc',
         'replace(0, 6, u"helium")', f'replace(0, 6, u"{lo}")'),
        ('chrome/browser/resources/tab_search/tab_search_item.ts',
         "protocol === 'helium:'", f"protocol === '{lo}:'"),
        ('chrome/browser/resources/tab_search/tab_search_item.ts',
         "createTextNode('helium://')", f"createTextNode('{lo}://')"),
        # Binary and crash handler names.
        ('chrome/BUILD.gn', '_chrome_output_name = "helium"', f'_chrome_output_name = "{lo}"'),
        ('chrome/BUILD.gn', '"$root_out_dir/helium', f'"$root_out_dir/{lo}'),
        ('chrome/installer/linux/BUILD.gn', '"$root_out_dir/helium', f'"$root_out_dir/{lo}'),
        ('components/crash/core/app/BUILD.gn',
         'output_name = "helium_crashpad_handler"', f'output_name = "{lo}_crashpad_handler"'),
        ('components/crash/core/app/crashpad_linux.cc',
         'Append("helium_crashpad_handler")', f'Append("{lo}_crashpad_handler")'),
        ('chrome/browser/memory_details_linux.cc',
         'process_name = u"helium"', f'process_name = u"{lo}"'),
        # Profile folder, desktop integration, environment variables.
        ('chrome/common/chrome_paths_linux.cc',
         '"net.imput.helium"', f'"{b["app_id"]}"'),
        ('chrome/common/chrome_paths_linux.cc', '"HELIUM_CONFIG_HOME"', f'"{up}_CONFIG_HOME"'),
        ('chrome/common/channel_info_posix.cc', '"HELIUM_DESKTOP"', f'"{up}_DESKTOP"'),
        ('chrome/common/channel_info_posix.cc', '"helium.desktop"', f'"{lo}.desktop"'),
        ('chrome/browser/shell_integration_linux.cc', 'return "helium";', f'return "{lo}";'),
        ('media/audio/pulse/pulse_util.cc',
         'kBrowserDisplayName[] = "helium"', f'kBrowserDisplayName[] = "{lo}"'),
        ('media/audio/pulse/pulse_util.cc',
         '#define PRODUCT_STRING "Helium"', f'#define PRODUCT_STRING "{name}"'),
        # Linux package metadata.
        ('chrome/installer/linux/common/chromium-browser.info', 'PACKAGE="helium"', f'PACKAGE="{lo}"'),
        ('chrome/installer/linux/common/chromium-browser.info', 'MENUNAME="Helium"', f'MENUNAME="{name}"'),
        ('chrome/installer/linux/common/chromium-browser.info', 'MAINTNAME="imput"',
         f'MAINTNAME="{b["company"]}"'),
        ('chrome/installer/linux/common/chromium-browser.info',
         'DEVELOPER_NAME="The Helium Authors"', f'DEVELOPER_NAME="{b["company"]}"'),
        ('chrome/installer/linux/common/chromium-browser.info',
         'PRODUCTURL="https://helium.computer"', f'PRODUCTURL="{b["url"]}"'),
        ('chrome/installer/linux/common/chromium-browser.info',
         'BUGTRACKERURL="https://github.com/imputnet/helium-linux/issues"',
         f'BUGTRACKERURL="{b["url"]}/issues"'),
        ('chrome/installer/linux/common/chromium-browser.info',
         'HELPURL="https://helium.computer/"', f'HELPURL="{b["url"]}"'),
        ('chrome/installer/linux/common/chromium-browser.info',
         'RDN="net.imput.helium"', f'RDN="{b["app_id"]}"'),
    ]


def brand_strings(tree, helium, b, workers):
    """Helium -> name in all UI strings, with translation IDs remapped."""
    sys.path.insert(0, str(Path(helium) / 'utils'))
    # pylint: disable=import-outside-toplevel,import-error
    import name_substitution_utils as util
    import name_substitution as namesub
    util.REPLACEMENT_REGEXES = string_regexes(b)
    # Worker processes must inherit the patched regexes.
    multiprocessing.set_start_method('fork', force=True)
    # ElementTree adds an XML declaration when it rewrites a file. Some
    # parsers (Helium's onboarding string generator) reject it, so files that
    # had none get none back.
    files = list(namesub.get_substitutable_files(Path(tree), ['grd', 'grdp']))
    bare = [f for f in files if not f.read_text(encoding='utf-8').lstrip().startswith('<?xml')]
    namesub.do_substitution(Path(tree), None, workers, False)
    decl = "<?xml version='1.0' encoding='utf-8'?>\n"
    for f in bare:
        text = f.read_text(encoding='utf-8')
        if text.startswith(decl):
            f.write_text(text[len(decl):], encoding='utf-8')


def brand_file(tree, b):
    lines = {
        'COMPANY_FULLNAME': b['company'],
        'COMPANY_SHORTNAME': b['company'],
        'PRODUCT_FULLNAME': b['name'],
        'PRODUCT_SHORTNAME': b['name'],
        'PRODUCT_INSTALLER_FULLNAME': f"{b['name']} Installer",
        'PRODUCT_INSTALLER_SHORTNAME': f"{b['name']} Installer",
        'COPYRIGHT': f"Copyright @LASTCHANGE_YEAR@ {b['company']}. All rights reserved.",
        'MAC_BUNDLE_ID': b['app_id'],
        'MAC_CREATOR_CODE': 'Cr24',
        'MAC_TEAM_ID': '',
    }
    path = Path(tree) / 'chrome/app/theme/chromium/BRANDING'
    path.write_text(''.join(f'{k}={v}\n' for k, v in lines.items()), encoding='utf-8')
    print(f'Wrote {path}')


def brand_code(tree, b):
    failed = []
    for rel, old, new in code_replacements(b):
        path = Path(tree) / rel
        text = path.read_text(encoding='utf-8')
        if old not in text:
            if new in text:
                continue  # already branded
            failed.append(f'{rel}: {old!r} not found')
            continue
        path.write_text(text.replace(old, new), encoding='utf-8')
        print(f'Branded {rel}: {old} -> {new}')
    if failed:
        sys.exit('brand.py: these Helium literals moved, update code_replacements():\n  '
                 + '\n  '.join(failed))


def placeholder_icon(size, mono=False):
    """A plain mark: dark disc with a light crescent. No font needed."""
    # pylint: disable=import-outside-toplevel
    from PIL import Image, ImageDraw
    scale = 4
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    disc = (255, 255, 255, 255) if mono else (32, 40, 48, 255)
    mark = (0, 0, 0, 0) if mono else (120, 200, 190, 255)
    d.ellipse((0, 0, s - 1, s - 1), fill=disc)
    d.ellipse((s * 0.22, s * 0.22, s * 0.78, s * 0.78), fill=mark)
    d.ellipse((s * 0.36, s * 0.18, s * 0.92, s * 0.74), fill=disc)
    return img.resize((size, size), Image.LANCZOS)


PLACEHOLDER_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="32" fill="#202830"/>
<circle cx="32" cy="32" r="18" fill="#78c8be"/>
<circle cx="41" cy="29" r="18" fill="#202830"/>
</svg>
'''


def brand_icons(tree, helium):
    """Replace the product logo files with same-size placeholders."""
    # pylint: disable=import-outside-toplevel
    from PIL import Image
    tree = Path(tree)
    targets = set(tree.glob('chrome/app/theme/chromium/product_logo_*.png'))
    targets |= set(tree.glob('chrome/app/theme/chromium/linux/product_logo_*.png'))
    listing = Path(helium) / 'resources/helium_resources.txt'
    for line in listing.read_text(encoding='utf-8').splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0].startswith('branding/') and parts[1].endswith('.png'):
            targets.add(tree / parts[1])
    count = 0
    for path in sorted(targets):
        if not path.exists():
            continue
        with Image.open(path) as old:
            width = old.size[0]
        placeholder_icon(width, mono='mono' in path.name or 'white' in path.name).save(path)
        count += 1
    (tree / 'chrome/app/theme/chromium/product_logo.svg').write_text(PLACEHOLDER_SVG)
    print(f'Replaced {count} product icons with placeholders')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tree', required=True)
    ap.add_argument('--helium', required=True, help='helium-chromium checkout')
    ap.add_argument('--config', default=str(HERE / 'branding.conf'))
    ap.add_argument('--workers', type=int, default=multiprocessing.cpu_count())
    args = ap.parse_args()
    b = read_config(args.config)
    if not (Path(args.tree) / 'OWNERS').exists():
        sys.exit('wrong src directory')
    brand_code(args.tree, b)
    brand_file(args.tree, b)
    brand_strings(args.tree, args.helium, b, args.workers)
    brand_icons(args.tree, args.helium)


if __name__ == '__main__':
    main()
