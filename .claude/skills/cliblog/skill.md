---
name: cliblog
description: CLIBLOG skill for Claude Code. Register, post, upload images, and manage posts via API.
---

# CLIBLOG Skill (Claude Code)

## Language policy

- Respond in the user's language (English or Japanese).
- 日本語のユーザーには日本語で返答する。
- If the language is unclear, ask which they prefer.
- Keep replies concise and action-oriented.

## Overview

CLIBLOG is a CLI-first blog API. This skill helps users register, create posts, upload images, and manage content from their own terminal.

Email is optional and **not used for login**.

## Config file

Path: `~/.config/cliblog/config.json`

Example:

```json
{
  "apiUrl": "https://blog.dreamcore.gg",
  "apiKey": "sk_blog_***",
  "subdomain": "your-subdomain",
  "blogUrl": "https://your-blog.example"
}
```

Notes:

- **Never show the API key** in output or logs.
- Always use `blogUrl` from the config. **Do not construct it yourself**.
- For self-hosted instances, `apiUrl` will be different; always read it from the config.

## Setup (registration)

When the user says "I want to start a blog" or "Register me":

0. Set `API_URL`:
   - If config exists, use `config.apiUrl`.
   - If config is missing, use the default instance (`https://blog.dreamcore.gg`) unless the user provided another URL.

1. Check for config:
   ```bash
   cat ~/.config/cliblog/config.json 2>/dev/null
   ```
   If config exists and has valid apiKey, skip registration.

2. If no config, ask for:
   - Subdomain (required; lowercase letters, numbers, hyphen; must start with a letter)
   - Email (optional; not used for login)

3. Call register:
   ```bash
   curl -s -X POST "${API_URL}/v1/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"email":"USER_EMAIL","subdomain":"USER_SUBDOMAIN"}'
   ```
   - If the user skips email, **omit the email field**.

4. Save config with the response values:
   ```bash
   mkdir -p ~/.config/cliblog
   cat > ~/.config/cliblog/config.json << 'EOF'
   {
     "apiUrl": "${API_URL}",
     "apiKey": "RESPONSE.data.attributes.apiKey",
     "subdomain": "RESPONSE.data.attributes.subdomain",
     "blogUrl": "RESPONSE.data.attributes.blogUrl"
   }
   EOF
   ```

5. Reply with the returned `blogUrl` only.

## Create and publish a post

When the user asks to write or publish a post:

1. Read config (do not reveal `apiKey`) and set `API_URL` and `API_KEY`.
2. Generate Markdown content.
3. Create post:
   ```bash
   curl -s -X POST "${API_URL}/v1/posts" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Post title",
       "slug": "url-friendly-slug",
       "content": "# Heading\n\nBody..."
     }'
   ```
4. Publish:
   ```bash
   curl -s -X POST "${API_URL}/v1/posts/${POST_ID}/publish" \
     -H "Authorization: Bearer ${API_KEY}"
   ```
5. Reply with:
   ```
   ${blogUrl}/${slug}
   ```

## Image upload

If the user wants to include an image:

1. Upload asset:
   ```bash
   curl -s -X POST "${API_URL}/v1/assets" \
     -H "Authorization: Bearer ${API_KEY}" \
     -F "file=@/path/to/image.png" \
     -F "type=image"
   ```
2. Use the returned `markdownRef`, e.g.:
   ```markdown
   ![alt text](asset:ASSET_ID)
   ```
3. Include it in the post Markdown, then create/publish as usual.

## List posts

```bash
curl -s "${API_URL}/v1/posts" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Delete a post

```bash
curl -s -X DELETE "${API_URL}/v1/posts/${POST_ID}" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Account deletion

If the user wants to delete their account:

1. Confirm explicitly: require `delete my account`.
2. Call:
   ```bash
   curl -s -X DELETE "${API_URL}/v1/auth/account" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"confirm":"delete my account"}'
   ```
3. Remove config:
   ```bash
   rm -f ~/.config/cliblog/config.json
   ```
4. Inform the user.

Note: `account:delete` permission is required (initial key includes it).

## API key management (optional)

If the user asks to create/rotate keys:

- Create key (requires `keys:manage`):
  ```bash
  curl -s -X POST "${API_URL}/v1/auth/keys" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"name":"Read Only","permissions":"posts:read,assets:read"}'
  ```
- List keys:
  ```bash
  curl -s "${API_URL}/v1/auth/keys" \
    -H "Authorization: Bearer ${API_KEY}"
  ```
- Revoke key:
  ```bash
  curl -s -X DELETE "${API_URL}/v1/auth/keys/${KEY_ID}" \
    -H "Authorization: Bearer ${API_KEY}"
  ```

Never display key secrets after creation.

## Error handling

- `auth.subdomain_taken`: Subdomain already used.
- `auth.invalid_email`: Invalid email (only when provided).
- `auth.email_taken`: Email already registered (only when provided).
- `auth.invalid_subdomain`: Must be 3–30 lowercase letters, digits, hyphen, start with a letter.
- `auth.insufficient_permissions`: Missing required permission.
- `auth.privilege_escalation`: Attempted permission escalation.
- `auth.invalid_permissions`: Invalid permissions string.
- `posts.not_found`: Post not found.
- `assets.invalid_type`: Only `image` is allowed.

## Security

- Never print `apiKey`.
- Never echo config contents.
- Keep command output minimal.
