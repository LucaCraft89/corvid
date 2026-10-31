#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# A tiny stand-in for xdg-desktop-portal on a private session bus, for
# browser-check.mjs: answers the Settings reads Chromium makes (accent-color,
# color-scheme) and lets the test change the accent colour, which sends the
# same SettingChanged signal a desktop sends.
#
#   fake-portal.py R G B        start with this accent (0..1 each)
#   change it:   dbus-send --session --type=method_call --dest=org.freedesktop.portal.Desktop \
#                  /org/freedesktop/portal/desktop org.corvid.Test.SetAccent \
#                  double:R double:G double:B
import sys

import dbus
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib

NS = 'org.freedesktop.appearance'
SETTINGS = 'org.freedesktop.portal.Settings'


class Portal(dbus.service.Object):
    def __init__(self, bus, accent):
        super().__init__(bus, '/org/freedesktop/portal/desktop')
        self.accent = accent

    def _value(self, namespace, key):
        if namespace == NS and key == 'accent-color':
            return dbus.Struct([dbus.Double(c) for c in self.accent], signature='ddd')
        if namespace == NS and key == 'color-scheme':
            return dbus.UInt32(0)  # no preference
        raise dbus.exceptions.DBusException('not found', name='org.freedesktop.portal.Error.NotFound')

    @dbus.service.method(dbus.PROPERTIES_IFACE, in_signature='ss', out_signature='v')
    def Get(self, interface, prop):
        return dbus.UInt32(2 if interface == SETTINGS else 4, variant_level=1)

    @dbus.service.method('org.freedesktop.host.portal.Registry', in_signature='sa{sv}', out_signature='')
    def Register(self, app_id, options):
        pass

    @dbus.service.method(SETTINGS, in_signature='ss', out_signature='v')
    def Read(self, namespace, key):
        # The old Read() wraps the value in a second variant.
        v = self._value(namespace, key)
        if isinstance(v, dbus.Struct):
            return dbus.Struct(v, signature='ddd', variant_level=2)
        return type(v)(v, variant_level=2)

    @dbus.service.method(SETTINGS, in_signature='ss', out_signature='v')
    def ReadOne(self, namespace, key):
        return self._value(namespace, key)

    @dbus.service.signal(SETTINGS, signature='ssv')
    def SettingChanged(self, namespace, key, value):
        pass

    @dbus.service.method('org.corvid.Test', in_signature='ddd', out_signature='')
    def SetAccent(self, r, g, b):
        self.accent = (r, g, b)
        self.SettingChanged(NS, 'accent-color', dbus.Struct([dbus.Double(c) for c in self.accent], signature='ddd', variant_level=1))


def main():
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    accent = tuple(float(x) for x in sys.argv[1:4]) if len(sys.argv) >= 4 else (0.2, 0.6, 0.2)
    name = dbus.service.BusName('org.freedesktop.portal.Desktop', bus)
    Portal(bus, accent)
    print('ready', flush=True)
    GLib.MainLoop().run()
    del name


if __name__ == '__main__':
    main()
