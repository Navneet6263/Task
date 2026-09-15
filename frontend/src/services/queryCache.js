const entries = new Map();
// Keys include session and organization: cached data never crosses accounts.
export const cachedGet = (api, path, ttl = 60000) => {
  const key = `${localStorage.getItem('company_token') || localStorage.getItem('token')}|${localStorage.getItem('active_org_id')}|${path}`;
  const previous = entries.get(key);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const entry = { expires: Date.now() + ttl };
  entry.promise = api.get(path).catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
  if (entries.size > 100) entries.clear();
  entries.set(key, entry);
  return entry.promise;
};
export const clearQueryCache = () => entries.clear();
