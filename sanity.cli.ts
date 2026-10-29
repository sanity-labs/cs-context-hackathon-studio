import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // The address the Studio deploys to: <hostname>.sanity.studio. Setup asks for it.
  studioHost: process.env.SANITY_STUDIO_HOSTNAME,
  // The deployed Studio's id, so a deploy finds it without asking. Setup saves it after the first deploy.
  deployment: {autoUpdates: true, ...(process.env.SANITY_STUDIO_APP_ID ? {appId: process.env.SANITY_STUDIO_APP_ID} : {})},
})
