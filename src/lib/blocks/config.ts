export const blocksConfig = {
  apiUrl: import.meta.env.VITE_BLOCKS_API_URL!,
  appDomain: import.meta.env.VITE_BLOCKS_APP_DOMAIN,
  projectKey: import.meta.env.VITE_BLOCKS_PROJECT_KEY!,
  oidc: {
    clientId: import.meta.env.VITE_BLOCKS_OIDC_CLIENT_ID!,
    url: import.meta.env.VITE_BLOCKS_OIDC_URL!,
    scope: import.meta.env.VITE_BLOCKS_OIDC_SCOPE || "openid profile",
  },
};

export const BLOCKS_API_URL = blocksConfig.apiUrl;
export const BLOCKS_PROJECT_KEY = blocksConfig.projectKey;
