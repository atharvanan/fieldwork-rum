export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Deduplicate concurrent refresh requests to prevent triggering server-side token reuse protection
let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh'];

export async function api(path, { method = 'GET', body } = {}) {
  const run = () =>
    fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await run();
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) res = await run();
    else {
      if (typeof window !== 'undefined') window.location.assign('/login');
      throw new ApiError(401, 'Your session ended. Sign in again.');
    }
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || 'Something went wrong');
  return data;
}
