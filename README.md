# Pomodoro Timer Chrome Extension

A configurable Pomodoro timer extension for Chrome that helps boost productivity by implementing the Pomodoro Technique. This extension provides a beautiful, intuitive interface with customizable timing, notifications, and visual feedback to help you maintain focus during work sessions and ensure you take proper breaks.

## Features

### 🍅 Core Timer Functionality
- **Work Sessions**: Default 25-minute focused work periods
- **Short Breaks**: 5-minute breaks between work sessions
- **Long Breaks**: 15-minute extended breaks after a set number of sessions
- **Visual Progress**: Circular progress ring with smooth countdown animation
- **Session Counter**: Track your completed Pomodoro sessions

### ⚙️ Customizable Settings
- **Flexible Durations**: Adjust work, short break, and long break durations (1-60 minutes)
- **Break Intervals**: Configure how many sessions before a long break (1-10 sessions)
- **Auto-Start**: Option to automatically start the next period
- **Theme Options**: Light and dark theme support
- **Persistent Settings**: All preferences saved and restored between sessions

### 🔔 Smart Notifications
- **Browser Notifications**: Get notified when sessions end, even when the popup is closed
- **Cross-Platform Support**: Works on Windows, macOS, and Linux
- **Permission Guidance**: Built-in help for enabling notifications on different systems

### 🎯 Advanced Features
- **Badge Display**: See remaining time directly on the extension icon
- **Context Menu Actions**: Right-click the extension for quick controls
- **Quick Timers**: Start preset timers (5, 15, 25, 45 minutes) from context menu
- **Skip Break**: Option to skip break periods when needed
- **Session Persistence**: Timer state maintained across browser restarts

### 🎨 Beautiful Interface
- **Modern Design**: Clean, minimalist interface with smooth animations
- **Responsive Layout**: Optimized for the Chrome extension popup
- **Visual Feedback**: Different colors and icons for work vs. break modes
- **Tomato Icons**: Themed icons that change based on session type

## Installation

### From Chrome Web Store (Recommended)
*Note: This extension is currently in development. Installation from the Chrome Web Store will be available upon publication.*

### Manual Installation (Development)
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory
5. The Pomodoro Timer icon should appear in your Chrome toolbar

## Usage

### Basic Operation
1. **Start Timer**: Click the extension icon and press "Start" to begin a 25-minute work session
2. **Pause/Resume**: Click "Pause" to pause the timer, or "Resume" to continue
3. **Reset**: Click "Reset" to restart the current session
4. **Break Management**: When a break starts, you can skip it or let it complete naturally

### Settings Configuration
1. Click the gear icon in the extension popup
2. Adjust the following settings:
   - **Work Duration**: Length of work sessions (default: 25 minutes)
   - **Short Break**: Length of short breaks (default: 5 minutes)  
   - **Long Break**: Length of long breaks (default: 15 minutes)
   - **Sessions before Long Break**: Number of work sessions before a long break (default: 4)
   - **Auto-start next period**: Automatically begin the next timer when one ends
   - **Light Theme**: Switch between dark and light visual themes
3. Click "Save Settings" to apply changes

### Context Menu Features
Right-click the extension icon to access:
- **Start/Pause Timer**: Quick timer control
- **Reset Timer**: Restart current session
- **Skip Break**: Available during break periods
- **Quick Start Timers**: Start preset timers without opening the popup
  - 5 minutes
  - 15 minutes
  - 25 minutes (Standard Pomodoro)
  - 45 minutes

### Notifications Setup
For the best experience, ensure notifications are enabled:

**On macOS:**
1. Open System Preferences → Notifications & Focus
2. Find Google Chrome in the list
3. Enable "Allow Notifications"

**On Windows/Linux:**
1. Check your system notification settings
2. Ensure Chrome is allowed to send notifications

## Technical Details

### Browser Compatibility
- **Chrome**: Version 88+ (Manifest V3 compatible)
- **Edge**: Version 88+ (Chromium-based)
- **Other Chromium browsers**: Should work with Manifest V3 support

### Permissions
The extension requests the following permissions:
- **notifications**: To alert you when sessions end
- **storage**: To save your settings and timer state
- **alarms**: For accurate timing (currently unused, reserved for future features)
- **contextMenus**: For right-click menu functionality

### Architecture
- **Manifest V3**: Uses the latest Chrome extension architecture
- **Service Worker**: Background script for timer logic and persistence
- **Popup Interface**: HTML/CSS/JavaScript for the main UI
- **Local Storage**: Settings and state persistence using Chrome storage API

## Development

### Project Structure
```
pomodoro-chrome-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Main UI interface  
├── popup.js              # Frontend logic and UI handling
├── background.js         # Service worker with timer logic
├── styles.css            # Visual styling and themes
├── icons/                # Extension icons and graphics
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── icon.svg
│   ├── green-icon.svg
│   └── settings-icon.svg
├── docs/                 # Documentation screenshots
│   ├── timer_screen.png
│   └── settings_screen.png
├── LICENSE               # GPL v3 license
└── README.md            # This file
```

### Building and Testing
1. Make changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test functionality by clicking the extension icon
4. Check the background script console for any errors
5. Verify notifications work correctly

### Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit with descriptive messages
5. Push to your fork and submit a pull request

### Code Style
- Use modern JavaScript (ES6+)
- Follow consistent indentation (4 spaces)
- Include comments for complex logic
- Test across different Chrome versions

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Based on the Pomodoro Technique developed by Francesco Cirillo
- Icons and design inspired by the traditional tomato timer
- Built with modern web technologies and Chrome Extension APIs

## Support

If you encounter any issues or have suggestions for improvements:
1. Check the [Issues](../../issues) page for existing reports
2. Create a new issue with detailed information about the problem
3. Include your Chrome version and operating system details

---

**Happy Productivity!** 🍅⏰
