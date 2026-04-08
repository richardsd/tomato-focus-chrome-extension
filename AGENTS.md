# Agent Instructions

These instructions apply to the entire repository.

## Required checks
- When you make code or documentation changes, you must run `npm run lint` before finalizing your work.
- Report the lint command result in your final response.
- Always run `npm run test` before finalizing your work when changes are made.

## Commit message requirements
- AI agents must use [Conventional Commits](https://www.conventionalcommits.org/) for every commit.
- Use a commit header in the form: `type(scope): short summary`.
- Allowed `type` values include: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, and `ci`.
- Mark breaking changes with either a `!` in the header (for example, `feat(api)!: remove v1 endpoint`) or a `BREAKING CHANGE:` footer.
- Keep the summary concise and imperative so semantic-release can determine the correct version bump.
