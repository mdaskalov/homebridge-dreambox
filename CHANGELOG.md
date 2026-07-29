# Change Log

All notable changes will be documented in this file.

## v3.1.1
- Updated dependencies

## v3.1.0
- Added prettier
- Reorganized sources
- Fixed: first bouquet channel could not be selected as input
- Fixed: connection errors were silently swallowed instead of logged
- Fixed: missing channels on homebridge 2.0
- Updated dependencies

## v3.0.2
- Sanitize channel names for HomeKit

## v3.0.1
- Better timeout recovery, detect unreachable device
- Updated dependencies

## v3.0.0
- Removed node v20 support (requires node 22 or 24)
- Updated github action versions, added eslint dependencies

## v2.3.3
- Updated dependencies
- Added Homebridge verification badge

## v2.3.2
- Added homebridge name

## v2.3.1
- Fixed power and volume updates
- Simplified characteristic bind

## v2.3.0
- Initialization rework
- Use fast-xml-parser instead of xml2js, defined response types
- Use built-in fetch with retries
- Updated node and homebridge version requirements
