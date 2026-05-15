const tokenKey = 'authToken'

export function getAuthToken(): string | null {
  try {
    const v = localStorage.getItem(tokenKey)
    return v?.trim() ? v : null
  } catch {
    return null
  }
}

export function setAuthToken(token: string) {
  localStorage.setItem(tokenKey, token)
}

export function clearAuthToken() {
  localStorage.removeItem(tokenKey)
}

