#!/bin/bash
# Run the TUI client for Thesis Validator

cd "$(dirname "$0")/tui-client"

# Use NVM if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Run the TUI
npm run dev -- --server http://localhost:3000
