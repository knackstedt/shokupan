# Contributing to Shokupan 🍞

Thank you for your interest in contributing to Shokupan! We're excited to have you join our community. This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

Before you begin:
- Make sure you have [Bun](https://bun.sh/) installed (v1.3.0 or higher recommended)
- Familiarize yourself with the [documentation](https://shokupan.dev)
- Check existing [issues](https://github.com/knackstedt/shokupan/issues) and [pull requests](https://github.com/knackstedt/shokupan/pulls)

## Development Setup

1. **Fork the repository**
   ```bash
   # Click the "Fork" button on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/shokupan.git
   cd shokupan
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up the development environment**
   ```bash
   # Start the development server
   bun run dev
   
   # Or run tests
   bun test
   ```

4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

## How to Contribute

There are many ways to contribute to Shokupan:

### 🐛 Bug Fixes
- Fix bugs reported in [issues](https://github.com/knackstedt/shokupan/issues)
- Add regression tests for fixed bugs

### ✨ New Features
- Implement features from the [roadmap](https://shokupan.dev/reference/roadmap)
- Propose and implement new features (where possible, discuss in an issue first)

### 📚 Documentation
- Improve existing documentation
- Add examples and tutorials
- Fix typos and clarify confusing sections

### 🧪 Testing
- Add test coverage for untested code
- Improve existing tests
- Add integration tests

### 🔌 Plugins
- Create new plugins
- Improve existing plugins
- Add plugin documentation

### 🎨 Developer Experience
- Improve error messages
- Enhance the debug dashboard
- Optimize performance

## Development Workflow

### Project Structure

```
shokupan/
├── src/                   # Source code
│   ├── decorators/        # Decorator implementations
│   ├── plugins/           # Built-in plugins
│   ├── cli/               # CLI tool
│   └── test/              # Integration tests
├── src/88/8.spec.ts       # Unit tests
├── client/                # Dashboard (Angular)
├── docs/                  # Documentation site (Starlight)
├── examples/              # Example applications
├── benchmarking/          # Performance benchmarks
└── scripts/               # Build and utility scripts
```

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test src/context.spec.ts

# Run tests with coverage
bun test --coverage
```

### Running Benchmarks

The benchmarking suite is designed to be comprehensive and can take a significant amount of time to run, especially when selecting all benchmarks. It's recommended to run specific benchmarks or a subset of benchmarks to avoid long wait times. If you open an issue that benchmarking takes too long, please specify which benchmarks you ran and how long they took. If you have suggestions for improving benchmark performance, please share them in an issue or PR.

```bash
# Run standard benchmarks
bun run bench

# Run advanced benchmarks
bun run bench:advanced
```

### Building the Project

This section is a WIP due to the new Angular client dashboard. The build process is not yet fully documented.

```bash
# Build the library
bun run build

# Build the client dashboard
bun run build:client
```

### Working on Documentation

```bash
# Start the documentation dev server
bun run docs
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Provide proper type annotations
- Avoid `any` types when possible
- Do not use `var` keyword
- Use `const` for immutable variables
- Use `let` for mutable variables
- Use arrow functions for as much as possible
- Use template literals for string concatenation
- Do not use for...of loops for array iteration
- Do not use for...in loops for object iteration
- Do not use `eval`

### Code Style

- Follow the existing code style
- Use 4 spaces for indentation
- Use meaningful variable and function names
- Keep functions small and focused
- Add JSDoc comments for public APIs (@param and @return tags are optional, as they may be redundant)

### Example

```typescript
/**
 * Registers a new route handler for GET requests
 * @param path - The route path pattern
 * @param handler - The request handler function
 * @returns The application instance for chaining
 */
public get(path: string, handler: RouteHandler): this {
    return this.route('GET', path, handler);
}
```

## Testing

### Test Requirements

- All new features must include tests
- Bug fixes should include regression tests
- Aim for high test coverage (>80%)
- Tests should be clear and maintainable

### Test Structure

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan } from '../index';

describe('Feature Name', () => {
    it('should do something specific', async () => {
        const app = new Shokupan();
        
        // Arrange
        app.get('/test', (ctx) => ({ success: true }));
        
        // Act
        const response = await app.request('/test');
        
        // Assert
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
    });
});
```

## Documentation

### Documentation Guidelines

- Update documentation for any API changes
- Add examples for new features
- Keep documentation clear and concise
- Use proper Markdown formatting
- Include code examples that work

### Documentation Structure

Documentation is located in the `docs/` directory and uses Starlight:

```
docs/src/content/docs/
├── core/              # Core concepts
├── plugins/           # Plugin documentation
├── guides/            # How-to guides
├── migration/         # Migration guides
└── reference/         # API reference
```

## Commit Guidelines

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>: <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Examples

```bash
feat: add rate limiting plugin

Implements a new rate limiting plugin with support for:
- Multiple rate limit strategies
- Custom key generators
- Redis and in-memory stores

Closes #123
```

```bash
fix: handle trailing slashes correctly

Previously, routes with trailing slashes were not matched properly.
This fix normalizes paths before matching.

Fixes #456
```

## Pull Request Process

### Before Submitting

1. ✅ Ensure all tests pass (`bun test`)
2. ✅ Add tests for new features
3. ✅ Update documentation
4. ✅ Follow coding standards
5. ✅ Rebase on latest `main` branch
6. ✅ Write clear commit messages

### Submitting a Pull Request

1. **Push your changes**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a pull request**
   - Go to the [repository](https://github.com/knackstedt/shokupan)
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template

3. **PR Title Format**
   ```
   feat: Add awesome new feature
   fix: Resolve routing bug
   docs: Update contributing guide
   ```

4. **PR Description**
   - Describe what changes you made
   - Explain why you made them
   - Reference related issues
   - Include screenshots/examples if applicable

### Review Process

- Maintainers will review your PR
- Address any requested changes
- Once approved, a maintainer will merge your PR
- Your contribution will be included in the next release! 🎉

Remember, we are all volunteers here. Please be patient with the review process.

## Community

### Getting Help

- 📚 Read the [documentation](https://shokupan.dev)
- 💬 Join discussions in [GitHub Discussions](https://github.com/knackstedt/shokupan/discussions)
- 🐛 Report bugs in [GitHub Issues](https://github.com/knackstedt/shokupan/issues)

### Recognition

Contributors are recognized in:
- Release notes
- The project README
- GitHub's contributor graph

## License

By contributing to Shokupan, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to Shokupan! Your efforts help make web development more delightful for everyone. 🍞✨
