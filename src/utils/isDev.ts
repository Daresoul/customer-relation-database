/**
 * Dev mode detection utility
 * Returns true when running in development mode (npm run tauri dev)
 */
export const isDev = import.meta.env.DEV;

export default isDev;
