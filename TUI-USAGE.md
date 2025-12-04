# TUI Client Usage Guide

## Starting the TUI

From the project root:
```bash
./run-tui.sh
```

Or manually:
```bash
cd tui-client
npm run dev
```

## Key Bindings

### Global Controls
- `1-5`: Switch between tabs
- `Q` or `Ctrl+C`: Quit the application

### Engagements Tab (Tab 1)

#### Navigation
- `↑` / `↓`: Navigate up/down through the engagement list
- The selected engagement is highlighted in cyan with a `▸` indicator

#### Actions
- `N`: Create new engagement (coming soon)
- `E`: Edit selected engagement (coming soon)
- `D`: Delete selected engagement (coming soon)
- `Enter`: View engagement details (coming soon)

**Visual Feedback**: When you press a key, a message appears showing what action was triggered.

### Research Tab (Tab 2)
- Navigation and research controls (to be documented)

### Other Tabs (3-5)
- Currently show placeholder content

## Features

### Real-time Status
- Header shows connection status (✓ Online / ✗ Offline)
- Server URL displayed in header
- Engagement list auto-refreshes from backend

### Engagement Display
- Name and target company
- Status with color coding:
  - Yellow: Active research
  - Green: Complete
  - Blue: Done
  - Red: Failed
  - Gray: Pending
- Creation date
- Sortable table view

## Troubleshooting

### UI keeps reloading
- Make sure you're using `npm run dev` (not `npm run dev:watch`)
- The TUI should be stable without file watching

### Key bindings not working
- Ensure your terminal supports raw mode
- Try pressing keys on the active tab (Engagements = Tab 1)
- Look for visual feedback (highlighted selection, status messages)

### Connection errors
- Ensure the backend is running on http://localhost:3000
- Check that `thesis-validator` API server is started
- Verify the health check endpoint: `curl http://localhost:3000/health`
