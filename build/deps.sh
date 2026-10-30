#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Install build dependencies on Debian 13 (trixie). Same package list as
# helium-linux docker/build.Dockerfile, plus ccache, tmux, quilt, and tcpdump + tshark for build/privacy-gate.sh.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
SUDO=""; [ "$(id -u)" = 0 ] || SUDO=sudo

$SUDO apt-get -y update
$SUDO apt-get -y install bison ca-certificates curl debhelper desktop-file-utils flex gsettings-desktop-schemas-dev imagemagick \
  libasound2-dev libavcodec-dev libavformat-dev libavutil-dev libcap-dev libcups2-dev libcurl4-openssl-dev libdrm-dev \
  libegl1-mesa-dev libelf-dev libevent-dev libexif-dev libflac-dev libgbm-dev libgcrypt20-dev libgl1-mesa-dev libgles2-mesa-dev \
  libglew-dev libglib2.0-dev libglu1-mesa-dev libgtk-3-dev libhunspell-dev libjpeg-dev libjs-jquery-flot libjsoncpp-dev \
  libkrb5-dev liblcms2-dev libminizip-dev libmodpbase64-dev libnspr4-dev libnss3-dev libopenjp2-7-dev libopus-dev libpam0g-dev \
  libpci-dev libpipewire-0.3-dev libpng-dev libpulse-dev libre2-dev libsnappy-dev libspeechd-dev libudev-dev libusb-1.0-0-dev \
  libva-dev libvpx-dev libwebp-dev libx11-xcb-dev libxcb-dri3-dev libxshmfence-dev libxslt1-dev libxss-dev libxt-dev libxtst-dev \
  mesa-common-dev pkg-config python3-jinja2 python3-setuptools python3-xcbgen python-is-python3 qtbase5-dev \
  uuid-dev valgrind wdiff x11-apps xcb-proto xfonts-base xvfb xz-utils yasm zstd \
  git python3-pillow python3-requests rsync \
  ccache tmux quilt \
  tcpdump tshark
