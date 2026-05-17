---
auto_execution_mode: 2
---
Security audit the codebase:

Check for:
1. Injection: SQL, NoSQL, command, LDAP
2. Auth/AuthZ: Session handling, privilege escalation, token issues
3. Data exposure: Logging secrets, error messages, API responses
4. Input validation: Missing sanitization, type coercion, length limits
5. Cryptography: Weak algorithms, hardcoded secrets, improper key handling

Assume an attacker with knowledge of our stack.