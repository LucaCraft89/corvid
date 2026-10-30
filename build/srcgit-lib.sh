# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# srcgit: git on the Chromium tree that tracks only the files our patches
# touch. Source after config.sh. Never run "add -A" or "add ." without
# paths: that would add the whole 20 GB tree.
srcgit() {
    GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Corvid}" GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-corvid@localhost}" \
    GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-Corvid}" GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-corvid@localhost}" \
        git --git-dir="$SRCGIT" --work-tree="$SRC" -c core.hooksPath=/dev/null "$@"
}
