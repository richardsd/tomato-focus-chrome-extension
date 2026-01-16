# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Tomato Focus seriously. If you discover a security vulnerability, please follow these steps:

### Please Do Not

- **Do not** open a public GitHub issue for security vulnerabilities
- **Do not** disclose the vulnerability publicly until it has been addressed

### Please Do

1. **Report privately:** Create a private security advisory on GitHub:
   - Go to the [Security tab](https://github.com/richardsd/tomato-focus-chrome-extension/security)
   - Click "Report a vulnerability"
   - Fill in the details of the vulnerability

2. **Include details:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
   - Your contact information (optional)

3. **Response time:**
   - We will acknowledge your report within 48 hours
   - We will provide an estimated timeline for a fix
   - We will keep you informed of our progress

### What to Expect

- **Initial Response:** Within 48 hours
- **Status Updates:** Regular updates on the progress of addressing the issue
- **Disclosure:** We will work with you to determine an appropriate disclosure timeline
- **Credit:** We will credit you for the discovery (unless you prefer to remain anonymous)

## Security Best Practices for Users

When using Tomato Focus:

1. **Jira Credentials:**
   - Only enter your Jira credentials if you use the Jira integration
   - Use Jira API tokens, not passwords
   - Credentials are stored locally in your browser only

2. **Permissions:**
   - Review the extension permissions before installing
   - The extension only requests permissions necessary for its functionality

3. **Updates:**
   - Keep the extension updated to the latest version
   - Review the release notes for security fixes

4. **Data Privacy:**
   - All data is stored locally in your browser
   - No data is transmitted to external servers (except to Jira when you initiate a sync)
   - See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for more details

## Known Security Considerations

### Extension Permissions

Tomato Focus requires the following permissions:

- `notifications`: To show timer alerts
- `storage`: To save settings and task data locally
- `alarms`: To schedule timer events
- `contextMenus`: To add right-click menu options
- `idle`: To detect when your system is idle
- `offscreen`: To play notification sounds
- `*://*/*` (optional): Required only if you use Jira integration

### Data Storage

- All data is stored locally using Chrome's storage API
- Jira credentials are stored in `chrome.storage.local` (not synced across devices)
- No telemetry or analytics data is collected

### Third-Party Integrations

- **Jira:** When you enable Jira sync, your credentials are sent directly to your Jira instance
- No intermediary servers are used
- Communication uses HTTPS

## Security Updates

Security updates will be released as soon as possible after a vulnerability is confirmed. Users will be notified through:

- GitHub Security Advisories
- Release notes
- Extension update notifications (via Chrome Web Store)

## Questions?

If you have questions about this security policy, please open a GitHub issue with the `question` label (for non-sensitive inquiries only).
