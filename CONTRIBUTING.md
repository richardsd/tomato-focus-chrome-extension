# Contributing to Tomato Focus

Thank you for your interest in contributing to Tomato Focus! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/richardsd/tomato-focus-chrome-extension/issues) to avoid duplicates.

When you create a bug report, please include:

- **A clear and descriptive title**
- **Steps to reproduce** the problem
- **Expected behavior** and **actual behavior**
- **Screenshots** if applicable
- **Browser version** and operating system
- **Extension version**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **A clear and descriptive title**
- **Detailed description** of the proposed feature
- **Use cases** explaining why this would be useful
- **Mockups or examples** if applicable

### Pull Requests

We actively welcome your pull requests!

1. Fork the repository
2. Create a new branch from `main`: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Follow the [Coding Standards](#coding-standards)
5. Run linting and tests: `npm run lint`
6. Commit your changes with descriptive commit messages
7. Push to your fork
8. Submit a pull request to the `main` branch

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/richardsd/tomato-focus-chrome-extension.git
   cd tomato-focus-chrome-extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Load the extension in Chrome:**
   - Open `chrome://extensions/` in Chrome
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

4. **Make changes and test:**
   - Edit the source files
   - Reload the extension in `chrome://extensions/`
   - Test your changes thoroughly

## Coding Standards

This project uses ESLint, Stylelint, and Prettier to maintain code quality:

- **Indentation:** 4 spaces (enforced by EditorConfig and ESLint)
- **Line endings:** LF (Unix-style)
- **Quotes:** Single quotes for JavaScript
- **Semicolons:** Required

### Before Submitting

Always run linting before committing:

```bash
npm run lint
```

To automatically fix many linting issues:

```bash
npm run lint:fix
```

To format code:

```bash
npm run format
```

### IDE Setup

For the best development experience, install these extensions in your IDE:

- ESLint
- Stylelint
- Prettier
- EditorConfig

## Pull Request Process

1. **Update documentation** if you're changing functionality
2. **Run all linters:** `npm run lint`
3. **Test thoroughly** in Chrome and Edge if possible
4. **Describe your changes** clearly in the PR description
5. **Link related issues** using keywords (e.g., "Fixes #123")
6. **Be responsive** to feedback and questions

### Pull Request Guidelines

- Keep changes focused and atomic
- Write clear, descriptive commit messages
- Update README.md if adding new features
- Don't include unrelated changes
- Ensure no linting errors
- Test on multiple screen sizes if UI changes are involved

## Commit Message Guidelines

Use clear and meaningful commit messages:

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests when applicable

Examples:
- `fix: correct timer reset bug on break end`
- `feat: add task priority levels`
- `docs: update installation instructions`
- `style: format code with prettier`

## Questions?

Feel free to open an issue with the `question` label if you need help or clarification.

## License

By contributing, you agree that your contributions will be licensed under the GNU GPL v3.0 License.
