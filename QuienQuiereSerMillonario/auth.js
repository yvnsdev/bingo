/* Supabase Auth REST: contraseña solo en la petición; tokens renovables por sesión. */
(() => {
  'use strict';
  function createBingoAuth({ url, key, storage = localStorage, request = fetch, locks = globalThis.navigator?.locks, onInvalid = () => {} }) {
    const base = url.replace(/\/$/, ''), storageKey = `bingo-auth:${base}`;
    let pending = null, generation = 0;
    const session = () => { try { return JSON.parse(storage.getItem(storageKey)); } catch { return null; } };
    const clear = () => { generation++; storage.removeItem(storageKey); onInvalid(); };
    async function call(path, body, jwt, method = 'POST') {
      const headers = { apikey: key, 'Content-Type': 'application/json' };
      if (jwt) headers.Authorization = `Bearer ${jwt}`;
      const response = await request(`${base}/auth/v1/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
      const data = response.status === 204 ? {} : await response.json();
      if (!response.ok) {
        const error = new Error(response.status === 429 ? 'Demasiados intentos. Espera un momento y vuelve a probar.' : 'No se pudo iniciar sesión. Revisa tu correo y contraseña.');
        error.status = response.status; error.code = data.error_code; throw error;
      }
      return data;
    }
    function store(data) {
      if (!data.access_token || !data.refresh_token || !data.user?.id) throw new Error('La respuesta de autenticación no es válida.');
      const value = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at ?? Math.floor(Date.now()/1000) + data.expires_in, user: { id: data.user.id, email: data.user.email } };
      storage.setItem(storageKey, JSON.stringify(value)); return value;
    }
    async function signIn(email, password) {
      const version = ++generation;
      const data = await call('token?grant_type=password', { email, password });
      if (version !== generation) throw new Error('La sesión cambió. Vuelve a iniciar sesión.');
      return store(data);
    }
    async function accessToken(force = false) {
      const current = session();
      if (!current) return null;
      if (!force && current.expires_at > Date.now()/1000 + 60) return current.access_token;
      if (pending) return pending;
      const version = generation;
      const renew = async () => {
        const latest = session();
        if (!latest || generation !== version) return null;
        if (latest.access_token !== current.access_token && latest.expires_at > Date.now()/1000 + 60) return latest.access_token;
        try {
          const data = await call('token?grant_type=refresh_token', { refresh_token: latest.refresh_token });
          if (generation !== version || session()?.refresh_token !== latest.refresh_token) return null;
          return store(data).access_token;
        } catch (error) {
          if ([400,401,403].includes(error.status) && session()?.refresh_token === latest.refresh_token) clear();
          throw error;
        }
      };
      pending = (locks ? locks.request(storageKey, renew) : renew()).finally(() => { pending = null; });
      return pending;
    }
    async function validate() {
      let jwt = await accessToken();
      if (!jwt) return null;
      try { return await call('user', null, jwt, 'GET'); }
      catch (error) {
        if (![401,403].includes(error.status)) throw error;
        jwt = await accessToken(true);
        if (!jwt) return null;
        try { return await call('user', null, jwt, 'GET'); }
        catch (retryError) { if ([401,403].includes(retryError.status)) clear(); throw retryError; }
      }
    }
    async function signOut() {
      const current = session(); clear();
      if (current) await call('logout?scope=local', null, current.access_token);
    }
    return { storageKey, session, signIn, accessToken, validate, signOut };
  }
  globalThis.createBingoAuth = createBingoAuth;
})();
