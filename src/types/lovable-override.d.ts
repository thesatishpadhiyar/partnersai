// Override the strict typing for createLovableAuth to allow 0 args
declare module '@lovable.dev/cloud-auth-js' {
  export function createLovableAuth(config?: import('@lovable.dev/cloud-auth-js').LovableAuthConfig): import('@lovable.dev/cloud-auth-js').LovableAuth;
}
