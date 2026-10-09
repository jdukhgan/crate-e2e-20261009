export function createApiStore() {
  async function request(path, method = 'GET', input) {
    const response = await fetch(`/api/albums${path}`, {
      method, headers: input === undefined ? {} : { 'Content-Type': 'application/json' },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    if (response.status === 204) return;
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || 'The request failed. Try again.');
      Object.assign(error, { status: response.status, code: data.error?.code, fields: data.error?.fields });
      throw error;
    }
    return data;
  }
  return {
    list: ({ q = '' } = {}) => request(`?${new URLSearchParams({ q })}`),
    create: input => request('', 'POST', input),
    update: (id, patch) => request(`/${encodeURIComponent(id)}`, 'PATCH', patch),
    remove: id => request(`/${encodeURIComponent(id)}`, 'DELETE'),
  };
}
