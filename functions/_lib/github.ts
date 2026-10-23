// The GitHub REST calls the backend makes. Every one carries the contributor's
// own user token from their session, never an app key, so GitHub applies its
// permission checks to them exactly as it would on github.com: the app can only
// write where both it is installed and the contributor has access.

const API = 'https://api.github.com'

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function gh<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'frameworks-contribution-wizard',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json<{ message?: string }>().catch(() => ({ message: undefined }))
    throw new GitHubError(res.status, data.message || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json<T>()
}

/** A GraphQL call. GraphQL reports most failures as a 200 with an `errors`
 *  list, so those become a GitHubError too. */
export async function ghGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await gh<{ data?: T; errors?: { message: string }[] }>(token, '/graphql', {
    method: 'POST',
    body: { query, variables },
  })
  if (res.errors?.length) {
    throw new GitHubError(422, res.errors.map((e) => e.message).join('; '))
  }
  return res.data as T
}

/** `gh`, with a 404 as null instead of an error. */
export async function ghOrNull<T>(token: string, path: string): Promise<T | null> {
  try {
    return await gh<T>(token, path)
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null
    throw e
  }
}

/** A repo path, with each segment escaped but the slashes kept. */
export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

/** A text file at `ref`, or null if it isn't there. */
export async function readFile(
  token: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const file = await ghOrNull<{ type: string; encoding?: string; content?: string }>(
    token,
    `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
  )
  if (!file) return null
  // Over 1 MB the API leaves `content` empty. No docs page comes near that.
  if (file.type !== 'file' || file.encoding !== 'base64' || file.content == null) {
    throw new GitHubError(422, `${path} isn't a file the wizard can read.`)
  }
  return fromBase64(file.content)
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function toBase64(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}
