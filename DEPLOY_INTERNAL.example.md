# Internal Deployment Notes Example

This file is a template for local-only operational notes.

Do not commit real secrets to the repository. On the server, copy this file to:

```text
DEPLOY_INTERNAL.local.md
```

and fill in the real values there. Files ending in `.local.md` are ignored by Git.

## Suggested Contents

```text
- Current production URL
- Current server path
- Current docker compose command
- Current database password
- Current JWT secret
- Current frp token / dashboard password
- Any one-off operational notes
```
