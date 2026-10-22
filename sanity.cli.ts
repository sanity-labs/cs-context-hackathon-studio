import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // The address the Studio deploys to: <hostname>.sanity.studio. Setup asks for it.
  studioHost: process.env.SANITY_STUDIO_HOSTNAME,
  deployment: {autoUpdates: true},
})
