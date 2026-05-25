# Security Policy

## Supported versions

`@bitrix24/b24rabbitmq` is pre-`v0.1` and under active development. Security
fixes are applied to the latest published version on the `main` branch only.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

This library moves application messages (including dead-letter payloads), so a
vulnerability here can affect downstream Bitrix24 integrations.
Report privately via GitHub's
[private vulnerability reporting](https://github.com/bitrix24/b24rabbitmq/security/advisories/new)
("Report a vulnerability" on the repository **Security** tab).

Please include:

- a description of the issue and its impact,
- the affected version(s) of `@bitrix24/b24rabbitmq` and `amqplib`,
- steps to reproduce or a proof of concept, if available.

We will acknowledge your report, investigate, and coordinate a fix and
disclosure timeline with you. Please give us a reasonable window to address
the issue before any public disclosure.
