# Deployment Rollback Plan

Version: 1.0.0

This repository primarily documents local package, route, template, and report workflows. Public demo deployment must be treated separately from local build evidence.

## Rollback Rules

1. Keep the previous package artifact or hosted demo build available until the new one has passed smoke checks.
2. Verify the public URL or package install path, not just the local dev server.
3. If a deployment report, route health report, screenshot, or package smoke report fails, roll back to the last known passing artifact.
4. Update public docs only after the deployed artifact and docs point to the same version and evidence.

## Evidence

Deployment evidence should include:

- package version;
- git revision;
- build command;
- URL or package artifact path;
- smoke-test command and result;
- known unsupported browsers/devices.

## Boundary

Local examples and local static exports are not public deployment evidence by themselves.
