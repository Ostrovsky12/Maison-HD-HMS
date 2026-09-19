# Maison HD Finance — full source audit package

Generated: 2026-09-19

## Included

- Complete `artifacts/api-server` source tree.
- Complete `artifacts/maison-hd` frontend source tree.
- Complete `lib` tree, including OpenAPI, generated React client, generated Zod contracts, DB schemas and migrations.
- All API-server and shared DB migrations.
- Tests and Vitest configurations contained in the included source trees.
- Root `pnpm-lock.yaml`, workspace/package manifests and TypeScript configuration.
- Replit artifact/deployment configuration and repository scripts.
- Auth, authorization/permissions, encryption/signing and logger modules contained in the included trees.

## Repository observations

- No root `packages/` directory existed when this archive was generated.
- No Dockerfile, Docker Compose configuration or `.github/workflows` directory existed when this archive was generated.
- Replit deployment configuration is included through `.replit` and each artifact's `.replit-artifact/artifact.toml`.

## Excluded

- `.env` and `.env.*` files.
- Private keys, KEP containers and certificate keystores (`*.key`, `*.pem`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`).
- Database dumps and local database files.
- `node_modules`, build/dist, coverage and cache directories.
- ZIP/TAR archives, uploads, recordings, screenshots and customer-data directories.
- Production data and provider credentials.

## Integrity and inventory

- `FILE_MANIFEST.txt` lists every included file and its size.
- `SHA256SUMS.txt` contains a SHA-256 checksum for every packaged file.
- `SECRET-SCAN.txt` records the packaging-time secret scan result without exposing any secret values.
