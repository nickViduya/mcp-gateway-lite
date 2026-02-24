# Security Policy

## Supported Versions

Only the latest `main` branch and latest tagged release are supported for security fixes.

## Reporting a Vulnerability

Please do not open public issues for vulnerabilities.

Report privately with:

- Affected component/path
- Reproduction steps or PoC
- Impact assessment
- Suggested remediation (optional)

Use GitHub private vulnerability reporting through the repository Security tab.

## Response Targets

- Initial acknowledgement: within 2 business days
- Triage decision: within 5 business days
- Patch timeline: based on severity

## Security Controls in This Project

- AES-256-GCM credential encryption with HKDF key derivation
- Gateway identity derived from authenticated context only
- OAuth PKCE (`S256`) and state validation
- Origin validation middleware
- SSRF protection for OAuth metadata/token endpoints
- Auth endpoint rate limiting
- Log redaction for sensitive fields
