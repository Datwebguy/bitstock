#!/bin/sh
# Run once per clone/session: enables the repository's git hooks and shows the active identity.
# The owner identity itself must be set locally (it is not stored in the repository):
#   git config --local user.name  "<owner name>"
#   git config --local user.email "<owner email>"
set -e
cd "$(git rev-parse --show-toplevel)"
git config --local core.hooksPath .githooks
chmod +x .githooks/* scripts/setup-git.sh
echo "hooks enabled: $(git config --local core.hooksPath)"
echo "author identity: $(git var GIT_AUTHOR_IDENT | sed 's/ [0-9]* [+-][0-9]*$//')"
